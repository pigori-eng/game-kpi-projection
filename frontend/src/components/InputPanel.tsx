import { useState, useEffect } from 'react';
import { TrendingUp, Users, DollarSign, ChevronDown, ChevronUp, HelpCircle, Building, Gamepad2, Calculator, Globe, Sliders } from 'lucide-react';
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
  platform?: string;
  source?: string;
  data_quality?: string;
}

// 숫자 포맷팅 유틸리티 (천단위 콤마)
const formatNum = (n: number): string => n.toLocaleString('ko-KR');

// 장르 옵션
const GENRE_OPTIONS = [
  { value: 'MMORPG', label: 'MMORPG' },
  { value: 'Action RPG', label: 'Action RPG' },
  { value: 'Battle Royale', label: 'Battle Royale' },
  { value: 'Extraction Shooter', label: 'Extraction Shooter' },
  { value: 'FPS/TPS', label: 'FPS/TPS' },
  { value: 'Strategy', label: '전략/시뮬레이션' },
  { value: 'Casual', label: '캐주얼' },
  { value: 'Sports', label: '스포츠' },
];

// 플랫폼 옵션
const PLATFORM_OPTIONS = [
  { value: 'PC', label: 'PC' },
  { value: 'Mobile', label: 'Mobile' },
  { value: 'Console', label: 'Console' },
];

// 지역 옵션
const REGION_OPTIONS = [
  { value: 'korea', label: '한국' },
  { value: 'japan', label: '일본' },
  { value: 'china', label: '중국' },
  { value: 'global', label: '글로벌(중국제외)' },
  { value: 'sea', label: '동남아' },
  { value: 'na', label: '북미' },
  { value: 'sa', label: '남미' },
  { value: 'eu', label: '유럽' },
];

// 장르/플랫폼별 벤치마크 데이터
const BENCHMARK_DATA: Record<string, Record<string, { d1: number; d7: number; d30: number; pr: number; arppu: number }>> = {
  'Mobile': {
    'MMORPG': { d1: 0.45, d7: 0.20, d30: 0.08, pr: 0.05, arppu: 52000 },
    'Action RPG': { d1: 0.42, d7: 0.18, d30: 0.06, pr: 0.04, arppu: 38000 },
    'Battle Royale': { d1: 0.54, d7: 0.28, d30: 0.14, pr: 0.02, arppu: 1690 },
    'Extraction Shooter': { d1: 0.37, d7: 0.15, d30: 0.044, pr: 0.03, arppu: 58500 },
    'FPS/TPS': { d1: 0.40, d7: 0.18, d30: 0.08, pr: 0.025, arppu: 25000 },
    'Strategy': { d1: 0.35, d7: 0.15, d30: 0.06, pr: 0.035, arppu: 45000 },
    'Casual': { d1: 0.50, d7: 0.22, d30: 0.10, pr: 0.015, arppu: 8000 },
    'Sports': { d1: 0.38, d7: 0.16, d30: 0.07, pr: 0.02, arppu: 15000 },
  },
  'PC': {
    'MMORPG': { d1: 0.35, d7: 0.18, d30: 0.10, pr: 0.06, arppu: 65000 },
    'Action RPG': { d1: 0.32, d7: 0.16, d30: 0.08, pr: 0.05, arppu: 55000 },
    'Battle Royale': { d1: 0.39, d7: 0.20, d30: 0.08, pr: 0.05, arppu: 73000 },
    'Extraction Shooter': { d1: 0.29, d7: 0.22, d30: 0.13, pr: 0.07, arppu: 97500 },
    'FPS/TPS': { d1: 0.42, d7: 0.25, d30: 0.12, pr: 0.055, arppu: 62000 },
    'Strategy': { d1: 0.30, d7: 0.18, d30: 0.10, pr: 0.045, arppu: 48000 },
    'Casual': { d1: 0.45, d7: 0.20, d30: 0.08, pr: 0.02, arppu: 12000 },
    'Sports': { d1: 0.35, d7: 0.18, d30: 0.09, pr: 0.03, arppu: 35000 },
  },
  'Console': {
    'MMORPG': { d1: 0.32, d7: 0.16, d30: 0.09, pr: 0.055, arppu: 58000 },
    'Action RPG': { d1: 0.30, d7: 0.15, d30: 0.08, pr: 0.05, arppu: 52000 },
    'Battle Royale': { d1: 0.36, d7: 0.18, d30: 0.07, pr: 0.045, arppu: 65000 },
    'Extraction Shooter': { d1: 0.28, d7: 0.20, d30: 0.11, pr: 0.06, arppu: 85000 },
    'FPS/TPS': { d1: 0.40, d7: 0.22, d30: 0.10, pr: 0.05, arppu: 55000 },
    'Strategy': { d1: 0.28, d7: 0.15, d30: 0.08, pr: 0.04, arppu: 42000 },
    'Casual': { d1: 0.42, d7: 0.18, d30: 0.07, pr: 0.018, arppu: 10000 },
    'Sports': { d1: 0.38, d7: 0.20, d30: 0.10, pr: 0.035, arppu: 40000 },
  },
};

