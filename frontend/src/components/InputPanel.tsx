import { useState, useEffect } from 'react';
import { TrendingUp, Users, DollarSign, ChevronDown, ChevronUp, HelpCircle, Building, Gamepad2, Info } from 'lucide-react';
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

  // Phase 2: MKT → NRU 자동 계산
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

    return {
      best: Math.floor(d1Nru * 1.1),    // +10%
      normal: d1Nru,
      worst: Math.floor(d1Nru * 0.9),   // -10%
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
            <h3 className="font-semibold text-blue-900 mb-2">📊 KPI 프로젝션 계산 원리</h3>
            <div className="text-sm text-blue-800 space-y-1">
              <p><strong>1. Retention Curve:</strong> 표본 게임들의 리텐션 데이터를 Power 함수(a × day^b)로 회귀분석</p>
              <p><strong>2. NRU:</strong> D1 NRU × 일별 감소율(표본 게임 평균)</p>
              <p><strong>3. DAU:</strong> Cohort 매트릭스 계산 - DAU(d) = Σ(NRU(i) × Retention(d-i))</p>
              <p><strong>4. Revenue:</strong> DAU × P.Rate × ARPPU</p>
            </div>
          </div>
        </div>
      </div>

      {/* 1. Basic Settings */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <button onClick={() => setActiveSection(activeSection === 'basic' ? null : 'basic')} className={`w-full flex items-center justify-between px-4 py-3 ${activeSection === 'basic' ? 'bg-slate-100 border-b' : 'bg-gray-50 hover:bg-gray-100'}`}>
          <div className="flex items-center gap-2"><Building className="w-5 h-5 text-slate-600" /><span className="font-medium">1. 산정 정보 (Basic Settings)</span></div>
          {activeSection === 'basic' ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </button>
        {activeSection === 'basic' && (
          <div className="p-4 space-y-4">
            <GuideBox title="산정 정보 입력 가이드">
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li><strong>V.A.T:</strong> 한국 10%, 일본 8%, 대만 5%, 미국 ~10% (주별 상이)</li>
                <li><strong>마켓 수수료:</strong> Google Play/App Store 기본 30%, 소규모 개발사 프로그램 15%</li>
                <li><strong>인프라 비용:</strong> 매출의 약 3% (서버, CDN, 클라우드 비용)</li>
                <li><strong>직접 인건비:</strong> 프로덕트 직접 담당 인원 (급여+복리후생 약 1억/연 + 인원연동비 약 3천만/연)</li>
                <li><strong>간접 인건비:</strong> 공용 조직 배부 비용 (참고: inZOI 14.3M, DKO 13.4M, AOD 14.5M원/월)</li>
              </ul>
            </GuideBox>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-4">
                <div className="border border-gray-300 rounded-lg overflow-hidden">
                  <div className="bg-gray-100 px-3 py-2 border-b font-medium text-sm">기본 정보</div>
                  <table className="w-full text-sm table-fixed">
                    <tbody>
                      <tr><td className="px-3 py-2 border-b bg-gray-50 w-2/5">런칭 예정일</td><td className="px-3 py-2 border-b bg-yellow-50"><input type="date" value={input.launch_date} onChange={(e) => setInput(prev => ({ ...prev, launch_date: e.target.value }))} className="w-full bg-transparent border-none p-0" /></td></tr>
                      <tr><td className="px-3 py-2 border-b bg-gray-50">프로젝션 기간 (Day)</td><td className="px-3 py-2 border-b bg-yellow-50"><input type="number" value={input.projection_days} onChange={(e) => setInput(prev => ({ ...prev, projection_days: parseInt(e.target.value) || 365 }))} className="w-full bg-transparent border-none p-0 text-right" /></td></tr>
                      <tr><td className="px-3 py-2 border-b bg-gray-50">인프라 비용 (%)</td><td className="px-3 py-2 border-b bg-yellow-50"><input type="number" step="1" value={Math.round((input.basic_settings?.infrastructure_cost_ratio || 0.03) * 100)} onChange={(e) => setInput(prev => ({ ...prev, basic_settings: { ...prev.basic_settings!, infrastructure_cost_ratio: (parseFloat(e.target.value) || 0) / 100 } }))} className="w-full bg-transparent border-none p-0 text-right" /></td></tr>
                      <tr><td className="px-3 py-2 border-b bg-gray-50">마켓 수수료 (%)</td><td className="px-3 py-2 border-b bg-yellow-50"><input type="number" step="1" value={Math.round((input.basic_settings?.market_fee_ratio || 0.30) * 100)} onChange={(e) => setInput(prev => ({ ...prev, basic_settings: { ...prev.basic_settings!, market_fee_ratio: (parseFloat(e.target.value) || 0) / 100 } }))} className="w-full bg-transparent border-none p-0 text-right" /></td></tr>
                      <tr><td className="px-3 py-2 bg-gray-50">V.A.T (%)</td><td className="px-3 py-2 bg-yellow-50"><input type="number" step="1" value={Math.round((input.basic_settings?.vat_ratio || 0.10) * 100)} onChange={(e) => setInput(prev => ({ ...prev, basic_settings: { ...prev.basic_settings!, vat_ratio: (parseFloat(e.target.value) || 0) / 100 } }))} className="w-full bg-transparent border-none p-0 text-right" /></td></tr>
                    </tbody>
                  </table>
                </div>
                <div className="border border-gray-300 rounded-lg overflow-hidden">
                  <div className="bg-gray-100 px-3 py-2 border-b font-medium text-sm">CPI & UAC</div>
                  <table className="w-full text-sm table-fixed">
                    <tbody>
                      <tr><td className="px-3 py-2 border-b bg-gray-50 w-2/5">CPI (Cost Per Install)</td><td className="px-3 py-2 border-b bg-yellow-50"><div className="flex items-center"><input type="number" value={input.basic_settings?.cpi || 2660} onChange={(e) => setInput(prev => ({ ...prev, basic_settings: { ...prev.basic_settings!, cpi: parseInt(e.target.value) || 0 } }))} className="flex-1 bg-transparent border-none p-0 text-right min-w-0" /><span className="ml-1 flex-shrink-0">원</span></div></td></tr>
                      <tr><td className="px-3 py-2 bg-gray-50">UAC (User Acquisition Cost)</td><td className="px-3 py-2 bg-yellow-50"><div className="flex items-center"><input type="number" value={input.basic_settings?.uac || 3800} onChange={(e) => setInput(prev => ({ ...prev, basic_settings: { ...prev.basic_settings!, uac: parseInt(e.target.value) || 0 } }))} className="flex-1 bg-transparent border-none p-0 text-right min-w-0" /><span className="ml-1 flex-shrink-0">원</span></div></td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="space-y-4">
                <div className="border border-gray-300 rounded-lg overflow-hidden">
                  <div className="bg-gray-100 px-3 py-2 border-b font-medium text-sm">HR Cost (월간, 인당 1,500만원 기준)</div>
                  <table className="w-full text-sm table-fixed">
                    <tbody>
                      <tr><td className="px-3 py-2 border-b bg-gray-50 w-2/5">직접 인건비 (인원수)</td><td className="px-3 py-2 border-b bg-yellow-50"><div className="flex items-center"><input type="number" value={input.basic_settings?.hr_direct_headcount || 50} onChange={(e) => setInput(prev => ({ ...prev, basic_settings: { ...prev.basic_settings!, hr_direct_headcount: parseInt(e.target.value) || 0 } }))} className="flex-1 bg-transparent border-none p-0 text-right min-w-0" /><span className="ml-1 flex-shrink-0">명</span></div></td></tr>
                      <tr><td className="px-3 py-2 border-b bg-gray-50">직접 인건비 (월)</td><td className="px-3 py-2 border-b bg-gray-100 text-right whitespace-nowrap">{((input.basic_settings?.hr_direct_headcount || 50) * 15000000).toLocaleString()}원</td></tr>
                      <tr><td className="px-3 py-2 border-b bg-gray-50">간접 인건비 (월)</td><td className="px-3 py-2 border-b bg-yellow-50"><div className="flex items-center"><input type="number" value={input.basic_settings?.hr_indirect_monthly || 14000000} onChange={(e) => setInput(prev => ({ ...prev, basic_settings: { ...prev.basic_settings!, hr_indirect_monthly: parseInt(e.target.value) || 0 } }))} className="flex-1 bg-transparent border-none p-0 text-right min-w-0" /><span className="ml-1 flex-shrink-0">원</span></div></td></tr>
                      <tr><td className="px-3 py-2 bg-gray-50 font-medium">총 HR Cost (월)</td><td className="px-3 py-2 bg-blue-50 text-right font-medium whitespace-nowrap">{(((input.basic_settings?.hr_direct_headcount || 50) * 15000000) + (input.basic_settings?.hr_indirect_monthly || 14000000)).toLocaleString()}원</td></tr>
                    </tbody>
                  </table>
                </div>
                <div className="border border-gray-300 rounded-lg overflow-hidden">
                  <div className="bg-gray-100 px-3 py-2 border-b font-medium text-sm">MKT 비용</div>
                  <table className="w-full text-sm table-fixed">
                    <tbody>
                      <tr><td className="px-3 py-2 bg-gray-50 w-2/5">Sustaining MKT (매출의 %)</td><td className="px-3 py-2 bg-yellow-50"><div className="flex items-center"><input type="number" step="1" value={Math.round((input.basic_settings?.sustaining_mkt_ratio || 0.07) * 100)} onChange={(e) => setInput(prev => ({ ...prev, basic_settings: { ...prev.basic_settings!, sustaining_mkt_ratio: (parseFloat(e.target.value) || 0) / 100 } }))} className="flex-1 bg-transparent border-none p-0 text-right min-w-0" /><span className="ml-1 flex-shrink-0">%</span></div></td></tr>
                    </tbody>
                  </table>
                  <div className="px-3 py-2 text-xs text-gray-500">* 런칭 후 지속 마케팅 비용</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. Sample Games */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <button onClick={() => setActiveSection(activeSection === 'sample' ? null : 'sample')} className={`w-full flex items-center justify-between px-4 py-3 ${activeSection === 'sample' ? 'bg-purple-50 border-b border-purple-200' : 'bg-gray-50 hover:bg-gray-100'}`}>
          <div className="flex items-center gap-2">
            <Gamepad2 className="w-5 h-5 text-purple-600" />
            <span className="font-medium">2. 표본 게임 선택 (Sample Games)</span>
            {selectedSampleGames.length > 0 && <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">{selectedSampleGames.length}개 선택됨</span>}
          </div>
          {activeSection === 'sample' ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </button>
        {activeSection === 'sample' && (
          <div className="p-4 space-y-4">
            <GuideBox title="표본 게임 선택 가이드">
              <ul className="list-disc list-inside space-y-1">
                <li>여기서 선택한 게임이 <strong>Retention, NRU, Revenue 모든 설정에 동일하게 적용</strong>됩니다.</li>
                <li><strong>ℹ️ 아이콘에 마우스를 올리면</strong> 게임의 장르, 출시일 정보를 확인할 수 있습니다.</li>
              </ul>
            </GuideBox>
            <GameGridSelector availableGames={games.retention} selectedGames={selectedSampleGames} onChange={handleSampleGameSelect} metadata={gameMetadata} />
            {selectedSampleGames.length > 0 && (
              <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                <p className="text-sm text-purple-700"><strong>✅ 선택된 표본 게임:</strong> {selectedSampleGames.join(', ')}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. Retention */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <button onClick={() => setActiveSection(activeSection === 'retention' ? null : 'retention')} className={`w-full flex items-center justify-between px-4 py-3 ${activeSection === 'retention' ? 'bg-emerald-50 border-b border-emerald-200' : 'bg-gray-50 hover:bg-gray-100'}`}>
          <div className="flex items-center gap-2"><TrendingUp className="w-5 h-5 text-emerald-600" /><span className="font-medium">3. Retention 설정</span></div>
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

      {/* 4. NRU */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <button onClick={() => setActiveSection(activeSection === 'nru' ? null : 'nru')} className={`w-full flex items-center justify-between px-4 py-3 ${activeSection === 'nru' ? 'bg-blue-50 border-b border-blue-200' : 'bg-gray-50 hover:bg-gray-100'}`}>
          <div className="flex items-center gap-2"><Users className="w-5 h-5 text-blue-600" /><span className="font-medium">4. NRU 설정</span></div>
          {activeSection === 'nru' ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </button>
        {activeSection === 'nru' && (
          <div className="p-4 space-y-4">
            <GuideBox title="NRU 입력 가이드 (엑셀 로직 기준)">
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li><strong>D1 NRU:</strong> 첫 날 예상 신규 유저 수 (Best/Normal/Worst 시나리오별)</li>
                <li><strong>Paid/Organic Ratio:</strong> 유료 마케팅 유입 비율 (예: 50%)</li>
                <li><strong>NVR (Net Value Rate):</strong> 설치 후 전환율 (예: 70%)</li>
                <li><strong>Best:</strong> 표본 게임 평균 NRU 감소율 그대로 적용</li>
                <li><strong>Normal:</strong> Best 대비 보정값 적용</li>
                <li><strong>Worst:</strong> Normal 대비 보정값 적용</li>
              </ul>
            </GuideBox>
            <div className="p-3 bg-gray-50 rounded-lg border"><p className="text-sm text-gray-600"><strong>적용된 표본 게임:</strong> {selectedSampleGames.join(', ') || '(선택 필요)'}</p></div>
            <div>
              <h4 className="font-medium text-gray-700 mb-2">D1 NRU (첫 날 신규 유저)</h4>
              <div className="grid grid-cols-3 gap-4">
                <div className="p-3 bg-green-50 rounded-lg border border-green-200"><label className="block text-xs font-medium text-green-700 mb-1">Best</label><input type="number" value={input.nru.d1_nru.best} onChange={(e) => setInput(prev => ({ ...prev, nru: { ...prev.nru, d1_nru: { ...prev.nru.d1_nru, best: parseInt(e.target.value) || 0 } } }))} className="w-full px-2 py-1 border border-green-300 rounded text-right" /></div>
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-200"><label className="block text-xs font-medium text-blue-700 mb-1">Normal</label><input type="number" value={input.nru.d1_nru.normal} onChange={(e) => setInput(prev => ({ ...prev, nru: { ...prev.nru, d1_nru: { ...prev.nru.d1_nru, normal: parseInt(e.target.value) || 0 } } }))} className="w-full px-2 py-1 border border-blue-300 rounded text-right" /></div>
                <div className="p-3 bg-red-50 rounded-lg border border-red-200"><label className="block text-xs font-medium text-red-700 mb-1">Worst</label><input type="number" value={input.nru.d1_nru.worst} onChange={(e) => setInput(prev => ({ ...prev, nru: { ...prev.nru, d1_nru: { ...prev.nru.d1_nru, worst: parseInt(e.target.value) || 0 } } }))} className="w-full px-2 py-1 border border-red-300 rounded text-right" /></div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Paid/Organic Ratio (%)</label><div className="flex items-center"><input type="number" step="1" value={Math.round(input.nru.paid_organic_ratio * 100)} onChange={(e) => setInput(prev => ({ ...prev, nru: { ...prev.nru, paid_organic_ratio: (parseFloat(e.target.value) || 0) / 100 } }))} className="w-full px-3 py-2 border rounded-lg text-right" /><span className="ml-2">%</span></div><p className="text-xs text-gray-500 mt-1">유료 마케팅 유입 비율</p></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">NVR - Net Value Rate (%)</label><div className="flex items-center"><input type="number" step="1" value={Math.round(input.nru.nvr * 100)} onChange={(e) => setInput(prev => ({ ...prev, nru: { ...prev.nru, nvr: (parseFloat(e.target.value) || 0) / 100 } }))} className="w-full px-3 py-2 border rounded-lg text-right" /><span className="ml-2">%</span></div><p className="text-xs text-gray-500 mt-1">설치 후 전환율</p></div>
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

      {/* 5. Revenue */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <button onClick={() => setActiveSection(activeSection === 'revenue' ? null : 'revenue')} className={`w-full flex items-center justify-between px-4 py-3 ${activeSection === 'revenue' ? 'bg-amber-50 border-b border-amber-200' : 'bg-gray-50 hover:bg-gray-100'}`}>
          <div className="flex items-center gap-2"><DollarSign className="w-5 h-5 text-amber-600" /><span className="font-medium">5. Revenue 설정</span></div>
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

      {/* 6. Phase 2: MKT → NRU 자동 계산 */}
      <div className="border border-orange-200 rounded-lg overflow-hidden">
        <button onClick={() => setActiveSection(activeSection === 'mkt-calc' ? null : 'mkt-calc')} className={`w-full flex items-center justify-between px-4 py-3 ${activeSection === 'mkt-calc' ? 'bg-orange-50 border-b border-orange-200' : 'bg-gray-50 hover:bg-gray-100'}`}>
          <div className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-orange-600" />
            <span className="font-medium">6. MKT → NRU 자동 계산</span>
            <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">Phase 2</span>
          </div>
          {activeSection === 'mkt-calc' ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </button>
        {activeSection === 'mkt-calc' && (
          <div className="p-4 space-y-4">
            <GuideBox title="MKT 기반 NRU 자동 산출">
              <div className="space-y-1 text-xs">
                <p><strong>계산식:</strong> D1 NRU = (마케팅 예산 ÷ CPI × Organic 배수) × NVR</p>
                <p><strong>예시:</strong> 50억 ÷ 2,660원 × 2(Paid 50%) × 70% = <strong>약 263만명</strong></p>
              </div>
            </GuideBox>

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
                MKT 예산 기반 D1 NRU 자동 계산 활성화
              </label>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="border border-gray-300 rounded-lg overflow-hidden">
                <div className="bg-gray-100 px-3 py-2 border-b font-medium text-sm">MKT 예산 입력</div>
                <table className="w-full text-sm table-fixed">
                  <tbody>
                    <tr>
                      <td className="px-3 py-2 border-b bg-gray-50 w-2/5">런칭 MKT 예산</td>
                      <td className="px-3 py-2 border-b bg-yellow-50">
                        <div className="flex items-center">
                          <input 
                            type="number" 
                            value={input.basic_settings?.launch_mkt_budget || 0} 
                            onChange={(e) => handleMktBudgetChange(parseInt(e.target.value) || 0)}
                            className="flex-1 bg-transparent border-none p-0 text-right min-w-0" 
                          />
                          <span className="ml-1 flex-shrink-0">원</span>
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 border-b bg-gray-50">CPI</td>
                      <td className="px-3 py-2 border-b bg-gray-100 text-right whitespace-nowrap">{(input.basic_settings?.cpi || 2660).toLocaleString()}원</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 border-b bg-gray-50">Paid/Organic 비율</td>
                      <td className="px-3 py-2 border-b bg-gray-100 text-right">{Math.round(input.nru.paid_organic_ratio * 100)}% / {Math.round((1 - input.nru.paid_organic_ratio) * 100)}%</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 bg-gray-50">NVR (전환율)</td>
                      <td className="px-3 py-2 bg-gray-100 text-right">{Math.round(input.nru.nvr * 100)}%</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="border border-gray-300 rounded-lg overflow-hidden">
                <div className="bg-gray-100 px-3 py-2 border-b font-medium text-sm">자동 계산 결과</div>
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
                      <td className="px-3 py-2 border-b bg-green-100 font-medium">D1 NRU (Best)</td>
                      <td className="px-3 py-2 border-b text-right font-medium text-green-700">{calculateNRUFromMKT().best.toLocaleString()}명</td>
                    </tr>
                    <tr className="bg-blue-50">
                      <td className="px-3 py-2 border-b bg-blue-100 font-medium">D1 NRU (Normal)</td>
                      <td className="px-3 py-2 border-b text-right font-medium text-blue-700">{calculateNRUFromMKT().normal.toLocaleString()}명</td>
                    </tr>
                    <tr className="bg-red-50">
                      <td className="px-3 py-2 bg-red-100 font-medium">D1 NRU (Worst)</td>
                      <td className="px-3 py-2 text-right font-medium text-red-700">{calculateNRUFromMKT().worst.toLocaleString()}명</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 7. Phase 2: 계절성 팩터 */}
      <div className="border border-teal-200 rounded-lg overflow-hidden">
        <button onClick={() => setActiveSection(activeSection === 'seasonality' ? null : 'seasonality')} className={`w-full flex items-center justify-between px-4 py-3 ${activeSection === 'seasonality' ? 'bg-teal-50 border-b border-teal-200' : 'bg-gray-50 hover:bg-gray-100'}`}>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-teal-600" />
            <span className="font-medium">7. 계절성 팩터 (Seasonality)</span>
            <span className="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full">Phase 2</span>
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
