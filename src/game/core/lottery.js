import { gaJeom, specialRank } from './scoring.js';
import { clamp, makeRng, rngRange, rand, randNormal } from './rng.js';
import { MAX_SCORE } from '../data/constants.js';

/**
 * 당첨 모델
 * ─────────────────────────────────────────────────────────────
 * 1. 경쟁률 ratio 를 지역 등급 · 안전마진 · 공급유형으로 산출한다.
 * 2. 합격률 accept = 1 / ratio.
 * 3. 경쟁자들의 점수가 N(mu, sigma) 를 따른다고 보고,
 *    "상위 accept 에 해당하는 점수" 를 커트라인으로 역산한다.
 *      cutline = mu + sigma · Φ⁻¹(1 − accept)
 * 4. 내 점수가 커트라인을 얼마나 넘는지로 당첨 확률을 만든다.
 *
 * 이 구조 덕분에 서울 핵심지는 커트라인이 70점대로, 외곽 미달 단지는
 * 20점대로 자연스럽게 갈린다 — 실제 청약 결과와 같은 모양이 된다.
 */

/** 지역 등급별 기준 경쟁률 (안전마진·유형 보정 전) */
const TIER_BASE = [2.4, 7.6, 23, 60];

/** 경쟁자 점수 분포의 중심 — 인기 지역일수록 고가점자가 몰린다 */
const TIER_MU = [17, 25, 34, 43];

/** 공급 유형별 수요 배수 */
const TYPE_DEMAND = {
  일반공급: 1.55,
  생애최초: 1.34,
  신혼부부: 1.18,
  신생아: 0.98,
  다자녀: 0.88,
  노부모부양: 0.62,
  기관추천: 0.52,
  국가유공자: 0.44,
  지역균형발전: 0.74,
  협의양도인: 0.28,
  이주자주택: 0.28,
  '신생아우선공급(1순위자)': 0.88,
};

export function supplyMode(notice, type) {
  if (type === '일반공급' || type === '노부모부양') return '가점제';
  if (type === '신혼부부' || type === '신생아' || type === '다자녀' || type === '신생아우선공급(1순위자)') return '배점제';
  return '추첨제';
}

/** 규제지역 85㎡ 이하 일반공급은 100% 가점제, 그 외는 추첨 물량이 섞인다 */
function gaRatio(notice, type, unitType) {
  if (type !== '일반공급') return 1;
  const area = unitType?.area ?? 84;
  if (notice.district.regulated) return area <= 85 ? 1.0 : 0.5;
  return area <= 85 ? 0.6 : 0.3;
}

/* ───────────────────────── 경쟁률 ───────────────────────── */

/**
 * '특별공급 물량 확대' 이벤트 반영 배수.
 * 물량이 늘어난 유형은 그만큼 경쟁률이 내려간다.
 */
export function supplyBoost(state, type) {
  const b = state.specialBoost;
  if (!b || b === 1) return 1;
  return (type === '신혼부부' || type === '신생아' || type === '신생아우선공급(1순위자)') ? b : 1;
}

export function competition(state, notice, supply, unitType, noise = 1) {
  const typeMul = TYPE_DEMAND[supply.type] ?? 0.55;
  const demand = unitType?.demand ?? 1;

  // 분양가가 시세보다 쌀수록(안전마진↑) 사람이 폭발적으로 몰린다
  const margin = 1 + Math.max(0, notice.premium - 1) * 4.2;

  const base = TIER_BASE[notice.district.tier]
    * margin * typeMul * demand
    * notice.heat                 // 공고별 인기 편차 (0.72 ~ 1.36)
    * (state.heatMod ?? 1)
    / supplyBoost(state, supply.type);

  const jitter = 0.74 + makeRng(`${notice.seed}::${supply.type}::${unitType?.id ?? 'x'}`)() * 0.58;
  const ratio = clamp(base * jitter * noise, 0.22, 900);
  const applicants = Math.max(1, Math.round(supply.units * ratio));
  return { ratio, applicants };
}

/* ───────────────────────── 정규분포 역함수 ───────────────────────── */

/** Φ⁻¹(p) — Acklam 근사 */
export function probit(p) {
  const q = clamp(p, 1e-6, 1 - 1e-6);
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
    1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
    6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
    -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
    3.754408661907416e+00];
  const lo = 0.02425, hi = 1 - lo;

  if (q < lo) {
    const s = Math.sqrt(-2 * Math.log(q));
    return (((((c[0] * s + c[1]) * s + c[2]) * s + c[3]) * s + c[4]) * s + c[5])
      / ((((d[0] * s + d[1]) * s + d[2]) * s + d[3]) * s + 1);
  }
  if (q > hi) {
    const s = Math.sqrt(-2 * Math.log(1 - q));
    return -(((((c[0] * s + c[1]) * s + c[2]) * s + c[3]) * s + c[4]) * s + c[5])
      / ((((d[0] * s + d[1]) * s + d[2]) * s + d[3]) * s + 1);
  }
  const s = q - 0.5, r = s * s;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * s
    / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

const sigmoid = (x) => 1 / (1 + Math.exp(-x));

/* ───────────────────────── 당첨 확률 ───────────────────────── */

