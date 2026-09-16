import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { SEED_POSTS } from './seed.js';
import { isKnownNotice, siblingNoticeIds } from './notices.js';

/**
 * SQLite 한 파일이 전부인 저장소.
 *
 * 배포(Railway)에서는 볼륨을 /data 에 붙이고 DB_PATH=/data/app.db 로 쓴다.
 * 볼륨이 없으면 컨테이너가 재시작될 때마다 초기화되므로, 쓰기 가능한 곳을 찾지 못하면
 * 경고를 크게 찍고 임시 경로로 물러난다(앱은 뜨되 데이터는 휘발).
 */

const DEFAULT_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'app.db');

export const CATEGORIES = ['분위기', '개발호재', '생활정보', '청약문의', '자유'];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS posts (
  id          TEXT PRIMARY KEY,
  notice_id   TEXT NOT NULL,
  category    TEXT NOT NULL,
  title       TEXT NOT NULL,
  content     TEXT NOT NULL,
  author      TEXT NOT NULL,
  author_uid  TEXT NOT NULL DEFAULT '',
  seed_likes  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_posts_notice ON posts(notice_id, created_at DESC);

CREATE TABLE IF NOT EXISTS comments (
  id          TEXT PRIMARY KEY,
  post_id     TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author      TEXT NOT NULL,
  author_uid  TEXT NOT NULL DEFAULT '',
  content     TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id, created_at);

CREATE TABLE IF NOT EXISTS post_likes (
  post_id    TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  uid        TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (post_id, uid)
);

CREATE TABLE IF NOT EXISTS visits (
  notice_id TEXT PRIMARY KEY,
  count     INTEGER NOT NULL DEFAULT 0,
  last_at   INTEGER NOT NULL DEFAULT 0
);

-- 같은 사람이 새로고침으로 방문수를 부풀리지 못하게 하는 쿨다운 기록
CREATE TABLE IF NOT EXISTS visit_log (
  notice_id TEXT NOT NULL,
  uid       TEXT NOT NULL,
  at        INTEGER NOT NULL,
  PRIMARY KEY (notice_id, uid)
);

CREATE TABLE IF NOT EXISTS profiles (
  uid        TEXT PRIMARY KEY,
  data       TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 사람마다 "청약마감 캘린더"에 저장해 둔 공고
CREATE TABLE IF NOT EXISTS saved_schedules (
  uid        TEXT NOT NULL,
  notice_id  TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (uid, notice_id)
);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

function ensureWritableDir(file) {
  const dir = path.dirname(file);
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
    return file;
  } catch (e) {
    const fallback = path.join('/tmp', 'cheongyak-app.db');
    console.warn(
      `[db] ${dir} 에 쓸 수 없습니다(${e.code ?? e.message}). ${fallback} 로 대체합니다. ` +
        '재시작하면 데이터가 사라지니 Railway 볼륨을 /data 에 연결하세요.'
    );
    return fallback;
  }
}

export function openDb(file = DEFAULT_PATH) {
  const target = ensureWritableDir(file);
  const db = new DatabaseSync(target);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA busy_timeout = 4000');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(SCHEMA);
  seedIfEmpty(db);
  console.log(`[db] ready: ${target}`);
  return db;
}

function seedIfEmpty(db) {
  const seeded = db.prepare('SELECT value FROM meta WHERE key = ?').get('seeded');
  if (seeded) return;
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM posts').get();
  if (n === 0) {
    for (const p of SEED_POSTS) {
      if (!isKnownNotice(p.noticeId)) continue;
      const id = `seed-${randomUUID().slice(0, 8)}`;
      db.prepare(
        `INSERT INTO posts (id, notice_id, category, title, content, author, author_uid, seed_likes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, '', ?, ?)`
      ).run(id, p.noticeId, p.category, p.title, p.content, p.author, p.likes ?? 0, p.createdAt);
      for (const c of p.comments ?? []) {
        db.prepare(
          `INSERT INTO comments (id, post_id, author, author_uid, content, created_at) VALUES (?, ?, ?, '', ?, ?)`
        ).run(`seed-${randomUUID().slice(0, 8)}`, id, c.author, c.content, c.createdAt);
      }
    }
  }
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run('seeded', new Date().toISOString());
}

/* --------------------------------------------------------------- 커뮤니티 */

/**
 * 공감수 = 예시 글에 붙여 둔 초기값(seed_likes) + 실제 누른 사람 수.
 * 이렇게 해야 데모 숫자를 유지하면서도 "내가 눌렀는지"를 정확히 알 수 있다.
 */
const POST_SELECT = `
  SELECT p.id, p.notice_id AS noticeId, p.category, p.title, p.content, p.author, p.created_at AS createdAt,
         p.seed_likes + (SELECT COUNT(*) FROM post_likes l WHERE l.post_id = p.id) AS likes,
         EXISTS (SELECT 1 FROM post_likes l2 WHERE l2.post_id = p.id AND l2.uid = ?) AS likedByMe
  FROM posts p
`;

function attachComments(db, posts) {
  if (!posts.length) return posts;
  const stmt = db.prepare(
    'SELECT id, author, content, created_at AS createdAt FROM comments WHERE post_id = ? ORDER BY created_at'
  );
  for (const p of posts) {
    p.likedByMe = Boolean(p.likedByMe);
    p.comments = stmt.all(p.id);
  }
  return posts;
}

export function listPosts(db, noticeId, uid) {
  const rows = db.prepare(`${POST_SELECT} WHERE p.notice_id = ? ORDER BY p.created_at DESC`).all(uid, noticeId);
  return attachComments(db, rows);
}

/** 같은 시·도의 다른 단지 글 (커뮤니티 하단 "인근 단지 이야기") */
export function listNearbyPosts(db, noticeId, uid, limit = 6) {
  const siblings = siblingNoticeIds(noticeId);
  if (!siblings.length) return [];
  const holes = siblings.map(() => '?').join(',');
  const rows = db
    .prepare(`${POST_SELECT} WHERE p.notice_id IN (${holes}) ORDER BY p.created_at DESC LIMIT ?`)
    .all(uid, ...siblings, limit);
  return attachComments(db, rows);
}

/** 목록 화면에서 카드마다 보여 주는 글 수 */
export function postCounts(db) {
  const rows = db.prepare('SELECT notice_id AS id, COUNT(*) AS n FROM posts GROUP BY notice_id').all();
  return Object.fromEntries(rows.map((r) => [r.id, r.n]));
}

export function insertPost(db, { noticeId, category, title, content, author, uid }) {
  const id = `p-${randomUUID()}`;
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO posts (id, notice_id, category, title, content, author, author_uid, seed_likes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`
  ).run(id, noticeId, category, title, content, author, uid, createdAt);
  return getPost(db, id, uid);
}

export function getPost(db, id, uid) {
  const row = db.prepare(`${POST_SELECT} WHERE p.id = ?`).get(uid, id);
  if (!row) return null;
  return attachComments(db, [row])[0];
}

export function toggleLike(db, postId, uid) {
  const exists = db.prepare('SELECT 1 AS hit FROM post_likes WHERE post_id = ? AND uid = ?').get(postId, uid);
  if (exists) db.prepare('DELETE FROM post_likes WHERE post_id = ? AND uid = ?').run(postId, uid);
  else
    db.prepare('INSERT INTO post_likes (post_id, uid, created_at) VALUES (?, ?, ?)').run(
      postId,
      uid,
      new Date().toISOString()
    );
  return getPost(db, postId, uid);
}

export function insertComment(db, { postId, author, content, uid }) {
  db.prepare(
    'INSERT INTO comments (id, post_id, author, author_uid, content, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(`c-${randomUUID()}`, postId, author, uid, content, new Date().toISOString());
  return getPost(db, postId, uid);
}

export function postExists(db, postId) {
  return Boolean(db.prepare('SELECT 1 AS hit FROM posts WHERE id = ?').get(postId));
}

/* ------------------------------------------------------------------ 방문 */

export function visitCounts(db) {
  const rows = db.prepare('SELECT notice_id AS id, count, last_at AS at FROM visits WHERE count > 0').all();
  return Object.fromEntries(rows.map((r) => [r.id, { count: r.count, at: r.at }]));
}

/**
 * @returns {boolean} 실제로 카운트가 올랐는지 (쿨다운 중이면 false)
 */
export function recordVisit(db, noticeId, uid, cooldownMs) {
  const now = Date.now();
  const last = db.prepare('SELECT at FROM visit_log WHERE notice_id = ? AND uid = ?').get(noticeId, uid);
  if (last && now - last.at < cooldownMs) return false;

  db.prepare(
    `INSERT INTO visit_log (notice_id, uid, at) VALUES (?, ?, ?)
     ON CONFLICT(notice_id, uid) DO UPDATE SET at = excluded.at`
  ).run(noticeId, uid, now);
  db.prepare(
    `INSERT INTO visits (notice_id, count, last_at) VALUES (?, 1, ?)
     ON CONFLICT(notice_id) DO UPDATE SET count = count + 1, last_at = excluded.last_at`
  ).run(noticeId, now);
  return true;
}

/* ---------------------------------------------------------------- 프로필 */

export function getProfile(db, uid) {
  const row = db.prepare('SELECT data FROM profiles WHERE uid = ?').get(uid);
  if (!row) return null;
  try {
    return JSON.parse(row.data);
  } catch {
    return null;
  }
}

export function saveProfile(db, uid, profile) {
  db.prepare(
    `INSERT INTO profiles (uid, data, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(uid) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
  ).run(uid, JSON.stringify(profile), new Date().toISOString());
}

/* -------------------------------------------------------------- 캘린더 */

export function scheduleIds(db, uid) {
  return db
    .prepare('SELECT notice_id AS id FROM saved_schedules WHERE uid = ? ORDER BY created_at')
    .all(uid)
    .map((r) => r.id);
}

/** @returns {{ saved: boolean, ids: string[] }} 토글 후 상태와 uid 의 전체 저장 목록 */
export function toggleSchedule(db, uid, noticeId) {
  const exists = db.prepare('SELECT 1 AS hit FROM saved_schedules WHERE uid = ? AND notice_id = ?').get(uid, noticeId);
  if (exists) {
    db.prepare('DELETE FROM saved_schedules WHERE uid = ? AND notice_id = ?').run(uid, noticeId);
  } else {
    db.prepare('INSERT INTO saved_schedules (uid, notice_id, created_at) VALUES (?, ?, ?)').run(
      uid,
      noticeId,
      new Date().toISOString()
    );
  }
  return { saved: !exists, ids: scheduleIds(db, uid) };
}
