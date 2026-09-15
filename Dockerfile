# ---------------------------------------------------------------- build
FROM node:22-alpine AS build

WORKDIR /app

# 의존성 먼저 — 소스만 바뀌면 이 레이어는 캐시된다.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# 지도 키는 런타임(runtime-config.js)에 주입하는 것이 기본이지만,
# 빌드 타임에 넣고 싶으면 --build-arg 로도 받을 수 있게 열어 둔다.
ARG VITE_NAVER_MAP_CLIENT_ID=""
ENV VITE_NAVER_MAP_CLIENT_ID=$VITE_NAVER_MAP_CLIENT_ID

RUN npm run build

# ---------------------------------------------------------------- serve
FROM nginx:1.29-alpine

# nginx 공식 이미지는 /docker-entrypoint.d/*.sh 를 시작 전에 실행한다.
# 여기서 PORT 를 꽂고 runtime-config.js 를 다시 쓴다.
COPY docker/nginx.conf.template /etc/nginx/app.conf.template
COPY docker/10-app-config.sh /docker-entrypoint.d/10-app-config.sh
RUN chmod +x /docker-entrypoint.d/10-app-config.sh

COPY --from=build /app/dist /usr/share/nginx/html

# Railway 는 PORT 를 주입한다. 없으면 8080.
ENV PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/healthz" || exit 1
