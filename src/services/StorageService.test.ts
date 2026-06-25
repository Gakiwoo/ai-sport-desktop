import { beforeEach, describe, expect, it } from 'vitest';
import { WorkoutSession } from '../types';
import { StorageService } from './StorageService';
import type { IStorageAdapter } from './storage';

const STORAGE_KEY = 'ai_sport_workout_history';

function makeSession(index: number): WorkoutSession {
  return {
    id: `session-${index}`,
    exerciseType: index % 2 === 0 ? 'squats' : 'jump_rope',
    mode: index % 3 === 0 ? 'timed' : 'count',
    count: index,
    duration: 30 + index,
    timestamp: 1_700_000_000_000 + index,
  };
}

/** 测试用内存适配器，避免依赖 localStorage */
class InMemoryAdapter implements IStorageAdapter {
  private store = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async remove(key: string): Promise<void> {
    this.store.delete(key);
  }

  async keys(): Promise<string[]> {
    return [...this.store.keys()];
  }

  async clear(): Promise<void> {
    this.store.clear();
  }
}

describe('StorageService', () => {
  let service: StorageService;
  let adapter: InMemoryAdapter;

  beforeEach(() => {
    adapter = new InMemoryAdapter();
    service = new StorageService(adapter);
  });

  it('ignores corrupt and structurally invalid workout history', async () => {
    await adapter.set(STORAGE_KEY, '{not valid json');
    await expect(service.getWorkoutHistory()).resolves.toEqual([]);

    await adapter.set(
      STORAGE_KEY,
      JSON.stringify([
        makeSession(1),
        { id: '', exerciseType: 'squats', count: 10, duration: 20, timestamp: Date.now() },
        {
          id: 'bad-type',
          exerciseType: 'push_ups',
          count: 10,
          duration: 20,
          timestamp: Date.now(),
        },
      ]),
    );
    service.invalidateCache();
    await expect(service.getWorkoutHistory()).resolves.toEqual([makeSession(1)]);
  });

  it('keeps only the most recent 500 saved workouts', async () => {
    for (let i = 1; i <= 505; i++) {
      await service.saveWorkout(makeSession(i));
    }

    const history = await service.getWorkoutHistory();

    expect(history).toHaveLength(500);
    expect(history[0].id).toBe('session-6');
    expect(history[499].id).toBe('session-505');
  });

  it('deletes workouts and reports analytics from the remaining history', async () => {
    await service.saveWorkout(makeSession(1));
    await service.saveWorkout(makeSession(2));
    await service.saveWorkout(makeSession(3));

    await service.deleteWorkout('session-2');
    const analytics = await service.getAnalytics();

    expect((await service.getWorkoutHistory()).map((s) => s.id)).toEqual([
      'session-1',
      'session-3',
    ]);
    expect(analytics.totalWorkouts).toBe(2);
    expect(analytics.totalReps).toBe(4);
    expect(analytics.avgReps).toBe(2);
    expect(analytics.recentWorkouts.map((s) => s.id)).toEqual(['session-3', 'session-1']);
  });

  it('exports data as JSON with metadata', async () => {
    await service.saveWorkout(makeSession(1));
    await service.saveWorkout(makeSession(2));

    const json = await service.exportAsJSON();
    const parsed = JSON.parse(json);

    expect(parsed.version).toBe('1.0.0');
    expect(parsed.totalRecords).toBe(2);
    expect(parsed.workouts).toHaveLength(2);
    expect(parsed.exportedAt).toBeTruthy();
  });

  it('exports data as CSV with headers', async () => {
    await service.saveWorkout(makeSession(1));

    const csv = await service.exportAsCSV();
    const lines = csv.split('\n');

    expect(lines[0]).toBe('id,exerciseType,mode,count,duration,timestamp,date');
    expect(lines.length).toBe(2); // header + 1 data row
  });

  it('imports data from JSON, skipping duplicates', async () => {
    await service.saveWorkout(makeSession(1));

    const importData = {
      version: '1.0.0',
      workouts: [makeSession(1), makeSession(2), makeSession(3)],
    };

    const result = await service.importFromJSON(JSON.stringify(importData));

    expect(result.imported).toBe(2);
    expect(result.skipped).toBe(1);

    const history = await service.getWorkoutHistory();
    expect(history).toHaveLength(3);
  });

  it('rejects invalid import data', async () => {
    await expect(service.importFromJSON('not json')).rejects.toThrow('导入失败');
    await expect(service.importFromJSON('"just a string"')).rejects.toThrow('导入失败');
  });

  it('can swap adapter at runtime', async () => {
    await service.saveWorkout(makeSession(1));

    const newAdapter = new InMemoryAdapter();
    service.setAdapter(newAdapter);

    // New adapter is empty, no data
    const history = await service.getWorkoutHistory();
    expect(history).toHaveLength(0);
  });
});
