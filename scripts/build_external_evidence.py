# -*- coding: utf-8 -*-
"""External Evidence 빌더 (재현성 보장용 — Newzoo CSV → data/external_evidence.json)
사용: python3 scripts/build_external_evidence.py <newzoo_csv_path>
규칙: peer set ID 동결 / M1 = 첫 완전 calendar month (출시일 ≤3일이면 출시월 포함) /
      horizon별 n 저장 / 산출물은 RELATIVE_ONLY (절대값 경로 진입 금지)"""
import sys, json
import pandas as pd, numpy as np

csv = sys.argv[1]
df = pd.read_csv(csv, low_memory=False)
df['Date'] = pd.to_datetime(df['Date']); df['Release date'] = pd.to_datetime(df['Release date'], errors='coerce')
ev = {"version": "newzoo_2026_07", "built": "2026-08-26",
      "contract_note": "External Evidence Layer — RELATIVE_ONLY"}
games = df.dropna(subset=['d1','d7','d28']).drop_duplicates('Game ID')
sh = games[games['Genre'].str.contains('Shooter', na=False)].copy()
sh['t287'] = sh['d28']/sh['d7']; sh['t71'] = sh['d7']/sh['d1']
def qq(s): return {p: round(float(s.quantile(q)),4) for p,q in [("p25",.25),("p50",.5),("p75",.75)]}
ev["peer_sets"] = {
  "shooter_pc_v1": {"peer_set_id":"shooter_pc_v1","benchmark_version":"newzoo_2026_07",
    "sample_n":int(len(sh)),"frozen_game_ids":sorted(sh['Game ID'].tolist()),
    "d1_sorted":sorted(round(float(v),4) for v in sh['d1']),
    "d7_sorted":sorted(round(float(v),4) for v in sh['d7']),
    "d28_sorted":sorted(round(float(v),4) for v in sh['d28']),
    "tail_28_7_quartiles":qq(sh['t287']),"tail_7_1_quartiles":qq(sh['t71'])},
  "all_games_v1": {"peer_set_id":"all_games_v1","benchmark_version":"newzoo_2026_07",
    "sample_n":int(len(games)),"frozen_game_ids":sorted(games['Game ID'].tolist()),
    "d1_sorted":sorted(round(float(v),4) for v in games['d1']),
    "d7_sorted":sorted(round(float(v),4) for v in games['d7']),
    "d28_sorted":sorted(round(float(v),4) for v in games['d28'])}}
g_all = df.drop_duplicates('Game ID'); recent = g_all[g_all['Release date'] >= '2025-08-01']
rows = df[df['Game ID'].isin(recent['Game ID'])]
curves = {}
for gid, grp in rows.groupby('Game ID'):
    grp = grp.sort_values('Date'); rel = grp['Release date'].iloc[0]
    full = grp[grp['Date'] >= (rel.replace(day=1) + pd.offsets.MonthBegin(0 if rel.day <= 3 else 1))]
    mau = full['MAU'].dropna().tolist()
    if len(mau) >= 3 and mau[0] > 0: curves[gid] = [m/mau[0] for m in mau]
sh_ids = set(g_all[g_all['Genre'].str.contains('Shooter', na=False)]['Game ID'])
shc = {g:c for g,c in curves.items() if g in sh_ids}
env = {"peer_set_id":"shooter_launch_lifecycle_v1","benchmark_version":"newzoo_2026_07",
       "m1_definition":"first_full_calendar_month","frozen_game_ids":sorted(shc.keys()),"horizons":{}}
for m in range(1,13):
    vals = [c[m-1] for c in shc.values() if len(c) >= m]
    if len(vals) >= 5:
        env["horizons"][f"M{m}"] = {"n":len(vals),
            "p25":round(float(np.percentile(vals,25)),4),"p50":round(float(np.percentile(vals,50)),4),
            "p75":round(float(np.percentile(vals,75)),4)}
ev["lifecycle_envelope"] = env
json.dump(ev, open('data/external_evidence.json','w'), ensure_ascii=False, indent=1)
print("done — peers:", len(sh), "/ lifecycle games:", len(shc))
