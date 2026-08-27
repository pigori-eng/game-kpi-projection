import { useState, useCallback, useEffect } from 'react';
import { Sparkles, RefreshCw, Brain, TrendingUp, DollarSign, AlertTriangle, Target, Shield, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import { getAIInsight } from '../utils/api';
import type { ProjectionResult } from '../types';

interface AIInsightPanelProps {
  results: ProjectionResult;
  autoLoad?: boolean;  // V7: 자동 로드 옵션
}

type AnalysisType = 'executive_report' | 'general' | 'reliability' | 'retention' | 'revenue' | 'risk' | 'competitive';

// 캐시된 인사이트 저장
type InsightCache = Partial<Record<AnalysisType, string>>;

const AIInsightPanel: React.FC<AIInsightPanelProps> = ({ results, autoLoad = true }) => {
  const [loading, setLoading] = useState(false);
  const [insightCache, setInsightCache] = useState<InsightCache>({});
  const [selectedType, setSelectedType] = useState<AnalysisType>('executive_report');
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const analysisTypes = [
    { id: 'executive_report' as AnalysisType, label: '📋 종합분석 보고서', icon: FileText, color: 'violet', description: 'Go/No-Go 권고, 산술 근거, 4명 전문가 종합 분석 (자동 생성)', main: true },
    { id: 'general' as AnalysisType, label: '종합 분석', icon: Brain, color: 'blue', description: '4명의 전문가가 종합 평가' },
    { id: 'reliability' as AnalysisType, label: '신뢰도 평가', icon: Shield, color: 'indigo', description: '프로젝션 신뢰도 점수 및 전문가별 평가' },
    { id: 'retention' as AnalysisType, label: '리텐션 분석', icon: TrendingUp, color: 'emerald', description: 'DAU 패턴 및 리텐션 개선 액션 플랜' },
    { id: 'revenue' as AnalysisType, label: '매출 분석', icon: DollarSign, color: 'amber', description: '손익분기점, ARPU, 매출 극대화 전략' },
    { id: 'risk' as AnalysisType, label: '리스크 분석', icon: AlertTriangle, color: 'red', description: '전문가별 리스크 식별 및 완화 전략' },
    { id: 'competitive' as AnalysisType, label: '경쟁력 분석', icon: Target, color: 'purple', description: '시장 경쟁력 등급 및 강화 전략' },
  ];

  const fetchInsight = useCallback(async (type: AnalysisType) => {
    if (insightCache[type]) return;

    setLoading(true);
    setError(null);
    
    try {
      const summaryData = {
        launch_date: results.input.launch_date,
        projection_days: results.input.projection_days,
        selected_games: results.input.retention_games,
        best: results.summary.best,
        normal: results.summary.normal,
        worst: results.summary.worst,
        // V7: blending 정보 추가
        blending: results.blending,
        v7_settings: (results as any).v7_settings,
        // V13.1 P3a: Backend calculates → AI interprets (신뢰도 창작 금지)
        reliability_card: (results as any).reliability_card,
        external_evidence: (results as any).external_evidence,
      };
      
      const response = await getAIInsight(summaryData, type);
      
      setInsightCache(prev => ({
        ...prev,
        [type]: response.insight
      }));
    } catch (err: any) {
      console.error("AI Insight Error:", err);
      // 더 상세한 에러 메시지 표시
      const errorDetail = err.response?.data?.detail || err.response?.data?.message || err.message;
      const statusCode = err.response?.status;
      let userMessage = 'AI 분석 중 오류가 발생했습니다.';
      
      if (statusCode === 401 || statusCode === 403) {
        userMessage = '🔑 OpenAI API 키가 설정되지 않았거나 유효하지 않습니다. 백엔드 환경변수를 확인하세요.';
      } else if (statusCode === 408 || err.code === 'ECONNABORTED') {
        userMessage = '⏱️ AI 응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.';
      } else if (statusCode === 500) {
        userMessage = `🔧 서버 오류: ${errorDetail || '백엔드 로그를 확인하세요.'}`;
      } else if (statusCode === 503) {
        userMessage = '🔌 AI 서비스가 일시적으로 사용 불가합니다. OpenAI 상태를 확인하세요.';
      } else if (errorDetail) {
        userMessage = `❌ ${errorDetail}`;
      }
      
      setError(userMessage);
    } finally {
      setLoading(false);
    }
  }, [results, insightCache]);

  // V7: 자동 로드 - 컴포넌트 마운트 시 executive_report 자동 생성
  useEffect(() => {
    if (autoLoad && !insightCache['executive_report']) {
      fetchInsight('executive_report');
    }
  }, [autoLoad, fetchInsight]);

  const handleAnalyze = useCallback(async () => {
    await fetchInsight(selectedType);
  }, [fetchInsight, selectedType]);

  const handleTypeChange = (type: AnalysisType) => {
    setSelectedType(type);
    setError(null);
  };

  const getTypeStyles = (type: AnalysisType, isSelected: boolean) => {
    const colorMap: Record<AnalysisType, { selected: string; default: string }> = {
      executive_report: { selected: 'bg-violet-100 text-violet-700 border-violet-300', default: 'hover:bg-violet-50' },
      general: { selected: 'bg-blue-100 text-blue-700 border-blue-300', default: 'hover:bg-blue-50' },
      reliability: { selected: 'bg-indigo-100 text-indigo-700 border-indigo-300', default: 'hover:bg-indigo-50' },
      retention: { selected: 'bg-emerald-100 text-emerald-700 border-emerald-300', default: 'hover:bg-emerald-50' },
      revenue: { selected: 'bg-amber-100 text-amber-700 border-amber-300', default: 'hover:bg-amber-50' },
      risk: { selected: 'bg-red-100 text-red-700 border-red-300', default: 'hover:bg-red-50' },
      competitive: { selected: 'bg-purple-100 text-purple-700 border-purple-300', default: 'hover:bg-purple-50' },
    };
    return isSelected ? colorMap[type].selected : `bg-gray-100 text-gray-600 border-gray-200 ${colorMap[type].default}`;
  };

  const selectedAnalysis = analysisTypes.find(t => t.id === selectedType);
  const currentInsight = insightCache[selectedType];
  const executiveReport = insightCache['executive_report'];

  return (
    <div className="border-2 border-violet-300 rounded-xl overflow-hidden shadow-lg">
      {/* V8: 종합분석 보고서 헤더 */}
      <div className="bg-gradient-to-r from-violet-600 via-purple-600 to-blue-600 px-4 py-4">
        <div className="flex items-center justify-between text-white">
          <div className="flex items-center gap-2">
            <FileText className="w-6 h-6" />
            <span className="font-bold text-lg">AI 종합분석 보고서</span>
            <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">Integrated Analysis</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Sparkles className="w-4 h-4" />
            <span>GPT-4o · Multi-Persona</span>
          </div>
        </div>
        <p className="text-violet-200 text-sm mt-1">4명의 전문가 (UA마케터, 퍼블리싱, 데이터 사이언스, 라이브 서비스)가 분석한 의사결정 지원 보고서</p>
      </div>

      <div className="p-4 space-y-4 bg-gradient-to-b from-violet-50 to-white">
        {/* V8: 메인 종합분석 보고서 (자동 로드) */}
        {loading && selectedType === 'executive_report' && !executiveReport ? (
          <div className="p-6 bg-white rounded-lg border-2 border-violet-200 text-center">
            <RefreshCw className="w-8 h-8 animate-spin text-violet-600 mx-auto mb-2" />
            <p className="text-violet-700 font-medium">AI 종합분석 보고서 생성 중...</p>
            <p className="text-sm text-gray-500">4명의 전문가가 분석하고 있습니다</p>
          </div>
        ) : executiveReport ? (
          <div className="p-5 bg-white rounded-lg border-2 border-violet-200 shadow-sm">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-violet-100">
              <FileText className="w-5 h-5 text-violet-600" />
              <span className="font-bold text-violet-800">📋 종합분석 보고서</span>
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full ml-auto">✓ 자동 생성 완료</span>
            </div>
            <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
              {executiveReport}
            </div>
          </div>
        ) : (
          <div className="p-6 bg-white rounded-lg border-2 border-dashed border-violet-200 text-center">
            <FileText className="w-8 h-8 text-violet-400 mx-auto mb-2" />
            <p className="text-gray-600">AI 종합분석 보고서를 생성하려면 아래 버튼을 클릭하세요</p>
          </div>
        )}

        {/* 산술 근거 표시 */}
        {results.blending && (
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200 text-sm">
            <div className="flex items-center gap-2 mb-2">
              <span className="font-semibold text-blue-800">📐 이 결과가 도출된 산술 근거</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-blue-700">
              <div className="bg-white rounded px-2 py-1">
                <span className="text-gray-500">블렌딩:</span> 내부 {(results.blending.weight_internal * 100).toFixed(0)}%
              </div>
              <div className="bg-white rounded px-2 py-1">
                <span className="text-gray-500">Time-Decay:</span> {results.blending.time_decay ? '활성' : '비활성'}
              </div>
              <div className="bg-white rounded px-2 py-1">
                <span className="text-gray-500">품질등급:</span> {(results as any).v7_settings?.quality_score || 'B'}급
              </div>
              <div className="bg-white rounded px-2 py-1">
                <span className="text-gray-500">BM타입:</span> {(results as any).v7_settings?.bm_type || 'Midcore'}
              </div>
            </div>
          </div>
        )}

        {/* 에러 메시지 */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-start justify-between">
              <div className="text-red-700 text-sm">{error}</div>
              <button
                onClick={() => {
                  setError(null);
                  setInsightCache(prev => ({ ...prev, [selectedType]: undefined }));
                  fetchInsight(selectedType);
                }}
                className="ml-3 px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 text-xs rounded-md flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                재시도
              </button>
            </div>
            <p className="text-xs text-red-500 mt-2">💡 Tip: OpenAI API 키 확인, 네트워크 상태, Render 로그를 점검하세요.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AIInsightPanel;
