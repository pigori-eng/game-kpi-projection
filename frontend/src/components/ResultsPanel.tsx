import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  DollarSign,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
  ComposedChart,
  Bar
} from 'recharts';
import type { ProjectionResult, TabType, GameListResponse } from '../types';
import { formatNumber, formatCurrency, formatPercent } from '../utils/format';

interface ResultsPanelProps {
  results: ProjectionResult;
  activeTab: TabType;
  games: GameListResponse | null;
}

const COLORS = {
  best: '#22c55e',
  normal: '#3b82f6', 
  worst: '#ef4444'
};

const SummaryCard: React.FC<{
  title: string;
  best: number;
  normal: number;
  worst: number;
  format?: 'number' | 'currency' | 'percent';
  icon: React.ReactNode;
}> = ({ title, best, normal, worst, format = 'number', icon }) => {
  const formatValue = (val: number) => {
    switch (format) {
      case 'currency': return formatCurrency(val);
      case 'percent': return formatPercent(val);
      default: return formatNumber(val);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h4 className="font-medium text-gray-700">{title}</h4>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="text-center p-2 bg-green-50 rounded">
          <p className="text-xs text-green-600 font-medium">Best</p>
          <p className="text-lg font-bold text-green-700">{formatValue(best)}</p>
        </div>
        <div className="text-center p-2 bg-blue-50 rounded">
          <p className="text-xs text-blue-600 font-medium">Normal</p>
          <p className="text-lg font-bold text-blue-700">{formatValue(normal)}</p>
        </div>
        <div className="text-center p-2 bg-red-50 rounded">
          <p className="text-xs text-red-600 font-medium">Worst</p>
          <p className="text-lg font-bold text-red-700">{formatValue(worst)}</p>
        </div>
      </div>
    </div>
  );
};

// Overview Tab
const OverviewTab: React.FC<{ results: ProjectionResult }> = ({ results }) => {
  const { summary } = results;

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-blue-600 to-blue-800 rounded-xl p-6 text-white">
        <h2 className="text-2xl font-bold mb-2">프로젝션 결과 요약</h2>
        <p className="text-blue-100">
          런칭일: {results.input.launch_date} | 프로젝션 기간: {results.input.projection_days}일
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <SummaryCard
          title="총 Gross Revenue"
          best={summary.best.gross_revenue}
          normal={summary.normal.gross_revenue}
          worst={summary.worst.gross_revenue}
          format="currency"
          icon={<DollarSign className="w-5 h-5 text-amber-500" />}
        />
        <SummaryCard
          title="총 Net Revenue"
          best={summary.best.net_revenue}
          normal={summary.normal.net_revenue}
          worst={summary.worst.net_revenue}
          format="currency"
          icon={<DollarSign className="w-5 h-5 text-green-500" />}
        />
        <SummaryCard
          title="총 NRU"
          best={summary.best.total_nru}
          normal={summary.normal.total_nru}
          worst={summary.worst.total_nru}
          format="number"
          icon={<Users className="w-5 h-5 text-blue-500" />}
        />
        <SummaryCard
          title="Peak DAU"
          best={summary.best.peak_dau}
          normal={summary.normal.peak_dau}
          worst={summary.worst.peak_dau}
          format="number"
          icon={<TrendingUp className="w-5 h-5 text-purple-500" />}
        />
        <SummaryCard
          title="평균 DAU"
          best={summary.best.average_dau}
          normal={summary.normal.average_dau}
          worst={summary.worst.average_dau}
          format="number"
          icon={<BarChart3 className="w-5 h-5 text-indigo-500" />}
        />
        <SummaryCard
          title="일평균 매출"
          best={summary.best.average_daily_revenue}
          normal={summary.normal.average_daily_revenue}
          worst={summary.worst.average_daily_revenue}
          format="currency"
          icon={<DollarSign className="w-5 h-5 text-emerald-500" />}
        />
      </div>

      {/* Selected Games Info */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="font-medium text-gray-700 mb-3">선택된 표본 게임</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-gray-500">Retention</p>
            <p className="font-medium">{results.input.retention_games.join(', ') || '-'}</p>
          </div>
          <div>
            <p className="text-gray-500">NRU</p>
            <p className="font-medium">{results.input.nru_games.join(', ') || '-'}</p>
          </div>
          <div>
            <p className="text-gray-500">P.Rate</p>
            <p className="font-medium">{results.input.pr_games.join(', ') || '-'}</p>
          </div>
          <div>
            <p className="text-gray-500">ARPPU</p>
            <p className="font-medium">{results.input.arppu_games.join(', ') || '-'}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

// Retention Tab
const RetentionTab: React.FC<{ results: ProjectionResult }> = ({ results }) => {
  const chartData = results.results.best.retention.curve.map((_, idx) => ({
    day: idx + 1,
    best: results.results.best.retention.curve[idx] * 100,
    normal: results.results.normal.retention.curve[idx] * 100,
    worst: results.results.worst.retention.curve[idx] * 100,
  }));

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold mb-4">Retention Curve (D+1 ~ D+90)</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="day" 
                label={{ value: 'Day', position: 'insideBottom', offset: -5 }}
              />
              <YAxis 
                label={{ value: 'Retention (%)', angle: -90, position: 'insideLeft' }}
                domain={[0, 60]}
              />
              <Tooltip 
                formatter={(value: number) => `${value.toFixed(2)}%`}
                labelFormatter={(label) => `D+${label}`}
              />
              <Legend />
              <Line type="monotone" dataKey="best" stroke={COLORS.best} name="Best" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="normal" stroke={COLORS.normal} name="Normal" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="worst" stroke={COLORS.worst} name="Worst" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {(['best', 'normal', 'worst'] as const).map(scenario => (
          <div key={scenario} className={`p-4 rounded-lg border ${
            scenario === 'best' ? 'bg-green-50 border-green-200' :
            scenario === 'normal' ? 'bg-blue-50 border-blue-200' :
            'bg-red-50 border-red-200'
          }`}>
            <h4 className={`font-medium mb-2 ${
              scenario === 'best' ? 'text-green-700' :
              scenario === 'normal' ? 'text-blue-700' :
              'text-red-700'
            }`}>
              {scenario.charAt(0).toUpperCase() + scenario.slice(1)}
            </h4>
            <div className="space-y-1 text-sm">
              <p>D+1: <span className="font-medium">{formatPercent(results.results[scenario].retention.target_d1)}</span></p>
              <p>D+7: <span className="font-medium">{formatPercent(results.results[scenario].retention.curve[6])}</span></p>
              <p>D+30: <span className="font-medium">{formatPercent(results.results[scenario].retention.curve[29])}</span></p>
              <p className="text-xs text-gray-500 mt-2">
                a={results.results[scenario].retention.coefficients.a.toFixed(4)}, 
                b={results.results[scenario].retention.coefficients.b.toFixed(4)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// NRU Tab
const NRUTab: React.FC<{ results: ProjectionResult }> = ({ results }) => {
  const chartData = results.results.best.nru.series.map((_, idx) => ({
    day: idx + 1,
    best: results.results.best.nru.series[idx],
    normal: results.results.normal.nru.series[idx],
    worst: results.results.worst.nru.series[idx],
  }));

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold mb-4">NRU 추이 (D+1 ~ D+90)</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" />
              <YAxis tickFormatter={(val) => formatNumber(val)} />
              <Tooltip formatter={(value: number) => formatNumber(value)} />
              <Legend />
              <Area type="monotone" dataKey="best" stroke={COLORS.best} fill={COLORS.best} fillOpacity={0.2} name="Best" />
              <Area type="monotone" dataKey="normal" stroke={COLORS.normal} fill={COLORS.normal} fillOpacity={0.2} name="Normal" />
              <Area type="monotone" dataKey="worst" stroke={COLORS.worst} fill={COLORS.worst} fillOpacity={0.2} name="Worst" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {(['best', 'normal', 'worst'] as const).map(scenario => (
          <div key={scenario} className={`p-4 rounded-lg border ${
            scenario === 'best' ? 'bg-green-50 border-green-200' :
            scenario === 'normal' ? 'bg-blue-50 border-blue-200' :
            'bg-red-50 border-red-200'
          }`}>
            <h4 className={`font-medium mb-2 ${
              scenario === 'best' ? 'text-green-700' :
              scenario === 'normal' ? 'text-blue-700' :
              'text-red-700'
            }`}>
              {scenario.charAt(0).toUpperCase() + scenario.slice(1)}
            </h4>
            <div className="space-y-1 text-sm">
              <p>D1 NRU: <span className="font-medium">{formatNumber(results.results[scenario].nru.d1_nru)}</span></p>
              <p>총 NRU: <span className="font-medium">{formatNumber(results.results[scenario].nru.total)}</span></p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Revenue Tab
const RevenueTab: React.FC<{ results: ProjectionResult }> = ({ results }) => {
  const chartData = results.results.best.revenue.daily_revenue.map((_, idx) => ({
    day: idx + 1,
    best: results.results.best.revenue.daily_revenue[idx],
    normal: results.results.normal.revenue.daily_revenue[idx],
    worst: results.results.worst.revenue.daily_revenue[idx],
  }));

  const prData = results.results.best.revenue.pr_series.map((_, idx) => ({
    day: idx + 1,
    best: results.results.best.revenue.pr_series[idx] * 100,
    normal: results.results.normal.revenue.pr_series[idx] * 100,
    worst: results.results.worst.revenue.pr_series[idx] * 100,
  }));

  const arppuData = results.results.best.revenue.arppu_series.map((_, idx) => ({
    day: idx + 1,
    best: results.results.best.revenue.arppu_series[idx],
    normal: results.results.normal.revenue.arppu_series[idx],
    worst: results.results.worst.revenue.arppu_series[idx],
  }));

  return (
    <div className="space-y-6">
      {/* Daily Revenue Chart */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold mb-4">일별 매출 (D+1 ~ D+90)</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" />
              <YAxis tickFormatter={(val) => formatCurrency(val)} />
              <Tooltip formatter={(value: number) => formatCurrency(value)} />
              <Legend />
              <Area type="monotone" dataKey="best" stroke={COLORS.best} fill={COLORS.best} fillOpacity={0.2} name="Best" />
              <Area type="monotone" dataKey="normal" stroke={COLORS.normal} fill={COLORS.normal} fillOpacity={0.2} name="Normal" />
              <Area type="monotone" dataKey="worst" stroke={COLORS.worst} fill={COLORS.worst} fillOpacity={0.2} name="Worst" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* P.Rate and ARPPU Charts */}
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold mb-4">P.Rate 추이 (%)</h3>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={prData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" />
                <YAxis domain={[0, 10]} />
                <Tooltip formatter={(value: number) => `${value.toFixed(2)}%`} />
                <Legend />
                <Line type="monotone" dataKey="best" stroke={COLORS.best} name="Best" dot={false} />
                <Line type="monotone" dataKey="normal" stroke={COLORS.normal} name="Normal" dot={false} />
                <Line type="monotone" dataKey="worst" stroke={COLORS.worst} name="Worst" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold mb-4">ARPPU 추이</h3>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={arppuData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" />
                <YAxis tickFormatter={(val) => formatCurrency(val)} />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Legend />
                <Line type="monotone" dataKey="best" stroke={COLORS.best} name="Best" dot={false} />
                <Line type="monotone" dataKey="normal" stroke={COLORS.normal} name="Normal" dot={false} />
                <Line type="monotone" dataKey="worst" stroke={COLORS.worst} name="Worst" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        {(['best', 'normal', 'worst'] as const).map(scenario => (
          <div key={scenario} className={`p-4 rounded-lg border ${
            scenario === 'best' ? 'bg-green-50 border-green-200' :
            scenario === 'normal' ? 'bg-blue-50 border-blue-200' :
            'bg-red-50 border-red-200'
          }`}>
            <h4 className={`font-medium mb-2 ${
              scenario === 'best' ? 'text-green-700' :
              scenario === 'normal' ? 'text-blue-700' :
              'text-red-700'
            }`}>
              {scenario.charAt(0).toUpperCase() + scenario.slice(1)}
            </h4>
            <div className="space-y-1 text-sm">
              <p>총 Gross: <span className="font-medium">{formatCurrency(results.results[scenario].revenue.total_gross)}</span></p>
              <p>일평균: <span className="font-medium">{formatCurrency(results.results[scenario].revenue.average_daily)}</span></p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Total Tab
const TotalTab: React.FC<{ results: ProjectionResult }> = ({ results }) => {
  const fullData = results.results.normal.full_data;
  const chartData = fullData.dau.slice(0, 90).map((_, idx) => ({
    day: idx + 1,
    nru_best: results.results.best.full_data.nru[idx],
    nru_normal: results.results.normal.full_data.nru[idx],
    nru_worst: results.results.worst.full_data.nru[idx],
    dau_best: results.results.best.full_data.dau[idx],
    dau_normal: results.results.normal.full_data.dau[idx],
    dau_worst: results.results.worst.full_data.dau[idx],
    revenue_best: results.results.best.full_data.revenue[idx],
    revenue_normal: results.results.normal.full_data.revenue[idx],
    revenue_worst: results.results.worst.full_data.revenue[idx],
  }));

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold mb-4">통합 KPI 추이 (D+1 ~ D+90)</h3>
        <div className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" />
              <YAxis yAxisId="left" tickFormatter={(val) => formatNumber(val)} />
              <YAxis yAxisId="right" orientation="right" tickFormatter={(val) => formatCurrency(val)} />
              <Tooltip />
              <Legend />
              <Bar yAxisId="left" dataKey="dau_normal" fill={COLORS.normal} name="DAU (Normal)" opacity={0.7} />
              <Line yAxisId="right" type="monotone" dataKey="revenue_best" stroke={COLORS.best} name="Revenue (Best)" dot={false} />
              <Line yAxisId="right" type="monotone" dataKey="revenue_normal" stroke={COLORS.normal} name="Revenue (Normal)" dot={false} />
              <Line yAxisId="right" type="monotone" dataKey="revenue_worst" stroke={COLORS.worst} name="Revenue (Worst)" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

// DAU Tab
const DAUTab: React.FC<{ results: ProjectionResult }> = ({ results }) => {
  const chartData = results.results.best.dau.series.map((_, idx) => ({
    day: idx + 1,
    best: results.results.best.dau.series[idx],
    normal: results.results.normal.dau.series[idx],
    worst: results.results.worst.dau.series[idx],
  }));

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold mb-4">DAU 추이 (D+1 ~ D+90)</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" />
              <YAxis tickFormatter={(val) => formatNumber(val)} />
              <Tooltip formatter={(value: number) => formatNumber(value)} />
              <Legend />
              <Area type="monotone" dataKey="best" stroke={COLORS.best} fill={COLORS.best} fillOpacity={0.2} name="Best" />
              <Area type="monotone" dataKey="normal" stroke={COLORS.normal} fill={COLORS.normal} fillOpacity={0.2} name="Normal" />
              <Area type="monotone" dataKey="worst" stroke={COLORS.worst} fill={COLORS.worst} fillOpacity={0.2} name="Worst" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {(['best', 'normal', 'worst'] as const).map(scenario => (
          <div key={scenario} className={`p-4 rounded-lg border ${
            scenario === 'best' ? 'bg-green-50 border-green-200' :
            scenario === 'normal' ? 'bg-blue-50 border-blue-200' :
            'bg-red-50 border-red-200'
          }`}>
            <h4 className={`font-medium mb-2 ${
              scenario === 'best' ? 'text-green-700' :
              scenario === 'normal' ? 'text-blue-700' :
              'text-red-700'
            }`}>
              {scenario.charAt(0).toUpperCase() + scenario.slice(1)}
            </h4>
            <div className="space-y-1 text-sm">
              <p>Peak DAU: <span className="font-medium">{formatNumber(results.results[scenario].dau.peak)}</span></p>
              <p>평균 DAU: <span className="font-medium">{formatNumber(results.results[scenario].dau.average)}</span></p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Raw Data Tab
const RawDataTab: React.FC<{ games: GameListResponse | null }> = ({ games }) => {
  if (!games) return null;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold mb-4">Raw Data 관리</h3>
        <p className="text-gray-600 mb-4">현재 등록된 게임 데이터 목록입니다.</p>
        
        <div className="grid grid-cols-2 gap-6">
          <div>
            <h4 className="font-medium text-gray-700 mb-2">Retention ({games.retention.length}개)</h4>
            <div className="max-h-48 overflow-y-auto border rounded-lg">
              {games.retention.map(game => (
                <div key={game} className="px-3 py-2 border-b last:border-b-0 text-sm hover:bg-gray-50">
                  {game}
                </div>
              ))}
            </div>
          </div>
          <div>
            <h4 className="font-medium text-gray-700 mb-2">NRU ({games.nru.length}개)</h4>
            <div className="max-h-48 overflow-y-auto border rounded-lg">
              {games.nru.map(game => (
                <div key={game} className="px-3 py-2 border-b last:border-b-0 text-sm hover:bg-gray-50">
                  {game}
                </div>
              ))}
            </div>
          </div>
          <div>
            <h4 className="font-medium text-gray-700 mb-2">Payment Rate ({games.payment_rate.length}개)</h4>
            <div className="max-h-48 overflow-y-auto border rounded-lg">
              {games.payment_rate.map(game => (
                <div key={game} className="px-3 py-2 border-b last:border-b-0 text-sm hover:bg-gray-50">
                  {game}
                </div>
              ))}
            </div>
          </div>
          <div>
            <h4 className="font-medium text-gray-700 mb-2">ARPPU ({games.arppu.length}개)</h4>
            <div className="max-h-48 overflow-y-auto border rounded-lg">
              {games.arppu.map(game => (
                <div key={game} className="px-3 py-2 border-b last:border-b-0 text-sm hover:bg-gray-50">
                  {game}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const ResultsPanel: React.FC<ResultsPanelProps> = ({ results, activeTab, games }) => {
  const renderContent = () => {
    switch (activeTab) {
      case 'overview':
        return <OverviewTab results={results} />;
      case 'retention':
        return <RetentionTab results={results} />;
      case 'nru':
        return <NRUTab results={results} />;
      case 'revenue':
        return <RevenueTab results={results} />;
      case 'projection-total':
        return <TotalTab results={results} />;
      case 'projection-dau':
        return <DAUTab results={results} />;
      case 'raw-data':
        return <RawDataTab games={games} />;
      default:
        return <OverviewTab results={results} />;
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      {renderContent()}
    </div>
  );
};

export default ResultsPanel;
