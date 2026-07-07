/**
 * 自动更新服务 — 基于 tauri-plugin-updater
 *
 * 功能：
 * 1. 检查是否有新版本
 * 2. 下载并安装更新
 * 3. 通知用户更新进度
 *
 * 配置：
 * - 更新源使用 GitHub Releases
 * - tauri.conf.json 中配置 endpoints
 * - 需要在 Cargo.toml 中添加 tauri-plugin-updater
 *
 * 使用方式：
 *   import UpdaterService from './services/UpdaterService';
 *   const update = await UpdaterService.checkForUpdate();
 *   if (update) { await UpdaterService.downloadAndInstall(update); }
 */

import ErrorReporter from './ErrorReporter';

export interface UpdateInfo {
  /** 是否有可用更新 */
  available: boolean;
  /** 当前版本 */
  currentVersion: string;
  /** 新版本号 */
  newVersion?: string;
  /** 更新说明 */
  releaseNotes?: string;
  /** 发布日期 */
  date?: string;
}

export interface DownloadProgress {
  /** 已下载字节数 */
  downloaded: number;
  /** 总字节数（可能为 0，未知大小时） */
  total: number;
  /** 下载百分比 0-100 */
  percent: number;
}

type ProgressCallback = (progress: DownloadProgress) => void;

class UpdaterService {
  private isTauri(): boolean {
    return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  }

  /**
   * 检查是否有可用更新
   * 非 Tauri 环境返回 null
   */
  async checkForUpdate(): Promise<UpdateInfo | null> {
    if (!this.isTauri()) return null;

    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();

      if (!update) {
        return { available: false, currentVersion: '1.0.0' };
      }

      return {
        available: true,
        currentVersion: update.currentVersion,
        newVersion: update.version,
        releaseNotes: update.body ?? undefined,
        date: update.date ?? undefined,
      };
    } catch (err) {
      ErrorReporter.captureWarning('检查更新失败', {
        source: 'UpdaterService',
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  /**
   * 下载并安装更新
   * @param onProgress 下载进度回调
   */
  async downloadAndInstall(onProgress?: ProgressCallback): Promise<boolean> {
    if (!this.isTauri()) return false;

    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();

      if (!update) {
        console.warn('[UpdaterService] 没有可用更新');
        return false;
      }

      let downloaded = 0;
      let total = 0;

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            total = event.data.contentLength ?? 0;
            break;
          case 'Progress':
            downloaded += event.data.chunkLength;
            if (onProgress && total > 0) {
              onProgress({
                downloaded,
                total,
                percent: Math.round((downloaded / total) * 100),
              });
            }
            break;
          case 'Finished':
            if (onProgress) {
              onProgress({ downloaded: total, total, percent: 100 });
            }
            break;
        }
      });

      return true;
    } catch (err) {
      ErrorReporter.captureError(err, { source: 'UpdaterService', step: 'downloadAndInstall' });
      return false;
    }
  }
}

export default new UpdaterService();
