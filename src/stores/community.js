import { computed, reactive } from 'vue';
import { api } from '../lib/api';
import { markOffline, markOnline } from './server';

/**
 * 단지별 지역 커뮤니티 (서버 저장).
 *
 * 글·댓글·공감은 서버 SQLite 에 있고 모든 방문자가 같은 내용을 본다.
 * 여기서는 화면이 바로 쓸 수 있도록 단지별 캐시만 들고 있다가 API 응답으로 갈아 끼운다.
 * "내가 공감했는지"(likedByMe)는 서버가 익명 쿠키 기준으로 계산해서 내려 준다.
 */

export const CATEGORIES = [
  { value: '분위기', label: '동네 분위기' },
  { value: '개발호재', label: '개발 호재' },
  { value: '생활정보', label: '생활 정보' },
  { value: '청약문의', label: '청약 문의' },
  { value: '자유', label: '자유 수다' },
];

export const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label]));

const state = reactive({
  /** noticeId -> 글 목록 (최신순) */
  posts: {},
  /** noticeId -> 같은 지역 다른 단지 글 */
  nearby: {},
  /** noticeId -> 글 수 (카드 목록에서 쓰는 가벼운 값) */
  counts: {},
  loading: {},
  error: '',
});

function replacePost(noticeId, post) {
  const list = state.posts[noticeId];
  if (!list) return;
  const i = list.findIndex((p) => p.id === post.id);
  if (i >= 0) list.splice(i, 1, post);
}

/** 어느 단지 글인지 모르는 응답(인근 글 공감 등)도 캐시 전체에서 찾아 갱신한다. */
function replaceEverywhere(post) {
  for (const [noticeId, list] of Object.entries(state.posts)) {
    if (list.some((p) => p.id === post.id)) replacePost(noticeId, post);
  }
  for (const list of Object.values(state.nearby)) {
    const i = list.findIndex((p) => p.id === post.id);
    if (i >= 0) list.splice(i, 1, post);
  }
}

const byNewest = (a, b) => new Date(b.createdAt) - new Date(a.createdAt);

export const communityStore = {
  counts: computed(() => state.counts),
  error: computed(() => state.error),

  isLoading(noticeId) {
    return Boolean(state.loading[noticeId]);
  },

  hydrateCounts(counts) {
    state.counts = counts ?? {};
  },

  countFor(noticeId) {
    return state.counts[noticeId] ?? 0;
  },

  postsFor(noticeId, sort = 'latest') {
    const list = state.posts[noticeId] ?? [];
    return sort === 'likes' ? [...list].sort((a, b) => b.likes - a.likes || byNewest(a, b)) : [...list].sort(byNewest);
  },

  nearbyFor(noticeId) {
    return state.nearby[noticeId] ?? [];
  },

  /** 상세의 커뮤니티 탭을 열 때 호출. 이미 받아 둔 게 있으면 조용히 갱신만 한다. */
  async load(noticeId, { force = false } = {}) {
    if (!noticeId) return;
    if (!force && state.posts[noticeId] && !state.loading[noticeId]) return;
    state.loading[noticeId] = true;
    state.error = '';
    try {
      const data = await api.community(noticeId);
      state.posts[noticeId] = data.posts;
      state.nearby[noticeId] = data.nearby;
      state.counts[noticeId] = data.posts.length;
      markOnline();
    } catch (e) {
      state.error = e.message;
      if (e.offline) markOffline(e);
    } finally {
      state.loading[noticeId] = false;
    }
  },

  async addPost(noticeId, { category, title, content, author }) {
    const { post, postCounts } = await api.createPost(noticeId, { category, title, content, author });
    state.posts[noticeId] = [post, ...(state.posts[noticeId] ?? [])];
    state.counts = postCounts;
    return post;
  },

  async toggleLike(postId) {
    const { post } = await api.like(postId);
    replaceEverywhere(post);
    return post;
  },

  async addComment(postId, content, author) {
    const text = String(content ?? '').trim();
    if (!text) return null;
    const { post } = await api.comment(postId, { content: text, author });
    replaceEverywhere(post);
    return post;
  },

  /** 신고는 취소할 수 없는 단방향 동작이다 — 일정 인원이 신고하면 서버가 내용을 모두에게 가린다. */
  async reportPost(postId, reason = '') {
    const { post } = await api.reportPost(postId, reason);
    replaceEverywhere(post);
    return post;
  },

  async reportComment(commentId, reason = '') {
    const { post } = await api.reportComment(commentId, reason);
    replaceEverywhere(post);
    return post;
  },
};

export function formatPostDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return '방금';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`;
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}
