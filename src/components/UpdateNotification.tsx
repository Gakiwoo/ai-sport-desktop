import { useState, useEffect, useCallback } from 'react';
import UpdaterService, { type DownloadProgress, type UpdateInfo } from '../services/UpdaterService';

/**
 * 更新通知组件 — 检查新版本并提示用户更新
 *
 * 显示逻辑：
 * 1. 应用启动时静默检查更新
 * 2. 有新版本时显示更新横幅
 * 3. 用户点击下载，显示进度
 * 4. 下载完成后自动重启安装
 */
export default function UpdateNotification() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 应用启动时检查更新
  useEffect(() => {
    let cancelled = false;

    async function check() {
      const info = await UpdaterService.checkForUpdate();
      if (!cancelled && info?.available) {
        setUpdateInfo(info);
      }
    }

    // 延迟 5 秒检查，避免阻塞启动
    const timer = setTimeout(check, 5000);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  const handleUpdate = useCallback(async () => {
    setDownloading(true);
    setError(null);

    const success = await UpdaterService.downloadAndInstall((p) => {
      setProgress(p);
    });

    if (!success) {
      setError('更新失败，请稍后重试或手动下载');
      setDownloading(false);
    }
    // 成功时应用会自动重启，无需额外处理
  }, []);

  // 无更新或已关闭
  if (!updateInfo?.available || dismissed) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        maxWidth: 360,
        padding: '16px 20px',
        borderRadius: 16,
        background: 'var(--bg-card, #ffffff)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
        border: '1px solid var(--border, #e5e5ea)',
        zIndex: 9999,
        fontFamily: '-apple-system, "PingFang SC", sans-serif',
      }}
    >
      {!downloading ? (
        <>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 8,
            }}
          >
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary, #1c1c1e)' }}>
              🆕 新版本 v{updateInfo.newVersion}
            </span>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              style={{
                background: 'none',
                border: 'none',
                fontSize: 18,
                cursor: 'pointer',
                padding: '0 4px',
                color: 'var(--text-secondary, #8e8e93)',
              }}
            >
              ✕
            </button>
          </div>

          {updateInfo.releaseNotes && (
            <p
              style={{
                fontSize: 13,
                color: 'var(--text-secondary, #8e8e93)',
                margin: '0 0 12px',
                lineHeight: 1.5,
                maxHeight: 80,
                overflow: 'auto',
              }}
            >
              {updateInfo.releaseNotes.slice(0, 200)}
            </p>
          )}

          {error && <p style={{ fontSize: 13, color: '#ff3b30', margin: '0 0 8px' }}>{error}</p>}

          <button
            type="button"
            onClick={handleUpdate}
            style={{
              width: '100%',
              padding: '10px 0',
              borderRadius: 10,
              border: 'none',
              background: 'var(--primary, #007AFF)',
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            立即更新
          </button>
        </>
      ) : (
        <div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              marginBottom: 8,
              color: 'var(--text-primary, #1c1c1e)',
            }}
          >
            正在下载更新...
          </div>
          <div
            style={{
              height: 6,
              borderRadius: 3,
              background: 'rgba(128,128,128,0.15)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                borderRadius: 3,
                background: 'var(--primary, #007AFF)',
                width: `${progress?.percent ?? 0}%`,
                transition: 'width 0.3s ease',
              }}
            />
          </div>
          <div
            style={{
              fontSize: 12,
              color: 'var(--text-secondary, #8e8e93)',
              marginTop: 4,
              textAlign: 'right',
            }}
          >
            {progress?.percent ?? 0}%
          </div>
        </div>
      )}
    </div>
  );
}
