import { FINANCE, livingCost, won, 억 } from '../data/constants.js';
import {
  makeDebt, monthlyPayment, totalMonthlyPayment, householdIncome,
  householdSize, residenceDistrict,
} from './state.js';
import { clamp } from './rng.js';

/* ───────────────────────────── 금리 ───────────────────────────── */

export const mortgageRate = (state) => FINANCE.baseMortgageRate + state.rateDelta;
export const midLoanRate = (state) => FINANCE.baseMortgageRate + state.rateDelta + 0.006;
export const creditRate = (state) => FINANCE.creditRate + state.rateDelta;

/* ───────────────────────────── 규제 ───────────────────────────── */

export function ltvLimit(state, notice) {
  const base = notice.district.regulated ? FINANCE.ltvRegulated : FINANCE.ltvNormal;
  return clamp(base + state.ltvMod, 0.2, 0.8);
}

/** 중도금 대출 가능 여부 */
export function midLoanAvailable(state, price) {
  return price <= FINANCE.midLoanPriceCap;
}

/* ───────────────────────────── DSR ───────────────────────────── */

/** 현재 DSR (연 원리금 / 연 소득) */
export function currentDsr(state) {
  const annual = totalMonthlyPayment(state) * 12;
  const income = householdIncome(state) * 12;
  return income > 0 ? annual / income : 1;
}

/** DSR 40% 안에서 추가로 감당 가능한 월 상환액 */
export function dsrHeadroom(state) {
  const income = householdIncome(state) * 12;
  const cap = income * FINANCE.dsrLimit;
  const used = totalMonthlyPayment(state) * 12;
  return Math.max(0, (cap - used) / 12);
}

/** 월 상환액 → 빌릴 수 있는 원금 (원리금균등, 30년) */
export function principalFromPayment(payment, rate, years = FINANCE.mortgageYears) {
  const r = rate / 12;
  const n = years * 12;
  if (payment <= 0) return 0;
  return (payment * (1 - Math.pow(1 + r, -n))) / r;
}

/** 주택담보대출 한도 = min(LTV 한도, DSR 한도) */
export function maxMortgage(state, notice, homeValue) {
  const byLtv = homeValue * ltvLimit(state, notice);
  const byDsr = principalFromPayment(dsrHeadroom(state), mortgageRate(state));
  return { limit: Math.min(byLtv, byDsr), byLtv, byDsr };
}

/* ───────────────────────────── 분양대금 스케줄 ───────────────────────────── */

/**
 * 계약금 10% → 중도금 60%(6회, 3개월 간격) → 잔금 30%(입주)
 */
export function buildSchedule(price, contractTurn) {
  const steps = [];
  const deposit = Math.round(price * FINANCE.depositRatio);
  steps.push({ kind: 'deposit', label: '계약금', turn: contractTurn + 1, amount: deposit, paid: false });

  const midTotal = Math.round(price * FINANCE.midRatio);
  const each = Math.round(midTotal / FINANCE.midInstallments);
  for (let i = 0; i < FINANCE.midInstallments; i++) {
    steps.push({
      kind: 'mid',
      label: `중도금 ${i + 1}회`,
      turn: contractTurn + 4 + i * FINANCE.midIntervalMonths,
      amount: i === FINANCE.midInstallments - 1 ? midTotal - each * (FINANCE.midInstallments - 1) : each,
      paid: false,
    });
  }

  const last = steps[steps.length - 1].turn;
  steps.push({
    kind: 'balance',
    label: '잔금 + 입주',
    turn: last + 6,
    amount: price - deposit - midTotal,
    paid: false,
  });
  return steps;
}

/* ───────────────────────────── 자금조달 사전 진단 ───────────────────────────── */

/**
 * 당첨 전에 "이 평형을 감당할 수 있는가"를 보여주는 시뮬레이션.
 * 게임의 핵심 의사결정 지표.
 */
