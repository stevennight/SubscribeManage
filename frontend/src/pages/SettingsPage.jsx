/**
 * System settings — currency, exchange rates, notifications, proxy, categories, account.
 */
import { useState, useEffect } from 'react';
import {
  getSettings, updateSettings, testTelegram, testProxy,
  getExchangeRates, updateExchangeRate,
  getCategories, createCategory, updateCategory, deleteCategory,
  changePassword, changeUsername, getMe,
} from '../services/api';
import { Button, Modal, Field, PageHeader, LoadingBlock, useToast } from '../components/ui';

const CURRENCY_OPTIONS = ['CNY', 'USD', 'EUR', 'GBP', 'JPY', 'HKD', 'TWD', 'KRW', 'SGD', 'AUD', 'CAD', 'CHF', 'RUB', 'THB', 'MYR'];

export default function SettingsPage() {
  const toast = useToast();
  const [settings, setSettings] = useState(null);
  const [rates, setRates] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  const [unifiedCurrency, setUnifiedCurrency] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [tgToken, setTgToken] = useState('');
  const [tgChatId, setTgChatId] = useState('');
  const [tgEnabled, setTgEnabled] = useState(false);
  const [proxyUrl, setProxyUrl] = useState('');
  const [proxyEnabled, setProxyEnabled] = useState(false);

  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [currentUsername, setCurrentUsername] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [usernamePwd, setUsernamePwd] = useState('');

  const [newCatName, setNewCatName] = useState('');
  const [editingCat, setEditingCat] = useState(null);
  const [catToDelete, setCatToDelete] = useState(null);

  const [newRateCurrency, setNewRateCurrency] = useState('USD');
  const [newRateValue, setNewRateValue] = useState('');
  const [newRateManual, setNewRateManual] = useState(true);

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
      setProxyUrl(s.outbound_proxy_url || '');
      setProxyEnabled(s.outbound_proxy_enabled);
      setRates(rateRes.data);
      setCategories(catRes.data);
      try {
        const meRes = await getMe();
        setCurrentUsername(meRes.data.username);
      } catch (err) { console.error(err); }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const err = (e, fallback) => toast.error(e.response?.data?.detail || fallback);

  const handleSaveUnified = async () => {
    try {
      await updateSettings({ unified_currency: unifiedCurrency });
      toast.success('统一币种已设置并锁定');
      await load();
    } catch (e) { err(e, '保存失败'); }
  };
  const handleSaveApi = async () => {
    try { await updateSettings({ exchange_rate_api_key: apiKey }); toast.success('API Key 已保存'); }
    catch (e) { err(e, '保存失败'); }
  };
  const handleSaveTelegram = async () => {
    try {
      await updateSettings({ telegram_bot_token: tgToken, telegram_chat_id: tgChatId, telegram_enabled: tgEnabled });
      toast.success('Telegram 配置已保存');
    } catch (e) { err(e, '保存失败'); }
  };
  const handleTestTelegram = async () => {
    try { await testTelegram(); toast.success('测试消息已发送'); }
    catch (e) { err(e, '发送失败'); }
  };
  const handleSaveProxy = async () => {
    try {
      await updateSettings({ outbound_proxy_url: proxyUrl.trim(), outbound_proxy_enabled: proxyEnabled });
      toast.success('代理配置已保存');
    } catch (e) { err(e, '保存失败'); }
  };
  const handleTestProxy = async () => {
    try {
      const res = await testProxy();
      toast.success(res.data?.message || '代理连通正常');
    } catch (e) {
      const d = e.response?.data?.detail;
      toast.error(typeof d === 'string' ? d : (d?.message || '代理测试失败'));
    }
  };
  const handleChangePassword = async () => {
    try {
      await changePassword(oldPwd, newPwd);
      toast.success('密码修改成功');
      setOldPwd(''); setNewPwd('');
    } catch (e) { err(e, '修改失败'); }
  };
  const handleChangeUsername = async () => {
    if (!newUsername.trim() || !usernamePwd) return;
    try {
      await changeUsername(newUsername.trim(), usernamePwd);
      toast.success('用户名修改成功，请重新登录');
      setCurrentUsername(newUsername.trim());
      setNewUsername(''); setUsernamePwd('');
    } catch (e) { err(e, '修改失败'); }
  };
  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    try {
      await createCategory({ name: newCatName.trim() });
      setNewCatName('');
      toast.success('分类已添加');
      await load();
    } catch (e) { err(e, '添加失败'); }
  };
  const handleDeleteCategory = async () => {
    if (!catToDelete) return;
    try {
      await deleteCategory(catToDelete.id);
      setCatToDelete(null);
      toast.success('分类已删除');
      await load();
    } catch (e) { err(e, '删除失败'); }
  };
  const handleRenameCategory = async (catId) => {
    if (!editingCat || !editingCat.name.trim()) return;
    try {
      await updateCategory(catId, { name: editingCat.name.trim() });
      setEditingCat(null);
      toast.success('分类已重命名');
      await load();
    } catch (e) { err(e, '重命名失败'); }
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
      toast.success('汇率已保存');
      setNewRateValue('');
      await load();
    } catch (e) { err(e, '保存失败'); }
  };
  const saveRate = async (base, rate, is_manual, okMsg) => {
    try {
      await updateExchangeRate({ base_currency: base, target_currency: settings.unified_currency, rate, is_manual });
      toast.success(okMsg);
      await load();
    } catch (e) { err(e, '更新失败'); }
  };

  if (loading) return <LoadingBlock />;

  const visibleRates = rates.filter((r) => r.target_currency === settings?.unified_currency);

  return (
    <div>
      <PageHeader icon="fas fa-gear" title="系统设置" />

      <div className="card">
        <div className="card-title"><i className="fas fa-coins" />统一币种</div>
        {settings?.unified_currency_locked ? (
          <div className="alert alert-info" style={{ marginBottom: 0 }}>
            <i className="fas fa-lock" />
            统一币种已锁定为 <strong>&nbsp;{settings.unified_currency}</strong>（设置后不可修改）
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
            <Field label="选择统一币种" className="u-mb0" htmlFor="s-unified">
              <select id="s-unified" className="form-control" value={unifiedCurrency}
                onChange={(e) => setUnifiedCurrency(e.target.value)}>
                <option value="">— 请选择 —</option>
                {CURRENCY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Button variant="primary" onClick={handleSaveUnified} disabled={!unifiedCurrency}>设置并锁定</Button>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title"><i className="fas fa-key" />汇率 API</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <Field label="ExchangeRate-API Key（可选）" className="u-mb0" htmlFor="s-apikey"
            hint="留空则始终使用手动汇率">
            <input id="s-apikey" type="text" className="form-control" value={apiKey}
              onChange={(e) => setApiKey(e.target.value)} placeholder="留空则使用手动汇率" style={{ minWidth: 280 }} />
          </Field>
          <Button variant="primary" onClick={handleSaveApi}>保存</Button>
        </div>
      </div>

      {settings?.unified_currency && (
        <div className="card">
          <div className="card-title">
            <i className="fas fa-arrow-right-arrow-left" />汇率管理
            <span className="u-muted" style={{ fontSize: 13, fontWeight: 400 }}>其他币种 → {settings.unified_currency}</span>
          </div>
          <p className="field-hint" style={{ marginBottom: 12 }}>
            勾选「手动」后该币种汇率不会被 API 覆盖。修改数值后失焦即保存。
          </p>
          {visibleRates.map((r) => (
            <div key={r.id} className="rate-row">
              <span className="rate-currencies">1 {r.base_currency} =</span>
              <input type="number" step="0.0001" className="form-control"
                style={{ width: 130, fontWeight: 600 }}
                defaultValue={parseFloat(r.rate).toFixed(4)}
                onBlur={(e) => {
                  const val = parseFloat(e.target.value);
                  if (Number.isNaN(val) || val === parseFloat(r.rate)) return;
                  saveRate(r.base_currency, val, r.is_manual, `${r.base_currency} 汇率已更新`);
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }} />
              <span className="u-muted" style={{ fontSize: 13 }}>{settings.unified_currency}</span>
              <label className="checkbox-group" style={{ fontSize: 12, marginLeft: 4 }}>
                <input type="checkbox" defaultChecked={r.is_manual}
                  onChange={(e) => saveRate(r.base_currency, parseFloat(r.rate), e.target.checked,
                    e.target.checked ? `${r.base_currency} 已锁定为手动` : `${r.base_currency} 已切换为 API 自动`)} />
                手动
              </label>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            <Field label="添加币种" className="u-mb0">
              <select className="form-control" style={{ width: 100 }} value={newRateCurrency}
                onChange={(e) => setNewRateCurrency(e.target.value)}>
                {CURRENCY_OPTIONS
                  .filter((c) => c !== settings.unified_currency)
                  .filter((c) => !visibleRates.some((r) => r.base_currency === c))
                  .map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <span className="u-muted" style={{ paddingBottom: 9 }}>→ {settings.unified_currency}</span>
            <input type="number" step="0.0001" className="form-control" style={{ width: 130 }}
              value={newRateValue} onChange={(e) => setNewRateValue(e.target.value)} placeholder="如 7.2500" />
            <label className="checkbox-group" style={{ paddingBottom: 8, fontSize: 12 }}>
              <input type="checkbox" checked={newRateManual} onChange={(e) => setNewRateManual(e.target.checked)} />
              手动
            </label>
            <Button variant="primary" size="sm" onClick={handleAddRate}>添加</Button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-title"><i className="fas fa-globe" />网络代理</div>
        <p className="field-hint" style={{ marginBottom: 12 }}>
          仅用于对外请求：Telegram 通知、网站图标获取、汇率 API。留空或不启用时行为不变。
          支持 <code>socks5://</code>、<code>socks5h://</code>、<code>http://</code>、<code>https://</code>，可带 <code>user:pass@</code>。
        </p>
        <Field label="代理地址" htmlFor="s-proxy">
          <input id="s-proxy" type="text" className="form-control" value={proxyUrl}
            onChange={(e) => setProxyUrl(e.target.value)} placeholder="socks5://127.0.0.1:1080" />
        </Field>
        <Field>
          <label className="checkbox-group">
            <input type="checkbox" checked={proxyEnabled} onChange={(e) => setProxyEnabled(e.target.checked)} />
            启用代理
          </label>
        </Field>
        <div className="btn-group">
          <Button variant="primary" onClick={handleSaveProxy}>保存配置</Button>
          <Button onClick={handleTestProxy}>测试连通性</Button>
        </div>
      </div>

      <div className="card">
        <div className="card-title"><i className="fas fa-paper-plane" />Telegram 通知</div>
        <Field label="Bot Token" htmlFor="s-tgtoken">
          <input id="s-tgtoken" type="text" className="form-control" value={tgToken}
            onChange={(e) => setTgToken(e.target.value)} placeholder="从 @BotFather 获取" />
        </Field>
        <Field label="Chat ID" htmlFor="s-tgchat">
          <input id="s-tgchat" type="text" className="form-control" value={tgChatId}
            onChange={(e) => setTgChatId(e.target.value)} placeholder="个人 / 群组 Chat ID" />
        </Field>
        <Field>
          <label className="checkbox-group">
            <input type="checkbox" checked={tgEnabled} onChange={(e) => setTgEnabled(e.target.checked)} />
            启用 Telegram 通知
          </label>
        </Field>
        <div className="btn-group">
          <Button variant="primary" onClick={handleSaveTelegram}>保存配置</Button>
          <Button onClick={handleTestTelegram}>发送测试消息</Button>
        </div>
      </div>

      <div className="card">
        <div className="card-title"><i className="fas fa-folder" />分类管理</div>
        {categories.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            {categories.map((c) => (
              <div key={c.id} className="rate-row">
                {editingCat?.id === c.id ? (
                  <>
                    <input type="text" className="form-control" style={{ flex: 1 }}
                      value={editingCat.name}
                      onChange={(e) => setEditingCat((p) => ({ ...p, name: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameCategory(c.id);
                        if (e.key === 'Escape') setEditingCat(null);
                      }}
                      autoFocus />
                    <Button size="sm" variant="primary" icon="fas fa-check" onClick={() => handleRenameCategory(c.id)} />
                    <Button size="sm" icon="fas fa-xmark" onClick={() => setEditingCat(null)} />
                  </>
                ) : (
                  <>
                    <span style={{ flex: 1, fontWeight: 600 }}>
                      {c.icon && <i className={c.icon} style={{ marginRight: 8 }} />}{c.name}
                    </span>
                    <span className="u-muted" style={{ fontSize: 12 }}>{c.subscription_count} 个订阅</span>
                    <Button size="sm" variant="ghost" icon="fas fa-pen" onClick={() => setEditingCat({ id: c.id, name: c.name })} />
                    <Button size="sm" variant="ghost" icon="fas fa-trash" onClick={() => setCatToDelete(c)} />
                  </>
                )}
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="text" className="form-control" value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)} placeholder="新分类名称"
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddCategory(); }} />
          <Button variant="primary" size="sm" onClick={handleAddCategory}>添加</Button>
        </div>
      </div>

      <div className="card">
        <div className="card-title"><i className="fas fa-user-shield" />账号安全</div>
        <p className="field-hint" style={{ marginBottom: 12 }}>当前用户名：<strong>{currentUsername}</strong></p>
        <div className="form-row">
          <Field label="新用户名" htmlFor="s-newuser">
            <input id="s-newuser" type="text" className="form-control" value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)} placeholder="输入新用户名" />
          </Field>
          <Field label="验证密码" htmlFor="s-userpwd">
            <input id="s-userpwd" type="password" className="form-control" value={usernamePwd}
              onChange={(e) => setUsernamePwd(e.target.value)} placeholder="输入当前密码确认" />
          </Field>
        </div>
        <Button size="sm" variant="primary" onClick={handleChangeUsername}
          disabled={!newUsername.trim() || !usernamePwd}>修改用户名</Button>

        <hr />

        <div className="form-row">
          <Field label="原密码" htmlFor="s-oldpwd">
            <input id="s-oldpwd" type="password" className="form-control" value={oldPwd}
              onChange={(e) => setOldPwd(e.target.value)} />
          </Field>
          <Field label="新密码" htmlFor="s-newpwd">
            <input id="s-newpwd" type="password" className="form-control" value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)} />
          </Field>
        </div>
        <Button size="sm" variant="primary" onClick={handleChangePassword}
          disabled={!oldPwd || !newPwd}>修改密码</Button>
      </div>

      <Modal
        open={!!catToDelete}
        onClose={() => setCatToDelete(null)}
        title="删除分类"
        footer={<>
          <Button onClick={() => setCatToDelete(null)}>取消</Button>
          <Button variant="danger" onClick={handleDeleteCategory}>确认删除</Button>
        </>}
      >
        <p style={{ color: 'var(--text-secondary)' }}>
          确认删除分类「{catToDelete?.name}」吗？该分类下的订阅会变为未分类。
        </p>
      </Modal>
    </div>
  );
}
