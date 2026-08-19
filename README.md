# AI 运动助手 - 桌面版

基于 **Tauri 2 + React 18 + TypeScript** 构建的 AI 运动计数桌面应用。通过摄像头实时捕捉人体骨骼关键点（MediaPipe Pose），结合卡尔曼滤波与状态机算法，自动识别并计数 6 种常见运动。

> 当前状态（2026-08-19 更新）：`npm run check`（ESLint + Prettier + 25 Vitest files / 236 tests）全绿，前端构建、Rust release check 和 0 vulnerability 审计通过。Windows CI 已产出 x64 EXE/NSIS，macOS CI 已产出 arm64 DMG。2026-07-20 已配置真实 Ed25519 updater 签名密钥（非占位符）。摄像头兼容性改造（多设备选择、权限预检、多级降级、分辨率调优、错误分类指引）已落地。产物仍未做 Authenticode/notarization 签名，安装、卸载、升级和回滚待验收。系统级口径见[当前工程基线](../AI-Sport-System-当前工程基线-2026-07-24.md)。

## 技术栈

| 层级       | 技术                                                 |
| ---------- | ---------------------------------------------------- |
| 前端框架   | React 18 + TypeScript 5（strict 模式）               |
| 构建工具   | Vite 8                                               |
| 桌面框架   | Tauri 2（Rust 后端）                                 |
| AI 推理    | MediaPipe Pose（WebAssembly）                        |
| 图表可视化 | Recharts                                             |
| 路由       | React Router v6 (HashRouter)                         |
| 数据持久化 | Tauri Plugin Store + localStorage 降级（适配器模式） |
| 自动更新   | Tauri Plugin Updater                                 |
| 测试       | Vitest + Testing Library                             |
| 代码质量   | ESLint 10 + Prettier                                 |

## 支持运动项目

| 项目     | 检测方式                       | 核心算法                  |
| -------- | ------------------------------ | ------------------------- |
| 跳绳     | 手腕旋转 + 髋部/脚踝 Y 轴位移  | 4 状态机 + 迟滞阈值       |
| 开合跳   | 手腕/踝关节展幅比率            | 峰值配对 + 多信号融合     |
| 深蹲     | 膝关节角度 + 髋部角度 + 重心 Y | 多信号融合（50%/30%/20%） |
| 立定跳远 | 髋部位移 + 落地检测            | 峰值检测 + 膝盖对齐反馈   |
| 原地纵跳 | 髋部 Y 轴峰值检测              | 峰值检测 + 滞空验证       |
| 仰卧起坐 | 躯干角度变化 + 头部位置        | 6 状态机 + 犯规检测       |

## 快速开始

### 前置条件

1. **Node.js** >= 18
2. **Rust** 工具链（Tauri 必须）：

   ```bash
   # Windows（PowerShell）
   winget install Rustlang.Rustup

   # macOS
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

   # 或访问 https://rustup.rs 下载安装
   ```

3. **Tauri 系统依赖**：
   - **Windows**：需要 WebView2（Win10/11 已内置）
   - **macOS**：需要 Xcode Command Line Tools（`xcode-select --install`）

### 安装与运行

```bash
# 1. 安装前端依赖
npm install

# 2. （可选）生成全平台图标（首次或更换图标后执行）
npm run tauri:icons

# 3. （推荐）下载 AI 模型到本地，首次启动无需网络
npm run setup:mediapipe

# 4. 开发模式（热重载）
npm run tauri dev

# 5. Windows 本地验证构建（系统临时 Cargo target）
npm run tauri:build:windows

# 6. 其他平台/正式配置构建
npm run tauri build
```

当前 `tauri.conf.json` 只配置 `nsis` 和 `dmg`，没有 MSI target。Windows x64 与 macOS Apple Silicon 的未签名候选包已由对应平台构建成功；Intel macOS、代码签名、公证、安装和升级仍需单独验收。

### 生成更新签名密钥

