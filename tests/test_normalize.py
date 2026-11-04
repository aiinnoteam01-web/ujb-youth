import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "collector"))

import normalize as n  # noqa: E402


def test_period_range():
    assert n.period("2026-11-03 ~ 2026-11-13") == ("2026-11-03", "2026-11-13")


def test_period_korean():
    assert n.period("2026년 12월 5일까지") == (None, "2026-12-05")


def test_compact_date():
    assert n.to_date("20261122") == "2026-11-22"


def test_always():
    assert n.is_always("상시신청") and n.is_always("예산 소진 시까지")


def test_ages_range():
    assert n.ages("만 19세 ~ 39세 청년") == (19, 39)


def test_ages_max():
    assert n.ages("만 34세 이하 구직자") == (None, 34)


def test_clean_html():
    assert n.clean("<p>지원&nbsp;내용</p>") == "지원 내용"


def test_bizinfo_sample():
    raw = {"pblancId": "PBLN_1", "pblancNm": "청년 창업 공고", "jrsdInsttNm": "중소벤처기업부",
           "reqstBeginEndDe": "2026-11-03 ~ 2026-11-13", "hashtags": "창업,청년", "pldirSportRealmLclasCodeNm": "창업",
           "pblancUrl": "https://www.bizinfo.go.kr/x", "inqireCo": 10}
    it = n.bizinfo(raw)
    assert it["end"] == "2026-11-13" and it["youth_hint"] and it["category"] == "창업"


def test_kstartup_youth_only():
    raw = {"pbanc_sn": 1, "biz_pbanc_nm": "청년 창업", "biz_trgt_age": "만 20세 미만,만 20세 이상 ~ 만 39세 이하",
           "pbanc_rcpt_end_dt": "20261122", "supt_regin": "경기"}
    it = n.kstartup(raw)
    assert it["youth_hint"] and it["end"] == "2026-11-22" and it["region_text"] == "경기"


def test_kstartup_all_ages_not_youth_only():
    raw = {"pbanc_sn": 2, "biz_pbanc_nm": "창업보육센터", "biz_trgt_age": "만 20세 미만,만 20세 이상 ~ 만 39세 이하,만 40세 이상"}
    assert not n.kstartup(raw)["youth_hint"]
