import { useState, useRef } from 'react';
import { Download, FileSpreadsheet, RefreshCw, AlertTriangle, ChevronDown, ChevronUp, Bug } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, AreaChart, Area, ComposedChart, Bar
} from 'recharts';
import type { ProjectionResult, TabType, GameListResponse, BasicSettings, DebugInfo } from '../types';
import { formatNumber, formatCurrency, formatPercent, formatCompactNumber, formatCompactKorean } from '../utils/format';
import AIInsightPanel from './AIInsightPanel';

interface ResultsPanelProps {
  results: ProjectionResult;
  activeTab: TabType;
  games: GameListResponse | null;
  basicSettings?: BasicSettings;
}

const COLORS = { best: '#22c55e', normal: '#3b82f6', worst: '#ef4444' };

// Debug Report 접이식 패널
const DebugReportPanel: React.FC<{ debugInfo?: DebugInfo }> = ({ debugInfo }) => {
  const [isOpen, setIsOpen] = useState(false);
  
  if (!debugInfo) return null;
  
  return (
    <div className="mt-4 border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Bug className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-700">📉 Debug Report (왜 매출이 낮은가요?)</span>
        </div>
        {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      
      {isOpen && (
        <div className="p-4 bg-gray-50 border-t border-gray-200">
          <div className="grid grid-cols-3 gap-3 text-xs">
            {/* Unit Check */}
            <div className="bg-white p-3 rounded border">
              <h4 className="font-medium text-gray-700 mb-2">💰 Unit Check</h4>
              <p className="text-gray-600">
                ARPPU: <span className={`font-mono ${debugInfo.arppu_unit === 'daily' ? 'text-green-600' : 'text-blue-600'}`}>
                  {debugInfo.arppu_unit === 'daily' ? '일간 (원본)' : '월간 (÷30)'}
                </span>
              </p>
              {debugInfo.custom_arppu_used && (
                <p className="text-green-600 mt-1">✓ 사용자 입력값 적용</p>
              )}
            </div>
            
            {/* LiveOps Check */}
            <div className="bg-white p-3 rounded border">
              <h4 className="font-medium text-gray-700 mb-2">🎮 LiveOps</h4>
              <p className="text-gray-600">
                강도: <span className={`font-medium ${
                  debugInfo.liveops_intensity === 'Strong' ? 'text-green-600' :
                  debugInfo.liveops_intensity === 'Medium' ? 'text-blue-600' : 'text-red-600'
                }`}>{debugInfo.liveops_intensity}</span>
              </p>
              <p className="text-gray-500">Floor: {(debugInfo.floor_value * 100).toFixed(0)}% / 최소 {debugInfo.min_sustaining_nru}명</p>
            </div>
            
            {/* D30 Retention Check */}
            <div className="bg-white p-3 rounded border">
              <h4 className="font-medium text-gray-700 mb-2">📈 D30 Retention</h4>
              <p className="text-gray-600">
                계산값: <span className="font-mono">{debugInfo.calculated_d30_retention}%</span>
                {debugInfo.b_was_adjusted && <span className="text-orange-500 ml-1">(보정됨)</span>}
              </p>
              <p className="text-gray-600">
                벤치마크: <span className="font-mono">{debugInfo.benchmark_d30_retention}%</span>
              </p>
              <p className="text-gray-500 text-[10px]">
                b값: {debugInfo.original_b} → {debugInfo.adjusted_b}
              </p>
            </div>
            
            {/* Pre-launch Check */}
            <div className="bg-white p-3 rounded border">
              <h4 className="font-medium text-gray-700 mb-2">🚀 Pre-launch</h4>
              <p className="text-gray-600">
                CPW Ratio: <span className="font-mono">{(debugInfo.cpw_ratio * 100).toFixed(0)}%</span>
              </p>
              <p className="text-gray-500 text-[10px]">
                {debugInfo.cpw_ratio >= 0.3 ? 'PC/Console (위시리스트)' : 'Mobile (사전예약)'}
              </p>
            </div>
            
            {/* 2-Stage & Custom Input */}
            <div className="bg-white p-3 rounded border">
              <h4 className="font-medium text-gray-700 mb-2">⚙️ 설정</h4>
              <p className="text-gray-600">
                2-Stage: <span className={debugInfo.two_stage_retention ? 'text-green-600' : 'text-gray-400'}>
                  {debugInfo.two_stage_retention ? '✓ ON' : '✗ OFF'}
                </span>
              </p>
              <p className="text-gray-600">
                Custom PR: <span className={debugInfo.custom_pr_used ? 'text-green-600' : 'text-gray-400'}>
                  {debugInfo.custom_pr_used ? '✓ 적용' : '벤치마크'}
                </span>
              </p>
            </div>
            
            {/* Package & Platform */}
            <div className="bg-white p-3 rounded border">
              <h4 className="font-medium text-gray-700 mb-2">🎯 Platform</h4>
              <p className="text-gray-600">
                {debugInfo.platforms?.join(', ') || 'N/A'}
              </p>
              {debugInfo.package_price > 0 && (
                <p className="text-green-600 mt-1">
                  패키지: ₩{debugInfo.package_price.toLocaleString()}
                </p>
              )}
            </div>
          </div>
          
          {/* V12.2: NRU Gap & BEP 역산 */}
          <div className="grid grid-cols-2 gap-4 mt-4 border-t pt-4">
            {/* NRU Gap 분석 */}
            <div className="bg-orange-50 p-3 rounded border border-orange-200">
              <div className="font-bold text-orange-800 mb-2 text-xs">📉 NRU 누수 분석</div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-600">예상 (Budget/CPA):</span>
                <span className="font-mono">{debugInfo.ui_expected_paid_nru?.toLocaleString()}명</span>
              </div>
              <div className="flex justify-between text-xs font-bold mt-1">
                <span className="text-gray-700">실제 (엔진반영):</span>
                <span className="font-mono">{debugInfo.actual_paid_nru?.toLocaleString()}명</span>
              </div>
              <div className="text-right text-red-600 mt-2 text-xs font-medium">
                차이: -{debugInfo.nru_gap_percent}% (포화/전환손실)
              </div>
            </div>
            
            {/* BEP 역산 분석 */}
            <div className="bg-blue-50 p-3 rounded border border-blue-200">
              <div className="font-bold text-blue-800 mb-2 text-xs">🎯 BEP 달성 목표</div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-600">현재 예상 DAU:</span>
                <span className="font-mono">{debugInfo.current_avg_dau?.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-xs font-bold mt-1">
                <span className="text-red-700">필요 목표 DAU:</span>
                <span className="font-mono text-red-600">{debugInfo.required_dau_for_bep?.toLocaleString()}</span>
              </div>
              <div className="text-right text-gray-600 mt-2 text-xs">
                갭: <span className={`font-bold ${debugInfo.dau_gap_ratio > 2 ? 'text-red-600' : 'text-orange-600'}`}>
                  {debugInfo.dau_gap_ratio}배 {debugInfo.dau_gap_ratio > 1 ? '부족' : '초과'}
                </span>
              </div>
            </div>
          </div>
          
          {/* V12.3: CPA Saturation & Sustaining */}
          <div className="grid grid-cols-2 gap-4 mt-4 border-t pt-4">
            {/* CPA Saturation */}
            <div className="bg-purple-50 p-3 rounded border border-purple-200">
              <div className="font-bold text-purple-800 mb-2 text-xs">📊 CPA Saturation (마케팅 효율)</div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-600">Saturation Factor:</span>
                <span className={`font-mono font-bold ${(debugInfo.saturation_factor || 1) > 1.2 ? 'text-red-600' : 'text-green-600'}`}>
                  x{(debugInfo.saturation_factor || 1).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-xs mt-1">
                <span className="text-gray-600">Effective CPA:</span>
                <span className="font-mono">₩{(debugInfo.effective_cpa || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-xs mt-1">
                <span className="text-gray-600">Brand 효율 보너스:</span>
                <span className="font-mono text-purple-600">+{debugInfo.brand_efficiency_bonus || 0}%</span>
              </div>
              <p className="text-[10px] text-gray-500 mt-2">* 예산 ↑ → CPA ↑ → NRU ↓ (비용은 그대로)</p>
            </div>
            
            {/* Sustaining Budget */}
            <div className="bg-teal-50 p-3 rounded border border-teal-200">
              <div className="font-bold text-teal-800 mb-2 text-xs">📈 Sustaining NRU (D31~)</div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-600">월 예산:</span>
                <span className="font-mono">₩{(debugInfo.sustaining_budget_monthly || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-xs mt-1">
                <span className="text-gray-600">Paid NRU/일:</span>
                <span className="font-mono text-teal-700 font-bold">+{(debugInfo.sustaining_paid_nru_daily || 0).toLocaleString()}명</span>
              </div>
              <div className="flex justify-between text-xs mt-1">
                <span className="text-gray-600">Organic Floor/일:</span>
                <span className="font-mono">+{(debugInfo.sustaining_organic_floor || 0).toLocaleString()}명</span>
              </div>
              <p className="text-[10px] text-gray-500 mt-2">* 연간 비용: ₩{((debugInfo.sustaining_budget_monthly || 0) * 12).toLocaleString()}</p>
            </div>
          </div>
          
          {/* Seasonality */}
          {debugInfo.seasonality_applied && (
            <div className="mt-3 p-2 bg-purple-50 rounded text-xs">
              🌍 계절성: {debugInfo.seasonality_regions?.map(r => 
                r === 'korea' ? '🇰🇷 한국' : r === 'china' ? '🇨🇳 중국' : r === 'japan' ? '🇯🇵 일본' : '🌐 글로벌'
              ).join(', ')}
            </div>
          )}
          
          <div className="mt-3 p-2 bg-blue-50 rounded text-xs text-blue-700">
            💡 <strong>Tip:</strong> DAU 갭이 크다면 → (1) 마케팅 예산 증액 (2) 2-Stage Retention ON (3) LiveOps Strong (4) PR/ARPPU 상향
          </div>
        </div>
      )}
    </div>
  );
};

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
          {/* 계산 방식 설명 박스 */}
          <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-sm font-semibold text-blue-800 mb-2">📊 지표 계산 방식</p>
            <div className="grid grid-cols-2 gap-3 text-xs text-blue-700">
              <div className="bg-white/70 rounded p-2">
                <strong>Gross Revenue</strong> = Σ(DAU × P.Rate × ARPPU)<br/>
                <span className="text-gray-500">365일간 일별 매출의 총합</span>
              </div>
              <div className="bg-white/70 rounded p-2">
                <strong>Net Revenue</strong> = Gross × (1 - 수수료 - VAT)<br/>
                <span className="text-gray-500">플랫폼 수수료(30%) 및 세금 차감</span>
              </div>
              <div className="bg-white/70 rounded p-2">
                <strong>총 NRU</strong> = UA예산÷CPA × (1+Organic Boost)<br/>
                <span className="text-gray-500">런칭 30일 + Sustaining 기간 유입 합계</span>
              </div>
              <div className="bg-white/70 rounded p-2">
                <strong>DAU</strong> = Σ(NRU[t-k] × Retention[k])<br/>
                <span className="text-gray-500">과거 유입 유저들의 리텐션 누적</span>
              </div>
            </div>
          </div>
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
      {((basicSettings?.launch_mkt_budget && basicSettings.launch_mkt_budget > 0) || (basicSettings?.dev_cost && basicSettings.dev_cost > 0)) && (
        <section className="bg-white rounded-xl border border-orange-200 overflow-hidden">
          <div className="bg-orange-100 px-6 py-4 border-b border-orange-200">
            <h2 className="text-xl font-bold text-orange-800">💰 Section 3: Financial Analysis (BEP)</h2>
          </div>
          <div className="p-6 space-y-6">
            {/* 계산 방식 설명 박스 */}
            <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
              <p className="text-sm font-semibold text-orange-800 mb-2">📊 재무 지표 계산 방식</p>
              <div className="grid grid-cols-2 gap-3 text-xs text-orange-700">
                <div className="bg-white/70 rounded p-2">
                  <strong>LTV (Life Time Value)</strong> = 총 매출 ÷ 총 NRU<br/>
                  <span className="text-gray-500">유저 1명이 365일간 창출하는 평균 수익</span>
                </div>
                <div className="bg-white/70 rounded p-2">
                  <strong>CAC (Customer Acquisition Cost)</strong> = MKT 예산 ÷ 총 NRU<br/>
                  <span className="text-gray-500">유저 1명 획득에 소요된 평균 비용</span>
                </div>
                <div className="bg-white/70 rounded p-2">
                  <strong>Paid ROAS</strong> = (총 매출 ÷ UA 예산) × 100%<br/>
                  <span className="text-gray-500">UA 마케팅만의 효율 (마케터 KPI)</span>
                </div>
                <div className="bg-white/70 rounded p-2">
                  <strong>Blended ROAS</strong> = 총 매출 ÷ (UA+Brand+Sustaining)<br/>
                  <span className="text-gray-500">전체 마케팅 효율 (경영진 KPI)</span>
                </div>
              </div>
            </div>
            
            {/* V9.2: ROI / BEP / 순수익 요약 카드 */}
            <div className="grid grid-cols-3 gap-4">
              {/* ROI Card */}
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="text-sm text-gray-500 mb-1">예상 ROI (Normal)</div>
                <div className={`text-2xl font-bold ${(() => {
                  const totalCost = (basicSettings?.launch_mkt_budget || 0) + (basicSettings?.dev_cost || 0);
                  const roi = totalCost > 0 ? ((summary.normal.gross_revenue - totalCost) / totalCost) * 100 : 0;
                  return roi >= 0 ? 'text-green-600' : 'text-red-500';
                })()}`}>
                  {(() => {
                    const totalCost = (basicSettings?.launch_mkt_budget || 0) + (basicSettings?.dev_cost || 0);
                    const roi = totalCost > 0 ? ((summary.normal.gross_revenue - totalCost) / totalCost) * 100 : 0;
                    return roi.toFixed(1);
                  })()}%
                </div>
              </div>
              {/* BEP Day Card */}
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="text-sm text-gray-500 mb-1">손익분기점 (BEP)</div>
                <div className={`text-2xl font-bold ${bepDay > 0 ? 'text-blue-600' : 'text-red-500'}`}>
                  {bepDay > 0 ? `D+${bepDay}` : "미달성"}
                </div>
                {bepDay <= 0 && <div className="text-xs text-red-400">(Year 1 내)</div>}
              </div>
              {/* Profit Card */}
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="text-sm text-gray-500 mb-1">예상 순수익 (Normal)</div>
                <div className={`text-xl font-bold ${(() => {
                  const totalCost = (basicSettings?.launch_mkt_budget || 0) + (basicSettings?.dev_cost || 0);
                  const profit = summary.normal.gross_revenue - totalCost;
                  return profit >= 0 ? 'text-gray-800' : 'text-red-500';
                })()}`}>
                  {formatCurrency(summary.normal.gross_revenue - ((basicSettings?.launch_mkt_budget || 0) + (basicSettings?.dev_cost || 0)))}
                </div>
              </div>
            </div>
            
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
              {bepDay > 0 ? (
                <div className="mt-3 p-3 bg-violet-50 rounded-lg border border-violet-200 text-center">
                  <span className="text-violet-800 font-semibold">🎯 손익분기점 도달 예상: </span>
                  <span className="text-violet-900 font-bold text-lg">D+{bepDay}</span>
                  <span className="text-violet-600 text-sm ml-2">({Math.round(bepDay / 30)}개월차)</span>
                  <p className="text-xs text-violet-500 mt-1">안정적인 현금 흐름이 기대됩니다.</p>
                </div>
              ) : (
                <div className="mt-3 p-4 bg-red-50 rounded-lg border border-red-300 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-red-800 font-bold text-sm mb-2">⚠️ BEP 달성 실패 경고 (Year 1 내 미도달)</p>
                    <p className="text-red-700 text-xs mb-2">현재 구조로는 1년 내 투자 회수가 어렵습니다. 다음 전략을 검토하세요:</p>
                    <ul className="text-xs text-red-600 space-y-1 mb-3">
                      <li>• <strong>CPA/CPI 절감:</strong> 타겟팅 최적화 또는 오가닉 비중 확대</li>
                      <li>• <strong>LTV 개선:</strong> D30 리텐션을 5%p 올리거나 ARPPU를 15% 상향</li>
                      <li>• <strong>BM 재검토:</strong> 패키지 가격 또는 인게임 결제 모델 조정</li>
                    </ul>
                    <p className="text-xs text-red-500 italic border-t border-red-200 pt-2">
                      💡 <strong>AI 종합 분석 보고서</strong>의 [리스크 분석 및 BEP 달성 전략] 섹션에서 상세 제언을 확인하세요.
                    </p>
                  </div>
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
                    <td className="px-4 py-3 border border-gray-200 text-right bg-green-50">{formatCurrency(summary.best.ltv || ltvRoas.best.ltv)}</td>
                    <td className="px-4 py-3 border border-gray-200 text-right bg-blue-50">{formatCurrency(summary.normal.ltv || ltvRoas.normal.ltv)}</td>
                    <td className="px-4 py-3 border border-gray-200 text-right bg-red-50">{formatCurrency(summary.worst.ltv || ltvRoas.worst.ltv)}</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 border border-gray-200">
                      CAC (UA 기준)
                      <span className="text-xs text-gray-400 ml-1">마케터용</span>
                    </td>
                    <td className="px-4 py-3 border border-gray-200 text-right bg-green-50">{formatCurrency(summary.best.cac_paid || ltvRoas.best.cac)}</td>
                    <td className="px-4 py-3 border border-gray-200 text-right bg-blue-50">{formatCurrency(summary.normal.cac_paid || ltvRoas.normal.cac)}</td>
                    <td className="px-4 py-3 border border-gray-200 text-right bg-red-50">{formatCurrency(summary.worst.cac_paid || ltvRoas.worst.cac)}</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 border border-gray-200">
                      CAC (전체 MKT 기준)
                    </td>
                    <td className="px-4 py-3 border border-gray-200 text-right bg-green-50">{formatCurrency(summary.best.cac_blended || 0)}</td>
                    <td className="px-4 py-3 border border-gray-200 text-right bg-blue-50">{formatCurrency(summary.normal.cac_blended || 0)}</td>
                    <td className="px-4 py-3 border border-gray-200 text-right bg-red-50">{formatCurrency(summary.worst.cac_blended || 0)}</td>
                  </tr>
                  <tr className="bg-green-50/30">
                    <td className="px-4 py-3 border border-gray-200 font-medium">
                      🎯 Paid ROAS (UA 효율)
                      <span className="text-xs text-green-600 ml-1">마케터 KPI</span>
                    </td>
                    <td className="px-4 py-3 border border-gray-200 text-right bg-green-100 font-bold text-green-700">{(summary.best.paid_roas || ltvRoas.best.roas).toFixed(1)}%</td>
                    <td className="px-4 py-3 border border-gray-200 text-right bg-blue-100 font-bold text-blue-700">{(summary.normal.paid_roas || ltvRoas.normal.roas).toFixed(1)}%</td>
                    <td className="px-4 py-3 border border-gray-200 text-right bg-red-100 font-bold text-red-700">{(summary.worst.paid_roas || ltvRoas.worst.roas).toFixed(1)}%</td>
                  </tr>
                  <tr className="bg-purple-50/30">
                    <td className="px-4 py-3 border border-gray-200 font-medium">
                      📊 Blended ROAS (전체 효율)
                    </td>
                    <td className="px-4 py-3 border border-gray-200 text-right bg-green-50 font-bold text-green-700">{(summary.best.blended_roas || 0).toFixed(1)}%</td>
                    <td className="px-4 py-3 border border-gray-200 text-right bg-blue-50 font-bold text-blue-700">{(summary.normal.blended_roas || 0).toFixed(1)}%</td>
                    <td className="px-4 py-3 border border-gray-200 text-right bg-red-50 font-bold text-red-700">{(summary.worst.blended_roas || 0).toFixed(1)}%</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 border border-gray-200">손익분기점 (BEP)</td>
                    <td className="px-4 py-3 border border-gray-200 text-right bg-green-50">{ltvRoas.best.breakEvenDay > 0 ? `D+${ltvRoas.best.breakEvenDay}` : '-'}</td>
                    <td className="px-4 py-3 border border-gray-200 text-right bg-blue-50">{ltvRoas.normal.breakEvenDay > 0 ? `D+${ltvRoas.normal.breakEvenDay}` : '-'}</td>
                    <td className="px-4 py-3 border border-gray-200 text-right bg-red-50">{ltvRoas.worst.breakEvenDay > 0 ? `D+${ltvRoas.worst.breakEvenDay}` : '-'}</td>
                  </tr>
                </tbody>
              </table>
              {/* V8.5 마케팅 분석 표시 */}
              {results.v85_marketing && results.v85_marketing.total_marketing_budget > 0 && (
                <div className="mt-4 p-4 bg-gradient-to-r from-orange-50 to-purple-50 rounded-lg border border-orange-200">
                  <h4 className="font-semibold text-gray-700 mb-2">📊 V8.5 마케팅 예산 분석</h4>
                  <div className="grid grid-cols-4 gap-3 text-sm">
                    <div className="text-center p-2 bg-green-100 rounded">
                      <div className="text-xs text-green-600">UA 예산</div>
                      <div className="font-bold text-green-700">{formatCurrency(results.v85_marketing.ua_budget)}</div>
                      <div className="text-xs text-green-500">{results.v85_marketing.budget_breakdown.ua_ratio}%</div>
                    </div>
                    <div className="text-center p-2 bg-purple-100 rounded">
                      <div className="text-xs text-purple-600">Brand 예산</div>
                      <div className="font-bold text-purple-700">{formatCurrency(results.v85_marketing.brand_budget)}</div>
                      <div className="text-xs text-purple-500">{results.v85_marketing.budget_breakdown.brand_ratio}%</div>
                    </div>
                    <div className="text-center p-2 bg-blue-100 rounded">
                      <div className="text-xs text-blue-600">연간 Sustaining</div>
                      <div className="font-bold text-blue-700">{formatCurrency(results.v85_marketing.sustaining_budget_annual)}</div>
                      <div className="text-xs text-blue-500">{results.v85_marketing.budget_breakdown.sustaining_ratio}%</div>
                    </div>
                    <div className="text-center p-2 bg-orange-100 rounded">
                      <div className="text-xs text-orange-600">Organic Boost</div>
                      <div className="font-bold text-orange-700">{results.v85_marketing.organic_boost_factor}x</div>
                      <div className="text-xs text-orange-500">자연유입 증폭</div>
                    </div>
                  </div>
                </div>
              )}
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

      {/* V12: Debug Report (접이식) */}
      <DebugReportPanel debugInfo={results.debug_info} />
    </div>
  );
};

const RetentionTab: React.FC<{ results: ProjectionResult }> = ({ results }) => {
  const [showTable, setShowTable] = useState(false);
  // D365 전체 데이터 사용
  const chartData = results.results.best.full_data.retention.map((_, i) => ({ day: i + 1, best: results.results.best.full_data.retention[i] * 100, normal: results.results.normal.full_data.retention[i] * 100, worst: results.results.worst.full_data.retention[i] * 100 }));
  const tableData = results.results.best.full_data.retention.map((_, i) => ({ day: `D+${i + 1}`, best: (results.results.best.full_data.retention[i] * 100).toFixed(1), normal: (results.results.normal.full_data.retention[i] * 100).toFixed(1), worst: (results.results.worst.full_data.retention[i] * 100).toFixed(1) }));
  return (
    <div className="space-y-6">
      {/* Retention 계산 방식 설명 */}
      <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
        <p className="text-sm font-semibold text-purple-800 mb-2">📊 Retention 계산 방식</p>
        <div className="text-xs text-purple-700 space-y-1">
          <p><strong>공식:</strong> Retention(day) = a × day<sup>b</sup> (Power Law 모델)</p>
          <p><strong>계수 a:</strong> 표본 게임들의 D+1 Retention 평균값 기반 초기 계수</p>
          <p><strong>계수 b:</strong> 리텐션 감소 기울기 (일반적으로 -0.3 ~ -0.7, 음수일수록 급격 감소)</p>
          <p><strong>예시:</strong> D+30 Retention = 0.45 × 30<sup>-0.5</sup> ≈ 8.2%</p>
        </div>
      </div>
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
        <h3 className="text-lg font-semibold mb-4">Retention Curve (D1~D365)</h3>
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
  // D365 전체 데이터 사용
  const chartData = results.results.best.full_data.nru.map((_, i) => ({ day: i + 1, best: results.results.best.full_data.nru[i], normal: results.results.normal.full_data.nru[i], worst: results.results.worst.full_data.nru[i] }));
  const tableData = results.results.best.full_data.nru.map((_, i) => ({ day: `D+${i + 1}`, best: results.results.best.full_data.nru[i], normal: results.results.normal.full_data.nru[i], worst: results.results.worst.full_data.nru[i] }));
  return (
    <div className="space-y-6">
      {/* NRU 계산 방식 설명 */}
      <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
        <p className="text-sm font-semibold text-blue-800 mb-2">📊 NRU 계산 방식</p>
        <div className="text-xs text-blue-700 space-y-1">
          <p><strong>Paid NRU:</strong> UA 예산 ÷ CPA (CPA Saturation 적용: 예산↑ → 효율↓)</p>
          <p><strong>Organic Boost:</strong> 1 + ln(1 + Brand예산/UA예산) × 0.7 (브랜드 마케팅 → 자연 유입 증가)</p>
          <p><strong>총 NRU:</strong> Paid NRU × (1 + Organic Ratio × Organic Boost)</p>
          <p><strong>일별 배분:</strong> 런칭 30일간 역삼각형 분포 (D1 피크 → D30 감소)</p>
        </div>
      </div>
      <div className="border rounded-lg overflow-hidden">
        <div className="bg-gray-100 px-4 py-2 font-semibold">NRU 요약</div>
        <table className="w-full text-sm"><thead className="bg-gray-50"><tr><th className="px-4 py-2 text-left border-b">시나리오</th><th className="px-4 py-2 text-right border-b">D1 NRU</th><th className="px-4 py-2 text-right border-b">총 NRU</th></tr></thead>
          <tbody>{(['best', 'normal', 'worst'] as const).map(s => <tr key={s} className={s === 'best' ? 'bg-green-50' : s === 'normal' ? 'bg-blue-50' : 'bg-red-50'}><td className="px-4 py-2 border-b font-medium">{s.charAt(0).toUpperCase() + s.slice(1)}</td><td className="px-4 py-2 border-b text-right">{formatNumber(results.results[s].nru.d1_nru)}</td><td className="px-4 py-2 border-b text-right font-bold">{formatNumber(results.results[s].nru.total)}</td></tr>)}</tbody>
        </table>
      </div>
      <div className="bg-white rounded-xl border p-6"><h3 className="text-lg font-semibold mb-4">NRU 추이 (D1~D365)</h3><div className="h-80"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="day" /><YAxis tickFormatter={(v) => formatCompactKorean(v)} width={80} /><Tooltip formatter={(v: number) => [formatNumber(v), '']} /><Legend /><Area type="monotone" dataKey="best" stroke={COLORS.best} fill={COLORS.best} fillOpacity={0.2} name="Best" /><Area type="monotone" dataKey="normal" stroke={COLORS.normal} fill={COLORS.normal} fillOpacity={0.2} name="Normal" /><Area type="monotone" dataKey="worst" stroke={COLORS.worst} fill={COLORS.worst} fillOpacity={0.2} name="Worst" /></AreaChart></ResponsiveContainer></div></div>
      <div className="border rounded-lg overflow-hidden"><div className="bg-gray-100 px-4 py-2 flex justify-between"><span className="font-semibold">상세 테이블</span><div className="flex gap-2"><button onClick={() => setShowTable(!showTable)} className="text-sm text-blue-600">{showTable ? '접기' : '펼치기'}</button><button onClick={() => downloadCSV(tableData, 'nru.csv', ['day', 'best', 'normal', 'worst'])} className="flex items-center gap-1 text-sm bg-green-600 text-white px-3 py-1 rounded"><Download className="w-4 h-4" />CSV</button></div></div>{showTable && <div className="max-h-96 overflow-y-auto"><table className="w-full text-xs"><thead className="bg-gray-50 sticky top-0"><tr><th className="px-3 py-2 text-left border-b">Day</th><th className="px-3 py-2 text-right border-b bg-green-50">Best</th><th className="px-3 py-2 text-right border-b bg-blue-50">Normal</th><th className="px-3 py-2 text-right border-b bg-red-50">Worst</th></tr></thead><tbody>{tableData.slice(0, 365).map((r, i) => <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}><td className="px-3 py-1 border-b">{r.day}</td><td className="px-3 py-1 border-b text-right">{formatNumber(r.best)}</td><td className="px-3 py-1 border-b text-right">{formatNumber(r.normal)}</td><td className="px-3 py-1 border-b text-right">{formatNumber(r.worst)}</td></tr>)}</tbody></table></div>}</div>
    </div>
  );
};

const RevenueTab: React.FC<{ results: ProjectionResult }> = ({ results }) => {
  const [showTable, setShowTable] = useState(false);
  // D365 전체 데이터 사용
  const chartData = results.results.best.full_data.revenue.map((_, i) => ({ day: i + 1, best: results.results.best.full_data.revenue[i], normal: results.results.normal.full_data.revenue[i], worst: results.results.worst.full_data.revenue[i] }));
  const tableData = results.results.best.full_data.revenue.map((_, i) => ({ day: `D+${i + 1}`, best: Math.round(results.results.best.full_data.revenue[i]), normal: Math.round(results.results.normal.full_data.revenue[i]), worst: Math.round(results.results.worst.full_data.revenue[i]) }));
  return (
    <div className="space-y-6">
      {/* Revenue 계산 방식 설명 */}
      <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
        <p className="text-sm font-semibold text-amber-800 mb-2">📊 Revenue 계산 방식</p>
        <div className="text-xs text-amber-700 space-y-1">
          <p><strong>공식:</strong> Daily Revenue = DAU × Payment Rate × ARPPU</p>
          <p><strong>Payment Rate:</strong> 표본 게임 평균 × BM 타입 보정 (Hardcore 3% vs Casual 10%)</p>
          <p><strong>ARPPU:</strong> 표본 게임 평균 × BM 타입 보정 (Hardcore $80 vs Casual $20)</p>
          <p><strong>Net Revenue:</strong> Gross Revenue × (1 - 플랫폼 수수료 30% - VAT)</p>
        </div>
      </div>
      <div className="border rounded-lg overflow-hidden">
        <div className="bg-gray-100 px-4 py-2 font-semibold">Revenue 요약</div>
        <table className="w-full text-sm"><thead className="bg-gray-50"><tr><th className="px-4 py-2 text-left border-b">시나리오</th><th className="px-4 py-2 text-right border-b">총 Gross</th><th className="px-4 py-2 text-right border-b">일평균</th></tr></thead>
          <tbody>{(['best', 'normal', 'worst'] as const).map(s => <tr key={s} className={s === 'best' ? 'bg-green-50' : s === 'normal' ? 'bg-blue-50' : 'bg-red-50'}><td className="px-4 py-2 border-b font-medium">{s.charAt(0).toUpperCase() + s.slice(1)}</td><td className="px-4 py-2 border-b text-right font-bold">{formatCurrency(results.results[s].revenue.total_gross)}</td><td className="px-4 py-2 border-b text-right">{formatCurrency(results.results[s].revenue.average_daily)}</td></tr>)}</tbody>
        </table>
      </div>
      <div className="bg-white rounded-xl border p-6"><h3 className="text-lg font-semibold mb-4">일별 매출 (D1~D365)</h3><div className="h-80"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="day" /><YAxis tickFormatter={(v) => formatCompactKorean(v)} width={80} /><Tooltip formatter={(v: number) => [formatCurrency(v), '']} /><Legend /><Area type="monotone" dataKey="best" stroke={COLORS.best} fill={COLORS.best} fillOpacity={0.2} name="Best" /><Area type="monotone" dataKey="normal" stroke={COLORS.normal} fill={COLORS.normal} fillOpacity={0.2} name="Normal" /><Area type="monotone" dataKey="worst" stroke={COLORS.worst} fill={COLORS.worst} fillOpacity={0.2} name="Worst" /></AreaChart></ResponsiveContainer></div></div>
      <div className="border rounded-lg overflow-hidden"><div className="bg-gray-100 px-4 py-2 flex justify-between"><span className="font-semibold">상세 테이블</span><div className="flex gap-2"><button onClick={() => setShowTable(!showTable)} className="text-sm text-blue-600">{showTable ? '접기' : '펼치기'}</button><button onClick={() => downloadCSV(tableData, 'revenue.csv', ['day', 'best', 'normal', 'worst'])} className="flex items-center gap-1 text-sm bg-green-600 text-white px-3 py-1 rounded"><Download className="w-4 h-4" />CSV</button></div></div>{showTable && <div className="max-h-96 overflow-y-auto"><table className="w-full text-xs"><thead className="bg-gray-50 sticky top-0"><tr><th className="px-3 py-2 text-left border-b">Day</th><th className="px-3 py-2 text-right border-b bg-green-50">Best</th><th className="px-3 py-2 text-right border-b bg-blue-50">Normal</th><th className="px-3 py-2 text-right border-b bg-red-50">Worst</th></tr></thead><tbody>{tableData.slice(0, 365).map((r, i) => <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}><td className="px-3 py-1 border-b">{r.day}</td><td className="px-3 py-1 border-b text-right">{formatCurrency(r.best)}</td><td className="px-3 py-1 border-b text-right">{formatCurrency(r.normal)}</td><td className="px-3 py-1 border-b text-right">{formatCurrency(r.worst)}</td></tr>)}</tbody></table></div>}</div>
    </div>
  );
};

const TotalTab: React.FC<{ results: ProjectionResult }> = ({ results }) => {
  const [showTable, setShowTable] = useState(false);
  // D365 전체 데이터 사용
  const chartData = results.results.normal.full_data.dau.map((_, i) => ({ day: i + 1, dau_normal: results.results.normal.full_data.dau[i], revenue_best: results.results.best.full_data.revenue[i], revenue_normal: results.results.normal.full_data.revenue[i], revenue_worst: results.results.worst.full_data.revenue[i] }));
  const tableData = results.results.normal.full_data.dau.map((_, i) => ({ day: `D+${i + 1}`, dau_best: results.results.best.full_data.dau[i], dau_normal: results.results.normal.full_data.dau[i], dau_worst: results.results.worst.full_data.dau[i], revenue_best: Math.round(results.results.best.full_data.revenue[i]), revenue_normal: Math.round(results.results.normal.full_data.revenue[i]), revenue_worst: Math.round(results.results.worst.full_data.revenue[i]) }));
  return (
    <div className="space-y-6">
      {/* Total KPI 계산 방식 설명 */}
      <div className="p-4 bg-slate-100 rounded-lg border border-slate-300">
        <p className="text-sm font-semibold text-slate-800 mb-2">📊 통합 KPI 계산 흐름</p>
        <div className="text-xs text-slate-700 space-y-1">
          <p><strong>1. NRU:</strong> UA 예산 ÷ CPA × Organic Boost → 런칭 30일간 일별 유입</p>
          <p><strong>2. DAU:</strong> Σ(과거 NRU × 해당일 Retention) → 일별 활성 유저</p>
          <p><strong>3. Revenue:</strong> DAU × Payment Rate × ARPPU → 일별 매출</p>
          <p><strong>4. Total:</strong> Σ(일별 매출) × 365일 → 연간 Gross/Net Revenue</p>
        </div>
      </div>
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
      <div className="bg-white rounded-xl border p-6"><h3 className="text-lg font-semibold mb-4">통합 KPI 추이 (D1~D365)</h3><div className="h-96"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={chartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="day" /><YAxis yAxisId="left" tickFormatter={(v) => formatCompactKorean(v)} width={80} /><YAxis yAxisId="right" orientation="right" tickFormatter={(v) => formatCompactKorean(v)} width={80} /><Tooltip /><Legend /><Bar yAxisId="left" dataKey="dau_normal" fill={COLORS.normal} name="DAU" opacity={0.7} /><Line yAxisId="right" type="monotone" dataKey="revenue_best" stroke={COLORS.best} name="Revenue (Best)" dot={false} /><Line yAxisId="right" type="monotone" dataKey="revenue_normal" stroke={COLORS.normal} name="Revenue (Normal)" dot={false} /><Line yAxisId="right" type="monotone" dataKey="revenue_worst" stroke={COLORS.worst} name="Revenue (Worst)" dot={false} /></ComposedChart></ResponsiveContainer></div></div>
      <div className="border rounded-lg overflow-hidden"><div className="bg-gray-100 px-4 py-2 flex justify-between"><span className="font-semibold">상세 테이블</span><div className="flex gap-2"><button onClick={() => setShowTable(!showTable)} className="text-sm text-blue-600">{showTable ? '접기' : '펼치기'}</button><button onClick={() => downloadCSV(tableData, 'total_kpi.csv', ['day', 'dau_best', 'dau_normal', 'dau_worst', 'revenue_best', 'revenue_normal', 'revenue_worst'])} className="flex items-center gap-1 text-sm bg-green-600 text-white px-3 py-1 rounded"><Download className="w-4 h-4" />CSV</button></div></div>{showTable && <div className="max-h-96 overflow-x-auto overflow-y-auto"><table className="w-full text-xs whitespace-nowrap"><thead className="bg-gray-50 sticky top-0"><tr><th className="px-2 py-2 text-left border-b">Day</th><th className="px-2 py-2 text-right border-b text-green-600">DAU Best</th><th className="px-2 py-2 text-right border-b text-blue-600">Normal</th><th className="px-2 py-2 text-right border-b text-red-600">Worst</th><th className="px-2 py-2 text-right border-b text-green-600">Rev Best</th><th className="px-2 py-2 text-right border-b text-blue-600">Normal</th><th className="px-2 py-2 text-right border-b text-red-600">Worst</th></tr></thead><tbody>{tableData.slice(0, 365).map((r, i) => <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}><td className="px-2 py-1 border-b">{r.day}</td><td className="px-2 py-1 border-b text-right">{formatNumber(r.dau_best)}</td><td className="px-2 py-1 border-b text-right">{formatNumber(r.dau_normal)}</td><td className="px-2 py-1 border-b text-right">{formatNumber(r.dau_worst)}</td><td className="px-2 py-1 border-b text-right">{formatCurrency(r.revenue_best)}</td><td className="px-2 py-1 border-b text-right">{formatCurrency(r.revenue_normal)}</td><td className="px-2 py-1 border-b text-right">{formatCurrency(r.revenue_worst)}</td></tr>)}</tbody></table></div>}</div>
    </div>
  );
};

const DAUTab: React.FC<{ results: ProjectionResult }> = ({ results }) => {
  const [showTable, setShowTable] = useState(false);
  // D365 전체 데이터 사용
  const chartData = results.results.best.full_data.dau.map((_, i) => ({ day: i + 1, best: results.results.best.full_data.dau[i], normal: results.results.normal.full_data.dau[i], worst: results.results.worst.full_data.dau[i] }));
  const tableData = results.results.best.full_data.dau.map((_, i) => ({ day: `D+${i + 1}`, best: results.results.best.full_data.dau[i], normal: results.results.normal.full_data.dau[i], worst: results.results.worst.full_data.dau[i] }));
  return (
    <div className="space-y-6">
      {/* DAU 계산 방식 설명 */}
      <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-200">
        <p className="text-sm font-semibold text-emerald-800 mb-2">📊 DAU 계산 방식</p>
        <div className="text-xs text-emerald-700 space-y-1">
          <p><strong>공식:</strong> DAU(t) = Σ[ NRU(t-k) × Retention(k) ] for k = 0 to t</p>
          <p><strong>해석:</strong> 특정일의 DAU는 과거에 유입된 모든 유저들이 해당일에 접속할 확률(리텐션)의 합계입니다.</p>
          <p><strong>예시:</strong> D+30 DAU = (D+1 유입 × D30 리텐션) + (D+2 유입 × D29 리텐션) + ... + (D+30 유입 × D1 리텐션)</p>
        </div>
      </div>
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
      <div className="bg-white rounded-xl border p-6"><h3 className="text-lg font-semibold mb-4">DAU 추이 (D1~D365)</h3><div className="h-80"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="day" /><YAxis tickFormatter={(v) => formatCompactKorean(v)} width={80} /><Tooltip formatter={(v: number) => formatNumber(v)} /><Legend /><Area type="monotone" dataKey="best" stroke={COLORS.best} fill={COLORS.best} fillOpacity={0.2} name="Best" /><Area type="monotone" dataKey="normal" stroke={COLORS.normal} fill={COLORS.normal} fillOpacity={0.2} name="Normal" /><Area type="monotone" dataKey="worst" stroke={COLORS.worst} fill={COLORS.worst} fillOpacity={0.2} name="Worst" /></AreaChart></ResponsiveContainer></div></div>
      <div className="border rounded-lg overflow-hidden"><div className="bg-gray-100 px-4 py-2 flex justify-between"><span className="font-semibold">상세 테이블</span><div className="flex gap-2"><button onClick={() => setShowTable(!showTable)} className="text-sm text-blue-600">{showTable ? '접기' : '펼치기'}</button><button onClick={() => downloadCSV(tableData, 'dau.csv', ['day', 'best', 'normal', 'worst'])} className="flex items-center gap-1 text-sm bg-green-600 text-white px-3 py-1 rounded"><Download className="w-4 h-4" />CSV</button></div></div>{showTable && <div className="max-h-96 overflow-y-auto"><table className="w-full text-xs"><thead className="bg-gray-50 sticky top-0"><tr><th className="px-3 py-2 text-left border-b">Day</th><th className="px-3 py-2 text-right border-b bg-green-50">Best</th><th className="px-3 py-2 text-right border-b bg-blue-50">Normal</th><th className="px-3 py-2 text-right border-b bg-red-50">Worst</th></tr></thead><tbody>{tableData.slice(0, 365).map((r, i) => <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}><td className="px-3 py-1 border-b">{r.day}</td><td className="px-3 py-1 border-b text-right">{formatNumber(r.best)}</td><td className="px-3 py-1 border-b text-right">{formatNumber(r.normal)}</td><td className="px-3 py-1 border-b text-right">{formatNumber(r.worst)}</td></tr>)}</tbody></table></div>}</div>
    </div>
  );
};

const RawDataTab: React.FC<{ games: GameListResponse | null }> = ({ games }) => {
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  if (!games) return null;
  
  const API_BASE = import.meta.env.VITE_API_URL || '/api';
  
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
