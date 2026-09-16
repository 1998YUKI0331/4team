import { reactive } from 'vue';

/**
 * 금갱이 — 우측 하단에 상주하는 마스코트.
 *
 * 규칙은 하나다. 사용자가 뭔가 누르면 **일부러 0.5초 기다렸다가** 실제 동작을 실행하고,
 * 그 0.5초 동안 금갱이가 버튼을 다다다다 두드린다("내가 처리하는 중"이라는 연출).
 *
 * 화면마다 핸들러를 고치는 대신 클릭을 캡처 단계에서 한 번 가로채 지연시킨다.
 *  - 원본 클릭은 막고, 0.5초 뒤 같은 요소에 합성 클릭을 다시 쏜다(`buddyReplay` 로 재귀 방지).
 *  - 링크(a[href])는 지연하면 새 탭이 팝업 차단에 걸리므로 애니메이션만 재생한다.
 *  - 지도 캔버스 안(네이버 SDK 마커)은 SDK 가 직접 듣고 있어 제외하고, MapView 가 defer() 를 쓴다.
 *  - 모션 최소화를 켠 사용자에게는 지연도 애니메이션도 걸지 않는다.
 */

export const BUDDY_DELAY = 500;

/** 클릭을 가로챌 요소. 링크는 위 이유로 제외한다. */
const INTERACTIVE = 'button, [role="button"], summary, .chip';

export const buddyState = reactive({
  /** 스프라이트(타자) 애니메이션 재생 중인지 */
  animating: false,
  /** 말풍선 문구 */
  message: '',
  /** 금갱런 미니게임(연속 5클릭 이스터에그)이 열려 있는지 */
  gameOpen: false,
});

/** 금갱이를 연속으로 5번 두드리면 열리는 미니게임. */
export function openGeumgaengRun() {
  buddyState.gameOpen = true;
  buddyState.message = '';
}

export function closeGeumgaengRun() {
  buddyState.gameOpen = false;
}

const WORK_MESSAGES = ['다다다다!', '처리 중이에요!', '잠시만요!', '바로 찾아볼게요!'];
const IDLE_MESSAGES = [
  '좋은 공고 없나 보는 중!',
  '청약 일정 확인 중…',
  '지도 정리하는 중!',
  '오늘도 손품 파는 중!',
];

export const pickWorkMessage = () => WORK_MESSAGES[Math.floor(Math.random() * WORK_MESSAGES.length)];
export const pickIdleMessage = () => IDLE_MESSAGES[Math.floor(Math.random() * IDLE_MESSAGES.length)];

export function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

let animTimer = null;

/** 애니메이션을 ms 동안 켠다. 겹쳐 불리면 가장 늦은 종료 시각으로 연장된다. */
export function nudge(ms = 900, message = '') {
  if (prefersReducedMotion()) return;
  buddyState.animating = true;
  if (message) buddyState.message = message;
  clearTimeout(animTimer);
  animTimer = setTimeout(() => {
    buddyState.animating = false;
    buddyState.message = '';
  }, ms);
}

/**
 * 동작을 delay 만큼 미뤘다가 실행한다. 미루는 동안 금갱이가 타자를 친다.
 * @returns {Promise<*>} fn 의 반환값
 */
export function defer(fn, { delay = BUDDY_DELAY, message = '' } = {}) {
  if (prefersReducedMotion()) return Promise.resolve(fn?.());
  nudge(delay + 200, message || pickWorkMessage());
  return new Promise((resolve) => {
    setTimeout(() => resolve(fn?.()), delay);
  });
}

/** 클릭 가로채기 설치. App 이 뜰 때 한 번만 부른다. */
export function installBuddyClickDelay({ delay = BUDDY_DELAY } = {}) {
  if (typeof document === 'undefined') return () => {};

  const onClick = (e) => {
    if (e.buddyReplay) return; // 우리가 다시 쏜 클릭
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // 새 탭 열기 등은 그대로
    if (prefersReducedMotion()) return;

    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;
    if (target.closest('[data-buddy-skip]')) return;

    // 링크는 지연하면 팝업 차단에 걸린다 — 애니메이션만.
    if (target.closest('a[href]')) {
      nudge(900);
      return;
    }

    const el = target.closest(INTERACTIVE);
    if (!el || el.closest('.mapview__canvas')) return;

    e.preventDefault();
    e.stopPropagation();

    el.classList.add('is-buddy-waiting');
    nudge(delay + 200, pickWorkMessage());

    setTimeout(() => {
      el.classList.remove('is-buddy-waiting');
      if (!el.isConnected) return; // 기다리는 사이 사라진 버튼
      const replay = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
      replay.buddyReplay = true;
      el.dispatchEvent(replay);
    }, delay);
  };

  // 입력·선택은 막지 않고 "같이 타자 치는" 연출만 얹는다.
  const onInput = () => nudge(600);
  const onChange = () => nudge(800);

  document.addEventListener('click', onClick, true);
  document.addEventListener('input', onInput, true);
  document.addEventListener('change', onChange, true);

  return () => {
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('input', onInput, true);
    document.removeEventListener('change', onChange, true);
  };
}
