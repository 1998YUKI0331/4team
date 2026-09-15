/**
 * 방문 순위 1·2·3위에 붙는 왕관.
 *
 * 카드·상세는 Vue 컴포넌트(RankCrown.vue)로, 지도 마커는 HTML 문자열로 써야 해서
 * 마크업을 여기 한 곳에 두고 양쪽이 같은 걸 쓴다. 그라디언트 대신 단색을 쓰는 이유는
 * 같은 화면에 여러 개가 그려질 때 <defs> id 가 충돌하지 않게 하려고.
 */
export const CROWN_COLORS = {
  1: { body: '#f2b01e', edge: '#c98a06', label: '1위' },
  2: { body: '#b8c2cc', edge: '#8d99a6', label: '2위' },
  3: { body: '#cd7f32', edge: '#a2601f', label: '3위' },
};

export function crownSvg(rank, { size = 14 } = {}) {
  const c = CROWN_COLORS[rank];
  if (!c) return '';
  return `<svg class="crown crown--${rank}" viewBox="0 0 24 24" width="${size}" height="${size}" role="img" aria-label="방문 ${c.label}">
  <path d="M3.4 17.4 2.1 7.3a.62.62 0 0 1 .98-.58l4.3 3.1 3.98-5.72a.78.78 0 0 1 1.28 0l3.98 5.72 4.3-3.1a.62.62 0 0 1 .98.58l-1.3 10.1H3.4z" fill="${c.body}" stroke="${c.edge}" stroke-width="1" stroke-linejoin="round"/>
  <rect x="3.2" y="18.6" width="17.6" height="2.9" rx="1.2" fill="${c.body}" stroke="${c.edge}" stroke-width="1"/>
</svg>`;
}
