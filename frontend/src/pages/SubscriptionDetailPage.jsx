/**
 * Subscription detail page with payment history.
 */
import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  getSubscription, getPaymentHistory, getSettings,
  disableSubscription, enableSubscription, addPaymentRecord,
  updatePaymentRecord, deletePaymentRecord,
} from '../services/api';

const STATUS_MAP = {
  active: { label: '正常', class: 'badge-active' },
  expiring: { label: '即将到期', class: 'badge-expiring' },
  expired: { label: '已到期', class: 'badge-expired' },
  disabled: { label: '已停用', class: 'badge-disabled' },
};

const UNIT_MAP = { day: '天', month: '月', year: '年' };

export default function SubscriptionDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [sub, setSub] = useState(null);
  const [history, setHistory] = useState([]);
  const [unifiedCurrency, setUnifiedCurrency] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  
  const [showRenewModal, setShowRenewModal] = useState(false);
  const [paymentToDelete, setPaymentToDelete] = useState(null);
  const [editPayment, setEditPayment] = useState(null); // {id, cost_original, currency_original}
  const [renewForm, setRenewForm] = useState({
    start_date: '', end_date: '', cycle_amount: 1, cycle_unit: 'month', cost_original: ''
  });

  useEffect(() => { load(); }, [id]);

  const load = async () => {
    setLoading(true);
    try {
      const [subRes, histRes, setRes] = await Promise.all([
        getSubscription(id), getPaymentHistory(id), getSettings()
      ]);
      setSub(subRes.data);
      setHistory(histRes.data);
      setUnifiedCurrency(setRes.data.unified_currency || '');
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const calculateEndDate = (startDateStr, amount, unit) => {
    if (!startDateStr) return '';
    const d = new Date(startDateStr);
    amount = parseInt(amount) || 1;

    if (unit === 'day') {
      d.setDate(d.getDate() + amount);
    } else if (unit === 'month') {
      const targetDay = d.getDate();
      d.setMonth(d.getMonth() + amount);
      if (d.getDate() !== targetDay) {
        d.setDate(0); // overflow rollback
      }
    } else if (unit === 'year') {
      const targetMonth = d.getMonth();
      d.setFullYear(d.getFullYear() + amount);
      if (d.getMonth() !== targetMonth) {
        d.setDate(0); // leap year overflow rollback
      }
    }
    return d.toISOString().split('T')[0];
  };

  const openRenewModal = () => {
    const defaultStart = sub.end_date || new Date().toISOString().split('T')[0];
    setRenewForm({
      start_date: defaultStart,
      end_date: calculateEndDate(defaultStart, sub.cycle_amount, sub.cycle_unit),
      cycle_amount: sub.cycle_amount,
      cycle_unit: sub.cycle_unit,
      cost_original: sub.cost_original
    });
    setShowRenewModal(true);
  };

  const handleRenewFormChange = (field, value) => {
    setRenewForm(f => {
      const newF = { ...f, [field]: value };
      if (field === 'start_date' || field === 'cycle_amount' || field === 'cycle_unit') {
        newF.end_date = calculateEndDate(newF.start_date, newF.cycle_amount, newF.cycle_unit);
      }
      return newF;
    });
  };

  const submitRenew = async (e) => {
    e.preventDefault();
    setActionLoading('renew');
    try {
      await addPaymentRecord(id, {
        start_date: renewForm.start_date,
        end_date: renewForm.end_date,
        cost_original: parseFloat(renewForm.cost_original)
      });
      setShowRenewModal(false);
      await load();
    } catch (err) { alert(err.response?.data?.detail || '操作失败'); }
    finally { setActionLoading(''); }
  };

  const handleAction = async (action) => {
    setActionLoading(action);
    try {
      if (action === 'disable') await disableSubscription(id);
      else if (action === 'enable') await enableSubscription(id);
      await load();
    } catch (err) { alert(err.response?.data?.detail || '操作失败'); }
    finally { setActionLoading(''); }
  };

  const handleDeletePayment = (paymentId) => {
    setPaymentToDelete(paymentId);
  };

  const executeDeletePayment = async () => {
    if (!paymentToDelete) return;
    setActionLoading('delete_payment');
    try {
      await deletePaymentRecord(id, paymentToDelete);
      setPaymentToDelete(null);
      await load();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.detail || '删除失败');
    } finally {
      setActionLoading('');
    }
  };

  const openEditPayment = (h) => {
    setEditPayment({ id: h.id, cost_original: parseFloat(h.cost_original), currency_original: h.currency_original });
  };

  const submitEditPayment = async (e) => {
    e.preventDefault();
    if (!editPayment) return;
    setActionLoading('edit_payment');
    try {
      await updatePaymentRecord(id, editPayment.id, { cost_original: editPayment.cost_original });
      setEditPayment(null);
      await load();
    } catch (err) {
      alert(err.response?.data?.detail || '修改失败');
    } finally {
      setActionLoading('');
    }
  };

  if (loading) return <div className="loading"><span className="spinner"></span>加载中...</div>;
  if (!sub) return <div className="alert alert-error">订阅不存在</div>;

  const s = STATUS_MAP[sub.status] || {};

  return (
    <div>
      <div className="page-header">
        <h1>
          <span className="sub-logo" style={{ display: 'inline-flex', marginRight: 12, verticalAlign: 'middle' }}>
            {sub.logo_type === 'emoji' && sub.logo_value ? <span style={{ fontSize: '24px', lineHeight: 1 }}>{sub.logo_value}</span> :
             sub.logo_type === 'fontawesome' && sub.logo_value ? <i className={sub.logo_value}></i> :
             (sub.logo_type === 'favicon' || sub.logo_type === 'upload') && sub.logo_value ?
             <img src={sub.logo_value} alt="" /> : <i className="fas fa-cube"></i>}
          </span>
          {sub.name}
          <span className={`badge ${s.class}`} style={{ marginLeft: 12, verticalAlign: 'middle' }}>{s.label}</span>
        </h1>
        <div className="btn-group">
          <button className="btn btn-secondary btn-sm" onClick={() => navigate(-1)}>
            <i className="fas fa-arrow-left"></i> 返回
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/subscriptions/${id}/edit`)}>
            <i className="fas fa-edit"></i> 编辑
          </button>
          {sub.status !== 'disabled' && (
            <>
              <button className="btn btn-success btn-sm" onClick={openRenewModal}
                disabled={actionLoading === 'renew'}>
                <i className="fas fa-plus"></i> {actionLoading === 'renew' ? '提交中...' : '添加付费记录'}
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => handleAction('disable')}
                disabled={actionLoading === 'disable'}>
                <i className="fas fa-ban"></i> 停用
              </button>
            </>
          )}
          {sub.status === 'disabled' && (
            <button className="btn btn-success btn-sm" onClick={() => handleAction('enable')}
              disabled={actionLoading === 'enable'}>
              <i className="fas fa-check"></i> 启用
            </button>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="detail-grid">
          <div className="detail-item">
            <label>分类</label>
            <div className="value">{sub.category_name || '未分类'}</div>
          </div>
          <div className="detail-item">
            <label>订阅周期</label>
            <div className="value">{sub.cycle_amount} {UNIT_MAP[sub.cycle_unit] || sub.cycle_unit}</div>
          </div>
          <div className="detail-item">
            <label>订阅费用</label>
            <div className="value">
              {parseFloat(sub.cost_original).toFixed(2)} {sub.currency_original}
              {sub.cost_unified && sub.currency_original !== unifiedCurrency && (
                ` / ${parseFloat(sub.cost_unified).toFixed(2)} ${unifiedCurrency}`
              )}
            </div>
          </div>
          <div className="detail-item">
            <label>每月费用</label>
            <div className="value" style={{ color: 'var(--accent)', fontWeight: 700 }}>
              {sub.monthly_cost ? `${parseFloat(sub.monthly_cost).toFixed(2)} ${unifiedCurrency}` : '—'}
            </div>
          </div>
          <div className="detail-item">
            <label>汇率</label>
            <div className="value">{sub.exchange_rate || '—'}</div>
          </div>
          <div className="detail-item">
            <label>开始日期</label>
            <div className="value">{sub.start_date || '—'}</div>
          </div>
          <div className="detail-item">
            <label>到期日期</label>
            <div className="value">{sub.end_date || '—'}</div>
          </div>
          <div className="detail-item">
            <label>提前提醒</label>
            <div className="value">{sub.reminder_days} 天</div>
          </div>
          {sub.url && (
            <div className="detail-item">
              <label>网址/联系方式</label>
              <div className="value"><a href={sub.url} target="_blank" rel="noopener">{sub.url}</a></div>
            </div>
          )}
          {sub.payment_method && (
            <div className="detail-item">
              <label>付款方式</label>
              <div className="value">{sub.payment_method}</div>
            </div>
          )}
          {sub.notes && (
            <div className="detail-item" style={{ gridColumn: '1/-1' }}>
              <label>备注</label>
              <div className="value" style={{ whiteSpace: 'pre-wrap' }}>{sub.notes}</div>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 16 }}>💳 付费历史</h2>
        {history.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>暂无记录</p>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>记录日期</th>
                  <th>费用</th>
                  <th>汇率</th>
                  <th>覆盖时段</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {history.map(h => (
                  <tr key={h.id}>
                    <td>{h.renewed_at ? new Date(h.renewed_at.endsWith('Z') ? h.renewed_at : h.renewed_at + 'Z').toLocaleDateString('zh-CN') : '—'}</td>
                    <td>
                      {parseFloat(h.cost_original).toFixed(2)} {h.currency_original}
                      {h.cost_unified != null && h.currency_original !== unifiedCurrency ? (
                        ` / ${parseFloat(h.cost_unified).toFixed(2)} ${unifiedCurrency}`
                      ) : ''}
                    </td>
                    <td>{h.exchange_rate || '—'}</td>
                    <td>{h.start_date ? `${h.start_date} → ${h.end_date}` : h.end_date}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button 
                          type="button"
                          className="btn btn-secondary btn-sm" 
                          style={{ padding: '2px 8px', fontSize: 12, position: 'relative', zIndex: 10 }}
                          onClick={() => openEditPayment(h)}
                        >
                          <i className="fas fa-edit"></i>
                        </button>
                        <button 
                          type="button"
                          className="btn btn-danger btn-sm" 
                          style={{ padding: '2px 8px', fontSize: 12, position: 'relative', zIndex: 10 }}
                          onClick={() => handleDeletePayment(h.id)}
                        >
                          <i className="fas fa-trash"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showRenewModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 450 }}>
            <h3>添加付费记录</h3>
            <form onSubmit={submitRenew}>
              <div className="form-group">
                <label>开始日期</label>
                <input type="date" className="form-control" value={renewForm.start_date}
                  onChange={(e) => handleRenewFormChange('start_date', e.target.value)} required />
                <small className="form-text">默认从上个周期的结束日期开始计算</small>
              </div>
              
              <div className="form-group row">
                <div className="form-group col">
                  <label>续借时长</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input type="number" min="1" className="form-control" style={{ flex: 1 }}
                      value={renewForm.cycle_amount} onChange={(e) => handleRenewFormChange('cycle_amount', e.target.value)} required />
                    <select className="form-control" style={{ flex: 1 }} value={renewForm.cycle_unit}
                      onChange={(e) => handleRenewFormChange('cycle_unit', e.target.value)}>
                      <option value="day">天</option>
                      <option value="month">月</option>
                      <option value="year">年</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="form-group border-top pt-3">
                <label>结束日期</label>
                <input type="date" className="form-control" value={renewForm.end_date}
                  onChange={(e) => handleRenewFormChange('end_date', e.target.value)} required />
                <small className="form-text">可随意修改（以此日期为准）</small>
              </div>

              <div className="form-group">
                <label>本次实际付费金额 ({sub.currency_original})</label>
                <input type="number" step="0.01" className="form-control" value={renewForm.cost_original}
                  onChange={(e) => handleRenewFormChange('cost_original', e.target.value)} required />
              </div>
              
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowRenewModal(false)}>取消</button>
                <button type="submit" className="btn btn-primary" disabled={actionLoading === 'renew'}>
                  {actionLoading === 'renew' ? '提交中...' : '确认提交'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {editPayment && (
        <div className="modal-overlay" onClick={() => setEditPayment(null)}>
          <div className="modal-content" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 16 }}>编辑费用</h3>
            <form onSubmit={submitEditPayment}>
              <div className="form-group">
                <label>实际付费金额 ({editPayment.currency_original})</label>
                <input type="number" step="0.01" className="form-control"
                  value={editPayment.cost_original}
                  onChange={(e) => setEditPayment(p => ({ ...p, cost_original: parseFloat(e.target.value) || 0 }))}
                  required autoFocus />
                <small className="form-text">修改后会按当时汇率自动重算统一币种金额</small>
              </div>
              <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setEditPayment(null)}>取消</button>
                <button type="submit" className="btn btn-primary" disabled={actionLoading === 'edit_payment'}>
                  {actionLoading === 'edit_payment' ? '保存中...' : '确认保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {paymentToDelete && (
        <div className="modal-overlay" onClick={() => setPaymentToDelete(null)}>
          <div className="modal-content" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 16 }}>确认删除</h3>
            <p style={{ marginBottom: 24, color: 'var(--text-secondary)' }}>
              确认要删除这条付费记录吗？<br />
              删除后，系统会自动根据剩余记录重新推算当前订阅的覆盖时段。
            </p>
            <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setPaymentToDelete(null)}>取消</button>
              <button 
                type="button" 
                className="btn btn-danger" 
                onClick={executeDeletePayment} 
                disabled={actionLoading === 'delete_payment'}
              >
                {actionLoading === 'delete_payment' ? '删除中...' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
