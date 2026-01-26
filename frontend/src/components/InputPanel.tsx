import { useState } from 'react';
import { 
  TrendingUp, 
  Users, 
  DollarSign, 
  Calendar,
  ChevronDown,
  ChevronUp,
  Info,
  Plus,
  X
} from 'lucide-react';
import type { ProjectionInput, GameListResponse } from '../types';

interface InputPanelProps {
  games: GameListResponse;
  input: ProjectionInput;
  setInput: React.Dispatch<React.SetStateAction<ProjectionInput>>;
}

interface GameSelectorProps {
  label: string;
  availableGames: string[];
  selectedGames: string[];
  onChange: (games: string[]) => void;
  maxGames?: number;
}

const GameSelector: React.FC<GameSelectorProps> = ({ 
  label, 
  availableGames, 
  selectedGames, 
  onChange,
  maxGames = 4 
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleSelect = (game: string) => {
    if (selectedGames.includes(game)) {
      onChange(selectedGames.filter(g => g !== game));
    } else if (selectedGames.length < maxGames) {
      onChange([...selectedGames, game]);
    }
  };

  const handleRemove = (game: string) => {
    onChange(selectedGames.filter(g => g !== game));
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      
      {/* Selected Games */}
      <div className="flex flex-wrap gap-2 min-h-[32px]">
        {selectedGames.map(game => (
          <span 
            key={game}
            className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 text-sm rounded-md"
          >
            {game}
            <button 
              onClick={() => handleRemove(game)}
              className="hover:text-blue-600"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        {selectedGames.length === 0 && (
          <span className="text-sm text-gray-400">게임을 선택하세요 (최대 {maxGames}개)</span>
        )}
      </div>

      {/* Dropdown */}
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between px-3 py-2 border border-gray-300 rounded-lg bg-white hover:border-gray-400 transition-colors"
        >
          <span className="text-sm text-gray-600">
            {selectedGames.length > 0 
              ? `${selectedGames.length}개 선택됨` 
              : '게임 선택...'}
          </span>
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        
        {isOpen && (
          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {availableGames.map(game => (
              <button
                key={game}
                onClick={() => handleSelect(game)}
                disabled={!selectedGames.includes(game) && selectedGames.length >= maxGames}
                className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-between ${
                  selectedGames.includes(game) ? 'bg-blue-50 text-blue-700' : ''
                }`}
              >
                {game}
                {selectedGames.includes(game) && (
                  <span className="text-blue-600">✓</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const InputPanel: React.FC<InputPanelProps> = ({ games, input, setInput }) => {
  const [activeSection, setActiveSection] = useState<'retention' | 'nru' | 'revenue' | null>('retention');

  return (
    <div className="space-y-6">
      {/* Basic Settings */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            <Calendar className="w-4 h-4 inline mr-1" />
            런칭 예정일
          </label>
          <input
            type="date"
            value={input.launch_date}
            onChange={(e) => setInput(prev => ({ ...prev, launch_date: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            프로젝션 기간 (일)
          </label>
          <input
            type="number"
            value={input.projection_days}
            onChange={(e) => setInput(prev => ({ ...prev, projection_days: parseInt(e.target.value) || 365 }))}
            min={30}
            max={730}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      {/* Accordion Sections */}
      <div className="space-y-4">
        {/* 1. Retention Section */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <button
            onClick={() => setActiveSection(activeSection === 'retention' ? null : 'retention')}
            className={`w-full flex items-center justify-between px-4 py-3 bg-gradient-to-r ${
              activeSection === 'retention' 
                ? 'from-emerald-50 to-emerald-100 border-b border-emerald-200' 
                : 'from-gray-50 to-gray-100 hover:from-gray-100 hover:to-gray-150'
            }`}
          >
            <div className="flex items-center gap-2">
              <TrendingUp className={`w-5 h-5 ${activeSection === 'retention' ? 'text-emerald-600' : 'text-gray-500'}`} />
              <span className="font-medium">1. Retention 설정</span>
              {input.retention.selected_games.length > 0 && (
                <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                  {input.retention.selected_games.length}개 게임 선택
                </span>
              )}
            </div>
            {activeSection === 'retention' ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
          
          {activeSection === 'retention' && (
            <div className="p-4 space-y-4">
              <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
                <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <p>표본 게임들의 Retention Curve를 기반으로 회귀분석하여 예상 Retention을 계산합니다.</p>
              </div>
              
              <GameSelector
                label="표본 게임 선택 (최대 4개)"
                availableGames={games.retention}
                selectedGames={input.retention.selected_games}
                onChange={(selected) => setInput(prev => ({
                  ...prev,
                  retention: { ...prev.retention, selected_games: selected }
                }))}
              />

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  예상 D+1 Retention 입력
                </label>
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                    <label className="block text-xs font-medium text-green-700 mb-1">Best</label>
                    <div className="flex items-center">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="1"
                        value={input.retention.target_d1_retention.best}
                        onChange={(e) => setInput(prev => ({
                          ...prev,
                          retention: {
                            ...prev.retention,
                            target_d1_retention: {
                              ...prev.retention.target_d1_retention,
                              best: parseFloat(e.target.value) || 0
                            }
                          }
                        }))}
                        className="w-full px-2 py-1 border border-green-300 rounded text-right focus:ring-2 focus:ring-green-500"
                      />
                      <span className="ml-2 text-green-600 font-medium">
                        {(input.retention.target_d1_retention.best * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <label className="block text-xs font-medium text-blue-700 mb-1">Normal</label>
                    <div className="flex items-center">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="1"
                        value={input.retention.target_d1_retention.normal}
                        onChange={(e) => setInput(prev => ({
                          ...prev,
                          retention: {
                            ...prev.retention,
                            target_d1_retention: {
                              ...prev.retention.target_d1_retention,
                              normal: parseFloat(e.target.value) || 0
                            }
                          }
                        }))}
                        className="w-full px-2 py-1 border border-blue-300 rounded text-right focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="ml-2 text-blue-600 font-medium">
                        {(input.retention.target_d1_retention.normal * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                  <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                    <label className="block text-xs font-medium text-red-700 mb-1">Worst</label>
                    <div className="flex items-center">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="1"
                        value={input.retention.target_d1_retention.worst}
                        onChange={(e) => setInput(prev => ({
                          ...prev,
                          retention: {
                            ...prev.retention,
                            target_d1_retention: {
                              ...prev.retention.target_d1_retention,
                              worst: parseFloat(e.target.value) || 0
                            }
                          }
                        }))}
                        className="w-full px-2 py-1 border border-red-300 rounded text-right focus:ring-2 focus:ring-red-500"
                      />
                      <span className="ml-2 text-red-600 font-medium">
                        {(input.retention.target_d1_retention.worst * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 2. NRU Section */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <button
            onClick={() => setActiveSection(activeSection === 'nru' ? null : 'nru')}
            className={`w-full flex items-center justify-between px-4 py-3 bg-gradient-to-r ${
              activeSection === 'nru' 
                ? 'from-blue-50 to-blue-100 border-b border-blue-200' 
                : 'from-gray-50 to-gray-100 hover:from-gray-100 hover:to-gray-150'
            }`}
          >
            <div className="flex items-center gap-2">
              <Users className={`w-5 h-5 ${activeSection === 'nru' ? 'text-blue-600' : 'text-gray-500'}`} />
              <span className="font-medium">2. NRU 설정</span>
              {input.nru.selected_games.length > 0 && (
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                  {input.nru.selected_games.length}개 게임 선택
                </span>
              )}
            </div>
            {activeSection === 'nru' ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
          
          {activeSection === 'nru' && (
            <div className="p-4 space-y-4">
              <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
                <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <p>표본 게임들의 NRU 패턴을 기반으로 일별 신규 유저 유입을 추정합니다.</p>
              </div>

              <GameSelector
                label="표본 게임 선택 (최대 4개)"
                availableGames={games.nru}
                selectedGames={input.nru.selected_games}
                onChange={(selected) => setInput(prev => ({
                  ...prev,
                  nru: { ...prev.nru, selected_games: selected }
                }))}
              />

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  첫 날 NRU (D1 NRU)
                </label>
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                    <label className="block text-xs font-medium text-green-700 mb-1">Best</label>
                    <input
                      type="number"
                      value={input.nru.d1_nru.best}
                      onChange={(e) => setInput(prev => ({
                        ...prev,
                        nru: {
                          ...prev.nru,
                          d1_nru: { ...prev.nru.d1_nru, best: parseInt(e.target.value) || 0 }
                        }
                      }))}
                      className="w-full px-2 py-1 border border-green-300 rounded text-right focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <label className="block text-xs font-medium text-blue-700 mb-1">Normal</label>
                    <input
                      type="number"
                      value={input.nru.d1_nru.normal}
                      onChange={(e) => setInput(prev => ({
                        ...prev,
                        nru: {
                          ...prev.nru,
                          d1_nru: { ...prev.nru.d1_nru, normal: parseInt(e.target.value) || 0 }
                        }
                      }))}
                      className="w-full px-2 py-1 border border-blue-300 rounded text-right focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                    <label className="block text-xs font-medium text-red-700 mb-1">Worst</label>
                    <input
                      type="number"
                      value={input.nru.d1_nru.worst}
                      onChange={(e) => setInput(prev => ({
                        ...prev,
                        nru: {
                          ...prev.nru,
                          d1_nru: { ...prev.nru.d1_nru, worst: parseInt(e.target.value) || 0 }
                        }
                      }))}
                      className="w-full px-2 py-1 border border-red-300 rounded text-right focus:ring-2 focus:ring-red-500"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Paid/Organic 비율
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="1"
                    value={input.nru.paid_organic_ratio}
                    onChange={(e) => setInput(prev => ({
                      ...prev,
                      nru: { ...prev.nru, paid_organic_ratio: parseFloat(e.target.value) || 0 }
                    }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">유료 유입 비율 (0~1)</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    NVR (전환율)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="1"
                    value={input.nru.nvr}
                    onChange={(e) => setInput(prev => ({
                      ...prev,
                      nru: { ...prev.nru, nvr: parseFloat(e.target.value) || 0 }
                    }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">설치 후 전환율</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Normal 대비 보정 수치
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                    <label className="block text-xs font-medium text-green-700 mb-1">Best (+보정)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={input.nru.adjustment.best_vs_normal}
                      onChange={(e) => setInput(prev => ({
                        ...prev,
                        nru: {
                          ...prev.nru,
                          adjustment: { ...prev.nru.adjustment, best_vs_normal: parseFloat(e.target.value) || 0 }
                        }
                      }))}
                      className="w-full px-2 py-1 border border-green-300 rounded text-right focus:ring-2 focus:ring-green-500"
                    />
                    <p className="text-xs text-green-600 mt-1">예: -0.1 = Normal보다 10% 증가</p>
                  </div>
                  <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                    <label className="block text-xs font-medium text-red-700 mb-1">Worst (-보정)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={input.nru.adjustment.worst_vs_normal}
                      onChange={(e) => setInput(prev => ({
                        ...prev,
                        nru: {
                          ...prev.nru,
                          adjustment: { ...prev.nru.adjustment, worst_vs_normal: parseFloat(e.target.value) || 0 }
                        }
                      }))}
                      className="w-full px-2 py-1 border border-red-300 rounded text-right focus:ring-2 focus:ring-red-500"
                    />
                    <p className="text-xs text-red-600 mt-1">예: 0.1 = Normal보다 10% 감소</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 3. Revenue Section */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <button
            onClick={() => setActiveSection(activeSection === 'revenue' ? null : 'revenue')}
            className={`w-full flex items-center justify-between px-4 py-3 bg-gradient-to-r ${
              activeSection === 'revenue' 
                ? 'from-amber-50 to-amber-100 border-b border-amber-200' 
                : 'from-gray-50 to-gray-100 hover:from-gray-100 hover:to-gray-150'
            }`}
          >
            <div className="flex items-center gap-2">
              <DollarSign className={`w-5 h-5 ${activeSection === 'revenue' ? 'text-amber-600' : 'text-gray-500'}`} />
              <span className="font-medium">3. Revenue 설정</span>
              {(input.revenue.selected_games_pr.length > 0 || input.revenue.selected_games_arppu.length > 0) && (
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                  PR: {input.revenue.selected_games_pr.length}, ARPPU: {input.revenue.selected_games_arppu.length}
                </span>
              )}
            </div>
            {activeSection === 'revenue' ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
          
          {activeSection === 'revenue' && (
            <div className="p-4 space-y-4">
              <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg text-sm text-amber-700">
                <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <p>P.Rate와 ARPPU를 기반으로 일별 매출을 추정합니다. Revenue = DAU × P.Rate × ARPPU</p>
              </div>

              <div className="grid grid-cols-2 gap-6">
                {/* P.Rate */}
                <div className="space-y-3">
                  <h4 className="font-medium text-gray-700">P.Rate (결제율)</h4>
                  <GameSelector
                    label="표본 게임 선택"
                    availableGames={games.payment_rate}
                    selectedGames={input.revenue.selected_games_pr}
                    onChange={(selected) => setInput(prev => ({
                      ...prev,
                      revenue: { ...prev.revenue, selected_games_pr: selected }
                    }))}
                  />
                  <div>
                    <label className="block text-sm text-gray-600 mb-2">Normal 대비 보정</label>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-2 bg-green-50 rounded border border-green-200">
                        <label className="block text-xs text-green-700">Best</label>
                        <input
                          type="number"
                          step="0.01"
                          value={input.revenue.pr_adjustment.best_vs_normal}
                          onChange={(e) => setInput(prev => ({
                            ...prev,
                            revenue: {
                              ...prev.revenue,
                              pr_adjustment: { ...prev.revenue.pr_adjustment, best_vs_normal: parseFloat(e.target.value) || 0 }
                            }
                          }))}
                          className="w-full px-2 py-1 border border-green-300 rounded text-right text-sm"
                        />
                      </div>
                      <div className="p-2 bg-red-50 rounded border border-red-200">
                        <label className="block text-xs text-red-700">Worst</label>
                        <input
                          type="number"
                          step="0.01"
                          value={input.revenue.pr_adjustment.worst_vs_normal}
                          onChange={(e) => setInput(prev => ({
                            ...prev,
                            revenue: {
                              ...prev.revenue,
                              pr_adjustment: { ...prev.revenue.pr_adjustment, worst_vs_normal: parseFloat(e.target.value) || 0 }
                            }
                          }))}
                          className="w-full px-2 py-1 border border-red-300 rounded text-right text-sm"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* ARPPU */}
                <div className="space-y-3">
                  <h4 className="font-medium text-gray-700">ARPPU</h4>
                  <GameSelector
                    label="표본 게임 선택"
                    availableGames={games.arppu}
                    selectedGames={input.revenue.selected_games_arppu}
                    onChange={(selected) => setInput(prev => ({
                      ...prev,
                      revenue: { ...prev.revenue, selected_games_arppu: selected }
                    }))}
                  />
                  <div>
                    <label className="block text-sm text-gray-600 mb-2">Normal 대비 보정</label>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-2 bg-green-50 rounded border border-green-200">
                        <label className="block text-xs text-green-700">Best</label>
                        <input
                          type="number"
                          step="0.01"
                          value={input.revenue.arppu_adjustment.best_vs_normal}
                          onChange={(e) => setInput(prev => ({
                            ...prev,
                            revenue: {
                              ...prev.revenue,
                              arppu_adjustment: { ...prev.revenue.arppu_adjustment, best_vs_normal: parseFloat(e.target.value) || 0 }
                            }
                          }))}
                          className="w-full px-2 py-1 border border-green-300 rounded text-right text-sm"
                        />
                      </div>
                      <div className="p-2 bg-red-50 rounded border border-red-200">
                        <label className="block text-xs text-red-700">Worst</label>
                        <input
                          type="number"
                          step="0.01"
                          value={input.revenue.arppu_adjustment.worst_vs_normal}
                          onChange={(e) => setInput(prev => ({
                            ...prev,
                            revenue: {
                              ...prev.revenue,
                              arppu_adjustment: { ...prev.revenue.arppu_adjustment, worst_vs_normal: parseFloat(e.target.value) || 0 }
                            }
                          }))}
                          className="w-full px-2 py-1 border border-red-300 rounded text-right text-sm"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default InputPanel;
