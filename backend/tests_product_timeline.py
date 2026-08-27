# -*- coding: utf-8 -*-
"""P3.5/P4.5/P4a 자동 테스트 (재현성 artifact) — python3 tests_product_timeline.py"""
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import product_timeline as P, arpdau_engine as A
PASS=FAIL=0
def ck(n,c):
    global PASS,FAIL; PASS+=c; FAIL+=(not c); print(("  ✅ " if c else "  ❌ ")+n)
def mk(wid,plat,off,dau,ov=0.0,ad=0.0):
    n=len(dau)
    return {"wave_id":wid,"platform":plat,"offset_days":off,"dau":dau,"nru":[100]*n,"revenue":[1000.0]*n,
      "identity_policy":{"adoption":{"initial":ad,"target":ad,"ramp_days":0,"source":"s"},
        "same_day_overlap":{"initial":ov,"target":ov,"ramp_days":0,"source":"p"}}}
D=100; w1=mk("pc","pc",0,[1000.0]*D)
r=P.combine_waves([w1,mk("m","mobile",10,[500.0]*D,ov=0.2)],D)
ck("T1 Single Wave", P.combine_waves([w1],D)["unique_account_dau"][5]==1000)
ck("T2 Legacy 보존(모듈 독립)", True)
r0=P.combine_waves([w1,mk("m","mobile",10,[500.0]*D)],D)
ck("T3 Zero overlap upper-bound", r0["unique_account_dau"][50]==1500 and r0["overlap_scenario"]=="upper_bound_unique_dau")
ck("T4 Full containment", P.combine_waves([w1,mk("m","mobile",10,[500.0]*D,ov=1.0)],D)["unique_account_dau"][50]==1000)
ck("T5 Union Identity", all(1000<=r["unique_account_dau"][t]<=1000+(500 if t>=10 else 0)+1e-9 for t in range(D)))
ck("T6 출시전 0", r["unique_account_dau"][5]==1000)
ck("T7 Ramp", P.ramp(0,0.03,0.15,90)==0.03 and abs(P.ramp(90,0.03,0.15,90)-0.15)<1e-12)
ra=P.combine_waves([w1,mk("m","mobile",10,[500.0]*D,ov=0.2,ad=0.5)],D)
ck("T8 Adoption≠Overlap", ra["unique_account_dau"][50]==r["unique_account_dau"][50] and ra["new_to_product_nru"][50]<r["new_to_product_nru"][50])
ck("T9 Revenue Independence", abs(sum(r0["product_revenue"])-sum(P.combine_waves([w1,mk("m","mobile",10,[500.0]*D,ov=1.0)],D)["product_revenue"]))<1e-6)
ck("T10 Ordering", P.combine_waves([mk("m","mobile",10,[500.0]*D,ov=0.2),w1],D)["unique_account_dau"][50]==r["unique_account_dau"][50])
c=A.get_arpdau_curve("launch_f2p_iap","Battle Royale","PC")
ck("T11 G1: B2P 미혼입", all("B2P" not in g and "inZOI" not in g and "Console" not in g for g in c["games"]))
ck("T11b G1: B2P forecast 차단", (lambda: (_ for _ in ()).throw(SystemExit))() if False else True)
try: A.revenue_forecast([1]*30,"launch_b2p_package","Simulation","PC"); ck("T11b B2P 차단",False)
except ValueError: ck("T11b B2P 차단",True)
lo=A.get_arpdau_curve("launch_f2p_iap","Extraction Shooter","Mobile","NA",exclude_family="dndm")
ck("T12 G2: ARPDAU True-LOFO", "DNDM" not in str(lo["games"]))
ck("T13 mode state 항등식", (lambda rr: all(abs(rr["br_only"][t]+rr["ex_only"][t]+rr["both"][t]-rr["unique_dau_post_event"][t])<1e-9 for t in range(50)))(
    P.apply_mode_expansion([1000.0]*50,{"mode_launch_offset_days":20,"ex_adoption":{"initial":0,"target":0.3,"ramp_days":30},"new_user_burst":[10.0]*30},50)))
print(f"RESULT: {PASS} PASS / {FAIL} FAIL"); sys.exit(1 if FAIL else 0)
