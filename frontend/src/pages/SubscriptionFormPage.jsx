/**
 * Subscription create/edit form page.
 */
import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  getSubscription, createSubscription, updateSubscription,
  getCategories, fetchFavicon, uploadLogo, getSettings, deleteSubscription,
  addPaymentRecord
} from '../services/api';
import IconPicker from '../components/IconPicker';

const CURRENCY_OPTIONS = ['CNY', 'USD', 'EUR', 'GBP', 'JPY', 'HKD', 'TWD', 'KRW', 'SGD', 'AUD', 'CAD', 'CHF', 'RUB', 'THB', 'MYR'];

export default function SubscriptionFormPage() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [unifiedCurrencySet, setUnifiedCurrencySet] = useState(false);
  const [checkingCurrency, setCheckingCurrency] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [form, setForm] = useState({
    name: '', category_id: '', cycle_amount: 1, cycle_unit: 'month',
    cost_original: '', currency_original: 'USD',
    reminder_days: 7, url: '', logo_type: 'default',
    logo_value: '', payment_method: '', notes: '',
  });

  const [addPayment, setAddPayment] = useState(false);
  const [payForm, setPayForm] = useState({
    start_date: new Date().toISOString().split('T')[0],
    end_date: '', cycle_amount: 1, cycle_unit: 'month', cost_original: ''
  });

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

  useEffect(() => {
    // Auto calculate initial end date
    if (!isEdit && !payForm.end_date) {
      setPayForm(f => ({
        ...f,
        end_date: calculateEndDate(f.start_date, f.cycle_amount, f.cycle_unit)
      }));
    }
  }, [isEdit]);

  useEffect(() => {
    // Check unified currency
    getSettings().then(res => {
      const unified = res.data.unified_currency;
      setUnifiedCurrencySet(!!unified);
      if (!isEdit && unified) {
        setForm(f => ({ ...f, currency_original: unified }));
      }
      setCheckingCurrency(false);
    }).catch(() => setCheckingCurrency(false));

    getCategories().then(res => setCategories(res.data)).catch(console.error);
    if (isEdit) {
      getSubscription(id).then(res => {
        const d = res.data;
        setForm({
          name: d.name || '', category_id: d.category_id || '',
          cycle_amount: d.cycle_amount || 1, cycle_unit: d.cycle_unit || 'month',
          cost_original: d.cost_original || '', currency_original: d.currency_original || 'USD',
          reminder_days: d.reminder_days ?? 7,
          url: d.url || '', logo_type: d.logo_type || 'default', logo_value: d.logo_value || '',
          payment_method: d.payment_method || '', notes: d.notes || '',
        });
      }).catch(console.error);
    }
  }, [id]);

  const handleChange = (field, value) => setForm(f => {
    const newF = { ...f, [field]: value };
    // Synchronize payForm costs/cycles with form
    if (!isEdit && ['cost_original', 'cycle_amount', 'cycle_unit'].includes(field)) {
      setPayForm(p => {
        const newP = { ...p, [field]: value };
        if (field === 'cycle_amount' || field === 'cycle_unit') {
          newP.end_date = calculateEndDate(newP.start_date, newP.cycle_amount, newP.cycle_unit);
        }
        return newP;
      });
    }
    return newF;
  });

  const handlePayFormChange = (field, value) => setPayForm(f => {
    const newF = { ...f, [field]: value };
    if (field === 'start_date' || field === 'cycle_amount' || field === 'cycle_unit') {
      newF.end_date = calculateEndDate(newF.start_date, newF.cycle_amount, newF.cycle_unit);
    }
    return newF;
  });

  const handleFetchFavicon = async () => {
    if (!form.url) return;
    try {
      const res = await fetchFavicon(form.url);
      if (res.data.success) {
        setForm(f => ({ ...f, logo_type: 'favicon', logo_value: res.data.favicon_url }));
      }
    } catch (err) { console.error(err); }
  };

  const handleUploadLogo = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const res = await uploadLogo(file);
      setForm(f => ({ ...f, logo_type: 'upload', logo_value: res.data.url }));
    } catch {
      setError('图片上传失败');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = { ...form };
      if (data.category_id === '') data.category_id = null;
      data.cost_original = parseFloat(data.cost_original);
      data.cycle_amount = parseInt(data.cycle_amount);
      data.reminder_days = parseInt(data.reminder_days);

      if (isEdit) {
        await updateSubscription(id, data);
      } else {
        const res = await createSubscription(data);
        if (addPayment) {
          const newSubId = res.data.id;
          await addPaymentRecord(newSubId, {
            start_date: payForm.start_date,
            end_date: payForm.end_date,
            cost_original: parseFloat(payForm.cost_original || data.cost_original)
          });
        }
      }
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.detail || '保存失败');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (e) => {
    if (e) e.preventDefault();
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setLoading(true);
    try {
      await deleteSubscription(id);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.response?.data?.detail || '删除失败');
      setLoading(false);
      setConfirmDelete(false);
    }
  };

  if (checkingCurrency) {
    return <div className="loading"><span className="spinner"></span>加载中...</div>;
  }

  // Block if unified currency not set (only for new subscriptions)
  if (!isEdit && !unifiedCurrencySet) {
    return (
      <div>
        <div className="page-header">
          <h1>➕ 新增订阅</h1>
          <button className="btn btn-secondary" onClick={() => navigate(-1)}>
            <i className="fas fa-arrow-left"></i> 返回
          </button>
        </div>
        <div className="card">
          <div className="alert alert-warning">
            <i className="fas fa-exclamation-triangle" style={{ marginRight: 8 }}></i>
            请先在 <strong>系统设置</strong> 中设置统一币种，再添加订阅记录。
          </div>
          <button className="btn btn-primary" onClick={() => navigate('/settings')}>
            <i className="fas fa-cog"></i> 前往设置
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1>{isEdit ? '✏️ 编辑订阅' : '➕ 新增订阅'}</h1>
        <button className="btn btn-secondary" onClick={() => navigate(-1)}>
          <i className="fas fa-arrow-left"></i> 返回
        </button>
      </div>

      <div className="card">
        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>订阅名称 *</label>
            <input type="text" className="form-control" value={form.name}
              onChange={(e) => handleChange('name', e.target.value)} required />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>订阅分类</label>
              <select className="form-control" value={form.category_id}
                onChange={(e) => handleChange('category_id', e.target.value)}>
                <option value="">-- 选择分类 --</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>付款方式</label>
              <input type="text" className="form-control" value={form.payment_method}
                onChange={(e) => handleChange('payment_method', e.target.value)}
                placeholder="信用卡 / PayPal / 支付宝..." />
            </div>
          </div>

          <div className="form-row-3">
            <div className="form-group">
              <label>订阅费用 *</label>
              <input type="number" step="0.01" min="0" className="form-control" value={form.cost_original}
                onChange={(e) => handleChange('cost_original', e.target.value)} required />
            </div>
            <div className="form-group">
              <label>币种</label>
              <select className="form-control" value={form.currency_original}
                onChange={(e) => handleChange('currency_original', e.target.value)}>
                {CURRENCY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>周期</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="number" min="1" className="form-control" style={{ width: 80 }}
                  value={form.cycle_amount} onChange={(e) => handleChange('cycle_amount', e.target.value)} />
                <select className="form-control" value={form.cycle_unit}
                  onChange={(e) => handleChange('cycle_unit', e.target.value)}>
                  <option value="day">天</option>
                  <option value="month">月</option>
                  <option value="year">年</option>
                </select>
              </div>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>提前提醒天数</label>
              <input type="number" min="0" className="form-control" value={form.reminder_days}
                onChange={(e) => handleChange('reminder_days', e.target.value)} />
            </div>
            <div className="form-group"></div>
          </div>

          <div className="form-group">
            <label>订阅网址 / 联系方式</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="text" className="form-control" value={form.url}
                onChange={(e) => handleChange('url', e.target.value)}
                placeholder="https://example.com 或 @telegram_bot" />
              <button type="button" className="btn btn-secondary btn-sm" onClick={handleFetchFavicon}
                title="自动获取网站图标">
                <i className="fas fa-magic"></i>
              </button>
            </div>
          </div>

          <div className="form-group">
            <label>图标</label>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <select className="form-control" style={{ width: 150 }} value={form.logo_type}
                onChange={(e) => { handleChange('logo_type', e.target.value); if (e.target.value !== 'fontawesome' && e.target.value !== 'emoji') handleChange('logo_value', ''); }}>
                <option value="default">默认</option>
                <option value="emoji">Emoji 表情</option>
                <option value="fontawesome">Font Awesome</option>
                <option value="favicon">网站图标</option>
                <option value="upload">自定义上传</option>
              </select>
              {form.logo_type === 'fontawesome' && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowIconPicker(true)}>
                  {form.logo_value ? <><i className={form.logo_value} style={{ marginRight: 6 }}></i>更换图标</> : <><i className="fas fa-th"></i> 选择图标</>}
                </button>
              )}
              {form.logo_type === 'emoji' && (
                <input type="text" className="form-control" style={{ width: 80, textAlign: 'center', fontSize: '18px' }} 
                  maxLength={6} placeholder="😀"
                  value={form.logo_value} onChange={(e) => handleChange('logo_value', e.target.value)} />
              )}
              {form.logo_type === 'upload' && (
                <input type="file" accept="image/*" onChange={handleUploadLogo} />
              )}
              {form.logo_value && form.logo_type === 'fontawesome' && (
                <div className="sub-logo"><i className={form.logo_value}></i></div>
              )}
              {form.logo_value && form.logo_type === 'emoji' && (
                <div className="sub-logo" style={{ fontSize: '24px' }}>{form.logo_value}</div>
              )}
              {form.logo_value && (form.logo_type === 'favicon' || form.logo_type === 'upload') && (
                <div className="sub-logo"><img src={form.logo_value} alt="" /></div>
              )}
            </div>
          </div>

          <div className="form-group">
            <label>备注</label>
            <textarea className="form-control" value={form.notes}
              onChange={(e) => handleChange('notes', e.target.value)} rows={3} />
          </div>

          {!isEdit && (
            <div className="card" style={{ marginTop: 24, border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
              <div className="form-group" style={{ marginBottom: addPayment ? 16 : 0, display: 'flex', alignItems: 'center', gap: 12 }}>
                <label className="checkbox-group" style={{ margin: 0, fontWeight: 'bold' }}>
                  <input type="checkbox" checked={addPayment} onChange={(e) => setAddPayment(e.target.checked)} /> 
                  同时添加一笔初始付费记录（选填）
                </label>
                <small className="form-text" style={{ margin: 0 }}>如不勾选，订阅的开始/到期日期将为空，直到您后续手动添加付费记录。</small>
              </div>

              {addPayment && (
                <div style={{ padding: '16px', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <div className="form-group">
                    <label>开始日期 *</label>
                    <input type="date" className="form-control" value={payForm.start_date}
                      onChange={(e) => handlePayFormChange('start_date', e.target.value)} required />
                  </div>
                  <div className="form-row" style={{ alignItems: 'flex-start' }}>
                    <div className="form-group">
                      <label>覆盖时长 *</label>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input type="number" min="1" className="form-control"
                          value={payForm.cycle_amount} onChange={(e) => handlePayFormChange('cycle_amount', e.target.value)} required />
                        <select className="form-control" value={payForm.cycle_unit}
                          onChange={(e) => handlePayFormChange('cycle_unit', e.target.value)}>
                          <option value="day">天</option>
                          <option value="month">月</option>
                          <option value="year">年</option>
                        </select>
                      </div>
                    </div>
                    <div className="form-group border-left pl-3" style={{ borderLeft: '1px dashed var(--border)', paddingLeft: 16 }}>
                      <label>结束日期 *</label>
                      <input type="date" className="form-control" value={payForm.end_date}
                        onChange={(e) => handlePayFormChange('end_date', e.target.value)} required />
                      <small className="form-text">可随意修改（以此日期为准）</small>
                    </div>
                  </div>
                  <div className="form-group">
                    <label>实际付费金额 ({form.currency_original}) *</label>
                    <input type="number" step="0.01" className="form-control"
                      value={payForm.cost_original} 
                      placeholder={`默认为 ${form.cost_original || '0'}`}
                      onChange={(e) => handlePayFormChange('cost_original', e.target.value)} />
                    <small className="form-text">选填，不填则默认使用上方填写的订阅费用</small>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="btn-group" style={{ justifyContent: 'space-between', marginTop: 16 }}>
            {isEdit ? (
              <button 
                type="button" 
                className="btn btn-danger" 
                onClick={handleDelete} 
                disabled={loading} 
                style={{ 
                  background: confirmDelete ? 'var(--danger)' : 'transparent', 
                  border: '1px solid var(--danger)', 
                  color: confirmDelete ? '#fff' : 'var(--danger)' 
                }}
              >
                <i className="fas fa-trash"></i> {confirmDelete ? '确认要彻底删除吗？' : '删除订阅'}
              </button>
            ) : <div></div>}
            
            <div style={{ display: 'flex', gap: 12 }}>
              <button type="button" className="btn btn-secondary" onClick={() => navigate(-1)} disabled={loading}>取消</button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? '保存中...' : isEdit ? '保存修改' : '创建订阅'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {showIconPicker && (
        <IconPicker
          value={form.logo_value}
          onChange={(iconClass) => handleChange('logo_value', iconClass)}
          onClose={() => setShowIconPicker(false)}
        />
      )}
    </div>
  );
}
