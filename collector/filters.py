"""의정부 한정 지역 판단과 청년 판단 규칙.

classify(item) -> "uijeongbu" | "gyeonggi" | "national" | "exclude" | "review"
is_youth(item) -> bool

item 은 출처와 상관없이 아래 키를 가진 dict 로 정리된 상태여야 합니다.
  agency       소관(주관)기관명       예) "경기도 의정부시", "고용노동부"
  region_code  법정 시군구코드(있으면) 예) "41150"
  region_text  대상 지역 설명          예) "경기도 전역", "전국", ""
  title        사업명
  target_text  지원 대상 설명
  age_min, age_max  대상 나이(없으면 None)
"""
from __future__ import annotations

from pathlib import Path

import yaml

RULES_DIR = Path(__file__).resolve().parent.parent / "rules"


def _load(name: str) -> dict:
    with open(RULES_DIR / name, encoding="utf-8") as f:
        return yaml.safe_load(f)


REGION = _load("region.yaml")
YOUTH = _load("youth.yaml")


def _has_any(text: str, words) -> bool:
    return any(w in text for w in words)


def _mentions_other_gyeonggi_city(text: str) -> bool:
    return _has_any(text, REGION["gyeonggi_cities"])


def classify(item: dict) -> str:
    agency = item.get("agency") or ""
    region_text = item.get("region_text") or ""
    body = " ".join([region_text, item.get("target_text") or "", item.get("title") or ""])
    ujb = REGION["uijeongbu"]

    # 1. 의정부시 사업
    if item.get("region_code") == ujb["code"] or _has_any(agency, ujb["names"]):
        return "uijeongbu"

    is_gyeonggi_agency = _has_any(agency, REGION["gyeonggi"]["names"])

    # 2. 다른 시·군·도 사업은 제외
    if _mentions_other_gyeonggi_city(agency):
        return "exclude"
    if not is_gyeonggi_agency and _has_any(agency, REGION["other_provinces"]):
        return "exclude"

    # 3. 경기도 사업: 경기도 전역이거나 의정부 포함일 때만
    if is_gyeonggi_agency:
        if _has_any(body, ujb["names"]):
            return "gyeonggi"
        if _mentions_other_gyeonggi_city(region_text):
            return "exclude"
        return "gyeonggi"

    # 4. 중앙부처·공공기관·대학 등: 대상 지역(region_text)으로 판단
    if _has_any(body, REGION["exclude_words"]):
        return "exclude"
    if region_text.strip() in ("", "전국") or "전국" in region_text:
        return "national"
    if _has_any(region_text, ujb["names"]):
        return "uijeongbu"
    if _has_any(region_text, REGION["gyeonggi"]["names"]):
        # 경기 대상이지만 다른 시·군에서만 하는 사업은 제외
        title = item.get("title") or ""
        if _mentions_other_gyeonggi_city(title + " " + region_text):
            return "exclude"
        return "gyeonggi"
    if _has_any(region_text, REGION["other_provinces"]) or _mentions_other_gyeonggi_city(region_text):
        return "exclude"
    # 지역 이름이 전혀 없으면 지역 제한이 없는 사업으로 봄
    return "national"


def is_youth(item: dict) -> bool:
    if item.get("youth_hint"):
        return True
    lo, hi = item.get("age_min"), item.get("age_max")
    cfg = YOUTH["age"]
    if hi is not None and hi <= 18:
        return False
    if lo is not None and lo >= 50:
        return False
    if lo is not None or hi is not None:
        lo = lo if lo is not None else 0
        hi = hi if hi is not None else 200
        if lo <= cfg["max"] and hi >= cfg["min"]:
            return True
    text = " ".join([item.get("title") or "", item.get("target_text") or ""])
    return _has_any(text, YOUTH["keywords"])
