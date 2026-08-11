import { useState } from 'react';
import { apiClient } from '../services/ApiClient';
import PilotService from '../services/PilotService';

interface CloudSyncPanelProps {
  connected: boolean;
}

interface SyncResult {
  synced: number;
  conflicts: number;
}

export default function CloudSyncPanel({ connected }: CloudSyncPanelProps) {
  const [collapsed, setCollapsed] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState('');
  const [autoSync, setAutoSync] = useState(false);

  const pullWorkouts = async () => {
    setSyncing(true);
    setError('');
    setResult(null);
    try {
      const response = await apiClient.pullWorkouts(lastSync ?? undefined);
      const records = response.records ?? [];
      // Import pulled records into local PilotService state
      if (records.length > 0) {
        const state = PilotService.load();
        for (const record of records) {
          const session = record as Record<string, unknown>;
          if (session.id && !state.sessions.find((s) => s.id === String(session.id))) {
            state.sessions.push(session as never);
          }
        }
        PilotService.save(state);
      }
      setLastSync(new Date().toLocaleString('zh-CN'));
      setResult({ synced: records.length, conflicts: 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : '同步失败');
    } finally {
      setSyncing(false);
    }
  };

  const pushLocalData = async () => {
    setPushing(true);
    setError('');
    setResult(null);
    try {
      const state = PilotService.load();
      const workouts = state.sessions.map((session) => ({
        id: session.id,
        exerciseType: session.exerciseType,
        studentId: session.studentId,
        taskId: session.taskId,
        classId: session.classId,
        score: session.score,
        scoreUnit: session.scoreUnit,
        validCount: session.validCount,
        invalidCount: session.invalidCount,
        foulCount: session.foulCount,
        durationSec: session.durationSec,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        confidence: session.confidence,
        algorithmVersion: session.algorithmVersion,
      }));
      const response = await apiClient.syncWorkouts(workouts);
      setLastSync(new Date().toLocaleString('zh-CN'));
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
