# 청약지도 (fourteam)

네이버 지도 위에 수도권 아파트 분양·임대 공고를 호갱노노/네이버부동산처럼 보여주는 웹앱.

```bash
npm install
npm run dev     # http://localhost:5173
```

## 준비물

`.env` 에 네이버 클라우드 플랫폼 Maps 키가 필요하다 (`.env.example` 참고).

| 키                          | 쓰이는 곳                     |
| --------------------------- | ----------------------------- |
| `VITE_NAVER_MAP_CLIENT_ID`  | 브라우저 - Web Dynamic Map    |
| `NAVER_MAP_CLIENT_SECRET`   | 스크립트 - Geocoding (커밋 X) |

NCP 콘솔 > Maps > 애플리케이션에서 **Web Dynamic Map / Geocoding** 을 모두 켜고,
**웹 서비스 URL** 에 `http://localhost:5173` 을 등록해야 지도가 뜬다.
(등록이 안 돼 있으면 지도 자리에 안내 화면이 뜬다)

## 데이터 파이프라인

`notices.json` 에는 좌표도 주소도 없다. 그래서 두 단계로 만든다.

```bash
npm run data:build      # = data:addresses + data:geocode
```

1. **`scripts/extract-addresses.mjs`** — `공고문/*.pdf` 에서 소재지를 추출한다.
   입주자모집공고는 거의 예외 없이 `■ 공급위치 : 경기도 ○○시 ○○동 123-4번지 일원`
   형태의 줄을 갖는다. PDF 텍스트는 글자 단위로 쪼개지고 순서도 뒤섞여 나오므로
   (`…중림동번지일원:157-2`) 공백을 지운 문자열에서 라벨 뒤 구간을 잘라내고 주소와
   지번을 따로 복원한다. 라벨이 없으면 문서 전체에서 "공고의 시·군·구와 일치하는
   지번 주소" 중 최빈값을 쓴다(시행사·견본주택 주소가 섞이는 걸 막는 필터).
   파일명이 `YYYY-MM-DD_지역_단지명.pdf` 라서 `notices.json` 과 제목으로 조인된다.
   → `scripts/addresses.json`

2. **`scripts/geocode.mjs`** — 주소를 네이버 Geocoding API 로 좌표화한다.
   Secret 이 필요해 브라우저에서 못 부르므로 여기서 한 번만 돌려 정적 JSON 으로 떨군다.
   실패하면 넓은 쪽으로 후퇴하면서(지번 → 읍면동 → 구 → 시군구 → 시도) 첫 성공을 쓰고,
   어느 단계였는지 `precision` 에 남긴다. 같은 좌표에 여러 건이 겹치면 35m 정도
   흩어 놓는다. 호출 결과는 `scripts/.geocode-cache.json` 에 캐시된다.
   → `src/data/notices.geo.json` (앱이 import 하는 최종 데이터)

현재 결과: **40건 전부 좌표 확보 / 그중 27건은 지번 단위**.
`precision` 이 `lot` 이 아닌 건은 화면에 "위치 ○○ 단위 근사" 로 표시한다.

## 구조

```
src/
  lib/naverMaps.js     지도 SDK 로더 (ncpKeyId ↔ ncpClientId 양쪽 시도)
  lib/notices.js       데이터 가공 - D-day·금액 포맷·필터
  components/
    MapView.jsx        지도, 커스텀 마커, 줌 단계별 지역 묶음
    FilterBar.jsx      검색 / 유형·지역·가격·특별공급 필터
    NoticeCard.jsx     목록 카드
    DetailPanel.jsx    상세 - 일정, 자격, 특별공급, 공고문 PDF
vite.config.js         `공고문/` PDF 를 복사 없이 서빙하는 플러그인
asis/                  기존 단일 HTML 앱 (내집매칭) — 아래 참고
```

## 기존 앱(asis)의 "공고 지도" 탭

`asis/내집매칭 (1).html` 은 빌드 없이 도는 단일 HTML 이고 `내집매칭 실행.bat` →
`serve.ps1`(PowerShell HttpListener) 로 띄운다. 여기에 **공고 지도** 탭을 추가했다.

- 데이터: 같은 폴더의 `notices.geo.json` 을 직접 읽는다. `npm run data:geocode` 가
  `src/data/` 와 `asis/` 양쪽에 같은 파일을 써 준다.
- 지도 SDK 는 탭을 **처음 열 때** 로드한다. 숨겨진 상태에서 지도를 만들면 크기가 0이 되므로
  탭 활성화 시점에 초기화하고, 다시 돌아오면 `map.refresh(true)` 로 타일만 다시 그린다.
- `serve.ps1` 은 두 군데만 손봤다: `.pdf` MIME 추가, 그리고 `공고문/` 으로 시작하는 요청에
  한해 상위 폴더까지 찾아보기(45MB PDF 를 복사하지 않으려고). 다른 경로는 상위 폴더를
  보지 않으므로 `.env` 같은 파일은 노출되지 않는다.
- HTML 최상단에 `<meta charset="utf-8">` 을 추가했다. 원래 없어서 charset 을 안 붙이는
  경로(파일 더블클릭 등)로 열면 한글이 깨졌다.

> **중요** — 네이버 지도는 요청 출처(origin)를 대조한다. NCP 콘솔 > Maps > fourteam 의
> **웹 서비스 URL** 에 `http://localhost:5173`(Vite) 과 `http://localhost:8791`(bat 실행)을
> 모두 등록해야 한다. `serve.ps1` 은 8791 이 사용 중이면 8792, 8793… 으로 올라가므로
> 서버 창을 닫지 않고 여러 번 실행했다면 포트가 밀린다. 등록되지 않은 포트로 열면
> 지도 자리에 현재 주소를 알려 주는 안내가 뜬다.

`asis` 의 **청약 매칭** 탭은 여전히 내장 샘플 12건을 쓴다(같은 폴더에 `notices.json` 이
없어 자동 로드가 실패). 실데이터 40건을 쓰려면 `notices.json` 을 `asis/` 에 복사하면 되는데,
그 탭의 `evaluate()` 가 `incomeLimit: null`(기관추천·노부모부양·일반공급)을 소득 0원 제한으로
처리해서 해당 유형이 전부 탈락한다. 먼저 그 조건 검사를 고치는 편이 좋다.

## 알아둘 것

- **분양가는 공고문에서 자동 추출한 값**이라 표 형식이 다른 공고에서는 최저/최고가
  실제 주택형 가격이 아닐 수 있다. 상세 화면에서 원문 PDF 로 바로 확인할 수 있게 했다.
- LH 매입임대·든든전세처럼 "관할 단위" 공고(n51~n57)는 단지가 특정되지 않아
  관할 시·군 중심에 찍힌다.
- 오늘(2026-09-15) 기준 접수중 7건 / 마감 21건 / 일정 미기재 12건.
