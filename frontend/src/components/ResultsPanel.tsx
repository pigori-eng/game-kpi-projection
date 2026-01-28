
import { TrendingUp, Shield, DollarSign, AlertTriangle, Target } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area, ComposedChart, Bar } from 'recharts';
import type { ProjectionResult, TabType, GameListResponse, BasicSettings } from '../types';

interface ResultsPanelProps {
  results: ProjectionResult;
  activeTab: TabType;
  games: GameListResponse | null;
  basicSettings?: BasicSettings;
}

const COLORS = { best: '#22c55e', normal: '#3b82f6', worst: '#ef4444' };
const formatNum = (n: number): string => n.toLocaleString('ko-KR');
const formatCurrency = (n: number): string => {
  if (n >= 1e12) return (n / 1e12).toFixed(1) + '조원';
  if (n >= 1e8) return (n / 1e8).toFixed(1) + '억원';
  if (n >= 1e4) return (n / 1e4).toFixed(0) + '만원';
  return formatNum(Math.round(n)) + '원';
};

const ComprehensiveReport: React.FC<{ results: ProjectionResult; basicSettings?: BasicSettings }> = ({ results, basicSettings }) => {
  const { summary } = results;
  
  const calculateFinancials = (scenario: 'best' | 'normal' | 'worst') => {
    const s = summary[scenario];
    const mktBudget = basicSettings?.launch_mkt_budget || 0;
    const hrCostMonthly = ((basicSettings?.hr_direct_headcount || 50) * 15000000) + ((basicSettings?.hr_indirect_headcount || 20) * 14000000);
    const sustainingRatio = basicSettings?.sustaining_mkt_ratio || 0.07;
    const infraRatio = basicSettings?.infrastructure_cost_ratio || 0.03;
    const marketFee = basicSettings?.market_fee_ratio || 0.30;
    const vat = basicSettings?.vat_ratio || 0.10;
    const totalNru = s.total_nru || 1;
    const ltv = s.gross_revenue / totalNru;
    const cac = mktBudget / totalNru;
    const dailyRevenue = results.results[scenario].revenue.daily_revenue;
    const projectionDays = dailyRevenue.length;
    let cumRevenue = 0;
    let cumCost = mktBudget;
    let breakEvenDay = 0;
    for (let i = 0; i < projectionDays; i++) {
      const dailyGross = dailyRevenue[i];
      const dailyNet = dailyGross * (1 - marketFee - vat);
      cumRevenue += dailyNet;
      const dailyHR = hrCostMonthly / 30;
      const dailySustaining = dailyGross * sustainingRatio;
      const dailyInfra = dailyGross * infraRatio;
      cumCost += dailyHR + dailySustaining + dailyInfra;
      if (cumRevenue >= cumCost && breakEvenDay === 0) { breakEvenDay = i + 1; }
    }
    const totalCost = cumCost;
    const totalNetRevenue = s.gross_revenue * (1 - marketFee - vat);
    const roas = totalCost > 0 ? (totalNetRevenue / totalCost) * 100 : 0;
    const netProfit = totalNetRevenue - totalCost;
    return { ltv, cac, roas, breakEvenDay, totalCost, totalNetRevenue, netProfit };
  };

  const fin = { best: calculateFinancials('best'), normal: calculateFinancials('normal'), worst: calculateFinancials('worst') };

  const calculateReliabilityGrade = () => {
    let score = 0;
    const checks: { item: string; passed: boolean; note: string }[] = [];
    const sampleCount = results.input.retention_games.length;
    if (sampleCount >= 3) { score += 20; checks.push({ item: '표본 게임 수', passed: true, note: sampleCount + '개 선택' }); }
    else if (sampleCount >= 1) { score += 10; checks.push({ item: '표본 게임 수', passed: false, note: sampleCount + '개 (3개 권장)' }); }
    else { checks.push({ item: '표본 게임 수', passed: false, note: '미선택' }); }
    if (basicSettings?.launch_mkt_budget && basicSettings.launch_mkt_budget > 0) { score += 20; checks.push({ item: 'MKT 예산 설정', passed: true, note: formatCurrency(basicSettings.launch_mkt_budget) }); }
    else { checks.push({ item: 'MKT 예산 설정', passed: false, note: '미설정' }); }
    const d1Normal = results.results.normal.retention.target_d1 * 100;
    if (d1Normal >= 25 && d1Normal <= 55) { score += 20; checks.push({ item: 'D1 Retention 범위', passed: true, note: d1Normal.toFixed(1) + '% (정상)' }); }
    else { score += 5; checks.push({ item: 'D1 Retention 범위', passed: false, note: d1Normal.toFixed(1) + '% (비정상)' }); }
    if (summary.normal.total_nru > 0) { score += 20; checks.push({ item: 'NRU 설정', passed: true, note: formatNum(summary.normal.total_nru) + '명' }); }
    else { checks.push({ item: 'NRU 설정', passed: false, note: '미설정' }); }
    if (fin.normal.roas >= 100) { score += 20; checks.push({ item: 'ROAS 달성', passed: true, note: fin.normal.roas.toFixed(0) + '%' }); }
    else if (fin.normal.roas >= 70) { score += 10; checks.push({ item: 'ROAS 달성', passed: false, note: fin.normal.roas.toFixed(0) + '% (위험)' }); }
    else { checks.push({ item: 'ROAS 달성', passed: false, note: fin.normal.roas.toFixed(0) + '% (적자)' }); }
    let grade = 'F';
    if (score >= 90) grade = 'A';
    else if (score >= 75) grade = 'B';
    else if (score >= 60) grade = 'C';
    else if (score >= 40) grade = 'D';
    return { grade, score, checks };
  };

  const reliability = calculateReliabilityGrade();

  const getRiskAnalysis = () => {
    const risks: { level: 'high' | 'medium' | 'low'; title: string; description: string; mitigation: string }[] = [];
    if (fin.worst.netProfit < 0) { risks.push({ level: 'high', title: 'Worst 케이스 적자', description: 'Worst 시나리오에서 ' + formatCurrency(Math.abs(fin.worst.netProfit)) + ' 적자 예상', mitigation: 'CPI 최적화, 론칭 MKT 예산 단계적 집행' }); }
    if (fin.normal.breakEvenDay === 0 || fin.normal.breakEvenDay > results.input.projection_days) { risks.push({ level: 'high', title: 'BEP 미달성', description: '프로젝션 기간 내 손익분기점 도달 불가', mitigation: 'MKT 예산 축소 또는 ARPPU 개선' }); }
    const d7Retention = results.results.normal.retention.curve[6] || 0;
    if (d7Retention < 0.15) { risks.push({ level: 'medium', title: '낮은 D7 리텐션', description: 'D7 리텐션 ' + (d7Retention * 100).toFixed(1) + '%', mitigation: '초반 온보딩 개선' }); }
    return risks;
  };

  const risks = getRiskAnalysis();

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-xl p-5 text-white">
        <h2 className="text-xl font-bold mb-1">📊 KPI 프로젝션 종합 보고서</h2>
        <p className="text-blue-100 text-sm">런칭일: {results.input.launch_date} | 기간: {results.input.projection_days}일</p>
      </div>

      <div className="border border-gray-300 rounded-lg overflow-hidden">
        <div className="bg-blue-100 px-4 py-2 border-b flex items-center gap-2"><Target className="w-5 h-5 text-blue-700" /><span className="font-semibold text-blue-800">1. Executive Summary</span></div>
        <div className="p-4 bg-blue-50 text-sm space-y-2">
          <p>• <strong>예상 총 매출:</strong> Normal <span className="text-blue-700 font-bold">{formatCurrency(summary.normal.gross_revenue)}</span> (Best: {formatCurrency(summary.best.gross_revenue)} / Worst: {formatCurrency(summary.worst.gross_revenue)})</p>
          <p>• <strong>예상 순이익:</strong> Normal <span className={fin.normal.netProfit >= 0 ? 'text-green-700 font-bold' : 'text-red-700 font-bold'}>{formatCurrency(fin.normal.netProfit)}</span></p>
          <p>• <strong>ROAS:</strong> Normal <span className={fin.normal.roas >= 100 ? 'text-green-700 font-bold' : 'text-red-700 font-bold'}>{fin.normal.roas.toFixed(0)}%</span></p>
        </div>
      </div>

      <div className="border border-gray-300 rounded-lg overflow-hidden">
        <div className="bg-purple-100 px-4 py-2 border-b flex items-center gap-2"><Shield className="w-5 h-5 text-purple-700" /><span className="font-semibold text-purple-800">2. 신뢰도 평가</span></div>
        <div className="p-4">
          <div className="flex items-center gap-6 mb-4">
            <div className={'w-20 h-20 rounded-full flex items-center justify-center text-3xl font-bold text-white ' + (reliability.grade === 'A' ? 'bg-green-500' : reliability.grade === 'B' ? 'bg-blue-500' : reliability.grade === 'C' ? 'bg-yellow-500' : reliability.grade === 'D' ? 'bg-orange-500' : 'bg-red-500')}>{reliability.grade}</div>
            <div><p className="text-lg font-medium">신뢰도: <span className="text-blue-700">{reliability.score}/100</span></p></div>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left border-b">항목</th><th className="px-3 py-2 text-center border-b w-20">상태</th><th className="px-3 py-2 text-left border-b">비고</th></tr></thead>
            <tbody>{reliability.checks.map((c, i) => <tr key={i} className={i < reliability.checks.length - 1 ? 'border-b' : ''}><td className="px-3 py-2">{c.item}</td><td className="px-3 py-2 text-center"><span className={'px-2 py-0.5 rounded text-xs ' + (c.passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700')}>{c.passed ? '✓' : '✗'}</span></td><td className="px-3 py-2 text-gray-600">{c.note}</td></tr>)}</tbody>
          </table>
        </div>
      </div>

      <div className="border border-gray-300 rounded-lg overflow-hidden">
        <div className="bg-green-100 px-4 py-2 border-b flex items-center gap-2"><DollarSign className="w-5 h-5 text-green-700" /><span className="font-semibold text-green-800">3. 매출 및 ROAS 분석</span></div>
        <table className="w-full text-sm">
          <thead><tr className="bg-gray-50"><th className="px-3 py-2 text-left border-b">지표</th><th className="px-3 py-2 text-right border-b bg-green-50 text-green-700">Best</th><th className="px-3 py-2 text-right border-b bg-blue-50 text-blue-700">Normal</th><th className="px-3 py-2 text-right border-b bg-red-50 text-red-700">Worst</th></tr></thead>
          <tbody>
            <tr className="border-b"><td className="px-3 py-2 font-medium">Gross Revenue</td><td className="px-3 py-2 text-right bg-green-50 font-bold">{formatCurrency(summary.best.gross_revenue)}</td><td className="px-3 py-2 text-right bg-blue-50 font-bold">{formatCurrency(summary.normal.gross_revenue)}</td><td className="px-3 py-2 text-right bg-red-50 font-bold">{formatCurrency(summary.worst.gross_revenue)}</td></tr>
            <tr className="border-b"><td className="px-3 py-2">Net Revenue</td><td className="px-3 py-2 text-right bg-green-50">{formatCurrency(fin.best.totalNetRevenue)}</td><td className="px-3 py-2 text-right bg-blue-50">{formatCurrency(fin.normal.totalNetRevenue)}</td><td className="px-3 py-2 text-right bg-red-50">{formatCurrency(fin.worst.totalNetRevenue)}</td></tr>
            <tr className="border-b"><td className="px-3 py-2">총 비용</td><td className="px-3 py-2 text-right bg-green-50">{formatCurrency(fin.best.totalCost)}</td><td className="px-3 py-2 text-right bg-blue-50">{formatCurrency(fin.normal.totalCost)}</td><td className="px-3 py-2 text-right bg-red-50">{formatCurrency(fin.worst.totalCost)}</td></tr>
            <tr className="border-b"><td className="px-3 py-2 font-medium">순이익</td><td className={'px-3 py-2 text-right bg-green-50 font-bold ' + (fin.best.netProfit >= 0 ? 'text-green-700' : 'text-red-700')}>{formatCurrency(fin.best.netProfit)}</td><td className={'px-3 py-2 text-right bg-blue-50 font-bold ' + (fin.normal.netProfit >= 0 ? 'text-blue-700' : 'text-red-700')}>{formatCurrency(fin.normal.netProfit)}</td><td className={'px-3 py-2 text-right bg-red-50 font-bold ' + (fin.worst.netProfit >= 0 ? 'text-green-700' : 'text-red-700')}>{formatCurrency(fin.worst.netProfit)}</td></tr>
            <tr className="border-b"><td className="px-3 py-2">LTV</td><td className="px-3 py-2 text-right bg-green-50">{formatCurrency(fin.best.ltv)}</td><td className="px-3 py-2 text-right bg-blue-50">{formatCurrency(fin.normal.ltv)}</td><td className="px-3 py-2 text-right bg-red-50">{formatCurrency(fin.worst.ltv)}</td></tr>
            <tr className="border-b"><td className="px-3 py-2">CAC</td><td className="px-3 py-2 text-right bg-green-50">{formatCurrency(fin.best.cac)}</td><td className="px-3 py-2 text-right bg-blue-50">{formatCurrency(fin.normal.cac)}</td><td className="px-3 py-2 text-right bg-red-50">{formatCurrency(fin.worst.cac)}</td></tr>
            <tr className="border-b"><td className="px-3 py-2 font-medium">ROAS</td><td className={'px-3 py-2 text-right bg-green-50 font-bold ' + (fin.best.roas >= 100 ? 'text-green-700' : 'text-red-700')}>{fin.best.roas.toFixed(0)}%</td><td className={'px-3 py-2 text-right bg-blue-50 font-bold ' + (fin.normal.roas >= 100 ? 'text-blue-700' : 'text-red-700')}>{fin.normal.roas.toFixed(0)}%</td><td className={'px-3 py-2 text-right bg-red-50 font-bold ' + (fin.worst.roas >= 100 ? 'text-green-700' : 'text-red-700')}>{fin.worst.roas.toFixed(0)}%</td></tr>
            <tr><td className="px-3 py-2 font-medium">BEP</td><td className="px-3 py-2 text-right bg-green-50 font-medium">{fin.best.breakEvenDay > 0 ? 'D+' + formatNum(fin.best.breakEvenDay) : '미달성'}</td><td className="px-3 py-2 text-right bg-blue-50 font-medium">{fin.normal.breakEvenDay > 0 ? 'D+' + formatNum(fin.normal.breakEvenDay) : '미달성'}</td><td className="px-3 py-2 text-right bg-red-50 font-medium">{fin.worst.breakEvenDay > 0 ? 'D+' + formatNum(fin.worst.breakEvenDay) : '미달성'}</td></tr>
          </tbody>
        </table>
        <div className="p-3 bg-gray-50 text-xs text-gray-600">
          <p><strong>계산식:</strong> Net Revenue = Gross × (1 - 마켓수수료 - VAT) | ROAS = Net Revenue ÷ 총비용 × 100</p>
        </div>
      </div>

      <div className="border border-gray-300 rounded-lg overflow-hidden">
        <div className="bg-red-100 px-4 py-2 border-b flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-red-700" /><span className="font-semibold text-red-800">4. 리스크 & 대응</span></div>
        <div className="p-4">{risks.length > 0 ? <div className="space-y-3">{risks.map((r, i) => <div key={i} className={'p-3 rounded-lg border ' + (r.level === 'high' ? 'bg-red-50 border-red-200' : 'bg-yellow-50 border-yellow-200')}><div className="flex items-center gap-2 mb-1"><span className={'px-2 py-0.5 rounded text-xs font-medium ' + (r.level === 'high' ? 'bg-red-200 text-red-800' : 'bg-yellow-200 text-yellow-800')}>{r.level === 'high' ? '⚠️ 높음' : '⚡ 보통'}</span><span className="font-medium text-sm">{r.title}</span></div><p className="text-sm text-gray-700 mb-1">{r.description}</p><p className="text-xs text-gray-600"><strong>대응:</strong> {r.mitigation}</p></div>)}</div> : <p className="text-sm text-green-700">✅ 주요 리스크 없음</p>}</div>
      </div>

      <div className="border border-gray-300 rounded-lg overflow-hidden">
        <div className="bg-gray-100 px-4 py-2 border-b flex items-center gap-2"><TrendingUp className="w-5 h-5 text-gray-700" /><span className="font-semibold">5. 핵심 KPI</span></div>
        <table className="w-full text-sm">
          <thead><tr className="bg-gray-50"><th className="px-3 py-2 text-left border-b">지표</th><th className="px-3 py-2 text-right border-b bg-green-50 text-green-700">Best</th><th className="px-3 py-2 text-right border-b bg-blue-50 text-blue-700">Normal</th><th className="px-3 py-2 text-right border-b bg-red-50 text-red-700">Worst</th></tr></thead>
          <tbody>
            <tr className="border-b"><td className="px-3 py-2">총 NRU</td><td className="px-3 py-2 text-right bg-green-50">{formatNum(summary.best.total_nru)}</td><td className="px-3 py-2 text-right bg-blue-50">{formatNum(summary.normal.total_nru)}</td><td className="px-3 py-2 text-right bg-red-50">{formatNum(summary.worst.total_nru)}</td></tr>
            <tr className="border-b"><td className="px-3 py-2">Peak DAU</td><td className="px-3 py-2 text-right bg-green-50">{formatNum(summary.best.peak_dau)}</td><td className="px-3 py-2 text-right bg-blue-50">{formatNum(summary.normal.peak_dau)}</td><td className="px-3 py-2 text-right bg-red-50">{formatNum(summary.worst.peak_dau)}</td></tr>
            <tr className="border-b"><td className="px-3 py-2">평균 DAU</td><td className="px-3 py-2 text-right bg-green-50">{formatNum(summary.best.average_dau)}</td><td className="px-3 py-2 text-right bg-blue-50">{formatNum(summary.normal.average_dau)}</td><td className="px-3 py-2 text-right bg-red-50">{formatNum(summary.worst.average_dau)}</td></tr>
            <tr><td className="px-3 py-2">일평균 매출</td><td className="px-3 py-2 text-right bg-green-50">{formatCurrency(summary.best.average_daily_revenue)}</td><td className="px-3 py-2 text-right bg-blue-50">{formatCurrency(summary.normal.average_daily_revenue)}</td><td className="px-3 py-2 text-right bg-red-50">{formatCurrency(summary.worst.average_daily_revenue)}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

const RetentionTab: React.FC<{ results: ProjectionResult }> = ({ results }) => {
  const chartData = results.results.normal.retention.curve.slice(0, 30).map((val, i) => ({ day: 'D' + (i + 1), best: results.results.best.retention.curve[i] * 100, normal: val * 100, worst: results.results.worst.retention.curve[i] * 100 }));
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border p-4">
        <h3 className="font-semibold mb-4">📈 Retention Curve (D1~D30)</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="day" tick={{ fontSize: 10 }} /><YAxis domain={[0, 60]} tickFormatter={(v) => v + '%'} /><Tooltip formatter={(v: number) => v.toFixed(1) + '%'} /><Legend /><Line type="monotone" dataKey="best" stroke={COLORS.best} name="Best" strokeWidth={2} dot={false} /><Line type="monotone" dataKey="normal" stroke={COLORS.normal} name="Normal" strokeWidth={2} dot={false} /><Line type="monotone" dataKey="worst" stroke={COLORS.worst} name="Worst" strokeWidth={2} dot={false} /></LineChart>
        </ResponsiveContainer>
      </div>
      <div className="border border-gray-300 rounded-lg overflow-hidden">
        <div className="bg-gray-100 px-4 py-2 border-b font-semibold text-sm">리텐션 상세 (소수점 1자리)</div>
        <div className="overflow-x-auto max-h-64">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 sticky top-0"><tr><th className="px-2 py-1.5 border-b">Day</th><th className="px-2 py-1.5 border-b text-green-700 bg-green-50">Best</th><th className="px-2 py-1.5 border-b text-blue-700 bg-blue-50">Normal</th><th className="px-2 py-1.5 border-b text-red-700 bg-red-50">Worst</th></tr></thead>
            <tbody>{results.results.normal.retention.curve.slice(0, 30).map((val, i) => <tr key={i} className={i < 29 ? 'border-b' : ''}><td className="px-2 py-1 text-center font-medium">D{i + 1}</td><td className="px-2 py-1 text-center bg-green-50">{(results.results.best.retention.curve[i] * 100).toFixed(1)}%</td><td className="px-2 py-1 text-center bg-blue-50">{(val * 100).toFixed(1)}%</td><td className="px-2 py-1 text-center bg-red-50">{(results.results.worst.retention.curve[i] * 100).toFixed(1)}%</td></tr>)}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const NRUTab: React.FC<{ results: ProjectionResult }> = ({ results }) => {
  const chartData = results.results.normal.nru.series.slice(0, 90).map((val, i) => ({ day: i + 1, best: results.results.best.nru.series[i], normal: val, worst: results.results.worst.nru.series[i] }));
  return (
    <div className="bg-white rounded-lg border p-4">
      <h3 className="font-semibold mb-4">👥 NRU 추이 (D1~D90)</h3>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={chartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="day" tick={{ fontSize: 10 }} /><YAxis tickFormatter={(v) => formatNum(v)} /><Tooltip formatter={(v: number) => formatNum(v)} /><Legend /><Area type="monotone" dataKey="best" stroke={COLORS.best} fill={COLORS.best} fillOpacity={0.2} name="Best" /><Area type="monotone" dataKey="normal" stroke={COLORS.normal} fill={COLORS.normal} fillOpacity={0.3} name="Normal" /><Area type="monotone" dataKey="worst" stroke={COLORS.worst} fill={COLORS.worst} fillOpacity={0.2} name="Worst" /></AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

const RevenueTab: React.FC<{ results: ProjectionResult }> = ({ results }) => {
  const chartData = results.results.normal.revenue.daily_revenue.slice(0, 90).map((val, i) => ({ day: i + 1, best: results.results.best.revenue.daily_revenue[i], normal: val, worst: results.results.worst.revenue.daily_revenue[i] }));
  return (
    <div className="bg-white rounded-lg border p-4">
      <h3 className="font-semibold mb-4">💰 일별 매출 (D1~D90)</h3>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={chartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="day" tick={{ fontSize: 10 }} /><YAxis tickFormatter={(v) => (v / 1e8).toFixed(0) + '억'} /><Tooltip formatter={(v: number) => formatCurrency(v)} /><Legend /><Bar dataKey="normal" fill={COLORS.normal} name="Normal" opacity={0.7} /><Line type="monotone" dataKey="best" stroke={COLORS.best} name="Best" strokeWidth={2} dot={false} /><Line type="monotone" dataKey="worst" stroke={COLORS.worst} name="Worst" strokeWidth={2} dot={false} /></ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

const DAUTab: React.FC<{ results: ProjectionResult }> = ({ results }) => {
  const chartData = results.results.normal.dau.series.slice(0, 90).map((val, i) => ({ day: i + 1, best: results.results.best.dau.series[i], normal: val, worst: results.results.worst.dau.series[i] }));
  return (
    <div className="bg-white rounded-lg border p-4">
      <h3 className="font-semibold mb-4">📊 DAU 추이 (D1~D90)</h3>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={chartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="day" tick={{ fontSize: 10 }} /><YAxis tickFormatter={(v) => formatNum(v)} /><Tooltip formatter={(v: number) => formatNum(v)} /><Legend /><Area type="monotone" dataKey="best" stroke={COLORS.best} fill={COLORS.best} fillOpacity={0.2} name="Best" /><Area type="monotone" dataKey="normal" stroke={COLORS.normal} fill={COLORS.normal} fillOpacity={0.3} name="Normal" /><Area type="monotone" dataKey="worst" stroke={COLORS.worst} fill={COLORS.worst} fillOpacity={0.2} name="Worst" /></AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

const ResultsPanel: React.FC<ResultsPanelProps> = ({ results, activeTab, games, basicSettings }) => {
  const renderContent = () => {
    switch (activeTab) {
      case 'overview': return <ComprehensiveReport results={results} basicSettings={basicSettings} />;
      case 'retention': return <RetentionTab results={results} />;
      case 'nru': return <NRUTab results={results} />;
      case 'revenue': return <RevenueTab results={results} />;
      case 'projection-dau': return <DAUTab results={results} />;
      default: return <ComprehensiveReport results={results} basicSettings={basicSettings} />;
    }
  };
  return <div className="h-full overflow-y-auto">{renderContent()}</div>;
};

export default ResultsPanel;
