/**
 * Subscription detail + payment history.
 */
import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  getSubscription, getPaymentHistory, getSettings,
  disableSubscription, enableSubscription, cancelRenewal, addPaymentRecord,
  updatePaymentRecord, deletePaymentRecord,
} from '../services/api';
import { Button, Modal, Field, LoadingBlock, StatusBadge, useToast } from '../components/ui';
import { money, shortDate } from '../lib/format';

const UNIT_MAP = { day: '天', month: '月', year: '年' };

function calculateEndDate(startDateStr, amount, unit) {
  if (!startDateStr) return '';
  const d = new Date(startDateStr);
  amount = parseInt(amount) || 1;
  if (unit === 'day') {
    d.setDate(d.getDate() + amount);
  } else if (unit === 'month') {
    const day = d.getDate();
    d.setMonth(d.getMonth() + amount);
    if (d.getDate() !== day) d.setDate(0);
  } else if (unit === 'year') {
    const month = d.getMonth();
    d.setFullYear(d.getFullYear() + amount);
    if (d.getMonth() !== month) d.setDate(0);
  }
  return d.toISOString().split('T')[0];
}

function SubLogo({ sub }) {
  if (sub.logo_type === 'emoji' && sub.logo_value) return <span style={{ fontSize: 20, lineHeight: 1 }}>{sub.logo_value}</span>;
  if (sub.logo_type === 'fontawesome' && sub.logo_value) return <i className={sub.logo_value} />;
  if ((sub.logo_type === 'favicon' || sub.logo_type === 'upload') && sub.logo_value) return <img src={sub.logo_value} alt="" />;
  return <i className="fas fa-cube" />;
}

