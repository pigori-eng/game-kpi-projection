# -*- coding: utf-8 -*-
"""V14.2.0 Shadow & Calibration Framework — 성공 기준 6종 (피드백25 §7)"""
import sys, os, asyncio
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import revenue_owner as R
import acquisition_response as A
import actual_import as I
import main as M
import product_3y as P

PAY = {"product_name":"T","anchor_launch_date":"2029-03-01","horizon_years":2,
  "genre":"Battle Royale","bm_ui":"F2P Cosmetic + Battle Pass","reference_mode":"auto",
  "target_d1":0.50,"organic_share_of_total":0.364,"region_scope":{"mode":"global_ex_cn"},
  "waves":[{"wave_id":"pc","platform":"PC","offset_months":0,"ua_budget":5e9,"brand_budget":2e9,
            "target_cpa":7500,"d1_nru_normal":0,"prereg_users":1000000,"prereg_activation_rate":0.40}],
  "mode":{"ex_only":{"initial":0.1,"target":0.15,"ramp_days":180},"both":{"initial":0.08,"target":0.25,"ramp_days":180}},
  "synergy":{"retention_lift":1.0,"monetization_lift":1.0}}

def test_1_shadow_generated_and_official_unchanged():
    r = R.shadow_backtest()
    assert r["status"] == "shadow_only" and r["official_result_unchanged"]
    assert r["official_owner"] == "legacy_pr_arppu"
    assert set(r["candidates_family_balanced"]) == {"legacy_pr_arppu", "arpdau", "three_layer_bm"}
    assert r["n_families"] >= 5

def test_2_gate_strict_no_auto_promote():
    r = R.shadow_backtest()
    # 현 데이터에서 승격 조건 미충족 → 반드시 false (자동 승격 방지)
    assert r["gate_result"]["promote_candidate"] is False
    assert r["gate_result"]["reason"]

def test_3_preview_delta_bridge():
    async def t():
        d = await P.run_v14_delta_bridge(PAY, M.calculate_projection, M.ProjectionInput)
        assert d["official_result_unchanged"] and d["preview_only"]
        cfgs = [r["config"] for r in d["rows"]]
        assert any("Retention Anchor" in c for c in cfgs)
        assert any("3-Layer" in c for c in cfgs)
        assert any("All Preview" in c for c in cfgs)
        anchor_row = next(r for r in d["rows"] if "Retention Anchor" in r["config"])
        assert "산출 보류" in anchor_row["note"]  # 허위 근사 대신 정직한 보류 + Shadow가 담당
    asyncio.run(t())

def test_4_cpi_curve_and_fallback():
    r = A.spend_to_installs_with_curve(3e9, 90, "ua_cpi_mobile_kr_2026q4", 7500)
    assert r["mode"] == "response_curve_shadow" and "SHADOW" in r["note"]
    fb = A.spend_to_installs_with_curve(3e9, 90, "no_such_curve", 7500)
    assert fb["mode"] == "static_cpi_fallback"
    bad = A.validate_cpi_curve({"points": [{"daily_spend_krw": 2, "expected_cpi": 100},
                                            {"daily_spend_krw": 1, "expected_cpi": 100}]})
    assert not bad["valid"]

def test_5_actual_import_dry_run():
    v = I.validate_actuals([
        {"metric": "target_d1", "value": 0.44, "status": "measured", "source": "Alpha", "sample_n": 32418},
        {"metric": "unknown_var", "value": 1},
        {"metric": "prereg_activation_rate", "value": 0.37, "status": "measured"},  # sample_n 누락 → 거부
    ])
    assert len(v["valid"]) == 1 and len(v["rejected"]) == 2
    assert v["valid"][0]["variable"] == "target_d1"

def test_6_replace_lineage_preserved():
    async def t():
        from fastapi.testclient import TestClient
        c = TestClient(M.app)
        r = c.post("/api/assumptions/import-actuals", json={"base_payload": PAY, "dry_run": True,
            "actuals": [{"metric": "target_d1", "value": 0.44, "status": "measured",
                         "source": "GW Alpha", "sample_n": 32418, "date": "2029-01-15"}]})
        d = r.json()
        assert d["dry_run"] and not d["applied"]
        assert d["impact"]["lineage"][0]["projection_impact"]["delta"] < 0
        assert "confirm" in d["next_step"]
    asyncio.run(t())