// 지역별 계절성 팩터
const SEASONALITY_BY_REGION: Record<string, { monthly: number[]; description: string[] }> = {
  'korea': {
    monthly: [1.15, 1.05, 0.95, 0.95, 1.00, 1.00, 1.20, 1.20, 0.95, 0.95, 0.95, 1.10],
    description: ['설연휴', '설연휴', '', '', '', '', '여름방학', '여름방학', '추석', '', '', '연말'],
  },
  'japan': {
    monthly: [1.10, 1.00, 0.95, 1.05, 1.10, 1.00, 1.15, 1.20, 0.95, 0.95, 0.95, 1.15],
    description: ['신정', '', '', '골든위크', '골든위크', '', '여름방학', '오봉', '', '', '', '연말'],
  },
  'china': {
    monthly: [1.20, 1.15, 0.90, 0.95, 1.05, 0.95, 1.15, 1.15, 0.95, 1.10, 1.00, 1.00],
    description: ['춘절', '춘절', '', '', '노동절', '', '여름방학', '여름방학', '', '국경절', '', ''],
  },
  'global': {
    monthly: [0.95, 0.95, 1.00, 1.00, 1.00, 1.05, 1.10, 1.10, 1.00, 1.00, 1.15, 1.20],
    description: ['Post-Holiday', '', '', '', '', '여름시작', '여름', '여름', '', '', '블프', '홀리데이'],
  },
  'na': {
    monthly: [0.90, 0.95, 1.00, 1.00, 1.05, 1.10, 1.15, 1.10, 1.00, 1.00, 1.20, 1.25],
    description: ['Post-Holiday', '', '', '', '', '여름시작', '여름', '여름', '', '', '블프/추수감사절', '홀리데이'],
  },
  'eu': {
    monthly: [0.90, 0.95, 1.00, 1.00, 1.00, 1.05, 1.15, 1.20, 1.00, 1.00, 1.15, 1.20],
    description: ['Post-Holiday', '', '', '', '', '', '여름휴가', '여름휴가', '', '', '', '홀리데이'],
  },
  'sea': {
    monthly: [1.00, 1.00, 1.00, 1.00, 1.00, 1.05, 1.10, 1.10, 1.00, 1.00, 1.05, 1.10],
    description: ['', '', '', '', '', '', '방학', '방학', '', '', '', '연말'],
  },
  'sa': {
    monthly: [1.15, 1.10, 1.00, 1.00, 1.00, 1.00, 1.10, 1.10, 1.00, 1.00, 1.05, 1.15],
    description: ['여름휴가', '카니발', '', '', '', '', '방학', '방학', '', '', '', '연말'],
  },
};

