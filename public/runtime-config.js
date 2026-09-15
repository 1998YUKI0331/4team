// 배포 환경에서는 컨테이너가 시작할 때 docker/runtime-config.sh 가 이 파일을 다시 쓴다.
// (로컬 개발은 .env 의 VITE_NAVER_MAP_CLIENT_ID 를 쓰므로 비워 둔다)
window.__APP_CONFIG__ = {};
