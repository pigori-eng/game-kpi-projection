// V13.7: 3-Year Product Projection Panel (7-1~7-3)
// Freeze: mode≠DAU증가 / synergy=scenario / rev=attributed합산 / proxy경고 / Y3경고 / snapshot저장
import { useState } from 'react';
import axios from 'axios';
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const BM_OPTIONS = ['F2P Cosmetic + Battle Pass', 'F2P Gacha', 'F2P Consumable', 'B2P Package', 'Hybrid F2P + DLC', 'Subscription'];
const REF_MODES = [
  { id: 'auto', label: 'Auto Benchmark', desc: '내부 호환 pool P50 자동 (표본선택 비활성)' },
  { id: 'manual', label: 'Manual Samples', desc: '선택 표본만 사용 (벤치마크 미사용)' },
  { id: 'hybrid', label: 'Hybrid Blend', desc: '표본 70% + 내부분포 30%' },
];
const SYNERGY = [
  { label: 'Base', v: 1.0 }, { label: 'Hypothesis', v: 1.1 }, { label: 'Aggressive', v: 1.2 },
];
const REGIONS = ['NA', 'EU', 'KR', 'JP', 'SEA', 'OTHER'];

const fmt억 = (v: number) => `${(v / 1e8).toFixed(0)}억`;
const fmtK = (v: number) => v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : `${(v / 1e3).toFixed(0)}K`;

