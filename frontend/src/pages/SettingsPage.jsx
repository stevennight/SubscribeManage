/**
 * System settings page: unified currency, exchange rates, Telegram, password change.
 */
import { useState, useEffect } from 'react';
import {
  getSettings, updateSettings, testTelegram,
  getExchangeRates, updateExchangeRate,
  getCategories, createCategory, updateCategory, deleteCategory,
  changePassword, changeUsername, getMe,
} from '../services/api';

const CURRENCY_OPTIONS = ['CNY', 'USD', 'EUR', 'GBP', 'JPY', 'HKD', 'TWD', 'KRW', 'SGD', 'AUD', 'CAD', 'CHF', 'RUB', 'THB', 'MYR'];

export default function SettingsPage() {
  const [settings, setSettings] = useState(null);
  const [rates, setRates] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState({ text: '', type: '' });

  // Form states
  const [unifiedCurrency, setUnifiedCurrency] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [tgToken, setTgToken] = useState('');
  const [tgChatId, setTgChatId] = useState('');
  const [tgEnabled, setTgEnabled] = useState(false);
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [newCatName, setNewCatName] = useState('');
  const [editingCat, setEditingCat] = useState(null); // {id, name}
  const [newRateCurrency, setNewRateCurrency] = useState('USD');
  const [newRateValue, setNewRateValue] = useState('');
  const [newRateManual, setNewRateManual] = useState(true);
  const [currentUsername, setCurrentUsername] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [usernamePwd, setUsernamePwd] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [setRes, rateRes, catRes] = await Promise.all([
        getSettings(), getExchangeRates(), getCategories(),
      ]);
      const s = setRes.data;
      setSettings(s);
      setUnifiedCurrency(s.unified_currency || '');
      setApiKey(s.exchange_rate_api_key || '');
      setTgToken(s.telegram_bot_token || '');
      setTgChatId(s.telegram_chat_id || '');
      setTgEnabled(s.telegram_enabled);
      setRates(rateRes.data);
      setCategories(catRes.data);
      // Load current username
      try {
        const meRes = await getMe();
        setCurrentUsername(meRes.data.username);
      } catch {}
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const flash = (text, type = 'success') => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: '', type: '' }), 3000);
  };

  const handleSaveUnified = async () => {
    try {
      await updateSettings({ unified_currency: unifiedCurrency });
      flash('统一币种已设置并锁定');
      await load();
    } catch (err) { flash(err.response?.data?.detail || '保存失败', 'error'); }
  };

  const handleSaveApi = async () => {
    try {
      await updateSettings({ exchange_rate_api_key: apiKey });
      flash('API Key 已保存');
    } catch (err) { flash('保存失败', 'error'); }
  };

  const handleSaveTelegram = async () => {
    try {
      await updateSettings({
        telegram_bot_token: tgToken,
        telegram_chat_id: tgChatId,
        telegram_enabled: tgEnabled,
      });
      flash('Telegram 配置已保存');
    } catch (err) { flash('保存失败', 'error'); }
  };

  const handleTestTelegram = async () => {
    try {
      await testTelegram();
      flash('测试消息已发送');
    } catch (err) { flash(err.response?.data?.detail || '发送失败', 'error'); }
  };

  const handleChangePassword = async () => {
    try {
      await changePassword(oldPwd, newPwd);
      flash('密码修改成功');
      setOldPwd(''); setNewPwd('');
    } catch (err) { flash(err.response?.data?.detail || '修改失败', 'error'); }
  };

  const handleChangeUsername = async () => {
    if (!newUsername.trim() || !usernamePwd) return;
    try {
      await changeUsername(newUsername.trim(), usernamePwd);
      flash('用户名修改成功，请重新登录');
      setCurrentUsername(newUsername.trim());
      setNewUsername(''); setUsernamePwd('');
    } catch (err) { flash(err.response?.data?.detail || '修改失败', 'error'); }
  };

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    try {
      await createCategory({ name: newCatName.trim() });
      setNewCatName('');
      flash('分类已添加');
      await load();
    } catch (err) { flash(err.response?.data?.detail || '添加失败', 'error'); }
  };

  const handleDeleteCategory = async (id) => {
    if (!confirm('确认删除该分类？')) return;
    try {
      await deleteCategory(id);
      flash('分类已删除');
      await load();
    } catch (err) { flash(err.response?.data?.detail || '删除失败', 'error'); }
  };

  const handleRenameCategory = async (catId) => {
    if (!editingCat || !editingCat.name.trim()) return;
    try {
      await updateCategory(catId, { name: editingCat.name.trim() });
      setEditingCat(null);
      flash('分类已重命名');
      await load();
    } catch (err) { flash(err.response?.data?.detail || '重命名失败', 'error'); }
  };

  const handleAddRate = async () => {
    if (!newRateValue || !settings?.unified_currency) return;
    try {
      await updateExchangeRate({
        base_currency: newRateCurrency,
        target_currency: settings.unified_currency,
        rate: parseFloat(newRateValue),
        is_manual: newRateManual,
      });
      flash('汇率已保存');
      setNewRateValue('');
      await load();
    } catch (err) { flash('保存失败', 'error'); }
  };

  if (loading) return <div className="loading"><span className="spinner"></span>加载中...</div>;

  return (
    <div>
      <div className="page-header"><h1>⚙️ 系统设置</h1></div>

      {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      {/* Unified Currency */}
      <div className="card settings-section">
        <h3>💱 统一币种</h3>
        {settings?.unified_currency_locked ? (
          <div className="alert alert-info">
            统一币种已锁定为 <strong>{settings.unified_currency}</strong>（设置后不可修改）
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label>选择统一币种</label>
              <select className="form-control" value={unifiedCurrency}
                onChange={(e) => setUnifiedCurrency(e.target.value)}>
                <option value="">-- 请选择 --</option>
                {CURRENCY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <button className="btn btn-primary" onClick={handleSaveUnified} disabled={!unifiedCurrency}>
              设置并锁定
            </button>
          </div>
        )}
      </div>

      {/* Exchange Rate API */}
      <div className="card settings-section">
        <h3>🔑 汇率 API</h3>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <div className="form-group" style={{ margin: 0, flex: 1 }}>
            <label>ExchangeRate-API Key（可选）</label>
            <input type="text" className="form-control" value={apiKey}
              onChange={(e) => setApiKey(e.target.value)} placeholder="留空则使用手动汇率" />
          </div>
          <button className="btn btn-primary" onClick={handleSaveApi}>保存</button>
        </div>
      </div>

      {/* Exchange Rates */}
      {settings?.unified_currency && (
      <div className="card settings-section">
        <h3>💹 汇率管理 <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)' }}>（其他币种 → {settings.unified_currency}）</span></h3>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
          勾选「手动」后该币种汇率不会被 API 覆盖。直接修改数值后点击保存即可更新。
        </p>

        {/* Existing rates - inline editable */}
        {rates.filter(r => r.target_currency === settings.unified_currency).map(r => (
          <div key={r.id} className="rate-row" style={{ alignItems: 'center' }}>
            <span className="rate-currencies" style={{ minWidth: 80 }}>1 {r.base_currency} =</span>
            <input type="number" step="0.0001" className="form-control"
              style={{ width: 130, padding: '6px 10px', fontSize: 14, fontWeight: 600 }}
              defaultValue={parseFloat(r.rate).toFixed(4)}
              onBlur={async (e) => {
                const val = parseFloat(e.target.value);
                if (isNaN(val) || val === parseFloat(r.rate)) return;
                try {
                  await updateExchangeRate({
                    base_currency: r.base_currency,
                    target_currency: settings.unified_currency,
                    rate: val,
                    is_manual: r.is_manual,
                  });
                  flash(`${r.base_currency} 汇率已更新`);
                  await load();
                } catch { flash('更新失败', 'error'); }
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
            />
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{settings.unified_currency}</span>
            <label className="checkbox-group" style={{ fontSize: 12, marginLeft: 8 }}>
              <input type="checkbox" defaultChecked={r.is_manual}
                onChange={async (e) => {
                  try {
                    await updateExchangeRate({
                      base_currency: r.base_currency,
                      target_currency: settings.unified_currency,
                      rate: parseFloat(r.rate),
                      is_manual: e.target.checked,
                    });
                    flash(e.target.checked ? `${r.base_currency} 已锁定为手动` : `${r.base_currency} 已切换为 API 自动`);
                    await load();
                  } catch { flash('更新失败', 'error'); }
                }}
              /> 手动
            </label>
          </div>
        ))}

        {/* Add new currency rate */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-color)' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ fontSize: 12 }}>添加币种</label>
            <select className="form-control" style={{ width: 100 }} value={newRateCurrency}
              onChange={(e) => setNewRateCurrency(e.target.value)}>
              {CURRENCY_OPTIONS
                .filter(c => c !== settings.unified_currency)
                .filter(c => !rates.some(r => r.base_currency === c && r.target_currency === settings.unified_currency))
                .map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <span style={{ color: 'var(--text-muted)', paddingBottom: 10 }}>→ {settings.unified_currency}</span>
          <input type="number" step="0.0001" className="form-control" style={{ width: 130 }}
            value={newRateValue} onChange={(e) => setNewRateValue(e.target.value)} placeholder="如 7.2500" />
          <label className="checkbox-group" style={{ paddingBottom: 6, fontSize: 12 }}>
            <input type="checkbox" checked={newRateManual}
              onChange={(e) => setNewRateManual(e.target.checked)} /> 手动
          </label>
          <button className="btn btn-primary btn-sm" onClick={handleAddRate}>添加</button>
        </div>
      </div>
      )}

      {/* Categories */}
      <div className="card settings-section">
        <h3>📂 分类管理</h3>
        {categories.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            {categories.map(c => (
              <div key={c.id} className="rate-row">
                {editingCat && editingCat.id === c.id ? (
                  <>
                    <input type="text" className="form-control" style={{ flex: 1, padding: '4px 8px', fontSize: 14 }}
                      value={editingCat.name}
                      onChange={(e) => setEditingCat(p => ({ ...p, name: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleRenameCategory(c.id); if (e.key === 'Escape') setEditingCat(null); }}
                      autoFocus />
                    <button className="btn btn-primary btn-sm" onClick={() => handleRenameCategory(c.id)}
                      style={{ padding: '4px 8px' }}>
                      <i className="fas fa-check"></i>
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setEditingCat(null)}
                      style={{ padding: '4px 8px' }}>
                      <i className="fas fa-times"></i>
                    </button>
                  </>
                ) : (
                  <>
                    <span style={{ flex: 1, fontWeight: 600 }}>
                      {c.icon && <i className={c.icon} style={{ marginRight: 8 }}></i>}
                      {c.name}
                    </span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{c.subscription_count} 个订阅</span>
                    <button className="btn btn-secondary btn-sm" onClick={() => setEditingCat({ id: c.id, name: c.name })}
                      style={{ padding: '4px 8px' }}>
                      <i className="fas fa-edit"></i>
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDeleteCategory(c.id)}
                      style={{ padding: '4px 8px' }}>
                      <i className="fas fa-trash"></i>
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="text" className="form-control" value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)} placeholder="新分类名称" />
          <button className="btn btn-primary btn-sm" onClick={handleAddCategory}>添加</button>
        </div>
      </div>

      {/* Telegram */}
      <div className="card settings-section">
        <h3>📱 Telegram 通知</h3>
        <div className="form-group">
          <label>Bot Token</label>
          <input type="text" className="form-control" value={tgToken}
            onChange={(e) => setTgToken(e.target.value)} placeholder="从 @BotFather 获取" />
        </div>
        <div className="form-group">
          <label>Chat ID</label>
          <input type="text" className="form-control" value={tgChatId}
            onChange={(e) => setTgChatId(e.target.value)} placeholder="个人/群组 Chat ID" />
        </div>
        <div className="form-group">
          <label className="checkbox-group">
            <input type="checkbox" checked={tgEnabled}
              onChange={(e) => setTgEnabled(e.target.checked)} /> 启用 Telegram 通知
          </label>
        </div>
        <div className="btn-group">
          <button className="btn btn-primary" onClick={handleSaveTelegram}>保存配置</button>
          <button className="btn btn-secondary" onClick={handleTestTelegram}>发送测试消息</button>
        </div>
      </div>

      {/* Password */}
      <div className="card settings-section">
        <h3>🔒 账号安全</h3>
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
            当前用户名：<strong>{currentUsername}</strong>
          </p>
          <div className="form-row">
            <div className="form-group">
              <label>新用户名</label>
              <input type="text" className="form-control" value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)} placeholder="输入新用户名" />
            </div>
            <div className="form-group">
              <label>验证密码</label>
              <input type="password" className="form-control" value={usernamePwd}
                onChange={(e) => setUsernamePwd(e.target.value)} placeholder="输入当前密码确认" />
            </div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={handleChangeUsername}
            disabled={!newUsername.trim() || !usernamePwd}>修改用户名</button>
        </div>
        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 20 }}>
          <div className="form-row">
            <div className="form-group">
              <label>原密码</label>
              <input type="password" className="form-control" value={oldPwd}
                onChange={(e) => setOldPwd(e.target.value)} />
            </div>
            <div className="form-group">
              <label>新密码</label>
              <input type="password" className="form-control" value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)} />
            </div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={handleChangePassword}>修改密码</button>
        </div>
      </div>
    </div>
  );
}
