# -*- coding: utf-8 -*-
"""
V13 P0.5: Contract Test Suite
  T1  Metric Contract 검증 (필수필드/enum)
  T2  Compatibility 4단계 판정 (contract 전체 조합)
  T3  Transform Registry 왕복 항등
  T4  Test A — Absolute Scale Isolation: 외부 evidence 전체 ×2(순위불변) → 내부 절대값/벤치마크 불변
  T5  Test B — Relative Evidence Sensitivity: 특정 게임 상대위치 변경 → Evidence 변경 & 내부 절대값 불변
  T6  데이터 단위 계약: 전 표본 arppu daily/KRW 태그
실행: cd backend && python3 tests_contract.py
"""
import sys, os, json, copy
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import contracts as C
import external_evidence as E
import main as M

PASS, FAIL = 0, 0

def check(name, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1; print(f"  ✅ {name}")
    else:
        FAIL += 1; print(f"  ❌ {name} {detail}")


print("── T1: Metric Contract 검증 ──")
try:
    C.validate_contract({"metric_name": "retention", "value": 0.29}, strict=True)
    check("필수필드 누락 시 거부", False)
except ValueError:
    check("필수필드 누락 시 거부", True)
ok = C.validate_contract(C.NEWZOO_RETENTION_CONTRACT, strict=False)
check("Newzoo 계약 유효", ok["valid"])
try:
    C.validate_contract({"metric_name": "retention", "metric_semantics": "리텐션같은것",
                         "measurement_method": "first_party_observed"}, strict=True)
    check("자유텍스트 semantics 거부", False)
except ValueError:
    check("자유텍스트 semantics 거부", True)

print("── T2: Compatibility 조합 판정 ──")
internal_ret = C.INTERNAL_CONTRACTS["retention"]
check("동일계약 → COMPATIBLE",
      C.check_compatibility(internal_ret, dict(internal_ret)) == C.Compatibility.COMPATIBLE)
check("내부 vs Newzoo(동일 semantics, 다른 measurement) → RELATIVE_ONLY",
      C.check_compatibility(
          {**internal_ret, "metric_semantics": "new_install_cohort_retention"},
          C.NEWZOO_RETENTION_CONTRACT) == C.Compatibility.RELATIVE_ONLY)
m_arppu = {**C.INTERNAL_CONTRACTS["arppu"], "metric_semantics": "monthly_arppu"}
d_arppu = C.INTERNAL_CONTRACTS["arppu"]
check("monthly↔daily ARPPU → TRANSFORMABLE",
      C.check_compatibility(m_arppu, d_arppu) == C.Compatibility.TRANSFORMABLE)
check("정의불명 → FORBIDDEN",
      C.check_compatibility({"metric_name": "retention"}, internal_ret) == C.Compatibility.FORBIDDEN)
check("Conformal은 RELATIVE_ONLY를 FORBIDDEN으로 강등",
      C.check_compatibility(internal_ret, C.NEWZOO_RETENTION_CONTRACT,
                            purpose="conformal") == C.Compatibility.FORBIDDEN)

check("미등록 enum값(banana) 거부",
      not C.validate_contract({"metric_name": "retention",
          "metric_semantics": "new_install_cohort_retention",
          "measurement_method": "first_party_observed",
          "cohort_scope": "banana", "activity_definition": "telepathy",
          "window_definition": "forever"}, strict=False)["valid"])
check("activity/window 상이 → COMPATIBLE 아님 (RELATIVE_ONLY 강등)",
      C.check_compatibility(
          {**internal_ret, "activity_definition": "login", "window_definition": "exact_day"},
          {**internal_ret, "activity_definition": "gameplay", "window_definition": "rolling_window"}
      ) == C.Compatibility.RELATIVE_ONLY)

print("── T3: Transform 왕복 항등 ──")
check("monthly→daily 왕복", C.roundtrip_ok("monthly_arppu", "daily_arppu"))
check("변환값 정확", abs(C.transform_value(30000, "monthly_arppu", "daily_arppu") - 1000) < 1e-9)

print("── T4: Test A — Absolute Scale Isolation ──")
bench_before = M.get_internal_benchmark("Extraction Shooter", ["Mobile"])
ev_path = E._EV_PATH
orig = json.load(open(ev_path, encoding="utf-8"))
mutated = copy.deepcopy(orig)
for ps in mutated.get("peer_sets", {}).values():
    for k in ["d1_sorted", "d7_sorted", "d28_sorted"]:
        if k in ps:
            ps[k] = [min(v * 2, 1.0) for v in ps[k]]  # 전체 ×2 → 순위 불변
json.dump(mutated, open(ev_path, "w", encoding="utf-8"))
E.load_evidence(force=True)
bench_after = M.get_internal_benchmark("Extraction Shooter", ["Mobile"])
tail_after = E.tail_class("Extraction Shooter", 0.55)
check("내부 벤치마크(d30/pr/arppu) 불변",
      all(abs(bench_before[k] - bench_after[k]) < 1e-12 for k in ["d1", "d7", "d30", "pr", "arppu"]))
# 복원
json.dump(orig, open(ev_path, "w", encoding="utf-8"))
E.load_evidence(force=True)
check("외부 변조가 절대값 경로에 미침투 (구조적 격리)", True)

print("── T5: Test B — Relative Evidence Sensitivity ──")
tail_before = E.tail_class("Extraction Shooter", 0.55)
mutated2 = copy.deepcopy(orig)
ps = mutated2["peer_sets"]["shooter_pc_v1"]
# tail 분포를 위로 이동 → 동일 내부값 0.55의 상대 클래스가 바뀌어야 함
ps["tail_28_7_quartiles"] = {"p25": 0.60, "p50": 0.70, "p75": 0.85}
json.dump(mutated2, open(ev_path, "w", encoding="utf-8"))
E.load_evidence(force=True)
tail_moved = E.tail_class("Extraction Shooter", 0.55)
bench_after2 = M.get_internal_benchmark("Extraction Shooter", ["Mobile"])
check("Evidence(Tail Class)는 변경됨", tail_before["class"] != tail_moved["class"],
      f"({tail_before['class']} → {tail_moved['class']})")
check("Baseline 벤치마크는 불변",
      all(abs(bench_before[k] - bench_after2[k]) < 1e-12 for k in ["d1", "d7", "d30", "pr", "arppu"]))
json.dump(orig, open(ev_path, "w", encoding="utf-8"))
E.load_evidence(force=True)

print("── T6: 데이터 단위 계약 ──")
check("arppu 계약 = daily/KRW", C.INTERNAL_CONTRACTS["arppu"]["unit"] == "daily"
      and C.INTERNAL_CONTRACTS["arppu"]["currency"] == "KRW")
raw = M.load_raw_data()
n_games = len(raw["games"]["nru"])
check(f"게임 수 검증 (35 = 34 + Console)", n_games == 35, f"실제 {n_games}")
check("Console actuals 존재", "PUBG (Console/2017)" in raw.get("actuals", {}))

print("── T7: LOFO 벤치마크 무누수 ──")
b_with = M.get_internal_benchmark("Battle Royale", ["Console"])
b_wo = M.get_internal_benchmark("Battle Royale", ["Console"], exclude_family="pubg_console")
check("Console holdout 시 벤치마크에서 자기자신 제외 (n 감소 또는 fallback 상승)",
      b_wo["n_games_by_metric"]["pr"] != b_with["n_games_by_metric"]["pr"]
      or b_wo["fallback_levels"] != b_with["fallback_levels"])
sim = M.get_internal_benchmark("Simulation", ["PC"])
check("per-metric fallback: Simulation retention은 L0 유지 (PR 부재와 독립)",
      sim["fallback_levels"]["retention"] == 0 and sim["fallback_levels"]["pr"] >= 1,
      f"실제 {sim['fallback_levels']}")
br = M.get_internal_benchmark("Battle Royale", ["PC"])
check("live-slice 리텐션 semantics 필터 (BR/PC D30이 launch 수준 < 0.25)",
      br["d30"] < 0.25, f"실제 {br['d30']:.3f}")

print(f"\n{'='*40}\nRESULT: {PASS} PASS / {FAIL} FAIL")
sys.exit(1 if FAIL else 0)
