import { WorkoutSession, ExerciseType } from '../types';
import { createStorageAdapter, type IStorageAdapter } from './storage';

const STORAGE_KEY = 'ai_sport_workout_history';
const MAX_STORED_WORKOUTS = 500; // 从 200 提升到 500（Tauri Store 无 5MB 限制）

const VALID_EXERCISE_TYPES: ExerciseType[] = [
  'jump_rope',
  'jumping_jacks',
  'squats',
  'standing_long_jump',
  'vertical_jump',
  'sit_ups',
];

/** 简易校验单个 WorkoutSession 结构完整性 */
function isValidSession(item: unknown): item is WorkoutSession {
  if (!item || typeof item !== 'object') return false;
  const s = item as Record<string, unknown>;
  return (
    typeof s.id === 'string' &&
    s.id.length > 0 &&
    typeof s.exerciseType === 'string' &&
    (VALID_EXERCISE_TYPES as string[]).includes(s.exerciseType) &&
    (s.mode === 'count' || s.mode === 'timed') &&
    typeof s.count === 'number' &&
    Number.isFinite(s.count) &&
    s.count >= 0 &&
    typeof s.duration === 'number' &&
    Number.isFinite(s.duration) &&
    s.duration >= 0 &&
    typeof s.timestamp === 'number' &&
    Number.isFinite(s.timestamp) &&
    s.timestamp > 0
  );
}

class StorageService {
  private adapter: IStorageAdapter;
  private cache: WorkoutSession[] | null = null;

  constructor(adapter?: IStorageAdapter) {
    // 支持外部注入 adapter（测试用），否则自动选择
    this.adapter = adapter ?? createStorageAdapter();
  }

  /** 替换适配器（测试或运行时切换时使用） */
  setAdapter(adapter: IStorageAdapter): void {
    this.adapter = adapter;
    this.cache = null;
  }

  /** 清空内存缓存（测试隔离 / 强制刷新时使用） */
  invalidateCache(): void {
    this.cache = null;
  }

  async saveWorkout(session: WorkoutSession): Promise<void> {
    const history = this.cache ?? (await this.getWorkoutHistory());
    history.push(session);
    const trimmed = history.slice(-MAX_STORED_WORKOUTS);
    await this.adapter.set(STORAGE_KEY, JSON.stringify(trimmed));
    this.cache = trimmed;
  }

  async getWorkoutHistory(): Promise<WorkoutSession[]> {
    if (this.cache) return [...this.cache];
    try {
      const data = await this.adapter.get(STORAGE_KEY);
      if (!data) return [];
      const parsed = JSON.parse(data);
      if (!Array.isArray(parsed)) return [];
      // 过滤掉结构不完整的记录，防止数据损坏导致崩溃
      this.cache = parsed.filter(isValidSession) as WorkoutSession[];
      return [...this.cache];
    } catch {
      return [];
    }
  }

  async clearHistory(): Promise<void> {
    await this.adapter.remove(STORAGE_KEY);
    this.cache = null;
  }

  async deleteWorkout(id: string): Promise<void> {
    const history = this.cache ?? (await this.getWorkoutHistory());
    const filtered = history.filter((s) => s.id !== id);
    await this.adapter.set(STORAGE_KEY, JSON.stringify(filtered));
    this.cache = filtered;
  }

  async getAnalytics(): Promise<{
    totalWorkouts: number;
    totalReps: number;
    avgReps: number;
    recentWorkouts: WorkoutSession[];
  }> {
    const history = this.cache ?? (await this.getWorkoutHistory());
    const totalWorkouts = history.length;
    const totalReps = history.reduce((sum, s) => sum + s.count, 0);
    const avgReps = totalWorkouts > 0 ? totalReps / totalWorkouts : 0;

    return {
      totalWorkouts,
      totalReps,
      avgReps,
      recentWorkouts: [...history].reverse(),
    };
  }

  /** 导出训练数据为 JSON 字符串 */
  async exportAsJSON(): Promise<string> {
    const history = await this.getWorkoutHistory();
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        version: '1.0.0',
        totalRecords: history.length,
        workouts: history,
      },
      null,
      2,
    );
  }

  /** 导出训练数据为 CSV 字符串 */
  async exportAsCSV(): Promise<string> {
    const history = await this.getWorkoutHistory();
    const headers = ['id', 'exerciseType', 'mode', 'count', 'duration', 'timestamp', 'date'];
    const rows = history.map((s) =>
      [
        s.id,
        s.exerciseType,
        s.mode,
        s.count,
        s.duration,
        s.timestamp,
        new Date(s.timestamp).toLocaleDateString('zh-CN'),
      ].join(','),
    );
    return [headers.join(','), ...rows].join('\n');
  }

  /** 导入训练数据（从 JSON 字符串） */
  async importFromJSON(jsonString: string): Promise<{ imported: number; skipped: number }> {
    try {
      const data = JSON.parse(jsonString);
      const workouts = Array.isArray(data) ? data : data.workouts;
      if (!Array.isArray(workouts)) throw new Error('Invalid format');

      const existing = await this.getWorkoutHistory();
      const existingIds = new Set(existing.map((s) => s.id));
      let imported = 0;
      let skipped = 0;

      for (const w of workouts) {
        if (existingIds.has(w.id) || !isValidSession(w)) {
          skipped++;
          continue;
        }
        existing.push(w);
        imported++;
      }

      const trimmed = existing.slice(-MAX_STORED_WORKOUTS);
      await this.adapter.set(STORAGE_KEY, JSON.stringify(trimmed));
      this.cache = trimmed;

      return { imported, skipped };
    } catch (err) {
      throw new Error(`导入失败: ${err instanceof Error ? err.message : '数据格式错误'}`, {
        cause: err,
      });
    }
  }

  /** 触发文件下载（浏览器环境） */
  downloadFile(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

export default new StorageService();
// 同时导出类，方便测试时创建独立实例
export { StorageService };
