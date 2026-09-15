#!/bin/sh
# nginx 공식 엔트리포인트가 시작 전에 실행해 주는 스크립트.
#  1) 플랫폼이 주는 PORT 를 nginx 설정에 꽂고
#  2) 네이버 지도 키를 runtime-config.js 로 내려보낸다.
# 키를 이미지에 굽지 않기 때문에 같은 이미지로 환경만 바꿔 배포할 수 있다.
set -eu

PORT="${PORT:-8080}"
HTML_DIR="${HTML_DIR:-/usr/share/nginx/html}"
TEMPLATE="${APP_CONF_TEMPLATE:-/etc/nginx/app.conf.template}"
TARGET="${APP_CONF_TARGET:-/etc/nginx/conf.d/default.conf}"

# IPv6 가 없는 환경에서 `listen [::]:PORT` 를 넣으면 nginx 가 아예 안 뜬다.
# 커널에 IPv6 스택이 있을 때만 리스너를 추가한다. (Railway 사설망은 IPv6)
if [ -f /proc/net/if_inet6 ]; then
  LISTEN6="listen      [::]:${PORT};"
else
  LISTEN6="# IPv6 미지원 환경이라 IPv4 로만 listen 합니다."
fi

sed -e "s/__PORT__/${PORT}/g" -e "s|__LISTEN6__|${LISTEN6}|" "$TEMPLATE" > "$TARGET"
echo "[app-config] nginx listen on ${PORT}"

# NAVER_MAP_CLIENT_ID 를 기본으로 쓰되, VITE_ 접두사로 넣어도 받아 준다.
CLIENT_ID="${NAVER_MAP_CLIENT_ID:-${VITE_NAVER_MAP_CLIENT_ID:-}}"
# JSON 문자열에 그대로 넣을 수 있게 역슬래시/따옴표를 이스케이프하고 줄바꿈은 지운다.
ESCAPED=$(printf '%s' "$CLIENT_ID" | tr -d '\n\r' | sed 's/[\\"]/\\&/g')

cat > "${HTML_DIR}/runtime-config.js" <<CONFIG
// 컨테이너 시작 시 자동 생성됨 — 직접 수정하지 마세요.
window.__APP_CONFIG__ = {
  "NAVER_MAP_CLIENT_ID": "${ESCAPED}",
  "APP_ENV": "${APP_ENV:-production}"
};
CONFIG

if [ -z "$CLIENT_ID" ]; then
  echo "[app-config] WARNING: NAVER_MAP_CLIENT_ID 가 비어 있습니다. 지도 대신 안내 화면이 표시됩니다."
else
  echo "[app-config] NAVER_MAP_CLIENT_ID 주입 완료 (${#CLIENT_ID}자)"
fi
