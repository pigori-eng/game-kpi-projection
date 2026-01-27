import { useState } from 'react';
import { Download, FileSpreadsheet } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, AreaChart, Area, ComposedChart, Bar
} from 'recharts';
import type { ProjectionResult, TabType, GameListResponse, BasicSettings } from '../types';
import { formatNumber, formatCurrency, formatPercent } from '../utils/format';
import AIInsightPanel from './AIInsightPanel';

interface ResultsPanelProps {
  results: ProjectionResult;
  activeTab: TabType;
  games: GameListResponse | null;
  basicSettings?: BasicSettings;
}

const COLORS = { best: '#22c55e', normal: '#3b82f6', worst: '#ef4444' };

const downloadCSV = (data: any[], filename: string, headers: string[]) => {
  const csvContent = [headers.join(','), ...data.map(row => headers.map(h => row[h] ?? '').join(','))].join('\n');
  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
};

const OverviewTab: React.FC<{ results: ProjectionResult; basicSettings?: BasicSettings }> = ({ results, basicSettings }) => {
  const { summary } = results;
  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-blue-600 to-blue-800 rounded-xl p-6 text-white">
        <h2 className="text-2xl font-bold mb-2">📊 프로젝션 결과 Overview</h2>
        <p className="text-blue-100">런칭일: {results.input.launch_date} | 프로젝션 기간: {results.input.projection_days}일</p>
      </div>
      
      {/* AI 인사이트 패널 */}
      <AIInsightPanel results={results} />
      
      <div className="border border-gray-300 rounded-lg overflow-hidden">
        <div className="bg-gray-100 px-4 py-2 border-b font-semibold">1. 산정 정보</div>
        <table className="w-full text-sm">
          <thead><tr className="bg-gray-50"><th className="px-4 py-2 text-left border-b">항목</th><th className="px-4 py-2 text-right border-b">설정값</th><th className="px-4 py-2 text-left border-b">비고</th></tr></thead>
          <tbody>
            <tr><td className="px-4 py-2 border-b">런칭 예정일</td><td className="px-4 py-2 border-b text-right bg-yellow-50">{results.input.launch_date}</td><td className="px-4 py-2 border-b text-gray-500"></td></tr>
            <tr><td className="px-4 py-2 border-b">인프라 비용</td><td className="px-4 py-2 border-b text-right bg-yellow-50">{((basicSettings?.infrastructure_cost_ratio || 0.03) * 100).toFixed(0)}%</td><td className="px-4 py-2 border-b text-gray-500">서버 비용</td></tr>
            <tr><td className="px-4 py-2 border-b">마켓 수수료</td><td className="px-4 py-2 border-b text-right bg-yellow-50">{((basicSettings?.market_fee_ratio || 0.30) * 100).toFixed(0)}%</td><td className="px-4 py-2 border-b text-gray-500">30%</td></tr>
            <tr><td className="px-4 py-2">V.A.T</td><td className="px-4 py-2 text-right bg-yellow-50">{((basicSettings?.vat_ratio || 0.10) * 100).toFixed(0)}%</td><td className="px-4 py-2 text-gray-500">부가세</td></tr>
          </tbody>
        </table>
      </div>
      <div className="border border-gray-300 rounded-lg overflow-hidden">
        <div className="bg-gray-100 px-4 py-2 border-b font-semibold">2. 핵심 KPI 요약</div>
        <table className="w-full text-sm">
          <thead><tr className="bg-gray-50"><th className="px-4 py-2 text-left border-b">지표</th><th className="px-4 py-2 text-right border-b bg-green-50 text-green-700">Best</th><th className="px-4 py-2 text-right border-b bg-blue-50 text-blue-700">Normal</th><th className="px-4 py-2 text-right border-b bg-red-50 text-red-700">Worst</th></tr></thead>
          <tbody>
            <tr><td className="px-4 py-2 border-b font-medium">총 Gross Revenue</td><td className="px-4 py-2 border-b text-right bg-green-50 font-bold text-green-700">{formatCurrency(summary.best.gross_revenue)}</td><td className="px-4 py-2 border-b text-right bg-blue-50 font-bold text-blue-700">{formatCurrency(summary.normal.gross_revenue)}</td><td className="px-4 py-2 border-b text-right bg-red-50 font-bold text-red-700">{formatCurrency(summary.worst.gross_revenue)}</td></tr>
            <tr><td className="px-4 py-2 border-b">총 Net Revenue</td><td className="px-4 py-2 border-b text-right bg-green-50">{formatCurrency(summary.best.net_revenue)}</td><td className="px-4 py-2 border-b text-right bg-blue-50">{formatCurrency(summary.normal.net_revenue)}</td><td className="px-4 py-2 border-b text-right bg-red-50">{formatCurrency(summary.worst.net_revenue)}</td></tr>
            <tr><td className="px-4 py-2 border-b">총 NRU</td><td className="px-4 py-2 border-b text-right bg-green-50">{formatNumber(summary.best.total_nru)}</td><td className="px-4 py-2 border-b text-right bg-blue-50">{formatNumber(summary.normal.total_nru)}</td><td className="px-4 py-2 border-b text-right bg-red-50">{formatNumber(summary.worst.total_nru)}</td></tr>
            <tr><td className="px-4 py-2 border-b">Peak DAU</td><td className="px-4 py-2 border-b text-right bg-green-50">{formatNumber(summary.best.peak_dau)}</td><td className="px-4 py-2 border-b text-right bg-blue-50">{formatNumber(summary.normal.peak_dau)}</td><td className="px-4 py-2 border-b text-right bg-red-50">{formatNumber(summary.worst.peak_dau)}</td></tr>
            <tr><td className="px-4 py-2">평균 DAU</td><td className="px-4 py-2 text-right bg-green-50">{formatNumber(summary.best.average_dau)}</td><td className="px-4 py-2 text-right bg-blue-50">{formatNumber(summary.normal.average_dau)}</td><td className="px-4 py-2 text-right bg-red-50">{formatNumber(summary.worst.average_dau)}</td></tr>
          </tbody>
        </table>
      </div>
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="font-medium text-gray-700 mb-3">선택된 표본 게임</h3>
        <div className="grid grid-cols-4 gap-4 text-sm">
          <div><p className="text-gray-500">Retention</p><p className="font-medium">{results.input.retention_games.join(', ') || '-'}</p></div>
          <div><p className="text-gray-500">NRU</p><p className="font-medium">{results.input.nru_games.join(', ') || '-'}</p></div>
          <div><p className="text-gray-500">P.Rate</p><p className="font-medium">{results.input.pr_games.join(', ') || '-'}</p></div>
          <div><p className="text-gray-500">ARPPU</p><p className="font-medium">{results.input.arppu_games.join(', ') || '-'}</p></div>
        </div>
      </div>
    </div>
  );
};

