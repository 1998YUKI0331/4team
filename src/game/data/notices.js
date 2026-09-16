// 게임 전용 원본. 지도 앱의 루트 notices.json 과는 스키마·건수가 달라서 따로 둔다.
import raw from './notices.source.json' with { type: 'json' };
import { resolveDistrict, splitDistricts } from './geo.js';
import { MARKET, START_YEAR, START_MONTH, 억 } from './constants.js';
import { makeRng, rngRange, rngInt, clamp } from '../core/rng.js';

/* ───────────────────────────── 날짜 파싱 ───────────────────────────── */

/** "2026-07-02" 또는 "2026년 07월 10일(금)" 둘 다 처리 */
function parseDate(s) {
  if (!s) return null;
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return { y: +m[1], m: +m[2], d: +m[3] };
  m = /(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/.exec(s);
  if (m) return { y: +m[1], m: +m[2], d: +m[3] };
  return null;
}

function toTurn(date) {
  if (!date) return 0;
  return (date.y * 12 + (date.m - 1)) - (START_YEAR * 12 + (START_MONTH - 1));
}

/* ───────────────────────────── 분양가 파싱 ───────────────────────────── */

function parsePriceRange(비고) {
  if (typeof 비고 !== 'string') return null;
  const m = /최저\s*([\d,]+)\s*~\s*최고\s*([\d,]+)/.exec(비고);
  if (!m) return null;
  const rawLo = Number(m[1].replace(/,/g, ''));
  const rawHi = Number(m[2].replace(/,/g, ''));
  if (!rawLo || !rawHi || rawHi < rawLo) return null;
  const sample = /표본\s*(\d+)\s*건/.exec(비고);

  // 원문 범위는 소형 임대·근린생활시설까지 섞여 최저가가 비현실적으로 낮은 경우가 있다.
  // (예: 최저 1억 ~ 최고 24.5억) 주택형을 만들 때만 하한을 보정한다 — 원문은 그대로 보존.
  const lo = Math.max(rawLo, rawHi * 0.18);

  return { lo, hi: rawHi, rawLo, rawHi, clamped: lo !== rawLo, sample: sample ? +sample[1] : null };
}

/* ───────────────────────────── 주택형 생성 ───────────────────────────── */

const AREA_LADDERS = {
  wide:   [39, 59, 84, 114],
  medium: [59, 74, 84, 101],
  narrow: [74, 84, 101],
};

function buildUnitTypes(rng, range) {
  const ratio = range.hi / range.lo;
  const areas = ratio > 4 ? AREA_LADDERS.wide : ratio > 1.8 ? AREA_LADDERS.medium : AREA_LADDERS.narrow;
  const aMin = areas[0];
  const aMax = areas[areas.length - 1];
  const suffix = ['A', 'B', 'A', 'C'];

  return areas.map((area, i) => {
    const t = (area - aMin) / (aMax - aMin);
    // 소형일수록 단가가 높아 완전 선형은 아님 → 살짝 볼록하게
    const price = range.lo + (range.hi - range.lo) * Math.pow(t, 0.88);
    return {
      id: `t${i}`,
      area,
      label: `${area}㎡${suffix[i] ?? ''}`,
      pyeong: Math.round(area / 3.3058),
      price: Math.round(price / 1_000_000) * 1_000_000,
      // 대형일수록 경쟁이 덜하다(가점 커트라인 보정)
      demand: clamp(1.25 - (area - 59) / 150, 0.72, 1.3),
    };
  });
}

/* ───────────────────────────── 임대 조건 생성 ───────────────────────────── */

function buildRentTerms(rng, district, housingType) {
  const isPermanent = housingType.includes('영구');
  const isJeonse = housingType.includes('전세');
  const scale = 0.45 + district.tier * 0.22;

  if (isJeonse) {
    return {
      mode: '전세형',
      deposit: Math.round(rngRange(rng, 1.1, 2.4) * 억 * scale / 1_000_000) * 1_000_000,
      monthly: 0,
    };
  }
  if (isPermanent) {
    return {
      mode: '영구임대',
      deposit: Math.round(rngRange(rng, 300, 600) * 10_000),
      monthly: Math.round(rngRange(rng, 6, 12) * 10_000),
    };
  }
  return {
    mode: '매입·공공임대',
    deposit: Math.round(rngRange(rng, 1800, 6500) * 10_000 * scale),
    monthly: Math.round(rngRange(rng, 18, 46) * 10_000 * scale),
  };
}

/* ───────────────────────────── 메인 정규화 ───────────────────────────── */

function classify(n) {
  if (n._문서성격) return 'info';
  if (/임대/.test(n.housingType) && !/토지임대부/.test(n.housingType)) return 'rent';
  return 'sale';
}

function totalUnits(rng, specials, district, kind) {
  const declared = specials.reduce((s, sp) => s + (Number(sp.세대수) || 0), 0);
  if (declared > 0) return declared;
  if (kind === 'rent') return rngInt(rng, 12, 80);
  return rngInt(rng, 90, 120) + Math.round(rngInt(rng, 60, 700) * (1 - district.tier * 0.12));
}

function normalize(n, index) {
  const rng = makeRng(`${n.id}::cheongyak-road::v1`);
  const district = resolveDistrict(n.region, n.district);
  const kind = classify(n);
  const announce = parseDate(n.announce);
  const deadline = parseDate(n.deadline);
  const announceTurn = toTurn(announce);
  const deadlineTurn = deadline ? toTurn(deadline) : announceTurn;
  const range = parsePriceRange(n._비고);

  const specials = Array.isArray(n.special) ? n.special : [];
  const units = totalUnits(rng, specials, district, kind);

  // 특별공급 배정 세대수 (선언값이 없으면 비율로 배분)
  const declaredUnits = specials.some((sp) => sp.세대수);
  const weights = { 일반공급: 0.35, 신혼부부: 0.18, 생애최초: 0.14, 신생아: 0.12, 다자녀: 0.09, 노부모부양: 0.05, 기관추천: 0.07 };
  const wSum = specials.reduce((s, sp) => s + (weights[sp.type] ?? 0.05), 0) || 1;

  const supplies = specials.map((sp) => ({
    type: sp.type,
    units: declaredUnits
      ? (Number(sp.세대수) || Math.max(1, Math.round(units * 0.05)))
      : Math.max(1, Math.round(units * ((weights[sp.type] ?? 0.05) / wSum))),
    requiresNoHouse: sp.requiresNoHouse !== false,
    incomeLimit: sp.incomeLimit ?? null,
    minChildren: sp.minChildren ?? null,
    maxMarriageYears: sp.maxMarriageYears ?? null,
  }));

  const unitTypes = range ? buildUnitTypes(rng, range) : null;
  const rentTerms = kind === 'rent' ? buildRentTerms(rng, district, n.housingType) : null;

  // 시세 프리미엄 : 분양가 대비 실제 시세 배수 → "안전마진"
  const premium = kind === 'sale'
    ? clamp(MARKET.premiumByTier[district.tier] * rngRange(rng, 0.90, 1.14), 0.94, 1.62)
    : 1;

  // 공고별 인기 편차. 지역 등급·안전마진에 따른 기본 경쟁률은 lottery.js 가 계산한다.
  const heat = rngRange(rng, 0.72, 1.36);

  return {
    id: n.id,
    index,
    kind,                       // 'sale' | 'rent' | 'info'
    agency: n.agency,
    agencyName: n.agencyName ?? (n.agency === '민간' ? '민간 건설사' : n.agency),
    title: n.title,
    region: n.region,
    districtLabel: n.district,
    districts: splitDistricts(n.district),
    multiDistrict: splitDistricts(n.district).length > 1,
    district,                   // geo 객체
    housingType: n.housingType,
    announce: n.announce,
    announceTurn,
    deadline: n.deadline,
    deadlineTurn: Math.max(announceTurn, deadlineTurn),
    minSubMonths: n.minSubMonths ?? 0,
    minAge: n.minAge ?? 19,
    url: n.url,
    note: typeof n._비고 === 'string' ? n._비고 : null,
    infoDetail: typeof n._비고 === 'object' ? n._비고 : null,
    infoNature: n._문서성격 ?? null,
    priceRange: range,
    unitTypes,
    rentTerms,
    units,
    supplies,
    premium,
    heat,
    seed: `${n.id}::cheongyak-road::v1`,
  };
}

export const NOTICES = raw
  .map(normalize)
  .sort((a, b) => a.announceTurn - b.announceTurn || a.id.localeCompare(b.id));

export const APPLICABLE = NOTICES.filter((n) => n.kind !== 'info');
export const INFO_NOTICES = NOTICES.filter((n) => n.kind === 'info');

/** 마지막 실데이터 공고가 뜨는 턴 — 이후는 절차적으로 공고를 생성한다 */
export const LAST_REAL_TURN = Math.max(...NOTICES.map((n) => n.announceTurn));

/** 특정 턴에 "접수 중"인 공고 (공고월 ~ 마감월) */
export function noticesOpenAt(turn, pool = APPLICABLE) {
  return pool.filter((n) => turn >= n.announceTurn && turn <= n.deadlineTurn);
}

export function noticeById(id, pool = NOTICES) {
  return pool.find((n) => n.id === id) ?? null;
}
