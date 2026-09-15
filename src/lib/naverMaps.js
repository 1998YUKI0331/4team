import { NAVER_MAP_CLIENT_ID } from './config';

/**
 * 네이버 지도 JS SDK 로더.
 *
 * NCP 콘솔이 개편되면서 인증 파라미터가 ncpClientId -> ncpKeyId 로 바뀌었다.
 * 어떤 콘솔에서 발급한 키인지에 따라 둘 중 하나만 먹히므로 순서대로 시도한다.
 */
const ENDPOINTS = [
  (id) => `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${id}`,
  (id) => `https://openapi.map.naver.com/openapi/v3/maps.js?ncpClientId=${id}`,
];

export const MISSING_KEY = 'MISSING_KEY';

let pending = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.onload = () => (window.naver?.maps ? resolve() : reject(new Error('SDK 로드는 됐지만 naver.maps 가 없습니다.')));
    el.onerror = () => reject(new Error(`스크립트를 불러오지 못했습니다: ${src}`));
    document.head.appendChild(el);
  });
}

export function hasNaverMapKey() {
  return Boolean(NAVER_MAP_CLIENT_ID);
}

export function loadNaverMaps() {
  if (window.naver?.maps) return Promise.resolve(window.naver.maps);
  if (pending) return pending;

  if (!NAVER_MAP_CLIENT_ID) {
    const err = new Error(
      '네이버 지도 키가 설정되지 않았습니다. 로컬은 .env 의 VITE_NAVER_MAP_CLIENT_ID, ' +
        '배포 환경은 서비스 환경변수 NAVER_MAP_CLIENT_ID 를 확인하세요.'
    );
    err.code = MISSING_KEY;
    return Promise.reject(err);
  }

  pending = (async () => {
    // 인증 실패는 스크립트 로드 성공 후 콜백으로 통보된다.
    const authFailure = new Promise((_, reject) => {
      window.navermap_authFailure = () =>
        reject(
          new Error(
            '네이버 지도 인증에 실패했습니다. NCP 콘솔 > Maps > 애플리케이션에서 ' +
              'Web Dynamic Map 이 켜져 있고 웹 서비스 URL 에 현재 주소가 등록돼 있는지 확인하세요.'
          )
        );
    });

    let lastError;
    for (const build of ENDPOINTS) {
      try {
        await Promise.race([loadScript(build(NAVER_MAP_CLIENT_ID)), authFailure]);
        return window.naver.maps;
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError ?? new Error('네이버 지도 SDK 를 불러오지 못했습니다.');
  })();

  pending.catch(() => {
    pending = null;
  });
  return pending;
}
