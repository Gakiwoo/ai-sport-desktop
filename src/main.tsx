import React from 'react';
import ReactDOM from 'react-dom/client';
import ErrorReporter from './services/ErrorReporter';
import App from './App';
import './styles/global.css';

// 初始化错误上报器（捕获全局异常和未处理 Promise rejection）
// 放在 main.tsx 而非 App.tsx 模块顶层，避免测试 import App 时触发全局副作用
ErrorReporter.init({ appVersion: '1.0.0' });

// 注册 Service Worker（缓存 MediaPipe 模型文件，实现离线可用 + 秒级二次加载）
// fire-and-forget：不阻塞 App 启动
if ('serviceWorker' in navigator) {
  navigator.serviceWorker
    .register('/sw.js', { scope: '/' })
    .then((reg) => {
      ErrorReporter.captureInfo('Service Worker registered', {
        source: 'main',
        scope: reg.scope,
      });
    })
    .catch((err) => {
      console.warn('[SW] Service Worker 注册失败（非关键，App 仍可正常工作）:', err);
    });
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
