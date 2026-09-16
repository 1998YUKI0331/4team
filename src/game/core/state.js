import { 억, 만, FINANCE, MAX_TURNS } from '../data/constants.js';
import { DISTRICTS } from '../data/geo.js';

/* ───────────────────────────── 시작 캐릭터 ───────────────────────────── */

export const PRESETS = [
  {
    id: 'rookie',
    name: '사회초년생',
    emoji: '🎒',
    tagline: '가점 10점에서 시작한다',
    desc: '가진 건 시간뿐. 월 87만원씩 모으며 통장 기간과 무주택 기간을 쌓아야 한다. 초반 몇 년은 어느 공고에도 명함을 못 내민다.',
    difficulty: '어려움',
    setup: {
      ageMonths: 28 * 12 + 4,
      married: false,
      children: [],
      cash: 3_200 * 만,
      income: 320 * 만,
      spouseIncome: 0,
      accountMonths: 14,
      accountBalance: 190 * 만,
      accountPayment: 100_000,
      housing: 'monthly',
      monthlyRent: 62 * 만,
      jeonseDeposit: 1_000 * 만,
      residence: '경기 부천시',
      residenceMonths: 20,
      taxYears: 3,
      credit: 720,
    },
  },
  {
    id: 'newlywed',
    name: '신혼부부',
    emoji: '💍',
    tagline: '특공 창문은 7년이면 닫힌다',
    desc: '맞벌이로 월 271만원이 남는다. 신혼부부 특공은 혼인 7년까지, 신생아 특공은 출산 후 2년까지. 창이 닫히기 전에 승부를 봐야 한다.',
    difficulty: '보통',
    setup: {
      ageMonths: 32 * 12 + 1,
      married: true,
      marriedMonthsAgo: 14,
      children: [],
      cash: 11_000 * 만,
      income: 340 * 만,
      spouseIncome: 285 * 만,
      accountMonths: 38,
      accountBalance: 620 * 만,
      accountPayment: 250_000,
      housing: 'jeonse',
      jeonseDeposit: 1.9 * 억,
      jeonseLoan: 1.1 * 억,
      residence: '경기 수원시',
      residenceMonths: 26,
      taxYears: 7,
      credit: 780,
    },
  },
  {
    id: 'family',
    name: '다자녀 가장',
    emoji: '👨‍👩‍👧‍👦',
    tagline: '가점 62점, 그런데 저축이 안 된다',
    desc: '부양가족과 12년 통장으로 가점은 이미 상위권. 대신 4인 가구 생활비에 월 57만원밖에 안 남는다. 지금 가진 현금으로 승부를 봐야 한다.',
    difficulty: '쉬움',
    setup: {
      ageMonths: 41 * 12 + 7,
      married: true,
      marriedMonthsAgo: 13 * 12,
      children: [{ ageMonths: 9 * 12 }, { ageMonths: 5 * 12 + 4 }],
      cash: 17_500 * 만,
      income: 470 * 만,
      spouseIncome: 0,
      accountMonths: 152,
      accountBalance: 2_100 * 만,
      accountPayment: 100_000,
      housing: 'jeonse',
      jeonseDeposit: 2.6 * 억,
      jeonseLoan: 1.4 * 억,
      residence: '경기 남양주시',
      residenceMonths: 74,
      taxYears: 15,
      credit: 745,
    },
  },
  {
    id: 'highincome',
    name: '고소득 늦깎이',
    emoji: '💼',
    tagline: '돈은 되는데 자격이 안 된다',
    desc: '월 333만원이 남지만 가점은 19점, 특공 소득 기준은 전부 초과. 서울은 규제지역 100% 가점제라 아예 길이 없다. 추첨 물량과 대형 평형이 유일한 통로.',
    difficulty: '보통',
    setup: {
      ageMonths: 35 * 12 + 2,
      married: false,
      children: [],
      cash: 9_800 * 만,
      income: 720 * 만,
      spouseIncome: 0,
      accountMonths: 8,
      accountBalance: 120 * 만,
      accountPayment: 500_000,
      housing: 'jeonse',
      jeonseDeposit: 2.2 * 억,
      jeonseLoan: 1.6 * 억,
      residence: '서울 영등포구',
      residenceMonths: 31,
      taxYears: 9,
      credit: 810,
    },
  },
];

