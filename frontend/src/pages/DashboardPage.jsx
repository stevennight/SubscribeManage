/**
 * Dashboard — subscription list with stats and filters.
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSubscriptions, getDashboardStats, getCategories, getSettings } from '../services/api';
import { Button, Modal, PageHeader, LoadingBlock, EmptyState, StatusBadge } from '../components/ui';
import { money } from '../lib/format';

const ALL_STATUSES = [
  { key: 'active', label: '正常' },
  { key: 'expiring', label: '即将到期' },
  { key: 'expired', label: '已到期' },
  { key: 'disabled', label: '已停用' },
  { key: 'not_renewing', label: '到期不续' },
];
const DEFAULT_STATUSES = ['active', 'expiring', 'expired', 'not_renewing'];

function SubLogo({ sub }) {
  if (sub.logo_type === 'emoji' && sub.logo_value) {
    return <span style={{ fontSize: 20, lineHeight: 1 }}>{sub.logo_value}</span>;
  }
  if (sub.logo_type === 'fontawesome' && sub.logo_value) {
    return <i className={sub.logo_value} />;
  }
  if ((sub.logo_type === 'favicon' || sub.logo_type === 'upload') && sub.logo_value) {
    return <img src={sub.logo_value} alt="" onError={(e) => { e.target.style.display = 'none'; }} />;
  }
  return <i className="fas fa-cube" />;
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [subs, setSubs] = useState([]);
  const [categories, setCategories] = useState([]);
  const [stats, setStats] = useState(null);
  const [listMonthlyCost, setListMonthlyCost] = useState(0);
  const [unifiedCurrency, setUnifiedCurrency] = useState('');
  const [loading, setLoading] = useState(true);
  const [showBreakdown, setShowBreakdown] = useState(false);

  const [filters, setFilters] = useState(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem('dashboard_state') || '{}');
      if (saved.filters) return saved.filters;
    } catch { /* ignore */ }
    return { name: '', categories: [], statuses: DEFAULT_STATUSES, sort_by: 'end_date', order: 'asc' };
  });

  const [scrollYToRestore, setScrollYToRestore] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem('dashboard_state') || '{}').scrollY || 0;
    } catch { return 0; }
  });

  const toggleIn = (key, field) => setFilters((f) => {
    const cur = f[field];
    return { ...f, [field]: cur.includes(key) ? cur.filter((x) => x !== key) : [...cur, key] };
  });
  const toggleAllStatuses = () => setFilters((f) => ({
    ...f,
    statuses: f.statuses.length === ALL_STATUSES.length ? DEFAULT_STATUSES : ALL_STATUSES.map((s) => s.key),
  }));
  const setSort = (sort_by, preferDesc = false) => setFilters((f) => ({
    ...f,
    sort_by,
    order: f.sort_by === sort_by ? (f.order === 'asc' ? 'desc' : 'asc') : (preferDesc ? 'desc' : 'asc'),
  }));

  const buildParams = (f) => {
    const params = {};
    if (f.name) params.name = f.name;
    if (f.statuses.length > 0) params.status = f.statuses;
    if (f.categories.length > 0) params.category_id = f.categories;
    if (f.sort_by) params.sort_by = f.sort_by;
    if (f.order) params.order = f.order;
    return params;
  };

  const load = async () => {
    setLoading(true);
    try {
      const [subsRes, catRes, statsRes, setRes] = await Promise.all([
        getSubscriptions(buildParams(filters)),
        getCategories(),
        getDashboardStats(),
        getSettings(),
      ]);
      setSubs(subsRes.data.items);
      setListMonthlyCost(parseFloat(subsRes.data.total_monthly_cost) || 0);
      setCategories(catRes.data);
      setStats(statsRes.data);
      setUnifiedCurrency(setRes.data.unified_currency || '');
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem('dashboard_state') || '{}');
      sessionStorage.setItem('dashboard_state', JSON.stringify({ ...saved, filters }));
    } catch { /* ignore */ }
    const timer = setTimeout(() => {
      getSubscriptions(buildParams(filters)).then((res) => {
        setSubs(res.data.items);
        setListMonthlyCost(parseFloat(res.data.total_monthly_cost) || 0);
      }).catch(console.error);
    }, 300);
    return () => clearTimeout(timer);
  }, [filters]);

  useEffect(() => {
    if (!loading && scrollYToRestore > 0 && subs.length > 0) {
      setTimeout(() => {
        window.scrollTo(0, scrollYToRestore);
        setScrollYToRestore(0);
        try {
          const saved = JSON.parse(sessionStorage.getItem('dashboard_state') || '{}');
          sessionStorage.setItem('dashboard_state', JSON.stringify({ ...saved, scrollY: 0 }));
        } catch { /* ignore */ }
      }, 50);
    }
  }, [loading, subs, scrollYToRestore]);

  const openSub = (id) => {
    try {
      const saved = JSON.parse(sessionStorage.getItem('dashboard_state') || '{}');
      sessionStorage.setItem('dashboard_state', JSON.stringify({ ...saved, scrollY: window.scrollY }));
    } catch { /* ignore */ }
    navigate(`/subscriptions/${id}`);
  };

  const sortArrow = (key) => (filters.sort_by === key ? (filters.order === 'desc' ? ' ↓' : ' ↑') : '');
  const hasBreakdown = stats?.breakdown?.length > 0;

  return (
    <div>
      <PageHeader icon="fas fa-layer-group" title="我的订阅">
        <Button variant="primary" icon="fas fa-plus" onClick={() => navigate('/subscriptions/new')}>
          新增订阅
        </Button>
      </PageHeader>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">活跃订阅</div>
          <div className="stat-value accent">{stats ? stats.active_count : '—'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">即将到期</div>
          <div className="stat-value warning">{stats ? stats.expiring_count : '—'}</div>
        </div>
        <div
          className={`stat-card ${hasBreakdown ? 'is-clickable' : ''}`}
          onClick={() => hasBreakdown && setShowBreakdown(true)}
          title={hasBreakdown ? '点击查看分类明细' : undefined}
        >
          <div className="stat-label">
            月费合计
            {hasBreakdown && <i className="fas fa-chevron-right" style={{ fontSize: 10 }} />}
          </div>
          <div className="stat-value success">
            {stats ? money(stats.monthly_total) : '—'}
            {stats?.unified_currency && <span className="stat-unit">{stats.unified_currency}</span>}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">当前筛选月费</div>
          <div className="stat-value">
            {money(listMonthlyCost)}
            {unifiedCurrency && <span className="stat-unit">{unifiedCurrency}</span>}
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 'var(--sp-4)', marginBottom: 'var(--sp-4)' }}>
        <input
          type="text"
          className="form-control"
          placeholder="搜索订阅名称…"
          value={filters.name}
          onChange={(e) => setFilters((f) => ({ ...f, name: e.target.value }))}
          style={{ marginBottom: 'var(--sp-3)' }}
        />

        <div className="filter-chips-row">
          <span className="filter-chips-label">状态</span>
          <div className="filter-chips">
            <button type="button"
              className={`chip ${filters.statuses.length === ALL_STATUSES.length ? 'active' : ''}`}
              onClick={toggleAllStatuses}>全部</button>
            {ALL_STATUSES.map((s) => (
              <button key={s.key} type="button"
                className={`chip ${filters.statuses.includes(s.key) ? 'active' : ''}`}
                onClick={() => toggleIn(s.key, 'statuses')}>{s.label}</button>
            ))}
          </div>
        </div>

        <div className="filter-chips-row">
          <span className="filter-chips-label">排序</span>
          <div className="filter-chips">
            <button type="button" className={`chip ${filters.sort_by === 'end_date' ? 'active' : ''}`}
              onClick={() => setSort('end_date')}>到期日{sortArrow('end_date')}</button>
            <button type="button" className={`chip ${filters.sort_by === 'name' ? 'active' : ''}`}
              onClick={() => setSort('name')}>名称{sortArrow('name')}</button>
            <button type="button" className={`chip ${filters.sort_by === 'cost' ? 'active' : ''}`}
              onClick={() => setSort('cost', true)}>月费{sortArrow('cost')}</button>
          </div>
        </div>

        {categories.length > 0 && (
          <div className="filter-chips-row" style={{ marginBottom: 0 }}>
            <span className="filter-chips-label">分类</span>
            <div className="filter-chips">
              <button type="button" className={`chip ${filters.categories.length === 0 ? 'active' : ''}`}
                onClick={() => setFilters((f) => ({ ...f, categories: [] }))}>全部</button>
              {categories.map((c) => (
                <button key={c.id} type="button"
                  className={`chip ${filters.categories.includes(c.id) ? 'active' : ''}`}
                  onClick={() => toggleIn(c.id, 'categories')}>{c.name}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <LoadingBlock />
      ) : subs.length === 0 ? (
        <EmptyState text="没有符合条件的订阅">
          <Button variant="primary" icon="fas fa-plus" onClick={() => navigate('/subscriptions/new')}>
            添加第一个订阅
          </Button>
        </EmptyState>
      ) : (
        <div className="sub-grid">
          {subs.map((sub) => (
            <div key={sub.id} className="sub-card" onClick={() => openSub(sub.id)}>
              <div className="sub-logo"><SubLogo sub={sub} /></div>
              <div className="sub-info">
                <h3>{sub.name}</h3>
                {sub.notes && <div className="sub-notes">{sub.notes}</div>}
                <div className="sub-meta">
                  {sub.category_name && <span><i className="fas fa-folder" />{sub.category_name}</span>}
                  <span><i className="fas fa-calendar" />{sub.end_date || '未设置'}</span>
                  <StatusBadge status={sub.status} />
                </div>
              </div>
              <div className="sub-cost">
                {sub.monthly_cost ? (
                  <>
                    <div className="amount">{money(sub.monthly_cost, unifiedCurrency)}</div>
                    <div className="period">/ 月</div>
                  </>
                ) : (
                  <div className="amount" style={{ color: 'var(--warning)', fontSize: 13 }}
                    title="未配置统一币种或汇率获取失败">
                    <i className="fas fa-triangle-exclamation" /> 未折算
                  </div>
                )}
                {(sub.monthly_cost ? sub.currency_original !== unifiedCurrency : true) && (
                  <div className="original-cost">
                    {money(sub.monthly_cost_original || 0, sub.currency_original)} / 月
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={showBreakdown && hasBreakdown}
        onClose={() => setShowBreakdown(false)}
        title="月费合计 · 分类明细"
        width={440}
      >
        <div className="u-stack">
          {stats?.breakdown?.map((item, idx) => (
            <div key={idx} className="u-spread" style={{
              padding: 'var(--sp-3)', background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)',
            }}>
              <span className="u-row">
                <i className="fas fa-folder" style={{ color: 'var(--text-muted)' }} />
                {item.category_name}
                <span className="badge badge-neutral">{item.subscription_count} 个</span>
              </span>
              <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
                {money(item.total_cost, stats.unified_currency)}
              </strong>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
