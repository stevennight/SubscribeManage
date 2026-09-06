/**
 * Subscription create / edit form.
 */
import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  getSubscription, createSubscription, updateSubscription,
  getCategories, fetchFavicon, uploadLogo, getSettings, deleteSubscription,
  addPaymentRecord,
} from '../services/api';
import IconPicker from '../components/IconPicker';
import { Button, Modal, PageHeader, Field, LoadingBlock, useToast } from '../components/ui';

const CURRENCY_OPTIONS = ['CNY', 'USD', 'EUR', 'GBP', 'JPY', 'HKD', 'TWD', 'KRW', 'SGD', 'AUD', 'CAD', 'CHF', 'RUB', 'THB', 'MYR'];

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

export default function SubscriptionFormPage() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const toast = useToast();

  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [unifiedCurrencySet, setUnifiedCurrencySet] = useState(false);
  const [checkingCurrency, setCheckingCurrency] = useState(true);

  const [form, setForm] = useState({
    name: '', category_id: '', cycle_amount: 1, cycle_unit: 'month',
    cost_original: '', currency_original: 'USD',
    reminder_days: 7, url: '', logo_type: 'default',
    logo_value: '', payment_method: '', notes: '',
  });

  const [addPayment, setAddPayment] = useState(false);
  const [payForm, setPayForm] = useState({
    start_date: new Date().toISOString().split('T')[0],
    end_date: '', cycle_amount: 1, cycle_unit: 'month', cost_original: '',
  });

  useEffect(() => {
    if (!isEdit && !payForm.end_date) {
      setPayForm((f) => ({ ...f, end_date: calculateEndDate(f.start_date, f.cycle_amount, f.cycle_unit) }));
    }
  }, [isEdit]);  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    getSettings().then((res) => {
      const unified = res.data.unified_currency;
      setUnifiedCurrencySet(!!unified);
      if (!isEdit && unified) setForm((f) => ({ ...f, currency_original: unified }));
      setCheckingCurrency(false);
    }).catch(() => setCheckingCurrency(false));

    getCategories().then((res) => setCategories(res.data)).catch(console.error);

    if (isEdit) {
      getSubscription(id).then((res) => {
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
  }, [id]);  // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (field, value) => setForm((f) => {
    const next = { ...f, [field]: value };
    if (!isEdit && ['cost_original', 'cycle_amount', 'cycle_unit'].includes(field)) {
      setPayForm((p) => {
        const nextP = { ...p, [field]: value };
        if (field === 'cycle_amount' || field === 'cycle_unit') {
          nextP.end_date = calculateEndDate(nextP.start_date, nextP.cycle_amount, nextP.cycle_unit);
        }
        return nextP;
      });
    }
    return next;
  });

  const handlePayFormChange = (field, value) => setPayForm((f) => {
    const next = { ...f, [field]: value };
    if (['start_date', 'cycle_amount', 'cycle_unit'].includes(field)) {
      next.end_date = calculateEndDate(next.start_date, next.cycle_amount, next.cycle_unit);
    }
    return next;
  });

  const handleFetchFavicon = async () => {
    if (!form.url) return;
    try {
      const res = await fetchFavicon(form.url);
      if (res.data.success) {
        setForm((f) => ({ ...f, logo_type: 'favicon', logo_value: res.data.favicon_url }));
        toast.success('已获取网站图标');
      } else {
        toast.error('未能获取到图标');
      }
    } catch {
      toast.error('获取图标失败');
    }
  };

  const handleUploadLogo = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const res = await uploadLogo(file);
      setForm((f) => ({ ...f, logo_type: 'upload', logo_value: res.data.url }));
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
        toast.success('已保存修改');
      } else {
        const res = await createSubscription(data);
        if (addPayment) {
          await addPaymentRecord(res.data.id, {
            start_date: payForm.start_date,
            end_date: payForm.end_date,
            cost_original: parseFloat(payForm.cost_original || data.cost_original),
          });
        }
        toast.success('订阅已创建');
      }
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.detail || '保存失败');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setLoading(true);
    try {
      await deleteSubscription(id);
      toast.success('订阅已删除');
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.response?.data?.detail || '删除失败');
      setLoading(false);
      setShowDelete(false);
    }
  };

  if (checkingCurrency) return <LoadingBlock />;

  if (!isEdit && !unifiedCurrencySet) {
    return (
      <div>
        <PageHeader icon="fas fa-plus" title="新增订阅">
          <Button icon="fas fa-arrow-left" onClick={() => navigate(-1)}>返回</Button>
        </PageHeader>
        <div className="card">
          <div className="alert alert-warning">
            <i className="fas fa-triangle-exclamation" />
            请先在<strong>&nbsp;系统设置&nbsp;</strong>中设置统一币种，再添加订阅记录。
          </div>
          <Button variant="primary" icon="fas fa-gear" onClick={() => navigate('/settings')}>前往设置</Button>
        </div>
      </div>
    );
  }

  const logoPreview = form.logo_value && (
    form.logo_type === 'fontawesome' ? <div className="sub-logo"><i className={form.logo_value} /></div>
    : form.logo_type === 'emoji' ? <div className="sub-logo" style={{ fontSize: 22 }}>{form.logo_value}</div>
    : (form.logo_type === 'favicon' || form.logo_type === 'upload') ? <div className="sub-logo"><img src={form.logo_value} alt="" /></div>
    : null
  );

  return (
    <div>
      <PageHeader icon={isEdit ? 'fas fa-pen' : 'fas fa-plus'} title={isEdit ? '编辑订阅' : '新增订阅'}>
        <Button icon="fas fa-arrow-left" onClick={() => navigate(-1)}>返回</Button>
      </PageHeader>

      {error && <div className="alert alert-error"><i className="fas fa-circle-exclamation" />{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="card">
          <div className="card-title">基本信息</div>
          <Field label="订阅名称 *" htmlFor="f-name">
            <input id="f-name" type="text" className="form-control" value={form.name}
              onChange={(e) => handleChange('name', e.target.value)} required />
          </Field>
          <div className="form-row">
            <Field label="订阅分类" htmlFor="f-cat">
              <select id="f-cat" className="form-control" value={form.category_id}
                onChange={(e) => handleChange('category_id', e.target.value)}>
                <option value="">未分类</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="付款方式" htmlFor="f-pm">
              <input id="f-pm" type="text" className="form-control" value={form.payment_method}
                onChange={(e) => handleChange('payment_method', e.target.value)}
                placeholder="信用卡 / PayPal / 支付宝…" />
            </Field>
          </div>
        </div>

        <div className="card">
          <div className="card-title">费用与周期</div>
          <div className="form-row-3">
            <Field label="订阅费用 *" htmlFor="f-cost">
              <input id="f-cost" type="number" step="0.01" min="0" className="form-control"
                value={form.cost_original} onChange={(e) => handleChange('cost_original', e.target.value)} required />
            </Field>
            <Field label="币种" htmlFor="f-cur">
              <select id="f-cur" className="form-control" value={form.currency_original}
                onChange={(e) => handleChange('currency_original', e.target.value)}>
                {CURRENCY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="周期">
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="number" min="1" className="form-control" style={{ width: 72 }}
                  value={form.cycle_amount} onChange={(e) => handleChange('cycle_amount', e.target.value)} />
                <select className="form-control" value={form.cycle_unit}
                  onChange={(e) => handleChange('cycle_unit', e.target.value)}>
                  <option value="day">天</option>
                  <option value="month">月</option>
                  <option value="year">年</option>
                </select>
              </div>
            </Field>
          </div>
          <Field label="提前提醒天数" htmlFor="f-remind" className="u-half">
            <input id="f-remind" type="number" min="0" className="form-control"
              value={form.reminder_days} onChange={(e) => handleChange('reminder_days', e.target.value)} />
          </Field>
        </div>

        <div className="card">
          <div className="card-title">图标与链接</div>
          <Field label="订阅网址 / 联系方式" htmlFor="f-url"
            hint="填写网址后可点击右侧按钮自动获取网站图标">
            <div style={{ display: 'flex', gap: 8 }}>
              <input id="f-url" type="text" className="form-control" value={form.url}
                onChange={(e) => handleChange('url', e.target.value)}
                placeholder="https://example.com 或 @telegram_bot" />
              <Button type="button" icon="fas fa-wand-magic-sparkles" onClick={handleFetchFavicon}
                title="自动获取网站图标" />
            </div>
          </Field>
          <Field label="图标">
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <select className="form-control" style={{ width: 150 }} value={form.logo_type}
                onChange={(e) => {
                  handleChange('logo_type', e.target.value);
                  if (!['fontawesome', 'emoji'].includes(e.target.value)) handleChange('logo_value', '');
                }}>
                <option value="default">默认</option>
                <option value="emoji">Emoji 表情</option>
                <option value="fontawesome">Font Awesome</option>
                <option value="favicon">网站图标</option>
                <option value="upload">自定义上传</option>
              </select>
              {form.logo_type === 'fontawesome' && (
                <Button type="button" icon={form.logo_value || 'fas fa-table-cells'}
                  onClick={() => setShowIconPicker(true)}>
                  {form.logo_value ? '更换图标' : '选择图标'}
                </Button>
              )}
              {form.logo_type === 'emoji' && (
                <input type="text" className="form-control" style={{ width: 72, textAlign: 'center', fontSize: 18 }}
                  maxLength={6} placeholder="😀" value={form.logo_value}
                  onChange={(e) => handleChange('logo_value', e.target.value)} />
              )}
              {form.logo_type === 'upload' && (
                <input type="file" accept="image/*" onChange={handleUploadLogo} />
              )}
              {logoPreview}
            </div>
          </Field>
          <Field label="备注" htmlFor="f-notes" className="u-mb0">
            <textarea id="f-notes" className="form-control" rows={3} value={form.notes}
              onChange={(e) => handleChange('notes', e.target.value)} />
          </Field>
        </div>

        {!isEdit && (
          <div className="card">
            <label className="checkbox-group" style={{ fontWeight: 600 }}>
              <input type="checkbox" checked={addPayment} onChange={(e) => setAddPayment(e.target.checked)} />
              同时添加一笔初始付费记录（选填）
            </label>
            <p className="field-hint" style={{ marginTop: 6 }}>
              不勾选时，订阅的开始 / 到期日期为空，直到后续手动添加付费记录。
            </p>
            {addPayment && (
              <div style={{ marginTop: 16, padding: 16, background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)' }}>
                <Field label="开始日期 *" htmlFor="p-start">
                  <input id="p-start" type="date" className="form-control" value={payForm.start_date}
                    onChange={(e) => handlePayFormChange('start_date', e.target.value)} required />
                </Field>
                <div className="form-row">
                  <Field label="覆盖时长 *">
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
                  </Field>
                  <Field label="结束日期 *" htmlFor="p-end" hint="可随意修改（以此日期为准）">
                    <input id="p-end" type="date" className="form-control" value={payForm.end_date}
                      onChange={(e) => handlePayFormChange('end_date', e.target.value)} required />
                  </Field>
                </div>
                <Field label={`实际付费金额 (${form.currency_original})`} htmlFor="p-cost"
                  hint="选填，不填则使用上方的订阅费用" className="u-mb0">
                  <input id="p-cost" type="number" step="0.01" className="form-control"
                    value={payForm.cost_original} placeholder={`默认为 ${form.cost_original || '0'}`}
                    onChange={(e) => handlePayFormChange('cost_original', e.target.value)} />
                </Field>
              </div>
            )}
          </div>
        )}

        <div className="form-actions">
          {isEdit
            ? <Button type="button" variant="danger-outline" icon="fas fa-trash"
                onClick={() => setShowDelete(true)} disabled={loading}>删除订阅</Button>
            : <span />}
          <div className="btn-group">
            <Button type="button" onClick={() => navigate(-1)} disabled={loading}>取消</Button>
            <Button type="submit" variant="primary" loading={loading}>
              {isEdit ? '保存修改' : '创建订阅'}
            </Button>
          </div>
        </div>
      </form>

      {showIconPicker && (
        <IconPicker
          value={form.logo_value}
          onChange={(iconClass) => handleChange('logo_value', iconClass)}
          onClose={() => setShowIconPicker(false)}
        />
      )}

      <Modal
        open={showDelete}
        onClose={() => setShowDelete(false)}
        title="删除订阅"
        footer={<>
          <Button onClick={() => setShowDelete(false)}>取消</Button>
          <Button variant="danger" loading={loading} onClick={handleDelete}>确认删除</Button>
        </>}
      >
        <p style={{ color: 'var(--text-secondary)' }}>
          确认要彻底删除「{form.name}」吗？该操作不可撤销，付费历史也会一并删除。
        </p>
      </Modal>
    </div>
  );
}
