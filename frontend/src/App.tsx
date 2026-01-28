import { useState, useEffect } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  DollarSign, 
  Database,
  Calculator,
  FileText,
  ChevronRight,
  ChevronDown,
  Play,
  Download,
  Settings,
} from 'lucide-react';
import InputPanel from './components/InputPanel';
import ResultsPanel from './components/ResultsPanel';
import type { 
  ProjectionInput, 
  ProjectionResult, 
  GameListResponse,
  TabType,
  BasicSettings
} from './types';
import { getAvailableGames, calculateProjection, getDefaultConfig } from './utils/api';

function App() {
  const [games, setGames] = useState<GameListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ProjectionResult | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [expandedSections, setExpandedSections] = useState({
    overview: true,
    projection: false,
    rawData: false,
  });

  // Default basic settings
  const defaultBasicSettings: BasicSettings = {
    launch_date: '2026-11-12',
    infrastructure_cost_ratio: 0.03,
    market_fee_ratio: 0.30,
    vat_ratio: 0.10,
    hr_cost_monthly: 1720000000,
    sustaining_mkt_ratio: 0.07,
    launch_mkt_best: 4319591521,
    launch_mkt_normal: 3926901383,
    launch_mkt_worst: 3534211245,
    cpi: 2660,
    uac: 3800,
  };

  // Input state
  // Input state - 피드백 반영 디폴트값
  const [input, setInput] = useState<ProjectionInput>({
    launch_date: '2026-11-12',
    projection_days: 365,
    retention: {
      selected_games: [],
      target_d1_retention: { best: 0.50, normal: 0.45, worst: 0.40 },
    },
    nru: {
      selected_games: [],
      d1_nru: { best: 440000, normal: 400000, worst: 360000 },
      paid_organic_ratio: 0.5,
      nvr: 0.7,
      adjustment: { best_vs_normal: -0.05, worst_vs_normal: 0.05 },  // #13: Best -5%, Worst +5%
    },
    revenue: {
      selected_games_pr: [],
      selected_games_arppu: [],
      pr_adjustment: { best_vs_normal: 0.05, worst_vs_normal: -0.05 },      // #14: PR Best +5%, Worst -5%
      arppu_adjustment: { best_vs_normal: 0.10, worst_vs_normal: -0.10 },   // #14: ARPPU Best +10%, Worst -10%
    },
    basic_settings: {
      ...defaultBasicSettings,
      hr_indirect_headcount: 20,  // #3: 간접인건비 디폴트 20명
    },
  });

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [gamesData, configData] = await Promise.all([
        getAvailableGames(),
        getDefaultConfig(),
      ]);
      setGames(gamesData);
      
      setInput(prev => ({
        ...prev,
        launch_date: configData.basic_settings.launch_date?.split('T')[0] || '2026-11-12',
        retention: {
          ...prev.retention,
          target_d1_retention: configData.retention_settings || prev.retention.target_d1_retention,
        },
        nru: {
          ...prev.nru,
          d1_nru: configData.nru_settings?.d1_nru || prev.nru.d1_nru,
          paid_organic_ratio: configData.nru_settings?.paid_organic_ratio || prev.nru.paid_organic_ratio,
          nvr: configData.nru_settings?.nvr || prev.nru.nvr,
          adjustment: configData.nru_settings?.adjustment || prev.nru.adjustment,
        },
        revenue: {
          ...prev.revenue,
          pr_adjustment: configData.revenue_settings?.pr_adjustment || prev.revenue.pr_adjustment,
          arppu_adjustment: configData.revenue_settings?.arppu_adjustment || prev.revenue.arppu_adjustment,
        },
      }));
    } catch (err) {
      setError('데이터 로딩 중 오류가 발생했습니다. 서버 연결을 확인해주세요.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCalculate = async () => {
    // 블렌딩 설정이 없고 표본도 없으면 경고만 표시 (계산은 진행)
    if (input.retention.selected_games.length === 0 && !input.blending) {
      // 표본 없으면 자동으로 벤치마크 100% 사용
      console.log('표본 게임 없음 - 벤치마크 100% 모드로 전환');
    }

    setCalculating(true);
    setError(null);
    
    try {
      const result = await calculateProjection(input);
      setResults(result);
      setActiveTab('overview');
      setExpandedSections(prev => ({ ...prev, overview: true }));
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : '계산 중 오류가 발생했습니다.';
      setError(errorMessage);
      console.error(err);
    } finally {
      setCalculating(false);
    }
  };

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const tabs = [
    { 
      section: 'overview' as const,
      items: [
        { id: 'overview' as TabType, label: 'Overview', icon: BarChart3 },
        { id: 'retention' as TabType, label: '1. Retention', icon: TrendingUp },
        { id: 'nru' as TabType, label: '2. NRU', icon: Users },
        { id: 'revenue' as TabType, label: '3. Revenue', icon: DollarSign },
      ]
    },
    {
      section: 'projection' as const,
      items: [
        { id: 'projection-total' as TabType, label: '4. Total', icon: Calculator },
        { id: 'projection-dau' as TabType, label: '5. DAU', icon: TrendingUp },
      ]
    },
    {
      section: 'rawData' as const,
      items: [
        { id: 'raw-data' as TabType, label: 'Raw Data', icon: Database },
      ]
    },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">데이터 로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-[1920px] mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-blue-600 rounded-lg p-2">
                <BarChart3 className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Game KPI Projection Tool</h1>
                <p className="text-sm text-gray-500">게임 지표 프로젝션 분석 (회귀분석 기반)</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {results && (
                <>
                  <button 
                    onClick={() => window.print()}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    PDF Export
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-[1920px] mx-auto px-4 py-6">
        {/* Error Alert */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 flex justify-between items-center">
            <span>{error}</span>
            <button 
              onClick={() => setError(null)}
              className="text-red-500 hover:text-red-700 font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {/* Input Panel */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-6 print:hidden">
          <div className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Settings className="w-5 h-5 text-blue-600" />
              입력 설정
            </h2>
            
            {games && (
              <InputPanel 
                games={games}
                input={input}
                setInput={setInput}
              />
            )}

            <div className="mt-6 flex justify-center">
              <button
                onClick={handleCalculate}
                disabled={calculating}
                className="flex items-center gap-2 px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium text-lg"
              >
                {calculating ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    계산 중...
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5" />
                    Calculate Projection
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Results Panel */}
        {results && (
          <div className="flex gap-6">
            {/* Sidebar */}
            <div className="w-64 flex-shrink-0 print:hidden">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 sticky top-6">
                <div className="p-4">
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                    📊 Results
                  </h3>
                  
                  {/* Overview Section */}
                  <div className="mb-2">
                    <button
                      onClick={() => toggleSection('overview')}
                      className="flex items-center justify-between w-full px-3 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg"
                    >
                      <span className="flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        Overview
                      </span>
                      {expandedSections.overview ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </button>
                    {expandedSections.overview && (
                      <div className="ml-4 mt-1 space-y-1">
                        {tabs[0].items.map(tab => (
                          <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 w-full px-3 py-2 text-sm rounded-lg transition-colors ${
                              activeTab === tab.id
                                ? 'bg-blue-50 text-blue-700 font-medium'
                                : 'text-gray-600 hover:bg-gray-50'
                            }`}
                          >
                            <tab.icon className="w-4 h-4" />
                            {tab.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Projection Section */}
                  <div className="mb-2">
                    <button
                      onClick={() => toggleSection('projection')}
                      className="flex items-center justify-between w-full px-3 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg"
                    >
                      <span className="flex items-center gap-2">
                        <Calculator className="w-4 h-4" />
                        Projection
                      </span>
                      {expandedSections.projection ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </button>
                    {expandedSections.projection && (
                      <div className="ml-4 mt-1 space-y-1">
                        {tabs[1].items.map(tab => (
                          <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 w-full px-3 py-2 text-sm rounded-lg transition-colors ${
                              activeTab === tab.id
                                ? 'bg-blue-50 text-blue-700 font-medium'
                                : 'text-gray-600 hover:bg-gray-50'
                            }`}
                          >
                            <tab.icon className="w-4 h-4" />
                            {tab.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Raw Data Section */}
                  <div>
                    <button
                      onClick={() => toggleSection('rawData')}
                      className="flex items-center justify-between w-full px-3 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg"
                    >
                      <span className="flex items-center gap-2">
                        <Database className="w-4 h-4" />
                        Raw Data
                      </span>
                      {expandedSections.rawData ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </button>
                    {expandedSections.rawData && (
                      <div className="ml-4 mt-1 space-y-1">
                        {tabs[2].items.map(tab => (
                          <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 w-full px-3 py-2 text-sm rounded-lg transition-colors ${
                              activeTab === tab.id
                                ? 'bg-blue-50 text-blue-700 font-medium'
                                : 'text-gray-600 hover:bg-gray-50'
                            }`}
                          >
                            <tab.icon className="w-4 h-4" />
                            {tab.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Main Content */}
            <div className="flex-1">
              <ResultsPanel 
                results={results} 
                activeTab={activeTab}
                games={games}
                basicSettings={input.basic_settings}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
