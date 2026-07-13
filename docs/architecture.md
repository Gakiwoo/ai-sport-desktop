# 系统架构文档 — AI 运动助手桌面版

> 版本：1.0.0 | 更新日期：2026-07-13
>
> 当前验证边界：`npm run check`（ESLint + Prettier + 197 Vitest）全绿，前端生产构建、Rust release check 和 0 vulnerability 审计通过；Windows x64 EXE/NSIS 与 macOS arm64 DMG 已由绿色 CI 产出。签名、公证、安装、升级和回滚仍待验收。

## 一、总体架构

```
┌──────────────────────────────────────────────────────────┐
│                    Presentation Layer                     │
│  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │HomePage │  │WorkoutPg │  │HistoryPg │  │TeacherPg│ │
│  │   (/)   │  │(/workout)│  │(/history)│  │(/teacher)│ │
│  └────┬────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘ │
├───────┴────────────┴──────────────┴──────────────┴───────┤
│                     Business Logic                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐   │
│  │useWorkout│  │CameraView│  │  ExerciseCounter     │   │
│  │   Hook   │  │Component │  │  (Abstract Base)     │   │
│  └────┬─────┘  └────┬─────┘  └──────────┬───────────┘   │
│       │              │                    │               │
│  ┌────┴──────┐  ┌────┴──────────┐  ┌─────┴──────────┐  │
│  │ SoundSvc  │  │PoseDetectSvc  │  │ 6x Counters    │  │
│  │ StorageSvc│  │MediaPipeLoader│  │ + PilotService │  │
│  └───────────┘  └───────────────┘  └────────────────┘  │
├─────────────────────────────────────────────────────────┤
│                    Service Layer                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐   │
│  │ Storage  │  │Updater   │  │ ErrorReporter        │   │
│  │ Adapters │  │Service   │  │ (local + remote)     │   │
│  └──────────┘  └──────────┘  └──────────────────────┘   │
├─────────────────────────────────────────────────────────┤
│                  Platform (Tauri 2)                       │
│  ┌─────────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │ tauri-plugin-   │  │ tauri-plugin-│  │3x Commands │ │
│  │ store            │  │ updater       │  │ (Rust)     │ │
│  └─────────────────┘  └──────────────┘  └────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## 二、数据流

### 2.1 训练流程（核心路径）

```
用户点击"开始训练"
  → CameraView.initCameraAndPose()
    ├── navigator.mediaDevices.getUserMedia()  // 摄像头流
    ├── MediaPipeLoader.loadMediaPipePose()     // AI 引擎（本地 → CDN 降级）
    └── Pose.onResults()
         ├── drawSkeleton()                     // 骨骼可视化
         └── onPoseDetectedRef.current(pose)    // 回传姿态数据

useWorkout (接收 Pose)
  → counter.processFrame(pose)                  // 运动算法判断
    ├── KalmanFilter1D.filter(value)            // 信号平滑
    ├── SlidingWindow.push(value)               // 窗口分析
    ├── PeakDetector.check(value)               // 峰值检测
    └── StateMachine.transition(conditions)     // 状态转移
  → 计数变化 → playSound() → setCount()
  → 训练结束 → StorageService.save(session)
```

### 2.2 存储流程

```
StorageService.save(session)
  → adapter.set(key, data)
    ├── TauriStoreAdapter（桌面环境）
    │     → @tauri-apps/plugin-store
    └── LocalStorageAdapter（浏览器降级）
          → window.localStorage

读取时先检查内存缓存（Map），未命中则从适配器读取。
支持 JSON/CSV 导出，最大 500 条记录，超过时自动裁剪最旧记录。
```

### 2.3 校园试点数据流

```text
TeacherPage
  -> PilotService 维护 school/classroom/student/task
  -> 导出 pilot-v1 基础包
  -> Mobile 导入、选择学生与任务、完成训练
  -> Mobile 分享 pilot-v1 成绩包
  -> TeacherPage 文件/文本导入
  -> 按班级/学生/任务/项目筛选
  -> normal/suspicious/reviewed 复核
  -> CSV 或 XLSX 导出
```

`PilotService` 当前使用本地存储适配器，不依赖线上 Pilot API。文件往返代码和服务测试已具备，真实 Android 到 Desktop 的人工验收仍待完成。

## 三、组件树

```
<App>
  <ErrorBoundary>
    <HashRouter>
      <UpdateNotification />       ← 自动更新检查
      <Routes>
        <Route path="/" element={<HomePage />}>
          <ThemeToggle />           ← 主题切换
          <ExerciseIllustration />  ← 运动 SVG 插画
        </Route>
        <Route path="/workout/:type" element={<WorkoutPage />}>
          <CameraView>              ← 摄像头 + AI 引擎
            <CameraOverlay />       ← 覆盖层（状态切换）
            <SkeletonRenderer />    ← 骨骼绘制（Canvas）
          </CameraView>
        </Route>
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/teacher" element={<TeacherPage />} />
      </Routes>
    </HashRouter>
  </ErrorBoundary>
