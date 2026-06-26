import React from 'react';
import ReactDOM from 'react-dom/client';
import ErrorReporter from './services/ErrorReporter';
import App from './App';
import './styles/global.css';

// 初始化错误上报器（捕获全局异常和未处理 Promise rejection）
// 放在 main.tsx 而非 App.tsx 模块顶层，避免测试 import App 时触发全局副作用
ErrorReporter.init({ appVersion: '1.0.0' });

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