```bash
# 生成密钥对（私钥自动加入 .gitignore）
npm run tauri:signer
# 将生成的公钥内容替换到 src-tauri/tauri.conf.json → plugins.updater.pubkey
```

### 同步盘注意事项

若项目位于同步盘内，Rust 编译可能因文件锁竞争或安全策略失败。`npm run tauri:build:windows` 会把 `CARGO_TARGET_DIR` 指向系统临时目录，只生成本机 NSIS 并校验产物。日常 Cargo 命令仍使用默认的 `src-tauri/target/`，两个缓存位置都不会进入版本控制。

如需自定义路径，可删除该配置文件，改用环境变量：

```powershell
# Windows PowerShell
$env:CARGO_TARGET_DIR = "D:\cargo-target\ai-sport-desktop"

# macOS / Linux
export CARGO_TARGET_DIR=$HOME/.cache/ai-sport-desktop-target
```

## 项目结构

```
src/
├── pages/                    # 页面组件
│   ├── HomePage.tsx          #   运动类型选择（卡片网格）
│   ├── WorkoutPage.tsx       #   训练页（左侧控制 + 右侧摄像头）
│   ├── HistoryPage.tsx       #   训练历史（按日期分组 + 类型筛选）
│   ├── AnalyticsPage.tsx     #   数据分析（统计卡片 + 图表）
│   └── TeacherPage.tsx       #   校园试点：实体、成绩、复核和导出
├── components/               # 通用组件
│   ├── CameraView.tsx        #   摄像头与 AI 引擎编排
│   ├── CameraOverlay.tsx     #   摄像头覆盖层（idle/loading/ready/error）
│   ├── SkeletonRenderer.ts   #   骨骼可视化 + HUD 指示器（Canvas）
│   ├── ErrorBoundary.tsx     #   全局错误边界
│   ├── ExerciseIllustration.tsx  # 运动插画（SVG）
│   ├── ThemeToggle.tsx       #   主题切换按钮
│   ├── UpdateNotification.tsx    # 自动更新通知
│   └── workout/              #   训练页子组件
│       ├── NotificationBar.tsx   #   通知栏
│       ├── ResultPanel.tsx       #   结果面板
│       ├── StopConfirmModal.tsx  #   停止确认弹窗
│       └── TargetModal.tsx       #   目标设置弹窗
├── hooks/
│   ├── useWorkout.ts         #   训练状态管理（核心 Hook）
│   ├── useTheme.ts           #   主题管理（light/dark/system）
│   └── useNotification.ts    #   通知管理（训练中消息推送）
├── services/                 # 业务服务层
│   ├── counters/             #   运动计数算法（可插拔扩展）
│   │   ├── JumpRopeCounter.ts    # 跳绳（4 状态机 + 手腕旋转）
│   │   ├── JumpingJacksCounter.ts # 开合跳（峰值配对）
│   │   ├── SquatsCounter.ts      # 深蹲（多信号融合）
│   │   ├── SitUpCounter.ts       # 仰卧起坐（6 状态机 + 犯规检测）
│   │   ├── StandingLongJumpCounter.ts # 立定跳远
│   │   ├── VerticalJumpCounter.ts # 原地纵跳
│   │   └── landingFeedback.ts    # 落地膝盖对齐反馈（共享）
│   ├── filters/              #   信号处理
│   │   └── KalmanFilter1D.ts     # 卡尔曼滤波 + 滑动窗口 + 峰值检测
│   ├── storage/              #   存储适配器模式
│   │   ├── IStorageAdapter.ts    # 接口定义
│   │   ├── LocalStorageAdapter.ts # 浏览器降级方案
│   │   ├── TauriStoreAdapter.ts  # Tauri 生产方案
│   │   └── createStorageAdapter.ts # 自动选择工厂
│   ├── ExerciseCounter.ts    #   计数算法抽象基类
│   ├── PoseDetectionService.ts   # 姿态检测（关键点查找 + 角度计算）
│   ├── MediaPipeLoader.ts   #   MediaPipe CDN/本地加载器（多源容错 + SRI）
│   ├── StorageService.ts    #   持久化服务（CRUD + 导出导入）
│   ├── PilotService.ts      #   pilot-v1、班级/学生/任务、复核、CSV/XLSX
│   ├── SoundService.ts      #   Web Audio API 音效合成
│   ├── ErrorReporter.ts     #   错误上报（本地日志 + 远程端点）
│   ├── UpdaterService.ts    #   自动更新服务
│   ├── PerformanceMonitor.ts #   性能监控（FPS、推理耗时、设备分级）
│   └── scoring.ts            #   评分引擎（同构 scoreSession 纯函数）
├── types/                    # TypeScript 类型定义
├── constants/                # 运动配置常量（名称/颜色/关键点）
├── utils/
│   └── xlsx.ts               #   XLSX/CSV 导出工具
└── styles/                   # 全局 CSS（自定义属性 + 深色模式）

src-tauri/                    # Rust 后端（最小化）
├── src/
│   ├── main.rs               #   入口（Windows 无控制台）
│   └── lib.rs                #   3 个 Tauri 命令 + 插件注册
├── tauri.conf.json           #   Tauri 配置（窗口/安全/更新/打包）
├── .cargo/config.toml        #   Cargo 编译配置（target-dir 外置）
└── capabilities/             #   权限声明
scripts/                      # 辅助脚本
└── setup-mediapipe.mjs       #   MediaPipe 模型本地缓存
```

