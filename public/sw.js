/**
 * AI Sport Desktop — Service Worker
 *
 * 策略：Stale-While-Revalidate for MediaPipe model files.
 *   - 已缓存的资源：即时返回，后台更新缓存
 *   - 未缓存的资源：fetch → cache → respond
 *   - 非模型资源：passthrough（不缓存）
 *
 * 缓存目标：4 个 MediaPipe 模型文件（~11.6 MB total）
 *   - pose_landmark_lite.tflite（2.7 MB）
 *   - pose_solution_packed_assets.data（2.9 MB）
 *   - pose_solution_simd_wasm_bin.wasm（5.9 MB）
 *   - pose.js（46 KB）
 *
 * 版本：递增此值强制刷新所有缓存
 */
const CACHE_VERSION = 'ai-sport-models-v1';
const MODEL_EXTENSIONS = /\.(wasm|tflite|data|bin)$/i;
const MODEL_PATH_SEGMENTS = ['mediapipe', 'pose'];

self.addEventListener('install', (event: ExtendableEvent) => {
  // 不预缓存（模型文件在首次使用时才下载），直接激活
  (self as unknown as ServiceWorkerGlobalScope).skipWaiting();
});

self.addEventListener('activate', (event: ExtendableEvent) => {
  // 清理旧版本缓存
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)),
      ),
    ),
  );
  (self as unknown as ServiceWorkerGlobalScope).clients.claim();
});

function isModelAsset(url: URL): boolean {
  const path = url.pathname.toLowerCase();
  return (
    MODEL_EXTENSIONS.test(path) ||
    MODEL_PATH_SEGMENTS.some((seg) => path.includes(seg))
  );
}

self.addEventListener('fetch', (event: FetchEvent) => {
  const url = new URL(event.request.url);

  // 仅缓存 GET 请求
  if (event.request.method !== 'GET') return;

  // 仅缓存模型文件
  if (!isModelAsset(url)) return;

  // Stale-While-Revalidate
  event.respondWith(
    caches.open(CACHE_VERSION).then((cache) =>
      cache.match(event.request).then((cached) => {
        const fetchPromise = fetch(event.request)
          .then((response) => {
            if (response.ok) {
              cache.put(event.request, response.clone());
            }
            return response;
          })
          .catch(() => {
            // 网络失败时静默降级（如果已有缓存则返回缓存）
          });

        return cached || fetchPromise;
      }),
    ),
  );
});
