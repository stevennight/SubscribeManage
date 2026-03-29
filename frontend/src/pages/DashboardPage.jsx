/**
 * Dashboard page - subscription list with filters and stats.
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSubscriptions, getDashboardStats, getCategories, getSettings } from '../services/api';

const STATUS_MAP = {
  active: { label: '正常', class: 'badge-active' },
  expiring: { label: '即将到期', class: 'badge-expiring' },
  expired: { label: '已到期', class: 'badge-expired' },
  disabled: { label: '已停用', class: 'badge-disabled' },
};

function SubLogo({ sub }) {
  if (sub.logo_type === 'emoji' && sub.logo_value) {
    return <span style={{ fontSize: '24px', lineHeight: 1 }}>{sub.logo_value}</span>;
  }
  if (sub.logo_type === 'fontawesome' && sub.logo_value) {
    return <i className={sub.logo_value}></i>;
  }
  if ((sub.logo_type === 'favicon' || sub.logo_type === 'upload') && sub.logo_value) {
    return <img src={sub.logo_value} alt="" onError={(e) => { e.target.style.display='none'; }} />;
  }
  return <i className="fas fa-cube"></i>;
}

export default function DashboardPage() {
  const [subs, setSubs] = useState([]);
  const [categories, setCategories] = useState([]);
  const [stats, setStats] = useState(null);
  const [listMonthlyCost, setListMonthlyCost] = useState(0);
  const [unifiedCurrency, setUnifiedCurrency] = useState('');
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ name: '', categories: [], statuses: ['active', 'expiring', 'expired'] });
  const navigate = useNavigate();

  const [showBreakdownModal, setShowBreakdownModal] = useState(false);

  const ALL_STATUSES = [
    { key: 'active', label: '正常' },
    { key: 'expiring', label: '即将到期' },
    { key: 'expired', label: '已到期' },
    { key: 'disabled', label: '已停用' },
  ];

  const toggleStatus = (key) => {
    setFilters(f => {
      const cur = f.statuses;
      if (cur.includes(key)) {
        return { ...f, statuses: cur.filter(s => s !== key) };
      } else {
        return { ...f, statuses: [...cur, key] };
      }
    });
  };

  const toggleAllStatuses = () => {
    setFilters(f => {
      if (f.statuses.length === ALL_STATUSES.length) {
        return { ...f, statuses: ['active', 'expiring', 'expired'] };
      }
      return { ...f, statuses: ALL_STATUSES.map(s => s.key) };
    });
  };

  const toggleCategory = (catId) => {
    setFilters(f => {
      const cur = f.categories;
      if (cur.includes(catId)) {
        return { ...f, categories: cur.filter(c => c !== catId) };
      } else {
        return { ...f, categories: [...cur, catId] };
      }
    });
  };

  const toggleAllCategories = () => {
    setFilters(f => {
      if (f.categories.length === 0) return f;
      return { ...f, categories: [] };
    });
  };

  // Build API params from filters
  const buildParams = (f) => {
    const params = {};
    if (f.name) params.name = f.name;
    if (f.statuses.length > 0 && f.statuses.length < ALL_STATUSES.length) {
      params.status = f.statuses;
    } else if (f.statuses.length === ALL_STATUSES.length) {
      params.status = f.statuses;
    }
    // empty statuses array = no filter sent, backend defaults to exclude disabled
    if (f.categories.length > 0) {
      params.category_id = f.categories;
    }
    return params;
  };

  useEffect(() => { load(); }, []);

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

  useEffect(() => {
    const timer = setTimeout(() => {
      getSubscriptions(buildParams(filters)).then(res => {
        setSubs(res.data.items);
        setListMonthlyCost(parseFloat(res.data.total_monthly_cost) || 0);
      }).catch(console.error);
    }, 300);
    return () => clearTimeout(timer);
  }, [filters]);

  return (
    <div>
      <div className="page-header">
        <h1>📋 我的订阅</h1>
        <button className="btn btn-primary" onClick={() => navigate('/subscriptions/new')}>
          <i className="fas fa-plus"></i> 新增订阅
        </button>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">活跃订阅</div>
          <div className="stat-value accent">{stats ? stats.active_count : '---'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">即将到期</div>
          <div className="stat-value warning">{stats ? stats.expiring_count : '---'}</div>
        </div>
        <div 
          className="stat-card" 
          style={{ cursor: 'pointer' }} 
          onClick={() => stats && stats.breakdown && stats.breakdown.length > 0 && setShowBreakdownModal(true)}
          title="点击查看分类明细"
        >
          <div className="stat-label">月费合计</div>
          <div className="stat-value success">{stats ? parseFloat(stats.monthly_total).toFixed(2) : '---'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">列表月费合计</div>
          <div className="stat-value">{listMonthlyCost.toFixed(2)}</div>
        </div>
      </div>

      <div className="sub-filters">
        <input type="text" className="form-control filter-search" placeholder="🔍 搜索订阅名称..."
          value={filters.name} onChange={(e) => setFilters(f => ({...f, name: e.target.value}))} />
      </div>

      <div className="filter-chips-row">
        <span className="filter-chips-label">状态</span>
        <div className="filter-chips">
          <button
            type="button"
            className={`filter-chip ${filters.statuses.length === ALL_STATUSES.length ? 'active' : ''}`}
            onClick={toggleAllStatuses}
          >全部</button>
          {ALL_STATUSES.map(s => (
            <button
              key={s.key}
              type="button"
              className={`filter-chip ${filters.statuses.includes(s.key) ? 'active' : ''}`}
              onClick={() => toggleStatus(s.key)}
            >{s.label}</button>
          ))}
        </div>
      </div>

      <div className="filter-chips-row">
        <span className="filter-chips-label">分类</span>
        <div className="filter-chips">
          <button
            type="button"
            className={`filter-chip ${filters.categories.length === 0 ? 'active' : ''}`}
            onClick={toggleAllCategories}
          >全部</button>
          {categories.map(c => (
            <button
              key={c.id}
              type="button"
              className={`filter-chip ${filters.categories.includes(c.id) ? 'active' : ''}`}
              onClick={() => toggleCategory(c.id)}
            >{c.name}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="loading"><span className="spinner"></span>加载中...</div>
      ) : subs.length === 0 ? (
        <div className="empty-state">
          <i className="fas fa-inbox"></i>
          <p>暂无订阅记录</p>
          <button className="btn btn-primary" onClick={() => navigate('/subscriptions/new')}>
            <i className="fas fa-plus"></i> 添加第一个订阅
          </button>
        </div>
      ) : (
        <div className="sub-grid">
          {subs.map(sub => (
            <div key={sub.id} className="sub-card" onClick={() => navigate(`/subscriptions/${sub.id}`)}>
              <div className="sub-logo"><SubLogo sub={sub} /></div>
              <div className="sub-info">
                <h3>{sub.name}</h3>
                {sub.notes && (
                  <div className="sub-notes" style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                    {sub.notes}
                  </div>
                )}
                <div className="sub-meta">
                  {sub.category_name && <span><i className="fas fa-folder"></i> {sub.category_name}</span>}
                  <span><i className="fas fa-calendar"></i> {sub.end_date}</span>
                  <span className={`badge ${STATUS_MAP[sub.status]?.class || ''}`}>
                    {STATUS_MAP[sub.status]?.label || sub.status}
                  </span>
                </div>
              </div>
              <div className="sub-cost">
                {sub.monthly_cost ? (
                  <>
                    <div className="amount">{parseFloat(sub.monthly_cost).toFixed(2)} {unifiedCurrency}</div>
                    <div className="period">/ 月</div>
                  </>
                ) : (
                  <div className="amount" style={{ color: 'var(--warning)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px' }} title="未配置统一币种或汇率获取失败">
                    <i className="fas fa-exclamation-triangle"></i> 未折算
                  </div>
                )}
                {(sub.monthly_cost ? sub.currency_original !== unifiedCurrency : true) && (
                  <div className="original-cost" style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: 'auto', marginTop: '4px' }}>
                    {parseFloat(sub.monthly_cost_original || 0).toFixed(2)} {sub.currency_original} / 月
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Category Breakdown Modal */}
      {showBreakdownModal && stats && stats.breakdown && (
        <div className="modal-overlay" onClick={() => setShowBreakdownModal(false)}>
          <div className="modal-content" style={{ maxWidth: 450 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0 }}>📊 月费合计·分类明细</h3>
              <button type="button" className="btn btn-secondary" style={{ padding: '4px 8px' }} onClick={() => setShowBreakdownModal(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            
            <div className="breakdown-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '60vh', overflowY: 'auto' }}>
              {stats.breakdown.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <i className="fas fa-folder" style={{ color: 'var(--text-secondary)' }}></i>
                    <span>{item.category_name}</span>
                    <span className="badge badge-secondary" style={{ fontSize: '0.8rem' }}>{item.subscription_count} 个</span>
                  </div>
                  <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                    {parseFloat(item.total_cost).toFixed(2)} <span style={{ fontSize: '0.85em', color: 'var(--text-secondary)' }}>{stats.unified_currency}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
