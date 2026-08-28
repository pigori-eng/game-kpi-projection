# -*- coding: utf-8 -*-
"""V13.7 자동 테스트 — python3 tests_product_3y.py (엔진 호출 포함, ~1분)"""
import sys, os, asyncio, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import main as M
import product_3y as P
import v14_engines as v14

PASS = FAIL = 0
def ck(n, c, d=""):
    global PASS, FAIL
    PASS += bool(c); FAIL += (not c); print(("  ✅ " if c else "  ❌ ") + n + ((" " + d) if (d and not c) else ""))

PAYLOAD = {
    "product_name": "T", "anchor_launch_date": "2029-03-01", "horizon_years": 2,
    "genre": "Battle Royale", "bm_ui": "F2P Cosmetic + Battle Pass", "reference_mode": "auto",
    "target_d1": 0.30,
    "region_mix": {"NA": 0.3, "EU": 0.2, "KR": 0.15, "JP": 0.1, "SEA": 0.2, "OTHER": 0.05},
    "waves": [
        {"wave_id": "pc", "platform": "PC", "offset_months": 0, "ua_budget": 5e9, "target_cpa": 7500, "d1_nru_normal": 100000},
        {"wave_id": "mobile", "platform": "Mobile", "offset_months": 6, "ua_budget": 4e9, "target_cpa": 4000, "d1_nru_normal": 150000},
    ],
    "mode": {"ex_only": {"initial": 0.1, "target": 0.15, "ramp_days": 180},
             "both": {"initial": 0.08, "target": 0.25, "ramp_days": 180}},
    "synergy": {"retention_lift": 1.0, "monetization_lift": 1.0},
}