## NPM 脚本参考

| 命令                          | 说明                                                           |
| ----------------------------- | -------------------------------------------------------------- |
| `npm run dev`                 | Vite 开发服务器                                                |
| `npm run tauri dev`           | Tauri 开发模式（含热重载）                                     |
| `npm run tauri build`         | Tauri 原生生产构建（Windows NSIS / macOS DMG，按平台分别验证） |
| `npm run tauri:build:windows` | Windows 未签名 NSIS 验证构建，使用临时 Cargo target 并校验产物 |
| `npm run tauri:icons`         | 从源 PNG 生成全平台图标（含 .icns / .ico）                     |
| `npm run setup:mediapipe`     | 下载 AI 模型到本地                                             |
| `npm run tauri:signer`        | 生成更新签名密钥对                                             |
| `npm test`                    | 运行单元测试                                                   |
| `npm run lint`                | ESLint 检查                                                    |
| `npm run format`              | Prettier 格式化                                                |
| `npm run check`               | lint + format + test 全套检查                                  |

## 相比移动版的改进

- ✅ MediaPipe 直接运行在浏览器环境，无 WebView 桥接延迟
- ✅ 闭包陷阱修复（useRef 替代闭包中的 state 依赖）
- ✅ 存储适配器模式：Tauri Store（生产）+ localStorage（降级）
- ✅ 卡尔曼滤波 + 滑动窗口 + 峰值检测，消除关键点抖动
- ✅ 自适应校准：各计数器具备初始校准阶段
- ✅ 落地膝盖对齐反馈（立定跳远/原地纵跳共享）
- ✅ 四级 CDN 容错 + 本地缓存，无网络也能首次加载
- ✅ SRI 完整性校验，防止供应链攻击
- ✅ CSP 安全策略：含 frame-src/object-src/base-uri 防御
- ✅ 错误上报服务（本地日志 + 远程端点）
- ✅ TypeScript strict 模式全程开启
- ✅ 完善的单元测试覆盖（核心逻辑 + 算法 + 组件）
- 校园试点教师端：班级/学生/任务 CRUD、`pilot-v1` 文件导入、成绩筛选、异常复核、CSV/XLSX
- ✅ **训练暂停/恢复**：训练页支持中途暂停与继续，计时与检测同步挂起/恢复
- ✅ **Pilot 评分引擎**：同构 `scoreSession()` 纯函数，按「有效结果÷目标」比例评级（优秀/良好/及格/待提升），纳入动作质量系数（有效占比 × 置信度折减 → 标准/一般/需改进）输出综合分；`TeacherPage` 成绩表新增 评级/达标/动作质量/综合分 四列（四色徽标），CSV/XLSX 导出同步携带
- 前端生产资源、Windows x64 EXE/NSIS 与 macOS arm64 DMG 已可重复构建；签名、安装、升级和回滚仍需发布验收
- ✅ **自适应设备性能分级**：根据运行时推理耗时在 high/balanced/constrained 三档间自动调整
- ✅ **Service Worker 离线缓存**：缓存模型资源，减少重复下载；实际加载时间取决于设备与缓存状态
- ✅ **CDN 预连接优化**：dns-prefetch + preconnect 到 4 个 CDN 源
- ✅ **推理超时保护**：`pose.send()` 500ms 超时；实际推理耗时需按目标硬件测量
- ✅ **自建 CDN**：`gakiwoo.com/static/mediapipe/pose/` 提供模型资源；2026-07-11 已确认 lite 模型 HTTP 200
- ✅ **帧间隔自适应**：ExerciseCounter 基类支持 frameIntervalMs，适配不同帧率设备

