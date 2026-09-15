import { onUnmounted, ref } from 'vue';

/** CSS 미디어쿼리 결과를 반응형 값으로. (상세 커뮤니티를 탭/팝업 중 무엇으로 열지 결정) */
export function useMediaQuery(query) {
  const matches = ref(false);
  if (typeof window === 'undefined' || !window.matchMedia) return matches;

  const mql = window.matchMedia(query);
  matches.value = mql.matches;
  const onChange = (e) => (matches.value = e.matches);

  if (mql.addEventListener) mql.addEventListener('change', onChange);
  else mql.addListener(onChange); // 사파리 13 이하

  onUnmounted(() => {
    if (mql.removeEventListener) mql.removeEventListener('change', onChange);
    else mql.removeListener(onChange);
  });

  return matches;
}