async def run():
    print("── T1: J. BM↔recipe 1:1 매핑 ──")
    ck("6개 UI BM 전부 engine_recipe 보유", all("engine_recipe" in v for v in P.BM_RECIPE_MAP.values()))
    ck("Hybrid F2P+DLC → hybrid_f2p_dlc", P.BM_RECIPE_MAP["Hybrid F2P + DLC"]["engine_recipe"] == "hybrid_f2p_dlc")
    import arpdau_engine as A
    ck("hybrid recipe가 ARPDAU 호환표에 등록", "hybrid_f2p_dlc" in A.RECIPE_COMPAT)

    print("── T2: H-core. Region factor contract ──")
    r = P.region_revenue_multiplier({"OTHER": 0.5, "NA": 0.5})
    ck("proxy 지역(OTHER) 경고 발생 (원칙 6)", any("proxy" in w for w in r["warnings"]))
    ck("multiplier 가중산술 정확", abs(r["multiplier"] - (0.5 * 0.50 + 0.5 * 1.60)) < 1e-6)
    r_eu = P.region_revenue_multiplier({"EU": 1.0})
    ck("EU proxy→shrunk 승격 (NEW STATE 실측 병합, factor 1.00)",
       abs(r_eu["multiplier"] - 1.00) < 1e-6 and not any("EU" in w and "proxy" in w for w in r_eu["warnings"]))
    r2 = P.region_revenue_multiplier({"NA": 0.6, "SEA": 0.6})
    ck("합계≠1 정규화 + 경고", any("정규화" in w for w in r2["warnings"]))

    print("── T3: C. Mode 2층 (원칙 1,2) ──")
    d = P.decompose_modes([1000.0] * 400, P.DEFAULT_MODE, {"retention_lift": 1.0, "monetization_lift": 1.0})
    ck("Σmode = Unique 항등식", d["identity_check"])
    ck("mode mix가 Unique DAU 총량 불변 (원칙 1)", abs(sum(d["unique_dau"]) - 1000.0 * 400) < 1e-6)
    d2 = P.decompose_modes([1000.0] * 100, P.DEFAULT_MODE, {"retention_lift": 1.1, "monetization_lift": 1.1})
    ck("synergy≠1.00 시 시나리오 라벨 강제 (원칙 2)", "not calibrated" in d2["synergy_label"])

    print("── T4: 파이프라인 + 시나리오/레버 실효성 ──")
    res = await P.run_product_3y(PAYLOAD, M.calculate_projection, M.ProjectionInput)
    ck("annual_summary 연수 일치", len(res["annual_summary"]) == 2)
    sc = res["legacy_lever_envelope"]["scenarios"]
    ck("Downside < Base < Upside (실제 분화 — 피드백9 블로커 해소)",
       sc["downside"]["total_gross_krw"] < sc["base"]["total_gross_krw"] < sc["upside"]["total_gross_krw"],
       f"{sc['downside']['total_gross_krw']:.0f}/{sc['base']['total_gross_krw']:.0f}/{sc['upside']['total_gross_krw']:.0f}")
    tor = {t["lever"]: t for t in res["tornado_sensitivity"]}
    ck("retention lever가 revenue에 실제 영향", abs(tor["retention_d1"]["rev_plus20"]) > 0.01)
    ck("ua lever 영향", abs(tor["ua_scale"]["rev_plus20"]) > 0.01)
    ck("overlap lever: DAU 영향 ≠ Rev 영향 (비대칭)", abs(tor["overlap_target"]["dau_minus20"]) > abs(tor["overlap_target"]["rev_minus20"]) - 1e-9)
    ck("ex_adoption: Rev 영향 ≈ 0 (원칙 1 — mode mix는 돈을 만들지 않음)", abs(tor["ex_adoption"]["rev_plus20"]) < 0.005)
    ck("assumption snapshot id 존재 (원칙 10)", len(res["assumption_set"]["assumption_set_id"]) == 12)
    y2 = res["annual_summary"][1]
    ck("Y2 tail share 산출 (user-days & revenue 이중)", 0 < y2["tail_share_userdays"] <= 1 and "tail_share_revenue" in y2)
    ck("Y-경고 강제 (마지막 해 tail)", any("tail" in w.lower() or "외삽" in w for w in res["warnings"]) or res["annual_summary"][-1]["tail_share_userdays"] == 0)

    print("── T6: V13.7.1 Wiring 복구 ──")
    pay_b = {**PAYLOAD, "waves": [{**PAYLOAD["waves"][0], "brand_budget": 3e9}, PAYLOAD["waves"][1]]}
    rb = await P.run_product_3y(pay_b, M.calculate_projection, M.ProjectionInput)
    ck("brand_budget 관통 → 매출 증가 (organic boost 발동)",
       rb["total"]["gross_krw"] > res["total"]["gross_krw"] * 1.02,
       f"{rb['total']['gross_krw']:.0f} vs {res['total']['gross_krw']:.0f}")
    na = rb["nru_breakdown"]["pc"]
    ck("NRU breakdown (paid/organic/boost) 노출", na and na.get("paid_nru", 0) > 0 and na.get("organic_boost_factor", 1.0) > 1.0)
    pay_g = {**PAYLOAD, "bm_ui": "F2P Gacha"}
    rg = await P.run_product_3y(pay_g, M.calculate_projection, M.ProjectionInput)
    ck("V13.7.2: BM 무근거 modifier 중립화 — recipe 변경해도 매출 불변",
       abs(rg["total"]["gross_krw"] - res["total"]["gross_krw"]) < 1,
       f"{rg['total']['gross_krw']:.0f}")
    ck("bm_applied = Midcore(중립) 노출", rg["bm_applied"]["pc"] == "Midcore")
    pay_s = {**PAYLOAD, "synergy": {"retention_lift": 1.2, "monetization_lift": 1.0}}
    rs = await P.run_product_3y(pay_s, M.calculate_projection, M.ProjectionInput)
    ck("retention lift 비활성 (DAU 불변 + 라벨)",
       rs["total"]["avg_unique_dau"] == res["total"]["avg_unique_dau"] and "비활성" in rs["mode_summary"]["synergy_label"])
    ck("Marketing Ledger = P&L 마케팅 동일 소스",
       abs(rb["marketing_ledger"]["launch"]["total"] + rb["marketing_ledger"]["sustain_annual"]
           + abs(rb["pnl"]["waterfall"][0]["marketing"]) * 0) >= 0 and
       abs(abs(rb["pnl"]["waterfall"][0]["marketing"]) - (rb["marketing_ledger"]["launch"]["total"] + rb["marketing_ledger"]["sustain_annual"])) < 1)
    pay_c = {**PAYLOAD, "costs": {"dev_cost_total_krw": 50e9, "annual_hr_cost_krw": 20e9}}
    rc = await P.run_product_3y(pay_c, M.calculate_projection, M.ProjectionInput)
    ck("BEP 2종 산출", "marketing_bep_month" in rc["pnl"]["bep"] and "full_cost_bep_month" in rc["pnl"]["bep"])
    try:
        await P.run_product_3y({**PAYLOAD, "costs": {"sustain_def": {"type": "revenue_pct", "value": 0.1}}},
                               M.calculate_projection, M.ProjectionInput)
        ck("sustain revenue_pct 거부", False)
    except ValueError:
        ck("sustain revenue_pct 거부 (순환구조 금지)", True)
    ck("region scope 라벨", "monetization" in rc["region"].get("scope", ""))

    print("── T7: V13.7.2 Hurdle (No Target Leakage) ──")
    h1 = {**PAYLOAD, "strategic_hurdle": {"fcy1": 100e8, "fcy2": 100e8}}
    h2 = {**PAYLOAD, "strategic_hurdle": {"fcy1": 200e8, "fcy2": 200e8}}
    r1 = await P.run_product_3y(h1, M.calculate_projection, M.ProjectionInput)
    r2 = await P.run_product_3y(h2, M.calculate_projection, M.ProjectionInput)
    ck("Hurdle 변경해도 Projection 완전 동일 (No Target Leakage)",
       r1["total"]["gross_krw"] == r2["total"]["gross_krw"] and r1["total"]["avg_unique_dau"] == r2["total"]["avg_unique_dau"])
    ck("Coverage만 변화 + reference-only 문구",
       r1["strategic_hurdle_coverage"]["rows"][0]["coverage_pct"] != r2["strategic_hurdle_coverage"]["rows"][0]["coverage_pct"]
       and "does not affect" in r1["strategic_hurdle_coverage"]["disclaimer"])

    print("── T8: V13.8 Explainability ──")
    ck("Confidence = provenance (확률 아님)", "확률" in r1["confidence"]["definition"] and "assumption" in r1["confidence"]["summary"])
    ck("Conditional 고지 + not a sales commitment", "not a sales commitment" in r1["conditional_notice"]["disclaimer"])
    rb = await P.run_product_3y({**PAYLOAD, "enable_bridge": True}, M.calculate_projection, M.ProjectionInput)
    br = rb["projection_bridge"]
    ck("Ordered Bridge 자동 재실행 (단계별 Δ)", len(br["rows"]) >= 5 and br["rows"][1]["delta_krw"] != 0)
    ck("순서 의존성 각주", "Ordered bridge 기준" in br["order_note"])
    ck("baseline < final (penalty 제거 누적 효과)", br["rows"][0]["cumulative_gross_krw"] < br["rows"][-1]["cumulative_gross_krw"])
    lin = v14.lineage_entry("target_d1", 0.44, "measured", "GW Alpha", "abc123", sample_n=32418)
    ck("Lineage 튜플 (value+status+source+sample_n+snapshot)",
       all(k in lin for k in ["value", "status", "source", "sample_n", "snapshot_id", "date"]))
    ck("Lineage diff 자동", len(v14.diff_assumption_sets({"d1": 0.5}, {"d1": 0.44})) == 1)

    print("── T9: V14.1~14.4 Engines ──")
    ac = v14.anchored_retention_curve({"d1": 0.50, "d7": 0.225, "d30": 0.11, "d90": 0.06}, 365)
    ck("V14.1 anchor 커브 단조감소 + anchor 통과",
       abs(ac["curve"][1] - 0.50) < 0.02 and all(ac["curve"][i] >= ac["curve"][i+1] - 1e-9 for i in range(1, 364)))
    try:
        v14.anchored_retention_curve({"d1": 0.3, "d7": 0.4, "d30": 0.1, "d90": 0.05}, 90); ck("V14.1 단조위반 거부", False)
    except ValueError: ck("V14.1 단조위반 거부", True)
    bi = v14.brand_independent_installs(2e10, "PC")
    ck("V14.2 Brand 단독 유입 (UA=0에도 install)", bi["installs"] > 0)
    ck("V14.2 수확체감", v14.brand_independent_installs(4e10, "PC")["installs"] < bi["installs"] * 2)
    _decay = [100000.0 * (0.995 ** i) for i in range(400)]
    lc = v14.live_lifecycle(_decay, [{"day": 90, "type": "major"}, {"day": 180, "type": "major"}], 400)
    ck("V14.3 재활성 이벤트 + 복귀 코호트 감쇠",
       len(lc["events"]) == 2 and lc["dau_with_lifecycle"][95] > _decay[95] and lc["returning_series"][95] > lc["returning_series"][170])
    ck("V14.3 stock-flow 라벨 (uplift 아님)", "Stock-flow" in lc["note"])
    tl = v14.three_layer_revenue([50000.0] * 365, [200000.0] * 365,
        {"first_purchase_cvr": 0.025, "pass_attach_rate": 0.12, "premium_spender_rate": 0.004})
    ck("V14.4 3층 합 = total", abs(tl["cumulative"]["entry"] + tl["cumulative"]["repeat"] + tl["cumulative"]["high_arpu"] - tl["cumulative"]["total"]) < 1)
    ck("V14.4 Revenue Owner 배타 명시", "double count" in tl["revenue_owner"])
    rv = await P.run_product_3y({**PAYLOAD, "enable_v14_3": True}, M.calculate_projection, M.ProjectionInput)
    ck("V14.3 파이프라인 연동 (opt-in)", rv["v14_status"]["v14_3_lifecycle"] is not None)
    ck("V14 기본 OFF (기존 숫자 불변)", res["total"]["gross_krw"] == r1["total"]["gross_krw"])

    print("── T5: Excel 10시트 ──")
    xls = P.build_excel(M.sanitize_for_json(res))
    from openpyxl import load_workbook
    from io import BytesIO
    wb = load_workbook(BytesIO(xls))
    ck("14개 시트 (V14.0.1: +Hurdle/Bridge/Badge/Lineage)", len(wb.sheetnames) == 14, str(wb.sheetnames))
    ck("Assumptions 시트에 snapshot id", any("assumption_set_id" in str(c.value) for c in wb["09_Assumptions"]["A"]))

    print(f"\nRESULT: {PASS} PASS / {FAIL} FAIL")
    return FAIL

sys.exit(asyncio.run(run()))
