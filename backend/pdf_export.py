# -*- coding: utf-8 -*-
"""
V14.1.0 1-Page PDF Export (피드백23 §2)
계산 책임: product_3y.py / 표현 책임: 이 파일 (result dict → A4 1페이지 렌더링만)
경량 원칙: 차트 이미지 없음, 외부 폰트 로딩 없음(CID 한글), 1페이지 고정, 계산 재실행 없음.
"""
from io import BytesIO
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import os

# 임베딩 가능한 TTF (CID 폰트는 뷰어에서 안 보임) — repo 동봉 우선, 시스템 fallback
_FONT_DIRS = [os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts"),
              "/usr/share/fonts/truetype/nanum"]
for _d in _FONT_DIRS:
    _p = os.path.join(_d, "NanumGothic.ttf")
    if os.path.exists(_p):
        pdfmetrics.registerFont(TTFont("NanumGothic", _p))
        _pb = os.path.join(_d, "NanumGothicBold.ttf")
        if os.path.exists(_pb):
            pdfmetrics.registerFont(TTFont("NanumGothicBold", _pb))
        break
F = "NanumGothic"

def _억(v):
    try:
        return f"{v/1e8:,.0f}억"
    except Exception:
        return "-"

def _style(sz, bold=False, color=colors.HexColor("#111827"), leading=None):
    return ParagraphStyle("s", fontName=F, fontSize=sz, textColor=color,
                          leading=leading or sz * 1.45)

TBL_BASE = [
    ("FONTNAME", (0, 0), (-1, -1), F),
    ("FONTSIZE", (0, 0), (-1, -1), 8),
    ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#e5e7eb")),
    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eef2ff")),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
]

def build_one_page_projection_pdf(result: dict, official: dict = None) -> bytes:
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=12*mm, bottomMargin=10*mm,
                            leftMargin=14*mm, rightMargin=14*mm)
    el = []
    t = result["total"]
    hl = result.get("horizon_labels", {})
    sid = result["assumption_set"]["assumption_set_id"]

    # ① Headline
    el.append(Paragraph(f"GW {hl.get('title','Launch Projection')} — Conditional Projection", _style(15, color=colors.HexColor("#312e81"))))
    el.append(Paragraph("Product Gate achievement conditional · This is not a sales commitment"
                        f" · Assumption Set: {sid}", _style(7.5, color=colors.HexColor("#6b7280"))))
    el.append(Spacer(1, 4*mm))

    # ② 핵심 숫자 카드
    ann = result["annual_summary"]
    kpi = Table([
        ["Planning Case Gross", "Platform Net (×0.70)", "Avg Unique DAU", "Peak Unique DAU", "Unique NRU"],
        [_억(t["gross_krw"]), _억(t.get("platform_net_krw", t["net_krw"])),
         f"{t['avg_unique_dau']/1e4:.1f}만", f"{t['peak_unique_dau']/1e4:.1f}만",
         f"{sum(a['unique_nru'] for a in ann)/1e4:,.0f}만"]], colWidths=[36*mm]*5)
    kpi.setStyle(TableStyle(TBL_BASE + [("FONTSIZE", (0, 1), (-1, 1), 11),
        ("TEXTCOLOR", (0, 1), (-1, 1), colors.HexColor("#312e81")), ("ALIGN", (0, 0), (-1, -1), "CENTER")]))
    el.append(kpi); el.append(Spacer(1, 3.5*mm))

    # ③ 시나리오 3본
    if official:
        rows = [["Scenario", "D1", "Total Gross", "Avg uDAU", "Peak uDAU", "의미"]]
        for name, meaning in [("worst", "Gate 하단"), ("normal", "Planning Case"), ("best", "Gate 상단")]:
            sc = official["scenarios"][name]
            rows.append([name.capitalize(), {"worst": "40%", "normal": "50%", "best": "60%"}[name],
                         _억(sc["total"]["gross_krw"]), f"{sc['total']['avg_unique_dau']/1e4:.0f}만",
                         f"{sc['total']['peak_unique_dau']/1e4:.0f}만", meaning])
        tb = Table(rows, colWidths=[24*mm, 16*mm, 34*mm, 26*mm, 26*mm, 54*mm])
        st = TBL_BASE + [("BACKGROUND", (0, 2), (-1, 2), colors.HexColor("#e0e7ff"))]
        tb.setStyle(TableStyle(st))
        el.append(Paragraph("Scenario Range (D1만 변경, 타 변수 고정)", _style(10, color=colors.HexColor("#374151"))))
        el.append(Spacer(1, 1.5*mm)); el.append(tb); el.append(Spacer(1, 3.5*mm))

    # ④ Hurdle Coverage
    hc = (result.get("strategic_hurdle_coverage") or {}).get("rows", [])
    if hc:
        rows = [["Period", "Projection", "Hurdle", "Coverage"]]
        for r in hc:
            rows.append([r["period"], _억(r["projection_krw"]), _억(r["hurdle_krw"]), f"{r['coverage_pct']}%"])
        tb = Table(rows, colWidths=[30*mm, 40*mm, 40*mm, 30*mm])
        tb.setStyle(TableStyle(TBL_BASE))
        el.append(Paragraph("Strategic Hurdle Coverage (Reference only — 계산 무영향)", _style(10, color=colors.HexColor("#374151"))))
        el.append(Spacer(1, 1.5*mm)); el.append(tb)
        el.append(Paragraph("Key Issue: Y1 ramp speed, not long-term total only.", _style(8.5, color=colors.HexColor("#b45309"))))
        el.append(Spacer(1, 3.5*mm))

    # ⑤ Projection Bridge (상위 5행)
    br = result.get("projection_bridge")
    if br:
        rows = [["Step", "Cumulative", "Δ", "해석"]]
        for r in br["rows"][:6]:
            rows.append([r["step"][:44], _억(r["cumulative_gross_krw"]),
                         (f"{r['delta_krw']/1e8:+,.0f}억" if r["delta_krw"] else "—"), (r.get("why") or "")[:38]])
        tb = Table(rows, colWidths=[74*mm, 26*mm, 24*mm, 56*mm])
        tb.setStyle(TableStyle(TBL_BASE + [("FONTSIZE", (0, 0), (-1, -1), 7)]))
        el.append(Paragraph("Projection Bridge — 왜 이 숫자인지 (Ordered)", _style(10, color=colors.HexColor("#374151"))))
        el.append(Spacer(1, 1.5*mm)); el.append(tb); el.append(Spacer(1, 3.5*mm))

    # ⑥ Key Risks / Validation
    el.append(Paragraph("Key Risks / Validation Plan", _style(10, color=colors.HexColor("#374151"))))
    el.append(Spacer(1, 1.5*mm))
    risks = [["변수", "현재", "검증 방법"],
             ["D1 50%", "[Gate] assumption (peer p98)", "Alpha / CBT cohort 실측으로 교체 예정"],
             ["Prereg activation 40%", "[Evidence-informed]", "사전예약→실유입 개인단위 전환 추적"],
             ["마지막 해 tail", "[Unvalidated] 100% extrapolated", "LiveOps / Return AU 실측 필요 (V14.3)"]]
    tb = Table(risks, colWidths=[42*mm, 62*mm, 76*mm])
    tb.setStyle(TableStyle(TBL_BASE + [("FONTSIZE", (0, 0), (-1, -1), 7.5)]))
    el.append(tb)

    doc.build(el)
    return buf.getvalue()
