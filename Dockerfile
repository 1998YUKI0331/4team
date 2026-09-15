# ---------------------------------------------------------------- build
FROM node:22-alpine AS build

WORKDIR /app

# 의존성 먼저 — 소스만 바뀌면 이 레이어는 캐시된다.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# 지도 키는 런타임에 주입하는 것이 기본이지만, 빌드 타임에 넣고 싶으면 --build-arg 로도 받는다.
ARG VITE_NAVER_MAP_CLIENT_ID=""
ENV VITE_NAVER_MAP_CLIENT_ID=$VITE_NAVER_MAP_CLIENT_ID

RUN npm run build

# ---------------------------------------------------------------- serve
# 정적 파일과 API(SQLite)를 한 프로세스가 같이 서빙한다.
# node:sqlite 는 Node 에 내장이라 네이티브 빌드나 추가 의존성이 없다(>=22.22 필요).
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server ./server
# 서버도 공고 목록(지역·id 검증)이 필요하다.
COPY src/data/notices.geo.json ./src/data/notices.geo.json
COPY --from=build /app/dist ./dist

# Railway 는 PORT 를 주입한다. DB 는 볼륨(/data)에 두어야 재배포해도 남는다.
ENV PORT=8080
ENV DB_PATH=/data/app.db
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/healthz" || exit 1

CMD ["node", "server/index.js"]
