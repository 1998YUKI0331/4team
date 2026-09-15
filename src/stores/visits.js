import { computed, reactive } from 'vue';

/**
 * 단지 방문 카운팅.
 *
 * 상세를 열어 본 횟수를 세어서 "많이 본 단지" 순위를 만든다. 커뮤니티와 마찬가지로
 * 브라우저 localStorage 한 곳에만 쌓이는 값이라 기기 간에는 공유되지 않는다.
 * (서버가 붙으면 load/persist 만 API 로 바꾸면 된다)
 */

const STORAGE_KEY = 'cheongyak_visits_v1';

/** 순위를 매길 때 크라운을 붙이는 자리 */
export const CROWN_RANKS = 3;
/** 몇 위까지 숫자로 보여줄지 */
export const RANK_LIMIT = 10;

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const out = {};
    for (const [id, v] of Object.entries(parsed)) {
      const count = Number(v?.count);
      if (!Number.isFinite(count) || count <= 0) continue;
      out[id] = { count: Math.floor(count), at: Number(v?.at) || 0 };
    }
    return out;
  } catch {
    return {};
  }
}

const state = reactive({ byId: load() });

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.byId));
  } catch {
    // 저장 못 해도 이번 세션 동안은 화면에 반영된다.
  }
}

/**
 * 방문 많은 순 -> 최근 방문 순으로 줄 세운 뒤 1위부터 번호를 매긴다.
 * 동점이면 최근에 본 쪽이 앞이라 순위가 흔들리지 않는다.
 */
const ranking = computed(() => {
  const rows = Object.entries(state.byId)
    .filter(([, v]) => v.count > 0)
    .sort((a, b) => b[1].count - a[1].count || b[1].at - a[1].at || a[0].localeCompare(b[0]));
  const rank = new Map();
  rows.forEach(([id], i) => rank.set(id, i + 1));
  return rank;
});

export const visitStore = {
  counts: computed(() => state.byId),
  ranking,

  /** 같은 단지를 연속으로 눌러도 한 번만 센다(호출부에서 선택이 바뀔 때만 부른다). */
  visit(id) {
    if (!id) return;
    const prev = state.byId[id];
    state.byId[id] = { count: (prev?.count ?? 0) + 1, at: Date.now() };
    persist();
  },

  countFor(id) {
    return state.byId[id]?.count ?? 0;
  },

  rankOf(id) {
    return ranking.value.get(id) ?? null;
  },

  /** 상위 n개 [{id, count, rank}] */
  top(n = CROWN_RANKS) {
    return [...ranking.value.entries()]
      .filter(([, rank]) => rank <= n)
      .sort((a, b) => a[1] - b[1])
      .map(([id, rank]) => ({ id, rank, count: state.byId[id].count }));
  },

  reset() {
    state.byId = {};
    persist();
  },
};
