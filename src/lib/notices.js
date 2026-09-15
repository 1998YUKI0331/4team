import raw from '../data/notices.geo.json';

/* ------------------------------------------------------------------ 날짜 */

/** notices.json 에 "2026-08-13" 과 "2026년 08월 13일(목)" 이 섞여 있다. */
export function parseDate(value) {
  if (!value) return null;
  const iso = String(value).match(/(\d{4})-(\d{2})-(\d{2})/);
  const ko = String(value).match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  const m = iso ?? ko;
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

export function formatDate(value) {
  const d = parseDate(value);
  if (!d) return '-';
  const week = '일월화수목금토'[d.getDay()];
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}(${week})`;
}

/* ------------------------------------------------------------------ 금액 */

export function formatWon(n) {
  if (!n && n !== 0) return null;
  const eok = Math.floor(n / 1e8);
  const man = Math.round((n % 1e8) / 1e4);
  if (eok > 0) return man > 0 ? `${eok}억 ${man.toLocaleString()}만` : `${eok}억`;
  return `${man.toLocaleString()}만`;
}

/** 마커처럼 좁은 자리에 쓰는 짧은 표기 */
export function formatWonShort(n) {
  if (!n && n !== 0) return null;
  if (n >= 1e8) {
    const eok = n / 1e8;
    return `${eok >= 10 ? Math.round(eok) : eok.toFixed(1).replace(/\.0$/, '')}억`;
  }
  return `${Math.round(n / 1e4).toLocaleString()}만`;
}

/* ------------------------------------------------------------------ 상태 */

export const CATEGORY_META = {
  민간분양: { key: '민간분양', color: '#ff5a36', label: '민간분양' },
  공공분양: { key: '공공분양', color: '#2f6bff', label: '공공분양' },
  임대: { key: '임대', color: '#00b06b', label: '임대' },
  기타: { key: '기타', color: '#8b95a1', label: '기타' },
};

export const SPECIAL_TYPES = ['신혼부부', '신생아', '다자녀', '생애최초', '노부모부양', '기관추천', '일반공급'];

function statusOf(deadline) {
  const d = parseDate(deadline);
  if (!d) return { status: 'unknown', dday: null, label: '일정 확인' };
  const diff = Math.round((d - startOfToday()) / 86400000);
  if (diff < 0) return { status: 'closed', dday: diff, label: '접수마감' };
  if (diff === 0) return { status: 'open', dday: 0, label: '오늘마감' };
  return { status: 'open', dday: diff, label: `D-${diff}` };
}

/** 지오코딩 정밀도 -> 화면 표기 */
const PRECISION_LABEL = {
  lot: null, // 지번까지 맞음 -> 별도 표기 없음
  dong: '동 단위 근사',
  gu: '구 단위 근사',
  district: '시·군 단위 근사',
  region: '시·도 단위 근사',
};

export const NOTICES = raw.items
  .map((it) => {
    const s = statusOf(it.deadline);
    return {
      ...it,
      ...s,
      announceDate: parseDate(it.announce),
      deadlineDate: parseDate(it.deadline),
      approxLabel: PRECISION_LABEL[it.precision] ?? null,
      color: (CATEGORY_META[it.category] ?? CATEGORY_META.기타).color,
      searchText: [it.title, it.region, it.district, it.address, it.agencyName, it.agency]
        .filter(Boolean)
        .join(' ')
        .toLowerCase(),
    };
  })
  .sort((a, b) => {
    // 접수중 -> 일정미정 -> 마감. 같은 그룹 안에서는 임박/최신 순.
    const rank = { open: 0, unknown: 1, closed: 2 };
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
    if (a.status === 'open') return a.dday - b.dday;
    if (a.status === 'closed') return (b.deadlineDate ?? 0) - (a.deadlineDate ?? 0);
    return (b.announceDate ?? 0) - (a.announceDate ?? 0);
  });

export const GENERATED_AT = raw.generatedAt;

export const REGIONS = [...new Set(NOTICES.map((n) => n.region).filter(Boolean))];

/* ---------------------------------------------------------------- 필터링 */

export const DEFAULT_FILTERS = {
  q: '',
  categories: [],
  regions: [],
  specials: [],
  openOnly: false,
  priceMax: null, // 원 단위. 최저 분양가 기준.
};

export function applyFilters(list, f) {
  const q = f.q.trim().toLowerCase();
  return list.filter((n) => {
    if (q && !n.searchText.includes(q)) return false;
    if (f.categories.length && !f.categories.includes(n.category)) return false;
    if (f.regions.length && !f.regions.includes(n.region)) return false;
    if (f.openOnly && n.status !== 'open') return false;
    if (f.specials.length && !f.specials.some((s) => n.specialTypes.includes(s))) return false;
    if (f.priceMax != null) {
      if (n.priceMin == null) return false;
      if (n.priceMin > f.priceMax) return false;
    }
    return true;
  });
}

export function countActiveFilters(f) {
  return (
    (f.q.trim() ? 1 : 0) +
    f.categories.length +
    f.regions.length +
    f.specials.length +
    (f.openOnly ? 1 : 0) +
    (f.priceMax != null ? 1 : 0)
  );
}
