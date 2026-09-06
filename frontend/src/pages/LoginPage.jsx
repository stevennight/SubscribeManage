/**
 * Login page.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../services/api';
import { Button, Field } from '../components/ui';

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
        <div className="login-brand">
          <i className="fas fa-layer-group" />
          SubscribeManage
        </div>
        <p className="subtitle">订阅管理系统</p>

        {error && <div className="alert alert-error"><i className="fas fa-circle-exclamation" />{error}</div>}

        <form onSubmit={handleSubmit}>
          <Field label="用户名" htmlFor="login-username">
            <input id="login-username" type="text" className="form-control" value={username}
              onChange={(e) => setUsername(e.target.value)} placeholder="请输入用户名" required />
          </Field>
          <Field label="密码" htmlFor="login-password">
            <input id="login-password" type="password" className="form-control" value={password}
              onChange={(e) => setPassword(e.target.value)} placeholder="请输入密码" required />
          </Field>
          <Button type="submit" variant="primary" block loading={loading} style={{ marginTop: 4 }}>
            {loading ? '登录中…' : '登录'}
          </Button>
        </form>
      </div>
    </div>
  );
}