const GameTooltip: React.FC<{ metadata: GameMetadata; visible: boolean }> = ({ metadata, visible }) => {
  if (!visible) return null;
  return (
    <div className="absolute z-50 bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-52 bg-gray-900 text-white text-xs rounded-lg shadow-xl p-2.5 pointer-events-none">
      <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2 rotate-45 w-2 h-2 bg-gray-900"></div>
      <div className="space-y-1">
        <div className="font-medium text-sm">{metadata.genre}</div>
        <div className="text-gray-400">플랫폼: <span className="text-gray-200">{metadata.platform || 'Mobile'}</span></div>
        <div className="text-gray-400">출시일: <span className="text-gray-200">{metadata.release_date}</span></div>
        {metadata.source && <div className="text-gray-400">출처: <span className="text-blue-300">{metadata.source}</span></div>}
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
        <div><span className="text-sm font-medium text-gray-700">게임명</span><span className="text-xs text-gray-500 ml-2">(최대 {maxGames}개)</span></div>
      </div>
      <div className="grid grid-cols-4 gap-0 max-h-48 overflow-y-auto">
        {availableGames.map((game, idx) => {
          const gameMeta = metadata[game];
          const isSelected = selectedGames.includes(game);
          const isDisabled = !isSelected && selectedGames.length >= maxGames;
          return (
            <div key={game} className="relative" onMouseEnter={() => setHoveredGame(game)} onMouseLeave={() => setHoveredGame(null)}>
              <button onClick={() => handleToggle(game)} disabled={isDisabled} className={`w-full px-2 py-1.5 text-xs text-left border-r border-b border-gray-200 transition-colors truncate ${isSelected ? 'bg-blue-100 text-blue-800 font-medium' : 'bg-white hover:bg-gray-50 text-gray-700'} ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`} title={game}>
                {game}
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
  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
    <div className="flex items-start gap-2">
      <HelpCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
      <div><h4 className="font-medium text-amber-800 text-sm mb-1">{title}</h4><div className="text-xs text-amber-700">{children}</div></div>
    </div>
  </div>
);

// 다중 선택 체크박스 컴포넌트
const MultiSelectCheckbox: React.FC<{
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (selected: string[]) => void;
}> = ({ options, selected, onChange }) => {
  const handleToggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter(v => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(({ value, label }) => (
        <label key={value} className={`flex items-center gap-1.5 px-3 py-1.5 rounded border cursor-pointer transition-colors text-sm ${selected.includes(value) ? 'bg-blue-100 border-blue-400 text-blue-800' : 'bg-gray-50 border-gray-300 hover:bg-gray-100'}`}>
          <input type="checkbox" checked={selected.includes(value)} onChange={() => handleToggle(value)} className="w-3.5 h-3.5 text-blue-600" />
          <span>{label}</span>
        </label>
      ))}
    </div>
  );
};

const InputPanel: React.FC<InputPanelProps> = ({ games, input, setInput }) => {
  const [activeSection, setActiveSection] = useState<string | null>('basic');
  const [gameMetadata, setGameMetadata] = useState<Record<string, GameMetadata>>({});
  const [seasonalityEnabled, setSeasonalityEnabled] = useState(false);
  
  // 프로젝트 정보 (다중 선택)
  const [projectInfo, setProjectInfo] = useState({ genre: '', platforms: [] as string[], regions: [] as string[] });
  
  // 블렌딩 가중치
  const [blendingWeight, setBlendingWeight] = useState(0.7);
  const [useAIRecommend, setUseAIRecommend] = useState(false);
  const [useBenchmark, setUseBenchmark] = useState(true);

  useEffect(() => {
    const loadMetadata = async () => {
      try {
        const data = await getGamesMetadata();
        setGameMetadata(data);
      } catch (err) {
        console.error('Failed to load metadata:', err);
      }
    };
    loadMetadata();
  }, []);

  // MKT 기반 NRU 계산
  const calculateNRUFromMKT = () => {
    const budget = input.basic_settings?.launch_mkt_budget || 0;
    const cpi = input.basic_settings?.cpi || 2660;
    const paidRatio = input.nru.paid_organic_ratio || 0.5;
    const nvr = input.nru.nvr || 0.7;
    if (budget <= 0 || cpi <= 0) return { best: 0, normal: 0, worst: 0 };
    const paidInstall = Math.floor(budget / cpi);
    const organicInstall = Math.floor(paidInstall * ((1 - paidRatio) / paidRatio));
    const totalInstall = paidInstall + organicInstall;
    const d1Nru = Math.floor(totalInstall * nvr);
    return { best: Math.floor(d1Nru * 1.1), normal: d1Nru, worst: Math.floor(d1Nru * 0.9) };
  };

  const handleMktBudgetChange = (budget: number) => {
    const calculated = calculateNRUFromMKT();
    setInput(prev => ({
      ...prev,
      basic_settings: { ...prev.basic_settings!, launch_mkt_budget: budget },
      nru: { ...prev.nru, d1_nru: { best: Math.floor((budget / (prev.basic_settings?.cpi || 2660)) * (1 / (prev.nru.paid_organic_ratio || 0.5)) * (prev.nru.nvr || 0.7) * 1.1), normal: Math.floor((budget / (prev.basic_settings?.cpi || 2660)) * (1 / (prev.nru.paid_organic_ratio || 0.5)) * (prev.nru.nvr || 0.7)), worst: Math.floor((budget / (prev.basic_settings?.cpi || 2660)) * (1 / (prev.nru.paid_organic_ratio || 0.5)) * (prev.nru.nvr || 0.7) * 0.9) } }
    }));
  };

  const handleSampleGameSelect = (selectedGames: string[]) => {
    setInput(prev => ({
      ...prev,
      retention: { ...prev.retention, selected_games: selectedGames },
      nru: { ...prev.nru, selected_games: selectedGames },
      revenue: { ...prev.revenue, selected_games_pr: selectedGames, selected_games_arppu: selectedGames },
    }));
  };

  // 유사도 계산
  const calculateSimilarity = (gameName: string): { score: number; reason: string } => {
    const meta = gameMetadata[gameName];
    if (!meta || !projectInfo.genre) return { score: 0, reason: '' };
    let score = 0;
    const reasons: string[] = [];
    if (meta.genre?.toLowerCase().includes(projectInfo.genre.toLowerCase())) { score += 50; reasons.push('장르O'); }
    if (projectInfo.platforms.length > 0 && meta.platform && projectInfo.platforms.some(p => meta.platform?.includes(p))) { score += 25; reasons.push('플랫폼O'); }
    const gameRegion = gameName.match(/\((.*?)\)/)?.[1] || '';
    if (projectInfo.regions.some(r => (r === 'korea' && gameRegion.includes('한국')) || (r === 'japan' && gameRegion.includes('일본')) || (r === 'global' && gameRegion.includes('글로벌')))) { score += 15; reasons.push('지역O'); }
    if (meta.release_date && parseInt(meta.release_date.substring(0, 4)) >= 2022) { score += 10; reasons.push('최신'); }
    return { score, reason: reasons.join('/') };
  };

  const getRecommendedGames = () => {
    if (!useAIRecommend || !projectInfo.genre) return [];
    return games.retention.map(game => ({ game, ...calculateSimilarity(game) })).filter(g => g.score >= 30).sort((a, b) => b.score - a.score).slice(0, 8);
  };

  const getCurrentBenchmark = () => {
    const platform = projectInfo.platforms[0] || 'Mobile';
    const genre = projectInfo.genre || 'MMORPG';
    return BENCHMARK_DATA[platform]?.[genre] || BENCHMARK_DATA['Mobile']['MMORPG'];
  };

  const getAverageSeasonality = () => {
    if (projectInfo.regions.length === 0) return SEASONALITY_BY_REGION['global'];
    const avgMonthly = Array(12).fill(0);
    projectInfo.regions.forEach(region => {
      const s = SEASONALITY_BY_REGION[region] || SEASONALITY_BY_REGION['global'];
      s.monthly.forEach((v, i) => avgMonthly[i] += v);
    });
    return { monthly: avgMonthly.map(v => v / projectInfo.regions.length), description: SEASONALITY_BY_REGION[projectInfo.regions[0] || 'global'].description };
  };

  const selectedSampleGames = input.retention.selected_games;
  const recommendedGames = getRecommendedGames();
  const currentBenchmark = getCurrentBenchmark();

  return (
    <div className="space-y-3">
      {/* 계산 원리 */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <div className="flex items-start gap-2">
          <Calculator className="w-5 h-5 text-blue-600 flex-shrink-0" />
          <div>
            <h3 className="font-semibold text-blue-900 text-sm mb-1">📊 하이브리드 벤치마크 기반 KPI 프로젝션</h3>
            <div className="text-xs text-blue-800 space-y-0.5">
              <p><strong>데이터:</strong> 내부 표본 + 시장 벤치마크(SensorTower/Newzoo) 블렌딩</p>
              <p><strong>Retention:</strong> Power Law (a×d^b) + 장르/플랫폼별 벤치마크 가중평균</p>
              <p><strong>DAU:</strong> Cohort 매트릭스 = Σ(NRU(i) × Retention(d-i))</p>
              <p><strong>Revenue:</strong> DAU × P.Rate × ARPPU</p>
            </div>
          </div>
        </div>
      </div>

      {/* 1. 기본 산정 정보 */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <button onClick={() => setActiveSection(activeSection === 'basic' ? null : 'basic')} className={`w-full flex items-center justify-between px-4 py-2.5 ${activeSection === 'basic' ? 'bg-slate-100 border-b' : 'bg-gray-50 hover:bg-gray-100'}`}>
          <div className="flex items-center gap-2"><Building className="w-4 h-4 text-slate-600" /><span className="font-medium text-sm">1. 기본 산정 정보</span></div>
          {activeSection === 'basic' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {activeSection === 'basic' && (
          <div className="p-3 grid grid-cols-2 gap-3">
            <div className="border border-gray-300 rounded-lg overflow-hidden">
              <div className="bg-gray-100 px-3 py-1.5 border-b font-medium text-xs">기본 정보</div>
              <table className="w-full text-xs">
                <tbody>
                  <tr><td className="px-2 py-1.5 border-b bg-gray-50 w-2/5">런칭 예정일</td><td className="px-2 py-1.5 border-b bg-yellow-50"><input type="date" value={input.launch_date} onChange={(e) => setInput(prev => ({ ...prev, launch_date: e.target.value }))} className="w-full bg-transparent border-none p-0 text-right text-xs" /></td></tr>
                  <tr><td className="px-2 py-1.5 border-b bg-gray-50">프로젝션 기간</td><td className="px-2 py-1.5 border-b bg-yellow-50"><div className="flex items-center"><input type="number" value={input.projection_days} onChange={(e) => setInput(prev => ({ ...prev, projection_days: parseInt(e.target.value) || 365 }))} className="flex-1 bg-transparent border-none p-0 text-right text-xs" /><span className="ml-1">일</span></div></td></tr>
                  <tr><td className="px-2 py-1.5 border-b bg-gray-50">인프라 비용</td><td className="px-2 py-1.5 border-b bg-yellow-50"><div className="flex items-center"><input type="number" step="1" value={Math.round((input.basic_settings?.infrastructure_cost_ratio || 0.03) * 100)} onChange={(e) => setInput(prev => ({ ...prev, basic_settings: { ...prev.basic_settings!, infrastructure_cost_ratio: (parseFloat(e.target.value) || 0) / 100 } }))} className="flex-1 bg-transparent border-none p-0 text-right text-xs" /><span className="ml-1">%</span></div></td></tr>
                  <tr><td className="px-2 py-1.5 border-b bg-gray-50">마켓 수수료</td><td className="px-2 py-1.5 border-b bg-yellow-50"><div className="flex items-center"><input type="number" step="1" value={Math.round((input.basic_settings?.market_fee_ratio || 0.30) * 100)} onChange={(e) => setInput(prev => ({ ...prev, basic_settings: { ...prev.basic_settings!, market_fee_ratio: (parseFloat(e.target.value) || 0) / 100 } }))} className="flex-1 bg-transparent border-none p-0 text-right text-xs" /><span className="ml-1">%</span></div></td></tr>
                  <tr><td className="px-2 py-1.5 bg-gray-50">V.A.T</td><td className="px-2 py-1.5 bg-yellow-50"><div className="flex items-center"><input type="number" step="1" value={Math.round((input.basic_settings?.vat_ratio || 0.10) * 100)} onChange={(e) => setInput(prev => ({ ...prev, basic_settings: { ...prev.basic_settings!, vat_ratio: (parseFloat(e.target.value) || 0) / 100 } }))} className="flex-1 bg-transparent border-none p-0 text-right text-xs" /><span className="ml-1">%</span></div></td></tr>
                </tbody>
              </table>
            </div>
            <div className="border border-gray-300 rounded-lg overflow-hidden">
              <div className="bg-gray-100 px-3 py-1.5 border-b font-medium text-xs">HR Cost (월간)</div>
              <table className="w-full text-xs">
                <tbody>
                  <tr><td className="px-2 py-1.5 border-b bg-gray-50 w-2/5">직접 인건비</td><td className="px-2 py-1.5 border-b bg-yellow-50"><div className="flex items-center"><input type="number" value={input.basic_settings?.hr_direct_headcount || 50} onChange={(e) => setInput(prev => ({ ...prev, basic_settings: { ...prev.basic_settings!, hr_direct_headcount: parseInt(e.target.value) || 0 } }))} className="flex-1 bg-transparent border-none p-0 text-right text-xs" /><span className="ml-1">명</span></div></td></tr>
                  <tr><td className="px-2 py-1.5 border-b bg-gray-50 text-gray-500">(인당 1,500만원)</td><td className="px-2 py-1.5 border-b bg-gray-100 text-right">{formatNum((input.basic_settings?.hr_direct_headcount || 50) * 15000000)}원</td></tr>
                  <tr><td className="px-2 py-1.5 border-b bg-gray-50">간접 인건비</td><td className="px-2 py-1.5 border-b bg-yellow-50"><div className="flex items-center"><input type="number" value={input.basic_settings?.hr_indirect_headcount || 20} onChange={(e) => setInput(prev => ({ ...prev, basic_settings: { ...prev.basic_settings!, hr_indirect_headcount: parseInt(e.target.value) || 0 } }))} className="flex-1 bg-transparent border-none p-0 text-right text-xs" /><span className="ml-1">명</span></div></td></tr>
                  <tr><td className="px-2 py-1.5 border-b bg-gray-50 text-gray-500">(인당 1,400만원)</td><td className="px-2 py-1.5 border-b bg-gray-100 text-right">{formatNum((input.basic_settings?.hr_indirect_headcount || 20) * 14000000)}원</td></tr>
                  <tr><td className="px-2 py-1.5 bg-gray-50 font-medium">총 HR Cost</td><td className="px-2 py-1.5 bg-blue-50 text-right font-medium">{formatNum(((input.basic_settings?.hr_direct_headcount || 50) * 15000000) + ((input.basic_settings?.hr_indirect_headcount || 20) * 14000000))}원</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* 2. 프로젝트 정보 */}
      <div className="border border-purple-200 rounded-lg overflow-hidden">
        <button onClick={() => setActiveSection(activeSection === 'project' ? null : 'project')} className={`w-full flex items-center justify-between px-4 py-2.5 ${activeSection === 'project' ? 'bg-purple-50 border-b border-purple-200' : 'bg-gray-50 hover:bg-gray-100'}`}>
          <div className="flex items-center gap-2">
            <Gamepad2 className="w-4 h-4 text-purple-600" />
            <span className="font-medium text-sm">2. 프로젝트 정보</span>
            {projectInfo.genre && <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">{projectInfo.genre}</span>}
          </div>
          {activeSection === 'project' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {activeSection === 'project' && (
          <div className="p-3 space-y-3">
            {/* 장르 */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">🎮 장르</label>
              <div className="grid grid-cols-4 gap-1.5">
                {GENRE_OPTIONS.map(({ value, label }) => (
                  <label key={value} className={`flex items-center justify-center px-2 py-1.5 rounded border cursor-pointer text-xs ${projectInfo.genre === value ? 'bg-purple-100 border-purple-400 text-purple-800 font-medium' : 'bg-gray-50 border-gray-300 hover:bg-gray-100'}`}>
                    <input type="radio" name="genre" value={value} checked={projectInfo.genre === value} onChange={(e) => setProjectInfo(prev => ({ ...prev, genre: e.target.value }))} className="sr-only" />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            {/* 플랫폼 */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">💻 플랫폼 (다중 선택)</label>
              <MultiSelectCheckbox options={PLATFORM_OPTIONS} selected={projectInfo.platforms} onChange={(platforms) => setProjectInfo(prev => ({ ...prev, platforms }))} />
            </div>
            {/* 지역 */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">🌏 출시 지역 (다중 선택)</label>
              <MultiSelectCheckbox options={REGION_OPTIONS} selected={projectInfo.regions} onChange={(regions) => setProjectInfo(prev => ({ ...prev, regions }))} />
            </div>
            {/* 벤치마크 표시 */}
            {projectInfo.genre && projectInfo.platforms.length > 0 && (
              <div className="border border-orange-300 rounded-lg overflow-hidden">
                <div className="bg-orange-100 px-3 py-1.5 border-b font-medium text-xs text-orange-800">📊 시장 벤치마크 ({projectInfo.genre} / {projectInfo.platforms.join(', ')})</div>
                <table className="w-full text-xs">
                  <thead className="bg-gray-50"><tr><th className="px-2 py-1 text-left border-b">지표</th>{projectInfo.platforms.map(p => <th key={p} className="px-2 py-1 text-right border-b">{p}</th>)}</tr></thead>
                  <tbody>
                    <tr><td className="px-2 py-1 border-b">D1 Retention</td>{projectInfo.platforms.map(p => <td key={p} className="px-2 py-1 border-b text-right text-blue-600 font-medium">{((BENCHMARK_DATA[p]?.[projectInfo.genre]?.d1 || 0) * 100).toFixed(1)}%</td>)}</tr>
                    <tr><td className="px-2 py-1 border-b">D7 Retention</td>{projectInfo.platforms.map(p => <td key={p} className="px-2 py-1 border-b text-right">{((BENCHMARK_DATA[p]?.[projectInfo.genre]?.d7 || 0) * 100).toFixed(1)}%</td>)}</tr>
                    <tr><td className="px-2 py-1 border-b">D30 Retention</td>{projectInfo.platforms.map(p => <td key={p} className="px-2 py-1 border-b text-right">{((BENCHMARK_DATA[p]?.[projectInfo.genre]?.d30 || 0) * 100).toFixed(1)}%</td>)}</tr>
                    <tr><td className="px-2 py-1 border-b">P.Rate</td>{projectInfo.platforms.map(p => <td key={p} className="px-2 py-1 border-b text-right">{((BENCHMARK_DATA[p]?.[projectInfo.genre]?.pr || 0) * 100).toFixed(1)}%</td>)}</tr>
                    <tr><td className="px-2 py-1">ARPPU</td>{projectInfo.platforms.map(p => <td key={p} className="px-2 py-1 text-right">₩{formatNum(BENCHMARK_DATA[p]?.[projectInfo.genre]?.arppu || 0)}</td>)}</tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. 마케팅 & UA */}
      <div className="border border-orange-200 rounded-lg overflow-hidden">
        <button onClick={() => setActiveSection(activeSection === 'mkt' ? null : 'mkt')} className={`w-full flex items-center justify-between px-4 py-2.5 ${activeSection === 'mkt' ? 'bg-orange-50 border-b border-orange-200' : 'bg-gray-50 hover:bg-gray-100'}`}>
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-orange-600" />
            <span className="font-medium text-sm">3. 마케팅 & UA 설정</span>
            <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">→ NRU 자동계산</span>
          </div>
          {activeSection === 'mkt' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {activeSection === 'mkt' && (
          <div className="p-3 grid grid-cols-2 gap-3">
            <div className="border border-gray-300 rounded-lg overflow-hidden">
              <div className="bg-orange-100 px-3 py-1.5 border-b font-medium text-xs text-orange-800">MKT 설정</div>
              <table className="w-full text-xs">
                <tbody>
                  <tr><td className="px-2 py-1.5 border-b bg-gray-50 w-2/5">런칭 MKT 예산</td><td className="px-2 py-1.5 border-b bg-yellow-50"><div className="flex items-center"><input type="text" value={formatNum(input.basic_settings?.launch_mkt_budget || 0)} onChange={(e) => handleMktBudgetChange(parseInt(e.target.value.replace(/,/g, '')) || 0)} className="flex-1 bg-transparent border-none p-0 text-right text-xs" /><span className="ml-1">원</span></div></td></tr>
                  <tr><td className="px-2 py-1.5 border-b bg-gray-50">Sustaining MKT</td><td className="px-2 py-1.5 border-b bg-yellow-50"><div className="flex items-center"><input type="number" step="1" value={Math.round((input.basic_settings?.sustaining_mkt_ratio || 0.07) * 100)} onChange={(e) => setInput(prev => ({ ...prev, basic_settings: { ...prev.basic_settings!, sustaining_mkt_ratio: (parseFloat(e.target.value) || 0) / 100 } }))} className="flex-1 bg-transparent border-none p-0 text-right text-xs" /><span className="ml-1">%</span></div></td></tr>
                  <tr><td className="px-2 py-1.5 border-b bg-gray-50">CPI</td><td className="px-2 py-1.5 border-b bg-yellow-50"><div className="flex items-center"><input type="text" value={formatNum(input.basic_settings?.cpi || 2660)} onChange={(e) => setInput(prev => ({ ...prev, basic_settings: { ...prev.basic_settings!, cpi: parseInt(e.target.value.replace(/,/g, '')) || 0 } }))} className="flex-1 bg-transparent border-none p-0 text-right text-xs" /><span className="ml-1">원</span></div></td></tr>
                  <tr><td className="px-2 py-1.5 border-b bg-gray-50">Paid/Organic</td><td className="px-2 py-1.5 border-b bg-yellow-50"><div className="flex items-center"><input type="number" step="1" value={Math.round(input.nru.paid_organic_ratio * 100)} onChange={(e) => setInput(prev => ({ ...prev, nru: { ...prev.nru, paid_organic_ratio: (parseFloat(e.target.value) || 0) / 100 } }))} className="flex-1 bg-transparent border-none p-0 text-right text-xs" /><span className="ml-1">%</span></div></td></tr>
                  <tr><td className="px-2 py-1.5 bg-gray-50">NVR (전환율)</td><td className="px-2 py-1.5 bg-yellow-50"><div className="flex items-center"><input type="number" step="1" value={Math.round(input.nru.nvr * 100)} onChange={(e) => setInput(prev => ({ ...prev, nru: { ...prev.nru, nvr: (parseFloat(e.target.value) || 0) / 100 } }))} className="flex-1 bg-transparent border-none p-0 text-right text-xs" /><span className="ml-1">%</span></div></td></tr>
                </tbody>
              </table>
            </div>
            <div className="border border-orange-300 rounded-lg overflow-hidden">
              <div className="bg-orange-100 px-3 py-1.5 border-b font-medium text-xs text-orange-800">📊 D1 NRU 자동 계산</div>
              <table className="w-full text-xs">
                <tbody>
                  <tr><td className="px-2 py-1.5 border-b bg-gray-50 w-2/5">Paid Install</td><td className="px-2 py-1.5 border-b bg-blue-50 text-right">{formatNum(Math.floor((input.basic_settings?.launch_mkt_budget || 0) / (input.basic_settings?.cpi || 2660)))}명</td></tr>
                  <tr><td className="px-2 py-1.5 border-b bg-gray-50">Total Install</td><td className="px-2 py-1.5 border-b bg-blue-50 text-right">{formatNum((() => { const paid = Math.floor((input.basic_settings?.launch_mkt_budget || 0) / (input.basic_settings?.cpi || 2660)); const paidRatio = input.nru.paid_organic_ratio || 0.5; return paid + Math.floor(paid * ((1 - paidRatio) / paidRatio)); })())}명</td></tr>
                  <tr className="bg-green-50"><td className="px-2 py-1.5 border-b bg-green-100 font-medium text-green-800">Best</td><td className="px-2 py-1.5 border-b text-right font-bold text-green-700">{formatNum(calculateNRUFromMKT().best)}명</td></tr>
                  <tr className="bg-blue-50"><td className="px-2 py-1.5 border-b bg-blue-100 font-medium text-blue-800">Normal</td><td className="px-2 py-1.5 border-b text-right font-bold text-blue-700">{formatNum(calculateNRUFromMKT().normal)}명</td></tr>
                  <tr className="bg-red-50"><td className="px-2 py-1.5 bg-red-100 font-medium text-red-800">Worst</td><td className="px-2 py-1.5 text-right font-bold text-red-700">{formatNum(calculateNRUFromMKT().worst)}명</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* 4. 표본 게임 & 블렌딩 */}
      <div className="border border-blue-200 rounded-lg overflow-hidden">
        <button onClick={() => setActiveSection(activeSection === 'sample' ? null : 'sample')} className={`w-full flex items-center justify-between px-4 py-2.5 ${activeSection === 'sample' ? 'bg-blue-50 border-b border-blue-200' : 'bg-gray-50 hover:bg-gray-100'}`}>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-blue-600" />
            <span className="font-medium text-sm">4. 표본 게임 & 블렌딩</span>
            {selectedSampleGames.length > 0 && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{selectedSampleGames.length}개</span>}
          </div>
          {activeSection === 'sample' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {activeSection === 'sample' && (
          <div className="p-3 space-y-3">
            {/* AI 추천 옵션 */}
            <div className="flex items-center gap-4 p-2 bg-blue-50 rounded border border-blue-200">
              <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                <input type="checkbox" checked={useAIRecommend} onChange={(e) => setUseAIRecommend(e.target.checked)} className="w-3.5 h-3.5 text-blue-600" />
                <span className="font-medium text-blue-800">🤖 AI 추천</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                <input type="checkbox" checked={useBenchmark} onChange={(e) => setUseBenchmark(e.target.checked)} className="w-3.5 h-3.5 text-blue-600" />
                <span className="font-medium text-blue-800">📊 벤치마크 활용</span>
              </label>
            </div>

            {/* AI 추천 */}
            {useAIRecommend && recommendedGames.length > 0 && (
              <div className="border border-purple-300 rounded-lg overflow-hidden">
                <div className="bg-purple-100 px-3 py-1.5 border-b font-medium text-xs text-purple-800">🤖 AI 추천 (유사도 30점↑)</div>
                <div className="p-2 grid grid-cols-2 gap-1.5">
                  {recommendedGames.map(({ game, score, reason }) => (
                    <label key={game} className="flex items-center gap-1.5 p-1.5 rounded border hover:bg-purple-50 cursor-pointer text-xs">
                      <input type="checkbox" checked={selectedSampleGames.includes(game)} onChange={(e) => e.target.checked ? handleSampleGameSelect([...selectedSampleGames, game]) : handleSampleGameSelect(selectedSampleGames.filter(g => g !== game))} className="w-3.5 h-3.5 text-purple-600" />
                      <span className="flex-1 truncate">{game}</span>
                      <span className={`px-1.5 py-0.5 rounded text-xs ${score >= 70 ? 'bg-green-100 text-green-700' : score >= 50 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>{score}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* 블렌딩 공식 */}
            {useBenchmark && (
              <div className="border border-indigo-300 rounded-lg overflow-hidden">
                <div className="bg-indigo-100 px-3 py-1.5 border-b font-medium text-xs text-indigo-800 flex items-center gap-1"><Sliders className="w-3.5 h-3.5" />블렌딩 공식</div>
                <div className="p-3 space-y-3">
                  <div className="p-2 bg-indigo-50 rounded text-xs font-mono text-indigo-800">
                    <strong>최종 Retention</strong> = (내부 표본 × <span className="text-indigo-600">{(blendingWeight * 100).toFixed(0)}%</span>) + (벤치마크 × <span className="text-orange-600">{((1 - blendingWeight) * 100).toFixed(0)}%</span>)
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1"><span>내부 표본</span><span className="font-bold">{(blendingWeight * 100).toFixed(0)}%</span></div>
                    <input type="range" min="0" max="100" value={blendingWeight * 100} onChange={(e) => setBlendingWeight(parseInt(e.target.value) / 100)} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                    <div className="flex justify-between text-xs text-gray-400 mt-0.5"><span>벤치마크 100%</span><span>내부 100%</span></div>
                  </div>
                  {selectedSampleGames.length > 0 && projectInfo.genre && (
                    <div className="p-2 bg-white rounded border text-xs">
                      <div className="flex justify-between"><span className="text-gray-600">내부 표본 D1</span><span>{(input.retention.target_d1_retention.normal * 100).toFixed(1)}%</span></div>
                      <div className="flex justify-between"><span className="text-gray-600">벤치마크 D1</span><span>{(currentBenchmark.d1 * 100).toFixed(1)}%</span></div>
                      <div className="flex justify-between font-medium text-indigo-800 pt-1 border-t mt-1"><span>→ 블렌딩 D1</span><span>{((input.retention.target_d1_retention.normal * blendingWeight + currentBenchmark.d1 * (1 - blendingWeight)) * 100).toFixed(1)}%</span></div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 수동 선택 */}
            <div className="border border-gray-300 rounded-lg overflow-hidden">
              <div className="bg-gray-100 px-3 py-1.5 border-b font-medium text-xs">📋 수동 선택</div>
              <div className="p-2">
                <GameGridSelector availableGames={games.retention} selectedGames={selectedSampleGames} onChange={handleSampleGameSelect} metadata={gameMetadata} />
              </div>
            </div>

            {selectedSampleGames.length > 0 && (
              <div className="p-2 bg-blue-50 rounded border border-blue-200 text-xs text-blue-700">
                <strong>✅ 선택:</strong> {selectedSampleGames.join(', ')}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 5. 보정값 설정 */}
      <div className="border border-green-200 rounded-lg overflow-hidden">
        <button onClick={() => setActiveSection(activeSection === 'adjust' ? null : 'adjust')} className={`w-full flex items-center justify-between px-4 py-2.5 ${activeSection === 'adjust' ? 'bg-green-50 border-b border-green-200' : 'bg-gray-50 hover:bg-gray-100'}`}>
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-green-600" />
            <span className="font-medium text-sm">5. 보정값 설정</span>
          </div>
          {activeSection === 'adjust' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {activeSection === 'adjust' && (
          <div className="p-3 space-y-3">
            {/* Retention */}
            <div className="border border-gray-300 rounded-lg p-3">
              <h5 className="text-xs font-medium text-gray-700 mb-2">📈 Retention D+1 (%)</h5>
              <div className="grid grid-cols-3 gap-2">
                <div className="p-2 bg-green-50 rounded border border-green-200">
                  <label className="block text-xs text-green-700 mb-1">Best</label>
                  <div className="flex items-center"><input type="number" step="1" value={Math.round(input.retention.target_d1_retention.best * 100)} onChange={(e) => setInput(prev => ({ ...prev, retention: { ...prev.retention, target_d1_retention: { ...prev.retention.target_d1_retention, best: (parseFloat(e.target.value) || 0) / 100 } } }))} className="w-full px-2 py-1 border rounded text-right text-xs" /><span className="ml-1 text-xs">%</span></div>
                </div>
                <div className="p-2 bg-blue-50 rounded border border-blue-200">
                  <label className="block text-xs text-blue-700 mb-1">Normal</label>
                  <div className="flex items-center"><input type="number" step="1" value={Math.round(input.retention.target_d1_retention.normal * 100)} onChange={(e) => setInput(prev => ({ ...prev, retention: { ...prev.retention, target_d1_retention: { ...prev.retention.target_d1_retention, normal: (parseFloat(e.target.value) || 0) / 100 } } }))} className="w-full px-2 py-1 border rounded text-right text-xs" /><span className="ml-1 text-xs">%</span></div>
                </div>
                <div className="p-2 bg-red-50 rounded border border-red-200">
                  <label className="block text-xs text-red-700 mb-1">Worst</label>
                  <div className="flex items-center"><input type="number" step="1" value={Math.round(input.retention.target_d1_retention.worst * 100)} onChange={(e) => setInput(prev => ({ ...prev, retention: { ...prev.retention, target_d1_retention: { ...prev.retention.target_d1_retention, worst: (parseFloat(e.target.value) || 0) / 100 } } }))} className="w-full px-2 py-1 border rounded text-right text-xs" /><span className="ml-1 text-xs">%</span></div>
                </div>
              </div>
            </div>
            {/* NRU/Revenue 보정 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="border border-gray-300 rounded-lg p-3">
                <h5 className="text-xs font-medium text-gray-700 mb-2">👥 NRU 보정 (Normal 대비)</h5>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 bg-green-50 rounded"><label className="block text-xs text-green-700">Best</label><div className="flex items-center mt-1"><input type="number" step="1" value={Math.round((input.nru.adjustment?.best_vs_normal || 0.05) * 100)} onChange={(e) => setInput(prev => ({ ...prev, nru: { ...prev.nru, adjustment: { ...prev.nru.adjustment, best_vs_normal: (parseFloat(e.target.value) || 0) / 100 } } }))} className="w-full px-1.5 py-1 border rounded text-right text-xs" /><span className="ml-1 text-xs">%</span></div></div>
                  <div className="p-2 bg-red-50 rounded"><label className="block text-xs text-red-700">Worst</label><div className="flex items-center mt-1"><input type="number" step="1" value={Math.round((input.nru.adjustment?.worst_vs_normal || -0.05) * 100)} onChange={(e) => setInput(prev => ({ ...prev, nru: { ...prev.nru, adjustment: { ...prev.nru.adjustment, worst_vs_normal: (parseFloat(e.target.value) || 0) / 100 } } }))} className="w-full px-1.5 py-1 border rounded text-right text-xs" /><span className="ml-1 text-xs">%</span></div></div>
                </div>
              </div>
              <div className="border border-gray-300 rounded-lg p-3">
                <h5 className="text-xs font-medium text-gray-700 mb-2">💰 Revenue 보정</h5>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="space-y-1">
                    <span className="text-gray-500">P.Rate</span>
                    <div className="flex gap-1">
                      <div className="flex-1 p-1 bg-green-50 rounded text-center">B: <input type="number" value={Math.round((input.revenue.pr_adjustment?.best_vs_normal || 0.05) * 100)} onChange={(e) => setInput(prev => ({ ...prev, revenue: { ...prev.revenue, pr_adjustment: { ...prev.revenue.pr_adjustment, best_vs_normal: (parseFloat(e.target.value) || 0) / 100 } } }))} className="w-8 text-center bg-transparent border-none" />%</div>
                      <div className="flex-1 p-1 bg-red-50 rounded text-center">W: <input type="number" value={Math.round((input.revenue.pr_adjustment?.worst_vs_normal || -0.05) * 100)} onChange={(e) => setInput(prev => ({ ...prev, revenue: { ...prev.revenue, pr_adjustment: { ...prev.revenue.pr_adjustment, worst_vs_normal: (parseFloat(e.target.value) || 0) / 100 } } }))} className="w-8 text-center bg-transparent border-none" />%</div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <span className="text-gray-500">ARPPU</span>
                    <div className="flex gap-1">
                      <div className="flex-1 p-1 bg-green-50 rounded text-center">B: <input type="number" value={Math.round((input.revenue.arppu_adjustment?.best_vs_normal || 0.10) * 100)} onChange={(e) => setInput(prev => ({ ...prev, revenue: { ...prev.revenue, arppu_adjustment: { ...prev.revenue.arppu_adjustment, best_vs_normal: (parseFloat(e.target.value) || 0) / 100 } } }))} className="w-8 text-center bg-transparent border-none" />%</div>
                      <div className="flex-1 p-1 bg-red-50 rounded text-center">W: <input type="number" value={Math.round((input.revenue.arppu_adjustment?.worst_vs_normal || -0.10) * 100)} onChange={(e) => setInput(prev => ({ ...prev, revenue: { ...prev.revenue, arppu_adjustment: { ...prev.revenue.arppu_adjustment, worst_vs_normal: (parseFloat(e.target.value) || 0) / 100 } } }))} className="w-8 text-center bg-transparent border-none" />%</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 6. 계절성 */}
      <div className="border border-teal-200 rounded-lg overflow-hidden">
        <button onClick={() => setActiveSection(activeSection === 'seasonality' ? null : 'seasonality')} className={`w-full flex items-center justify-between px-4 py-2.5 ${activeSection === 'seasonality' ? 'bg-teal-50 border-b border-teal-200' : 'bg-gray-50 hover:bg-gray-100'}`}>
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-teal-600" />
            <span className="font-medium text-sm">6. 계절성 (지역별 자동)</span>
            <span className="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full">선택</span>
          </div>
          {activeSection === 'seasonality' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {activeSection === 'seasonality' && (
          <div className="p-3 space-y-3">
            <div className="flex items-center gap-2 p-2 bg-teal-50 rounded border border-teal-200">
              <input type="checkbox" id="seasonality" checked={seasonalityEnabled} onChange={(e) => setSeasonalityEnabled(e.target.checked)} className="w-3.5 h-3.5 text-teal-600" />
              <label htmlFor="seasonality" className="text-xs font-medium text-teal-800">계절성 적용</label>
              {projectInfo.regions.length > 0 && <span className="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded">{projectInfo.regions.map(r => REGION_OPTIONS.find(o => o.value === r)?.label).join(', ')}</span>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="border border-gray-300 rounded-lg overflow-hidden">
                <div className="bg-gray-100 px-3 py-1.5 border-b font-medium text-xs">요일별 (공통)</div>
                <table className="w-full text-xs">
                  <tbody>
                    {['월', '화', '수', '목', '금', '토', '일'].map((d, i) => {
                      const v = [0.85, 0.85, 0.85, 0.85, 1.05, 1.25, 1.15][i];
                      return <tr key={d} className={i < 6 ? 'border-b' : ''}><td className="px-2 py-1 bg-gray-50 w-1/2">{d}</td><td className={`px-2 py-1 text-right ${v > 1 ? 'bg-green-50 text-green-700' : ''}`}>×{v.toFixed(2)}</td></tr>;
                    })}
                  </tbody>
                </table>
              </div>
              <div className="border border-gray-300 rounded-lg overflow-hidden">
                <div className="bg-gray-100 px-3 py-1.5 border-b font-medium text-xs">월별 ({projectInfo.regions.length > 0 ? projectInfo.regions.map(r => REGION_OPTIONS.find(o => o.value === r)?.label).join('/') : '글로벌'})</div>
                <div className="max-h-40 overflow-y-auto">
                  <table className="w-full text-xs">
                    <tbody>
                      {getAverageSeasonality().monthly.map((v, i) => {
                        const desc = getAverageSeasonality().description[i];
                        return <tr key={i} className={i < 11 ? 'border-b' : ''}><td className="px-2 py-1 bg-gray-50 w-1/2">{i + 1}월{desc && <span className="text-gray-400 ml-1">({desc})</span>}</td><td className={`px-2 py-1 text-right font-medium ${v > 1.05 ? 'bg-green-50 text-green-700' : v < 0.95 ? 'bg-red-50 text-red-700' : ''}`}>×{v.toFixed(2)}</td></tr>;
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default InputPanel;
