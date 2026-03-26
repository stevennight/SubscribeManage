/**
 * Login page.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../services/api';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await login(username, password);
      localStorage.setItem('token', res.data.access_token);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.detail || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h1><i className="fas fa-layer-group"></i> SubscribeManage</h1>
        <p className="subtitle">订阅管理系统</p>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>用户名</label>
            <input type="text" className="form-control" value={username}
              onChange={(e) => setUsername(e.target.value)} placeholder="请输入用户名" required />
          </div>
          <div className="form-group">
            <label>密码</label>
            <input type="password" className="form-control" value={password}
              onChange={(e) => setPassword(e.target.value)} placeholder="请输入密码" required />
          </div>
          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? <><span className="spinner" style={{width:16,height:16,borderWidth:2,marginRight:8}}></span>登录中...</> : '登录'}
          </button>
        </form>
      </div>
    </div>
  );
}
