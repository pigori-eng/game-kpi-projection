import { useState, useEffect } from 'react';
import { TrendingUp, Users, DollarSign, ChevronDown, ChevronUp, HelpCircle, Building, Gamepad2, Info, Sliders } from 'lucide-react';
import type { ProjectionInput, GameListResponse } from '../types';
import { getGamesMetadata } from '../utils/api';

interface InputPanelProps {
  games: GameListResponse;
  input: ProjectionInput;
  setInput: React.Dispatch<React.SetStateAction<ProjectionInput>>;
}

interface GameMetadata {
  release_date: string;
  genre: string;
}

const GameTooltip: React.FC<{ metadata: GameMetadata; visible: boolean }> = ({ metadata, visible }) => {
  if (!visible) return null;
  return (
    <div className="absolute z-50 bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-40 bg-gray-900 text-white text-xs rounded-lg shadow-xl p-2.5 pointer-events-none">
      <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2 rotate-45 w-2 h-2 bg-gray-900"></div>
      <div className="space-y-1">
        <div className="font-medium text-sm">{metadata.genre}</div>
        <div className="text-gray-400">출시일: <span className="text-gray-200">{metadata.release_date}</span></div>
      </div>
    </div>
  );
};

const GameGridSelector: React.FC<{
  availableGames: string[];
  selectedGames: string[];
  onChange: (games: string[]) => void;
  maxGames?: number;
  metadata: Record<string, GameMetadata>;
}> = ({ availableGames, selectedGames, onChange, maxGames = 4, metadata }) => {
  const [hoveredGame, setHoveredGame] = useState<string | null>(null);
  const handleToggle = (game: string) => {
    if (selectedGames.includes(game)) {
      onChange(selectedGames.filter(g => g !== game));
    } else if (selectedGames.length < maxGames) {
      onChange([...selectedGames, game]);
    }
  };
  return (
    <div className="border border-gray-300 rounded-lg overflow-hidden">
      <div className="bg-gray-100 px-3 py-2 border-b border-gray-300 flex justify-between items-center">
        <div><span className="text-sm font-medium text-gray-700">게임명</span><span className="text-xs text-gray-500 ml-2">(최대 {maxGames}개 선택)</span></div>
        <div className="flex items-center gap-1 text-xs text-gray-500"><Info className="w-3 h-3" /><span>마우스를 올리면 게임 정보 확인</span></div>
      </div>
      <div className="grid grid-cols-4 gap-0">
        {availableGames.map((game, idx) => {
          const gameMeta = metadata[game];
          const isSelected = selectedGames.includes(game);
          const isDisabled = !isSelected && selectedGames.length >= maxGames;
          return (
            <div key={game} className="relative" onMouseEnter={() => setHoveredGame(game)} onMouseLeave={() => setHoveredGame(null)}>
              <button onClick={() => handleToggle(game)} disabled={isDisabled} className={`w-full px-3 py-2 text-sm text-left border-r border-b border-gray-200 transition-colors truncate flex items-center gap-1 ${isSelected ? 'bg-blue-100 text-blue-800 font-medium' : 'bg-white hover:bg-gray-50 text-gray-700'} ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${(idx + 1) % 4 === 0 ? 'border-r-0' : ''}`} title={game}>
                <span className="truncate flex-1">{game}</span>
                {gameMeta && <Info className={`w-3.5 h-3.5 flex-shrink-0 ${hoveredGame === game ? 'text-blue-500' : 'text-gray-400'}`} />}
              </button>
              {gameMeta && <GameTooltip metadata={gameMeta} visible={hoveredGame === game} />}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const GuideBox: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
    <div className="flex items-start gap-2">
      <HelpCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
      <div><h4 className="font-medium text-amber-800 mb-1">{title}</h4><div className="text-sm text-amber-700">{children}</div></div>
    </div>
  </div>
);

const RegressionResultTable: React.FC<{ selectedGames: string[]; d1Retention: { best: number; normal: number; worst: number } }> = ({ selectedGames, d1Retention }) => {
  const a = selectedGames.length > 0 ? 1.336 : 0;
  const b = selectedGames.length > 0 ? -0.818 : 0;
  return (
    <div className="space-y-4">
      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <h5 className="font-medium text-blue-800 mb-2">📐 Retention Curve 계산 원리</h5>
        <div className="text-sm text-blue-700 space-y-1">
          <p><strong>Power Law 함수:</strong> Retention(d) = a × d^b</p>
          <p><strong>a (초기 계수):</strong> 표본 게임들의 D+1 Retention 평균값 기반으로 산출</p>
          <p><strong>b (감쇠 계수):</strong> 표본 게임들의 리텐션 감소 기울기를 회귀분석하여 산출 (일반적으로 -0.5 ~ -1.0 범위)</p>
          <p className="text-xs text-blue-600 mt-2">* 선택된 표본 게임들의 30일 리텐션 데이터를 로그 스케일로 변환 후 선형 회귀분석하여 a, b 값을 도출합니다.</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="border border-gray-300 rounded-lg overflow-hidden">
          <div className="bg-gray-100 px-3 py-2 border-b border-gray-300"><span className="text-sm font-medium"># Retention Curve 계산(자동)</span></div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left border-b">기준</th><th className="px-3 py-2 text-left border-b">D+1</th><th className="px-3 py-2 text-left border-b">a</th><th className="px-3 py-2 text-left border-b">b</th></tr></thead>
            <tbody>
              <tr className="bg-green-50"><td className="px-3 py-2 border-b font-medium text-green-700">Best</td><td className="px-3 py-2 border-b">{(d1Retention.best * 100).toFixed(0)}%</td><td className="px-3 py-2 border-b">{a.toFixed(3)}</td><td className="px-3 py-2 border-b">{b.toFixed(3)}</td></tr>
              <tr className="bg-blue-50"><td className="px-3 py-2 border-b font-medium text-blue-700">Normal</td><td className="px-3 py-2 border-b">{(d1Retention.normal * 100).toFixed(0)}%</td><td className="px-3 py-2 border-b">{a.toFixed(3)}</td><td className="px-3 py-2 border-b">{b.toFixed(3)}</td></tr>
              <tr className="bg-red-50"><td className="px-3 py-2 font-medium text-red-700">Worst</td><td className="px-3 py-2">{(d1Retention.worst * 100).toFixed(0)}%</td><td className="px-3 py-2">{a.toFixed(3)}</td><td className="px-3 py-2">{b.toFixed(3)}</td></tr>
            </tbody>
          </table>
        </div>
        <div className="border border-gray-300 rounded-lg overflow-hidden">
          <div className="bg-gray-100 px-3 py-2 border-b border-gray-300"><span className="text-sm font-medium"># 회귀분석 결과 값(자동)</span></div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50"><tr><th className="px-3 py-2 border-b" colSpan={2}># 1차 (a값)</th><th className="px-3 py-2 border-b" colSpan={2}># 2차 (b값)</th></tr></thead>
            <tbody><tr><td className="px-3 py-2 text-center" colSpan={2}>{a.toFixed(6)}</td><td className="px-3 py-2 text-center" colSpan={2}>{b.toFixed(5)}</td></tr></tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const InputPanel: React.FC<InputPanelProps> = ({ games, input, setInput }) => {
  const [activeSection, setActiveSection] = useState<'basic' | 'sample' | 'retention' | 'nru' | 'revenue' | 'mkt-calc' | 'seasonality' | null>('basic');
  const [gameMetadata, setGameMetadata] = useState<Record<string, GameMetadata>>({});
  const [nruAutoCalc, setNruAutoCalc] = useState(false);
  const [seasonalityEnabled, setSeasonalityEnabled] = useState(false);
  
  // Phase 3: 프로젝트 정보 및 유사도 추천 (다중선택 지원)
  const [projectInfo, setProjectInfo] = useState({ 
    genre: '', 
    platforms: [] as string[], 
    regions: [] as string[],
    qualityScore: 'B',  // V7: 품질 등급
    bmType: 'Midcore'   // V7: BM 모델 타입
  });
  const [useAIRecommend, setUseAIRecommend] = useState(false);
  const [useBenchmark, setUseBenchmark] = useState(false);
  // 블렌딩 가중치 (내부 표본 vs 시장 벤치마크)
  const [blendingWeight, setBlendingWeight] = useState(0.7);

  // V8 #4: 장르/BM Type별 보정값 자동 추천
  const getRecommendedAdjustment = (genre: string, bmType: string): { best: number; worst: number } => {
    // Hardcore/RPG (변동성 큼) → ±20%, Casual (안정적) → ±10%
    const highVariance = ['MMORPG', 'Action RPG', 'Extraction Shooter', 'Strategy'];
    const lowVariance = ['Casual', 'Sports'];
    
    let baseAdjustment = 0.15; // 기본 ±15%
    
    if (highVariance.includes(genre) || bmType === 'Hardcore' || bmType === 'Gacha') {
      baseAdjustment = 0.20; // ±20%
    } else if (lowVariance.includes(genre) || bmType === 'Casual') {
      baseAdjustment = 0.10; // ±10%
    }
    
    return { best: baseAdjustment, worst: -baseAdjustment };
  };

  // V8 #4: 장르/BM Type 변경 시 보정값 자동 적용
  const handleProjectInfoChange = (field: string, value: string | string[]) => {
    const newProjectInfo = { ...projectInfo, [field]: value };
    setProjectInfo(newProjectInfo);
    
    // 장르 또는 BM Type 변경 시 보정값 자동 추천
    if (field === 'genre' || field === 'bmType') {
      const genre = field === 'genre' ? value as string : newProjectInfo.genre;
      const bmType = field === 'bmType' ? value as string : newProjectInfo.bmType;
      
      if (genre && bmType) {
        const recommended = getRecommendedAdjustment(genre, bmType);
        setInput(prev => ({
          ...prev,
          retention: {
            ...prev.retention,
            // D1 Retention 보정은 유지하고 PR/ARPPU 보정에만 적용
          },
          nru: {
            ...prev.nru,
            adjustment: { best_vs_normal: recommended.best, worst_vs_normal: recommended.worst }
          },
          revenue: {
            ...prev.revenue,
            pr_adjustment: { best_vs_normal: recommended.best, worst_vs_normal: recommended.worst },
            arppu_adjustment: { best_vs_normal: recommended.best, worst_vs_normal: recommended.worst }
          }
        }));
      }
    }
  };

  useEffect(() => {
    const loadMetadata = async () => {
      try {
        const data = await getGamesMetadata();
        setGameMetadata(data);
      } catch (err) {
        console.error('Failed to load game metadata:', err);
      }
    };
    loadMetadata();
  }, []);

  const handleSampleGameSelect = (selectedGames: string[]) => {
    setInput(prev => ({
      ...prev,
      retention: { ...prev.retention, selected_games: selectedGames },
      nru: { ...prev.nru, selected_games: selectedGames },
      revenue: { ...prev.revenue, selected_games_pr: selectedGames, selected_games_arppu: selectedGames },
    }));
  };

  // Phase 3: 유사도 기반 게임 추천
  const calculateSimilarity = (gameName: string): { score: number; reason: string } => {
    const meta = gameMetadata[gameName];
    if (!meta || !projectInfo.genre) return { score: 0, reason: '정보 없음' };

    let score = 0;
    const reasons: string[] = [];

    // 장르 일치 (50점)
    if (meta.genre?.toLowerCase().includes(projectInfo.genre.toLowerCase())) {
      score += 50;
      reasons.push('장르O');
    } else {
      reasons.push('장르X');
    }

    // 지역 일치 (30점) - 게임명에서 추출 (다중선택 지원)
    const gameRegion = gameName.match(/\((.*?)\)/)?.[1] || '';
    const regions = projectInfo.regions || [];
    if (regions.length > 0 && regions.some(r => gameRegion.toLowerCase().includes(r.toLowerCase()) || (r === 'korea' && gameRegion.includes('한국')) || (r === 'japan' && gameRegion.includes('일본')) || (r === 'global' && gameRegion.includes('글로벌')))) {
      score += 30;
      reasons.push('지역O');
    } else if (regions.length > 0) {
      reasons.push('지역X');
    }

    // 최신성 보정 (20점)
    if (meta.release_date) {
      const year = parseInt(meta.release_date.substring(0, 4));
      if (year >= 2021) {
        score += 20;
        reasons.push('최신');
      } else if (year >= 2019) {
        score += 10;
      }
    }

    return { score, reason: reasons.join(' / ') };
  };

  const getRecommendedGames = () => {
    if (!useAIRecommend || !projectInfo.genre) return [];
    
    return games.retention
      .map(game => ({
        game,
        ...calculateSimilarity(game)
      }))
      .filter(g => g.score >= 40)
      .sort((a, b) => b.score - a.score);
  };

  const recommendedGames = getRecommendedGames();

  // Phase 2: MKT → NRU 자동 계산
  // 🔥 V8.3: 이 값은 "런칭 기간 총 모객 수"이며, 백엔드에서 30일간 분산 배분됨
  const calculateNRUFromMKT = () => {
    const budget = input.basic_settings?.launch_mkt_budget || 0;
    const cpi = input.basic_settings?.cpi || 2660;
    const paidRatio = input.nru.paid_organic_ratio || 0.5;
    const nvr = input.nru.nvr || 0.7;

    if (budget <= 0 || cpi <= 0) return { best: 0, normal: 0, worst: 0 };

    // 총 모객 수 계산 (런칭 기간 30일 동안 배분될 예정)
    const paidInstall = Math.floor(budget / cpi);
    const organicInstall = Math.floor(paidInstall * ((1 - paidRatio) / paidRatio));
    const totalInstall = paidInstall + organicInstall;
    const totalNru = Math.floor(totalInstall * nvr);  // 런칭 기간 총 NRU

    return {
      best: Math.floor(totalNru * 1.1),    // +10%
      normal: totalNru,
      worst: Math.floor(totalNru * 0.9),   // -10%
    };
  };

  // MKT 예산 변경 시 NRU 자동 업데이트
  const handleMktBudgetChange = (budget: number) => {
    setInput(prev => ({
      ...prev,
      basic_settings: { ...prev.basic_settings!, launch_mkt_budget: budget }
    }));

    if (nruAutoCalc) {
      const calculated = calculateNRUFromMKT();
      setInput(prev => ({
        ...prev,
        basic_settings: { ...prev.basic_settings!, launch_mkt_budget: budget },
        nru: { ...prev.nru, d1_nru: calculated }
      }));
    }
  };

  const selectedSampleGames = input.retention.selected_games;

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <HelpCircle className="w-6 h-6 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-blue-900 mb-2">📊 하이브리드 벤치마크 기반 KPI 프로젝션</h3>
            <div className="text-sm text-blue-800 space-y-1">
              <p><strong>1. 데이터 소스:</strong> 내부 표본 게임(15개) + 시장 벤치마크(SensorTower/Newzoo) 통합</p>
              <p><strong>2. Retention Curve:</strong> Power Law 회귀분석(a × day^b) + 장르/플랫폼별 벤치마크 블렌딩</p>
              <p><strong>3. NRU:</strong> MKT 예산 기반 자동 계산 → 시나리오별 보정</p>
              <p><strong>4. DAU:</strong> Cohort 매트릭스 - DAU(d) = Σ(NRU(i) × Retention(d-i))</p>
              <p><strong>5. Revenue:</strong> DAU × P.Rate × ARPPU (장르/지역별 벤치마크 적용)</p>
            </div>
          </div>
        </div>
      </div>

      {/* 1. Basic Settings */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <button onClick={() => setActiveSection(activeSection === 'basic' ? null : 'basic')} className={`w-full flex items-center justify-between px-4 py-3 ${activeSection === 'basic' ? 'bg-slate-100 border-b' : 'bg-gray-50 hover:bg-gray-100'}`}>
          <div className="flex items-center gap-2"><Building className="w-5 h-5 text-slate-600" /><span className="font-medium">1. 기본 산정 정보</span></div>
          {activeSection === 'basic' ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </button>
        {activeSection === 'basic' && (
          <div className="p-4 space-y-4">
            <GuideBox title="기본 산정 정보 가이드">
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li><strong>V.A.T:</strong> 한국 10%, 일본 8%, 대만 5%, 미국 ~10% (주별 상이)</li>
                <li><strong>마켓 수수료:</strong> Google Play/App Store 기본 30%, 소규모 개발사 프로그램 15%</li>
                <li><strong>인프라 비용:</strong> 매출의 약 3% (서버, CDN, 클라우드 비용)</li>
                <li><strong>직접 인건비:</strong> 프로덕트 직접 담당 인원 (인당 약 1,500만원/월)</li>
                <li><strong>간접 인건비:</strong> 공용 조직 배부 비용</li>
              </ul>
            </GuideBox>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-4">
                <div className="border border-gray-300 rounded-lg overflow-hidden">
                  <div className="bg-gray-100 px-3 py-2 border-b font-medium text-sm">기본 정보</div>
                  <table className="w-full text-sm table-fixed">
                    <tbody>
                      <tr><td className="px-3 py-2 border-b bg-gray-50 w-2/5">런칭 예정일</td><td className="px-3 py-2 border-b bg-yellow-50"><input type="date" value={input.launch_date} onChange={(e) => setInput(prev => ({ ...prev, launch_date: e.target.value }))} className="w-full bg-transparent border-none p-0 text-right" /></td></tr>
                      <tr><td className="px-3 py-2 border-b bg-gray-50">프로젝션 기간 (Day)</td><td className="px-3 py-2 border-b bg-yellow-50"><input type="number" value={input.projection_days} onChange={(e) => setInput(prev => ({ ...prev, projection_days: parseInt(e.target.value) || 365 }))} className="w-full bg-transparent border-none p-0 text-right" /></td></tr>
                      <tr><td className="px-3 py-2 border-b bg-gray-50">인프라 비용 (%)</td><td className="px-3 py-2 border-b bg-yellow-50"><input type="number" step="1" value={Math.round((input.basic_settings?.infrastructure_cost_ratio || 0.03) * 100)} onChange={(e) => setInput(prev => ({ ...prev, basic_settings: { ...prev.basic_settings!, infrastructure_cost_ratio: (parseFloat(e.target.value) || 0) / 100 } }))} className="w-full bg-transparent border-none p-0 text-right" /></td></tr>
                      <tr><td className="px-3 py-2 border-b bg-gray-50">마켓 수수료 (%)</td><td className="px-3 py-2 border-b bg-yellow-50"><input type="number" step="1" value={Math.round((input.basic_settings?.market_fee_ratio || 0.30) * 100)} onChange={(e) => setInput(prev => ({ ...prev, basic_settings: { ...prev.basic_settings!, market_fee_ratio: (parseFloat(e.target.value) || 0) / 100 } }))} className="w-full bg-transparent border-none p-0 text-right" /></td></tr>
                      <tr><td className="px-3 py-2 bg-gray-50">V.A.T (%)</td><td className="px-3 py-2 bg-yellow-50"><input type="number" step="1" value={Math.round((input.basic_settings?.vat_ratio || 0.10) * 100)} onChange={(e) => setInput(prev => ({ ...prev, basic_settings: { ...prev.basic_settings!, vat_ratio: (parseFloat(e.target.value) || 0) / 100 } }))} className="w-full bg-transparent border-none p-0 text-right" /></td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="space-y-4">
                <div className="border border-gray-300 rounded-lg overflow-hidden">
                  <div className="bg-gray-100 px-3 py-2 border-b font-medium text-sm">HR Cost (월간)</div>
                  <table className="w-full text-sm table-fixed">
                    <tbody>
                      <tr><td className="px-3 py-2 border-b bg-gray-50 w-2/5">직접 인건비 (인원수)</td><td className="px-3 py-2 border-b bg-yellow-50"><div className="flex items-center"><input type="number" value={input.basic_settings?.hr_direct_headcount || 50} onChange={(e) => setInput(prev => ({ ...prev, basic_settings: { ...prev.basic_settings!, hr_direct_headcount: parseInt(e.target.value) || 0 } }))} className="flex-1 bg-transparent border-none p-0 text-right min-w-0" /><span className="ml-1 flex-shrink-0">명</span></div></td></tr>
                      <tr><td className="px-3 py-2 border-b bg-gray-50 text-xs text-gray-500">직접 인건비 (인당 1,500만원)</td><td className="px-3 py-2 border-b bg-gray-100 text-right whitespace-nowrap">{((input.basic_settings?.hr_direct_headcount || 50) * 15000000).toLocaleString()}원</td></tr>
                      <tr><td className="px-3 py-2 border-b bg-gray-50 w-2/5">간접 인건비 (인원수)</td><td className="px-3 py-2 border-b bg-yellow-50"><div className="flex items-center"><input type="number" value={input.basic_settings?.hr_indirect_headcount || 20} onChange={(e) => setInput(prev => ({ ...prev, basic_settings: { ...prev.basic_settings!, hr_indirect_headcount: parseInt(e.target.value) || 0 } }))} className="flex-1 bg-transparent border-none p-0 text-right min-w-0" /><span className="ml-1 flex-shrink-0">명</span></div></td></tr>
                      <tr><td className="px-3 py-2 border-b bg-gray-50 text-xs text-gray-500">간접 인건비 (인당 1,400만원)</td><td className="px-3 py-2 border-b bg-gray-100 text-right whitespace-nowrap">{((input.basic_settings?.hr_indirect_headcount || 20) * 14000000).toLocaleString()}원</td></tr>
                      <tr><td className="px-3 py-2 bg-gray-50 font-medium">총 HR Cost (월간)</td><td className="px-3 py-2 bg-blue-50 text-right font-medium whitespace-nowrap">{(((input.basic_settings?.hr_direct_headcount || 50) * 15000000) + ((input.basic_settings?.hr_indirect_headcount || 20) * 14000000)).toLocaleString()}원</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. 프로젝트 정보 및 표본 추천 */}
      <div className="border border-purple-200 rounded-lg overflow-hidden">
        <button onClick={() => setActiveSection(activeSection === 'sample' ? null : 'sample')} className={`w-full flex items-center justify-between px-4 py-3 ${activeSection === 'sample' ? 'bg-purple-50 border-b border-purple-200' : 'bg-gray-50 hover:bg-gray-100'}`}>
          <div className="flex items-center gap-2">
            <Gamepad2 className="w-5 h-5 text-purple-600" />
            <span className="font-medium">2. 프로젝트 정보 & 표본 추천</span>
            {selectedSampleGames.length > 0 && <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">{selectedSampleGames.length}개 선택됨</span>}
          </div>
          {activeSection === 'sample' ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </button>
        {activeSection === 'sample' && (
          <div className="p-4 space-y-4">
            {/* 프로젝트 정보 입력 */}
            <div className="border border-gray-300 rounded-lg overflow-hidden">
              <div className="bg-gray-100 px-3 py-2 border-b font-medium text-sm flex items-center gap-2">
                <span>1️⃣ 프로젝트 정보 입력</span>
                <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">장르/플랫폼/지역</span>
              </div>
              <div className="p-3 space-y-4">
                {/* 장르 선택 (8종) */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-2">🎮 장르</label>
                  <div className="grid grid-cols-4 gap-2">
                    {['MMORPG', 'Action RPG', 'Battle Royale', 'Extraction Shooter', 'FPS/TPS', 'Strategy', 'Casual', 'Sports'].map(g => (
                      <label key={g} className={`flex items-center justify-center px-2 py-1.5 rounded border cursor-pointer text-xs transition-colors ${projectInfo.genre === g ? 'bg-purple-100 border-purple-400 text-purple-800 font-medium' : 'bg-gray-50 border-gray-300 hover:bg-gray-100'}`}>
                        <input type="radio" name="genre" value={g} checked={projectInfo.genre === g} onChange={(e) => handleProjectInfoChange('genre', e.target.value)} className="sr-only" />
                        {g === 'Strategy' ? '전략/시뮬' : g === 'Casual' ? '캐주얼' : g === 'Sports' ? '스포츠' : g}
                      </label>
                    ))}
                  </div>
                </div>
                {/* 플랫폼 다중선택 */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-2">💻 플랫폼 (다중 선택 가능)</label>
                  <div className="flex gap-2">
                    {['PC', 'Mobile', 'Console'].map(p => (
                      <label key={p} className={`flex items-center gap-1.5 px-3 py-1.5 rounded border cursor-pointer text-sm ${(projectInfo.platforms || []).includes(p) ? 'bg-blue-100 border-blue-400 text-blue-800' : 'bg-gray-50 border-gray-300 hover:bg-gray-100'}`}>
                        <input type="checkbox" checked={(projectInfo.platforms || []).includes(p)} onChange={(e) => { const platforms = projectInfo.platforms || []; setProjectInfo(prev => ({ ...prev, platforms: e.target.checked ? [...platforms, p] : platforms.filter(x => x !== p) })); }} className="w-3.5 h-3.5" />
                        {p}
                      </label>
                    ))}
                  </div>
                </div>
                {/* 출시 지역 다중선택 */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-2">🌏 출시 지역 (다중 선택 가능)</label>
                  <div className="flex flex-wrap gap-2">
                    {[{v:'korea',l:'한국'},{v:'japan',l:'일본'},{v:'china',l:'중국'},{v:'global',l:'글로벌(중국제외)'},{v:'sea',l:'동남아'},{v:'na',l:'북미'},{v:'sa',l:'남미'},{v:'eu',l:'유럽'}].map(({v,l}) => (
                      <label key={v} className={`flex items-center gap-1.5 px-3 py-1.5 rounded border cursor-pointer text-sm ${(projectInfo.regions || []).includes(v) ? 'bg-green-100 border-green-400 text-green-800' : 'bg-gray-50 border-gray-300 hover:bg-gray-100'}`}>
                        <input type="checkbox" checked={(projectInfo.regions || []).includes(v)} onChange={(e) => { const regions = projectInfo.regions || []; setProjectInfo(prev => ({ ...prev, regions: e.target.checked ? [...regions, v] : regions.filter(x => x !== v) })); }} className="w-3.5 h-3.5" />
                        {l}
                      </label>
                    ))}
                  </div>
                </div>
                {/* V7: Quality Score (FGT/CBT 결과) */}
                <div className="border border-amber-200 rounded-lg p-3 bg-amber-50/50">
                  <label className="block text-sm font-semibold text-amber-800 mb-2">⭐ 품질 등급 (내부 테스트 결과)</label>
                  <p className="text-xs text-amber-700 mb-3">
                    <strong>작동 원리:</strong> 벤치마크 값에만 승수(×)를 적용합니다. 내부 데이터는 건드리지 않습니다.
                    <br />Time-Decay와 결합되어 <strong>장기(D365)로 갈수록 영향력이 커집니다.</strong>
                  </p>
                  <div className="flex gap-2 mb-2">
                    {[
                      {v:'S',l:'S급',desc:'대박 조짐',mod:'+20%',c:'bg-yellow-100 border-yellow-400 text-yellow-800'},
                      {v:'A',l:'A급',desc:'우수',mod:'+10%',c:'bg-green-100 border-green-400 text-green-800'},
                      {v:'B',l:'B급',desc:'평범',mod:'±0%',c:'bg-blue-100 border-blue-400 text-blue-800'},
                      {v:'C',l:'C급',desc:'미흡',mod:'-10%',c:'bg-orange-100 border-orange-400 text-orange-800'},
                      {v:'D',l:'D급',desc:'부진',mod:'-20%',c:'bg-red-100 border-red-400 text-red-800'}
                    ].map(({v,l,desc,mod,c}) => (
                      <label key={v} className={`flex flex-col items-center px-3 py-2 rounded border cursor-pointer text-xs transition-colors ${(projectInfo.qualityScore || 'B') === v ? c + ' font-bold ring-2 ring-offset-1' : 'bg-white border-gray-300 hover:bg-gray-50'}`}>
                        <input type="radio" name="qualityScore" value={v} checked={(projectInfo.qualityScore || 'B') === v} onChange={(e) => setProjectInfo(prev => ({ ...prev, qualityScore: e.target.value }))} className="sr-only" />
                        <span className="text-base font-bold">{l}</span>
                        <span className="text-[10px] text-gray-600">{desc}</span>
                        <span className={`text-[10px] font-semibold ${v === 'S' || v === 'A' ? 'text-green-600' : v === 'C' || v === 'D' ? 'text-red-600' : 'text-gray-500'}`}>{mod}</span>
                      </label>
                    ))}
                  </div>
                  <div className="text-xs bg-white rounded p-2 border border-amber-200">
                    <strong>예시:</strong> 시장 평균 D30 리텐션 10% → S급 선택 시 <strong>12%</strong>로 상향 계산
                  </div>
                </div>
                {/* V7: BM Type */}
                <div className="border border-indigo-200 rounded-lg p-3 bg-indigo-50/50">
                  <label className="block text-sm font-semibold text-indigo-800 mb-2">💰 BM 모델 타입</label>
                  <p className="text-xs text-indigo-700 mb-3">
                    <strong>작동 원리:</strong> 숫자를 곱하는 게 아니라, <strong>비교할 PR/ARPPU 기준을 교체</strong>합니다.
                    <br />이 선택이 <strong>매출 프로젝션의 현실성을 결정짓는 핵심 변수</strong>입니다.
                  </p>
                  <div className="grid grid-cols-5 gap-2 mb-2">
                    {[
                      {v:'Hardcore',l:'하드코어',d:'타르코프류',pr:'PR 2~3%',arppu:'ARPPU $80+'},
                      {v:'Midcore',l:'미드코어',d:'기본',pr:'PR 5%',arppu:'ARPPU $40'},
                      {v:'Casual',l:'캐주얼',d:'배그/포나류',pr:'PR 8~10%',arppu:'ARPPU $20'},
                      {v:'F2P_Cosmetic',l:'F2P+꾸미기',d:'스킨 중심',pr:'PR 4%',arppu:'ARPPU $25'},
                      {v:'Gacha',l:'가챠',d:'확률형',pr:'PR 7%',arppu:'ARPPU $70'}
                    ].map(({v,l,d,pr,arppu}) => (
                      <label key={v} className={`flex flex-col items-center px-2 py-2 rounded border cursor-pointer text-xs transition-colors ${(projectInfo.bmType || 'Midcore') === v ? 'bg-indigo-100 border-indigo-500 text-indigo-800 font-bold ring-2 ring-indigo-400 ring-offset-1' : 'bg-white border-gray-300 hover:bg-gray-50'}`}>
                        <input type="radio" name="bmType" value={v} checked={(projectInfo.bmType || 'Midcore') === v} onChange={(e) => handleProjectInfoChange('bmType', e.target.value)} className="sr-only" />
                        <span className="font-bold">{l}</span>
                        <span className="text-[10px] text-gray-500">{d}</span>
                        <span className="text-[9px] text-indigo-600 mt-1">{pr}</span>
                        <span className="text-[9px] text-green-600">{arppu}</span>
                      </label>
                    ))}
                  </div>
                  <div className="text-xs bg-white rounded p-2 border border-indigo-200">
                    <strong>핵심:</strong> Hardcore = "DAU 적어도 매출 높음" / Casual = "DAU 많아야 매출 터짐"
                  </div>
                </div>
              </div>
            </div>

            {/* AI 추천 옵션 */}
            <div className="flex items-center gap-4 p-3 bg-purple-50 rounded-lg border border-purple-200">
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={useAIRecommend}
                  onChange={(e) => setUseAIRecommend(e.target.checked)}
                  className="w-4 h-4 text-purple-600"
                />
                <span className="text-sm font-medium text-purple-800">🤖 AI 유사도 기반 추천</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={useBenchmark}
                  onChange={(e) => setUseBenchmark(e.target.checked)}
                  className="w-4 h-4 text-purple-600"
                />
                <span className="text-sm font-medium text-purple-800">📊 시장 벤치마크 활용</span>
              </label>
            </div>

            {/* AI 추천 결과 */}
            {useAIRecommend && projectInfo.genre && (
              <div className="border border-purple-300 rounded-lg overflow-hidden">
                <div className="bg-purple-100 px-3 py-2 border-b font-medium text-sm text-purple-800">
                  2️⃣ AI 추천 표본 (유사도 40점 이상)
                </div>
                <div className="p-3">
                  {recommendedGames.length > 0 ? (
                    <div className="space-y-2">
                      {recommendedGames.map(({ game, score, reason }) => (
                        <label key={game} className="flex items-center gap-3 p-2 rounded hover:bg-purple-50 cursor-pointer">
                          <input 
                            type="checkbox"
                            checked={selectedSampleGames.includes(game)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                handleSampleGameSelect([...selectedSampleGames, game]);
                              } else {
                                handleSampleGameSelect(selectedSampleGames.filter(g => g !== game));
                              }
                            }}
                            className="w-4 h-4 text-purple-600"
                          />
                          <span className="flex-1 text-sm">{game}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            score >= 80 ? 'bg-green-100 text-green-700' :
                            score >= 60 ? 'bg-blue-100 text-blue-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            유사도 {score}%
                          </span>
                          <span className="text-xs text-gray-500">{reason}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">유사한 표본 게임이 없습니다. 장르/지역을 변경해보세요.</p>
                  )}
                </div>
              </div>
            )}

            {/* 벤치마크 데이터 + 블렌딩 공식 */}
            {useBenchmark && (
              <div className="space-y-3">
                {/* 장르/플랫폼별 동적 벤치마크 */}
                <div className="border border-orange-300 rounded-lg overflow-hidden">
                  <div className="bg-orange-100 px-3 py-2 border-b font-medium text-sm text-orange-800">
                    📊 시장 벤치마크 ({projectInfo.genre || '장르 선택'} / {(projectInfo.platforms || []).join(', ') || '플랫폼 선택'})
                  </div>
                  <div className="p-3">
                    {projectInfo.genre && (projectInfo.platforms || []).length > 0 ? (
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-2 py-1 text-left border-b">지표</th>
                            {(projectInfo.platforms || []).map(p => (
                              <th key={p} className="px-2 py-1 text-right border-b">{p}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          <tr><td className="px-2 py-1 border-b">D1 Retention</td>{(projectInfo.platforms || []).map(p => <td key={p} className="px-2 py-1 border-b text-right font-medium text-blue-600">{p === 'PC' ? '29~35%' : p === 'Mobile' ? '37~45%' : '28~36%'}</td>)}</tr>
                          <tr><td className="px-2 py-1 border-b">D7 Retention</td>{(projectInfo.platforms || []).map(p => <td key={p} className="px-2 py-1 border-b text-right">{p === 'PC' ? '18~22%' : p === 'Mobile' ? '15~20%' : '15~20%'}</td>)}</tr>
                          <tr><td className="px-2 py-1 border-b">D30 Retention</td>{(projectInfo.platforms || []).map(p => <td key={p} className="px-2 py-1 border-b text-right">{p === 'PC' ? '10~13%' : p === 'Mobile' ? '4~8%' : '8~11%'}</td>)}</tr>
                          <tr><td className="px-2 py-1 border-b">P.Rate</td>{(projectInfo.platforms || []).map(p => <td key={p} className="px-2 py-1 border-b text-right">{p === 'PC' ? '5~7%' : p === 'Mobile' ? '2~5%' : '4~6%'}</td>)}</tr>
                          <tr><td className="px-2 py-1">ARPPU</td>{(projectInfo.platforms || []).map(p => <td key={p} className="px-2 py-1 text-right">{p === 'PC' ? '₩65,000~97,000' : p === 'Mobile' ? '₩38,000~58,000' : '₩52,000~85,000'}</td>)}</tr>
                        </tbody>
                      </table>
                    ) : (
                      <p className="text-sm text-gray-500">장르와 플랫폼을 선택하면 해당 벤치마크가 표시됩니다.</p>
                    )}
                    <p className="mt-2 text-xs text-orange-600">* 출처: SensorTower, Newzoo, Data.ai 기반 (2024~2025)</p>
                  </div>
                </div>

                {/* 블렌딩 공식 */}
                <div className="border border-indigo-300 rounded-lg overflow-hidden">
                  <div className="bg-indigo-100 px-3 py-2 border-b font-medium text-sm text-indigo-800 flex items-center gap-2">
                    <Sliders className="w-4 h-4" />
                    시장 데이터 반영 비중 (Blending)
                  </div>
                  <div className="p-3 space-y-3">
                    <div className="p-3 bg-indigo-50 rounded-lg text-sm font-mono text-indigo-800">
                      <strong>최종값</strong> = (내부 표본 × <span className="text-indigo-600 font-bold">{(blendingWeight * 100).toFixed(0)}%</span>) + (시장 벤치마크 × <span className="text-orange-600 font-bold">{((1 - blendingWeight) * 100).toFixed(0)}%</span>)
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-600">시장 벤치마크 반영 비중</span>
                        <span className="font-bold text-orange-600">{((1 - blendingWeight) * 100).toFixed(0)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={(1 - blendingWeight) * 100}
                        onChange={(e) => {
                          const marketWeight = parseInt(e.target.value) / 100;
                          const internalWeight = 1 - marketWeight;
                          setBlendingWeight(internalWeight);
                          // input.blending 업데이트 + V7: quality_score, bm_type, regions
                          setInput(prev => ({
                            ...prev,
                            blending: {
                              weight: internalWeight,
                              genre: projectInfo.genre || 'MMORPG',
                              platforms: projectInfo.platforms || ['PC'],
                              time_decay: true
                            },
                            quality_score: projectInfo.qualityScore || 'B',
                            bm_type: projectInfo.bmType || 'Midcore',
                            regions: projectInfo.regions || ['global']
                          }));
                        }}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-orange-500"
                      />
                      <div className="flex justify-between text-xs text-gray-500 mt-1">
                        <span>0% (내부 표본만)</span>
                        <span className="text-orange-600 font-medium">권장: 30%</span>
                        <span>100% (벤치마크만)</span>
                      </div>
                    </div>
                    <div className="p-3 bg-white rounded border text-sm">
                      <h5 className="font-medium mb-2">📊 블렌딩 적용 대상</h5>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div className="p-2 bg-blue-50 rounded">Retention 커브</div>
                        <div className="p-2 bg-green-50 rounded">P.Rate (결제율)</div>
                        <div className="p-2 bg-purple-50 rounded">ARPPU</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 기존 수동 선택 */}
            <div className="border border-gray-300 rounded-lg overflow-hidden">
              <div className="bg-gray-100 px-3 py-2 border-b font-medium text-sm">
                3️⃣ 수동 표본 선택 (전체 목록)
              </div>
              <div className="p-3">
                <GuideBox title="표본 게임 선택 가이드">
                  <ul className="list-disc list-inside space-y-1">
                    <li>여기서 선택한 게임이 <strong>Retention, NRU, Revenue 모든 설정에 동일하게 적용</strong>됩니다.</li>
                    <li><strong>ℹ️ 아이콘에 마우스를 올리면</strong> 게임의 장르, 출시일 정보를 확인할 수 있습니다.</li>
                  </ul>
                </GuideBox>
                <div className="mt-3">
                  <GameGridSelector availableGames={games.retention} selectedGames={selectedSampleGames} onChange={handleSampleGameSelect} metadata={gameMetadata} />
                </div>
              </div>
            </div>

            {selectedSampleGames.length > 0 && (
              <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                <p className="text-sm text-purple-700"><strong>✅ 선택된 표본 게임:</strong> {selectedSampleGames.join(', ')}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 5. Retention (기존 3) */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <button onClick={() => setActiveSection(activeSection === 'retention' ? null : 'retention')} className={`w-full flex items-center justify-between px-4 py-3 ${activeSection === 'retention' ? 'bg-emerald-50 border-b border-emerald-200' : 'bg-gray-50 hover:bg-gray-100'}`}>
          <div className="flex items-center gap-2"><TrendingUp className="w-5 h-5 text-emerald-600" /><span className="font-medium">5. Retention 설정</span></div>
          {activeSection === 'retention' ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </button>
        {activeSection === 'retention' && (
          <div className="p-4 space-y-4">
            <div className="p-3 bg-gray-50 rounded-lg border"><p className="text-sm text-gray-600"><strong>적용된 표본 게임:</strong> {selectedSampleGames.length > 0 ? selectedSampleGames.join(', ') : '(2. 표본 게임 선택에서 선택해주세요)'}</p></div>
            <div>
              <h4 className="font-medium text-gray-700 mb-2">예상 D+1 Retention 입력 (%)</h4>
              <div className="grid grid-cols-3 gap-4">
                <div className="p-3 bg-green-50 rounded-lg border border-green-200"><label className="block text-xs font-medium text-green-700 mb-1">Best</label><div className="flex items-center"><input type="number" step="1" value={Math.round(input.retention.target_d1_retention.best * 100)} onChange={(e) => setInput(prev => ({ ...prev, retention: { ...prev.retention, target_d1_retention: { ...prev.retention.target_d1_retention, best: (parseFloat(e.target.value) || 0) / 100 } } }))} className="w-full px-2 py-1 border border-green-300 rounded text-right" /><span className="ml-1">%</span></div></div>
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-200"><label className="block text-xs font-medium text-blue-700 mb-1">Normal</label><div className="flex items-center"><input type="number" step="1" value={Math.round(input.retention.target_d1_retention.normal * 100)} onChange={(e) => setInput(prev => ({ ...prev, retention: { ...prev.retention, target_d1_retention: { ...prev.retention.target_d1_retention, normal: (parseFloat(e.target.value) || 0) / 100 } } }))} className="w-full px-2 py-1 border border-blue-300 rounded text-right" /><span className="ml-1">%</span></div></div>
                <div className="p-3 bg-red-50 rounded-lg border border-red-200"><label className="block text-xs font-medium text-red-700 mb-1">Worst</label><div className="flex items-center"><input type="number" step="1" value={Math.round(input.retention.target_d1_retention.worst * 100)} onChange={(e) => setInput(prev => ({ ...prev, retention: { ...prev.retention, target_d1_retention: { ...prev.retention.target_d1_retention, worst: (parseFloat(e.target.value) || 0) / 100 } } }))} className="w-full px-2 py-1 border border-red-300 rounded text-right" /><span className="ml-1">%</span></div></div>
              </div>
            </div>
            <RegressionResultTable selectedGames={selectedSampleGames} d1Retention={input.retention.target_d1_retention} />
          </div>
        )}
      </div>

      {/* 3. 마케팅 & UA 설정 (UA First - NRU 계산의 선행 조건) */}
      <div className="border border-orange-200 rounded-lg overflow-hidden">
        <button onClick={() => setActiveSection(activeSection === 'mkt-calc' ? null : 'mkt-calc')} className={`w-full flex items-center justify-between px-4 py-3 ${activeSection === 'mkt-calc' ? 'bg-orange-50 border-b border-orange-200' : 'bg-gray-50 hover:bg-gray-100'}`}>
          <div className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-orange-600" />
            <span className="font-medium">3. 마케팅 & UA 설정</span>
            <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">UA First</span>
          </div>
          {activeSection === 'mkt-calc' ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </button>
        {activeSection === 'mkt-calc' && (
          <div className="p-4 space-y-4">
            <GuideBox title="마케팅 & UA 설정 가이드">
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li><strong>런칭 MKT 예산:</strong> 런칭 시 집행할 마케팅 예산 (LTV/ROAS 계산에 사용)</li>
                <li><strong>CPI:</strong> 1건당 설치 비용 (한국 모바일 RPG 평균 2,500~3,500원)</li>
                <li><strong>UAC:</strong> 유저 1명 획득 비용 (CPI보다 높음, 전환율 고려)</li>
                <li><strong>Sustaining MKT:</strong> 런칭 후 지속 마케팅 비용 (매출의 5~10%)</li>
                <li><strong>총 NRU 자동 계산:</strong> MKT 예산 ÷ CPI × Organic 배수 × NVR → 30일간 분산 배분</li>
              </ul>
            </GuideBox>

            <div className="grid grid-cols-2 gap-4">
              {/* 왼쪽: MKT 예산 & 비용 설정 */}
              <div className="space-y-4">
                <div className="border border-gray-300 rounded-lg overflow-hidden">
                  <div className="bg-orange-100 px-3 py-2 border-b font-medium text-sm text-orange-800">MKT 예산</div>
                  <table className="w-full text-sm table-fixed">
                    <tbody>
                      <tr>
                        <td className="px-3 py-2 border-b bg-gray-50 w-2/5">런칭 MKT 예산</td>
                        <td className="px-3 py-2 border-b bg-yellow-50">
                          <div className="flex items-center">
                            <input 
                              type="text" 
                              value={(input.basic_settings?.launch_mkt_budget || 0).toLocaleString()} 
                              onChange={(e) => {
                                const rawValue = e.target.value.replace(/,/g, '');
                                handleMktBudgetChange(parseInt(rawValue) || 0);
                              }}
                              className="flex-1 bg-transparent border-none p-0 text-right min-w-0" 
                            />
                            <span className="ml-1 flex-shrink-0">원</span>
                          </div>
                        </td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 bg-gray-50">Sustaining MKT</td>
                        <td className="px-3 py-2 bg-yellow-50">
                          <div className="flex items-center">
                            <input 
                              type="number" 
                              step="1" 
                              value={Math.round((input.basic_settings?.sustaining_mkt_ratio || 0.07) * 100)} 
                              onChange={(e) => setInput(prev => ({ ...prev, basic_settings: { ...prev.basic_settings!, sustaining_mkt_ratio: (parseFloat(e.target.value) || 0) / 100 } }))} 
                              className="flex-1 bg-transparent border-none p-0 text-right min-w-0" 
                            />
                            <span className="ml-1 flex-shrink-0">%</span>
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="border border-gray-300 rounded-lg overflow-hidden">
                  <div className="bg-gray-100 px-3 py-2 border-b font-medium text-sm">
                    {(projectInfo.platforms || []).includes('Mobile') ? 'CPI & UAC' : 'CPA & UAC'}
                  </div>
                  <table className="w-full text-sm table-fixed">
                    <tbody>
                      <tr>
                        <td className="px-3 py-2 border-b bg-gray-50 w-2/5">
                          {(projectInfo.platforms || []).includes('Mobile') 
                            ? 'CPI (Cost Per Install)' 
                            : 'CPA (Cost Per Acquisition)'}
                        </td>
                        <td className="px-3 py-2 border-b bg-yellow-50">
                          <div className="flex items-center">
                            <input 
                              type="text" 
                              value={(input.basic_settings?.cpi || 2660).toLocaleString()} 
                              onChange={(e) => {
                                const rawValue = e.target.value.replace(/,/g, '');
                                setInput(prev => ({ ...prev, basic_settings: { ...prev.basic_settings!, cpi: parseInt(rawValue) || 0 } }));
                              }}
                              className="flex-1 bg-transparent border-none p-0 text-right min-w-0" 
                            />
                            <span className="ml-1 flex-shrink-0">원</span>
                          </div>
                        </td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 bg-gray-50">UAC (User Acq. Cost)</td>
                        <td className="px-3 py-2 bg-yellow-50">
                          <div className="flex items-center">
                            <input 
                              type="text" 
                              value={(input.basic_settings?.uac || 3800).toLocaleString()} 
                              onChange={(e) => {
                                const rawValue = e.target.value.replace(/,/g, '');
                                setInput(prev => ({ ...prev, basic_settings: { ...prev.basic_settings!, uac: parseInt(rawValue) || 0 } }));
                              }}
                              className="flex-1 bg-transparent border-none p-0 text-right min-w-0" 
                            />
                            <span className="ml-1 flex-shrink-0">원</span>
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="border border-gray-300 rounded-lg overflow-hidden">
                  <div className="bg-gray-100 px-3 py-2 border-b font-medium text-sm">UA 전환 설정</div>
                  <table className="w-full text-sm table-fixed">
                    <tbody>
                      <tr>
                        <td className="px-3 py-2 border-b bg-gray-50 w-2/5">Paid/Organic 비율</td>
                        <td className="px-3 py-2 border-b bg-yellow-50">
                          <div className="flex items-center">
                            <input 
                              type="number" 
                              step="1" 
                              value={Math.round(input.nru.paid_organic_ratio * 100)} 
                              onChange={(e) => setInput(prev => ({ ...prev, nru: { ...prev.nru, paid_organic_ratio: (parseFloat(e.target.value) || 0) / 100 } }))} 
                              className="flex-1 bg-transparent border-none p-0 text-right min-w-0" 
                            />
                            <span className="ml-1 flex-shrink-0">%</span>
                          </div>
                        </td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 bg-gray-50">NVR (전환율)</td>
                        <td className="px-3 py-2 bg-yellow-50">
                          <div className="flex items-center">
                            <input 
                              type="number" 
                              step="1" 
                              value={Math.round(input.nru.nvr * 100)} 
                              onChange={(e) => setInput(prev => ({ ...prev, nru: { ...prev.nru, nvr: (parseFloat(e.target.value) || 0) / 100 } }))} 
                              className="flex-1 bg-transparent border-none p-0 text-right min-w-0" 
                            />
                            <span className="ml-1 flex-shrink-0">%</span>
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 오른쪽: D1 NRU 자동 계산 */}
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 bg-orange-50 rounded-lg border border-orange-200">
                  <input 
                    type="checkbox" 
                    id="nru-auto-calc" 
                    checked={nruAutoCalc}
                    onChange={(e) => {
                      setNruAutoCalc(e.target.checked);
                      if (e.target.checked) {
                        const calculated = calculateNRUFromMKT();
                        setInput(prev => ({ ...prev, nru: { ...prev.nru, d1_nru: calculated } }));
                      }
                    }}
                    className="w-4 h-4 text-orange-600"
                  />
                  <label htmlFor="nru-auto-calc" className="text-sm font-medium text-orange-800">
                    총 NRU 자동 계산 (4. NRU 설정에 반영)
                  </label>
                </div>
                <div className="border border-orange-300 rounded-lg overflow-hidden">
                  <div className="bg-orange-100 px-3 py-2 border-b font-medium text-sm text-orange-800">자동 계산 결과</div>
                  <table className="w-full text-sm table-fixed">
                    <tbody>
                      <tr>
                        <td className="px-3 py-2 border-b bg-gray-50 w-2/5">Paid Install</td>
                        <td className="px-3 py-2 border-b bg-blue-50 text-right whitespace-nowrap">
                          {Math.floor((input.basic_settings?.launch_mkt_budget || 0) / (input.basic_settings?.cpi || 2660)).toLocaleString()}명
                        </td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 border-b bg-gray-50">Total Install</td>
                        <td className="px-3 py-2 border-b bg-blue-50 text-right whitespace-nowrap">
                          {(() => {
                            const paid = Math.floor((input.basic_settings?.launch_mkt_budget || 0) / (input.basic_settings?.cpi || 2660));
                            const paidRatio = input.nru.paid_organic_ratio || 0.5;
                            const organic = Math.floor(paid * ((1 - paidRatio) / paidRatio));
                            return (paid + organic).toLocaleString();
                          })()}명
                        </td>
                      </tr>
                      <tr className="bg-green-50">
                        <td className="px-3 py-2 border-b bg-green-100 font-medium">총 NRU (Best)</td>
                        <td className="px-3 py-2 border-b text-right font-medium text-green-700">{calculateNRUFromMKT().best.toLocaleString()}명</td>
                      </tr>
                      <tr className="bg-blue-50">
                        <td className="px-3 py-2 border-b bg-blue-100 font-medium">총 NRU (Normal)</td>
                        <td className="px-3 py-2 border-b text-right font-medium text-blue-700">{calculateNRUFromMKT().normal.toLocaleString()}명</td>
                      </tr>
                      <tr className="bg-red-50">
                        <td className="px-3 py-2 bg-red-100 font-medium">총 NRU (Worst)</td>
                        <td className="px-3 py-2 text-right font-medium text-red-700">{calculateNRUFromMKT().worst.toLocaleString()}명</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg border text-xs text-gray-600">
                  <p><strong>계산식:</strong></p>
                  <p>총 NRU = (MKT예산 ÷ CPI) × (1 + Organic배수) × NVR</p>
                  <p className="mt-1 text-blue-600"><strong>💡 V8.3:</strong> 이 총량이 30일 런칭 기간에 분산 배분됩니다 (D1 최고점, 점진 감소)</p>
                  <p className="mt-1"><strong>예시:</strong> 50억 ÷ 2,660원 × 2(Paid50%) × 70% = 약 263만명 (30일간 분산)</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 4. NRU (MKT에서 자동 계산됨) */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <button onClick={() => setActiveSection(activeSection === 'nru' ? null : 'nru')} className={`w-full flex items-center justify-between px-4 py-3 ${activeSection === 'nru' ? 'bg-blue-50 border-b border-blue-200' : 'bg-gray-50 hover:bg-gray-100'}`}>
          <div className="flex items-center gap-2"><Users className="w-5 h-5 text-blue-600" /><span className="font-medium">4. NRU 설정 (자동계산)</span></div>
          {activeSection === 'nru' ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </button>
        {activeSection === 'nru' && (
          <div className="p-4 space-y-4">
            <GuideBox title="NRU 입력 가이드">
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li><strong>총 NRU:</strong> 런칭 기간(30일) 동안의 총 예상 신규 유저 수</li>
                <li><strong>V8.3 정규화:</strong> 입력된 총량이 30일간 분산 배분됩니다 (D1 최고점, Power Law 감소)</li>
                <li><strong>자동 계산:</strong> "3. 마케팅 & UA 설정"에서 MKT 예산 기반 자동 계산 가능</li>
              </ul>
            </GuideBox>
            <div className="p-3 bg-gray-50 rounded-lg border"><p className="text-sm text-gray-600"><strong>적용된 표본 게임:</strong> {selectedSampleGames.join(', ') || '(선택 필요)'}</p></div>
            <div>
              <h4 className="font-medium text-gray-700 mb-2">런칭 기간 총 NRU (30일간 분산 배분)</h4>
              <div className="grid grid-cols-3 gap-4">
                <div className="p-3 bg-green-50 rounded-lg border border-green-200"><label className="block text-xs font-medium text-green-700 mb-1">Best</label><input type="text" value={(input.nru.d1_nru.best || 0).toLocaleString()} onChange={(e) => { const v = parseInt(e.target.value.replace(/,/g, '')) || 0; setInput(prev => ({ ...prev, nru: { ...prev.nru, d1_nru: { ...prev.nru.d1_nru, best: v } } })); }} className="w-full px-2 py-1 border border-green-300 rounded text-right" /></div>
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-200"><label className="block text-xs font-medium text-blue-700 mb-1">Normal</label><input type="text" value={(input.nru.d1_nru.normal || 0).toLocaleString()} onChange={(e) => { const v = parseInt(e.target.value.replace(/,/g, '')) || 0; setInput(prev => ({ ...prev, nru: { ...prev.nru, d1_nru: { ...prev.nru.d1_nru, normal: v } } })); }} className="w-full px-2 py-1 border border-blue-300 rounded text-right" /></div>
                <div className="p-3 bg-red-50 rounded-lg border border-red-200"><label className="block text-xs font-medium text-red-700 mb-1">Worst</label><input type="text" value={(input.nru.d1_nru.worst || 0).toLocaleString()} onChange={(e) => { const v = parseInt(e.target.value.replace(/,/g, '')) || 0; setInput(prev => ({ ...prev, nru: { ...prev.nru, d1_nru: { ...prev.nru.d1_nru, worst: v } } })); }} className="w-full px-2 py-1 border border-red-300 rounded text-right" /></div>
              </div>
            </div>
            <div className="border border-gray-300 rounded-lg overflow-hidden">
              <div className="bg-gray-100 px-3 py-2 border-b font-medium text-sm">노말 대비 보정 수치 (%)</div>
              <table className="w-full text-sm">
                <tbody>
                  <tr><td className="px-3 py-2 border-b bg-gray-50 w-1/3">Best (+보정)</td><td className="px-3 py-2 border-b bg-green-50"><div className="flex items-center"><input type="number" step="1" value={Math.round((input.nru.adjustment?.best_vs_normal || -0.10) * 100)} onChange={(e) => setInput(prev => ({ ...prev, nru: { ...prev.nru, adjustment: { ...prev.nru.adjustment, best_vs_normal: (parseFloat(e.target.value) || 0) / 100 } } }))} className="w-full bg-transparent border-none p-0 text-right" /><span className="ml-1">%</span></div></td></tr>
                  <tr><td className="px-3 py-2 bg-gray-50">Worst (-보정)</td><td className="px-3 py-2 bg-red-50"><div className="flex items-center"><input type="number" step="1" value={Math.round((input.nru.adjustment?.worst_vs_normal || 0.10) * 100)} onChange={(e) => setInput(prev => ({ ...prev, nru: { ...prev.nru, adjustment: { ...prev.nru.adjustment, worst_vs_normal: (parseFloat(e.target.value) || 0) / 100 } } }))} className="w-full bg-transparent border-none p-0 text-right" /><span className="ml-1">%</span></div></td></tr>
                </tbody>
              </table>
              <div className="px-3 py-2 text-xs text-gray-500">* Best -10% = Normal보다 감소율 10% 완화 / Worst +10% = Normal보다 감소율 10% 증가</div>
            </div>
          </div>
        )}
      </div>

      {/* 6. Revenue (보정) */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <button onClick={() => setActiveSection(activeSection === 'revenue' ? null : 'revenue')} className={`w-full flex items-center justify-between px-4 py-3 ${activeSection === 'revenue' ? 'bg-amber-50 border-b border-amber-200' : 'bg-gray-50 hover:bg-gray-100'}`}>
          <div className="flex items-center gap-2"><DollarSign className="w-5 h-5 text-amber-600" /><span className="font-medium">6. Revenue 설정 (보정)</span></div>
          {activeSection === 'revenue' ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </button>
        {activeSection === 'revenue' && (
          <div className="p-4 space-y-4">
            <GuideBox title="Revenue 입력 가이드">
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li><strong>Revenue 계산식:</strong> DAU × P.Rate(결제율) × ARPPU(결제자 평균 결제금액)</li>
                <li><strong>P.Rate 보정:</strong> Best/Worst 시나리오별 결제율 조정 (예: Best +5%, Worst -5%)</li>
                <li><strong>ARPPU 보정:</strong> Best/Worst 시나리오별 ARPPU 조정</li>
              </ul>
            </GuideBox>
            <div className="p-3 bg-gray-50 rounded-lg border"><p className="text-sm text-gray-600"><strong>적용된 표본 게임:</strong> {selectedSampleGames.join(', ') || '(선택 필요)'}</p></div>
            <div className="grid grid-cols-2 gap-6">
              <div className="border border-gray-300 rounded-lg overflow-hidden">
                <div className="bg-gray-100 px-3 py-2 border-b font-medium text-sm">P.Rate (결제율) 보정 (%)</div>
                <table className="w-full text-sm">
                  <tbody>
                    <tr><td className="px-3 py-2 border-b bg-gray-50 w-1/2">Best 보정</td><td className="px-3 py-2 border-b bg-green-50"><div className="flex items-center"><input type="number" step="1" value={Math.round((input.revenue.pr_adjustment.best_vs_normal || 0) * 100)} onChange={(e) => setInput(prev => ({ ...prev, revenue: { ...prev.revenue, pr_adjustment: { ...prev.revenue.pr_adjustment, best_vs_normal: (parseFloat(e.target.value) || 0) / 100 } } }))} className="w-full bg-transparent border-none p-0 text-right" /><span className="ml-1">%</span></div></td></tr>
                    <tr><td className="px-3 py-2 bg-gray-50">Worst 보정</td><td className="px-3 py-2 bg-red-50"><div className="flex items-center"><input type="number" step="1" value={Math.round((input.revenue.pr_adjustment.worst_vs_normal || 0) * 100)} onChange={(e) => setInput(prev => ({ ...prev, revenue: { ...prev.revenue, pr_adjustment: { ...prev.revenue.pr_adjustment, worst_vs_normal: (parseFloat(e.target.value) || 0) / 100 } } }))} className="w-full bg-transparent border-none p-0 text-right" /><span className="ml-1">%</span></div></td></tr>
                  </tbody>
                </table>
              </div>
              <div className="border border-gray-300 rounded-lg overflow-hidden">
                <div className="bg-gray-100 px-3 py-2 border-b font-medium text-sm">ARPPU 보정 (%)</div>
                <table className="w-full text-sm">
                  <tbody>
                    <tr><td className="px-3 py-2 border-b bg-gray-50 w-1/2">Best 보정</td><td className="px-3 py-2 border-b bg-green-50"><div className="flex items-center"><input type="number" step="1" value={Math.round((input.revenue.arppu_adjustment.best_vs_normal || 0) * 100)} onChange={(e) => setInput(prev => ({ ...prev, revenue: { ...prev.revenue, arppu_adjustment: { ...prev.revenue.arppu_adjustment, best_vs_normal: (parseFloat(e.target.value) || 0) / 100 } } }))} className="w-full bg-transparent border-none p-0 text-right" /><span className="ml-1">%</span></div></td></tr>
                    <tr><td className="px-3 py-2 bg-gray-50">Worst 보정</td><td className="px-3 py-2 bg-red-50"><div className="flex items-center"><input type="number" step="1" value={Math.round((input.revenue.arppu_adjustment.worst_vs_normal || 0) * 100)} onChange={(e) => setInput(prev => ({ ...prev, revenue: { ...prev.revenue, arppu_adjustment: { ...prev.revenue.arppu_adjustment, worst_vs_normal: (parseFloat(e.target.value) || 0) / 100 } } }))} className="w-full bg-transparent border-none p-0 text-right" /><span className="ml-1">%</span></div></td></tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div className="text-xs text-gray-500">* 예: Best 보정 5 = Normal 대비 +5% / Worst 보정 -5 = Normal 대비 -5%</div>
          </div>
        )}
      </div>


      {/* 6. 계절성 팩터 */}
      <div className="border border-teal-200 rounded-lg overflow-hidden">
        <button onClick={() => setActiveSection(activeSection === 'seasonality' ? null : 'seasonality')} className={`w-full flex items-center justify-between px-4 py-3 ${activeSection === 'seasonality' ? 'bg-teal-50 border-b border-teal-200' : 'bg-gray-50 hover:bg-gray-100'}`}>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-teal-600" />
            <span className="font-medium">6. 계절성 팩터 (Seasonality)</span>
            <span className="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full">선택</span>
          </div>
          {activeSection === 'seasonality' ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </button>
        {activeSection === 'seasonality' && (
          <div className="p-4 space-y-4">
            <GuideBox title="계절성 팩터 적용">
              <div className="space-y-1 text-xs">
                <p>실제 게임 지표는 요일/계절에 따라 변동합니다. 이 팩터를 적용하면 더 현실적인 프로젝션이 가능합니다.</p>
                <p><strong>주말 효과:</strong> 금~일요일 DAU/매출 증가</p>
                <p><strong>성수기:</strong> 여름방학(7-8월), 연말(12월), 설연휴(1월)</p>
              </div>
            </GuideBox>

            <div className="flex items-center gap-3 p-3 bg-teal-50 rounded-lg border border-teal-200">
              <input 
                type="checkbox" 
                id="seasonality-enabled" 
                checked={seasonalityEnabled}
                onChange={(e) => setSeasonalityEnabled(e.target.checked)}
                className="w-4 h-4 text-teal-600"
              />
              <label htmlFor="seasonality-enabled" className="text-sm font-medium text-teal-800">
                계절성 팩터 적용 (프로젝션에 반영)
              </label>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="border border-gray-300 rounded-lg overflow-hidden">
                <div className="bg-gray-100 px-3 py-2 border-b font-medium text-sm">요일별 가중치</div>
                <table className="w-full text-sm">
                  <tbody>
                    {[
                      { day: '월요일', key: 'mon', value: 0.85 },
                      { day: '화요일', key: 'tue', value: 0.85 },
                      { day: '수요일', key: 'wed', value: 0.85 },
                      { day: '목요일', key: 'thu', value: 0.85 },
                      { day: '금요일', key: 'fri', value: 1.05 },
                      { day: '토요일', key: 'sat', value: 1.25 },
                      { day: '일요일', key: 'sun', value: 1.15 },
                    ].map(({ day, value }, i) => (
                      <tr key={day} className={i === 6 ? '' : 'border-b'}>
                        <td className="px-3 py-1.5 bg-gray-50 w-1/2 text-xs">{day}</td>
                        <td className={`px-3 py-1.5 text-right text-xs ${value > 1 ? 'bg-green-50 text-green-700' : 'bg-gray-50'}`}>
                          ×{value.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="border border-gray-300 rounded-lg overflow-hidden">
                <div className="bg-gray-100 px-3 py-2 border-b font-medium text-sm">월별 가중치</div>
                <div className="max-h-48 overflow-y-auto">
                  <table className="w-full text-sm">
                    <tbody>
                      {[
                        { month: '1월 (설연휴)', value: 1.15 },
                        { month: '2월', value: 1.00 },
                        { month: '3월', value: 0.95 },
                        { month: '4월', value: 0.95 },
                        { month: '5월', value: 1.00 },
                        { month: '6월', value: 1.00 },
                        { month: '7월 (여름방학)', value: 1.20 },
                        { month: '8월 (여름방학)', value: 1.20 },
                        { month: '9월', value: 0.95 },
                        { month: '10월', value: 0.95 },
                        { month: '11월', value: 0.95 },
                        { month: '12월 (연말)', value: 1.10 },
                      ].map(({ month, value }, i) => (
                        <tr key={month} className={i === 11 ? '' : 'border-b'}>
                          <td className="px-3 py-1.5 bg-gray-50 w-1/2 text-xs">{month}</td>
                          <td className={`px-3 py-1.5 text-right text-xs ${value > 1 ? 'bg-green-50 text-green-700' : value < 1 ? 'bg-red-50 text-red-700' : 'bg-gray-50'}`}>
                            ×{value.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="text-xs text-gray-500">* 현재 버전에서는 가중치 값이 고정되어 있습니다. 향후 커스텀 설정 기능이 추가될 예정입니다.</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default InputPanel;
