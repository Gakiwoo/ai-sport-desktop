import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '../services/ApiClient';
import PilotService from '../services/PilotService';
import type { WorkoutSession, ExerciseSessionRecord, ExerciseType } from '../types';

interface CloudSyncPanelProps {
  connected: boolean;
}

interface SyncResult {
  synced: number;
  conflicts: number;
}

/** 自动同步轮询间隔（毫秒） */
const AUTO_SYNC_INTERVAL_MS = 60_000;

/** 服务端 workout_sessions 行的合法运动类型集合 */
const VALID_EXERCISE_TYPES: ReadonlySet<string> = new Set([
  'jump_rope',
  'jumping_jacks',
  'squats',
  'standing_long_jump',
  'vertical_jump',
  'sit_ups',
]);

function toStr(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function toNum(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function toIso(v: unknown): string {
  const s = toStr(v);
  if (!s) return new Date().toISOString();
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

/**
 * 将服务端 workout_sessions 行（snake_case）映射为本地 ExerciseSessionRecord。
 * 修复 P0-2：不再用 `as Record<string, unknown>`/`as never` 绕过类型系统。
 */
function toExerciseSessionRecord(raw: Record<string, unknown>): ExerciseSessionRecord | null {
  const id = toStr(raw.id);
  if (!id) return null;
  const exerciseTypeRaw = toStr(raw.exercise_type ?? raw.exerciseType);
  if (!VALID_EXERCISE_TYPES.has(exerciseTypeRaw)) return null;
  const exerciseType = exerciseTypeRaw as ExerciseType;

  const base: ExerciseSessionRecord = {
    id,
    exerciseType,
    startedAt: toIso(raw.started_at ?? raw.startedAt),
    endedAt: toIso(raw.updated_at ?? raw.endedAt ?? new Date().toISOString()),
    durationSec: toNum(raw.duration ?? raw.durationSec ?? 0),
    score: toNum(raw.score ?? 0),
    scoreUnit: raw.score_unit === 'cm' || raw.scoreUnit === 'cm' ? 'cm' : 'reps',
    validCount: toNum(raw.valid_count ?? raw.validCount ?? 0),
    invalidCount: toNum(raw.invalid_count ?? raw.invalidCount ?? 0),
    foulCount: toNum(raw.foul_count ?? raw.foulCount ?? 0),
    confidence: toNum(raw.confidence ?? 0),
    algorithmVersion: toStr(raw.algorithm_version ?? raw.algorithmVersion) || 'server',
  };

  const schoolId = toStr(raw.school_id ?? raw.schoolId);
  if (schoolId) base.schoolId = schoolId;
  const classId = toStr(raw.class_id ?? raw.classId);
  if (classId) base.classId = classId;
  const studentId = toStr(raw.student_id ?? raw.studentId);
  if (studentId) base.studentId = studentId;
  const taskId = toStr(raw.task_id ?? raw.taskId);
  if (taskId) base.taskId = taskId;
  const deviceId = toStr(raw.device_id ?? raw.deviceId);
  if (deviceId) base.deviceId = deviceId;
  const deviceInfo = toStr(raw.device_info ?? raw.deviceInfo);
  if (deviceInfo) base.deviceInfo = deviceInfo;
  const performanceTier = toStr(raw.performance_tier ?? raw.performanceTier);
  if (
    performanceTier === 'high' ||
    performanceTier === 'balanced' ||
    performanceTier === 'constrained'
  ) {
    base.performanceTier = performanceTier;
  }
  const algorithmLogSummary = toStr(raw.algorithm_log_summary ?? raw.algorithmLogSummary);
  if (algorithmLogSummary) base.algorithmLogSummary = algorithmLogSummary;

  return base;
}

export default function CloudSyncPanel({ connected }: CloudSyncPanelProps) {
  const [collapsed, setCollapsed] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [pushing, setPushing] = useState(false);
  // 增量拉取游标：服务端记录的最大 updated_at（服务端 SQLite 格式 'YYYY-MM-DD HH:MM:SS'），
  // 修复 M4：此前存本地化显示字符串（'2026/8/1 14:30:00'）作为 since 参数导致增量语义错误。
  // ref 与 state 双持：ref 供 useCallback 轮询读取，state 供 UI 展示。
  const [lastSync, setLastSync] = useState<string | null>(null);
  const lastSyncRef = useRef<string | null>(null);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState('');
  const [autoSync, setAutoSync] = useState(false);

  const pullWorkouts = useCallback(async () => {
    setSyncing(true);
    setError('');
    setResult(null);
    try {
      const response = await apiClient.pullWorkouts(lastSyncRef.current ?? undefined);
      const records = response.records ?? [];
      // Import pulled records into local PilotService state
      if (records.length > 0) {
        const state = PilotService.load();
        let maxServerUpdatedAt: string | null = null;
        for (const record of records) {
          const raw = record as unknown as Record<string, unknown>;
          // 游标取服务端 updated_at 最大值（与 SyncService 的 S-11 修复对齐）
          const ts = toStr(raw.updated_at ?? raw.updatedAt);
          if (ts && (!maxServerUpdatedAt || ts > maxServerUpdatedAt)) {
            maxServerUpdatedAt = ts;
          }
          const session = toExerciseSessionRecord(raw);
          if (session && !state.sessions.some((s) => s.id === session.id)) {
            state.sessions.push(session);
          }
        }
        PilotService.save(state);
        if (maxServerUpdatedAt) {
          setLastSync(maxServerUpdatedAt);
          lastSyncRef.current = maxServerUpdatedAt;
        }
      }
      setResult({ synced: records.length, conflicts: 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : '同步失败');
    } finally {
      setSyncing(false);
    }
  }, []);

  // P1-12：自动同步——开启后每 60s 拉取一次服务端成绩（busy 时跳过）
  useEffect(() => {
    if (!connected || !autoSync) return;
    const timer = setInterval(() => {
      if (!syncing && !pushing) {
        void pullWorkouts();
      }
    }, AUTO_SYNC_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [connected, autoSync, syncing, pushing, pullWorkouts]);

  const pushLocalData = async () => {
    setPushing(true);
    setError('');
    setResult(null);
    try {
      const state = PilotService.load();
      // 修复 P0-2/M4：映射为后端 WorkoutInput 契约（mode/count/duration/timestamp 必填；
      // durationSec→duration，startedAt→timestamp），此前缺失必填字段导致类型错误
      // 且推送字段名与后端不匹配（durationSec/startedAt 后端不识别）。
      const workouts: WorkoutSession[] = state.sessions.map((session) => ({
        id: session.id,
        exerciseType: session.exerciseType,
        mode: 'count',
        count: session.validCount,
        duration: session.durationSec,
        timestamp: Date.parse(session.startedAt) || Date.now(),
        score: session.score,
        scoreUnit: session.scoreUnit,
        validCount: session.validCount,
        invalidCount: session.invalidCount,
        foulCount: session.foulCount,
        confidence: session.confidence,
        schoolId: session.schoolId,
        classId: session.classId,
        studentId: session.studentId,
        taskId: session.taskId,
        deviceId: session.deviceId,
        deviceInfo: session.deviceInfo,
        performanceTier: session.performanceTier,
        algorithmVersion: session.algorithmVersion,
        algorithmLogSummary: session.algorithmLogSummary,
      }));
      const response = await apiClient.syncWorkouts(workouts);
      setResult({
        synced: response.synced?.length ?? 0,
        conflicts: response.conflicts?.length ?? 0,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '推送失败');
    } finally {
      setPushing(false);
    }
  };

  const busy = syncing || pushing;

  return (
    <section className="cloud-sync-panel">
      <button
        type="button"
        className="cloud-sync-toggle"
        onClick={() => setCollapsed((prev) => !prev)}
      >
        <span className="cloud-sync-toggle-icon">{collapsed ? '▶' : '▼'}</span>
        <span>云端同步</span>
        {lastSync && <small className="cloud-sync-time">上次同步: {lastSync}</small>}
      </button>

      {!collapsed && (
        <div className="cloud-sync-body">
          {!connected ? (
            <p className="cloud-sync-hint">请先连接云端服务器以使用同步功能</p>
          ) : (
            <>
              <div className="cloud-sync-actions">
                <button
                  type="button"
                  className="cloud-sync-btn"
                  onClick={pullWorkouts}
                  disabled={busy}
                >
                  {syncing ? '同步中...' : '同步成绩'}
                </button>
                <button
                  type="button"
                  className="cloud-sync-btn cloud-sync-btn--secondary"
                  onClick={pushLocalData}
                  disabled={busy}
                >
                  {pushing ? '推送中...' : '推送本地数据'}
                </button>
                <label className="cloud-sync-auto">
                  <input
                    type="checkbox"
                    checked={autoSync}
                    onChange={(e) => setAutoSync(e.target.checked)}
                  />
                  自动同步
                </label>
              </div>

              {busy && (
                <div className="cloud-sync-progress">
                  <span className="cloud-sync-spinner" />
                  <span>正在处理...</span>
                </div>
              )}

              {result && (
                <p className="cloud-sync-result">
                  已同步 {result.synced} 条记录
                  {result.conflicts > 0 && `，${result.conflicts} 条冲突`}
                </p>
              )}

              {error && <p className="cloud-sync-error">{error}</p>}
            </>
          )}
        </div>
      )}
    </section>
  );
}
