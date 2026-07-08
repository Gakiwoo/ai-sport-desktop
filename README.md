# AI 运动助手 - 桌面版

基于 **Tauri 2 + React 18 + TypeScript** 构建的 AI 运动计数桌面应用。通过摄像头实时捕捉人体骨骼关键点（MediaPipe Pose），结合卡尔曼滤波与状态机算法，自动识别并计数 6 种常见运动。

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | React 18 + TypeScript 5（strict 模式）|
| 构建工具 | Vite 8 |
| 桌面框架 | Tauri 2（Rust 后端）|
| AI 推理 | MediaPipe Pose（WebAssembly）|
| 图表可视化 | Recharts |
| 路由 | React Router v6 (HashRouter) |
| 数据持久化 | Tauri Plugin Store + localStorage 降级（适配器模式）|
| 自动更新 | Tauri Plugin Updater |
| 测试 | Vitest + Testing Library |
| 代码质量 | ESLint 10 + Prettier |

## 支持运动项目

| 项目 | 检测方式 | 核心算法 |
|------|----------|----------|
| 跳绳 | 手腕旋转 + 髋部/脚踝 Y 轴位移 | 4 状态机 + 迟滞阈值 |
| 开合跳 | 手腕/踝关节展幅比率 | 峰值配对 + 多信号融合 |
| 深蹲 | 膝关节角度 + 髋部角度 + 重心 Y | 多信号融合（50%/30%/20%）|
| 立定跳远 | 髋部位移 + 落地检测 | 峰值检测 + 膝盖对齐反馈 |
| 原地纵跳 | 髋部 Y 轴峰值检测 | 峰值检测 + 滞空验证 |
| 仰卧起坐 | 躯干角度变化 + 头部位置 | 6 状态机 + 犯规检测 |

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

# 5. 生产构建
npm run tauri build
# Windows → src-tauri/target/release/bundle/msi/*.msi / *.exe
# macOS   → src-tauri/target/release/bundle/dmg/*.dmg
```

### 生成更新签名密钥

```bash
# 生成密钥对（私钥自动加入 .gitignore）
npm run tauri:signer
# 将生成的公钥内容替换到 src-tauri/tauri.conf.json → plugins.updater.pubkey
```

### 同步盘注意事项

若项目位于百度网盘/OneDrive 等同步盘内，Rust 编译可能因文件锁竞争报 `os error 5`。
已在 `src-tauri/.cargo/config.toml` 中将编译产物目录指向项目外的 `../.cargo-target/`（相对于 `src-tauri/`），跨平台兼容 Windows / macOS。

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
│   └── AnalyticsPage.tsx     #   数据分析（统计卡片 + 图表）
├── components/               # 通用组件
│   ├── CameraView.tsx        #   摄像头与 AI 引擎编排
│   ├── CameraOverlay.tsx     #   摄像头覆盖层（idle/loading/ready/error）
│   ├── SkeletonRenderer.ts   #   骨骼可视化 + HUD 指示器（Canvas）
│   ├── ErrorBoundary.tsx     #   全局错误边界
│   ├── ExerciseIllustration.tsx  # 运动插画（SVG）
│   ├── ThemeToggle.tsx       #   主题切换按钮
│   └── UpdateNotification.tsx    # 自动更新通知
├── hooks/
│   ├── useWorkout.ts         #   训练状态管理（核心 Hook）
│   └── useTheme.ts           #   主题管理（light/dark/system）
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
│   ├── SoundService.ts      #   Web Audio API 音效合成
│   ├── ErrorReporter.ts     #   错误上报（本地日志 + 远程端点）
│   └── UpdaterService.ts    #   自动更新服务
├── types/                    # TypeScript 类型定义
├── constants/                # 运动配置常量（名称/颜色/关键点）
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

| 命令 | 说明 |
|------|------|
| `npm run dev` | Vite 开发服务器 |
| `npm run tauri dev` | Tauri 开发模式（含热重载）|
| `npm run tauri build` | Tauri 生产构建（Windows .msi + macOS .dmg）|
| `npm run tauri:icons` | 从源 PNG 生成全平台图标（含 .icns / .ico）|
| `npm run setup:mediapipe` | 下载 AI 模型到本地 |
| `npm run tauri:signer` | 生成更新签名密钥对 |
| `npm test` | 运行单元测试 |
| `npm run lint` | ESLint 检查 |
| `npm run format` | Prettier 格式化 |
| `npm run check` | lint + format + test 全套检查 |

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
- ✅ 跨平台构建：Windows (.msi/.exe) + macOS (.dmg)
- ✅ **自适应设备性能分级**：实测推理耗时，三档（high/balanced/constrained）自动跳帧
- ✅ **Service Worker 离线缓存**：11.6MB 模型文件 SW 缓存，二次加载秒开
- ✅ **CDN 预连接优化**：dns-prefetch + preconnect 到 4 个 CDN 源
- ✅ **推理超时保护**：pose.send() 500ms 超时（原 2s），实际推理 25-40ms
- ✅ **自建 CDN**：`gakiwoo.com/static/mediapipe/pose/` 提供 24MB 模型文件（含 lite + full）
- ✅ **帧间隔自适应**：ExerciseCounter 基类支持 frameIntervalMs，适配不同帧率设备

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

构建产物位于 `src-tauri/target/release/bundle/dmg/`。

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
