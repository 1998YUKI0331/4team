import { reactive } from 'vue';

/** 서버 연결 상태 — 끊기면 화면 위쪽에 안내 한 줄을 띄운다. */
export const serverState = reactive({
  ready: false,
  online: true,
  message: '',
});

export function markOnline() {
  serverState.online = true;
  serverState.message = '';
}

export function markOffline(error) {
  serverState.online = false;
  serverState.message = error?.message ?? '서버에 연결할 수 없습니다.';
}
