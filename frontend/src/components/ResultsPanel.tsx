import { useState, useRef } from 'react';
import { Download, FileSpreadsheet, RefreshCw } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, AreaChart, Area, ComposedChart, Bar
} from 'recharts';
import type { ProjectionResult, TabType, GameListResponse, BasicSettings } from '../types';
import { formatNumber, formatCurrency, formatPercent, formatCompactNumber, formatCompactKorean } from '../utils/format';
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
  
  // Phase 2: LTV & ROAS 계산
  const calculateLtvRoas = (scenario: 'best' | 'normal' | 'worst') => {
    const s = summary[scenario];
    const mktBudget = basicSettings?.launch_mkt_budget || 0;
    const totalNru = s.total_nru || 1;
    
    const ltv = s.gross_revenue / totalNru;
    const cac = mktBudget / totalNru;
    const roas = mktBudget > 0 ? (s.gross_revenue / mktBudget) * 100 : 0;
    
    let breakEvenDay = 0;
    let cumRevenue = 0;
    const dailyRevenue = results.results[scenario].revenue.daily_revenue;
    for (let i = 0; i < dailyRevenue.length; i++) {
      cumRevenue += dailyRevenue[i];
      if (cumRevenue >= mktBudget && breakEvenDay === 0) {
        breakEvenDay = i + 1;
        break;
      }
    }
    
    return { ltv, cac, roas, breakEvenDay };
  };

  const ltvRoas = {
    best: calculateLtvRoas('best'),
    normal: calculateLtvRoas('normal'),
    worst: calculateLtvRoas('worst'),
  };

  // V8 #3: BEP 차트 데이터 생성
  const generateBepChartData = (): { day: number; cumRevenue: number; cumCost: number; isBep: boolean }[] => {
    const mktBudget = basicSettings?.launch_mkt_budget || 0;
    const devCost = basicSettings?.dev_cost || 0;
    const sustainingRatio = basicSettings?.sustaining_mkt_ratio || 0.07;
    
    const data: { day: number; cumRevenue: number; cumCost: number; isBep: boolean }[] = [];
    let cumRevenue = 0;
    let cumCost = devCost + mktBudget; // 초기 비용 = 개발비 + 런칭 MKT
    
    const dailyRevenue = results.results.normal.full_data.revenue;
    
    for (let i = 0; i < Math.min(dailyRevenue.length, 365); i++) {
      cumRevenue += dailyRevenue[i];
      // Sustaining MKT = 일별 매출의 일정 비율
      const dailySustaining = dailyRevenue[i] * sustainingRatio;
      cumCost += dailySustaining;
      
      const prevData = data[i - 1];
      data.push({
        day: i + 1,
        cumRevenue: Math.round(cumRevenue),
        cumCost: Math.round(cumCost),
        // BEP 교차점 마커
        isBep: i > 0 && prevData && prevData.cumRevenue < prevData.cumCost && cumRevenue >= cumCost
      });
    }
    return data;
  };

  const bepChartData = generateBepChartData();
  const bepDay = bepChartData.findIndex(d => d.isBep) + 1;

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* V8 #5: A4 스타일 종합 보고서 헤더 */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl p-8 text-white print:bg-slate-800">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-3xl font-bold">📊 KPI Projection Report</h1>
          <div className="text-right text-sm text-slate-300">
            <p>Generated: {new Date().toLocaleDateString('ko-KR')}</p>
            <p>Period: {results.input.projection_days} days</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 mt-6">
          <div className="bg-white/10 rounded-lg p-4">
            <p className="text-slate-300 text-sm">Normal Revenue</p>
            <p className="text-2xl font-bold">{formatCurrency(summary.normal.gross_revenue)}</p>
          </div>
          <div className="bg-white/10 rounded-lg p-4">
            <p className="text-slate-300 text-sm">Peak DAU</p>
            <p className="text-2xl font-bold">{summary.normal.peak_dau.toLocaleString()}</p>
          </div>
          <div className="bg-white/10 rounded-lg p-4">
            <p className="text-slate-300 text-sm">BEP</p>
            <p className="text-2xl font-bold">{bepDay > 0 ? `D+${bepDay}` : 'N/A'}</p>
          </div>
        </div>
      </div>

      {/* Section 1: Executive Summary (AI) */}
      <section className="bg-white rounded-xl border-2 border-violet-200 overflow-hidden">
        <div className="bg-violet-100 px-6 py-4 border-b border-violet-200">
          <h2 className="text-xl font-bold text-violet-900">📋 Section 1: Executive Summary</h2>
        </div>
        <div className="p-6">
          <AIInsightPanel results={results} autoLoad={true} />
        </div>
      </section>

      {/* Section 2: 핵심 KPI 요약 */}
      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="bg-gray-100 px-6 py-4 border-b">
          <h2 className="text-xl font-bold text-gray-800">📈 Section 2: Key Metrics</h2>
        </div>
        <div className="p-6">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-4 py-3 text-left border border-gray-200 font-semibold">지표</th>
                <th className="px-4 py-3 text-right border border-gray-200 bg-green-50 text-green-700 font-semibold">Best</th>
                <th className="px-4 py-3 text-right border border-gray-200 bg-blue-50 text-blue-700 font-semibold">Normal</th>
                <th className="px-4 py-3 text-right border border-gray-200 bg-red-50 text-red-700 font-semibold">Worst</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-4 py-3 border border-gray-200 font-medium">총 Gross Revenue</td>
                <td className="px-4 py-3 border border-gray-200 text-right bg-green-50 font-bold">{formatCurrency(summary.best.gross_revenue)}</td>
                <td className="px-4 py-3 border border-gray-200 text-right bg-blue-50 font-bold">{formatCurrency(summary.normal.gross_revenue)}</td>
                <td className="px-4 py-3 border border-gray-200 text-right bg-red-50 font-bold">{formatCurrency(summary.worst.gross_revenue)}</td>
              </tr>
              <tr>
                <td className="px-4 py-3 border border-gray-200">총 Net Revenue</td>
                <td className="px-4 py-3 border border-gray-200 text-right bg-green-50">{formatCurrency(summary.best.net_revenue)}</td>
                <td className="px-4 py-3 border border-gray-200 text-right bg-blue-50">{formatCurrency(summary.normal.net_revenue)}</td>
                <td className="px-4 py-3 border border-gray-200 text-right bg-red-50">{formatCurrency(summary.worst.net_revenue)}</td>
              </tr>
              <tr>
                <td className="px-4 py-3 border border-gray-200">총 NRU</td>
                <td className="px-4 py-3 border border-gray-200 text-right bg-green-50">{summary.best.total_nru.toLocaleString()}</td>
                <td className="px-4 py-3 border border-gray-200 text-right bg-blue-50">{summary.normal.total_nru.toLocaleString()}</td>
                <td className="px-4 py-3 border border-gray-200 text-right bg-red-50">{summary.worst.total_nru.toLocaleString()}</td>
              </tr>
              <tr>
                <td className="px-4 py-3 border border-gray-200">Peak DAU</td>
                <td className="px-4 py-3 border border-gray-200 text-right bg-green-50">{summary.best.peak_dau.toLocaleString()}</td>
                <td className="px-4 py-3 border border-gray-200 text-right bg-blue-50">{summary.normal.peak_dau.toLocaleString()}</td>
                <td className="px-4 py-3 border border-gray-200 text-right bg-red-50">{summary.worst.peak_dau.toLocaleString()}</td>
              </tr>
              <tr>
                <td className="px-4 py-3 border border-gray-200">평균 DAU</td>
                <td className="px-4 py-3 border border-gray-200 text-right bg-green-50">{summary.best.average_dau.toLocaleString()}</td>
                <td className="px-4 py-3 border border-gray-200 text-right bg-blue-50">{summary.normal.average_dau.toLocaleString()}</td>
                <td className="px-4 py-3 border border-gray-200 text-right bg-red-50">{summary.worst.average_dau.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 3: Financial Analysis (BEP 차트 + ROAS) */}
      {basicSettings?.launch_mkt_budget && basicSettings.launch_mkt_budget > 0 && (
        <section className="bg-white rounded-xl border border-orange-200 overflow-hidden">
          <div className="bg-orange-100 px-6 py-4 border-b border-orange-200">
            <h2 className="text-xl font-bold text-orange-800">💰 Section 3: Financial Analysis</h2>
          </div>
          <div className="p-6 space-y-6">
            {/* V8 #3: BEP 시각화 차트 */}
            <div>
              <h3 className="font-semibold text-gray-700 mb-3">BEP Analysis Chart (Normal 시나리오)</h3>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={bepChartData.filter((_, i) => i < 180)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" label={{ value: 'Day', position: 'bottom' }} />
                    <YAxis tickFormatter={(v) => formatCompactKorean(v)} width={80} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    <Legend />
                    <Line type="monotone" dataKey="cumRevenue" stroke="#22c55e" strokeWidth={2} name="누적 매출" dot={false} />
                    <Line type="monotone" dataKey="cumCost" stroke="#ef4444" strokeWidth={2} name="누적 비용" dot={false} />
                    {bepDay > 0 && bepDay < 180 && (
                      <Line type="monotone" dataKey={(d: any) => d.isBep ? d.cumRevenue : null} stroke="#8b5cf6" strokeWidth={0} dot={{ r: 8, fill: '#8b5cf6' }} name={`BEP (D+${bepDay})`} />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
              {bepDay > 0 && (
                <div className="mt-3 p-3 bg-violet-50 rounded-lg border border-violet-200 text-center">
                  <span className="text-violet-800 font-semibold">🎯 손익분기점 도달 예상: </span>
                  <span className="text-violet-900 font-bold text-lg">D+{bepDay}</span>
                  <span className="text-violet-600 text-sm ml-2">({Math.round(bepDay / 30)}개월차)</span>
                </div>
              )}
            </div>

            {/* ROAS 테이블 */}
            <div>
              <h3 className="font-semibold text-gray-700 mb-3">LTV & ROAS Analysis</h3>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-4 py-3 text-left border border-gray-200 font-semibold">지표</th>
                    <th className="px-4 py-3 text-right border border-gray-200 bg-green-50 font-semibold">Best</th>
                    <th className="px-4 py-3 text-right border border-gray-200 bg-blue-50 font-semibold">Normal</th>
                    <th className="px-4 py-3 text-right border border-gray-200 bg-red-50 font-semibold">Worst</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-4 py-3 border border-gray-200">LTV (유저당 수익)</td>
                    <td className="px-4 py-3 border border-gray-200 text-right bg-green-50">{formatCurrency(ltvRoas.best.ltv)}</td>
                    <td className="px-4 py-3 border border-gray-200 text-right bg-blue-50">{formatCurrency(ltvRoas.normal.ltv)}</td>
                    <td className="px-4 py-3 border border-gray-200 text-right bg-red-50">{formatCurrency(ltvRoas.worst.ltv)}</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 border border-gray-200">CAC (유저 획득 비용)</td>
                    <td className="px-4 py-3 border border-gray-200 text-right bg-green-50">{formatCurrency(ltvRoas.best.cac)}</td>
                    <td className="px-4 py-3 border border-gray-200 text-right bg-blue-50">{formatCurrency(ltvRoas.normal.cac)}</td>
                    <td className="px-4 py-3 border border-gray-200 text-right bg-red-50">{formatCurrency(ltvRoas.worst.cac)}</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 border border-gray-200 font-medium">ROAS (광고 회수율)</td>
                    <td className="px-4 py-3 border border-gray-200 text-right bg-green-50 font-bold text-green-700">{ltvRoas.best.roas.toLocaleString()}%</td>
                    <td className="px-4 py-3 border border-gray-200 text-right bg-blue-50 font-bold text-blue-700">{ltvRoas.normal.roas.toLocaleString()}%</td>
                    <td className="px-4 py-3 border border-gray-200 text-right bg-red-50 font-bold text-red-700">{ltvRoas.worst.roas.toLocaleString()}%</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 border border-gray-200">손익분기점 (BEP)</td>
                    <td className="px-4 py-3 border border-gray-200 text-right bg-green-50">{ltvRoas.best.breakEvenDay > 0 ? `D+${ltvRoas.best.breakEvenDay}` : '-'}</td>
                    <td className="px-4 py-3 border border-gray-200 text-right bg-blue-50">{ltvRoas.normal.breakEvenDay > 0 ? `D+${ltvRoas.normal.breakEvenDay}` : '-'}</td>
                    <td className="px-4 py-3 border border-gray-200 text-right bg-red-50">{ltvRoas.worst.breakEvenDay > 0 ? `D+${ltvRoas.worst.breakEvenDay}` : '-'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Section 4: 산정 근거 */}
      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="bg-gray-100 px-6 py-4 border-b">
          <h2 className="text-xl font-bold text-gray-800">📐 Section 4: Calculation Basis</h2>
        </div>
        <div className="p-6">
          {results.blending && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-xs text-blue-600">블렌딩 비율</p>
                <p className="font-semibold text-blue-800">내부 {(results.blending.weight_internal * 100).toFixed(0)}% : 벤치마크 {(results.blending.weight_benchmark * 100).toFixed(0)}%</p>
              </div>
              <div className="p-3 bg-violet-50 rounded-lg border border-violet-200">
                <p className="text-xs text-violet-600">품질 등급</p>
                <p className="font-semibold text-violet-800">{results.v7_settings?.quality_score || 'B'}급 (×{results.v7_settings?.quality_multiplier || 1.0})</p>
              </div>
              <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-200">
                <p className="text-xs text-indigo-600">BM 타입</p>
                <p className="font-semibold text-indigo-800">{results.v7_settings?.bm_type || 'Midcore'}</p>
              </div>
              <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                <p className="text-xs text-green-600">지역</p>
                <p className="font-semibold text-green-800">{results.v7_settings?.regions?.join(', ') || 'Global'}</p>
              </div>
            </div>
          )}
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
      </section>

      {/* 벤치마크 100% 경고 */}
      {results.blending?.benchmark_only && (
        <div className="bg-amber-50 border-2 border-amber-400 rounded-xl p-4 flex items-start gap-3">
          <span className="text-2xl">⚠️</span>
          <div>
            <h3 className="font-bold text-amber-800 mb-1">시장 평균 데이터만 사용되었습니다</h3>
            <p className="text-sm text-amber-700">
              표본 게임이 선택되지 않아 벤치마크 100%로 계산되었습니다. 
              더 정확한 프로젝션을 위해 유사 게임을 표본으로 선택해주세요.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

const RetentionTab: React.FC<{ results: ProjectionResult }> = ({ results }) => {
  const [showTable, setShowTable] = useState(false);
  const chartData = results.results.best.retention.curve.map((_, i) => ({ day: i + 1, best: results.results.best.retention.curve[i] * 100, normal: results.results.normal.retention.curve[i] * 100, worst: results.results.worst.retention.curve[i] * 100 }));
  const tableData = results.results.best.full_data.retention.map((_, i) => ({ day: `D+${i + 1}`, best: (results.results.best.full_data.retention[i] * 100).toFixed(1), normal: (results.results.normal.full_data.retention[i] * 100).toFixed(1), worst: (results.results.worst.full_data.retention[i] * 100).toFixed(1) }));
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
      <div className="bg-white rounded-xl border p-6"><h3 className="text-lg font-semibold mb-4">NRU 추이 (D1~D90)</h3><div className="h-80"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="day" /><YAxis tickFormatter={(v) => formatCompactKorean(v)} width={80} /><Tooltip formatter={(v: number) => [formatNumber(v), '']} /><Legend /><Area type="monotone" dataKey="best" stroke={COLORS.best} fill={COLORS.best} fillOpacity={0.2} name="Best" /><Area type="monotone" dataKey="normal" stroke={COLORS.normal} fill={COLORS.normal} fillOpacity={0.2} name="Normal" /><Area type="monotone" dataKey="worst" stroke={COLORS.worst} fill={COLORS.worst} fillOpacity={0.2} name="Worst" /></AreaChart></ResponsiveContainer></div></div>
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
      <div className="bg-white rounded-xl border p-6"><h3 className="text-lg font-semibold mb-4">일별 매출 (D1~D90)</h3><div className="h-80"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="day" /><YAxis tickFormatter={(v) => formatCompactKorean(v)} width={80} /><Tooltip formatter={(v: number) => [formatCurrency(v), '']} /><Legend /><Area type="monotone" dataKey="best" stroke={COLORS.best} fill={COLORS.best} fillOpacity={0.2} name="Best" /><Area type="monotone" dataKey="normal" stroke={COLORS.normal} fill={COLORS.normal} fillOpacity={0.2} name="Normal" /><Area type="monotone" dataKey="worst" stroke={COLORS.worst} fill={COLORS.worst} fillOpacity={0.2} name="Worst" /></AreaChart></ResponsiveContainer></div></div>
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
      <div className="bg-white rounded-xl border p-6"><h3 className="text-lg font-semibold mb-4">통합 KPI 추이</h3><div className="h-96"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={chartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="day" /><YAxis yAxisId="left" tickFormatter={(v) => formatCompactKorean(v)} width={80} /><YAxis yAxisId="right" orientation="right" tickFormatter={(v) => formatCompactKorean(v)} width={80} /><Tooltip /><Legend /><Bar yAxisId="left" dataKey="dau_normal" fill={COLORS.normal} name="DAU" opacity={0.7} /><Line yAxisId="right" type="monotone" dataKey="revenue_best" stroke={COLORS.best} name="Revenue (Best)" dot={false} /><Line yAxisId="right" type="monotone" dataKey="revenue_normal" stroke={COLORS.normal} name="Revenue (Normal)" dot={false} /><Line yAxisId="right" type="monotone" dataKey="revenue_worst" stroke={COLORS.worst} name="Revenue (Worst)" dot={false} /></ComposedChart></ResponsiveContainer></div></div>
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
      <div className="bg-white rounded-xl border p-6"><h3 className="text-lg font-semibold mb-4">DAU 추이</h3><div className="h-80"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="day" /><YAxis tickFormatter={(v) => formatCompactKorean(v)} width={80} /><Tooltip formatter={(v: number) => formatNumber(v)} /><Legend /><Area type="monotone" dataKey="best" stroke={COLORS.best} fill={COLORS.best} fillOpacity={0.2} name="Best" /><Area type="monotone" dataKey="normal" stroke={COLORS.normal} fill={COLORS.normal} fillOpacity={0.2} name="Normal" /><Area type="monotone" dataKey="worst" stroke={COLORS.worst} fill={COLORS.worst} fillOpacity={0.2} name="Worst" /></AreaChart></ResponsiveContainer></div></div>
      <div className="border rounded-lg overflow-hidden"><div className="bg-gray-100 px-4 py-2 flex justify-between"><span className="font-semibold">상세 테이블</span><div className="flex gap-2"><button onClick={() => setShowTable(!showTable)} className="text-sm text-blue-600">{showTable ? '접기' : '펼치기'}</button><button onClick={() => downloadCSV(tableData, 'dau.csv', ['day', 'best', 'normal', 'worst'])} className="flex items-center gap-1 text-sm bg-green-600 text-white px-3 py-1 rounded"><Download className="w-4 h-4" />CSV</button></div></div>{showTable && <div className="max-h-96 overflow-y-auto"><table className="w-full text-xs"><thead className="bg-gray-50 sticky top-0"><tr><th className="px-3 py-2 text-left border-b">Day</th><th className="px-3 py-2 text-right border-b bg-green-50">Best</th><th className="px-3 py-2 text-right border-b bg-blue-50">Normal</th><th className="px-3 py-2 text-right border-b bg-red-50">Worst</th></tr></thead><tbody>{tableData.slice(0, 365).map((r, i) => <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}><td className="px-3 py-1 border-b">{r.day}</td><td className="px-3 py-1 border-b text-right">{formatNumber(r.best)}</td><td className="px-3 py-1 border-b text-right">{formatNumber(r.normal)}</td><td className="px-3 py-1 border-b text-right">{formatNumber(r.worst)}</td></tr>)}</tbody></table></div>}</div>
    </div>
  );
};

const RawDataTab: React.FC<{ games: GameListResponse | null }> = ({ games }) => {
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  if (!games) return null;
  
  const API_BASE = import.meta.env.VITE_API_URL || 'https://game-kpi-projection.onrender.com/api';
  
  const handleExcelDownload = async () => {
    setDownloading(true);
    try {
      const response = await fetch(`${API_BASE}/raw-data/download`);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`다운로드 실패: ${response.status} - ${errorText}`);
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'raw_game_data.xlsx';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error: any) {
      console.error('Excel download error:', error);
      alert(`엑셀 다운로드 중 오류: ${error.message}`);
    } finally {
      setDownloading(false);
    }
  };
  
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };
  
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.name.endsWith('.csv')) {
      alert('CSV 파일만 업로드 가능합니다. (.csv)');
      return;
    }
    
    const metric = prompt('업로드할 지표 유형을 입력하세요:\nretention, nru, payment_rate, arppu 중 하나', 'retention');
    if (!metric || !['retention', 'nru', 'payment_rate', 'arppu'].includes(metric)) {
      alert('올바른 지표 유형을 입력해주세요.');
      return;
    }
    
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch(`${API_BASE}/raw-data/upload?metric=${metric}`, {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || '업로드 실패');
      }
      
      const result = await response.json();
      alert(`업로드 성공: ${result.message}\n페이지를 새로고침하면 반영됩니다.`);
      window.location.reload();
    } catch (error: any) {
      console.error('Upload error:', error);
      alert(`업로드 중 오류: ${error.message}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };
  
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Raw Data 관리</h3>
          <div className="flex gap-2">
            <button 
              onClick={handleExcelDownload} 
              disabled={downloading}
              className="flex items-center gap-1 text-sm bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-50"
            >
              {downloading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {downloading ? '다운로드 중...' : '전체 엑셀 다운로드'}
            </button>
            <button 
              onClick={handleUploadClick}
              disabled={uploading}
              className="flex items-center gap-1 text-sm bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {uploading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
              {uploading ? '업로드 중...' : '새 데이터 업로드 (CSV)'}
            </button>
            <input 
              ref={fileInputRef}
              type="file" 
              accept=".csv" 
              onChange={handleFileChange}
              className="hidden"
            />
          </div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm">
          <p className="text-amber-800"><strong>📌 데이터 관리 안내:</strong></p>
          <ul className="text-amber-700 mt-1 space-y-1">
            <li>• <strong>다운로드:</strong> Raw_Retention, Raw_NRU, Raw_PR, Raw_ARPPU 시트가 포함된 엑셀 파일</li>
            <li>• <strong>업로드:</strong> CSV 형식만 지원 (첫 열: 게임명, 이후 열: 일별 데이터)</li>
            <li>• <strong>GitHub 업로드:</strong> data/raw_game_data.json 파일 직접 수정 후 커밋</li>
          </ul>
        </div>
        <div className="grid grid-cols-2 gap-6">
          {[{ key: 'retention', label: 'Retention', data: games.retention }, { key: 'nru', label: 'NRU', data: games.nru }, { key: 'payment_rate', label: 'Payment Rate', data: games.payment_rate }, { key: 'arppu', label: 'ARPPU', data: games.arppu }].map(({ key, label, data }) => (
            <div key={key} className="border rounded-lg overflow-hidden">
              <div className="bg-gray-100 px-3 py-2 flex justify-between"><span className="font-medium">{label} ({data.length}개)</span></div>
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
