/**
 * Reports page with monthly spending charts and breakdowns.
 */
import { useState, useEffect, useCallback } from 'react';
import { getMonthReport, getMonthlyTrend } from '../services/api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

const COLORS = ['#6c63ff', '#34d399', '#fbbf24', '#f87171', '#60a5fa', '#a78bfa', '#f472b6', '#fb923c'];

export default function ReportsPage() {
  const now = new Date();
  const [report, setReport] = useState(null);
  const [trend, setTrend] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);

  const loadReport = useCallback(async (year, month) => {
    try {
      const res = await getMonthReport(year, month);
      setReport(res.data);
    } catch (err) { console.error(err); }
  }, []);

  useEffect(() => {
    Promise.all([
      getMonthReport(selectedYear, selectedMonth),
      getMonthlyTrend(12),
    ]).then(([reportRes, trendRes]) => {
      setReport(reportRes.data);
      setTrend(trendRes.data);
    }).catch(console.error).finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMonthChange = (year, month) => {
    setSelectedYear(year);
    setSelectedMonth(month);
    loadReport(year, month);
  };

  if (loading) return <div className="loading"><span className="spinner"></span>加载中...</div>;

  const trendData = trend?.data?.map(d => ({
    name: `${d.year}-${String(d.month).padStart(2, '0')}`,
    cost: parseFloat(d.total_cost),
  })) || [];

  const pieData = (report?.breakdown || []).map(b => ({
    name: b.category_name,
    value: parseFloat(b.total_cost),
  }));

  const isCurrentMonth = selectedYear === now.getFullYear() && selectedMonth === (now.getMonth() + 1);
  const monthLabel = isCurrentMonth ? '本月' : `${selectedYear}年${selectedMonth}月`;

  // Generate year options: from 3 years ago to current year
  const yearOptions = [];
  for (let y = now.getFullYear() - 3; y <= now.getFullYear(); y++) {
    yearOptions.push(y);
  }

  return (
    <div>
      <div className="page-header">
        <h1>📊 报表统计</h1>
      </div>

      {/* Current selection summary */}
      {report && (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">{monthLabel}总支出</div>
            <div className="stat-value accent">
              {parseFloat(report.total_cost).toFixed(2)}
              <span style={{ fontSize: 14, marginLeft: 4, opacity: 0.6 }}>{report.unified_currency}</span>
            </div>
          </div>
        </div>
      )}

      {/* Monthly Trend Chart */}
      {trendData.length > 0 && (
        <div className="chart-container">
          <h3>📈 月度支出趋势（近12月）</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
              <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={12} />
              <YAxis stroke="var(--text-muted)" fontSize={12} />
              <Tooltip
                contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 8 }}
                labelStyle={{ color: 'var(--text-primary)' }}
              />
              <Bar dataKey="cost" fill="var(--accent)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Month Selector + Category Pie Chart */}
      <div className="chart-container">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
          <h3 style={{ margin: 0 }}>🥧 {monthLabel}分类占比</h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select
              className="form-control"
              style={{ width: 'auto', minWidth: 90, padding: '6px 10px', fontSize: 13 }}
              value={selectedYear}
              onChange={(e) => handleMonthChange(parseInt(e.target.value), selectedMonth)}
            >
              {yearOptions.map(y => (
                <option key={y} value={y}>{y} 年</option>
              ))}
            </select>
            <select
              className="form-control"
              style={{ width: 'auto', minWidth: 70, padding: '6px 10px', fontSize: 13 }}
              value={selectedMonth}
              onChange={(e) => handleMonthChange(selectedYear, parseInt(e.target.value))}
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>{i + 1} 月</option>
              ))}
            </select>
          </div>
        </div>
        {pieData.length > 0 ? (
          <ResponsiveContainer width="100%" height={340}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 8 }} />
              <Legend wrapperStyle={{ paddingTop: 20 }} />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
            该月暂无数据
          </div>
        )}
      </div>

      {/* Category Breakdown Table */}
      {report?.breakdown?.length > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h2 style={{ marginBottom: 16 }}>📂 {monthLabel}分类明细</h2>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr><th>分类</th><th>订阅数</th><th>总费用</th></tr>
              </thead>
              <tbody>
                {report.breakdown.map((b, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{b.category_name}</td>
                    <td>{b.subscription_count}</td>
                    <td style={{ color: 'var(--accent)', fontWeight: 600 }}>
                      {parseFloat(b.total_cost).toFixed(2)} {report.unified_currency}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
