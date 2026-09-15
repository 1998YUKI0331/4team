import { reactive, computed } from 'vue';
import { NOTICE_BY_ID } from '../lib/notices';

/**
 * 단지별 지역 커뮤니티.
 *
 * 기존 앱에서는 "지역 커뮤니티"가 독립 탭이었지만, 실제로 궁금한 건 늘 특정 단지라서
 * 글을 단지(공고 id)에 매단다. 상세 화면의 커뮤니티 탭이 그 단지 글을 보여 주고,
 * 같은 시·도의 다른 단지 글은 "인근 단지" 로 따로 묶어 준다.
 *
 * 저장소는 브라우저 localStorage 한 곳뿐이다(데모). 서버가 붙으면 이 파일의
 * load/persist 만 API 호출로 바꾸면 된다.
 */

const STORAGE_KEY = 'cheongyak_community_v2';

export const CATEGORIES = [
  { value: '분위기', label: '동네 분위기' },
  { value: '개발호재', label: '개발 호재' },
  { value: '생활정보', label: '생활 정보' },
  { value: '청약문의', label: '청약 문의' },
  { value: '자유', label: '자유 수다' },
];

export const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label]));

const SEED_POSTS = [
  {
    id: 'seed-n47-1',
    noticeId: 'n47',
    category: '개발호재',
    title: '분당 재건축 분위기, 요즘 체감상 어떤가요?',
    author: '분당10년차',
    content:
      '선도지구 지정 이후로 동네 부동산 문의가 확 늘었다고 하네요. 실제로 사시는 분들 체감은 어떠신지 궁금합니다.',
    createdAt: '2026-09-12T09:12:00+09:00',
    likes: 14,
    likedByMe: false,
    comments: [
      {
        id: 'seed-c1',
        author: '이매동주민',
        content: '주말에 임장 다니는 분들 많아졌어요. 다만 아직 실거래는 잠잠한 편입니다.',
        createdAt: '2026-09-12T11:03:00+09:00',
      },
    ],
  },
  {
    id: 'seed-n47-2',
    noticeId: 'n47',
    category: '청약문의',
    title: '청약통장 24개월 조건이면 특별공급도 같은 기준인가요?',
    author: '익명',
    content: '공고문에 가입 24개월 이상으로 되어 있는데, 신혼부부 특별공급도 동일하게 보면 되는지 헷갈리네요.',
    createdAt: '2026-09-13T20:41:00+09:00',
    likes: 6,
    likedByMe: false,
    comments: [],
  },
  {
    id: 'seed-n40-1',
    noticeId: 'n40',
    category: '생활정보',
    title: '검암역 주변 병원·마트 이용 후기',
    author: '검단맘',
    content: '입주 6개월째인데 대형마트는 차로 15분, 소아과는 아직 대기가 좀 있어요. 그래도 점점 나아지는 중입니다.',
    createdAt: '2026-09-09T14:20:00+09:00',
    likes: 21,
    likedByMe: false,
    comments: [
      { id: 'seed-c2', author: '예비입주자', content: '좋은 정보 감사해요 :)', createdAt: '2026-09-10T08:15:00+09:00' },
    ],
  },
  {
    id: 'seed-n42-1',
    noticeId: 'n42',
    category: '분위기',
    title: '월곡 쪽 밤에 다니기 괜찮나요?',
    author: '익명',
    content: '직장이 성수라 출퇴근은 괜찮을 것 같은데, 단지 주변 야간 분위기나 소음은 어떤지 궁금합니다.',
    createdAt: '2026-09-11T22:05:00+09:00',
    likes: 9,
    likedByMe: false,
    comments: [],
  },
  {
    id: 'seed-n48-1',
    noticeId: 'n48',
    category: '개발호재',
    title: '화서역 스타필드 이후로 생활권 많이 바뀌었나요?',
    author: '수원살이',
    content: '주말마다 사람이 많아져서 차는 좀 막히는데, 대신 웬만한 건 동네에서 다 해결됩니다.',
    createdAt: '2026-09-08T18:30:00+09:00',
    likes: 12,
    likedByMe: false,
    comments: [
      {
        id: 'seed-c3',
        author: '정자동',
        content: '평일 저녁은 한산해요. 주말 낮만 피하면 괜찮습니다.',
        createdAt: '2026-09-08T21:02:00+09:00',
      },
    ],
  },
  {
    id: 'seed-n53-1',
    noticeId: 'n53',
    category: '청약문의',
    title: '신혼·신생아 매입임대 상시 접수인가요?',
    author: '용인예비',
    content: '마감일이 따로 안 적혀 있는데 수시 모집인지, 아니면 공고문에 별도 일정이 있는지 아시는 분 계실까요?',
    createdAt: '2026-09-14T10:11:00+09:00',
    likes: 4,
    likedByMe: false,
    comments: [],
  },
];

