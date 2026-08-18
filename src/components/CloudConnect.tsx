import { useState, type FormEvent } from 'react';
import { useApi } from '../hooks/useApi';

interface CloudConnectProps {
  onConnected?: () => void;
}

type ConnectionStatus = 'connected' | 'disconnected' | 'connecting';

export default function CloudConnect({ onConnected }: CloudConnectProps) {
  const { connected, loading, error, user, login, logout, getBaseUrl, setBaseUrl } = useApi();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [serverUrl, setServerUrl] = useState(() => getBaseUrl());
  const [showForm, setShowForm] = useState(false);
  // 本地校验错误（URL 格式/协议），与 useApi 的网络错误分开展示
  const [localError, setLocalError] = useState('');

  const status: ConnectionStatus = loading
    ? 'connecting'
    : connected
      ? 'connected'
      : 'disconnected';

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    if (!username.trim() || !password.trim()) return;

    // P1-5：校验服务器地址——必须是 http/https 且非 http 时仅允许本机回环地址。
    // 生产 Tauri 的 CSP connect-src 仅放行 localhost:3000 与白名单 https 域，
    // 任意 http:// 远端正被 CSP 拦截且会明文传输密码。
    const raw = serverUrl.trim();
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      setLocalError('服务器地址格式无效，需包含协议，如 http://localhost:3000/api');
      return;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      setLocalError('仅支持 http/https 协议的服务器地址');
      return;
    }
    if (url.protocol === 'http:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
      setLocalError('http 仅允许连接本机（localhost/127.0.0.1）；远程服务器必须使用 https');
      return;
    }

    setLocalError('');
    setBaseUrl(raw);
    try {
      await login(username.trim(), password);
      setShowForm(false);
      onConnected?.();
    } catch {
      // error is already set in useApi state
    }
  };

  const handleDisconnect = () => {
    logout();
    setUsername('');
    setPassword('');
  };

  return (
    <div className="cloud-connect">
      <div className="cloud-connect-status">
        <span className={`cloud-connect-dot cloud-connect-dot--${status}`} />
        <span className="cloud-connect-label">
          {status === 'connected' && '已连接'}
          {status === 'connecting' && '连接中...'}
          {status === 'disconnected' && '未连接'}
        </span>
      </div>

      {connected && user ? (
        <div className="cloud-connect-user">
          <span className="cloud-connect-username">{user.username}</span>
          <span className="cloud-connect-role">{user.role}</span>
          <button
            type="button"
            className="cloud-connect-btn cloud-connect-btn--disconnect"
            onClick={handleDisconnect}
          >
            断开
          </button>
        </div>
      ) : showForm ? (
        <form className="cloud-connect-form" onSubmit={handleLogin}>
          <input
            className="cloud-connect-input"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            placeholder="服务器地址"
            type="text"
          />
          <input
            className="cloud-connect-input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="用户名"
            type="text"
          />
          <input
            className="cloud-connect-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="密码"
            type="password"
          />
          <div className="cloud-connect-form-actions">
            <button type="submit" className="cloud-connect-btn" disabled={loading}>
              {loading ? '连接中...' : '连接'}
            </button>
            <button
              type="button"
              className="cloud-connect-btn cloud-connect-btn--cancel"
              onClick={() => setShowForm(false)}
            >
              取消
            </button>
          </div>
          {localError && <p className="cloud-connect-error">{localError}</p>}
          {!localError && error && <p className="cloud-connect-error">{error}</p>}
        </form>
      ) : (
        <button type="button" className="cloud-connect-btn" onClick={() => setShowForm(true)}>
          登录云端
        </button>
      )}
    </div>
  );
}
