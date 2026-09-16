컨셉과 현재 MVP
부동산 청약 정보를 모아서 보기좋게 보여주는 청년들을 위한 청약 정보 서비스 MVP

현재 구현된 기능:

json 데이터 기반, 네이버지도 위에 청약정보 보여주기.
내 상황에 맞게 필터해주기.
아파트별 지역커뮤니티 및 방문자수 1,2,3등 왕관 표시.

브랜치와 팀 협업
실제 편집 전에 반드시 최신 main에서 시작한다. 작업 디렉터리가 깨끗한지 확인한 다음 실행한다.

git status --short --branch
git fetch origin
git switch main
git pull --ff-only origin main
git switch -c feature/<구현-내용을-요약한-kebab-case>
pnpm install --frozen-lockfile

기존 미커밋 변경·다른 팀 브랜치·사용자 작업을 덮어쓰지 않는다. 이미 작업 중인 checkout이면 최신 origin/main과 맞춘 별도 checkout/worktree에서 feature 브랜치를 만든다.
main에 직접 commit/push하지 않는다. 한 브랜치·한 PR은 하나의 목적에 집중한다. 여러 팀/에이전트가 나누면 파일 소유권부터 정하고 다른 작업자의 수정을 되돌리지 않는다.
커밋은 feat:, fix:, refactor:, docs:, test:, chore: 중 맞는 접두어와 구체적인 요약을 쓴다. diff를 읽고 의도한 파일만 stage한다.
비밀 값·개인 환경파일·node_modules·빌드 산출물·로컬 세션/Pin 기록은 커밋하지 않는다. lockfile 변경은 의존성 변경과 함께 검토한다.
공유 브랜치 force push와 이력 재작성은 하지 않는다. main이 진행됐으면 feature에서 git merge origin/main으로 반영하고 충돌을 해결한 뒤 관련 검증을 다시 한다.
한 턴의 완료 조건
요청 유형 선언 → 코드/화면 확인 → Before 확보 → 구현 → 검증 → 마지막 편집 이후 After/동작 확인 → 독립 diff 리뷰 → main HEAD 재확인 → commit/push → 머지 가능한 MR/PR 생성 → 아래 형식 보고까지 수행한다.

pnpm check
git diff --check
git fetch origin main
git merge-base --is-ancestor origin/main HEAD
pnpm check는 lint, 테스트(저장소·로컬 실행·오프라인 검사 포함), 타입 검사, 빌드를 수행한다. 실패 원인을 해결하고 실행하지 못한 검증을 통과했다고 쓰지 않는다. main 반영으로 코드가 바뀌면 검증과 증적도 갱신한다. 외부 권한·환경 때문에 끝내지 못하면 미처리 항목에 정확한 단계와 이유를 적으며 완료·머지 가능으로 보고하지 않는다.

UI 변경은 실제 브라우저의 대상 상태와 영향을 받는 PC/모바일 크기를 확인한다. 폼·탭·팝업은 키보드·포커스·ARIA와 상호작용도 확인한다.
회귀가 가능한 동작은 의미 있는 테스트로 검증한다. 문서만 바꿔도 링크와 명령을 확인하고 현재 앱의 Before/After 증적을 남긴다.
모델·위임·평가 경로 변경은 HTTP/스트림/렌더 경계를 검증한다. mock 프로토콜 검사와 실제 모델/폐쇄망 성능 평가를 구분해 보고한다.
MR/PR 생성과 증적
원격은 GitHub이므로 MR에 해당하는 PR을 만든다. GitLab 팀은 같은 규칙과 .gitlab/merge_request_templates/Default.md를 사용한다. 기본 대상은 main이다. 요청하지 않은 merge는 수행하지 않는다.

.github/pull_request_template.md의 4항목을 채워 본문 파일을 작성한다. 검수 명령·결과·리뷰 결과·확인한 main SHA를 포함한다.
Before/After 캡처 또는 동작 녹화본을 반드시 본문에 첨부한다. 정적 변경은 같은 URL·뷰포트·상태의 Before/After, 시간에 따른 동작은 전후 상태를 보여주는 녹화를 사용한다. 마지막 코드 변경 뒤의 증적이어야 한다.

최종 보고 양식
PR 본문과 사용자 보고에 같은 형식을 사용해도 된다. 검수/증적은 1번에 포함하고 2번은 정확히 다섯 줄로 쓴다.

이번에 한 일 — 요청 타입, 변경 내용, MR/PR 링크, 검수 결과, Before/After 또는 녹화 링크.
결과 5줄 요약 — 핵심 결과 다섯 줄.
요구사항 중 처리하지 못한 것 — 항목과 이유. 없으면 없음.
개선 사항 또는 우려 — 우선순위순 최대 3개. 없으면 없음.