export function affordability(state, notice, unitType) {
  const price = unitType.price;
  const marketValue = price * notice.premium * state.priceIndex;
  const schedule = buildSchedule(price, state.turn);

  const depositStep = schedule.find((s) => s.kind === 'deposit');
  const midTotal = schedule.filter((s) => s.kind === 'mid').reduce((a, s) => a + s.amount, 0);
  const balance = schedule.find((s) => s.kind === 'balance').amount;

  // 계약금은 현금으로만
  const cashAfterDeposit = state.cash - depositStep.amount;
  const canDeposit = cashAfterDeposit >= 0;

  // 중도금 : 대출 가능하면 이자만, 아니면 전액 현금
  const midLoanOk = midLoanAvailable(state, price);
  const midLoan = midLoanOk ? midTotal : 0;
  const midCash = midTotal - midLoan;
  const midInterestMonthly = midLoan * (midLoanRate(state) / 12);

  // 잔금 : 중도금대출 → 주담대 전환 + 잔금 충당
  const mort = maxMortgage(state, notice, marketValue);
  const needMortgage = midLoan + balance;
  const mortgage = Math.min(needMortgage, mort.limit);
  const balanceCash = needMortgage - mortgage;

  const rate = mortgageRate(state);
  const r = rate / 12;
  const n = FINANCE.mortgageYears * 12;
  const mortgageMonthly = mortgage > 0 ? (mortgage * r) / (1 - Math.pow(1 + r, -n)) : 0;

  // 입주 후 월 수지
  const size = householdSize(state);
  const tier = notice.district.tier;
  const living = livingCost(size, tier, householdIncome(state));
  const otherDebtMonthly = state.debts
    .filter((d) => d.type !== 'jeonse')
    .reduce((a, d) => a + monthlyPayment(d), 0);
  const monthlyAfterMoveIn = householdIncome(state) - living - mortgageMonthly - otherDebtMonthly;

  const dsrAfter = ((mortgageMonthly + otherDebtMonthly) * 12) / (householdIncome(state) * 12);

  // 전세보증금 회수분까지 감안한 현금 여력
  const recoverable = state.housing === 'jeonse'
    ? state.jeonseDeposit - state.debts.filter((d) => d.type === 'jeonse').reduce((a, d) => a + d.principal, 0)
    : 0;

  // 잔금까지는 25개월 남는다 — 그동안 쌓이는 저축을 빼놓고 보면 실제보다 비관적이 된다.
  // 중도금 대출 이자가 회차마다 늘어나므로 평균 잔액 기준으로 차감한다.
  const monthsToBalance = Math.max(1, schedule.at(-1).turn - state.turn);
  const baseNet = monthlyCashflow(state).net;
  const avgMidInterest = (midLoan / 2) * (midLoanRate(state) / 12);
  const projectedSaving = Math.max(0, (baseNet - avgMidInterest)) * monthsToBalance;
  const cashAtBalance = Math.max(0, cashAfterDeposit) + projectedSaving + recoverable - midCash;

  const warnings = [];
  if (!canDeposit) warnings.push({ level: 'fatal', text: `계약금 ${won(depositStep.amount)}이 현금보다 많습니다 (부족 ${won(-cashAfterDeposit)})` });
  if (!midLoanOk) warnings.push({ level: 'fatal', text: `분양가 12억 초과 — 중도금 대출 불가. ${won(midTotal)}을 현금으로 내야 합니다` });
  if (dsrAfter > FINANCE.dsrLimit + 0.001) warnings.push({ level: 'warn', text: `입주 후 DSR ${(dsrAfter * 100).toFixed(1)}% — 한도 40% 초과로 대출이 축소됩니다` });
  if (baseNet - avgMidInterest < 0 && midLoan > 0) {
    warnings.push({ level: 'warn', text: `중도금 이자 월 ${won(avgMidInterest)}를 더하면 매달 적자입니다` });
  }
  if (balanceCash > cashAtBalance) {
    warnings.push({
      level: 'fatal',
      text: `잔금에서 ${won(balanceCash - cashAtBalance)}이 빕니다 `
        + `(대출 한도 ${won(mortgage)} + 입주 시점 예상 현금 ${won(cashAtBalance)})`,
    });
  } else if (balanceCash > cashAtBalance * 0.7) {
    warnings.push({ level: 'warn', text: `잔금이 빠듯합니다 — 예상 현금 ${won(cashAtBalance)} 중 ${won(balanceCash)} 사용` });
  }
  if (monthlyAfterMoveIn < 0) warnings.push({ level: 'warn', text: `입주 후 월 ${won(-monthlyAfterMoveIn)} 적자` });

  const verdict = warnings.some((w) => w.level === 'fatal')
    ? 'danger'
    : warnings.length ? 'caution' : 'safe';

  return {
    price, marketValue, premium: marketValue - price,
    schedule, depositAmount: depositStep.amount, midTotal, balance,
    midLoanOk, midLoan, midCash, midInterestMonthly,
    mortgage, mortgageMonthly, mortgageLimit: mort,
    balanceCash, dsrAfter, monthlyAfterMoveIn, living, recoverable,
    monthsToBalance, projectedSaving, cashAtBalance, avgMidInterest,
    warnings, verdict,
  };
}

