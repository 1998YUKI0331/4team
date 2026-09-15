import express from 'express';
import compression from 'compression';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createApi } from './api.js';
import { openDb } from './db.js';

/**
 * 배포용 단일 프로세스 서버.
 *   - dist/ 정적 서빙 (공고문 PDF 포함)
 *   - /api/* 커뮤니티·방문·프로필 (SQLite)
 *   - /runtime-config.js 를 환경변수로 즉석 생성 (지도 키를 이미지에 굽지 않으려고)
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = process.env.STATIC_DIR || path.join(HERE, '..', 'dist');
const INDEX = path.join(DIST, 'index.html');
const PORT = Number(process.env.PORT || 8080);

const db = openDb();
const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1); // Railway 프록시 뒤 - req.secure 로 쿠키 Secure 판단
app.use(compression());

/** 지도 키 등 런타임 설정. 파일이 아니라 매 요청 환경변수에서 만든다. */
app.get('/runtime-config.js', (_req, res) => {
  const config = {
    NAVER_MAP_CLIENT_ID: (process.env.NAVER_MAP_CLIENT_ID || process.env.VITE_NAVER_MAP_CLIENT_ID || '').trim(),
    APP_ENV: process.env.APP_ENV || 'production',
  };
  res.type('application/javascript');
  res.setHeader('Cache-Control', 'no-store');
  res.send(`window.__APP_CONFIG__ = ${JSON.stringify(config)};\n`);
});

app.get('/healthz', (_req, res) => {
  res.type('text/plain').setHeader('Cache-Control', 'no-store');
  res.send('ok\n');
});

app.use(createApi(db));

app.use(
  express.static(DIST, {
    index: false,
    etag: true,
    setHeaders(res, filePath) {
      const rel = path.relative(DIST, filePath);
      if (rel.startsWith('assets' + path.sep)) {
        // 파일명에 해시가 붙어 있어 오래 캐시해도 안전하다.
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else if (rel === 'index.html' || rel === 'runtime-config.js') {
        res.setHeader('Cache-Control', 'no-store');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=3600');
      }
    },
  })
);

// SPA — 없는 GET 경로는 index.html 로 돌려준다.
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (!fs.existsSync(INDEX)) return res.status(500).send('dist/index.html 이 없습니다. npm run build 를 먼저 실행하세요.');
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(INDEX);
});

const server = app.listen(PORT, '0.0.0.0', () => {
  const key = process.env.NAVER_MAP_CLIENT_ID || process.env.VITE_NAVER_MAP_CLIENT_ID;
  console.log(`[web] listening on :${PORT} (static: ${DIST})`);
  if (!key) console.warn('[web] WARNING: NAVER_MAP_CLIENT_ID 가 비어 있습니다. 지도 대신 안내 화면이 표시됩니다.');
});

/** Railway 는 재배포 때 SIGTERM 을 보낸다. WAL 을 정리하고 끝낸다. */
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    console.log(`[web] ${signal} - 종료합니다`);
    server.close(() => {
      try {
        db.close();
      } catch {
        /* 이미 닫혔으면 무시 */
      }
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