const RetentionTab: React.FC<{ results: ProjectionResult }> = ({ results }) => {
  const [showTable, setShowTable] = useState(false);
  const chartData = results.results.best.retention.curve.map((_, i) => ({ day: i + 1, best: results.results.best.retention.curve[i] * 100, normal: results.results.normal.retention.curve[i] * 100, worst: results.results.worst.retention.curve[i] * 100 }));
  const tableData = results.results.best.full_data.retention.map((_, i) => ({ day: `D+${i + 1}`, best: (results.results.best.full_data.retention[i] * 100).toFixed(4), normal: (results.results.normal.full_data.retention[i] * 100).toFixed(4), worst: (results.results.worst.full_data.retention[i] * 100).toFixed(4) }));
  return (
    <div className="space-y-6">
      <div className="border rounded-lg overflow-hidden">
        <div className="bg-gray-100 px-4 py-2 font-semibold">회귀분석 결과</div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50"><tr><th className="px-4 py-2 text-left border-b">시나리오</th><th className="px-4 py-2 text-right border-b">D+1</th><th className="px-4 py-2 text-right border-b">a</th><th className="px-4 py-2 text-right border-b">b</th><th className="px-4 py-2 text-right border-b">D+7</th><th className="px-4 py-2 text-right border-b">D+30</th></tr></thead>
          <tbody>
            {(['best', 'normal', 'worst'] as const).map(s => (
              <tr key={s} className={s === 'best' ? 'bg-green-50' : s === 'normal' ? 'bg-blue-50' : 'bg-red-50'}>
                <td className="px-4 py-2 border-b font-medium">{s.charAt(0).toUpperCase() + s.slice(1)}</td>
                <td className="px-4 py-2 border-b text-right">{formatPercent(results.results[s].retention.target_d1)}</td>
                <td className="px-4 py-2 border-b text-right">{results.results[s].retention.coefficients.a.toFixed(4)}</td>
                <td className="px-4 py-2 border-b text-right">{results.results[s].retention.coefficients.b.toFixed(4)}</td>
                <td className="px-4 py-2 border-b text-right">{formatPercent(results.results[s].retention.curve[6])}</td>
                <td className="px-4 py-2 border-b text-right">{formatPercent(results.results[s].retention.curve[29])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="bg-white rounded-xl border p-6">
        <h3 className="text-lg font-semibold mb-4">Retention Curve</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="day" /><YAxis domain={[0, 60]} tickFormatter={(v) => `${v}%`} /><Tooltip formatter={(v: number) => `${v.toFixed(2)}%`} /><Legend />
              <Line type="monotone" dataKey="best" stroke={COLORS.best} name="Best" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="normal" stroke={COLORS.normal} name="Normal" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="worst" stroke={COLORS.worst} name="Worst" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="border rounded-lg overflow-hidden">
        <div className="bg-gray-100 px-4 py-2 flex justify-between"><span className="font-semibold">상세 테이블</span><div className="flex gap-2"><button onClick={() => setShowTable(!showTable)} className="text-sm text-blue-600">{showTable ? '접기' : '펼치기'}</button><button onClick={() => downloadCSV(tableData, 'retention.csv', ['day', 'best', 'normal', 'worst'])} className="flex items-center gap-1 text-sm bg-green-600 text-white px-3 py-1 rounded"><Download className="w-4 h-4" />CSV</button></div></div>
        {showTable && <div className="max-h-96 overflow-y-auto"><table className="w-full text-xs"><thead className="bg-gray-50 sticky top-0"><tr><th className="px-3 py-2 text-left border-b">Day</th><th className="px-3 py-2 text-right border-b bg-green-50">Best</th><th className="px-3 py-2 text-right border-b bg-blue-50">Normal</th><th className="px-3 py-2 text-right border-b bg-red-50">Worst</th></tr></thead><tbody>{tableData.slice(0, 365).map((r, i) => <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}><td className="px-3 py-1 border-b">{r.day}</td><td className="px-3 py-1 border-b text-right">{r.best}%</td><td className="px-3 py-1 border-b text-right">{r.normal}%</td><td className="px-3 py-1 border-b text-right">{r.worst}%</td></tr>)}</tbody></table></div>}
      </div>
    </div>
  );
};

const NRUTab: React.FC<{ results: ProjectionResult }> = ({ results }) => {
  const [showTable, setShowTable] = useState(false);
  const chartData = results.results.best.nru.series.map((_, i) => ({ day: i + 1, best: results.results.best.nru.series[i], normal: results.results.normal.nru.series[i], worst: results.results.worst.nru.series[i] }));
  const tableData = results.results.best.full_data.nru.map((_, i) => ({ day: `D+${i + 1}`, best: results.results.best.full_data.nru[i], normal: results.results.normal.full_data.nru[i], worst: results.results.worst.full_data.nru[i] }));
  return (
    <div className="space-y-6">
      <div className="border rounded-lg overflow-hidden">
        <div className="bg-gray-100 px-4 py-2 font-semibold">NRU 요약</div>
        <table className="w-full text-sm"><thead className="bg-gray-50"><tr><th className="px-4 py-2 text-left border-b">시나리오</th><th className="px-4 py-2 text-right border-b">D1 NRU</th><th className="px-4 py-2 text-right border-b">총 NRU</th></tr></thead>
          <tbody>{(['best', 'normal', 'worst'] as const).map(s => <tr key={s} className={s === 'best' ? 'bg-green-50' : s === 'normal' ? 'bg-blue-50' : 'bg-red-50'}><td className="px-4 py-2 border-b font-medium">{s.charAt(0).toUpperCase() + s.slice(1)}</td><td className="px-4 py-2 border-b text-right">{formatNumber(results.results[s].nru.d1_nru)}</td><td className="px-4 py-2 border-b text-right font-bold">{formatNumber(results.results[s].nru.total)}</td></tr>)}</tbody>
        </table>
      </div>
      <div className="bg-white rounded-xl border p-6"><h3 className="text-lg font-semibold mb-4">NRU 추이</h3><div className="h-80"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="day" /><YAxis tickFormatter={(v) => formatNumber(v)} /><Tooltip formatter={(v: number) => formatNumber(v)} /><Legend /><Area type="monotone" dataKey="best" stroke={COLORS.best} fill={COLORS.best} fillOpacity={0.2} name="Best" /><Area type="monotone" dataKey="normal" stroke={COLORS.normal} fill={COLORS.normal} fillOpacity={0.2} name="Normal" /><Area type="monotone" dataKey="worst" stroke={COLORS.worst} fill={COLORS.worst} fillOpacity={0.2} name="Worst" /></AreaChart></ResponsiveContainer></div></div>
      <div className="border rounded-lg overflow-hidden"><div className="bg-gray-100 px-4 py-2 flex justify-between"><span className="font-semibold">상세 테이블</span><div className="flex gap-2"><button onClick={() => setShowTable(!showTable)} className="text-sm text-blue-600">{showTable ? '접기' : '펼치기'}</button><button onClick={() => downloadCSV(tableData, 'nru.csv', ['day', 'best', 'normal', 'worst'])} className="flex items-center gap-1 text-sm bg-green-600 text-white px-3 py-1 rounded"><Download className="w-4 h-4" />CSV</button></div></div>{showTable && <div className="max-h-96 overflow-y-auto"><table className="w-full text-xs"><thead className="bg-gray-50 sticky top-0"><tr><th className="px-3 py-2 text-left border-b">Day</th><th className="px-3 py-2 text-right border-b bg-green-50">Best</th><th className="px-3 py-2 text-right border-b bg-blue-50">Normal</th><th className="px-3 py-2 text-right border-b bg-red-50">Worst</th></tr></thead><tbody>{tableData.slice(0, 365).map((r, i) => <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}><td className="px-3 py-1 border-b">{r.day}</td><td className="px-3 py-1 border-b text-right">{formatNumber(r.best)}</td><td className="px-3 py-1 border-b text-right">{formatNumber(r.normal)}</td><td className="px-3 py-1 border-b text-right">{formatNumber(r.worst)}</td></tr>)}</tbody></table></div>}</div>
    </div>
  );
};

const RevenueTab: React.FC<{ results: ProjectionResult }> = ({ results }) => {
  const [showTable, setShowTable] = useState(false);
  const chartData = results.results.best.revenue.daily_revenue.map((_, i) => ({ day: i + 1, best: results.results.best.revenue.daily_revenue[i], normal: results.results.normal.revenue.daily_revenue[i], worst: results.results.worst.revenue.daily_revenue[i] }));
  const tableData = results.results.best.full_data.revenue.map((_, i) => ({ day: `D+${i + 1}`, best: Math.round(results.results.best.full_data.revenue[i]), normal: Math.round(results.results.normal.full_data.revenue[i]), worst: Math.round(results.results.worst.full_data.revenue[i]) }));
  return (
    <div className="space-y-6">
      <div className="border rounded-lg overflow-hidden">
        <div className="bg-gray-100 px-4 py-2 font-semibold">Revenue 요약</div>
        <table className="w-full text-sm"><thead className="bg-gray-50"><tr><th className="px-4 py-2 text-left border-b">시나리오</th><th className="px-4 py-2 text-right border-b">총 Gross</th><th className="px-4 py-2 text-right border-b">일평균</th></tr></thead>
          <tbody>{(['best', 'normal', 'worst'] as const).map(s => <tr key={s} className={s === 'best' ? 'bg-green-50' : s === 'normal' ? 'bg-blue-50' : 'bg-red-50'}><td className="px-4 py-2 border-b font-medium">{s.charAt(0).toUpperCase() + s.slice(1)}</td><td className="px-4 py-2 border-b text-right font-bold">{formatCurrency(results.results[s].revenue.total_gross)}</td><td className="px-4 py-2 border-b text-right">{formatCurrency(results.results[s].revenue.average_daily)}</td></tr>)}</tbody>
        </table>
      </div>
      <div className="bg-white rounded-xl border p-6"><h3 className="text-lg font-semibold mb-4">일별 매출</h3><div className="h-80"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="day" /><YAxis tickFormatter={(v) => formatCurrency(v)} /><Tooltip formatter={(v: number) => formatCurrency(v)} /><Legend /><Area type="monotone" dataKey="best" stroke={COLORS.best} fill={COLORS.best} fillOpacity={0.2} name="Best" /><Area type="monotone" dataKey="normal" stroke={COLORS.normal} fill={COLORS.normal} fillOpacity={0.2} name="Normal" /><Area type="monotone" dataKey="worst" stroke={COLORS.worst} fill={COLORS.worst} fillOpacity={0.2} name="Worst" /></AreaChart></ResponsiveContainer></div></div>
      <div className="border rounded-lg overflow-hidden"><div className="bg-gray-100 px-4 py-2 flex justify-between"><span className="font-semibold">상세 테이블</span><div className="flex gap-2"><button onClick={() => setShowTable(!showTable)} className="text-sm text-blue-600">{showTable ? '접기' : '펼치기'}</button><button onClick={() => downloadCSV(tableData, 'revenue.csv', ['day', 'best', 'normal', 'worst'])} className="flex items-center gap-1 text-sm bg-green-600 text-white px-3 py-1 rounded"><Download className="w-4 h-4" />CSV</button></div></div>{showTable && <div className="max-h-96 overflow-y-auto"><table className="w-full text-xs"><thead className="bg-gray-50 sticky top-0"><tr><th className="px-3 py-2 text-left border-b">Day</th><th className="px-3 py-2 text-right border-b bg-green-50">Best</th><th className="px-3 py-2 text-right border-b bg-blue-50">Normal</th><th className="px-3 py-2 text-right border-b bg-red-50">Worst</th></tr></thead><tbody>{tableData.slice(0, 365).map((r, i) => <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}><td className="px-3 py-1 border-b">{r.day}</td><td className="px-3 py-1 border-b text-right">{formatCurrency(r.best)}</td><td className="px-3 py-1 border-b text-right">{formatCurrency(r.normal)}</td><td className="px-3 py-1 border-b text-right">{formatCurrency(r.worst)}</td></tr>)}</tbody></table></div>}</div>
    </div>
  );
};

const TotalTab: React.FC<{ results: ProjectionResult }> = ({ results }) => {
  const [showTable, setShowTable] = useState(false);
  const chartData = results.results.normal.full_data.dau.slice(0, 90).map((_, i) => ({ day: i + 1, dau_normal: results.results.normal.full_data.dau[i], revenue_best: results.results.best.full_data.revenue[i], revenue_normal: results.results.normal.full_data.revenue[i], revenue_worst: results.results.worst.full_data.revenue[i] }));
  const tableData = results.results.normal.full_data.dau.map((_, i) => ({ day: `D+${i + 1}`, dau_best: results.results.best.full_data.dau[i], dau_normal: results.results.normal.full_data.dau[i], dau_worst: results.results.worst.full_data.dau[i], revenue_best: Math.round(results.results.best.full_data.revenue[i]), revenue_normal: Math.round(results.results.normal.full_data.revenue[i]), revenue_worst: Math.round(results.results.worst.full_data.revenue[i]) }));
  return (
    <div className="space-y-6">
      <div className="border rounded-lg overflow-hidden">
        <div className="bg-gray-100 px-4 py-2 font-semibold">통합 KPI 요약</div>
        <table className="w-full text-sm"><thead className="bg-gray-50"><tr><th className="px-4 py-2 text-left border-b">지표</th><th className="px-4 py-2 text-right border-b bg-green-50">Best</th><th className="px-4 py-2 text-right border-b bg-blue-50">Normal</th><th className="px-4 py-2 text-right border-b bg-red-50">Worst</th></tr></thead>
          <tbody>
            <tr><td className="px-4 py-2 border-b">총 NRU</td><td className="px-4 py-2 border-b text-right bg-green-50">{formatNumber(results.summary.best.total_nru)}</td><td className="px-4 py-2 border-b text-right bg-blue-50">{formatNumber(results.summary.normal.total_nru)}</td><td className="px-4 py-2 border-b text-right bg-red-50">{formatNumber(results.summary.worst.total_nru)}</td></tr>
            <tr><td className="px-4 py-2 border-b">Peak DAU</td><td className="px-4 py-2 border-b text-right bg-green-50">{formatNumber(results.summary.best.peak_dau)}</td><td className="px-4 py-2 border-b text-right bg-blue-50">{formatNumber(results.summary.normal.peak_dau)}</td><td className="px-4 py-2 border-b text-right bg-red-50">{formatNumber(results.summary.worst.peak_dau)}</td></tr>
            <tr><td className="px-4 py-2 border-b font-bold">총 Gross Revenue</td><td className="px-4 py-2 border-b text-right bg-green-50 font-bold">{formatCurrency(results.summary.best.gross_revenue)}</td><td className="px-4 py-2 border-b text-right bg-blue-50 font-bold">{formatCurrency(results.summary.normal.gross_revenue)}</td><td className="px-4 py-2 border-b text-right bg-red-50 font-bold">{formatCurrency(results.summary.worst.gross_revenue)}</td></tr>
            <tr><td className="px-4 py-2 font-bold">총 Net Revenue</td><td className="px-4 py-2 text-right bg-green-50 font-bold">{formatCurrency(results.summary.best.net_revenue)}</td><td className="px-4 py-2 text-right bg-blue-50 font-bold">{formatCurrency(results.summary.normal.net_revenue)}</td><td className="px-4 py-2 text-right bg-red-50 font-bold">{formatCurrency(results.summary.worst.net_revenue)}</td></tr>
          </tbody>
        </table>
      </div>
      <div className="bg-white rounded-xl border p-6"><h3 className="text-lg font-semibold mb-4">통합 KPI 추이</h3><div className="h-96"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={chartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="day" /><YAxis yAxisId="left" tickFormatter={(v) => formatNumber(v)} /><YAxis yAxisId="right" orientation="right" tickFormatter={(v) => formatCurrency(v)} /><Tooltip /><Legend /><Bar yAxisId="left" dataKey="dau_normal" fill={COLORS.normal} name="DAU" opacity={0.7} /><Line yAxisId="right" type="monotone" dataKey="revenue_best" stroke={COLORS.best} name="Revenue (Best)" dot={false} /><Line yAxisId="right" type="monotone" dataKey="revenue_normal" stroke={COLORS.normal} name="Revenue (Normal)" dot={false} /><Line yAxisId="right" type="monotone" dataKey="revenue_worst" stroke={COLORS.worst} name="Revenue (Worst)" dot={false} /></ComposedChart></ResponsiveContainer></div></div>
      <div className="border rounded-lg overflow-hidden"><div className="bg-gray-100 px-4 py-2 flex justify-between"><span className="font-semibold">상세 테이블</span><div className="flex gap-2"><button onClick={() => setShowTable(!showTable)} className="text-sm text-blue-600">{showTable ? '접기' : '펼치기'}</button><button onClick={() => downloadCSV(tableData, 'total_kpi.csv', ['day', 'dau_best', 'dau_normal', 'dau_worst', 'revenue_best', 'revenue_normal', 'revenue_worst'])} className="flex items-center gap-1 text-sm bg-green-600 text-white px-3 py-1 rounded"><Download className="w-4 h-4" />CSV</button></div></div>{showTable && <div className="max-h-96 overflow-x-auto overflow-y-auto"><table className="w-full text-xs whitespace-nowrap"><thead className="bg-gray-50 sticky top-0"><tr><th className="px-2 py-2 text-left border-b">Day</th><th className="px-2 py-2 text-right border-b text-green-600">DAU Best</th><th className="px-2 py-2 text-right border-b text-blue-600">Normal</th><th className="px-2 py-2 text-right border-b text-red-600">Worst</th><th className="px-2 py-2 text-right border-b text-green-600">Rev Best</th><th className="px-2 py-2 text-right border-b text-blue-600">Normal</th><th className="px-2 py-2 text-right border-b text-red-600">Worst</th></tr></thead><tbody>{tableData.slice(0, 365).map((r, i) => <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}><td className="px-2 py-1 border-b">{r.day}</td><td className="px-2 py-1 border-b text-right">{formatNumber(r.dau_best)}</td><td className="px-2 py-1 border-b text-right">{formatNumber(r.dau_normal)}</td><td className="px-2 py-1 border-b text-right">{formatNumber(r.dau_worst)}</td><td className="px-2 py-1 border-b text-right">{formatCurrency(r.revenue_best)}</td><td className="px-2 py-1 border-b text-right">{formatCurrency(r.revenue_normal)}</td><td className="px-2 py-1 border-b text-right">{formatCurrency(r.revenue_worst)}</td></tr>)}</tbody></table></div>}</div>
    </div>
  );
};

const DAUTab: React.FC<{ results: ProjectionResult }> = ({ results }) => {
  const [showTable, setShowTable] = useState(false);
  const chartData = results.results.best.dau.series.map((_, i) => ({ day: i + 1, best: results.results.best.dau.series[i], normal: results.results.normal.dau.series[i], worst: results.results.worst.dau.series[i] }));
  const tableData = results.results.best.full_data.dau.map((_, i) => ({ day: `D+${i + 1}`, best: results.results.best.full_data.dau[i], normal: results.results.normal.full_data.dau[i], worst: results.results.worst.full_data.dau[i] }));
  return (
    <div className="space-y-6">
      <div className="border rounded-lg overflow-hidden">
        <div className="bg-gray-100 px-4 py-2 font-semibold">DAU 상세 요약</div>
        <div className="p-4 grid grid-cols-3 gap-4">
          {(['best', 'normal', 'worst'] as const).map(s => (
            <div key={s} className={`p-4 rounded-lg border-2 ${s === 'best' ? 'bg-green-50 border-green-300' : s === 'normal' ? 'bg-blue-50 border-blue-300' : 'bg-red-50 border-red-300'}`}>
              <h4 className={`font-bold text-lg mb-3 ${s === 'best' ? 'text-green-700' : s === 'normal' ? 'text-blue-700' : 'text-red-700'}`}>{s.charAt(0).toUpperCase() + s.slice(1)}</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span>Peak DAU:</span><span className="font-bold">{formatNumber(results.results[s].dau.peak)}</span></div>
                <div className="flex justify-between"><span>평균 DAU:</span><span className="font-bold">{formatNumber(results.results[s].dau.average)}</span></div>
                <div className="flex justify-between"><span>D+1 DAU:</span><span>{formatNumber(results.results[s].dau.series[0])}</span></div>
                <div className="flex justify-between"><span>D+30 DAU:</span><span>{formatNumber(results.results[s].dau.series[29])}</span></div>
              </div>
              <div className={`mt-3 pt-3 border-t text-xs text-gray-500 ${s === 'best' ? 'border-green-300' : s === 'normal' ? 'border-blue-300' : 'border-red-300'}`}>
                {s === 'best' && '낙관적 시나리오'}
                {s === 'normal' && '기준 시나리오'}
                {s === 'worst' && '보수적 시나리오'}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-white rounded-xl border p-6"><h3 className="text-lg font-semibold mb-4">DAU 추이</h3><div className="h-80"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="day" /><YAxis tickFormatter={(v) => formatNumber(v)} /><Tooltip formatter={(v: number) => formatNumber(v)} /><Legend /><Area type="monotone" dataKey="best" stroke={COLORS.best} fill={COLORS.best} fillOpacity={0.2} name="Best" /><Area type="monotone" dataKey="normal" stroke={COLORS.normal} fill={COLORS.normal} fillOpacity={0.2} name="Normal" /><Area type="monotone" dataKey="worst" stroke={COLORS.worst} fill={COLORS.worst} fillOpacity={0.2} name="Worst" /></AreaChart></ResponsiveContainer></div></div>
      <div className="border rounded-lg overflow-hidden"><div className="bg-gray-100 px-4 py-2 flex justify-between"><span className="font-semibold">상세 테이블</span><div className="flex gap-2"><button onClick={() => setShowTable(!showTable)} className="text-sm text-blue-600">{showTable ? '접기' : '펼치기'}</button><button onClick={() => downloadCSV(tableData, 'dau.csv', ['day', 'best', 'normal', 'worst'])} className="flex items-center gap-1 text-sm bg-green-600 text-white px-3 py-1 rounded"><Download className="w-4 h-4" />CSV</button></div></div>{showTable && <div className="max-h-96 overflow-y-auto"><table className="w-full text-xs"><thead className="bg-gray-50 sticky top-0"><tr><th className="px-3 py-2 text-left border-b">Day</th><th className="px-3 py-2 text-right border-b bg-green-50">Best</th><th className="px-3 py-2 text-right border-b bg-blue-50">Normal</th><th className="px-3 py-2 text-right border-b bg-red-50">Worst</th></tr></thead><tbody>{tableData.slice(0, 365).map((r, i) => <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}><td className="px-3 py-1 border-b">{r.day}</td><td className="px-3 py-1 border-b text-right">{formatNumber(r.best)}</td><td className="px-3 py-1 border-b text-right">{formatNumber(r.normal)}</td><td className="px-3 py-1 border-b text-right">{formatNumber(r.worst)}</td></tr>)}</tbody></table></div>}</div>
    </div>
  );
};

const RawDataTab: React.FC<{ games: GameListResponse | null }> = ({ games }) => {
  if (!games) return null;
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border p-6">
        <div className="flex justify-between items-center mb-4"><h3 className="text-lg font-semibold">Raw Data 관리</h3><button className="flex items-center gap-1 text-sm bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"><FileSpreadsheet className="w-4 h-4" />새 데이터 업로드</button></div>
        <p className="text-gray-600 mb-4">현재 등록된 게임 데이터 목록입니다.</p>
        <div className="grid grid-cols-2 gap-6">
          {[{ key: 'retention', label: 'Retention', data: games.retention }, { key: 'nru', label: 'NRU', data: games.nru }, { key: 'payment_rate', label: 'Payment Rate', data: games.payment_rate }, { key: 'arppu', label: 'ARPPU', data: games.arppu }].map(({ key, label, data }) => (
            <div key={key} className="border rounded-lg overflow-hidden">
              <div className="bg-gray-100 px-3 py-2 flex justify-between"><span className="font-medium">{label} ({data.length}개)</span><button onClick={() => downloadCSV(data.map(g => ({ game: g })), `${key}.csv`, ['game'])} className="text-xs text-blue-600 flex items-center gap-1"><Download className="w-3 h-3" />다운로드</button></div>
              <div className="max-h-48 overflow-y-auto">{data.map((g, i) => <div key={g} className={`px-3 py-2 text-sm ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-b last:border-b-0`}>{g}</div>)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const ResultsPanel: React.FC<ResultsPanelProps> = ({ results, activeTab, games, basicSettings }) => {
  const renderContent = () => {
    switch (activeTab) {
      case 'overview': return <OverviewTab results={results} basicSettings={basicSettings} />;
      case 'retention': return <RetentionTab results={results} />;
      case 'nru': return <NRUTab results={results} />;
      case 'revenue': return <RevenueTab results={results} />;
      case 'projection-total': return <TotalTab results={results} />;
      case 'projection-dau': return <DAUTab results={results} />;
      case 'raw-data': return <RawDataTab games={games} />;
      default: return <OverviewTab results={results} basicSettings={basicSettings} />;
    }
  };
  return <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">{renderContent()}</div>;
};

export default ResultsPanel;
