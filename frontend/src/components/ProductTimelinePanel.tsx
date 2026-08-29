// V14.0.2: Product 3Y Timeline — 단일 Wave와 동일한 레이어형 UI + 가이드
// #2 레이어 입력 / #3 가이드 / #4 지역 2모드 / #7 V14토글 제거 / #8 Hurdle 숨김(백엔드 유지)
import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const BM_OPTIONS = [
  { v: 'F2P Cosmetic + Battle Pass', hint: '꾸미기+시즌패스 (PUBG형) · 내부실측 보정 ×0.85' },
  { v: 'F2P Gacha', hint: '확률형 뽑기 (수집RPG형) · ×1.20' },
  { v: 'F2P Consumable', hint: '소모성 아이템 · ×1.20' },
  { v: 'B2P Package', hint: '패키지 판매 · 중립' },
  { v: 'Hybrid F2P + DLC', hint: 'F2P+유료 DLC · 중립' },
  { v: 'Subscription', hint: '구독형 · 중립' },
];
const REF_MODES = [
  { id: 'auto', label: 'Auto Benchmark', desc: '내부 35종 장르 분포 P50 자동 (표본 선택 없이 빠르게)' },
  { id: 'manual', label: 'Manual Samples', desc: '선택한 유사 게임 표본만 사용 (가장 통제된 가정)' },
  { id: 'hybrid', label: 'Hybrid Blend', desc: '표본 70% + 내부 분포 30% (표본이 적을 때 권장)' },
];
const CUSTOM_REGIONS = ['KR', 'JP', 'CN', 'SEA', 'NA', 'SA', 'EU'];
const REGION_LABEL: Record<string, string> = { KR: '한국', JP: '일본', CN: '중국', SEA: '동남아', NA: '북미', SA: '남미', EU: '유럽' };

const fmt억 = (v: number) => `${(v / 1e8).toFixed(0)}억`;
const fmtK = (v: number) => v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : `${(v / 1e3).toFixed(0)}K`;

const Guide = ({ children }: { children: any }) => (
  <details className="bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-800">
    <summary className="px-3 py-2 cursor-pointer select-none font-medium">💡 가이드 · 자세히 보기</summary>
    <div className="px-3 pb-3 leading-relaxed">{children}</div>
  </details>
);

const TERMS: [string, string][] = [
  ['Launch 36M', '출시 후 36개월. Y1 출시 전개기 포함 — "정상 운영 3개년"이 아님'],
  ['Launch 48M', '출시 전개기(Ramp) + 정상 운영 3개년(FCY 3Y). C레벨 사업성 판단용'],
  ['Ramp (출시 전개기)', 'PC→Mobile→Console이 순차 진입하는 첫 12개월'],
  ['FCY (정상 운영연도)', '전 플랫폼 진입 완료 후의 운영 연도'],
  ['Gross', '유저 결제 총액 (Bookings)'],
  ['Platform Net', 'Gross × 0.70 — 스토어 수수료(30%)만 차감'],
  ['Operating Net', 'Gross × 0.57 — 수수료+VAT+인프라 차감 (P&L 기준)'],
  ['Hurdle Coverage', '참고선(경영 기대치) 대비 도달률 — Projection 계산에는 영향 없음'],
  ['D1 Gate', '투자 지속 조건 D1 40%. Worst 시나리오 = Gate 하단'],
  ['Reservoir / Activation', '사전등록 풀 × 유입 전환율(기본 40%, NEW STATE 근거 가정)'],
  ['Organic share', '전체 유입 중 오가닉 비중 (기본 36.4% = PC BR prior)'],
  ['Overlap', '같은 계정이 하루에 복수 플랫폼 플레이하는 비율 — Unique DAU 중복 제거 전용'],
  ['Tail extrapolation', 'D365 이후 미검증 외삽 구간 — LiveOps 실측 확보 전 신뢰도 주의'],
  ['Confidence Badge', '근거 등급(provenance) 표시 — 확률/신뢰도 점수가 아님'],
  ['Projection Bridge', 'baseline→최종까지 단계별 재실행 Δ — "왜 이 숫자인지"의 답'],
];

const PRESETS: Record<string, { desc: string; d1: number; act: number; org: number }> = {
  'GW Planning Case': { desc: 'D1 50% · activation 40% · organic 36.4%', d1: 50, act: 40, org: 36.4 },
  'GW Conservative': { desc: 'D1 40% · activation 30% · organic 30%', d1: 40, act: 30, org: 30 },
  'GW Aggressive': { desc: 'D1 60% · activation 50% · organic 40%', d1: 60, act: 50, org: 40 },
};
const Layer = ({ no, title, children }: { no: string; title: string; children: any }) => (
  <div className="border border-gray-200 rounded-xl overflow-hidden">
    <div className="bg-gradient-to-r from-indigo-50 to-white px-4 py-2.5 border-b border-gray-100">
      <h3 className="font-semibold text-gray-800 text-sm">
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-600 text-white text-xs mr-2">{no}</span>
        {title}
      </h3>
    </div>
    <div className="p-4 space-y-3">{children}</div>
  </div>
);

