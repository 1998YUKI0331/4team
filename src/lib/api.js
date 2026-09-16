/**
 * 서버 API 호출 얇은 래퍼.
 *
 * 인증은 서버가 심어 주는 익명 쿠키(cy_uid) 하나뿐이라 별도 토큰 처리가 없다.
 * 실패하면 서버가 준 한국어 메시지를 그대로 Error.message 에 담아 던진다.
 */
const BASE = '/api';

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
  } catch (e) {
    const err = new Error('서버에 연결할 수 없습니다.');
    err.cause = e;
    err.offline = true;
    throw err;
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    // 본문이 없거나 JSON 이 아닌 응답
  }

  if (!res.ok) {
    const err = new Error(data?.error ?? `요청에 실패했습니다 (${res.status})`);
    err.status = res.status;
    err.retryAfter = data?.retryAfter;
    throw err;
  }
  return data;
}

export const api = {
  bootstrap: () => request('GET', '/bootstrap'),
  community: (noticeId) => request('GET', `/notices/${encodeURIComponent(noticeId)}/community`),
  createPost: (noticeId, payload) => request('POST', `/notices/${encodeURIComponent(noticeId)}/posts`, payload),
  like: (postId) => request('POST', `/posts/${encodeURIComponent(postId)}/like`),
  comment: (postId, payload) => request('POST', `/posts/${encodeURIComponent(postId)}/comments`, payload),
  reportPost: (postId, reason) => request('POST', `/posts/${encodeURIComponent(postId)}/report`, { reason }),
  reportComment: (commentId, reason) =>
    request('POST', `/comments/${encodeURIComponent(commentId)}/report`, { reason }),
  visit: (noticeId) => request('POST', `/notices/${encodeURIComponent(noticeId)}/visit`),
  saveProfile: (profile) => request('PUT', '/profile', { profile }),
  toggleSchedule: (noticeId) => request('POST', `/notices/${encodeURIComponent(noticeId)}/schedule/toggle`),
};
