/**
 * MediaPipe Pose 本地缓存脚本
 *
 * 从 CDN 下载 MediaPipe Pose 模型文件到 public/mediapipe/ 目录，
 * 使应用可在无网络环境下首次加载 AI 模型。
 *
 * 用法: node scripts/setup-mediapipe.mjs
 * 在 npm run build 之前运行一次即可（文件会随构建打包进 dist）。
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '..', 'public', 'mediapipe');

// MediaPipe Pose v0.5.1675469404 需要的文件列表
const FILES = [
  'pose.js',
  'pose_solution_packed_assets.data',
  'pose_solution_simd_wasm_bin.wasm',
  'pose_landmark_lite.tflite',
];

// 优先从 jsdelivr CDN 下载（国内用户可改用 npmmirror）
const CDN_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404';

async function downloadFile(filename) {
  const url = `${CDN_BASE}/${filename}`;
  const dest = path.join(publicDir, filename);

  if (existsSync(dest)) {
    console.log(`  [跳过] ${filename} (已存在)`);
    return;
  }

  console.log(`  [下载] ${url}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`下载失败: ${url} (${response.status} ${response.statusText})`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  writeFileSync(dest, buffer);
  console.log(`  [完成] ${filename} (${(buffer.length / 1024).toFixed(1)} KB)`);
}

async function main() {
  console.log('正在设置 MediaPipe Pose 本地模型文件...\n');

  mkdirSync(publicDir, { recursive: true });

  let failed = 0;

  for (const file of FILES) {
    try {
      await downloadFile(file);
    } catch (err) {
      console.error(`  [失败] ${file}: ${err.message}`);
      console.log('\n提示: 如果下载失败，应用运行时会自动从 CDN 加载，不影响正常使用。\n');
      failed++;
    }
  }

  if (failed > 0) {
    console.warn(`\nMediaPipe Pose local cache skipped ${failed} file(s).`);
    console.warn('Runtime CDN fallback remains available; build will continue.\n');
    return;
  }

  console.log('\n✅ MediaPipe Pose 模型文件已缓存到 public/mediapipe/');
  console.log('   应用将通过本地文件加载 AI 模型，首次启动无需网络。\n');
}

main();