</App>
```

## 四、状态管理

不使用全局状态库（Redux/Zustand），采用以下模式：

| 模式                    | 用途                 | 实现                                                |
| ----------------------- | -------------------- | --------------------------------------------------- |
| **useWorkout Hook**     | 训练会话状态         | isActive, count, mode, targetCount/Duration, timeUp |
| **useRef 模式**         | 闭包陷阱解决         | isActiveRef, stopRef, cameraStateRef 等             |
| **useTheme Hook**       | 主题状态             | light/dark/system，CSS 变量驱动                     |
| **StorageService 单例** | 持久化状态           | 内存缓存 + 适配器                                   |
| **PilotService 单例**   | 校园实体、成绩、复核 | `pilot-v1` + 存储适配器                             |
| **Props 传递**          | 跨组件通信           | CameraView → onPoseDetected → useWorkout            |

## 五、运动算法架构

```
ExerciseCounter (抽象基类)
├── abstract processFrame(pose): CountingResult
├── abstract getFeedback(): FeedbackInfo
├── abstract reset(): void
├── calibrate(pose): void           ← 初始站立校准
├── getKalmanFilter(key): KalmanFilter1D  ← 多关节独立滤波
└── getPeakDetector(key): PeakDetector

具体实现：
├── JumpRopeCounter       ← 4 状态机 + 手腕旋转检测 + 迟滞阈值
├── JumpingJacksCounter   ← 双峰值配对 + 展幅比率
├── SquatsCounter         ← 多信号融合（膝50% + 髋30% + Y20%）
├── SitUpCounter          ← 6 状态机 + 犯规检测
├── StandingLongJumpCounter ← 峰值检测 + 落地反馈
└── VerticalJumpCounter   ← 髋部偏移 + 滞空验证
```

### 信号处理管道

```
MediaPipe Pose (33 keypoints, ~30 FPS)
  → KalmanFilter1D (一维卡尔曼 + 滑动窗口 + 峰值检测)
    ├── filter(value)         ← Q=0.01, R=0.1
    ├── SlidingWindow         ← O(1) push/mean, O(n) median
    │   ├── min(), max()
    │   ├── mean(), median()
    │   └── trend()           ← 线性回归斜率
    └── PeakDetector          ← 局部极值 + 最小间距 + 防抖
  → Counter State Machine     ← 运动逻辑判断
  → CountingResult            ← count, feedback, state
```

## 六、安全模型

### 6.1 内容安全策略（CSP）

```
default-src 'self'
script-src 'self' 'wasm-unsafe-eval' + 4 CDN domains
style-src  'self' 'unsafe-inline'
img-src    'self' data: blob:
media-src  'self' blob: mediastream:
connect-src 'self' + 4 CDNs + github.com
worker-src 'self' blob:
frame-src  'none'
object-src 'none'
base-uri   'self'
```

### 6.2 更新安全

- 更新包通过 GitHub Releases 分发
- 使用 Ed25519 密钥对签名（`tauri:signer` 生成）
- 私钥不入库（`.gitignore` 保护）
- `tauri-plugin-updater` 自动验证签名 + 静默下载

## 七、构建系统

### 7.1 前端构建链

```
tsc --noEmit (类型检查)
  → vite build
    ├── @vitejs/plugin-react (JSX 转换)
    ├── manualChunks:
    │   ├── vendor-react (React/ReactDOM/Router)
    │   └── vendor-recharts (Recharts)
    └── dist/ (约 200KB gzip)
```

### 7.2 Rust 构建链

```
cargo build --release
  ├── 默认 target-dir → src-tauri/target/
  ├── Windows 验证脚本 → 系统临时目录 ai-sport-desktop-cargo-target
  ├── tauri-plugin-store
  ├── tauri-plugin-updater
  └── 3x Tauri Commands
```

## 八、测试策略

| 层级      | 工具                    | 覆盖范围                              |
| --------- | ----------------------- | ------------------------------------- |
| 组件测试  | Testing Library + jsdom | 页面渲染、交互行为、错误状态          |
| Hook 测试 | renderHook              | useWorkout 状态转换逻辑               |
| 服务测试  | Vitest                  | Storage/MediaPipe/Sound/PoseDetection |
| 算法测试  | Vitest                  | 卡尔曼滤波、计数器状态机、峰值检测    |
| 配置测试  | Vitest                  | exerciseConfig 常量正确性             |

2026-07-13 基线：24 个测试文件、197 项测试通过，`npm run check` 的 ESLint、Prettier 和 Vitest 均通过；Windows/macOS CI 也执行 TypeScript、前端构建和原生打包。

## 九、已知限制

1. **MediaPipe WASM 性能**：实际帧率取决于机器、摄像头和模型档位，尚无统一硬件基准报告
2. **多摄像头**：仅支持默认摄像头，不支持热切换
3. **运动类型扩展**：需新增 Counter 子类 + exerciseConfig 注册
4. **离线模型**：需预先运行 `npm run setup:mediapipe` 下载
5. **构建环境**：Windows x64 EXE/NSIS 与 macOS arm64 DMG 已通过本机/CI 构建；Windows debug Cargo target 可能受本机安全策略阻止，应使用临时 release target。正式发布仍需签名、公证、安装、升级和回滚验证
6. **本地试点**：`pilot-v1` 真机跨端往返尚未完成人工验收
7. **云端能力**：Desktop 未接入 Sync/Pilot API，当前以本地文件包为准
