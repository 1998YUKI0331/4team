import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const NOTICE_DIR = path.join(ROOT, '공고문');
const NOTICE_PREFIX = '/공고문/';

/**
 * 원본 공고문 PDF 는 프로젝트 루트의 `공고문/` 에 있다. public/ 으로 복사하면
 * 45MB 를 중복 보관하게 되므로, 개발 서버에서는 미들웨어로 바로 흘려보내고
 * 빌드할 때만 dist 로 복사한다.
 */
function noticePdfs() {
  const send = (req, res, next) => {
    let url;
    try {
      url = decodeURIComponent((req.url ?? '').split('?')[0]);
    } catch {
      return next();
    }
    if (!url.startsWith(NOTICE_PREFIX)) return next();

    const file = path.join(NOTICE_DIR, url.slice(NOTICE_PREFIX.length));
    if (!file.startsWith(NOTICE_DIR) || !fs.existsSync(file)) return next();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(path.basename(file))}`);
    fs.createReadStream(file).pipe(res);
  };

  return {
    name: 'serve-notice-pdfs',
    // 화살표 본문에서 값을 반환하면 vite 가 그것을 post-hook 으로 실행해 버린다.
    configureServer(server) {
      server.middlewares.use(send);
    },
    configurePreviewServer(server) {
      server.middlewares.use(send);
    },
    closeBundle() {
      if (!fs.existsSync(NOTICE_DIR)) return;
      fs.cpSync(NOTICE_DIR, path.join(ROOT, 'dist', '공고문'), { recursive: true });
    },
  };
}

export default defineConfig({
  plugins: [react(), noticePdfs()],
  server: { port: 5173, host: true },
  preview: { port: 5173 },
});
