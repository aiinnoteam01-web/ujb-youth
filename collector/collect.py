"""공공 API를 수집해 의정부 청년 사업만 남긴 data/items.json 과 data/status.json 을 만듭니다.

- 인증키는 환경변수(GitHub Actions Secrets)에서만 읽습니다.
- 한 출처가 실패하면 그 출처는 이전 결과를 그대로 쓰고 status.json 에 실패로 기록합니다.
"""
from __future__ import annotations

import json
import os
import sys
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import unquote

import requests

from filters import classify, is_youth
from normalize import NORMALIZERS

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
KST = timezone(timedelta(hours=9))
UA = {"User-Agent": "ujb-youth-collector/1.0"}
MAX_PAGES = 30


def key(env: str) -> str:
    value = os.environ.get(env, "").strip()
    if not value:
        raise RuntimeError(f"환경변수 {env} 가 없습니다")
    # 포털의 'Encoding' 키를 넣어도 동작하도록 한 번 풀어 둠 (requests 가 다시 인코딩)
    return unquote(value) if "%" in value else value


def get(url: str, params: dict) -> requests.Response:
    for attempt in range(3):
        try:
            r = requests.get(url, params=params, headers=UA, timeout=40)
            r.raise_for_status()
            return r
        except requests.RequestException:
            if attempt == 2:
                raise
            time.sleep(3 * (attempt + 1))
    raise AssertionError


# ---- 출처별 수집 ----

def fetch_gov24() -> list[dict]:
    url = "https://api.odcloud.kr/api/gov24/v3/serviceList"
    k, rows, page = key("DATA_GO_KR_KEY"), [], 1
    while page <= MAX_PAGES:
        body = get(url, {"serviceKey": k, "page": page, "perPage": 1000}).json()
        data = body.get("data") or []
        rows.extend(data)
        if not data or page * 1000 >= int(body.get("totalCount") or 0):
            break
        page += 1
    return rows


def fetch_bizinfo() -> list[dict]:
    url = "https://apis.data.go.kr/1421000/bizinfo/pblancBsnsService"
    k, rows, page = key("DATA_GO_KR_KEY"), [], 1
    while page <= MAX_PAGES:
        body = get(url, {"serviceKey": k, "dataType": "json", "numOfRows": 500, "pageNo": page}).json()
        b = body.get("response", body).get("body", {})
        items = (b.get("items") or {})
        items = items.get("item", items) if isinstance(items, dict) else items
        if isinstance(items, dict):
            items = [items]
        rows.extend(items or [])
        if not items or page * 500 >= int(b.get("totalCount") or 0):
            break
        page += 1
    return rows


def _kstartup_xml(text: str) -> tuple[list[dict], int]:
    root = ET.fromstring(text)
    rows = []
    for item in root.iter("item"):
        rows.append({c.get("name"): (c.text or "") for c in item.iter("col")})
    total = int((root.findtext(".//totalCount") or "0").strip() or 0)
    return rows, total


def fetch_kstartup() -> list[dict]:
    url = "https://apis.data.go.kr/B552735/kisedKstartupService01/getAnnouncementInformation01"
    k, rows, page = key("DATA_GO_KR_KEY"), [], 1
    while page <= MAX_PAGES:
        params = {"serviceKey": k, "page": page, "perPage": 500, "returnType": "json",
                  "cond[rcrt_prgs_yn::EQ]": "Y"}
        r = get(url, params)
        try:
            body = r.json()
            data, total = body.get("data") or [], int(body.get("totalCount") or 0)
        except ValueError:  # JSON 이 아니면 XML 로 읽음
            data, total = _kstartup_xml(r.text)
        rows.extend(data)
        if not data or page * 500 >= total:
            break
        page += 1
    return [r for r in rows if (r.get("rcrt_prgs_yn") or "Y") == "Y"]


def fetch_jobaba() -> list[dict]:
    url = "https://openapi.gg.go.kr/JobFndtnSportPolocy"
    k, rows, page = key("GG_DATA_KEY"), [], 1
    while page <= MAX_PAGES:
        body = get(url, {"KEY": k, "Type": "json", "pIndex": page, "pSize": 1000}).json()
        blocks = body.get("JobFndtnSportPolocy")
        if not blocks:  # 결과 없음 또는 오류
            result = body.get("RESULT", {})
            if result.get("CODE") not in (None, "INFO-200"):
                raise RuntimeError(f"{result.get('CODE')} {result.get('MESSAGE')}")
            break
        total = blocks[0]["head"][0].get("list_total_count", 0)
        data = blocks[1].get("row", []) if len(blocks) > 1 else []
        rows.extend(data)
        if not data or page * 1000 >= int(total):
            break
        page += 1
    return rows


FETCHERS = {"gov24": fetch_gov24, "bizinfo": fetch_bizinfo, "kstartup": fetch_kstartup, "jobaba": fetch_jobaba}
SOURCE_NAMES = {"gov24": "보조금24", "bizinfo": "기업마당", "kstartup": "K-Startup", "jobaba": "경기도 잡아바"}


def keep(item: dict, today: str) -> bool:
    if item["end"] and item["end"] < today and not item["always"]:
        return False  # 이미 마감
    item["scope"] = classify(item)
    return item["scope"] not in ("exclude",) and is_youth(item)


def main() -> int:
    DATA.mkdir(exist_ok=True)
    today = datetime.now(KST).strftime("%Y-%m-%d")
    path = DATA / "items.json"
    previous = json.loads(path.read_text(encoding="utf-8")).get("items", []) if path.exists() else []
    items, status = [], {}

    for sid, fetch in FETCHERS.items():
        started = time.time()
        try:
            raw = fetch()
            rows = [NORMALIZERS[sid](r) for r in raw]
            kept = [r for r in rows if keep(r, today)]
            items.extend(kept)
            status[sid] = {"name": SOURCE_NAMES[sid], "ok": True, "fetched": len(rows), "kept": len(kept),
                           "seconds": round(time.time() - started, 1)}
        except Exception as e:  # 한 출처 실패가 전체를 멈추지 않게
            old = [i for i in previous if i.get("source") == sid]
            items.extend(old)
            status[sid] = {"name": SOURCE_NAMES[sid], "ok": False, "error": str(e)[:200], "kept": len(old)}

    # 같은 사업이 여러 출처에 있으면 제목+기관으로 하나만 남김
    seen, unique = set(), []
    for it in items:
        sig = (it["title"].replace(" ", ""), it["agency"].replace(" ", ""))
        if sig in seen:
            continue
        seen.add(sig)
        unique.append(it)

    now = datetime.now(KST).isoformat(timespec="minutes")
    path.write_text(json.dumps({"updated_at": now, "items": unique}, ensure_ascii=False, separators=(",", ":")),
                    encoding="utf-8")
    (DATA / "status.json").write_text(json.dumps({"updated_at": now, "sources": status}, ensure_ascii=False, indent=1),
                                      encoding="utf-8")
    print(json.dumps(status, ensure_ascii=False, indent=1))
    print(f"총 {len(unique)}건")
    return 0 if any(s["ok"] for s in status.values()) else 1


if __name__ == "__main__":
    sys.exit(main())