export default function ProductTimelinePanel({ games, seed }: { games: any; seed?: any }) {
  const [waves, setWaves] = useState([
    { wave_id: 'pc_launch', platform: 'PC', offset_months: 0, ua_budget: 120, brand_budget: 80, target_cpa: 7500, prereg_users: 250, activation: 40 },
    { wave_id: 'mobile_global', platform: 'Mobile', offset_months: 6, ua_budget: 150, brand_budget: 100, target_cpa: 4000, prereg_users: 200, activation: 40 },
    { wave_id: 'console_global', platform: 'Console', offset_months: 12, ua_budget: 30, brand_budget: 20, target_cpa: 9000, prereg_users: 50, activation: 40 },
  ]);
  const [anchor, setAnchor] = useState('2029-03-01');
  const [horizon, setHorizon] = useState(4);
  const [genre, setGenre] = useState('Battle Royale');
  const [bmUi, setBmUi] = useState(BM_OPTIONS[0].v);
  const [refMode, setRefMode] = useState('auto');
  const [samples, setSamples] = useState<string[]>([]);
  const [targetD1, setTargetD1] = useState(50);
  const [regionMode, setRegionMode] = useState<'global_ex_cn' | 'custom'>('global_ex_cn');
  const [customRegions, setCustomRegions] = useState<string[]>(['KR', 'SEA']);
  const [mode, setMode] = useState({ ex_only: { initial: 10, target: 15 }, both: { initial: 8, target: 25 } });
  const [overlap, setOverlap] = useState({ Mobile: { initial: 2, target: 12 }, Console: { initial: 5, target: 18 } });
  const [organicShare, setOrganicShare] = useState(36.4);
  const [costs, setCosts] = useState({ dev: 1000, hr: 300 });
  const [running, setRunning] = useState(false);
  const [res, setRes] = useState<any>(null);
  const [official, setOfficial] = useState<any>(null);
  const [err, setErr] = useState('');
  const [showTerms, setShowTerms] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [health, setHealth] = useState<any>(null);
  const appliedSeed = useRef<any>(null);
  useEffect(() => {
    if (!seed || appliedSeed.current === seed.__seedId) return;
    appliedSeed.current = seed.__seedId;
    if (seed.launch_date) setAnchor(seed.launch_date);
    const bmMap: Record<string, string> = { F2P_Cosmetic: 'F2P Cosmetic + Battle Pass', Gacha: 'F2P Gacha', Casual: 'F2P Consumable', Hardcore: 'B2P Package' };
    if (seed.bm_type && bmMap[seed.bm_type]) setBmUi(bmMap[seed.bm_type]);
    const d1 = seed?.retention?.target_d1_retention?.normal ?? seed?.target_d1;
    if (d1) setTargetD1(Math.round(d1 * 100));
    const ua = seed?.nru?.ua_budget ?? seed?.ua_budget;
    const cpa = seed?.nru?.target_cpa ?? seed?.target_cpa;
    setWaves(ws => ws.map((w, i) => i === 0 ? { ...w, ua_budget: ua ? Math.round(ua / 1e8) : w.ua_budget, target_cpa: cpa || w.target_cpa } : w));
  }, [seed]);
  useEffect(() => { axios.get(`${API_URL}/health`).then(r => setHealth(r.data)).catch(() => setHealth({ status: 'unreachable' })); }, []);
  const applyPreset = (name: string) => {
    const pr = PRESETS[name]; if (!pr) return;
    setTargetD1(pr.d1); setOrganicShare(pr.org);
    setWaves(ws => ws.map(w => ({ ...w, activation: pr.act })));
  };

  const gameList: string[] = games?.retention_games || games?.games?.retention || [];

  const buildPayload = () => ({
    product_name: 'Product 3Y', anchor_launch_date: anchor, horizon_years: horizon,
    genre, bm_ui: bmUi, reference_mode: refMode,
    manual_samples: refMode === 'auto' ? {} : { retention: samples, nru: samples.slice(0, 2), pr: samples.slice(0, 2), arppu: samples.slice(0, 2) },
    quality_score: 'B', target_d1: targetD1 / 100,
    organic_share_of_total: organicShare / 100,
    region_scope: regionMode === 'custom' ? { mode: 'custom', regions: customRegions } : { mode: 'global_ex_cn' },
    costs: { dev_cost_total_krw: costs.dev * 1e8, annual_hr_cost_krw: costs.hr * 1e8 },
    // Hurdle: UI 미노출(피드백20 #8) but Excel Coverage용 기본값 전송 — Reference only, 계산 무영향
    strategic_hurdle: { fcy1: 1500e8, fcy2: 1000e8, fcy3: 700e8, fcy_start_year_index: horizon === 4 ? 1 : 0 },
    enable_bridge: true,
    waves: waves.map(w => ({
      wave_id: w.wave_id, platform: w.platform, offset_months: w.offset_months,
      ua_budget: w.ua_budget * 1e8, brand_budget: w.brand_budget * 1e8, target_cpa: w.target_cpa,
      d1_nru_normal: 0, prereg_users: w.prereg_users * 10000, prereg_activation_rate: w.activation / 100,
      identity_policy: w.platform === 'PC' ? undefined : {
        adoption: { initial: 0.05, target: w.platform === 'Console' ? 0.30 : 0.25, ramp_days: 180, source: 'scenario_prior' },
        same_day_overlap: {
          initial: ((overlap as any)[w.platform]?.initial || 2) / 100,
          target: ((overlap as any)[w.platform]?.target || 12) / 100,
          ramp_days: 90, source: 'scenario_prior',
        },
      },
    })),
    mode: {
      ex_only: { initial: mode.ex_only.initial / 100, target: mode.ex_only.target / 100, ramp_days: 180 },
      both: { initial: mode.both.initial / 100, target: mode.both.target / 100, ramp_days: 180 },
    },
    synergy: { retention_lift: 1.0, monetization_lift: 1.0 },
  });

  const run = async () => {
    setRunning(true); setErr(''); setOfficial(null);
    try {
      const pay = buildPayload();
      const r = await axios.post(`${API_URL}/projection/product-3y`, pay, { timeout: 300000 });
      setRes(r.data);
      axios.post(`${API_URL}/projection/product-3y/official-scenarios`, pay, { timeout: 600000 })
        .then(o => setOfficial(o.data))
        .catch(() => { /* 비차단 — Worst/Best 표만 생략 */ });
    } catch (e: any) {
      const detail = e?.response?.data?.detail || String(e);
      setErr(`${detail} — 결과가 계속 안 나오면 /api/health 로 백엔드 모듈 배포 상태를 확인하세요 (backend 폴더 전체 배포 필요)`);
    }
    setRunning(false);
  };

  const downloadExcel = async () => {
    const r = await axios.post(`${API_URL}/projection/product-3y/excel`, buildPayload(), { responseType: 'blob', timeout: 600000 });
    const url = URL.createObjectURL(new Blob([r.data]));
    const a = document.createElement('a'); a.href = url; a.download = 'product_3y_projection.xlsx'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">🌊 Launch Projection (순차출시 · 장기 사업성)</h2>
            <p className="text-xs text-gray-500 mt-1">복수 플랫폼 순차 출시, Reservoir, Organic, Bridge, 장기 사업성 검토용 모드 — GW Planning Case는 이 모드를 사용합니다.</p>
          </div>
          <button onClick={() => setShowTerms(true)} className="text-xs px-3 py-1.5 border rounded-lg text-gray-600 hover:bg-gray-50 shrink-0">📘 용어 가이드</button>
        </div>

        {/* Executive Intro */}
        <div className="bg-gradient-to-r from-slate-50 to-indigo-50 border border-indigo-100 rounded-xl p-4 text-xs text-gray-700 leading-relaxed">
          <p className="font-semibold text-sm text-gray-800 mb-1">GW Conditional Projection Tool</p>
          <p>이 툴은 <b>Product Gate 통과를 조건</b>으로, PC → Mobile → Console 순차 출시 기준의 트래픽·매출·BEP를 산출합니다.</p>
          <p className="mt-1">기본 출력: <b>Launch 36M</b>(출시 후 36개월) 또는 <b>Launch 48M</b>(출시 전개기 + 정상 운영 3개년) · <b>Worst/Normal/Best</b> = D1 {targetD1 - 10}/{targetD1}/{targetD1 + 10}% 조건부 시나리오</p>
          <p className="mt-1 text-amber-700">⚠ 이 결과는 Sales Commitment가 아니라 사업 가정 기반 Projection입니다.</p>
        </div>

        {/* Preset */}
        <div className="flex flex-wrap gap-2 items-center text-xs">
          <span className="text-gray-500 font-medium">Preset:</span>
          {Object.entries(PRESETS).map(([n, pr]) => (
            <button key={n} onClick={() => applyPreset(n)} title={pr.desc}
              className="px-3 py-1.5 border rounded-lg hover:bg-indigo-50 text-gray-700">{n}</button>))}
          <span className="text-gray-400">· 프리셋은 D1/전환율/Organic만 변경 (같은 가정으로 대화하기 위한 기준점)</span>
        </div>

        <Layer no="1" title="기본 설정 — 출시 시점 · 장르 · BM">
          <Guide>
            <b>앵커 출시일</b>은 첫 플랫폼(PC) 기준입니다. Horizon을 <b>4년</b>으로 두면 M1~12는 전개기(Ramp),
            M13~24부터가 <b>전 플랫폼 가동 후 첫해(FCY1)</b>로 집계됩니다. BM 타입에는 내부 실측 기반 보정이 적용됩니다
            (예: Cosmetic+Pass는 가챠 대비 과금효율이 낮게 실측 → ×0.85).
          </Guide>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <label className="block">앵커 출시일 (PC)
              <input type="date" value={anchor} onChange={e => setAnchor(e.target.value)} className="mt-1 w-full border rounded px-2 py-1.5" />
            </label>
            <label className="block">Projection Horizon
              <select value={horizon} onChange={e => setHorizon(+e.target.value)} className="mt-1 w-full border rounded px-2 py-1.5">
                <option value={3}>Launch 36M (출시 후 36개월)</option><option value={4}>Launch 48M (출시 전개기 + FCY 3Y)</option>
              </select>
            </label>
            <label className="block">장르
              <select value={genre} onChange={e => setGenre(e.target.value)} className="mt-1 w-full border rounded px-2 py-1.5">
                {['Battle Royale', 'Extraction Shooter', 'MMORPG', 'Simulation'].map(g => <option key={g}>{g}</option>)}
              </select>
            </label>
            <label className="block">BM 타입
              <select value={bmUi} onChange={e => setBmUi(e.target.value)} className="mt-1 w-full border rounded px-2 py-1.5">
                {BM_OPTIONS.map(b => <option key={b.v} value={b.v}>{b.v}</option>)}
              </select>
              <p className="text-[10px] text-gray-400 mt-0.5">{BM_OPTIONS.find(b => b.v === bmUi)?.hint}</p>
            </label>
          </div>
        </Layer>

        <Layer no="2" title="플랫폼 출시 스케줄 — Wave별 마케팅 · 사전등록">
          <Guide>
            각 Wave는 <b>독립된 런칭</b>입니다 (자체 UA/브랜드 예산, CPA, 사전등록).
            <b> 사전등록 → 유입 전환율</b>의 기본값 40%는 NEW STATE 런칭 스케일 실측(사전예약 5,500만 → 첫달 다운로드 50%)을
            참고한 가정치입니다. Brand 예산은 오가닉 유입을 증폭시킵니다 (brand/UA 비율 기반, 수확체감).
          </Guide>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 text-left text-xs">
                <th className="p-2">Wave</th><th>출시</th><th>UA예산(억)</th><th>Brand(억)</th><th>CPA(₩)</th><th>사전등록(만)</th><th>전환율(%)</th></tr></thead>
              <tbody>{waves.map((w, i) => (
                <tr key={w.wave_id} className="border-b">
                  <td className="p-2 text-xs font-medium">{w.platform}{i === 0 && <span className="ml-1 text-blue-500">(Anchor)</span>}</td>
                  <td><input type="number" value={w.offset_months} min={0} max={36} disabled={i === 0}
                    onChange={e => setWaves(ws => ws.map((x, j) => j === i ? { ...x, offset_months: +e.target.value } : x))}
                    className="w-14 border rounded px-1 py-0.5" /><span className="text-[10px] text-gray-400"> M+</span></td>
                  {(['ua_budget', 'brand_budget', 'target_cpa', 'prereg_users', 'activation'] as const).map(f => (
                    <td key={f}><input type="number" value={(w as any)[f]}
                      onChange={e => setWaves(ws => ws.map((x, j) => j === i ? { ...x, [f]: +e.target.value } : x))}
                      className="w-16 border rounded px-1 py-0.5" /></td>))}
                </tr>))}</tbody>
            </table>
          </div>
        </Layer>

        <Layer no="3" title="Retention — 참조 소스 · 목표 D1">
          <Guide>
            <b>Normal D1 기준값은 50%</b> (내부 투자 Gate 40%를 상회하는 정상 성공 시나리오)이며,
            Best/Worst는 자동으로 <b>+10%p / −10%p (60% / 40%)</b>로 계산됩니다.
            Worst 40%는 투자 지속 Gate와 동일 — 즉 <b>Worst조차 Gate 통과를 전제</b>하는 조건부 프로젝션입니다.
            D1 50%는 외부 peer 기준 상위권(p98)이므로 결과 보고 시 이 조건을 반드시 함께 명시하세요.
          </Guide>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              {REF_MODES.map(m => (
                <label key={m.id} className="flex items-start gap-2 text-sm mb-1.5">
                  <input type="radio" checked={refMode === m.id} onChange={() => setRefMode(m.id)} className="mt-1" />
                  <span><b>{m.label}</b><br /><span className="text-xs text-gray-500">{m.desc}</span></span>
                </label>))}
              {refMode !== 'auto' && (
                <select multiple value={samples} onChange={e => setSamples(Array.from(e.target.selectedOptions).map(o => o.value))}
                  className="mt-1 w-full border rounded p-1 text-xs h-24">
                  {gameList.map((g: string) => <option key={g} value={g}>{g}</option>)}
                </select>)}
            </div>
            <div className="text-sm space-y-2">
              <label className="block">목표 D1 리텐션 — Normal (%)
                <input type="number" value={targetD1} min={10} max={80} onChange={e => setTargetD1(+e.target.value)} className="mt-1 w-24 border rounded px-2 py-1" />
              </label>
              <div className="flex gap-2 text-xs">
                <span className="px-2 py-1 bg-red-50 text-red-700 rounded">Worst {targetD1 - 10}%</span>
                <span className="px-2 py-1 bg-indigo-100 text-indigo-800 rounded font-semibold">Normal {targetD1}%</span>
                <span className="px-2 py-1 bg-green-50 text-green-700 rounded">Best {targetD1 + 10}%</span>
              </div>
              <label className="block">Organic 비중 (전체 유입 중 %, 기본 36.4 = PC BR prior)
                <input type="number" value={organicShare} step={0.1} onChange={e => setOrganicShare(+e.target.value)} className="mt-1 w-24 border rounded px-2 py-1" />
              </label>
            </div>
          </div>
        </Layer>

        <Layer no="4" title="출시 지역">
          <Guide>
            <b>글로벌(중국 본토 제외)</b>은 표준 믹스(북미 30 / 유럽 20 / 한국 15 / 일본 10 / 동남아 20 / 기타 5%)를 적용합니다.
            <b> 리전 선택</b> 시 선택 지역에 균등 분배됩니다. 지역 계수는 과금(monetization)에만 적용되며,
            중국은 내부 표본이 없고 판호/로컬 퍼블리싱 구조가 특수해 proxy 계수 + 경고가 표시됩니다.
          </Guide>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="radio" checked={regionMode === 'global_ex_cn'} onChange={() => setRegionMode('global_ex_cn')} />
              <b>글로벌 (중국 본토 제외)</b>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="radio" checked={regionMode === 'custom'} onChange={() => setRegionMode('custom')} />
              <b>리전 선택</b>
            </label>
          </div>
          <div className={`flex flex-wrap gap-2 transition-opacity ${regionMode !== 'custom' ? 'opacity-30 pointer-events-none' : ''}`}>
            {CUSTOM_REGIONS.map(r => (
              <label key={r} className={`px-3 py-1.5 rounded-lg border text-sm cursor-pointer ${customRegions.includes(r) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600'}`}>
                <input type="checkbox" className="hidden" checked={customRegions.includes(r)}
                  onChange={() => setCustomRegions(cs => cs.includes(r) ? cs.filter(x => x !== r) : [...cs, r])} />
                {REGION_LABEL[r]}
              </label>))}
          </div>
          <div className={`text-xs text-gray-400 transition-opacity ${regionMode === 'custom' ? 'opacity-30' : ''}`}>
            표준 믹스: 북미 30% · 유럽 20% · 한국 15% · 일본 10% · 동남아 20% · 기타 5%
          </div>
        </Layer>

        <Layer no="5" title="멀티모드 · 크로스 프로그레션">
          <Guide>
            <b>모드 분해</b>: BR+EX 동시 탑재 기준. EX Only / Both 비중은 런칭 초기값에서 D180 목표치로 램프됩니다
            (BR Only = 나머지, 항등식 자동검증). 모드 분해는 <b>Unique DAU 총량을 바꾸지 않으며</b>,
            "EX 덕분에 리텐션이 좋아진다"는 시너지는 CBT 검증 전까지 1.00 고정입니다.
            <b> Same-day Overlap</b>은 같은 계정이 하루에 복수 플랫폼을 플레이하는 비율로, Unique DAU 중복 제거에만 쓰입니다
            (매출은 플랫폼 귀속 합산 — 차감 없음).
          </Guide>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div className="space-y-1">
              <p className="font-medium text-gray-600 text-xs">모드 비중 (초기 → D180 목표)</p>
              <div>EX Only <input type="number" value={mode.ex_only.initial} onChange={e => setMode(m => ({ ...m, ex_only: { ...m.ex_only, initial: +e.target.value } }))} className="w-12 border rounded px-1" />% → <input type="number" value={mode.ex_only.target} onChange={e => setMode(m => ({ ...m, ex_only: { ...m.ex_only, target: +e.target.value } }))} className="w-12 border rounded px-1" />%</div>
              <div>Both <input type="number" value={mode.both.initial} onChange={e => setMode(m => ({ ...m, both: { ...m.both, initial: +e.target.value } }))} className="w-12 border rounded px-1" />% → <input type="number" value={mode.both.target} onChange={e => setMode(m => ({ ...m, both: { ...m.both, target: +e.target.value } }))} className="w-12 border rounded px-1" />%</div>
            </div>
            <div className="space-y-1">
              <p className="font-medium text-gray-600 text-xs">Same-day Overlap (초기 → 목표, 90일 램프)</p>
              {(['Mobile', 'Console'] as const).map(p => (
                <div key={p}>PC↔{p} <input type="number" value={(overlap as any)[p].initial} onChange={e => setOverlap(o => ({ ...o, [p]: { ...(o as any)[p], initial: +e.target.value } }))} className="w-12 border rounded px-1" />% → <input type="number" value={(overlap as any)[p].target} onChange={e => setOverlap(o => ({ ...o, [p]: { ...(o as any)[p], target: +e.target.value } }))} className="w-12 border rounded px-1" />%</div>))}
            </div>
          </div>
        </Layer>

        <Layer no="6" title="비용 (P&L · BEP 계산용)">
          <Guide>
            개발비·인건비는 <b>매출/트래픽 지표에 영향이 없고</b> P&L Waterfall과 BEP 계산에만 쓰입니다.
            서스테인 마케팅은 launch UA 예산의 연 10%가 기본 적용됩니다 (매출 % 방식은 순환구조라 지원하지 않음).
          </Guide>
          <div className="flex gap-6 text-sm">
            <label>개발비 누적 <input type="number" value={costs.dev} onChange={e => setCosts(c => ({ ...c, dev: +e.target.value }))} className="w-24 border rounded px-2 py-1 mx-1" /> 억</label>
            <label>연 인건비 <input type="number" value={costs.hr} onChange={e => setCosts(c => ({ ...c, hr: +e.target.value }))} className="w-24 border rounded px-2 py-1 mx-1" /> 억</label>
          </div>
        </Layer>

        <div className="flex gap-3 items-center pt-1">
          <button onClick={run} disabled={running} className="px-8 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-semibold shadow-sm">
            {running ? '⏳ 계산 중...' : '▶ Launch Projection 실행'}
          </button>
          {res && <button onClick={async () => {
            const r = await axios.post(`${API_URL}/projection/product-3y/export/pdf`, buildPayload(), { responseType: 'blob', timeout: 600000 });
            const url = URL.createObjectURL(new Blob([r.data], { type: 'application/pdf' }));
            const a = document.createElement('a'); a.href = url; a.download = 'GW_Launch_Projection.pdf'; a.click(); URL.revokeObjectURL(url);
          }} className="px-4 py-3 bg-rose-600 text-white rounded-lg hover:bg-rose-700">📄 1-page PDF<span className="block text-[9px] opacity-80">C레벨 보고용 요약</span></button>}
          {res && <button onClick={downloadExcel} className="px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700">📥 Report-ready Excel<span className="block text-[9px] opacity-80">Exec·Bridge·Badge·Hurdle·Risk Plan 포함 (15시트)</span></button>}
        </div>
        {err && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">❌ {err}</p>}
      </div>

      {res && (
        <div className="space-y-5">
          {/* ═══ 1단: Executive View ═══ */}
          <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-wide"><span className="h-px flex-1 bg-gray-200" />Executive View — 결론<span className="h-px flex-1 bg-gray-200" /></div>

          <div onClick={() => setDrawer(true)} title="클릭하여 Planning Case 상세 보기"
            className="bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl p-5 cursor-pointer hover:shadow-lg transition-shadow">
            <p className="text-sm opacity-80">{res.horizon_labels?.title ? `GW ${res.horizon_labels.title} — Conditional` : res.conditional_notice?.headline}</p>
            {official ? (
              <p className="text-3xl font-bold mt-1">{fmt억(official.headline.range_krw[0])} ~ {fmt억(official.headline.range_krw[1])}
                <span className="text-lg font-medium ml-3 opacity-90">Planning Case {fmt억(official.headline.planning_case_krw)}</span></p>
            ) : (
              <p className="text-3xl font-bold mt-1">{fmt억(res.total.gross_krw)} <span className="text-sm font-normal opacity-70">(Normal · Worst/Best 계산 중…)</span></p>
            )}
            <p className="text-xs mt-2 opacity-80">⚠ {res.conditional_notice?.disclaimer} · <u>카드를 클릭하면 상세가 열립니다</u></p>
          </div>

          {/* Key Interpretation + Hurdle Coverage */}
          <div className="grid md:grid-cols-2 gap-4">
            {res.key_interpretation && (
              <div className="bg-white rounded-xl border p-4">
                <h4 className="font-semibold text-sm mb-2">🔑 Key Interpretation</h4>
                <ul className="text-xs text-gray-700 space-y-1.5">
                  {res.key_interpretation.map((k: string, i: number) => <li key={i} className="flex gap-1.5"><span className="text-indigo-500">▸</span>{k}</li>)}
                </ul>
              </div>
            )}
            {res.strategic_hurdle_coverage?.rows?.length > 0 && (
              <div className="bg-white rounded-xl border p-4">
                <h4 className="font-semibold text-sm mb-1">📏 Strategic Hurdle Coverage</h4>
                <p className="text-[10px] text-gray-400 mb-2">{res.strategic_hurdle_coverage.disclaimer}</p>
                <div className="space-y-2">
                  {res.strategic_hurdle_coverage.rows.map((r2: any) => (
                    <div key={r2.period} className="text-xs">
                      <div className="flex justify-between mb-0.5"><span>{r2.period}: {fmt억(r2.projection_krw)} / {fmt억(r2.hurdle_krw)}</span>
                        <b className={r2.coverage_pct >= 100 ? 'text-green-600' : r2.coverage_pct >= 70 ? 'text-amber-600' : 'text-red-600'}>{r2.coverage_pct}%</b></div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full ${r2.coverage_pct >= 100 ? 'bg-green-500' : r2.coverage_pct >= 70 ? 'bg-amber-400' : 'bg-red-400'}`} style={{ width: `${Math.min(100, r2.coverage_pct)}%` }} />
                      </div>
                    </div>))}
                </div>
              </div>
            )}
          </div>

          {/* ═══ 2단: Driver View ═══ */}
          <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-wide pt-2"><span className="h-px flex-1 bg-gray-200" />Driver View — 왜 이 숫자인지<span className="h-px flex-1 bg-gray-200" /></div>

          {official && (
            <div className="bg-white rounded-xl border p-4">
              <h4 className="font-semibold text-sm mb-2">🎯 시나리오 3본 (D1 {targetD1 - 10}/{targetD1}/{targetD1 + 10}% — 타 변수 고정)</h4>
              <table className="w-full text-sm">
                <thead><tr className="bg-gray-50"><th className="p-2 text-left">Scenario</th><th>D1</th>{official.scenarios.normal.annual.slice(0, 4).map((a: any) => <th key={a.year}>{a.year}</th>)}<th>Total</th></tr></thead>
                <tbody>{(['worst', 'normal', 'best'] as const).map((n, ix) => { const s = official.scenarios[n]; return (
                  <tr key={n} className={`border-b text-center ${n === 'normal' ? 'bg-indigo-50 font-semibold' : ''}`}>
                    <td className="p-2 text-left capitalize">{n}</td><td>{[targetD1 - 10, targetD1, targetD1 + 10][ix]}%</td>
                    {s.annual.slice(0, 4).map((a: any) => <td key={a.year}>{fmt억(a.gross_revenue_krw)}</td>)}
                    <td className="font-semibold">{fmt억(s.total.gross_krw)}</td>
                  </tr>); })}</tbody>
              </table>
            </div>
          )}

          <div className="bg-white rounded-xl border p-4">
            <h4 className="font-semibold text-sm mb-2">📅 연도별 요약 (Normal · launch-relative{horizon === 4 ? ' · Y1=Ramp, Y2~=FCY' : ''})</h4>
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-100"><th className="p-2 text-left">KPI</th>{res.annual_summary.map((a: any) => <th key={a.year}>{a.year}</th>)}</tr></thead>
              <tbody>
                {[['Gross Revenue', (a: any) => fmt억(a.gross_revenue_krw)],
                  ['Avg Unique DAU', (a: any) => fmtK(a.avg_unique_dau)],
                  ['Peak Unique DAU', (a: any) => fmtK(a.peak_unique_dau)],
                  ['Unique NRU', (a: any) => fmtK(a.unique_nru)],
                  ['Tail Share (검증범위 밖 매출)', (a: any) => `${(a.tail_share_revenue * 100).toFixed(0)}%`]]
                  .map(([label, fn]: any) => (
                    <tr key={label} className="border-b"><td className="p-2">{label}</td>
                      {res.annual_summary.map((a: any) => <td key={a.year} className="text-center">{fn(a)}</td>)}</tr>))}
              </tbody>
            </table>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border p-4">
              <h4 className="font-semibold text-sm mb-2">① Unique Account DAU</h4>
              <ResponsiveContainer width="100%" height={210}>
                <LineChart data={res.monthly}><CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} /><YAxis tickFormatter={fmtK} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: any) => fmtK(v)} /><Line type="monotone" dataKey="unique_dau" stroke="#4f46e5" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <h4 className="font-semibold text-sm mb-2">② Platform DAU vs Unique <span className="text-[10px] text-gray-400">간격 = 계정 중복 차감</span></h4>
              <ResponsiveContainer width="100%" height={210}>
                <LineChart data={res.monthly}><CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} /><YAxis tickFormatter={fmtK} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: any) => fmtK(v)} /><Legend />
                  {['PC', 'Mobile', 'Console'].map((p, i) => res.monthly[0]?.[`dau_${p}`] !== undefined &&
                    <Line key={p} type="monotone" dataKey={`dau_${p}`} stroke={['#0ea5e9', '#f59e0b', '#10b981'][i]} dot={false} />)}
                  <Line type="monotone" dataKey="unique_dau" stroke="#4f46e5" dot={false} strokeWidth={2} name="Unique" />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <h4 className="font-semibold text-sm mb-2">③ 월별 Gross Revenue (플랫폼 누적)</h4>
              <ResponsiveContainer width="100%" height={210}>
                <AreaChart data={res.monthly}><CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} /><YAxis tickFormatter={(v) => fmt억(v)} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: any) => fmt억(v)} /><Legend />
                  {['PC', 'Mobile', 'Console'].map((p, i) => res.monthly[0]?.[`rev_${p}`] !== undefined &&
                    <Area key={p} stackId="1" type="monotone" dataKey={`rev_${p}`} stroke={['#0ea5e9', '#f59e0b', '#10b981'][i]} fill={['#bae6fd', '#fde68a', '#a7f3d0'][i]} />)}
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <h4 className="font-semibold text-sm mb-2">④ Mode Mix (BR / EX / Both)</h4>
              <ResponsiveContainer width="100%" height={210}>
                <AreaChart data={res.monthly}><CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} /><YAxis tickFormatter={fmtK} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: any) => fmtK(v)} /><Legend />
                  <Area stackId="m" type="monotone" dataKey="br_only" stroke="#6366f1" fill="#c7d2fe" name="BR Only" />
                  <Area stackId="m" type="monotone" dataKey="both" stroke="#a855f7" fill="#e9d5ff" name="Both" />
                  <Area stackId="m" type="monotone" dataKey="ex_only" stroke="#ec4899" fill="#fbcfe8" name="EX Only" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {res.projection_bridge && (
            <div className="bg-white rounded-xl border p-4">
              <h4 className="font-semibold text-sm mb-1">🌉 {res.projection_bridge.label} <span className="text-[10px] text-gray-400">이 숫자가 어떻게 만들어졌는지</span></h4>
              <p className="text-[10px] text-gray-400 mb-2">{res.projection_bridge.order_note}</p>
              {res.projection_bridge.rows.map((r2: any, i: number) => (
                <div key={i} className="flex justify-between text-xs border-b py-1">
                  <span>{r2.step}</span><span className="font-mono">{fmt억(r2.cumulative_gross_krw)} <span className={r2.delta_krw >= 0 ? 'text-green-600' : 'text-red-600'}>({r2.delta_krw >= 0 ? '+' : ''}{fmt억(r2.delta_krw)})</span></span>
                </div>))}
            </div>
          )}

          {res.pnl && (
            <div className="bg-white rounded-xl border p-4">
              <h4 className="font-semibold text-sm mb-2">💰 P&L Waterfall <span className="text-[10px] text-gray-400">{res.pnl.rates_note}</span></h4>
              <table className="w-full text-xs">
                <thead><tr className="bg-gray-50"><th className="p-1 text-left">Year</th><th>Gross</th><th>Net(0.57)</th><th>Marketing</th><th>Contribution</th><th>HR</th><th className="font-bold">Operating</th></tr></thead>
                <tbody>{res.pnl.waterfall.map((w: any) => (
                  <tr key={w.year} className="border-b text-center">
                    <td className="p-1 text-left font-medium">{w.year}</td><td>{fmt억(w.gross_bookings)}</td><td>{fmt억(w.net_revenue)}</td>
                    <td className="text-red-600">{fmt억(w.marketing)}</td><td>{fmt억(w.contribution_profit)}</td>
                    <td className="text-red-600">{fmt억(w.hr_cost)}</td>
                    <td className={`font-bold ${w.operating_profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmt억(w.operating_profit)}</td>
                  </tr>))}</tbody>
              </table>
            </div>
          )}

          {res.pnl && (
            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl border-2 border-emerald-300 p-5">
              <h4 className="font-bold text-emerald-900 mb-3">🏁 Break-Even Point (최종 레이어)</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white rounded-lg p-4 text-center">
                  <p className="text-xs text-gray-500">Marketing BEP</p>
                  <p className="text-2xl font-bold text-emerald-700">{res.pnl.bep.marketing_bep_month}</p>
                  <p className="text-[10px] text-gray-400">누적 Net ≥ 누적 마케팅</p>
                </div>
                <div className="bg-white rounded-lg p-4 text-center">
                  <p className="text-xs text-gray-500">Full Cost BEP</p>
                  <p className="text-2xl font-bold text-teal-700">{res.pnl.bep.full_cost_bep_month}</p>
                  <p className="text-[10px] text-gray-400">+ 인건비 누적 + 개발비</p>
                </div>
              </div>
            </div>
          )}

          {/* ═══ 3단: Audit View ═══ */}
          <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-wide pt-2"><span className="h-px flex-1 bg-gray-200" />Audit View — 검증<span className="h-px flex-1 bg-gray-200" /></div>

          {res.confidence && (
            <div className="bg-white rounded-xl border p-4">
              <h4 className="font-semibold text-sm mb-1">🏷 근거 등급 (Confidence Badge) <span className="text-[10px] text-gray-400">{res.confidence.definition}</span></h4>
              <p className="text-xs text-amber-700 mb-2">{res.confidence.summary}</p>
              <div className="flex flex-wrap gap-1 text-[11px]">
                {Object.entries(res.confidence.evidence_state).map(([k, v]: any) => (
                  <span key={k} className="px-2 py-1 bg-gray-50 border rounded" title={v.source}>{v.badge} {k}</span>))}
              </div>
            </div>
          )}

          {res.warnings?.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
              {res.warnings.map((w: string, i: number) => <p key={i} className="text-xs text-amber-700">{w}</p>)}
            </div>)}
        </div>
      )}
      {/* Health badge */}
      <div className="text-[10px] text-gray-400 text-right">
        {health?.status === 'ok' ? `Backend: OK · modules ${Object.keys(health.modules || {}).length}/6 · data ${Object.values(health.data_files || {}).filter(Boolean).length}/3`
          : health?.status === 'MODULE_MISSING' ? <span className="text-red-500">⚠ Backend warning: {Object.entries(health.modules || {}).filter(([, v]: any) => v !== 'loaded').map(([k]) => k).join(', ')} 미배포</span>
          : health?.status === 'unreachable' ? <span className="text-red-500">⚠ Backend 연결 불가 — /api/health 확인</span> : 'Backend 상태 확인 중…'}
      </div>

      {/* 용어 가이드 Drawer */}
      {showTerms && (
        <div className="fixed inset-0 bg-black/30 z-50 flex justify-end" onClick={() => setShowTerms(false)}>
          <div className="bg-white w-96 h-full overflow-y-auto p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold text-gray-800">📘 용어 가이드</h3>
              <button onClick={() => setShowTerms(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="space-y-3">
              {TERMS.map(([t, d]) => (
                <div key={t} className="border-b pb-2">
                  <p className="text-sm font-semibold text-gray-800">{t}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{d}</p>
                </div>))}
            </div>
          </div>
        </div>
      )}

      {/* Planning Case Detail Drawer */}
      {drawer && res && (
        <div className="fixed inset-0 bg-black/30 z-50 flex justify-end" onClick={() => setDrawer(false)}>
          <div className="bg-white w-[28rem] h-full overflow-y-auto p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold text-gray-800">Planning Case Detail</h3>
              <button onClick={() => setDrawer(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="space-y-4 text-sm">
              <div className="bg-indigo-50 rounded-lg p-3 space-y-1">
                <p className="text-xs text-gray-500">{res.horizon_labels?.title}</p>
                <p>Gross Revenue: <b>{fmt억(res.total.gross_krw)}</b></p>
                <p>Platform Net (×0.70): <b>{fmt억(res.total.platform_net_krw || res.total.net_krw)}</b></p>
                <p>Avg / Peak Unique DAU: <b>{fmtK(res.total.avg_unique_dau)} / {fmtK(res.total.peak_unique_dau)}</b></p>
                <p>BEP: Marketing <b>{res.pnl?.bep?.marketing_bep_month}</b> · Full Cost <b>{res.pnl?.bep?.full_cost_bep_month}</b></p>
              </div>
              {res.key_interpretation && (
                <div><p className="font-semibold text-xs text-gray-600 mb-1">Interpretation</p>
                  <ul className="text-xs text-gray-700 space-y-1">{res.key_interpretation.map((k: string, i: number) => <li key={i}>· {k}</li>)}</ul></div>)}
              {res.projection_bridge && (
                <div><p className="font-semibold text-xs text-gray-600 mb-1">Top Drivers (Ordered Bridge)</p>
                  <ul className="text-xs text-gray-700 space-y-1">
                    {res.projection_bridge.rows.filter((r2: any) => r2.delta_krw > 0).sort((a: any, b: any) => b.delta_krw - a.delta_krw).slice(0, 4)
                      .map((r2: any, i: number) => <li key={i}>{i + 1}. {r2.step} <b className="text-green-600">({fmt억(r2.delta_krw)})</b><br /><span className="text-gray-400">{r2.why}</span></li>)}
                  </ul></div>)}
              <div><p className="font-semibold text-xs text-gray-600 mb-1">연도별</p>
                <table className="w-full text-xs"><thead><tr className="bg-gray-50"><th className="p-1 text-left">Year</th><th>의미</th><th>Gross</th><th>Avg uDAU</th></tr></thead>
                  <tbody>{res.annual_summary.map((a: any) => (
                    <tr key={a.year} className="border-b text-center"><td className="p-1 text-left">{a.year}</td>
                      <td className="text-[10px] text-gray-500">{res.horizon_labels?.year_meaning?.[a.year] || ''}</td>
                      <td>{fmt억(a.gross_revenue_krw)}</td><td>{fmtK(a.avg_unique_dau)}</td></tr>))}</tbody></table></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
