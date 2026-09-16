import { computed, reactive } from 'vue';
import { api } from '../lib/api';
import { NOTICE_BY_ID } from '../lib/notices';
import { markOffline, markOnline } from './server';

/**
 * 청약마감 캘린더 (서버 저장).
 *
 * 공고 상세에서 "캘린더에 저장"을 누르면 이 사람의 uid 에 붙여 서버가 기억한다.
 * 상단 캘린더 버튼에서 저장해 둔 공고를 마감일 기준으로 모아 보여준다.
 */

const state = reactive({ ids: [] });

export const scheduleStore = {
  ids: computed(() => state.ids),

  hydrate(ids) {
    state.ids = ids ?? [];
  },

  isSaved(id) {
    return state.ids.includes(id);
  },

  /** 저장된 공고를 마감일이 가까운 순으로. 마감일을 모르는 공고는 맨 뒤. */
  saved: computed(() => {
    const items = state.ids.map((id) => NOTICE_BY_ID.get(id)).filter(Boolean);
    return items.sort((a, b) => {
      if (a.deadlineDate && b.deadlineDate) return a.deadlineDate - b.deadlineDate;
      if (a.deadlineDate) return -1;
      if (b.deadlineDate) return 1;
      return 0;
    });
  }),

  async toggle(id) {
    if (!id) return;
    try {
      const { ids } = await api.toggleSchedule(id);
      state.ids = ids;
      markOnline();
    } catch (e) {
      if (e.offline) markOffline(e);
      throw e;
    }
  },
};