export function computeOdds(state, notice, supplyCheck, unitType, { noise = 1 } = {}) {
  const supply = { type: supplyCheck.type, units: supplyCheck.units };
  const { ratio, applicants } = competition(state, notice, supply, unitType, noise);
  const mode = supplyMode(notice, supply.type);
  const tier = notice.district.tier;

  // 해당지역 거주자 우선공급 — 물량의 절반을 먼저 배정받는다
  const local = supplyCheck.local;
  const accept = clamp(1 / ratio, 0.0006, 0.96);
  const acceptAdj = clamp(accept * (local ? 1.85 : 0.52), 0.0004, 0.95);

  const gr = gaRatio(notice, supply.type, unitType);

  let gaChance = 0;
  let lotChance = 0;
  let cutline = null;
  let myScore = null;
  let mu = null;
  let sigma = null;

  if (mode === '가점제' || mode === '배점제') {
    const isGa = mode === '가점제';
    myScore = isGa ? gaJeom(state).total : specialRank(state, supply.type);
    // 특별공급 경쟁자도 대부분 자녀·장기 무주택 가구라 배점 분포의 중심이 높다
    mu = isGa
      ? clamp(TIER_MU[tier] + (notice.agency !== '민간' ? -2 : 0), 14, 52)
      : clamp(26 + tier * 10, 20, 62);
    sigma = isGa ? 10.5 : 13;

    // 가점 물량에 배정되는 합격률
    const acceptGa = clamp(acceptAdj * gr, 0.0004, 0.95);
    cutline = clamp(mu + sigma * probit(1 - acceptGa), isGa ? 9 : 5, isGa ? 79 : 98);

    // 커트라인 부근은 단지별 편차 때문에 반반 — 하지만 확실히 넘으면 거의 확정
    gaChance = clamp(sigmoid((myScore - cutline) / (isGa ? 2.8 : 4.2)), 0, isGa ? 0.94 : 0.88);
  }

  // 추첨 물량
  const lotShare = 1 - gr;
  if (mode === '추첨제') {
    lotChance = acceptAdj;
  } else if (lotShare > 0.001) {
    lotChance = clamp(acceptAdj * lotShare, 0, 0.9);
  }

  const total = clamp(gaChance + (1 - gaChance) * lotChance, 0.0005, 0.97);

  return {
    mode, ratio, applicants, cutline, myScore, mu, sigma,
    scoreGap: myScore !== null && cutline !== null ? myScore - cutline : null,
    gaChance, lotChance, gaRatio: gr, local, units: supply.units,
    accept: acceptAdj,
    total,
    grade: gradeOf(total),
  };
}

/* ───────────────────────── 임장(시장조사) ───────────────────────── */

/** 임장 효과가 살아 있는가 — 임장한 달의 다음 달 공고까지 */
export function isScouted(state) {
  return state.researched != null && state.turn - state.researched <= 1;
}

/**
 * 화면에 보여주는 "추정" 경쟁률.
 * 임장을 다녀오지 않았으면 실제값과 최대 ±70% 어긋난다.
 * 실제 추첨은 언제나 computeOdds() 의 참값으로 한다 — 이건 표시용이다.
 */
export function estimateOdds(state, notice, supplyCheck, unitType) {
  if (isScouted(state)) {
    return { ...computeOdds(state, notice, supplyCheck, unitType), precise: true };
  }
  const rng = makeRng(`scout::${notice.seed}::${supplyCheck.type}::${unitType?.id ?? 'x'}::${state.turn}`);
  const noise = rngRange(rng, 0.58, 1.72);
  return { ...computeOdds(state, notice, supplyCheck, unitType, { noise }), precise: false };
}

export function gradeOf(p) {
  if (p >= 0.5) return { key: 'high', label: '유력', color: '#33e39f' };
  if (p >= 0.22) return { key: 'mid', label: '해볼만', color: '#7ee0ff' };
  if (p >= 0.08) return { key: 'low', label: '박빙', color: '#ffd166' };
  if (p >= 0.02) return { key: 'slim', label: '희박', color: '#ff9f68' };
  return { key: 'none', label: '로또', color: '#ff6b8a' };
}

/* ───────────────────────── 추첨 실행 ───────────────────────── */

export function draw(state, notice, supplyCheck, unitType, odds) {
  const winByScore = odds.mode !== '추첨제' && rand() < odds.gaChance;
  const winByLot = !winByScore && rand() < odds.lotChance;
  const win = winByScore || winByLot;

  // 연출용 경쟁자 점수 표본
  const sample = [];
  const n = 40;
  const mu = odds.mu ?? 40;
  const sigma = odds.sigma ?? 12;
  const cap = odds.mode === '가점제' ? MAX_SCORE : 100;
  for (let i = 0; i < n; i++) sample.push(clamp(randNormal(mu, sigma), 0, cap));
  sample.sort((a, b) => b - a);

  const myNumber = 100000 + Math.floor(rand() * 899999);
  const drawnNumber = win ? myNumber : 100000 + Math.floor(rand() * 899999);

  // 낙첨이면 커트라인은 내 점수보다 위, 당첨이면 내 점수 이하로 맞춰 보여준다
  let finalCutline = odds.cutline;
  if (finalCutline != null && odds.myScore != null) {
    const jitter = rngRange(makeRng(`cut::${notice.id}::${state.turn}::${supplyCheck.type}`), 0.4, 5.5);
    finalCutline = win
      ? Math.min(finalCutline, Math.max(0, odds.myScore - jitter * 0.35))
      : Math.max(finalCutline, odds.myScore + jitter);
    finalCutline = clamp(finalCutline, 0, odds.mode === '가점제' ? MAX_SCORE : 100);
  }

  return {
    win,
    reason: winByScore ? (odds.mode === '가점제' ? 'score' : 'rank') : winByLot ? 'lottery' : 'lose',
    myNumber, drawnNumber, sample,
    cutline: odds.cutline, myScore: odds.myScore,
    odds, finalCutline,
  };
}
