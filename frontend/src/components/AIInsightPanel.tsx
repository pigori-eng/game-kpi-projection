import { useState } from 'react';
import { Sparkles, RefreshCw, Brain, TrendingUp, DollarSign, AlertTriangle, Target, Shield } from 'lucide-react';
import { getAIInsight } from '../utils/api';
import type { ProjectionResult } from '../types';

interface AIInsightPanelProps {
  results: ProjectionResult;
}

type AnalysisType = 'general' | 'reliability' | 'retention' | 'revenue' | 'risk' | 'competitive';

const AIInsightPanel: React.FC<AIInsightPanelProps> = ({ results }) => {
  const [loading, setLoading] = useState(false);
  const [insight, setInsight] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<AnalysisType>('general');
  const [error, setError] = useState<string | null>(null);

  const analysisTypes = [
    { id: 'general' as AnalysisType, label: '종합 분석', icon: Brain, color: 'blue', description: '전반적인 프로젝션 평가 및 액션 아이템' },
    { id: 'reliability' as AnalysisType, label: '신뢰도 평가', icon: Shield, color: 'indigo', description: '프로젝션 신뢰도 점수 및 영향 요인 분석' },
    { id: 'retention' as AnalysisType, label: '리텐션 분석', icon: TrendingUp, color: 'emerald', description: 'DAU 패턴 및 리텐션 개선 제안' },
    { id: 'revenue' as AnalysisType, label: '매출 분석', icon: DollarSign, color: 'amber', description: '매출 예측 평가 및 극대화 제안' },
    { id: 'risk' as AnalysisType, label: '리스크 분석', icon: AlertTriangle, color: 'red', description: '리스크 요인 및 완화 전략' },
    { id: 'competitive' as AnalysisType, label: '경쟁력 분석', icon: Target, color: 'purple', description: '시장 경쟁력 및 포지셔닝 평가' },
  ];

  const handleAnalyze = async () => {
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
      };
      
      const response = await getAIInsight(summaryData, selectedType);
      setInsight(response.insight);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'AI 분석 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const getTypeStyles = (type: AnalysisType, isSelected: boolean) => {
    const colorMap: Record<AnalysisType, { selected: string; default: string }> = {
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

  return (
    <div className="border border-gray-300 rounded-lg overflow-hidden">
      <div className="bg-gradient-to-r from-purple-600 to-blue-600 px-4 py-3">
        <div className="flex items-center gap-2 text-white">
          <Sparkles className="w-5 h-5" />
          <span className="font-semibold">AI 인사이트 (Gemini)</span>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* 분석 유형 선택 */}
        <div>
          <p className="text-sm text-gray-600 mb-2">분석 유형을 선택하세요:</p>
          <div className="grid grid-cols-3 gap-2">
            {analysisTypes.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => {
                  setSelectedType(id);
                  setInsight(null);
                }}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-colors ${getTypeStyles(id, selectedType === id)}`}
              >
                <Icon className="w-4 h-4" />
                <span className="font-medium">{label}</span>
              </button>
            ))}
          </div>
          
          {/* 선택된 분석 유형 설명 */}
          {selectedAnalysis && (
            <p className="mt-2 text-xs text-gray-500 italic">
              📝 {selectedAnalysis.description}
            </p>
          )}
        </div>

        {/* 분석 버튼 */}
        <button
          onClick={handleAnalyze}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 transition-colors disabled:opacity-50 font-medium"
        >
          {loading ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              AI 분석 중...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              {selectedType === 'reliability' ? '신뢰도 평가 생성' : 'AI 인사이트 생성'}
            </>
          )}
        </button>

        {/* 에러 메시지 */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            ⚠️ {error}
          </div>
        )}

        {/* 인사이트 결과 */}
        {insight && (
          <div className={`p-4 rounded-lg border ${
            selectedType === 'reliability' 
              ? 'bg-indigo-50 border-indigo-200' 
              : 'bg-gray-50 border-gray-200'
          }`}>
            <div className="flex items-center gap-2 mb-3">
              {selectedAnalysis && <selectedAnalysis.icon className={`w-5 h-5 ${
                selectedType === 'reliability' ? 'text-indigo-600' : 'text-purple-600'
              }`} />}
              <span className={`text-sm font-semibold ${
                selectedType === 'reliability' ? 'text-indigo-700' : 'text-purple-700'
              }`}>
                {selectedAnalysis?.label}
              </span>
            </div>
            <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
              {insight}
            </div>
          </div>
        )}

        {/* 안내 문구 */}
        <div className="flex items-start gap-2 text-xs text-gray-500 bg-gray-50 p-3 rounded-lg">
          <span className="text-lg">💡</span>
          <div>
            <p>AI 인사이트는 <strong>Gemini 3 Pro</strong> 모델을 사용합니다.</p>
            <p className="mt-1">분석 결과는 참고용이며, 실제 의사결정 시에는 추가적인 검토가 필요합니다.</p>
            {selectedType === 'reliability' && (
              <p className="mt-1 text-indigo-600">🔒 신뢰도 평가는 표본 데이터 품질, 시나리오 간 편차, 시장 현실성을 종합적으로 분석합니다.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIInsightPanel;
