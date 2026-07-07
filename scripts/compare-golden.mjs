#!/usr/bin/env node
/**
 * 跨端 golden 一致性对比脚本
 *
 * 用法：
 *   node scripts/compare-golden.mjs [desktop-report] [mobile-report]
 *
 * 两端需先各自在 GOLDEN_REPORT=1 下运行 golden 测试，生成 golden-report.json：
 *   Desktop: GOLDEN_REPORT=1 npx vitest run src/services/counters/goldenPoseRegression.test.ts
 *   Mobile : GOLDEN_REPORT=1 npx jest src/__tests__/goldenPoseRegression.test.ts
 *
 * 本脚本逐 fixture 对比两端 count，输出差异表。
 * 注意：两端算法/阈值/坐标尺度目前独立，count 差异属预期，
 * 待 R9（跨端算法阈值统一）收敛后，delta 应趋近 0。
 */
import { readFileSync } from 'fs';
import path from 'path';

const desktopPath =
  process.argv[2] ||
  path.resolve('src/services/counters/golden-report.json');
const mobilePath =
  process.argv[3] ||
  path.resolve('../AI Sport-mobile/src/__tests__/golden-report.json');

function load(p) {
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch (e) {
    console.error(`无法读取报告: ${p}\n  ${e.message}`);
    process.exit(2);
  }
}

const desktop = load(desktopPath);
const mobile = load(mobilePath);

const d = desktop.results || {};
const m = mobile.results || {};
const ids = [...new Set([...Object.keys(d), ...Object.keys(m)])].sort();

let mismatches = 0;
const rows = [];
for (const id of ids) {
  const dc = d[id]?.count ?? '—';
  const mc = m[id]?.count ?? '—';
  const delta =
    typeof dc === 'number' && typeof mc === 'number' ? dc - mc : 'n/a';
  if (delta !== 'n/a' && delta !== 0) mismatches++;
  rows.push({ id, dc, mc, delta });
}

console.log('┌─────────────────────────────┬─────────┬─────────┬────────┐');
console.log('│ fixture id'.padEnd(28) + '│ desktop │ mobile  │ delta  │');
console.log('├─────────────────────────────┼─────────┼─────────┼────────┤');
for (const r of rows) {
  console.log(
    `│ ${r.id.padEnd(28)}│ ${String(r.dc).padEnd(7)}│ ${String(r.mc).padEnd(7)}│ ${String(r.delta).padEnd(6)}│`,
  );
}
console.log('└─────────────────────────────┴─────────┴─────────┴────────┘');
console.log(
  `\nframes: ${ids.length}  platforms: ${desktop.platform || '?'} vs ${mobile.platform || '?'}`,
);
console.log(`count 不一致 fixtures: ${mismatches} / ${ids.length}`);
console.log(
  '说明：两端算法/阈值/坐标尺度目前独立，count 差异属预期，待 R9 统一后收敛。',
);
