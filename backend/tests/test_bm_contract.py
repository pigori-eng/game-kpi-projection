# -*- coding: utf-8 -*-
"""V14.1.0 Single Wave BM 계약 + 회귀 스냅샷"""
import sys, os, asyncio
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import bm_contracts as B
import main as M
import pytest

def test_t1_benchmark_only_cosmetic():
    r = B.resolve_bm_modifier("F2P_Cosmetic", True, [], [])
    assert r["mult"] == 0.85
    assert r["mode"] == "benchmark_only_evidence_modifier"

def test_t2_manual_sample_cosmetic_disabled():
    r = B.resolve_bm_modifier("F2P_Cosmetic", False, ["PUBG"], ["PUBG"])
    assert r["mult"] == 1.0 and r["mode"] == "sample_present_modifier_disabled"

def test_t3_hybrid_sample_gacha_disabled():
    r = B.resolve_bm_modifier("Gacha", False, ["V4(한국)"], ["V4(한국)"])
    assert r["mult"] == 1.0

def test_t4_no_sample_unknown_bm_neutral():
    r = B.resolve_bm_modifier("UnknownBM", True, [], [])
    assert r["mult"] == 1.0 and "Neutral" in r["badge"]

def _base_input(**kw):
    d = dict(launch_date="2029-03-01", projection_days=90,
        retention=M.RetentionInput(selected_games=[], target_d1_retention={"best":0.5,"normal":0.4,"worst":0.3}),
        nru=M.NRUInput(selected_games=[], d1_nru={"best":12000,"normal":10000,"worst":8000}, ua_budget=1e9, target_cpa=5000),
        revenue=M.RevenueInput(), blending={"weight":0,"genre":"Battle Royale","platforms":["PC"],"benchmark_only":True},
        quality_score="B", bm_type="Midcore", regions=["global"], advanced={"arppu_unit":"daily"})
    d.update(kw); return M.ProjectionInput(**d)

def test_single_wave_regression_and_new_fields():
    async def t():
        r = await M.calculate_projection(_base_input())
        g = r["summary"]["normal"]["gross_revenue"]
        assert g > 0
        assert "mini_revenue_bridge" in r and r["mini_revenue_bridge"]["rows"][-1]["driver"] == "Gross Revenue"
        assert "confidence" in r and "probability" in r["confidence"]["definition"]
        assert r["bm_adjustment"]["mult"] == 1.0  # Midcore = neutral
        # Cosmetic benchmark-only는 evidence modifier 적용 → 매출 감소
        r2 = await M.calculate_projection(_base_input(bm_type="F2P_Cosmetic"))
        assert r2["summary"]["normal"]["gross_revenue"] < g
        assert r2["bm_adjustment"]["mode"] == "benchmark_only_evidence_modifier"
    asyncio.run(t())
