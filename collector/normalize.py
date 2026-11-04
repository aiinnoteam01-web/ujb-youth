"""출처별 원본 한 건을 공통 형식으로 바꿉니다.

공통 형식(dict):
  id, source, kind("notice" 모집 공고 | "service" 공공서비스), title, agency,
  region_code, region_text, target_text, summary, apply_method, contact, url,
  start, end (YYYY-MM-DD 또는 None), period_text, always(상시 여부),
  age_min, age_max, youth_hint(출처가 청년 대상이라고 표시했는지), category, views
"""
from __future__ import annotations

import hashlib
import html
import re

CATEGORIES = ["일자리", "주거", "교육", "생활·복지", "창업", "문화·참여"]

_DATE = re.compile(r"(20\d{2})[.\-/년\s]*(\d{1,2})[.\-/월\s]*(\d{1,2})")
_COMPACT = re.compile(r"^(20\d{2})(\d{2})(\d{2})$")
_TAG = re.compile(r"<[^>]+>")
_AGE_RANGE = re.compile(r"(?:만\s*)?(\d{1,2})\s*세?\s*(?:이상)?\s*[~∼\-]\s*(?:만\s*)?(\d{1,2})\s*세")
_AGE_MAX = re.compile(r"(?:만\s*)?(\d{1,2})\s*세\s*(?:이하|미만)")
_AGE_MIN = re.compile(r"(?:만\s*)?(\d{1,2})\s*세\s*이상")


def clean(text) -> str:
    if not text:
        return ""
    text = html.unescape(_TAG.sub(" ", str(text)))
    return re.sub(r"[ \t ]+", " ", text).strip()


def to_date(text) -> str | None:
    if not text:
        return None
    s = str(text).strip()
    m = _COMPACT.match(s)
    if m:
        y, mo, d = m.groups()
    else:
        m = _DATE.search(s)
        if not m:
            return None
        y, mo, d = m.groups()
    mo, d = int(mo), int(d)
    if not (1 <= mo <= 12 and 1 <= d <= 31):
        return None
    return f"{y}-{mo:02d}-{d:02d}"


def period(text) -> tuple[str | None, str | None]:
    """'2026-11-03 ~ 2026-11-13' 같은 기간 문자열에서 시작·끝 날짜."""
    if not text:
        return None, None
    found = [to_date("".join(m)) for m in _DATE.findall(str(text))]
    found = [f for f in found if f]
    if not found:
        return None, None
    if len(found) == 1:
        return None, found[0]
    return found[0], found[-1]


def is_always(text) -> bool:
    return bool(text) and any(w in str(text) for w in ["상시", "수시", "연중", "예산 소진", "예산소진"])


def ages(text) -> tuple[int | None, int | None]:
    if not text:
        return None, None
    s = str(text)
    m = _AGE_RANGE.search(s)
    if m:
        lo, hi = int(m.group(1)), int(m.group(2))
        if lo <= hi:
            return lo, hi
    hi = _AGE_MAX.search(s)
    lo = _AGE_MIN.search(s)
    return (int(lo.group(1)) if lo else None), (int(hi.group(1)) if hi else None)


def _base(**kw) -> dict:
    item = {
        "id": "", "source": "", "kind": "notice", "title": "", "agency": "",
        "region_code": None, "region_text": "", "target_text": "", "summary": "",
        "apply_method": "", "contact": "", "url": "", "start": None, "end": None,
        "period_text": "", "always": False, "age_min": None, "age_max": None,
        "youth_hint": False, "category": "생활·복지", "views": 0,
    }
    item.update(kw)
    return item


# ---- 보조금24 (행정안전부 대한민국 공공서비스 정보) ----
GOV24_CATEGORY = {
    "일자리": "일자리", "주거·자립": "주거", "보육·교육": "교육",
    "생활안정": "생활·복지", "보건·의료": "생활·복지", "보호·돌봄": "생활·복지",
    "임신·출산": "생활·복지", "문화·환경": "문화·참여", "행정·안전": "생활·복지",
    "농림축산어업": "일자리",
}


def gov24(raw: dict) -> dict:
    target = clean(raw.get("지원대상"))
    deadline = clean(raw.get("신청기한"))
    start, end = period(deadline)
    lo, hi = ages(target)
    return _base(
        id=f"gov24:{raw.get('서비스ID')}", source="gov24", kind="service",
        title=clean(raw.get("서비스명")), agency=clean(raw.get("소관기관명")),
        target_text=target,
        summary=clean(raw.get("서비스목적요약")) or clean(raw.get("지원내용")),
        apply_method=clean(raw.get("신청방법")), contact=clean(raw.get("전화문의")),
        url=raw.get("상세조회URL") or "", start=start, end=end, period_text=deadline,
        always=is_always(deadline) or not end, age_min=lo, age_max=hi,
        category=GOV24_CATEGORY.get(clean(raw.get("서비스분야")), "생활·복지"),
        views=int(raw.get("조회수") or 0),
    )


