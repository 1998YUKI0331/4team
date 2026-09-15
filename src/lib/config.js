/**
 * 실행 환경 설정.
 *
 * 값은 두 경로로 들어온다.
 *  1) 빌드 타임 — `.env` 의 `VITE_NAVER_MAP_CLIENT_ID` (로컬 개발용)
 *  2) 런타임    — 컨테이너가 시작할 때 만들어 주는 `/runtime-config.js` 가
 *                 `window.__APP_CONFIG__` 를 채운다 (Railway 등 배포 환경용)
 *
 * 2번이 있으면 우선한다. 이미지를 다시 빌드하지 않고 키만 바꿔 끼울 수 있어야
 * 배포가 편하기 때문이다.
 */
const runtime = (typeof window !== 'undefined' && window.__APP_CONFIG__) || {};

function fromRuntime(key) {
  const value = runtime[key];
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  // 치환되지 않은 플레이스홀더(`${...}`)가 그대로 남아 있으면 없는 값으로 본다.
  if (!trimmed || trimmed.startsWith('${')) return '';
  return trimmed;
}

export const NAVER_MAP_CLIENT_ID =
  fromRuntime('NAVER_MAP_CLIENT_ID') || (import.meta.env.VITE_NAVER_MAP_CLIENT_ID ?? '').trim();

export const APP_ENV = fromRuntime('APP_ENV') || import.meta.env.MODE;