export default function SubscriptionDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [sub, setSub] = useState(null);
  const [history, setHistory] = useState([]);
  const [unifiedCurrency, setUnifiedCurrency] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');

  const [showRenew, setShowRenew] = useState(false);
  const [paymentToDelete, setPaymentToDelete] = useState(null);
  const [editPayment, setEditPayment] = useState(null);
  const [renewForm, setRenewForm] = useState({
    start_date: '', end_date: '', cycle_amount: 1, cycle_unit: 'month', cost_original: '',
  });

  const load = async () => {
    setLoading(true);
    try {
      const [subRes, histRes, setRes] = await Promise.all([
        getSubscription(id), getPaymentHistory(id), getSettings(),
      ]);
      setSub(subRes.data);
      setHistory(histRes.data);
      setUnifiedCurrency(setRes.data.unified_currency || '');
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);  // eslint-disable-line react-hooks/exhaustive-deps

  const openRenew = () => {
    const start = sub.end_date || new Date().toISOString().split('T')[0];
    setRenewForm({
      start_date: start,
      end_date: calculateEndDate(start, sub.cycle_amount, sub.cycle_unit),
      cycle_amount: sub.cycle_amount,
      cycle_unit: sub.cycle_unit,
      cost_original: sub.cost_original,
    });
    setShowRenew(true);
  };

  const handleRenewChange = (field, value) => setRenewForm((f) => {
    const next = { ...f, [field]: value };
    if (['start_date', 'cycle_amount', 'cycle_unit'].includes(field)) {
      next.end_date = calculateEndDate(next.start_date, next.cycle_amount, next.cycle_unit);
    }
    return next;
  });

  const submitRenew = async (e) => {
    e.preventDefault();
    setActionLoading('renew');
    try {
      await addPaymentRecord(id, {
        start_date: renewForm.start_date,
        end_date: renewForm.end_date,
        cost_original: parseFloat(renewForm.cost_original),
      });
      setShowRenew(false);
      toast.success('付费记录已添加');
      await load();
    } catch (err) {
      toast.error(err.response?.data?.detail || '操作失败');
    } finally {
      setActionLoading('');
    }
  };

  const handleAction = async (action) => {
    setActionLoading(action);
    try {
      if (action === 'disable') await disableSubscription(id);
      else if (action === 'enable') await enableSubscription(id);
      else if (action === 'cancel_renewal') await cancelRenewal(id);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.detail || '操作失败');
    } finally {
      setActionLoading('');
    }
  };

  const executeDeletePayment = async () => {
    if (!paymentToDelete) return;
    setActionLoading('delete_payment');
    try {
      await deletePaymentRecord(id, paymentToDelete);
      setPaymentToDelete(null);
      toast.success('记录已删除');
      await load();
    } catch (err) {
      toast.error(err.response?.data?.detail || '删除失败');
    } finally {
      setActionLoading('');
    }
  };

  const submitEditPayment = async (e) => {
    e.preventDefault();
    if (!editPayment) return;
    setActionLoading('edit_payment');
    try {
      await updatePaymentRecord(id, editPayment.id, { cost_original: editPayment.cost_original });
      setEditPayment(null);
      toast.success('费用已更新');
      await load();
    } catch (err) {
      toast.error(err.response?.data?.detail || '修改失败');
    } finally {
      setActionLoading('');
    }
  };

  if (loading) return <LoadingBlock />;
  if (!sub) return <div className="alert alert-error"><i className="fas fa-circle-exclamation" />订阅不存在</div>;

  return (
    <div>
      <div className="page-header">
        <h1>
          <span className="sub-logo" style={{ width: 34, height: 34, fontSize: 16 }}><SubLogo sub={sub} /></span>
          {sub.name}
          <StatusBadge status={sub.status} />
        </h1>
        <div className="btn-group">
          <Button size="sm" icon="fas fa-arrow-left" onClick={() => navigate(-1)}>返回</Button>
          <Button size="sm" icon="fas fa-pen" onClick={() => navigate(`/subscriptions/${id}/edit`)}>编辑</Button>
          {sub.status !== 'disabled' && (
            <>
              <Button size="sm" variant="success" icon="fas fa-plus"
                onClick={openRenew} loading={actionLoading === 'renew'}>添加付费记录</Button>
              {sub.status === 'not_renewing' ? (
                <Button size="sm" variant="success" icon="fas fa-rotate-left"
                  onClick={() => handleAction('enable')} loading={actionLoading === 'enable'}>恢复续订</Button>
              ) : sub.status !== 'expired' ? (
                <Button size="sm" variant="warning" icon="fas fa-calendar-xmark"
                  onClick={() => handleAction('cancel_renewal')} loading={actionLoading === 'cancel_renewal'}>到期不续</Button>
              ) : null}
              <Button size="sm" variant="danger-outline" icon="fas fa-ban"
                onClick={() => handleAction('disable')} loading={actionLoading === 'disable'}>停用</Button>
            </>
          )}
          {sub.status === 'disabled' && (
            <Button size="sm" variant="success" icon="fas fa-check"
              onClick={() => handleAction('enable')} loading={actionLoading === 'enable'}>启用</Button>
          )}
        </div>
      </div>

      <div className="card">
        <div className="detail-grid">
          <div className="detail-item"><label>分类</label><div className="value">{sub.category_name || '未分类'}</div></div>
          <div className="detail-item"><label>订阅周期</label><div className="value">{sub.cycle_amount} {UNIT_MAP[sub.cycle_unit] || sub.cycle_unit}</div></div>
          <div className="detail-item">
            <label>订阅费用</label>
            <div className="value">
              {money(sub.cost_original, sub.currency_original)}
              {sub.cost_unified && sub.currency_original !== unifiedCurrency && ` · ${money(sub.cost_unified, unifiedCurrency)}`}
            </div>
          </div>
          <div className="detail-item">
            <label>每月费用</label>
            <div className="value" style={{ color: 'var(--accent)', fontWeight: 700 }}>
              {sub.monthly_cost ? money(sub.monthly_cost, unifiedCurrency) : '—'}
            </div>
          </div>
          <div className="detail-item"><label>汇率</label><div className="value">{sub.exchange_rate || '—'}</div></div>
          <div className="detail-item"><label>开始日期</label><div className="value">{sub.start_date || '—'}</div></div>
          <div className="detail-item"><label>到期日期</label><div className="value">{sub.end_date || '—'}</div></div>
          <div className="detail-item"><label>提前提醒</label><div className="value">{sub.reminder_days} 天</div></div>
          {sub.url && (
            <div className="detail-item">
              <label>网址 / 联系方式</label>
              <div className="value u-truncate"><a href={sub.url} target="_blank" rel="noopener noreferrer">{sub.url}</a></div>
            </div>
          )}
          {sub.payment_method && (
            <div className="detail-item"><label>付款方式</label><div className="value">{sub.payment_method}</div></div>
          )}
          {sub.notes && (
            <div className="detail-item" style={{ gridColumn: '1 / -1' }}>
              <label>备注</label>
              <div className="value" style={{ whiteSpace: 'pre-wrap' }}>{sub.notes}</div>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-title">付费历史</div>
        {history.length === 0 ? (
          <p className="u-muted">暂无记录</p>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>记录日期</th>
                  <th className="num">费用</th>
                  <th className="num">汇率</th>
                  <th>覆盖时段</th>
                  <th style={{ width: 96 }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td>{shortDate(h.renewed_at)}</td>
                    <td className="num">
                      {money(h.cost_original, h.currency_original)}
                      {h.cost_unified != null && h.currency_original !== unifiedCurrency
                        && ` · ${money(h.cost_unified, unifiedCurrency)}`}
                    </td>
                    <td className="num">{h.exchange_rate || '—'}</td>
                    <td>{h.start_date ? `${h.start_date} → ${h.end_date}` : h.end_date}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Button size="sm" variant="ghost" icon="fas fa-pen"
                          onClick={() => setEditPayment({ id: h.id, cost_original: parseFloat(h.cost_original), currency_original: h.currency_original })} />
                        <Button size="sm" variant="ghost" icon="fas fa-trash"
                          onClick={() => setPaymentToDelete(h.id)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={showRenew} onClose={() => setShowRenew(false)} title="添加付费记录" width={440}>
        <form onSubmit={submitRenew}>
          <Field label="开始日期" htmlFor="r-start" hint="默认从上个周期的结束日期开始计算">
            <input id="r-start" type="date" className="form-control" value={renewForm.start_date}
              onChange={(e) => handleRenewChange('start_date', e.target.value)} required />
          </Field>
          <Field label="续借时长">
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="number" min="1" className="form-control" style={{ flex: 1 }}
                value={renewForm.cycle_amount} onChange={(e) => handleRenewChange('cycle_amount', e.target.value)} required />
              <select className="form-control" style={{ flex: 1 }} value={renewForm.cycle_unit}
                onChange={(e) => handleRenewChange('cycle_unit', e.target.value)}>
                <option value="day">天</option>
                <option value="month">月</option>
                <option value="year">年</option>
              </select>
            </div>
          </Field>
          <Field label="结束日期" htmlFor="r-end" hint="可随意修改（以此日期为准）">
            <input id="r-end" type="date" className="form-control" value={renewForm.end_date}
              onChange={(e) => handleRenewChange('end_date', e.target.value)} required />
          </Field>
          <Field label={`本次实际付费金额 (${sub.currency_original})`} htmlFor="r-cost" className="u-mb0">
            <input id="r-cost" type="number" step="0.01" className="form-control" value={renewForm.cost_original}
              onChange={(e) => handleRenewChange('cost_original', e.target.value)} required />
          </Field>
          <div className="modal-actions">
            <Button type="button" onClick={() => setShowRenew(false)}>取消</Button>
            <Button type="submit" variant="primary" loading={actionLoading === 'renew'}>确认提交</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!editPayment} onClose={() => setEditPayment(null)} title="编辑费用" width={400}>
        {editPayment && (
          <form onSubmit={submitEditPayment}>
            <Field label={`实际付费金额 (${editPayment.currency_original})`} htmlFor="e-cost"
              hint="修改后会按当时汇率自动重算统一币种金额" className="u-mb0">
              <input id="e-cost" type="number" step="0.01" className="form-control" autoFocus
                value={editPayment.cost_original}
                onChange={(e) => setEditPayment((p) => ({ ...p, cost_original: parseFloat(e.target.value) || 0 }))}
                required />
            </Field>
            <div className="modal-actions">
              <Button type="button" onClick={() => setEditPayment(null)}>取消</Button>
              <Button type="submit" variant="primary" loading={actionLoading === 'edit_payment'}>确认保存</Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={!!paymentToDelete}
        onClose={() => setPaymentToDelete(null)}
        title="确认删除"
        footer={<>
          <Button onClick={() => setPaymentToDelete(null)}>取消</Button>
          <Button variant="danger" loading={actionLoading === 'delete_payment'} onClick={executeDeletePayment}>确认删除</Button>
        </>}
      >
        <p style={{ color: 'var(--text-secondary)' }}>
          确认要删除这条付费记录吗？删除后系统会根据剩余记录重新推算当前订阅的覆盖时段。
        </p>
      </Modal>
    </div>
  );
}
