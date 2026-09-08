/**
 * System settings — currency, exchange rates, notifications, proxy, categories, account.
 */
import { useState, useEffect } from 'react';
import {
  getSettings, updateSettings, testTelegram, testProxy,
  getExchangeRates, updateExchangeRate, refreshExchangeRates, getExchangeRateHistory,
  getCategories, createCategory, updateCategory, deleteCategory,
  changePassword, changeUsername, getMe,
} from '../services/api';
import { Button, Modal, Field, PageHeader, LoadingBlock, useToast } from '../components/ui';
import { money, shortDate } from '../lib/format';

const CURRENCY_OPTIONS = ['CNY', 'USD', 'EUR', 'GBP', 'JPY', 'HKD', 'TWD', 'KRW', 'SGD', 'AUD', 'CAD', 'CHF', 'RUB', 'THB', 'MYR'];

/** Tiny inline SVG line chart for a rate history series. */
function Sparkline({ points }) {
  if (!points || points.length < 2) {
    return <p className="u-muted" style={{ fontSize: 13 }}>历史数据不足，暂无法绘制走势。</p>;
  }
  const W = 460, H = 120, PAD = 6;
  const vals = points.map((p) => p.rate);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const x = (i) => PAD + (i * (W - 2 * PAD)) / (points.length - 1);
  const y = (v) => H - PAD - ((v - min) / span) * (H - 2 * PAD);
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(p.rate).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block' }}>
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2" />
      <circle cx={x(points.length - 1)} cy={y(points[points.length - 1].rate)} r="3" fill="var(--accent)" />
    </svg>
  );
}

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

  const [refreshing, setRefreshing] = useState(false);
  const [projMode, setProjMode] = useState('rolling_avg');
  const [projWindow, setProjWindow] = useState(90);
  const [projBuffer, setProjBuffer] = useState('0');
  const [projAsof, setProjAsof] = useState(null);
  const [savingProj, setSavingProj] = useState(false);

  const [historyFor, setHistoryFor] = useState(null); // base currency string
  const [historyRows, setHistoryRows] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

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
      setProjMode(s.projection_rate_mode || 'rolling_avg');
      setProjWindow(s.projection_rate_window_days || 90);
      setProjBuffer(String(s.projection_fx_buffer_pct ?? '0'));
      setProjAsof(s.projection_rate_asof || null);
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
  const handleRefreshRates = async () => {
    setRefreshing(true);
    try {
      const res = await refreshExchangeRates();
      toast.success(res.data?.message || '汇率已刷新');
      await load();
    } catch (e) { err(e, '刷新失败'); }
    finally { setRefreshing(false); }
  };
  const handleSaveProjection = async () => {
    setSavingProj(true);
    try {
      await updateSettings({
        projection_rate_mode: projMode,
        projection_rate_window_days: Number(projWindow) || 90,
        projection_fx_buffer_pct: String(projBuffer || '0'),
      });
      toast.success('预估汇率设置已保存，月费用已按新口径重算');
      await load();
    } catch (e) { err(e, '保存失败'); }
    finally { setSavingProj(false); }
  };
  const openHistory = async (base) => {
    setHistoryFor(base);
    setHistoryLoading(true);
    setHistoryRows([]);
    try {
      const res = await getExchangeRateHistory(base, 180, settings.unified_currency);
      setHistoryRows(res.data.map((r) => ({ ...r, rate: parseFloat(r.rate) })));
    } catch (e) { err(e, '加载历史失败'); }
    finally { setHistoryLoading(false); }
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
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <Field label="ExchangeRate-API Key（可选）" className="u-mb0" htmlFor="s-apikey"
            hint="留空则始终使用手动汇率。保存后点「立即刷新」即可拉取，不必等每日定时任务。">
            <input id="s-apikey" type="text" className="form-control" value={apiKey}
              onChange={(e) => setApiKey(e.target.value)} placeholder="留空则使用手动汇率" style={{ minWidth: 280 }} />
          </Field>
          <Button variant="primary" onClick={handleSaveApi}>保存</Button>
          <Button icon="fas fa-rotate" onClick={handleRefreshRates} loading={refreshing}
            disabled={!apiKey}>立即刷新</Button>
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
              <Button size="sm" variant="ghost" icon="fas fa-chart-line"
                onClick={() => openHistory(r.base_currency)}>历史</Button>
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

      {settings?.unified_currency && (
        <div className="card">
          <div className="card-title">
            <i className="fas fa-chart-line" />预估成本汇率
            <span className="u-muted" style={{ fontSize: 13, fontWeight: 400 }}>
              仅影响每月/预估费用，历史付费记录按当时汇率或实付金额计
            </span>
          </div>
          <p className="field-hint" style={{ marginBottom: 12 }}>
            {projAsof
              ? <>当前预估汇率截至 <strong>{shortDate(projAsof)}</strong>。</>
              : '尚未生成预估汇率快照。'}
          </p>
          <div className="form-row">
            <Field label="汇率口径" htmlFor="p-mode"
              hint={projMode === 'rolling_avg'
                ? '取窗口内每日汇率的平均值，随汇率缓慢移动，削峰更稳'
                : '直接用当前即期汇率，最新但波动最大'}>
              <select id="p-mode" className="form-control" value={projMode}
                onChange={(e) => setProjMode(e.target.value)}>
                <option value="rolling_avg">滚动平均</option>
                <option value="spot">即期汇率</option>
              </select>
            </Field>
            <Field label="滚动窗口（天）" htmlFor="p-window" hint="仅滚动平均口径生效，常用 30 / 60 / 90">
              <input id="p-window" type="number" min="1" max="730" className="form-control"
                value={projWindow} disabled={projMode !== 'rolling_avg'}
                onChange={(e) => setProjWindow(e.target.value)} />
            </Field>
            <Field label="保守缓冲（%）" htmlFor="p-buffer"
              hint="预估费用 = 汇率换算 ×(1+缓冲)。想避免低估时设 2~3，默认 0">
              <input id="p-buffer" type="number" min="0" max="100" step="0.5" className="form-control"
                value={projBuffer} onChange={(e) => setProjBuffer(e.target.value)} />
            </Field>
          </div>
          <Button size="sm" variant="primary" onClick={handleSaveProjection} loading={savingProj}>
            保存并重算
          </Button>
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
        open={!!historyFor}
        onClose={() => setHistoryFor(null)}
        title={`汇率历史 · 1 ${historyFor || ''} → ${settings?.unified_currency || ''}`}
        width={520}
      >
        {historyLoading ? (
          <p className="u-muted">加载中…</p>
        ) : historyRows.length === 0 ? (
          <p className="u-muted">近 180 天暂无历史数据。配置 API Key 并「立即刷新」后会开始积累。</p>
        ) : (
          <>
            <Sparkline points={historyRows} />
            {(() => {
              const vals = historyRows.map((r) => r.rate);
              const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
              return (
                <p className="field-hint" style={{ margin: '8px 0 12px' }}>
                  共 {vals.length} 天 · 最低 {money(Math.min(...vals))} · 最高 {money(Math.max(...vals))} · 均值 {money(avg)}
                </p>
              );
            })()}
            <div className="table-wrapper" style={{ maxHeight: 240, overflowY: 'auto' }}>
              <table>
                <thead><tr><th>日期</th><th className="num">汇率</th><th>来源</th></tr></thead>
                <tbody>
                  {[...historyRows].reverse().map((r) => (
                    <tr key={r.rate_date}>
                      <td>{r.rate_date}</td>
                      <td className="num">{parseFloat(r.rate).toFixed(4)}</td>
                      <td>{r.source === 'manual' ? '手动' : 'API'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Modal>

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
