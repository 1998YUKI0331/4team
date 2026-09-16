/**
 * 게임 규칙 상수.
 * 금액 단위는 전부 "원" 이며, 표시 단계에서만 억/만원으로 변환한다.
 */

export const 만 = 10_000;
export const 억 = 100_000_000;

export const START_YEAR = 2026;
export const START_MONTH = 7; // 2026-07 : notices.json 의 첫 공고월
export const MAX_TURNS = 132; // 11년

// ─────────────────────────────────────────────────────────
// 청약 가점제 (84점 만점)
// ─────────────────────────────────────────────────────────

/** 무주택기간 32점: 만 30세(또는 혼인신고일 중 빠른 쪽)부터 1년당 2점 */
export function scoreNoHouse(years) {
  if (years < 1) return 2;
  return Math.min(32, 2 + Math.floor(Math.min(years, 15)) * 2);
}

/** 부양가족수 35점: 0명 5점, 1명당 +5점, 6명 이상 35점 */
export function scoreDependents(n) {
  return Math.min(35, 5 + Math.max(0, n) * 5);
}

/** 청약통장 가입기간 17점 */
export function scoreAccount(months) {
  if (months < 6) return 1;
  if (months < 12) return 2;
  const years = Math.floor(months / 12);
  return Math.min(17, 2 + years); // 1년 3점 … 15년 이상 17점
}

export const MAX_SCORE = 84;

// ─────────────────────────────────────────────────────────
// 소득 기준 : 도시근로자 가구원수별 월평균소득 (2026 가정치)
// notices.json 의 incomeLimit 은 이 값에 대한 % 이다. (예: 160 → 160%)
// ─────────────────────────────────────────────────────────
export const URBAN_INCOME = [
  0,
  4_200_000, // 1인
  6_100_000, // 2인
  7_200_000, // 3인
  8_100_000, // 4인
  8_600_000, // 5인
  9_200_000, // 6인
  9_800_000, // 7인
];

export function urbanIncome(householdSize) {
  return URBAN_INCOME[Math.min(Math.max(1, householdSize), 7)];
}

// ─────────────────────────────────────────────────────────
// 금융
// ─────────────────────────────────────────────────────────
export const FINANCE = {
  baseMortgageRate: 0.041,   // 주택담보대출 기준 금리
  jeonseLoanRate: 0.037,     // 전세자금대출
  creditRate: 0.068,         // 신용대출
  dsrLimit: 0.40,            // 총부채원리금상환비율 상한
  ltvRegulated: 0.50,
  ltvNormal: 0.70,
  mortgageYears: 30,
  /** 중도금 대출이 막히는 분양가 기준 */
  midLoanPriceCap: 12 * 억,
  midLoanRatio: 0.60,        // 중도금 60% 중 대출 가능 비율
  depositRatio: 0.10,        // 계약금 10%
  midRatio: 0.60,            // 중도금 60% (6회 분납)
  balanceRatio: 0.30,        // 잔금 30%
  midInstallments: 6,
  midIntervalMonths: 3,      // 3개월마다 1회차
};

/**
 * 가구원수별 월 생활비.
 * 소득이 오르면 씀씀이도 커진다(lifestyle inflation) — 기준선을 넘는 소득의 30%가
 * 생활비로 흡수되므로, 고소득이라고 저축이 무한정 늘지는 않는다.
 */
export function livingCost(householdSize, tier, income = 0) {
  const base = Math.round((1_250_000 + Math.max(0, householdSize - 1) * 720_000) * (1 + tier * 0.055));
  const threshold = base * 1.7;
  return base + Math.round(Math.max(0, income - threshold) * 0.30);
}

// ─────────────────────────────────────────────────────────
// 청약통장
// ─────────────────────────────────────────────────────────
export const DEPOSIT_OPTIONS = [20_000, 100_000, 250_000, 500_000];
/** 국민주택 순위 산정에 쓰이는 회차당 인정 상한 */
export const DEPOSIT_RECOGNIZED_CAP = 250_000;

