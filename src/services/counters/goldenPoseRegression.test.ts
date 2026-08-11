import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'fs';
import path from 'path';

declare const process: {
  env: Record<string, string | undefined>;
  cwd: () => string;
};
import { GoldenPoseFixture } from './fixtures/goldenPoses/types';
import { assertGoldenExpectation, poseFromPreset, runGoldenPoseFixture } from './goldenPoseRunner';

// vitest 原生支持 eager glob 加载 JSON fixture
const fixtures = import.meta.glob('./fixtures/goldenPoses/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, GoldenPoseFixture>;

const FIXTURES = Object.values(fixtures).sort((a, b) => a.id.localeCompare(b.id));

interface GoldenReportEntry {
  count: number;
  phase: string;
  calibrated?: boolean;
}

const results: Record<string, GoldenReportEntry> = {};

describe('golden pose regression (desktop)', () => {
  it('loads at least one fixture per exercise type', () => {
    const types = new Set(FIXTURES.map((f) => f.exerciseType));
    expect(types.size).toBeGreaterThanOrEqual(6);
  });

  it.each(FIXTURES)('$id — $description', (fixture) => {
    const result = runGoldenPoseFixture(fixture);
    results[fixture.id] = {
      count: result.count,
      phase: result.phase,
      calibrated: result.calibrated,
    };
    assertGoldenExpectation(fixture, result);
  });

  it('resolves every preset used in fixtures', () => {
    const presets = new Set(FIXTURES.flatMap((f) => f.steps.map((s) => s.preset)));
    presets.forEach((preset) => {
      expect(poseFromPreset(preset).keypoints.length).toBeGreaterThan(0);
    });
  });

  // 跨端对比报告导出：设置 GOLDEN_REPORT=1 时写出 golden-report.json
  it('exports golden report when GOLDEN_REPORT is set', () => {
    if (!process.env.GOLDEN_REPORT) return;
    const reportPath = path.resolve(process.cwd(), 'src/services/counters/golden-report.json');
    writeFileSync(
      reportPath,
      JSON.stringify(
        {
          platform: 'desktop',
          generatedAt: new Date().toISOString(),
          results,
        },
        null,
        2,
      ),
    );
    expect(true).toBe(true);
  });
});