function newId(prefix) {
  const rand =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

/** 저장된 글은 사용자가 만든 값이라 형태를 믿지 않고 한 번 씻어서 쓴다. */
function normalize(post) {
  if (!post || typeof post !== 'object') return null;
  if (!post.id || !post.title) return null;
  return {
    id: String(post.id),
    noticeId: post.noticeId ? String(post.noticeId) : null,
    category: CATEGORY_LABEL[post.category] ? post.category : '자유',
    title: String(post.title).slice(0, 80),
    content: String(post.content ?? '').slice(0, 2000),
    author: String(post.author || '익명').slice(0, 20),
    createdAt: post.createdAt ?? new Date().toISOString(),
    likes: Number.isFinite(post.likes) ? post.likes : 0,
    likedByMe: Boolean(post.likedByMe),
    comments: Array.isArray(post.comments)
      ? post.comments
          .filter((c) => c && c.content)
          .map((c) => ({
            id: c.id ?? newId('c'),
            author: String(c.author || '익명').slice(0, 20),
            content: String(c.content).slice(0, 400),
            createdAt: c.createdAt ?? new Date().toISOString(),
          }))
      : [],
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(normalize).filter(Boolean);
    }
  } catch {
    // 시크릿 모드처럼 localStorage 를 못 쓰는 환경 — 예시 글로 시작한다.
  }
  return SEED_POSTS.map(normalize).filter(Boolean);
}

const state = reactive({ posts: load() });

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.posts));
  } catch {
    // 저장에 실패해도 화면에는 남아 있게 둔다.
  }
}

const byNewest = (a, b) => new Date(b.createdAt) - new Date(a.createdAt);

export const communityStore = {
  posts: computed(() => state.posts),

  /** 이 단지에 달린 글 */
  postsFor(noticeId, sort = 'latest') {
    const list = state.posts.filter((p) => p.noticeId === noticeId);
    return sort === 'likes' ? [...list].sort((a, b) => b.likes - a.likes || byNewest(a, b)) : [...list].sort(byNewest);
  },

  /** 같은 시·도의 다른 단지 글 */
  nearbyPostsFor(notice, limit = 6) {
    if (!notice) return [];
    return state.posts
      .filter((p) => {
        if (p.noticeId === notice.id) return false;
        const other = p.noticeId ? NOTICE_BY_ID.get(p.noticeId) : null;
        return other ? other.region === notice.region : false;
      })
      .sort(byNewest)
      .slice(0, limit);
  },

  countFor(noticeId) {
    return state.posts.reduce((n, p) => (p.noticeId === noticeId ? n + 1 : n), 0);
  },

  commentCountFor(noticeId) {
    return state.posts.reduce((n, p) => (p.noticeId === noticeId ? n + p.comments.length : n), 0);
  },

  recent(limit = 20) {
    return [...state.posts].sort(byNewest).slice(0, limit);
  },

  addPost({ noticeId, category, title, content, author }) {
    const post = normalize({
      id: newId('p'),
      noticeId,
      category,
      title,
      content,
      author,
      createdAt: new Date().toISOString(),
      likes: 0,
      likedByMe: false,
      comments: [],
    });
    if (!post) return null;
    state.posts.unshift(post);
    persist();
    return post;
  },

  toggleLike(postId) {
    const post = state.posts.find((p) => p.id === postId);
    if (!post) return;
    post.likedByMe = !post.likedByMe;
    post.likes = Math.max(0, post.likes + (post.likedByMe ? 1 : -1));
    persist();
  },

  addComment(postId, content, author) {
    const post = state.posts.find((p) => p.id === postId);
    const text = String(content ?? '').trim();
    if (!post || !text) return;
    post.comments.push({
      id: newId('c'),
      author: String(author || '').trim() || '익명',
      content: text.slice(0, 400),
      createdAt: new Date().toISOString(),
    });
    persist();
  },

  removePost(postId) {
    const idx = state.posts.findIndex((p) => p.id === postId);
    if (idx >= 0) {
      state.posts.splice(idx, 1);
      persist();
    }
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
