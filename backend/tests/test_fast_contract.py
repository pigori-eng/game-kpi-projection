# Fast contract tests (<10s) — python -m pytest backend/tests -q
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import product_3y as P
import v14_engines as v14
import pytest

def test_region_proxy_warning():
    r = P.region_revenue_multiplier({"OTHER": 0.5, "NA": 0.5})
    assert any("proxy" in w for w in r["warnings"])

def test_bm_all_neutral():
    assert all(v["bm_type"] == "Midcore" for v in P.BM_RECIPE_MAP.values())

def test_mode_identity():
    d = P.decompose_modes([1000.0]*400, P.DEFAULT_MODE, {"retention_lift":1.0,"monetization_lift":1.0})
    assert d["identity_check"] and abs(sum(d["unique_dau"]) - 400000) < 1e-6

def test_retention_lift_deactivated():
    d = P.decompose_modes([1000.0]*100, P.DEFAULT_MODE, {"retention_lift":1.5,"monetization_lift":1.0})
    assert abs(sum(d["unique_dau"]) - 100000) < 1e-6 and "비활성" in d["synergy_label"]

def test_v14_anchor_monotone_reject():
    with pytest.raises(ValueError):
        v14.anchored_retention_curve({"d1":0.3,"d7":0.4,"d30":0.1,"d90":0.05}, 90)

def test_v14_brand_diminishing():
    a = v14.brand_independent_installs(2e10, "PC")["installs"]
    b = v14.brand_independent_installs(4e10, "PC")["installs"]
    assert 0 < b < a*2

def test_v14_lifecycle_stockflow():
    dec = [100000.0*(0.995**i) for i in range(400)]
    lc = v14.live_lifecycle(dec, [{"day":90,"type":"major"}], 400)
    assert lc["dau_with_lifecycle"][95] > dec[95] and lc["returning_series"][95] > lc["returning_series"][300]

def test_v14_3layer_exclusive():
    tl = v14.three_layer_revenue([1000.0]*30, [5000.0]*30, {})
    assert "double count" in tl["revenue_owner"]

def test_lineage_tuple():
    e = v14.lineage_entry("d1", 0.44, "measured", "Alpha", "abc", sample_n=100)
    assert all(k in e for k in ["value","status","source","sample_n","snapshot_id","date"])

def test_sustain_revenue_pct_rejected():
    with pytest.raises(ValueError):
        P.build_pnl_bep([], [], {"launch":{"total":0},"sustain_annual":0},
                        {"sustain_def":{"type":"revenue_pct","value":0.1}}, 365)
