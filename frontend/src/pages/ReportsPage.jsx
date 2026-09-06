/**
 * Reports — monthly spending trend + category breakdown.
 */
import { useState, useEffect, useCallback } from 'react';
import { getMonthReport, getMonthlyTrend } from '../services/api';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { PageHeader, LoadingBlock } from '../components/ui';
import { money } from '../lib/format';

const COLORS = ['#2563eb', '#0ea5e9', '#14b8a6', '#f59e0b', '#8b5cf6', '#ec4899', '#22c55e', '#64748b'];

const tooltipStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  color: 'var(--text)',
  fontSize: 13,
};

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
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const handleMonthChange = (year, month) => {
    setSelectedYear(year);
    setSelectedMonth(month);
    loadReport(year, month);
  };

  if (loading) return <LoadingBlock />;

  const trendData = trend?.data?.map((d) => ({
    name: `${d.year}-${String(d.month).padStart(2, '0')}`,
    cost: parseFloat(d.total_cost),
  })) || [];

  const pieData = (report?.breakdown || []).map((b) => ({
    name: b.category_name,
    value: parseFloat(b.total_cost),
  }));

  const isCurrentMonth = selectedYear === now.getFullYear() && selectedMonth === (now.getMonth() + 1);
  const monthLabel = isCurrentMonth ? '本月' : `${selectedYear}年${selectedMonth}月`;

  const yearOptions = [];
  for (let y = now.getFullYear() - 3; y <= now.getFullYear(); y++) yearOptions.push(y);

  return (
    <div>
      <PageHeader icon="fas fa-chart-column" title="报表统计" />

      {report && (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">{monthLabel}总支出</div>
            <div className="stat-value accent">
              {money(report.total_cost)}
              <span className="stat-unit">{report.unified_currency}</span>
            </div>
          </div>
        </div>
      )}

      {trendData.length > 0 && (
        <div className="chart-container">
          <h3>月度支出趋势（近 12 月）</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={trendData} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={{ stroke: 'var(--border)' }} />
              <YAxis stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} width={56} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--surface-hover)' }} />
              <Bar dataKey="cost" name="支出" fill="var(--accent)" radius={[4, 4, 0, 0]} maxBarSize={44} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="chart-container">
        <div className="u-spread" style={{ flexWrap: 'wrap', marginBottom: 'var(--sp-5)' }}>
          <h3 style={{ margin: 0 }}>{monthLabel}分类占比</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <select className="form-control" style={{ width: 'auto', padding: '6px 28px 6px 10px', fontSize: 13 }}
              value={selectedYear} onChange={(e) => handleMonthChange(parseInt(e.target.value), selectedMonth)}>
              {yearOptions.map((y) => <option key={y} value={y}>{y} 年</option>)}
            </select>
            <select className="form-control" style={{ width: 'auto', padding: '6px 28px 6px 10px', fontSize: 13 }}
              value={selectedMonth} onChange={(e) => handleMonthChange(selectedYear, parseInt(e.target.value))}>
              {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1} 月</option>)}
            </select>
          </div>
        </div>
        {pieData.length > 0 ? (
          <ResponsiveContainer width="100%" height={340}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" outerRadius={90} dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ paddingTop: 16, fontSize: 13 }} />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>该月暂无数据</div>
        )}
      </div>

      {report?.breakdown?.length > 0 && (
        <div className="card">
          <div className="card-title">{monthLabel}分类明细</div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr><th>分类</th><th className="num">订阅数</th><th className="num">总费用</th></tr>
              </thead>
              <tbody>
                {report.breakdown.map((b, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{b.category_name}</td>
                    <td className="num">{b.subscription_count}</td>
                    <td className="num" style={{ color: 'var(--accent)', fontWeight: 600 }}>
                      {money(b.total_cost, report.unified_currency)}
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
