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

  const status: ConnectionStatus = loading
    ? 'connecting'
    : connected
      ? 'connected'
      : 'disconnected';

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    if (!username.trim() || !password.trim()) return;
    setBaseUrl(serverUrl.trim());
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
          {error && <p className="cloud-connect-error">{error}</p>}
        </form>
      ) : (
        <button type="button" className="cloud-connect-btn" onClick={() => setShowForm(true)}>
          登录云端
        </button>
      )}
    </div>
  );
}
