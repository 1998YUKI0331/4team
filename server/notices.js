import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 서버도 공고 목록을 알아야 한다.
 *  - 없는 공고 id 로 글이 들어오는 걸 막고
 *  - "같은 지역 다른 단지" 를 고를 때 지역을 알아야 하기 때문.
 * 앱이 쓰는 것과 같은 파일(src/data/notices.geo.json)을 그대로 읽는다.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(HERE, '..', 'src', 'data', 'notices.geo.json');

const raw = JSON.parse(fs.readFileSync(DATA, 'utf8'));

export const NOTICES = raw.items.map((n) => ({
  id: n.id,
  title: n.title,
  region: n.region ?? null,
  district: n.district ?? null,
}));

export const NOTICE_BY_ID = new Map(NOTICES.map((n) => [n.id, n]));

export function isKnownNotice(id) {
  return NOTICE_BY_ID.has(id);
}

/** 같은 시·도에 있는 다른 단지들 */
export function siblingNoticeIds(noticeId) {
  const me = NOTICE_BY_ID.get(noticeId);
  if (!me) return [];
  return NOTICES.filter((n) => n.id !== noticeId && n.region === me.region).map((n) => n.id);
}