/* ───────────────────────────── 상태 생성 ───────────────────────────── */

export function createState(presetId, playerName = '나') {
  const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[0];
  const s = preset.setup;

  const state = {
    version: 1,
    presetId: preset.id,
    presetName: preset.name,
    playerName,
    turn: 0,
    over: false,
    ending: null,

    // 인적 사항
    ageMonths: s.ageMonths,
    married: !!s.married,
    marriageTurn: s.married ? -Math.round(s.marriedMonthsAgo ?? 12) : null,
    children: (s.children ?? []).map((c) => ({ bornTurn: -Math.round(c.ageMonths) })),
    supportingParents: false,
    parentsSince: null,

    // 자산
    cash: s.cash,
    income: s.income,
    /** 커리어로 오를 수 있는 본인 소득 상한 (시작 소득의 2.1배). 이직하면 상한 자체가 옮겨간다. */
    incomeCap: Math.round(s.income * 2.1),
    spouseIncome: s.spouseIncome ?? 0,
    credit: s.credit ?? 720,
    stress: 12,

    // 청약통장
    accountMonths: s.accountMonths,
    accountBalance: s.accountBalance,
    accountPayment: s.accountPayment,
    accountPaidCount: Math.max(0, s.accountMonths - 1),

    // 주거
    housing: s.housing,              // 'monthly' | 'jeonse' | 'owned'
    monthlyRent: s.monthlyRent ?? 0,
    jeonseDeposit: s.jeonseDeposit ?? 0,
    residenceKey: s.residence,
    residenceMonths: s.residenceMonths,

    // 부채
    debts: [],

    // 청약
    applications: [],                // 지원 이력
    contract: null,                  // 진행 중인 분양 계약
    rental: null,                    // 당첨된 임대
    owned: null,                     // 소유 주택
    reWinLockUntil: -1,
    taxYears: s.taxYears,
    firstHomeEver: true,             // 생애최초 자격
    everWon: false,

    // 시장
    priceIndex: 1.0,
    rateDelta: 0,                    // 기준금리 가산 (이벤트로 변동)
    heatMod: 1.0,                    // 청약 과열도 배수
    ltvMod: 0,                       // 규제 완화/강화 (LTV 가산)

    // 기록
    log: [],
    news: [],
    pendingEvents: [],
    stats: { applied: 0, won: 0, lost: 0, rejected: 0, forfeited: 0 },
    history: [],                     // 턴별 순자산 스냅샷
  };

  if (s.jeonseLoan) {
    state.debts.push(makeDebt('jeonse', s.jeonseLoan, FINANCE.jeonseLoanRate, 24 * 12, 0, '전세자금대출'));
  }

  return state;
}

/* ───────────────────────────── 부채 ───────────────────────────── */

export function makeDebt(type, principal, rate, termMonths, startTurn, label) {
  return {
    id: `${type}-${startTurn}-${Math.round(principal / 10000)}`,
    type,                            // 'jeonse' | 'mortgage' | 'mid' | 'credit'
    label: label ?? type,
    principal,
    original: principal,
    rate,
    termMonths,
    remaining: termMonths,
    startTurn,
    interestOnly: type === 'jeonse' || type === 'mid',
  };
}

/** 월 상환액 (원리금균등 / 이자만) */
export function monthlyPayment(debt) {
  if (debt.principal <= 0) return 0;
  const r = debt.rate / 12;
  if (debt.interestOnly) return debt.principal * r;
  const n = Math.max(1, debt.remaining);
  return (debt.principal * r) / (1 - Math.pow(1 + r, -n));
}

export const totalDebt = (state) => state.debts.reduce((a, d) => a + d.principal, 0);
export const totalMonthlyPayment = (state) => state.debts.reduce((a, d) => a + monthlyPayment(d), 0);

