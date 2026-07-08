/**
 * MediaPipe Pose 加载优先级
 *   1. 本地 public/mediapipe/pose.js（首次加载无需网络）
 *   2. gakiwoo.com 自建 CDN
 *   3. jsdelivr / unpkg / npmmirror 公共 CDN
 */
const DEFAULT_CDN_URLS = [
  '/mediapipe/pose.js',
  'https://gakiwoo.com/static/mediapipe/pose/pose.js',
  'https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/pose.js',
  'https://unpkg.com/@mediapipe/pose@0.5.1675469404/pose.js',
  'https://registry.npmmirror.com/@mediapipe/pose@0.5.1675469404/pose.js',
];

/**
 * CDN 脚本的 Subresource Integrity (SRI) 哈希值
 *
 * ⚠️ SRI 哈希是 URL 特定的——每个 CDN 提供的文件可能不同（构建时间戳、换行符等）。
 *    当前三个公共 CDN 共用同一哈希值，这在大多数情况下有效（同版本的 MediaPipe
 *    在各 CDN 上内容一致），但如果任一 CDN 返回不同字节流，浏览器将静默拒绝该脚本。
 *
 *    验证方法：
 *    curl -s <URL> | openssl dgst -sha384 -binary | openssl base64 -A
 *    echo "sha384-$(curl -s <URL> | openssl dgst -sha384 -binary | openssl base64 -A)"
 *
 * 更新 MediaPipe 版本时需为每个 CDN 独立计算并更新哈希值。
 */
const DEFAULT_SRI_HASHES: Record<string, string> = {
  'https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/pose.js':
    'sha384-qcJQ+n/ZcF15Xu2EoRupB4Av+GEAGeW0Td1mp2A90u0NdNLzLYQVMUq1Ax1YAHqk',
  'https://unpkg.com/@mediapipe/pose@0.5.1675469404/pose.js':
    'sha384-qcJQ+n/ZcF15Xu2EoRupB4Av+GEAGeW0Td1mp2A90u0NdNLzLYQVMUq1Ax1YAHqk',
  'https://registry.npmmirror.com/@mediapipe/pose@0.5.1675469404/pose.js':
    'sha384-qcJQ+n/ZcF15Xu2EoRupB4Av+GEAGeW0Td1mp2A90u0NdNLzLYQVMUq1Ax1YAHqk',
};

let pendingLoad: Promise<typeof window.Pose> | null = null;

function injectScript(url: string, timeoutMs: number, integrity?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (timeout) clearTimeout(timeout);
      script.onload = null;
      script.onerror = null;
    };

    script.dataset.mediapipePoseLoader = 'true';
    script.src = url;
    script.crossOrigin = 'anonymous';
    // SRI 校验：仅在提供了有效哈希时设置 integrity 属性
    if (integrity && !integrity.includes('PLACEHOLDER')) {
      script.integrity = integrity;
    }
    script.onload = () => {
      cleanup();
      resolve();
    };
    script.onerror = () => {
      cleanup();
      reject(new Error(`MediaPipe Pose CDN load failed: ${url}`));
    };
    timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`MediaPipe Pose CDN load timed out: ${url}`));
    }, timeoutMs);

    document.head.appendChild(script);
  });
}

export async function loadMediaPipePose(
  cdnUrls: string[] = DEFAULT_CDN_URLS,
  timeoutMs = 15_000,
  sriHashes: Record<string, string> = DEFAULT_SRI_HASHES,
): Promise<typeof window.Pose> {
  if (window.Pose) return window.Pose;
  if (pendingLoad) return pendingLoad;

  pendingLoad = (async () => {
    const errors: string[] = [];

    for (const url of cdnUrls) {
      try {
        await injectScript(url, timeoutMs, sriHashes[url]);
        if (window.Pose) return window.Pose;
        errors.push(`Loaded script but window.Pose was missing: ${url}`);
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }

    throw new Error(`MediaPipe Pose 库加载失败: ${errors.join('; ')}`);
  })();

  try {
    return await pendingLoad;
  } finally {
    pendingLoad = null;
  }
}