# ---- 기업마당 (중소벤처기업부, 공공누리 제3유형: 내용 변경 금지) ----
def bizinfo(raw: dict) -> dict:
    period_text = clean(raw.get("reqstBeginEndDe"))
    start, end = period(period_text)
    realm = clean(raw.get("pldirSportRealmLclasCodeNm"))
    return _base(
        id=f"bizinfo:{raw.get('pblancId')}", source="bizinfo",
        title=clean(raw.get("pblancNm")), agency=clean(raw.get("jrsdInsttNm")),
        region_text=clean(raw.get("hashtags")), target_text=clean(raw.get("trgetNm")),
        summary=clean(raw.get("bsnsSumryCn")), apply_method=clean(raw.get("reqstMthPapersCn")),
        contact=clean(raw.get("refrncNm")), url=raw.get("pblancUrl") or "",
        start=start, end=end, period_text=period_text,
        always=is_always(period_text) or not end,
        youth_hint="청년" in (raw.get("hashtags") or ""),
        category="일자리" if realm == "인력" else "창업",
        views=int(raw.get("inqireCo") or 0),
    )


# ---- K-Startup (창업진흥원) ----
def kstartup(raw: dict) -> dict:
    age_text = clean(raw.get("biz_trgt_age"))
    # 40세 이상 구간이 없으면 청년 한정 사업으로 봄
    youth_only = bool(age_text) and "40세 이상" not in age_text
    region = clean(raw.get("supt_regin"))
    return _base(
        id=f"kstartup:{raw.get('pbanc_sn')}", source="kstartup",
        title=clean(raw.get("biz_pbanc_nm")) or clean(raw.get("intg_pbanc_biz_nm")),
        agency=clean(raw.get("pbanc_ntrp_nm")),
        region_text="전국" if region in ("", "전국") else region,
        target_text=" · ".join(x for x in [clean(raw.get("aply_trgt_ctnt")), clean(raw.get("biz_enyy"))] if x),
        summary=clean(raw.get("pbanc_ctnt")),
        apply_method=clean(raw.get("aply_mthd_onli_rcpt_istc")) or clean(raw.get("aply_mthd_etc_istc")),
        contact=" ".join(x for x in [clean(raw.get("biz_prch_dprt_nm")), clean(raw.get("prch_cnpl_no"))] if x),
        url=raw.get("detl_pg_url") or "",
        start=to_date(raw.get("pbanc_rcpt_bgng_dt")), end=to_date(raw.get("pbanc_rcpt_end_dt")),
        period_text=f"{raw.get('pbanc_rcpt_bgng_dt') or ''} ~ {raw.get('pbanc_rcpt_end_dt') or ''}",
        age_min=19 if youth_only else None, age_max=39 if youth_only else None,
        youth_hint=youth_only, category="창업",
    )


# ---- 경기도 일자리 지원정책 (경기도일자리재단 잡아바, 경기데이터드림) ----
JOBABA_CATEGORY = {"주거": "주거", "생활": "생활·복지", "기업": "창업"}


def jobaba(raw: dict) -> dict:
    div = clean(raw.get("DIV_NM"))
    start, end = to_date(raw.get("RECRUT_BEGIN_DE")), to_date(raw.get("RECRUT_END_DE"))
    title = clean(raw.get("PBLANC_TITLE"))
    return _base(
        id="jobaba:" + hashlib.sha1(f"{title}|{raw.get('INST_NM')}|{raw.get('RECRUT_BEGIN_DE')}".encode()).hexdigest()[:12],
        source="jobaba", title=title, agency=clean(raw.get("INST_NM")),
        region_text=clean(raw.get("REGION_NM")), target_text=div,
        url=raw.get("DETAIL_PAGE_URL") or "", start=start, end=end,
        period_text=f"{raw.get('RECRUT_BEGIN_DE') or ''} ~ {raw.get('RECRUT_END_DE') or ''}",
        always=not end, youth_hint="청년" in div or "청년" in title,
        category=next((v for k, v in JOBABA_CATEGORY.items() if k in div), "일자리"),
    )


NORMALIZERS = {"gov24": gov24, "bizinfo": bizinfo, "kstartup": kstartup, "jobaba": jobaba}
