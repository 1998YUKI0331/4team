import { computed, reactive } from 'vue';
import { api } from '../lib/api';
import { markOffline, markOnline } from './server';

/**
 * 단지 방문 카운팅 (서버 저장).
 *
 * 상세를 연 횟수를 서버가 세고 모든 방문자의 합계로 순위를 만든다.
 * 같은 사람이 같은 단지를 계속 열어도 서버 쿨다운(기본 30분) 안에서는 오르지 않는다.
 */

export const CROWN_RANKS = 3;
export const RANK_LIMIT = 10;

const state = reactive({ byId: {} });

/** 방문 많은 순 -> 최근 방문 순. 동점이어도 순위가 흔들리지 않게 고정 기준을 준다. */
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

  hydrate(counts) {
    state.byId = counts ?? {};
  },

  /** 상세를 열 때 호출. 응답으로 전체 카운트를 갈아 끼운다(40건이라 통째로 받아도 가볍다). */
  async visit(id) {
    if (!id) return;
    try {
      const { visits } = await api.visit(id);
      state.byId = visits;
      markOnline();
    } catch (e) {
      if (e.offline) markOffline(e);
      // 방문수는 실패해도 화면 흐름을 막지 않는다.
    }
  },

  countFor(id) {
    return state.byId[id]?.count ?? 0;
  },

  rankOf(id) {
    return ranking.value.get(id) ?? null;
  },

  top(n = CROWN_RANKS) {
    return [...ranking.value.entries()]
      .filter(([, rank]) => rank <= n)
      .sort((a, b) => a[1] - b[1])
      .map(([id, rank]) => ({ id, rank, count: state.byId[id].count }));
  },
};