/* ───────────────────────────── 월 현금흐름 ───────────────────────────── */

export function monthlyCashflow(state) {
  const size = householdSize(state);
  const tier = residenceDistrict(state).tier;
  const income = householdIncome(state);
  const living = livingCost(size, tier, householdIncome(state));
  const rent = state.housing === 'monthly' ? state.monthlyRent
    : state.rental ? state.rental.monthly : 0;
  const debt = totalMonthlyPayment(state);
  const savings = state.accountPayment;
  const net = income - living - rent - debt - savings;

  return { income, living, rent, debt, savings, net };
}

/* ───────────────────────────── 대출 실행 ───────────────────────────── */

export function takeMortgage(state, amount, turn) {
  if (amount <= 0) return null;
  const d = makeDebt('mortgage', amount, mortgageRate(state), FINANCE.mortgageYears * 12, turn, '주택담보대출');
  state.debts.push(d);
  return d;
}

export function takeMidLoan(state, amount, turn) {
  if (amount <= 0) return null;
  const d = makeDebt('mid', amount, midLoanRate(state), 36, turn, '중도금대출(이자후불)');
  state.debts.push(d);
  return d;
}

export function takeCreditLoan(state, amount, turn) {
  if (amount <= 0) return null;
  const d = makeDebt('credit', amount, creditRate(state), 60, turn, '신용대출');
  state.debts.push(d);
  return d;
}

export function repayDebt(state, debt, amount) {
  const pay = Math.min(amount, debt.principal);
  debt.principal -= pay;
  if (debt.principal <= 1000) {
    state.debts = state.debts.filter((d) => d !== debt);
  }
  return pay;
}

/** 자동 신용대출을 몇 건까지 굴릴 수 있는가 — 이 이상은 은행이 내주지 않는다 */
export const MAX_CREDIT_LOANS = 3;

/**
 * 신용대출로 메울 수 있는 최대치.
 * 연소득 배수 한도는 "이미 쓴 신용대출"을 차감해야 한다. 그러지 않으면
 * 매달 연소득 1.2배를 새로 빌릴 수 있어서 현금이 바닥나도 파산이 오지 않는다.
 */
export function creditCapacity(state) {
  const outstanding = state.debts.filter((d) => d.type === 'credit');
  if (outstanding.length >= MAX_CREDIT_LOANS) return 0;

  const used = outstanding.reduce((a, d) => a + d.principal, 0);
  const creditK = clamp((state.credit - 480) / 320, 0.15, 1);       // 신용점수가 낮으면 한도도 준다
  const byIncome = householdIncome(state) * 12 * 1.2 * creditK - used;
  const byDsr = principalFromPayment(dsrHeadroom(state), creditRate(state), 5);
  return Math.max(0, Math.min(byIncome, byDsr));
}
