import React, { useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area, ComposedChart, Bar
} from 'recharts';
import { Download, TrendingUp, Users, DollarSign, Activity, AlertTriangle } from 'lucide-react';
import type { ProjectionInput } from '../types';

interface ResultsPanelProps {
  results: any;
  summary: any;
  aiReport: any;
  inputData: ProjectionInput;
}

const ResultsPanel: React.FC<ResultsPanelProps> = ({ results, summary, aiReport, inputData }) => {
  const [activeTab, setActiveTab] = useState<'financial' | 'traffic' | 'retention'>('financial');
  const [selectedScenario, setSelectedScenario] = useState<'best' | 'normal' | 'worst'>('normal');

  // [V10.0 Fix] 데이터 구조 평탄화 대응
  const res = results[selectedScenario];
  if (!res) return <div className="p-8 text-center text-gray-500">데이터가 없습니다.</div>;

  // 차트용 데이터 변환 (Array of Objects) - 성능을 위해 샘플링
  const sampleRate = Math.ceil(res.revenue.length / 90); // 최대 90개 포인트
  const chartData = res.revenue
    .filter((_: number, idx: number) => idx % sampleRate === 0 || idx === res.revenue.length - 1)
    .map((val: number, idx: number) => {
      const realIdx = idx * sampleRate;
      return {
        day: realIdx + 1,
        revenue: val,
        profit: res.profit ? res.profit[realIdx] : 0,
        cum_profit: res.cum_profit ? res.cum_profit[realIdx] : 0,
        cost: res.cost ? res.cost[realIdx] : 0,
        dau: res.dau[realIdx],
        nru: res.nru[realIdx],
        nru_paid: res.nru_paid ? res.nru_paid[realIdx] : 0,
        nru_organic: res.nru_organic ? res.nru_organic[realIdx] : 0,
        retention: res.retention ? res.retention[realIdx] : 0,
      };
    });

  // 엑셀 다운로드 핸들러
  const handleExport = async () => {
    try {
      const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const response = await fetch(`${API_BASE}/api/projection/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inputData)
      });
      
      if (!response.ok) throw new Error("Export failed");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `KPI_Projection_${inputData.genre}_${new Date().toISOString().slice(0,10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      alert("엑셀 다운로드 실패: 백엔드 상태를 확인해주세요.");
      console.error(e);
    }
  };

  const s = summary[selectedScenario];

  // 숫자 포맷팅 헬퍼
  const formatBillion = (val: number) => `${(val / 100000000).toFixed(1)}억`;
  const formatMillion = (val: number) => `${(val / 1000000).toFixed(0)}M`;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* 1. Header & Summary Cards */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            📊 KPI 프로젝션 결과 
            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">V10.0</span>
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {inputData.projection_days || 365}일 기준 누적 성과 · {inputData.genre} · {inputData.platform}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* 시나리오 선택 */}
          <select 
            value={selectedScenario}
            onChange={(e) => setSelectedScenario(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium"
          >
            <option value="best">🟢 Best</option>
            <option value="normal">🔵 Normal</option>
            <option value="worst">🔴 Worst</option>
          </select>
          <button 
            onClick={handleExport}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-lg shadow-md transition-all font-medium"
          >
            <Download className="w-4 h-4" />
            <span>Excel 다운로드</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
            <DollarSign className="w-3 h-3" /> Total Revenue
          </div>
          <div className="text-xl font-bold text-gray-900">₩{formatBillion(s.total_revenue)}</div>
          <div className="text-xs text-gray-400 mt-1">Net: ₩{formatBillion(s.net_profit)}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <div className="text-xs text-gray-500 mb-1">Blended ROAS</div>
          <div className={`text-xl font-bold ${s.blended_roas >= 100 ? 'text-green-600' : 'text-orange-500'}`}>
            {s.blended_roas.toFixed(1)}%
          </div>
          <div className="text-xs text-gray-400 mt-1">Paid: {s.paid_roas.toFixed(1)}%</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <div className="text-xs text-gray-500 mb-1">ROI</div>
          <div className={`text-xl font-bold ${s.roi >= 0 ? 'text-green-600' : 'text-red-500'}`}>
            {s.roi >= 0 ? '+' : ''}{s.roi.toFixed(1)}%
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <div className="text-xs text-gray-500 mb-1">BEP (손익분기)</div>
          <div className={`text-xl font-bold ${s.bep_day > 0 ? 'text-blue-600' : 'text-red-500'}`}>
            {s.bep_day > 0 ? `D+${s.bep_day}` : "미달성"}
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
            <Users className="w-3 h-3" /> Total NRU
          </div>
          <div className="text-xl font-bold text-gray-700">{s.total_nru.toLocaleString()}</div>
          <div className="text-xs text-gray-400 mt-1">
            Paid: {s.total_nru_paid?.toLocaleString() || 0}
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <div className="text-xs text-gray-500 mb-1">Paid CAC</div>
          <div className="text-xl font-bold text-gray-700">₩{s.cac_paid.toLocaleString()}</div>
          <div className="text-xs text-gray-400 mt-1">
            Blended: ₩{s.cac_blended?.toLocaleString() || 0}
          </div>
        </div>
      </div>

      {/* 시나리오 비교 테이블 */}
      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
        <h3 className="text-lg font-bold text-gray-800 mb-4">📊 시나리오 비교</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-3">지표</th>
                <th className="text-right py-2 px-3 text-green-600">🟢 Best</th>
                <th className="text-right py-2 px-3 text-blue-600">🔵 Normal</th>
                <th className="text-right py-2 px-3 text-red-600">🔴 Worst</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b hover:bg-gray-50">
                <td className="py-2 px-3 font-medium">Total Revenue</td>
                <td className="text-right py-2 px-3">₩{formatBillion(summary.best.total_revenue)}</td>
                <td className="text-right py-2 px-3">₩{formatBillion(summary.normal.total_revenue)}</td>
                <td className="text-right py-2 px-3">₩{formatBillion(summary.worst.total_revenue)}</td>
              </tr>
              <tr className="border-b hover:bg-gray-50">
                <td className="py-2 px-3 font-medium">Net Profit</td>
                <td className="text-right py-2 px-3">₩{formatBillion(summary.best.net_profit)}</td>
                <td className="text-right py-2 px-3">₩{formatBillion(summary.normal.net_profit)}</td>
                <td className="text-right py-2 px-3">₩{formatBillion(summary.worst.net_profit)}</td>
              </tr>
              <tr className="border-b hover:bg-gray-50">
                <td className="py-2 px-3 font-medium">ROI</td>
                <td className="text-right py-2 px-3">{summary.best.roi.toFixed(1)}%</td>
                <td className="text-right py-2 px-3">{summary.normal.roi.toFixed(1)}%</td>
                <td className="text-right py-2 px-3">{summary.worst.roi.toFixed(1)}%</td>
              </tr>
              <tr className="border-b hover:bg-gray-50">
                <td className="py-2 px-3 font-medium">BEP Day</td>
                <td className="text-right py-2 px-3">{summary.best.bep_day > 0 ? `D+${summary.best.bep_day}` : '-'}</td>
                <td className="text-right py-2 px-3">{summary.normal.bep_day > 0 ? `D+${summary.normal.bep_day}` : '-'}</td>
                <td className="text-right py-2 px-3">{summary.worst.bep_day > 0 ? `D+${summary.worst.bep_day}` : '-'}</td>
              </tr>
              <tr className="hover:bg-gray-50">
                <td className="py-2 px-3 font-medium">Total NRU</td>
                <td className="text-right py-2 px-3">{summary.best.total_nru.toLocaleString()}</td>
                <td className="text-right py-2 px-3">{summary.normal.total_nru.toLocaleString()}</td>
                <td className="text-right py-2 px-3">{summary.worst.total_nru.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 2. Charts Section */}
      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
        <div className="flex gap-4 mb-6 border-b">
          <button 
            onClick={() => setActiveTab('financial')}
            className={`pb-3 px-1 font-medium transition-colors ${activeTab === 'financial' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            💰 매출 & 손익
          </button>
          <button 
            onClick={() => setActiveTab('traffic')}
            className={`pb-3 px-1 font-medium transition-colors ${activeTab === 'traffic' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            👥 DAU / NRU
          </button>
          <button 
            onClick={() => setActiveTab('retention')}
            className={`pb-3 px-1 font-medium transition-colors ${activeTab === 'retention' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            📈 누적 손익
          </button>
        </div>

        <div className="h-[400px] w-full">
          {activeTab === 'financial' && (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" tick={{fontSize: 11}} tickFormatter={(val) => `D${val}`} />
                <YAxis yAxisId="left" tickFormatter={(val) => formatBillion(val)} tick={{fontSize: 11}} />
                <Tooltip 
                  formatter={(val: number, name: string) => [`₩${val.toLocaleString()}`, name]}
                  labelFormatter={(label) => `Day ${label}`}
                />
                <Legend />
                <Bar yAxisId="left" dataKey="revenue" name="일매출" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                <Line yAxisId="left" type="monotone" dataKey="profit" name="일손익" stroke="#10b981" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
          
          {activeTab === 'traffic' && (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" tick={{fontSize: 11}} tickFormatter={(val) => `D${val}`} />
                <YAxis tick={{fontSize: 11}} tickFormatter={(val) => val.toLocaleString()} />
                <Tooltip formatter={(val: number) => [`${val.toLocaleString()}명`]} />
                <Legend />
                <Area type="monotone" dataKey="dau" name="DAU" stroke="#8b5cf6" fill="#8b5cf680" />
                <Bar dataKey="nru_paid" name="Paid NRU" stackId="nru" fill="#3b82f6" />
                <Bar dataKey="nru_organic" name="Organic NRU" stackId="nru" fill="#10b981" />
              </ComposedChart>
            </ResponsiveContainer>
          )}
          
          {activeTab === 'retention' && (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" tick={{fontSize: 11}} tickFormatter={(val) => `D${val}`} />
                <YAxis tickFormatter={(val) => formatBillion(val)} tick={{fontSize: 11}} />
                <Tooltip 
                  formatter={(val: number) => [`₩${val.toLocaleString()}`]}
                  labelFormatter={(label) => `Day ${label}`}
                />
                <Legend />
                <Area 
                  type="monotone" 
                  dataKey="cum_profit" 
                  name="누적 손익" 
                  stroke="#10b981" 
                  fill="#10b98140"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* 3. AI Insight Section */}
      {aiReport && (
        <div className="bg-gradient-to-r from-slate-50 to-blue-50 p-6 rounded-xl border border-blue-100 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-5 h-5 text-blue-600" />
            <h3 className="text-lg font-bold text-gray-800">🤖 AI Strategy Insight</h3>
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">GPT-4o</span>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-white/80 p-4 rounded-lg">
              <h4 className="font-bold text-gray-700 mb-2">📊 Summary</h4>
              <p className="text-sm text-gray-600 leading-relaxed">{aiReport.summary || "분석 결과가 없습니다."}</p>
              {aiReport.evaluation && (
                <p className="text-xs text-blue-600 mt-2 font-medium">{aiReport.evaluation}</p>
              )}
            </div>
            <div className="bg-white/80 p-4 rounded-lg">
              <h4 className="font-bold text-red-600 mb-2 flex items-center gap-1">
                <AlertTriangle className="w-4 h-4" /> Risks
              </h4>
              <ul className="text-sm text-gray-600 space-y-1 list-disc pl-4">
                {aiReport.risks?.length > 0 ? (
                  aiReport.risks.map((risk: string, i: number) => (
                    <li key={i}>{risk}</li>
                  ))
                ) : (
                  <li className="text-gray-400">분석된 리스크가 없습니다.</li>
                )}
              </ul>
            </div>
            <div className="bg-white/80 p-4 rounded-lg">
              <h4 className="font-bold text-blue-600 mb-2 flex items-center gap-1">
                <TrendingUp className="w-4 h-4" /> Strategy
              </h4>
              <ul className="text-sm text-gray-600 space-y-1 list-disc pl-4">
                {aiReport.strategies?.length > 0 ? (
                  aiReport.strategies.map((st: string, i: number) => (
                    <li key={i}>{st}</li>
                  ))
                ) : (
                  <li className="text-gray-400">제안된 전략이 없습니다.</li>
                )}
              </ul>
            </div>
          </div>
          
          {aiReport.recommendations && (
            <div className="mt-4 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
              <p className="text-sm text-yellow-800">
                <strong>💡 추가 권고:</strong> {aiReport.recommendations}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="text-center text-xs text-gray-400 py-4">
        Game KPI Projection Engine V10.0 · P0 Fixes Applied · OpenAI GPT-4o Integration
      </div>
    </div>
  );
};

export default ResultsPanel;
