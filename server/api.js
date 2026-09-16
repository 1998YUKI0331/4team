import express from 'express';
import { randomUUID } from 'node:crypto';
import {
  CATEGORIES,
  commentExists,
  getProfile,
  insertComment,
  insertPost,
  listNearbyPosts,
  listPosts,
  postCounts,
  postExists,
  recordVisit,
  reportComment,
  reportPost,
  saveProfile,
  scheduleIds,
  toggleLike,
  toggleSchedule,
  visitCounts,
} from './db.js';
import { isKnownNotice } from './notices.js';

/**
 * 커뮤니티·방문수·프로필 API.
 *
 * 로그인은 없다. 대신 서버가 심어 주는 익명 식별자 쿠키(cy_uid)로 사람을 구분한다.
 * "내가 공감했는지", 방문 쿨다운, 내 조건 프로필이 여기에 묶인다.
 * 나중에 로그인을 붙이면 이 uid 자리에 계정 id 를 넣으면 된다.
 */

const UID_COOKIE = 'cy_uid';
const YEAR = 365 * 24 * 60 * 60;

/** 같은 사람이 같은 단지를 다시 열어도 이 시간 안에는 방문수가 오르지 않는다. */
const VISIT_COOLDOWN_MS = Number(process.env.VISIT_COOLDOWN_MS ?? 30 * 60 * 1000);

const LIMITS = {
  title: 80,
  content: 2000,
  author: 20,
  comment: 400,
  reportReason: 100,
};

function readCookie(header, name) {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

function identify(req, res, next) {
  let uid = readCookie(req.headers.cookie, UID_COOKIE);
  if (!uid || !/^[\w-]{8,64}$/.test(uid)) {
    uid = randomUUID();
    res.cookie(UID_COOKIE, uid, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: YEAR * 1000,
      secure: req.secure,
      path: '/',
    });
  }
  req.uid = uid;
  next();
}