/* ───────────────────────────── 파생값 ───────────────────────────── */

/** 소득 조정 — 상한을 넘지 않도록 한 곳에서 관리한다 */
export function setIncome(state, value) {
  const cap = state.incomeCap ?? Math.round(state.income * 2.1);
  state.income = Math.max(600_000, Math.min(cap, Math.round(value / 10_000) * 10_000));
  return state.income;
}

/** 이직 — 소득과 함께 상한선(커리어 사다리)도 옮긴다 */
export function changeCareer(state, factor) {
  state.incomeCap = Math.max(1_000_000, Math.round((state.incomeCap ?? state.income * 2.1) * factor));
  return setIncome(state, state.income * factor);
}

export const householdIncome = (state) => state.income + state.spouseIncome;
export const annualIncome = (state) => householdIncome(state) * 12;

export function householdSize(state) {
  return 1 + (state.married ? 1 : 0) + state.children.length + (state.supportingParents ? 2 : 0);
}

/** 부양가족수 (본인 제외) */
export function dependents(state) {
  return (state.married ? 1 : 0) + minorChildren(state) + (state.supportingParents ? 2 : 0);
}

export function minorChildren(state) {
  return state.children.filter((c) => (state.turn - c.bornTurn) < 19 * 12).length;
}

/** 공고일 기준 2년 이내 출생아 (신생아 특공) */
export function hasNewborn(state) {
  return state.children.some((c) => (state.turn - c.bornTurn) <= 24);
}

export function marriageYears(state) {
  if (!state.married || state.marriageTurn === null) return null;
  return (state.turn - state.marriageTurn) / 12;
}

export const ageYears = (state) => Math.floor((state.ageMonths + state.turn) / 12);

/** 무주택 기간(년) — 만 30세 또는 혼인신고일 중 빠른 시점부터 */
export function noHouseYears(state) {
  if (state.housing === 'owned') return 0;
  const nowMonths = state.ageMonths + state.turn;
  const from30 = nowMonths - 30 * 12;
  const fromMarriage = state.married && state.marriageTurn !== null
    ? state.turn - state.marriageTurn
    : -Infinity;
  return Math.max(0, Math.max(from30, fromMarriage) / 12);
}

export function isNoHouse(state) {
  return state.housing !== 'owned' && !state.owned;
}

export function residenceDistrict(state) {
  return DISTRICTS[state.residenceKey] ?? DISTRICTS['경기 수원시'];
}

/** 순자산 = 현금 + 주택시세 + 전세보증금 + 임대보증금 + 통장잔액 − 부채 − 미납분양대금 */
export function netWorth(state) {
  let v = state.cash + state.accountBalance;
  if (state.owned) v += state.owned.marketValue;
  if (state.housing === 'jeonse') v += state.jeonseDeposit;
  if (state.rental) v += state.rental.deposit;
  if (state.contract) v += state.contract.paid;   // 납입한 분양대금은 자산
  v -= totalDebt(state);
  return v;
}

export function pushLog(state, kind, text, detail) {
  state.log.unshift({ turn: state.turn, kind, text, detail: detail ?? null });
  if (state.log.length > 240) state.log.length = 240;
}

/* ───────────────────────────── 저장 / 불러오기 ───────────────────────────── */

const SAVE_KEY = 'cheongyak-road:save:v1';
const BOARD_KEY = 'cheongyak-road:board:v1';

export function saveState(state) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); return true; }
  catch { return false; }
}

export function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return s && s.version === 1 && s.turn < MAX_TURNS ? s : null;
  } catch { return null; }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* noop */ }
}

export function readBoard() {
  try { return JSON.parse(localStorage.getItem(BOARD_KEY) ?? '[]'); } catch { return []; }
}

export function pushBoard(entry) {
  try {
    const board = readBoard();
    board.push(entry);
    board.sort((a, b) => b.score - a.score);
    localStorage.setItem(BOARD_KEY, JSON.stringify(board.slice(0, 12)));
  } catch { /* noop */ }
}