export default function ProductTimelinePanel({ games }: { games: any }) {
  const [waves, setWaves] = useState([
    { wave_id: 'pc_launch', platform: 'PC', offset_months: 0, ua_budget: 60, brand_budget: 40, target_cpa: 7500, d1_nru_normal: 180000 },
    { wave_id: 'mobile_global', platform: 'Mobile', offset_months: 6, ua_budget: 50, brand_budget: 30, target_cpa: 4000, d1_nru_normal: 250000 },
    { wave_id: 'console_global', platform: 'Console', offset_months: 12, ua_budget: 20, brand_budget: 10, target_cpa: 9000, d1_nru_normal: 45000 },
  ]);
  const [costs, setCosts] = useState({ dev: 0, hr: 0 });
  const [anchor, setAnchor] = useState('2029-03-01');
  const [horizon, setHorizon] = useState(3);
  const [genre, setGenre] = useState('Battle Royale');
  const [bmUi, setBmUi] = useState(BM_OPTIONS[0]);
  const [refMode, setRefMode] = useState('auto');
  const [samples, setSamples] = useState<string[]>([]);
  const [targetD1, setTargetD1] = useState(0.28);
  const [regionMix, setRegionMix] = useState<Record<string, number>>({ NA: 30, EU: 20, KR: 15, JP: 10, SEA: 20, OTHER: 5 });
  const [mode, setMode] = useState({ ex_only: { initial: 10, target: 15 }, both: { initial: 8, target: 25 } });
  const [synergyIdx, setSynergyIdx] = useState(0);
  const [overlap, setOverlap] = useState({ Mobile: { initial: 2, target: 12 }, Console: { initial: 5, target: 18 } });
  const [hurdle, setHurdle] = useState({ fcy1: 1500, fcy2: 1000, fcy3: 700 });
  const [enableBridge, setEnableBridge] = useState(true);
  const [v14t, setV14t] = useState({ v2: false, v3: false });
  const [official, setOfficial] = useState<any>(null);
  const [running, setRunning] = useState(false);
  const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState('');

  const gameList: string[] = games?.retention_games || games?.games?.retention || [];

  const buildPayload = () => ({
    product_name: 'Product 3Y', anchor_launch_date: anchor, horizon_years: horizon,
    genre, bm_ui: bmUi, reference_mode: refMode,
    manual_samples: refMode === 'auto' ? {} : { retention: samples, nru: samples.slice(0, 2), pr: samples.slice(0, 2), arppu: samples.slice(0, 2) },
    quality_score: 'B', target_d1: targetD1,
    region_mix: Object.fromEntries(Object.entries(regionMix).map(([k, v]) => [k, v / 100])),
    costs: { dev_cost_total_krw: costs.dev * 1e8, annual_hr_cost_krw: costs.hr * 1e8 },
    strategic_hurdle: { fcy1: hurdle.fcy1 * 1e8, fcy2: hurdle.fcy2 * 1e8, fcy3: hurdle.fcy3 * 1e8, fcy_start_year_index: 1 },
    enable_bridge: enableBridge, enable_v14_2: v14t.v2, enable_v14_3: v14t.v3,
    waves: waves.map(w => ({
      ...w, ua_budget: w.ua_budget * 1e8, brand_budget: (w.brand_budget || 0) * 1e8, scale_mult: 1.0,
      identity_policy: w.platform === 'PC' ? undefined : {
        adoption: { initial: 0.05, target: w.platform === 'Console' ? 0.30 : 0.25, ramp_days: 180, source: 'scenario_prior' },
        same_day_overlap: {
          initial: (overlap as any)[w.platform]?.initial / 100 || 0.02,
          target: (overlap as any)[w.platform]?.target / 100 || 0.12,
          ramp_days: 90, source: 'scenario_prior(Aniimo ref)',
        },
      },
    })),
    mode: {
      ex_only: { initial: mode.ex_only.initial / 100, target: mode.ex_only.target / 100, ramp_days: 180 },
      both: { initial: mode.both.initial / 100, target: mode.both.target / 100, ramp_days: 180 },
    },
    synergy: { retention_lift: SYNERGY[synergyIdx].v, monetization_lift: SYNERGY[synergyIdx].v },
  });

  const run = async () => {
    setRunning(true); setErr('');
    try {
      const pay = buildPayload();
      const [r, o] = await Promise.all([
        axios.post(`${API_URL}/projection/product-3y`, pay, { timeout: 300000 }),
        axios.post(`${API_URL}/projection/product-3y/official-scenarios`, pay, { timeout: 600000 }),
      ]);
      setRes(r.data); setOfficial(o.data);
    } catch (e: any) { setErr(e?.response?.data?.detail || String(e)); }
    setRunning(false);
  };

  const downloadExcel = async () => {
    const r = await axios.post(`${API_URL}/projection/product-3y/excel`, buildPayload(), { responseType: 'blob', timeout: 300000 });
    const url = URL.createObjectURL(new Blob([r.data]));
    const a = document.createElement('a'); a.href = url; a.download = 'product_3y_projection.xlsx'; a.click();
    URL.revokeObjectURL(url);
  };

  const mixSum = Object.values(regionMix).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      {/* ── 입력 ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-5">
        <h2 className="text-lg font-semibold text-gray-900">🌊 Product 3-Year Projection (순차출시 · 멀티모드)</h2>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <label className="block">앵커 출시일 (PC 기준)
            <input type="date" value={anchor} onChange={e => setAnchor(e.target.value)} className="mt-1 w-full border rounded px-2 py-1.5" />
          </label>
          <label className="block">Projection Horizon
            <select value={horizon} onChange={e => setHorizon(+e.target.value)} className="mt-1 w-full border rounded px-2 py-1.5">
              <option value={1}>1 Year</option><option value={2}>2 Years</option><option value={3}>3 Years</option>
            </select>
          </label>
          <label className="block">장르
            <select value={genre} onChange={e => setGenre(e.target.value)} className="mt-1 w-full border rounded px-2 py-1.5">
              {['Battle Royale', 'Extraction Shooter', 'MMORPG', 'Simulation'].map(g => <option key={g}>{g}</option>)}
            </select>
          </label>
          <label className="block">BM (engine recipe 1:1)
            <select value={bmUi} onChange={e => setBmUi(e.target.value)} className="mt-1 w-full border rounded px-2 py-1.5">
              {BM_OPTIONS.map(b => <option key={b}>{b}</option>)}
            </select>
          </label>
        </div>

        {/* Platform Launch Schedule (G) */}
        <div>
          <h3 className="font-medium text-gray-700 mb-2">Platform Launch Schedule — Cross-platform / Staged</h3>
          <p className="text-xs text-gray-500 mb-2">여러 플랫폼 선택 시 플랫폼별 Wave가 생성됩니다. 순차출시는 각 플랫폼의 M+N을 지정하세요.</p>
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 text-left"><th className="p-2">Wave</th><th>Platform</th><th>출시 (M+N)</th><th>UA (억)</th><th>Brand (억)</th><th>CPA (₩)</th><th>D1 NRU <span className="text-[10px] text-gray-400 normal-case">(UA&gt;0 시 예산기반 산출·미사용)</span></th></tr></thead>
            <tbody>{waves.map((w, i) => (
              <tr key={w.wave_id} className="border-b">
                <td className="p-2 font-mono text-xs">{w.wave_id}</td>
                <td>{w.platform}{i === 0 && <span className="ml-1 text-xs text-blue-500">(Anchor)</span>}</td>
                <td><input type="number" value={w.offset_months} min={0} max={36} disabled={i === 0}
                  onChange={e => setWaves(ws => ws.map((x, j) => j === i ? { ...x, offset_months: +e.target.value } : x))}
                  className="w-16 border rounded px-1 py-0.5" /> <span className="text-xs text-gray-400">M+</span></td>
                <td><input type="number" value={w.ua_budget} onChange={e => setWaves(ws => ws.map((x, j) => j === i ? { ...x, ua_budget: +e.target.value } : x))} className="w-20 border rounded px-1 py-0.5" /></td>
                <td><input type="number" value={w.brand_budget || 0} onChange={e => setWaves(ws => ws.map((x, j) => j === i ? { ...x, brand_budget: +e.target.value } : x))} className="w-20 border rounded px-1 py-0.5" /></td>
                <td><input type="number" value={w.target_cpa} onChange={e => setWaves(ws => ws.map((x, j) => j === i ? { ...x, target_cpa: +e.target.value } : x))} className="w-20 border rounded px-1 py-0.5" /></td>
                <td><input type="number" value={w.d1_nru_normal} onChange={e => setWaves(ws => ws.map((x, j) => j === i ? { ...x, d1_nru_normal: +e.target.value } : x))} className="w-24 border rounded px-1 py-0.5" /></td>
              </tr>))}</tbody>
          </table>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          {/* Reference Source 3-Mode (I) */}
          <div>
            <h3 className="font-medium text-gray-700 mb-2">Reference Source Mode</h3>
            {REF_MODES.map(m => (
              <label key={m.id} className="flex items-start gap-2 text-sm mb-1">
                <input type="radio" checked={refMode === m.id} onChange={() => setRefMode(m.id)} className="mt-1" />
                <span><b>{m.label}</b><br /><span className="text-xs text-gray-500">{m.desc}</span></span>
              </label>))}
            {refMode !== 'auto' && (
              <select multiple value={samples} onChange={e => setSamples(Array.from(e.target.selectedOptions).map(o => o.value))}
                className="mt-2 w-full border rounded p-1 text-xs h-24">
                {gameList.map((g: string) => <option key={g} value={g}>{g}</option>)}
              </select>)}
            <label className="block text-sm mt-2">목표 D1 리텐션
              <input type="number" step={0.01} value={targetD1} onChange={e => setTargetD1(+e.target.value)} className="mt-1 w-24 border rounded px-2 py-1" />
            </label>
          </div>

          {/* Mode Strategy (C) */}
          <div>
            <h3 className="font-medium text-gray-700 mb-2">Mode Strategy (BR+EX 동시 론칭)</h3>
            <div className="text-sm space-y-1">
              <div>EX Only: <input type="number" value={mode.ex_only.initial} onChange={e => setMode(m => ({ ...m, ex_only: { ...m.ex_only, initial: +e.target.value } }))} className="w-12 border rounded px-1" />% → <input type="number" value={mode.ex_only.target} onChange={e => setMode(m => ({ ...m, ex_only: { ...m.ex_only, target: +e.target.value } }))} className="w-12 border rounded px-1" />% (180d ramp)</div>
              <div>Both: <input type="number" value={mode.both.initial} onChange={e => setMode(m => ({ ...m, both: { ...m.both, initial: +e.target.value } }))} className="w-12 border rounded px-1" />% → <input type="number" value={mode.both.target} onChange={e => setMode(m => ({ ...m, both: { ...m.both, target: +e.target.value } }))} className="w-12 border rounded px-1" />%</div>
              <div className="text-xs text-gray-400">BR Only = 나머지 (항등식 자동검증)</div>
            </div>
            <h4 className="font-medium text-gray-700 mt-3 mb-1 text-sm">Mode Synergy Scenario</h4>
            {SYNERGY.map((s, i) => (
              <label key={s.label} className="flex items-center gap-2 text-sm">
                <input type="radio" checked={synergyIdx === i} onChange={() => setSynergyIdx(i)} />
                {s.label} ({s.v.toFixed(2)}x)
              </label>))}
            <p className="text-xs text-amber-600 mt-1">⚠ Scenario assumption — not calibrated · retention lift는 V13.9까지 비활성(monetization만 적용)</p>
            <h4 className="font-medium text-gray-700 mt-3 mb-1 text-sm">비용 입력 (BEP용)</h4>
            <div className="text-sm space-y-1">
              <div>개발비 누적 <input type="number" value={costs.dev} onChange={e => setCosts(c => ({ ...c, dev: +e.target.value }))} className="w-20 border rounded px-1" /> 억</div>
              <div>연 인건비 <input type="number" value={costs.hr} onChange={e => setCosts(c => ({ ...c, hr: +e.target.value }))} className="w-20 border rounded px-1" /> 억</div>
              <p className="text-xs text-gray-400">서스테인 = launch UA의 연 10% (엔진 기본, 매출% 방식 금지)</p>
              <div className="mt-2">Strategic Hurdle (억): {(['fcy1','fcy2','fcy3'] as const).map(k => (
                <input key={k} type="number" value={(hurdle as any)[k]} onChange={e => setHurdle(h => ({...h, [k]: +e.target.value}))} className="w-16 border rounded px-1 mr-1" />))}
                <span className="text-[10px] text-gray-400">Reference only — 계산 무영향</span></div>
              <div className="mt-2 text-xs space-y-0.5">
                <label className="flex gap-1 items-center"><input type="checkbox" checked={enableBridge} onChange={e => setEnableBridge(e.target.checked)} />Projection Bridge 생성</label>
                <p className="font-medium mt-1">V14 Preview (기본 OFF · 공식 숫자 불변)</p>
                <label className="flex gap-1 items-center"><input type="checkbox" checked={v14t.v2} onChange={e => setV14t(t => ({...t, v2: e.target.checked}))} />V14.2 Independent Acquisition</label>
                <label className="flex gap-1 items-center"><input type="checkbox" checked={v14t.v3} onChange={e => setV14t(t => ({...t, v3: e.target.checked}))} />V14.3 Live Lifecycle (PREVIEW ONLY)</label>
                <p className="text-gray-400">V14.1/14.4: prototype — integration 대기</p>
              </div>
            </div>
          </div>

          {/* Region Mix (H) + Overlap */}
          <div>
            <h3 className="font-medium text-gray-700 mb-2">Global Region Mix <span className={`text-xs ${Math.abs(mixSum - 100) > 1 ? 'text-red-500' : 'text-green-600'}`}>합계 {mixSum}%</span></h3>
            <div className="grid grid-cols-3 gap-1 text-sm">
              {REGIONS.map(r => (
                <label key={r} className="flex items-center gap-1">{r}
                  <input type="number" value={regionMix[r]} onChange={e => setRegionMix(m => ({ ...m, [r]: +e.target.value }))} className="w-12 border rounded px-1 py-0.5" />%
                </label>))}
            </div>
            <p className="text-xs text-gray-400 mt-1">EU/OTHER: 내부 표본 0 → proxy factor + 경고</p>
            <h4 className="font-medium text-gray-700 mt-3 mb-1 text-sm">Same-day Overlap (target%)</h4>
            {(['Mobile', 'Console'] as const).map(p => (
              <div key={p} className="text-sm">PC↔{p}: <input type="number" value={(overlap as any)[p].initial} onChange={e => setOverlap(o => ({ ...o, [p]: { ...(o as any)[p], initial: +e.target.value } }))} className="w-12 border rounded px-1" />% → <input type="number" value={(overlap as any)[p].target} onChange={e => setOverlap(o => ({ ...o, [p]: { ...(o as any)[p], target: +e.target.value } }))} className="w-12 border rounded px-1" />% (90d)</div>))}
            <p className="text-xs text-gray-400">Source: Scenario Prior (Aniimo ref) · Confidence: Low</p>
          </div>
        </div>

        <div className="flex gap-3 items-center">
          <button onClick={run} disabled={running} className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium">
            {running ? '계산 중... (Scenario×3 + Tornado×14)' : '▶ Run 3-Year Projection'}
          </button>
          {res && <button onClick={downloadExcel} className="px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700">📥 Excel (10 sheets)</button>}
          <span className="text-xs text-gray-400">Revenue Engine: Legacy PR×ARPPU (default) · ARPDAU: candidate</span>
        </div>
        {err && <p className="text-sm text-red-600">❌ {err}</p>}
      </div>

      {/* ── 결과 ── */}
      {res && (
        <div className="space-y-6">
          {official && (
            <div className="bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl p-5">
              <p className="text-sm opacity-80">{official.label}</p>
              <p className="text-3xl font-bold mt-1">{fmt억(official.headline.range_krw[0])} ~ {fmt억(official.headline.range_krw[1])}
                <span className="text-lg font-medium ml-3 opacity-90">Planning Case {fmt억(official.headline.planning_case_krw)}</span></p>
              <p className="text-xs mt-2 opacity-80">⚠ {official.conditional}</p>
            </div>
          )}

          {official && (
            <div className="bg-white rounded-xl border p-4">
              <h4 className="font-semibold text-sm mb-2">🎯 Official Scenarios (D1 40/50/60 — 타 변수 고정)</h4>
              <table className="w-full text-sm">
                <thead><tr className="bg-gray-50"><th className="p-2 text-left">Scenario</th><th>D1</th>{official.scenarios.normal.annual.slice(1,4).map((_: any, i: number) => <th key={i}>FCY{i+1} / Cov</th>)}<th>Total</th><th className="text-[10px]">snapshot</th></tr></thead>
                <tbody>{(['worst','normal','best'] as const).map((n, ix) => { const s = official.scenarios[n]; return (
                  <tr key={n} className={`border-b text-center ${n === 'normal' ? 'bg-indigo-50 font-semibold' : ''}`}>
                    <td className="p-2 text-left capitalize">{n}</td><td>{[40,50,60][ix]}%</td>
                    {s.annual.slice(1,4).map((a: any, i: number) => <td key={i}>{fmt억(a.gross_revenue_krw)}<span className="text-[10px] text-gray-400 ml-1">{s.hurdle_coverage?.rows?.[i]?.coverage_pct}%</span></td>)}
                    <td>{fmt억(s.total.gross_krw)}</td><td className="text-[9px] font-mono text-gray-400">{s.assumption_set_id}</td>
                  </tr>); })}</tbody>
              </table>
            </div>
          )}

          {res.projection_bridge && (
            <div className="bg-white rounded-xl border p-4">
              <h4 className="font-semibold text-sm mb-1">🌉 {res.projection_bridge.label}</h4>
              <p className="text-[10px] text-gray-400 mb-2">{res.projection_bridge.order_note}</p>
              {res.projection_bridge.rows.map((r2: any, i: number) => (
                <div key={i} className="flex justify-between text-xs border-b py-1">
                  <span>{r2.step}</span><span className="font-mono">{fmt억(r2.cumulative_gross_krw)} <span className={r2.delta_krw >= 0 ? 'text-green-600' : 'text-red-600'}>({r2.delta_krw >= 0 ? '+' : ''}{fmt억(r2.delta_krw)})</span></span>
                </div>))}
            </div>
          )}

          {res.confidence && (
            <div className="bg-white rounded-xl border p-4">
              <h4 className="font-semibold text-sm mb-1">🏷 Confidence Badge <span className="text-[10px] text-gray-400">{res.confidence.definition}</span></h4>
              <p className="text-xs text-amber-700 mb-2">{res.confidence.summary}</p>
              <div className="flex flex-wrap gap-1 text-[11px]">
                {Object.entries(res.confidence.evidence_state).map(([k, v]: any) => (
                  <span key={k} className="px-2 py-1 bg-gray-50 border rounded" title={v.source}>{v.badge} {k}</span>))}
              </div>
            </div>
          )}

          {/* Annual Summary (B) */}
          <div className="bg-white rounded-xl border p-5">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold text-gray-800">📅 Annual Summary (launch-relative)</h3>
              <span className="text-xs text-gray-400 font-mono">assumption_set: {res.assumption_set?.assumption_set_id}</span>
            </div>
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-100"><th className="p-2 text-left">KPI</th>{res.annual_summary.map((a: any) => <th key={a.year}>{a.year}</th>)}<th>Total</th></tr></thead>
              <tbody>
                <tr className="border-b"><td className="p-2">Unique NRU</td>{res.annual_summary.map((a: any) => <td key={a.year} className="text-center">{fmtK(a.unique_nru)}</td>)}<td className="text-center font-semibold">{fmtK(res.annual_summary.reduce((s: number, a: any) => s + a.unique_nru, 0))}</td></tr>
                <tr className="border-b"><td className="p-2">Avg Unique DAU</td>{res.annual_summary.map((a: any) => <td key={a.year} className="text-center">{fmtK(a.avg_unique_dau)}</td>)}<td className="text-center font-semibold">{fmtK(res.total.avg_unique_dau)}</td></tr>
                <tr className="border-b"><td className="p-2">Peak Unique DAU</td>{res.annual_summary.map((a: any) => <td key={a.year} className="text-center">{fmtK(a.peak_unique_dau)}</td>)}<td className="text-center font-semibold">{fmtK(res.total.peak_unique_dau)}</td></tr>
                <tr className="border-b"><td className="p-2">Gross Revenue</td>{res.annual_summary.map((a: any) => <td key={a.year} className="text-center">{fmt억(a.gross_revenue_krw)}</td>)}<td className="text-center font-semibold">{fmt억(res.total.gross_krw)}</td></tr>
                <tr className="border-b"><td className="p-2">Net Revenue (×0.7)</td>{res.annual_summary.map((a: any) => <td key={a.year} className="text-center">{fmt억(a.net_revenue_krw)}</td>)}<td className="text-center font-semibold">{fmt억(res.total.net_krw)}</td></tr>
                <tr className="border-b bg-amber-50"><td className="p-2">Tail Share (UserDays / Rev)</td>{res.annual_summary.map((a: any) => <td key={a.year} className="text-center text-amber-700">{(a.tail_share_userdays * 100).toFixed(0)}% / {(a.tail_share_revenue * 100).toFixed(0)}%</td>)}<td /></tr>
              </tbody>
            </table>
          </div>

          {/* 그래프 4종 (A) */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border p-4">
              <h4 className="font-semibold text-sm mb-2">① Unique Account DAU ({res.monthly.length}개월)</h4>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={res.monthly}><CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} /><YAxis tickFormatter={fmtK} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: any) => fmtK(v)} /><Line type="monotone" dataKey="unique_dau" stroke="#4f46e5" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <h4 className="font-semibold text-sm mb-2">② Platform DAU vs Unique</h4>
              <ResponsiveContainer width="100%" height={220}>
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
              <h4 className="font-semibold text-sm mb-2">③ Monthly Gross Revenue (platform stacked)</h4>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={res.monthly}><CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} /><YAxis tickFormatter={(v) => fmt억(v)} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: any) => fmt억(v)} /><Legend />
                  {['PC', 'Mobile', 'Console'].map((p, i) => res.monthly[0]?.[`rev_${p}`] !== undefined &&
                    <Area key={p} stackId="1" type="monotone" dataKey={`rev_${p}`} stroke={['#0ea5e9', '#f59e0b', '#10b981'][i]} fill={['#bae6fd', '#fde68a', '#a7f3d0'][i]} />)}
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <h4 className="font-semibold text-sm mb-2">④ Mode Mix (BR/EX/Both) <span className="text-xs text-gray-400">{res.mode_summary?.synergy_label}</span></h4>
              <ResponsiveContainer width="100%" height={220}>
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

          {/* Envelope + Tornado (F) */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border p-4">
              <h4 className="font-semibold text-sm mb-2">💼 Business Scenario Envelope <span className="text-xs text-gray-400">(≠ 통계 P10/P90)</span></h4>
              <table className="w-full text-sm">
                <thead><tr className="bg-gray-50"><th className="p-2 text-left">Scenario</th><th>3Y Gross</th>{res.annual_summary.map((a: any) => <th key={a.year}>{a.year}</th>)}</tr></thead>
                <tbody>{Object.entries(res.business_scenario_envelope.scenarios).map(([n, s]: any) => (
                  <tr key={n} className={`border-b ${n === 'base' ? 'bg-indigo-50 font-semibold' : ''}`}>
                    <td className="p-2 capitalize">{n}</td><td className="text-center">{fmt억(s.total_gross_krw)}</td>
                    {s.annual.map((a: any) => <td key={a.year} className="text-center">{fmt억(a.gross)}</td>)}
                  </tr>))}</tbody>
              </table>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <h4 className="font-semibold text-sm mb-2">🌪 Tornado Sensitivity (±20% 자동계산, Rev 기준 정렬)</h4>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart layout="vertical" data={res.tornado_sensitivity} margin={{ left: 30 }}>
                  <XAxis type="number" tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="lever" width={90} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: any) => `${(v * 100).toFixed(1)}%`} /><ReferenceLine x={0} stroke="#888" />
                  <Bar dataKey="rev_minus20" fill="#f87171" name="Rev -20%" /><Bar dataKey="rev_plus20" fill="#34d399" name="Rev +20%" />
                </BarChart>
              </ResponsiveContainer>
              <p className="text-xs text-gray-400">DAU 영향은 Excel 07 시트 참조 (overlap은 DAU↓/Rev불변 비대칭)</p>
            </div>
          </div>

          {/* 7. P&L Waterfall */}
          {res.pnl && (
            <div className="bg-white rounded-xl border p-4">
              <h4 className="font-semibold text-sm mb-2">💰 7. P&L Waterfall <span className="text-xs text-gray-400">{res.pnl.rates_note}</span></h4>
              <table className="w-full text-xs">
                <thead><tr className="bg-gray-50"><th className="p-1 text-left">Year</th><th>Gross Bookings</th><th>Net (0.57)</th><th>Marketing</th><th>Contribution</th><th>HR</th><th className="font-bold">Operating</th></tr></thead>
                <tbody>{res.pnl.waterfall.map((w: any) => (
                  <tr key={w.year} className="border-b text-center">
                    <td className="p-1 text-left font-medium">{w.year}</td><td>{fmt억(w.gross_bookings)}</td><td>{fmt억(w.net_revenue)}</td>
                    <td className="text-red-600">{fmt억(w.marketing)}</td><td>{fmt억(w.contribution_profit)}</td>
                    <td className="text-red-600">{fmt억(w.hr_cost)}</td>
                    <td className={`font-bold ${w.operating_profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmt억(w.operating_profit)}</td>
                  </tr>))}</tbody>
              </table>
              <div className="mt-2 text-xs text-gray-500">
                Marketing Ledger: Launch UA {fmt억(res.marketing_ledger?.launch?.performance_ua || 0)} + Brand {fmt억(res.marketing_ledger?.launch?.brand || 0)} · Sustain {fmt억(res.marketing_ledger?.sustain_annual || 0)}/yr ({res.marketing_ledger?.sustain_note})
              </div>
              {res.nru_breakdown && (
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  {Object.entries(res.nru_breakdown).map(([wid, na]: any) => na && (
                    <span key={wid} className="px-2 py-1 bg-sky-50 rounded border border-sky-100">
                      {wid}: Paid {fmtK(na.paid_nru || 0)} / Organic {fmtK(na.organic_nru || 0)} (boost ×{na.organic_boost_factor}) / 사전유입 {fmtK(na.pre_launch_users || 0)}
                    </span>))}
                </div>)}
            </div>
          )}

          {/* 8. BEP — 최종 레이어 */}
          {res.pnl && (
            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl border-2 border-emerald-300 p-5">
              <h4 className="font-bold text-emerald-900 mb-3">🏁 8. Break-Even Point (사업성 최종 레이어)</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white rounded-lg p-4 text-center">
                  <p className="text-xs text-gray-500">Marketing BEP</p>
                  <p className="text-2xl font-bold text-emerald-700">{res.pnl.bep.marketing_bep_month}</p>
                  <p className="text-[10px] text-gray-400">누적 Net ≥ 누적 마케팅</p>
                </div>
                <div className="bg-white rounded-lg p-4 text-center">
                  <p className="text-xs text-gray-500">Full Cost BEP</p>
                  <p className="text-2xl font-bold text-teal-700">{res.pnl.bep.full_cost_bep_month}</p>
                  <p className="text-[10px] text-gray-400">+ 인건비 누적 + 개발비 ({res.pnl.cost_inputs.status})</p>
                </div>
              </div>
            </div>
          )}

          {/* Reliability + Calibration + Warnings (E) */}
          <div className="bg-white rounded-xl border p-4 space-y-3">
            <div className="flex flex-wrap gap-2 text-xs">
              {Object.entries(res.calibration_status || {}).map(([k, v]: any) => (
                <span key={k} className={`px-2 py-1 rounded ${v === 'measured' ? 'bg-green-100 text-green-700' : String(v).startsWith('prior') ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>{k}: {v}</span>))}
            </div>
            <div className="text-xs text-gray-500">Top-down Sanity: Peak MAU ≈ {fmtK(res.topdown_sanity?.implied_peak_mau || 0)} (stickiness {res.topdown_sanity?.stickiness_used}, {res.topdown_sanity?.source})</div>
            {res.warnings?.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
                {res.warnings.map((w: string, i: number) => <p key={i} className="text-xs text-amber-700">{w}</p>)}
              </div>)}
          </div>
        </div>
      )}
    </div>
  );
}
