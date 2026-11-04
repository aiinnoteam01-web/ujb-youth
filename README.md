# ujb-youth · 의정부 청년모아

의정부시에 사는 청년(만 19~39세)이 신청할 수 있는 지원사업만 모아 보여 주는 정적 웹사이트입니다.
범위: **의정부시 사업 + 경기도 전체 대상 사업 + 전국 대상 사업** (다른 시·군 사업은 제외)

> 공공데이터 활용 사이트이며 의정부시 공식 사이트가 아닙니다. 신청 전에는 원문 공고를 확인하세요.

## 폴더 구조

| 폴더 | 내용 |
| --- | --- |
| `collector/` | 공공 API 수집 · 정리 스크립트 (Python) |
| `rules/` | 의정부 한정 지역 규칙, 청년 판단 규칙 (YAML) |
| `tests/` | 규칙 테스트 (pytest) |
| `data/` | 생성된 화면용 JSON (`data` 브랜치에 커밋) |
| `web/` | 화면 (정적 사이트) |
| `.github/workflows/` | 수집 · 점검 · 배포 자동화 |

## 처음 설정

1. API 활용신청 후 저장소 **Settings → Secrets and variables → Actions**에 키를 등록합니다.
   - `DATA_GO_KR_KEY` : 공공데이터포털 일반 인증키 (보조금24 · 기업마당 · K-Startup 공통, Encoding/Decoding 둘 다 가능)
   - `GG_DATA_KEY` : 경기데이터드림 인증키 (경기도 잡아바 지원정책)
2. **Settings → Pages → Source: GitHub Actions**를 선택합니다.
3. **Actions → collect → Run workflow**로 첫 수집을 실행합니다.

## 로컬 실행

```bash
pip install -r collector/requirements.txt
export DATA_GO_KR_KEY=... GG_DATA_KEY=...
cd collector && python collect.py && cd ..   # data/items.json, data/status.json 생성
cp -r data web/ && python -m http.server -d web 8000   # http://localhost:8000
pytest                           # 규칙 테스트
```

## 자료 출처 (현재 수집 중)

| API | 요청 주소 | 키 |
| --- | --- | --- |
| 행정안전부_대한민국 공공서비스(혜택) 정보 (보조금24) [15113968](https://www.data.go.kr/data/15113968/openapi.do) | `api.odcloud.kr/api/gov24/v3/serviceList` | `DATA_GO_KR_KEY` |
| 중소벤처기업부_중소기업 지원사업 공고 조회 (기업마당, 공공누리 제3유형) [15157820](https://www.data.go.kr/data/15157820/openapi.do) | `apis.data.go.kr/1421000/bizinfo/pblancBsnsService` | `DATA_GO_KR_KEY` |
| 창업진흥원_K-Startup 조회서비스 [15125364](https://www.data.go.kr/data/15125364/openapi.do) | `apis.data.go.kr/B552735/kisedKstartupService01/getAnnouncementInformation01` | `DATA_GO_KR_KEY` |
| 경기도 일자리 관련 지원정책 정보 (잡아바) | `openapi.gg.go.kr/JobFndtnSportPolocy` | `GG_DATA_KEY` |

### 아직 붙이지 않은 것

- 기획예산처_국고보조금 공모사업 상세 (`apis.data.go.kr/1051000/MoefOpenAPI2025`) — 승인은 됐지만 시험 호출에서 요청 변수 오류(`INVALID_REQUEST_PARAMETER_ERROR[340]`)가 나서, 명세서의 필수 변수를 확인한 뒤 추가합니다.
- 온통청년 청년정책 · 마이홈 · LH · 워크넷 · 공공기관 채용 · 내일배움카드 — 활용신청 후 추가합니다.

## 의정부 한정 규칙

`collector/filters.py`, `rules/region.yaml`

1. 소관기관에 '의정부'가 있으면 → 의정부시
2. 다른 시·군·도 소관이면 → 제외
3. 경기도 소관이면 대상 지역이 경기도 전역이거나 의정부를 포함할 때만 → 경기도
4. 중앙부처·공공기관은 대상 지역이 전국이거나 지역 제한이 없으면 → 전국, 다른 지역 한정이면 → 제외
5. 청년 판단: 대상 나이가 만 19~39세와 겹치거나 '청년'·'대학생'·'예비창업' 등이 있으면 청년 사업
6. 이미 마감된 공고는 뺍니다

## 추후 과제

- 의정부시청 · 청년센터 공고 수기 등록 (`manual/` YAML)
- 모바일 전용 화면
