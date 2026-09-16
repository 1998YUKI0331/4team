/**
 * notices.json 은 2026-09 까지만 있다. 게임은 최장 11년이므로
 * 그 이후 턴은 실데이터의 통계(지역 분포·분양가 수준·특공 구성)를 본떠
 * 절차적으로 공고를 생성한다. 생성된 공고는 실데이터와 완전히 같은 형태다.
 */

import { DISTRICT_LIST } from './geo.js';
import { MARKET, 억 } from './constants.js';
import { makeRng, rngRange, rngInt, rngPick, clamp } from '../core/rng.js';
import { LAST_REAL_TURN } from './notices.js';

const BRANDS = [
  '자이', '래미안', '힐스테이트', '푸르지오', 'e편한세상', '롯데캐슬', '더샵',
  '아이파크', '위브', '데시앙', '한신더휴', '서희스타힐스', '중흥S-클래스',
  '호반써밋', '해링턴플레이스', '트레지움', '센트레빌', '리슈빌', '스위첸',
];
const PREFIX = ['센트럴', '더퍼스트', '리버', '파크', '포레', '스카이', '에듀', '메트로', '그랜드', '프라임'];
const SUFFIX = ['시티', '엘리스트', '포레스트', '뷰', '파크', '스퀘어', '테라스', '카운티', '리버프론트', '시그니처'];

const SPECIAL_TEMPLATE = [
  { type: '기관추천', requiresNoHouse: true, incomeLimit: null },
  { type: '다자녀', requiresNoHouse: true, minChildren: 2, incomeLimit: 160 },
  { type: '신혼부부', requiresNoHouse: true, maxMarriageYears: 7, incomeLimit: 160 },
  { type: '노부모부양', requiresNoHouse: true, incomeLimit: null },
  { type: '생애최초', requiresNoHouse: true, incomeLimit: 160 },
  { type: '신생아', requiresNoHouse: true, incomeLimit: 160 },
  { type: '일반공급', requiresNoHouse: true, incomeLimit: null },
];

const AREA_LADDER = [59, 74, 84, 101];

/**
 * @param turn        생성 대상 턴
 * @param seq         같은 턴 안에서의 일련번호
 * @param priceIndex  현재 시장 집값 지수 (1.0 = 게임 시작 시점)
 * @param capBoost    분양가상한제 강화 배수 — 분양가를 더 눌러 안전마진을 키운다
 */
export function generateNotice(turn, seq, priceIndex, capBoost = 1) {
  const rng = makeRng(`gen::${turn}::${seq}`);
  const district = pickDistrict(rng);
  const isPublic = rng() < 0.22;
  const brand = rngPick(rng, BRANDS);

  const name = rng() < 0.45
    ? `${district.district.replace(/[시군구]$/, '')} ${brand} ${rngPick(rng, SUFFIX)}`
    : `${rngPick(rng, PREFIX)} ${brand} ${district.district.replace(/[시군구]$/, '')}`;

  const title = isPublic ? `${name} 공공분양주택` : name;

  // 84㎡ 기준 분양가 = 지역 시세 × 분양가 할인(0.72~0.92) × 시장지수
  const market84 = district.base * 억 * priceIndex;
  const discount = rngRange(rng, isPublic ? 0.62 : 0.74, isPublic ? 0.80 : 0.94)
    / clamp(capBoost, 1, 1.45);          // 상한제가 강할수록 분양가가 눌린다
  const base84 = market84 * discount;

  const unitTypes = AREA_LADDER.map((area, i) => ({
    id: `t${i}`,
    area,
    label: `${area}㎡${['A', 'B', 'A', 'C'][i]}`,
    pyeong: Math.round(area / 3.3058),
    price: Math.round((base84 * Math.pow(area / 84, 0.92)) / 1_000_000) * 1_000_000,
    demand: clamp(1.25 - (area - 59) / 150, 0.72, 1.3),
  }));

  const units = rngInt(rng, 120, 900) - Math.round(district.tier * 60);
  const weights = { 일반공급: 0.35, 신혼부부: 0.18, 생애최초: 0.14, 신생아: 0.12, 다자녀: 0.09, 노부모부양: 0.05, 기관추천: 0.07 };
  const supplies = SPECIAL_TEMPLATE.map((sp) => ({
    type: sp.type,
    units: Math.max(1, Math.round(units * weights[sp.type])),
    requiresNoHouse: sp.requiresNoHouse,
    incomeLimit: sp.incomeLimit,
    minChildren: sp.minChildren ?? null,
    maxMarriageYears: sp.maxMarriageYears ?? null,
  }));

  const premium = clamp(
    (market84 / base84) * rngRange(rng, 0.93, 1.08),
    0.96, 1.75
  );
  const heat = rngRange(rng, 0.72, 1.36);

  return {
    id: `g${turn}-${seq}`,
    index: 1000 + turn * 10 + seq,
    kind: 'sale',
    generated: true,
    agency: isPublic ? 'LH' : '민간',
    agencyName: isPublic ? '한국토지주택공사' : '민간 건설사',
    title,
    region: district.region,
    districtLabel: district.district,
    districts: [district.district],
    multiDistrict: false,
    district,
    housingType: isPublic ? '공공분양' : '민간분양',
    announce: null,
    announceTurn: turn,
    deadline: null,
    deadlineTurn: turn + 1,
    minSubMonths: isPublic ? 24 : 12,
    minAge: 19,
    url: null,
    note: null,
    infoDetail: null,
    infoNature: null,
    priceRange: { lo: unitTypes[0].price, hi: unitTypes[unitTypes.length - 1].price, sample: null },
    unitTypes,
    rentTerms: null,
    units,
    supplies,
    premium,
    heat,
    seed: `gen::${turn}::${seq}`,
  };
}

/** tier 가 높은 지역일수록 공고가 드물게 뜨도록 가중 추첨 */
function pickDistrict(rng) {
  const weighted = [];
  for (const d of DISTRICT_LIST) {
    if (d.key === '인천 서해구') continue; // 서구와 중복
    const w = [5, 4, 3, 2][d.tier] ?? 2;
    for (let i = 0; i < w; i++) weighted.push(d);
  }
  return rngPick(rng, weighted);
}

/** 해당 턴에 새로 뜨는 절차 생성 공고 목록 */
export function generatedNoticesFor(turn, priceIndex, capBoost = 1) {
  if (turn <= LAST_REAL_TURN) return [];
  const rng = makeRng(`count::${turn}`);
  const count = rngInt(rng, 2, 5);
  const out = [];
  for (let i = 0; i < count; i++) out.push(generateNotice(turn, i, priceIndex, capBoost));
  return out;
}
