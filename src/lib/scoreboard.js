import index from '../data/scoreboard-index.json';

/**
 * 입지 분석 데이터.
 *
 * 공고 한 건을 "분양가 · 시세흐름 · 개발호재 · 인프라 · 청약수요" 다섯 축으로 채점한 결과다.
 * 공고 id(n19, n20 …)로 notices.geo.json 과 그대로 맞물린다.
 * 임대 공고처럼 비교할 단지를 특정할 수 없는 건은 데이터가 없어 undefined 를 돌려준다.
 *
 * 데이터는 두 벌로 나뉜다.
 *   scoreboard-index.json  점수·배수만(3KB). 목록 카드마다 필요하므로 같이 번들된다.
 *   scoreboard.json        상세 전체(287KB). loadAnalysis() 로 탭을 열 때만 받아 온다.
 */

export const SCOREBOARD_META = {
  generatedAt: index.generatedAt,
  basedOn: index.basedOn,
  weights: index.weights,
  axes: index.axes,
};

/** 점수 막대·배지에 쓰는 축 순서 */
export const AXES = ['price', 'market', 'catalyst', 'infra', 'demand'];

/** 목록·탭 배지용 — 동기. 점수와 배수만 들어 있다. */
export const scoresOf = (id) => index.scores[id];
export const hasAnalysis = (id) => Boolean(index.scores[id]);

export const ANALYSIS_COUNT = Object.keys(index.scores).length;

/** 상세 데이터는 처음 필요할 때 한 번만 받아 두고 재사용한다. */
let pending = null;
export function loadAnalysis() {
  pending ??= import('../data/scoreboard.json').then((m) => m.default);
  return pending;
}

/* ---------------------------------------------------------------- 표기 */

/** 만원 단위 금액 → "6억 5,780" */
export function eok(man) {
  if (man == null) return '-';
  const e = Math.floor(man / 1e4);
  const m = Math.round(man % 1e4);
  if (e > 0) return m > 0 ? `${e}억 ${m.toLocaleString()}` : `${e}억`;
  return `${m.toLocaleString()}만`;
}

/** 평당가처럼 "만원" 이 붙는 값 */
export const manwon = (v) => (v == null ? '-' : `${Math.round(v).toLocaleString()}만`);

export const pct = (v) => (v == null ? '-' : `${v > 0 ? '+' : ''}${v.toFixed(1)}%`);

/** 경쟁률 "44.5 : 1". 미달이면 소수 둘째 자리까지 보여 준다. */
export const rateText = (r) => (r == null ? '-' : `${r.toFixed(r < 10 ? 2 : 1)} : 1`);

export const meters = (m) => (m == null ? '-' : m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${m}m`);

/* ---------------------------------------------------------------- 등급 */

/**
 * 점수 → 색. 공고 분류색(민간 주황 / 공공 파랑 / 임대 초록)과 헷갈리지 않도록
 * 평가용 색은 따로 둔다.
 */
export function scoreColor(v) {
  if (v == null) return 'var(--muted)';
  if (v >= 72) return '#0f9d58';
  if (v >= 55) return '#2f6bff';
  if (v >= 40) return '#e5952b';
  return '#e5484d';
}

export function scoreGrade(v) {
  if (v == null) return '-';
  if (v >= 72) return '우수';
  if (v >= 55) return '양호';
  if (v >= 40) return '보통';
  return '주의';
}

/** 배수(분양가 ÷ 주변 시세) 한 줄 해석 */
export function ratioVerdict(ratio) {
  if (ratio == null) return null;
  if (ratio < 1.0) return '주변 실거래보다 낮게 나왔습니다.';
  if (ratio <= 1.4) return '신축 프리미엄 통상 범위(1.1~1.4배) 안입니다.';
  if (ratio <= 1.8) return '통상 범위를 넘습니다. 주변 시세가 따라와야 차익이 납니다.';
  return '주변 실거래의 두 배에 가깝습니다. 상품성 차이를 따로 따져 보세요.';
}

/* ------------------------------------------------------- 시세 지수 그래프 */

/**
 * 인근 단지 월별 실거래를 "구간 시작 = 100" 지수로 바꾼다.
 * 단지마다 대표 주택형이 달라 절대 금액은 비교할 수 없고, 흐름만 비교한다.
 */
export function trendSeries(comps) {
  const usable = (comps ?? []).filter((c) => c.series?.v?.length >= 13);
  if (!usable.length) return null;

  const months = [...new Set(usable.flatMap((c) => monthsOf(c.series)))].sort();
  if (months.length < 2) return null;
  const base = months[0];

  const lines = [];
  for (const c of usable) {
    const map = new Map(monthsOf(c.series).map((m, i) => [m, c.series.v[i]]));
    const b = map.get(base);
    if (!b) continue;
    lines.push({ name: c.name, points: months.map((m) => (map.has(m) ? (map.get(m) / b) * 100 : null)) });
  }
  if (!lines.length) return null;

  const values = lines.flatMap((l) => l.points).filter((v) => v != null);
  return {
    months,
    lines,
    min: Math.min(100, Math.floor(Math.min(...values) / 10) * 10),
    max: Math.max(100, Math.ceil(Math.max(...values) / 10) * 10),
  };
}

function monthsOf(series) {
  const [y, m] = series.from.split('-').map(Number);
  return series.v.map((_, i) => {
    const d = new Date(y, m - 1 + i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
}