## 摄像头兼容性

针对不同品牌/驱动的摄像头做了多层兼容与降级，覆盖 Windows WebView2 与 macOS WebKit：

- ✅ **权限声明**：Windows 无需额外声明；macOS 已在 `tauri.conf.json` 配置 `NSCameraUsageDescription`，首次访问弹系统授权
- ✅ **权限预检**：`navigator.permissions.query({ name: 'camera' })` 提前探测，已拒绝时直接给出指引，不触发空转的 getUserMedia
- ✅ **设备枚举 + 热插拔**：监听 `devicechange`，USB 摄像头插拔自动刷新；多摄像头时渲染下拉选择器
- ✅ **多级降级**：指定设备失败 → 自动退回系统默认摄像头 → 最宽松约束（`video: true`）
- ✅ **分辨率调优**：按 `getCapabilities()` 能力范围设置 `ideal` 宽高（640×480 为理想值），老式 320p 与 4K 摄像头均能打开；`applyConstraints` 失败时静默沿用默认分辨率
- ✅ **错误分类指引**：按 `DOMException.name`（NotAllowed/NotFound/NotReadable/Overconstrained/SecurityError/AbortError）分类返回中文指引，并展示检测到的设备数量
- ✅ **一键重试**：错误态提供「重试」按钮，重置初始化状态后重新走完整流程
- ✅ **物理断连检测**：`track ended` 监听，摄像头被拔出或被占用时立即提示
- ✅ **模型复用**：切换摄像头时复用已加载的 MediaPipe 模型与视频流，不重复下载、不重复开流

## macOS 构建注意事项

### 本地构建

在 macOS 上本地构建 `.dmg` 安装包：

```bash
# 安装 Xcode Command Line Tools（如未安装）
xcode-select --install

# 生成图标（如首次构建或更换图标）
npm run tauri:icons

# 构建 .dmg
npm run tauri build
```

使用默认 Cargo 配置时，构建产物位于 `src-tauri/target/release/bundle/dmg/`。若设置了 `CARGO_TARGET_DIR`，以该目录下的 `release/bundle/dmg/` 为准。

### 代码签名（发布到非 App Store）

若需分发到非 App Store 渠道，需要 Apple Developer 证书进行签名：

1. 在 [Apple Developer](https://developer.apple.com) 注册并获取 Developer ID Application 证书
2. 在 GitHub Actions Secrets 中配置：
   - `APPLE_CERTIFICATE` — Base64 编码的 .p12 证书
   - `APPLE_CERTIFICATE_PASSWORD` — 证书密码
   - `APPLE_SIGNING_IDENTITY` — 签名身份名称
   - `APPLE_ID` — Apple ID 邮箱
   - `APPLE_PASSWORD` — App 专用密码
   - `APPLE_TEAM_ID` — Team ID

> **提示**：未签名的 `.dmg` 在 macOS 上首次打开时需要右键 → "打开" 绕过 Gatekeeper。开发测试阶段无需签名。