/** 민영주택 지역별 예치금 기준 (85㎡ 이하 기준, 단순화) */
export const REQUIRED_DEPOSIT = {
  서울: 3_000_000,
  경기: 2_000_000,
  인천: 2_500_000,
};

// ─────────────────────────────────────────────────────────
// 특별공급 유형 메타
// ─────────────────────────────────────────────────────────
export const SPECIAL_META = {
  기관추천:   { icon: '🎖', desc: '국가유공자·장애인·중소기업 근로자 등 기관 추천 대상', mode: '추첨' },
  다자녀:     { icon: '👨‍👩‍👧‍👦', desc: '미성년 자녀 2명 이상', mode: '배점' },
  신혼부부:   { icon: '💍', desc: '혼인신고 7년 이내', mode: '배점' },
  노부모부양: { icon: '🧓', desc: '만 65세 이상 직계존속 3년 이상 부양', mode: '가점' },
  생애최초:   { icon: '🌱', desc: '생애 최초 주택 구입 + 5년 이상 소득세 납부', mode: '추첨' },
  신생아:     { icon: '👶', desc: '공고일 기준 2년 이내 출생 자녀', mode: '배점' },
  일반공급:   { icon: '🏠', desc: '가점제 + 추첨제', mode: '가점' },
  국가유공자: { icon: '🎗', desc: '국가유공자 및 유족', mode: '추첨' },
  지역균형발전: { icon: '🗺', desc: '해당 지역 장기 거주자 우선', mode: '추첨' },
  협의양도인: { icon: '📜', desc: '사업지구 내 토지 협의 양도자', mode: '추첨' },
  이주자주택: { icon: '🚚', desc: '사업지구 내 이주 대상자', mode: '추첨' },
  '신생아우선공급(1순위자)': { icon: '👶', desc: '신생아 가구 최우선 배정', mode: '배점' },
};

export function specialMeta(type) {
  return SPECIAL_META[type] ?? { icon: '📋', desc: '별도 공고 기준 적용', mode: '추첨' };
}

// ─────────────────────────────────────────────────────────
// 시장
// ─────────────────────────────────────────────────────────
export const MARKET = {
  /** 지역 tier 별 기본 연 상승률 */
  annualGrowth: [0.018, 0.028, 0.041, 0.056],
  /** 분양가 대비 시세(=안전마진) 기본 배수 */
  premiumByTier: [1.02, 1.08, 1.18, 1.30],
};

/** 재당첨 제한 — 규제지역은 길고, 비규제지역은 짧다 */
export const RE_WIN_LOCK = { regulated: 60, normal: 24 };
export const reWinLockMonths = (district) => (district?.regulated ? RE_WIN_LOCK.regulated : RE_WIN_LOCK.normal);

// ─────────────────────────────────────────────────────────
// 포맷터
// ─────────────────────────────────────────────────────────
export function won(v) {
  const n = Math.round(v);
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  if (a >= 억) {
    const eok = Math.floor(a / 억);
    const rest = Math.round((a % 억) / 만);
    return rest > 0 ? `${sign}${eok}억 ${rest.toLocaleString()}만` : `${sign}${eok}억`;
  }
  if (a >= 만) return `${sign}${Math.round(a / 만).toLocaleString()}만`;
  return `${sign}${a.toLocaleString()}`;
}

export function eok(v, digits = 2) {
  return `${(v / 억).toFixed(digits)}억`;
}

export function pct(v, digits = 1) {
  return `${(v * 100).toFixed(digits)}%`;
}

export function ym(turnIndex) {
  const total = (START_YEAR * 12 + (START_MONTH - 1)) + turnIndex;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

export function ymLabel(turnIndex) {
  const { year, month } = ym(turnIndex);
  return `${year}년 ${String(month).padStart(2, '0')}월`;
}

export function ymKey(turnIndex) {
  const { year, month } = ym(turnIndex);
  return `${year}-${String(month).padStart(2, '0')}`;
}