/** 메모리 기반의 아주 단순한 쓰기 제한. 재시작하면 초기화된다(그래도 충분). */
function rateLimit(name, max, windowMs) {
  const hits = new Map();
  return (req, res, next) => {
    const key = `${name}:${req.uid}`;
    const now = Date.now();
    const cur = hits.get(key);
    if (!cur || now > cur.resetAt) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (cur.count >= max) {
      const after = Math.ceil((cur.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(after));
      return res.status(429).json({ error: '잠시 후 다시 시도해 주세요.', retryAfter: after });
    }
    cur.count += 1;
    next();
  };
}

const clean = (v, max) => String(v ?? '').trim().slice(0, max);

export function createApi(db) {
  const api = express();
  api.disable('x-powered-by');
  api.use('/api', express.json({ limit: '32kb' }), identify);

  api.get('/api/bootstrap', (req, res) => {
    res.json({
      uid: req.uid,
      categories: CATEGORIES,
      visits: visitCounts(db),
      postCounts: postCounts(db),
      profile: getProfile(db, req.uid),
      schedules: scheduleIds(db, req.uid),
    });
  });

  api.get('/api/health', (_req, res) => res.json({ ok: true }));

  api.get('/api/notices/:id/community', (req, res) => {
    const { id } = req.params;
    if (!isKnownNotice(id)) return res.status(404).json({ error: '없는 공고입니다.' });
    res.json({ posts: listPosts(db, id, req.uid), nearby: listNearbyPosts(db, id, req.uid) });
  });

  api.post('/api/notices/:id/posts', rateLimit('post', 12, 60 * 60 * 1000), (req, res) => {
    const { id } = req.params;
    if (!isKnownNotice(id)) return res.status(404).json({ error: '없는 공고입니다.' });

    const title = clean(req.body?.title, LIMITS.title);
    const content = clean(req.body?.content, LIMITS.content);
    const author = clean(req.body?.author, LIMITS.author) || '익명';
    const category = CATEGORIES.includes(req.body?.category) ? req.body.category : '자유';
    if (!title) return res.status(400).json({ error: '제목을 입력해 주세요.' });
    if (!content) return res.status(400).json({ error: '내용을 입력해 주세요.' });

    const post = insertPost(db, { noticeId: id, category, title, content, author, uid: req.uid });
    res.status(201).json({ post, postCounts: postCounts(db) });
  });

  api.post('/api/posts/:postId/like', rateLimit('like', 120, 60 * 60 * 1000), (req, res) => {
    const { postId } = req.params;
    if (!postExists(db, postId)) return res.status(404).json({ error: '없는 글입니다.' });
    res.json({ post: toggleLike(db, postId, req.uid) });
  });

  api.post('/api/posts/:postId/comments', rateLimit('comment', 40, 60 * 60 * 1000), (req, res) => {
    const { postId } = req.params;
    if (!postExists(db, postId)) return res.status(404).json({ error: '없는 글입니다.' });
    const content = clean(req.body?.content, LIMITS.comment);
    if (!content) return res.status(400).json({ error: '댓글 내용을 입력해 주세요.' });
    const author = clean(req.body?.author, LIMITS.author) || '익명';
    res.status(201).json({ post: insertComment(db, { postId, author, content, uid: req.uid }) });
  });

  api.post('/api/posts/:postId/report', rateLimit('report', 30, 60 * 60 * 1000), (req, res) => {
    const { postId } = req.params;
    if (!postExists(db, postId)) return res.status(404).json({ error: '없는 글입니다.' });
    const reason = clean(req.body?.reason, LIMITS.reportReason);
    res.json({ post: reportPost(db, postId, req.uid, reason) });
  });

  api.post('/api/comments/:commentId/report', rateLimit('report', 30, 60 * 60 * 1000), (req, res) => {
    const { commentId } = req.params;
    if (!commentExists(db, commentId)) return res.status(404).json({ error: '없는 댓글입니다.' });
    const reason = clean(req.body?.reason, LIMITS.reportReason);
    const post = reportComment(db, commentId, req.uid, reason);
    if (!post) return res.status(404).json({ error: '없는 댓글입니다.' });
    res.json({ post });
  });

  api.post('/api/notices/:id/visit', rateLimit('visit', 300, 60 * 60 * 1000), (req, res) => {
    const { id } = req.params;
    if (!isKnownNotice(id)) return res.status(404).json({ error: '없는 공고입니다.' });
    const counted = recordVisit(db, id, req.uid, VISIT_COOLDOWN_MS);
    res.json({ counted, visits: visitCounts(db) });
  });

  api.post('/api/notices/:id/schedule/toggle', rateLimit('schedule', 120, 60 * 60 * 1000), (req, res) => {
    const { id } = req.params;
    if (!isKnownNotice(id)) return res.status(404).json({ error: '없는 공고입니다.' });
    res.json(toggleSchedule(db, req.uid, id));
  });

  api.get('/api/profile', (req, res) => res.json({ profile: getProfile(db, req.uid) }));

  api.put('/api/profile', rateLimit('profile', 240, 60 * 60 * 1000), (req, res) => {
    const profile = req.body?.profile;
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
      return res.status(400).json({ error: '프로필 형식이 올바르지 않습니다.' });
    }
    // 값 종류를 제한해 임의의 데이터를 쌓아 두지 않는다.
    // 새 입력을 MatchPanel 에 추가하면 여기에도 넣어야 저장된다.
    const allowed = [
      'age', 'household', 'marital', 'children', 'subMonths', 'income',
      'noHouse', 'firstHome', 'parentSupport', 'newborn',
      'residence', 'incomeBase',
      'assetRealty', 'assetCar', 'assetFinance', 'assetEtc',
      'subCount', 'subTotal',
      'incomeSelf', 'incomeSpouse', 'incomeOther',
    ];
    const slim = {};
    for (const key of allowed) {
      const v = profile[key];
      if (typeof v === 'number' && Number.isFinite(v)) slim[key] = v;
      else if (typeof v === 'boolean') slim[key] = v;
      else if (typeof v === 'string') slim[key] = v.slice(0, 20);
    }
    saveProfile(db, req.uid, slim);
    res.json({ profile: slim });
  });

  api.use('/api', (_req, res) => res.status(404).json({ error: 'API 경로를 찾을 수 없습니다.' }));

  // eslint-disable-next-line no-unused-vars -- express 는 인자 4개로 에러 핸들러를 구분한다
  api.use('/api', (err, _req, res, _next) => {
    console.error('[api]', err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  });

  return api;
}
