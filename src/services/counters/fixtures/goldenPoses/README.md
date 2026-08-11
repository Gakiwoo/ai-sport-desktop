# Golden Pose fixtures

> 2026-07-11 复核：fixture 用于确定性回归和跨端逻辑保护，不计入真实视频数据集，也不能替代现场算法验证。

JSON 描述「帧序列 → 期望计数/阶段」，供 `goldenPoseRegression.test.ts` 回归。

## 格式

```json
{
  "id": "squats-one-rep",
  "exerciseType": "squats",
  "frameIntervalMs": 100,
  "steps": [{ "preset": "standing", "frames": 35 }],
  "expect": { "minCount": 1, "maxCount": 2, "finalPhaseOneOf": ["standing"] }
}
```

`preset` 对应 `testHelpers.ts` 中的姿态工厂（`standing`、`squat_bottom`、`lying` 等）。

注意：立定跳远 / 原地纵跳的 `count` 表示 **距离或高度（cm）**，不是次数。

Fixture 的 TypeScript 类型定义见同目录 `types.ts`。

## 当前 fixtures（7 个）

| 文件 | 运动类型 | 用途 |
|------|----------|------|
| `jump-rope-calibrate.json` | 跳绳 | 校准场景 |
| `jumping-jacks-one-rep.json` | 开合跳 | 单次完整动作 |
| `sit-ups-one-rep.json` | 仰卧起坐 | 单次完整动作 |
| `squats-no-count.json` | 深蹲 | 站立不计数验证 |
| `squats-one-rep.json` | 深蹲 | 单次完整动作 |
| `standing-long-jump-one.json` | 立定跳远 | 单次跳跃（距离） |
| `vertical-jump-one.json` | 原地纵跳 | 单次跳跃（高度） |

## 新增样本

1. 在 `testHelpers.ts` 增加或复用 preset
2. 在此目录添加 JSON
3. 在 `goldenPoseRegression.test.ts` 的 `FIXTURES` 数组中注册
