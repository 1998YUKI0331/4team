# 청약지도 (fourteam)

네이버 지도 위에 수도권 아파트 분양·임대 공고를 호갱노노/네이버부동산처럼 보여 주는 웹앱.
**Vue 3 + Vite** 로 만들고 **Docker 이미지 한 장**으로 배포한다(Railway GitHub 연동 기준).

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/ 생성
```

## 화면 구성

지도가 메인이고, 기존 단일 HTML 앱(`asis/내집매칭 (1).html`)에 있던 기능을 왼쪽 패널로 합쳤다.

```
┌ 상단바 ─ 공고 40건 · 접수중 n건 · 기준일 · 지도영역 동기화 ────────────┐
│ 사이드바(392px)            │ 지도(메인)                               │
│  [공고] [내 조건] [커뮤니티] │   커스텀 마커 / 줌 단계별 지역 묶음         │
│  검색·필터 칩               │   확대·축소, 전체보기, 범례               │
│  공고 카드 목록             │        └ 단지 클릭 → 상세 패널            │
└───────────────────────────┴──────────────────────────────────────────┘
```

- **공고 탭** — 검색 / 접수중 / 공급유형 / 지역 / 가격 / 특별공급 칩 필터 + 카드 목록.
  지도를 움직이면 화면 안쪽 공고만 목록에 남는다(상단바에서 끌 수 있음).
- **내 조건 탭** — 기존 앱의 "내 조건 입력 → 자격 확인"을 그대로 옮겼다. 켜면 카드·마커에
  `특별공급 가능 / 자격 확인 필요 / 일반공급 가능` 이 표시되고, 카드의 *왜 내 조건에 맞나요?* 에
  판단 근거가 나온다. `충족만 보기` 로 목록과 지도를 한 번에 좁힐 수 있다.
- **커뮤니티 탭** — 단지별로 쓰인 글을 최신순으로 모아 보여 준다. 글을 누르면 그 단지 상세로 간다.

### 옮기면서 고친 것

기존 `evaluate()` 는 `incomeLimit: null`(기관추천·노부모부양·일반공급)을 **소득 0원 제한**으로
처리해서 실데이터 40건을 넣으면 결과가 늘 0건이었다. `null` 은 "공고문 확인"이라는 뜻이므로
숫자 비교를 건너뛰고 `확인 필요` 로 표시한다. 마감일이 없는 공고(12건)에서 날짜 계산이 깨지던
부분도 상태 계산 한 곳으로 모았다. 자동으로 확정할 수 없는 조건(기관추천 대상 여부, 소득 미기재)은
탈락시키지 않고 `자격 확인 필요` 로 남긴다.

## 지역 커뮤니티 = 단지 상세의 한 탭

별도 탭이던 커뮤니티를 **공고(단지)에 매달았다**. 단지를 고르면 상세 패널에
`공고 정보 / 지역 커뮤니티` 탭이 생긴다.

- **넓은 화면(≥1180px)** — 상세 패널 안의 탭으로 연다.
- **좁은 화면** — 패널 폭이 모자라므로 **레이어 팝업**(가운데 다이얼로그, 모바일은 바텀시트)으로 띄운다.
  창 크기를 바꾸면 열려 있던 커뮤니티가 탭 ↔ 팝업으로 자동으로 옮겨 간다.

글에는 지역·주제·닉네임·공감·댓글이 붙고, 같은 시·도의 다른 단지 글은 *인근 단지 이야기* 로 따로 묶는다.
저장소는 브라우저 `localStorage` 하나뿐인 데모라 기기 간 공유는 되지 않는다.
서버를 붙일 때는 `src/stores/community.js` 의 `load()/persist()` 만 API 호출로 바꾸면 된다.

## 배포 (Docker / Railway)

```bash
docker build -t cheongyak-map .
docker run --rm -p 8080:8080 -e NAVER_MAP_CLIENT_ID=발급받은키 cheongyak-map
# 또는
NAVER_MAP_CLIENT_ID=발급받은키 docker compose up --build
```

- 멀티스테이지: `node:22-alpine` 에서 빌드 → `nginx:1.29-alpine` 이 `dist/` 를 서빙.
- **지도 키는 이미지에 굽지 않는다.** 컨테이너가 뜰 때 `docker/10-app-config.sh` 가
  `NAVER_MAP_CLIENT_ID` 로 `/runtime-config.js` 를 새로 쓰고, 앱은 `window.__APP_CONFIG__` 를
  먼저 본 뒤 없으면 빌드 타임 `VITE_NAVER_MAP_CLIENT_ID` 로 물러선다(`src/lib/config.js`).
  → 키를 바꿔도 **재배포만** 하면 되고 재빌드가 필요 없다.
- 같은 스크립트가 플랫폼이 주는 `PORT` 를 nginx 에 꽂는다(기본 8080). IPv6 스택이 있을 때만
  `listen [::]` 를 추가하므로 IPv4 전용 환경에서도 뜬다.
- `/healthz` 는 200 을 돌려주는 헬스체크 경로다(`railway.toml` 의 `healthcheckPath`).
- 캐시: `/assets/*` 는 1년 immutable, `index.html` 과 `runtime-config.js` 는 `no-store`.
- 원문 PDF(`공고문/`, 45MB)는 빌드 시 `dist/공고문/` 으로 복사돼 같이 서빙된다.

### Railway 에서

1. New Project → **Deploy from GitHub repo** 로 이 레포를 연결한다.
   루트의 `railway.toml` 이 Dockerfile 빌더와 헬스체크를 지정하므로 별도 설정이 필요 없다.
2. 서비스 **Variables** 에 `NAVER_MAP_CLIENT_ID` 를 추가한다. (`PORT` 는 Railway 가 자동 주입)
3. Settings → Networking 에서 도메인을 만들고, **그 도메인을**
   NCP 콘솔 > Maps > 애플리케이션의 **웹 서비스 URL** 에 등록한다.
   등록하지 않으면 인증 실패로 지도 자리에 안내 화면이 뜬다.

키가 없거나 인증에 실패해도 앱은 죽지 않는다. 지도 자리에 원인과 해결 순서가 표시되고
목록·상세·커뮤니티는 그대로 동작한다.

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
  main.js                앱 진입점
  App.vue                레이아웃 · 상세 탭/팝업 전환
  lib/
    config.js            런타임(window.__APP_CONFIG__) ↔ 빌드타임 env
    naverMaps.js         지도 SDK 로더 (ncpKeyId ↔ ncpClientId 양쪽 시도)
    notices.js           데이터 가공 - D-day·금액 포맷·필터
    matching.js          내 조건 → 특별공급 자격 판정 (asis 로직 이식)
  stores/
    app.js               필터·선택·매칭 등 화면 공통 상태
    community.js         단지별 커뮤니티 (localStorage)
  components/
    TopBar / FilterBar / NoticeCard / MatchPanel
    MapView              지도, 커스텀 마커, 줌 단계별 지역 묶음
    DetailPanel          상세 + [공고 정보 | 지역 커뮤니티] 탭
    CommunityPanel       단지 커뮤니티 본문 (탭·팝업 공용)
    CommunityModal       좁은 화면용 레이어 팝업
    CommunityFeed        사이드바 커뮤니티 탭
    MapNotice            지도 키 없음/로드 실패 안내
docker/
  nginx.conf.template    PORT·IPv6 자리를 치환해 쓰는 서버 설정
  10-app-config.sh       시작 시 설정 치환 + runtime-config.js 생성
Dockerfile               node 빌드 → nginx 서빙
railway.toml             Railway 빌더·헬스체크
vite.config.js           `공고문/` PDF 를 복사 없이 서빙하는 플러그인
asis/                    기존 단일 HTML 앱 (참고용, 배포 이미지에서는 제외)
```

## 알아둘 것

- **분양가는 공고문에서 자동 추출한 값**이라 표 형식이 다른 공고에서는 최저/최고가
  실제 주택형 가격이 아닐 수 있다. 상세 화면에서 원문 PDF 로 바로 확인할 수 있게 했다.
- 자격 판정도 공고문 요약값 기준이라 실제 심사와 다를 수 있다. 청약 전에는 청약홈과
  원문 공고를 확인해야 한다.
- LH 매입임대·든든전세처럼 "관할 단위" 공고(n51~n57)는 단지가 특정되지 않아
  관할 시·군 중심에 찍힌다.
- `asis/` 는 배포 대상이 아니다(`.dockerignore`). 기존 `내집매칭 실행.bat` + `serve.ps1`
  경로는 그대로 두어 비교·참고용으로만 남겼다.
