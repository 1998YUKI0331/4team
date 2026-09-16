import {
  MAX_TURNS, MARKET, livingCost, won, ymLabel, reWinLockMonths, 억, 만,
  DEPOSIT_OPTIONS,
} from '../data/constants.js';
import {
  householdIncome, householdSize, totalMonthlyPayment, monthlyPayment, netWorth,
  residenceDistrict, pushLog, setIncome,
} from './state.js';
import {
  buildSchedule, takeMortgage, takeMidLoan, takeCreditLoan, maxMortgage,
  midLoanRate, midLoanAvailable, creditCapacity, monthlyCashflow,
} from './finance.js';
import { DISTRICTS } from '../data/geo.js';
import { gaJeom } from './scoring.js';
import { computeOdds, draw } from './lottery.js';
import { evaluateNotice } from './eligibility.js';
import { rollEvent, eventChance } from '../data/events.js';
import { APPLICABLE, LAST_REAL_TURN, noticesOpenAt } from '../data/notices.js';
import { generatedNoticesFor } from '../data/generator.js';
import { clamp, rand, randRange, chance } from './rng.js';

/* ═══════════════════════════ 공고 풀 ═══════════════════════════ */

const genCache = new Map();

/** 해당 턴에 접수 중인 모든 공고 (실데이터 + 절차생성) */
export function openNotices(state) {
  const real = noticesOpenAt(state.turn, APPLICABLE);
  const gen = [];
  for (let t = Math.max(LAST_REAL_TURN + 1, state.turn - 1); t <= state.turn; t++) {
    if (t <= LAST_REAL_TURN) continue;
    // capBoost = '분양가상한제 확대' 이벤트. 이후 새로 뜨는 단지의 안전마진이 커진다.
    if (!genCache.has(t)) genCache.set(t, generatedNoticesFor(t, state.priceIndex, state.capBoost ?? 1));
    for (const n of genCache.get(t)) {
      if (state.turn >= n.announceTurn && state.turn <= n.deadlineTurn) gen.push(n);
    }
  }
  return [...real, ...gen];
}

/** 앞으로 다가올 공고 (미리보기) */
export function upcomingNotices(state, ahead = 4) {
  return APPLICABLE
    .filter((n) => n.announceTurn > state.turn && n.announceTurn <= state.turn + ahead)
    .sort((a, b) => a.announceTurn - b.announceTurn);
}

/* ═══════════════════════════ 월간 행동 ═══════════════════════════ */

export const ACTIONS = [
  {
    id: 'normal', icon: '🗓', label: '평범한 한 달', hint: '스트레스 −4',
    apply(s) { s.stress = clamp(s.stress - 4, 0, 100); return '무난한 한 달을 보냈습니다.'; },
  },
  {
    id: 'grind', icon: '💪', label: '야근 · 부업', hint: '이번 달 소득 +22%, 스트레스 +9',
    apply(s) {
      const extra = Math.round(householdIncome(s) * 0.22);
      s.cash += extra;
      s.stress = clamp(s.stress + 9, 0, 100);
      return `부업 수입 ${won(extra)} 추가 (스트레스 +9)`;
    },
  },
  {
    id: 'career', icon: '📚', label: '자격증 · 커리어',
    hint: '기본 소득 영구 +1.2% (상한까지), 스트레스 +5',
    apply(s) {
      const before = s.income;
      setIncome(s, s.income * 1.012);
      s.stress = clamp(s.stress + 5, 0, 100);
      return s.income > before
        ? `역량 강화 — 월 소득 ${won(before)} → ${won(s.income)}`
        : `이미 이 커리어의 상한(${won(s.incomeCap)})입니다. 이직이 필요합니다.`;
    },
  },
  {
    id: 'rest', icon: '🧘', label: '휴식', hint: '스트레스 −16, 이번 달 소득 −8%',
    apply(s) {
      const loss = Math.round(householdIncome(s) * 0.08);
      s.cash -= loss;
      s.stress = clamp(s.stress - 16, 0, 100);
      return `푹 쉬었습니다 (소득 −${won(loss)}, 스트레스 −16)`;
    },
  },
  {
    id: 'research', icon: '🔍', label: '임장 · 시장조사',
    hint: '다음 달 공고의 경쟁률·커트라인이 실제값으로 표시됨 (−25만)',
    apply(s) {
      s.cash -= 25 * 만;
      s.researched = s.turn;
      s.stress = clamp(s.stress + 2, 0, 100);
      return '임장을 다녀왔습니다 — 다음 달 공고는 어림값이 아니라 실제 경쟁률이 보입니다.';
    },
  },
];

export function doAction(state, actionId) {
  const a = ACTIONS.find((x) => x.id === actionId) ?? ACTIONS[0];
  const msg = a.apply(state);
  state.actionTaken = a.id;
  pushLog(state, 'action', `${a.icon} ${a.label}`, msg);
  return msg;
}

export function setDeposit(state, amount) {
  const v = DEPOSIT_OPTIONS.includes(amount) ? amount : DEPOSIT_OPTIONS[1];
  state.accountPayment = v;
  pushLog(state, 'account', '청약통장 납입액 변경', `월 ${won(v)}`);
}

/* ═══════════════════════════ 이사 ═══════════════════════════ */

/** 이사 비용 — 이사·중개비 + (전세라면) 보증금 차액 */
export function moveCost(state, district) {
  const cur = residenceDistrict(state);
  const fee = 320 * 만 + Math.round(district.base * 억 * 0.004);
  const depositGap = state.housing === 'jeonse'
    ? Math.round((district.base - cur.base) * 억 * 0.34 * state.priceIndex)
    : 0;
  return { fee, depositGap, total: fee + depositGap };
}

/** 지금 이사할 수 있는가 — 불가능하면 사유 문자열 */
export function moveBlocker(state) {
  if (state.owned || state.housing === 'owned') return '자가에 거주 중이라 이사할 수 없습니다.';
  if (state.rental) return '공공임대 거주 중에는 이사할 수 없습니다.';
  if (state.contract) return '분양 계약이 진행 중입니다. 입주까지는 거주지를 옮길 수 없습니다.';
  return null;
}

/**
 * 거주지 이전.
 * 지역우선공급(당첨 확률 1.85배 vs 0.52배)을 노린 전략적 이사를 위한 수단이며,
 * 대가로 거주기간이 0 이 되어 한동안 지역우선 자격을 잃는다.
 */
export function moveResidence(state, districtKey) {
  const d = DISTRICTS[districtKey];
  if (!d) return { error: '알 수 없는 지역입니다.' };
  if (d.key === state.residenceKey) return { error: '이미 그 지역에 살고 있습니다.' };

  const blocked = moveBlocker(state);
  if (blocked) return { error: blocked };

  const c = moveCost(state, d);
  if (state.cash < c.total) return { error: `현금이 ${won(c.total - state.cash)} 부족합니다.` };

  state.cash -= c.total;
  if (state.housing === 'jeonse') state.jeonseDeposit += c.depositGap;
  state.residenceKey = districtKey;
  state.residenceMonths = 0;
  state.stress = clamp(state.stress + 6, 0, 100);

  const gapNote = c.depositGap === 0 ? ''
    : ` · 보증금 ${c.depositGap > 0 ? '추가' : '회수'} ${won(Math.abs(c.depositGap))}`;
  pushLog(state, 'move', `📦 이사 — ${d.district}`,
    `이사·중개비 ${won(c.fee)}${gapNote} · 거주기간 0개월부터 다시`);
  return { ok: true, district: d, cost: c };
}

/* ═══════════════════════════ 청약 ═══════════════════════════ */

/**
 * 청약 신청 → 즉시 추첨 결과를 만든다 (연출은 UI 가 재생)
 */
export function apply(state, notice, supplyType, unitTypeId) {
  const evalr = evaluateNotice(state, notice);
  const supply = evalr.supplies.find((s) => s.type === supplyType);
  if (!supply || !supply.eligible || evalr.blockers.length) {
    return { error: evalr.blockers[0] ?? '해당 유형의 자격 요건을 충족하지 않습니다.' };
  }

  const unitType = notice.kind === 'sale'
    ? notice.unitTypes.find((u) => u.id === unitTypeId) ?? notice.unitTypes[0]
    : null;

  const odds = computeOdds(state, notice, supply, unitType);
  const result = draw(state, notice, supply, unitType, odds);

  state.appliedThisTurn = true;
  state.stats.applied += 1;
  state.applications.push({
    turn: state.turn, noticeId: notice.id, title: notice.title,
    type: supplyType, unit: unitType?.label ?? notice.rentTerms?.mode,
    win: result.win, score: odds.myScore, cutline: result.finalCutline, ratio: odds.ratio,
  });

  if (result.win) {
    state.stats.won += 1;
    state.everWon = true;
    pushLog(state, 'win', `🎉 당첨 — ${notice.title}`,
      `${supplyType} / ${unitType?.label ?? notice.rentTerms?.mode} · 경쟁률 ${odds.ratio.toFixed(1)}:1`);
  } else {
    state.stats.lost += 1;
    pushLog(state, 'lose', `낙첨 — ${notice.title}`,
      odds.mode === '추첨제'
        ? `${supplyType} · 경쟁률 ${odds.ratio.toFixed(1)}:1`
        : `${supplyType} · 내 점수 ${odds.myScore?.toFixed(0)} / 커트라인 ${result.finalCutline?.toFixed(0)}`);
  }

  return { odds, result, unitType, supply, notice };
}

/** 당첨 수락 → 분양계약 체결 (또는 임대 입주) */
export function acceptWin(state, notice, unitType) {
  if (notice.kind === 'rent') {
    const t = notice.rentTerms;
    const shortfall = t.deposit - state.cash;
    if (shortfall > 0) {
      // 전세보증금 회수로 충당
      if (state.housing === 'jeonse') releaseJeonse(state);
    }
    state.cash -= t.deposit;
    state.rental = {
      noticeId: notice.id, title: notice.title,
      deposit: t.deposit, monthly: t.monthly, mode: t.mode,
      since: state.turn, districtKey: notice.district.key,
    };
    state.housing = 'rent';
    state.monthlyRent = t.monthly;
    state.residenceKey = notice.district.key;
    state.residenceMonths = 0;
    pushLog(state, 'move', `🔑 임대주택 입주 — ${notice.title}`,
      `보증금 ${won(t.deposit)} / 월 ${won(t.monthly)}`);
    return { kind: 'rent' };
  }

  const price = unitType.price;
  const schedule = buildSchedule(price, state.turn);
  state.contract = {
    noticeId: notice.id,
    title: notice.title,
    districtKey: notice.district.key,
    unitLabel: unitType.label,
    area: unitType.area,
    price,
    premium: notice.premium,
    marketValue: price * notice.premium * state.priceIndex,
    schedule,
    paid: 0,
    contractTurn: state.turn,
    moveInTurn: schedule[schedule.length - 1].turn,
    midLoan: 0,
  };
  state.firstHomeEver = false;
  pushLog(state, 'contract', `📝 분양계약 — ${notice.title} ${unitType.label}`,
    `분양가 ${won(price)} · 입주 예정 ${ymLabel(state.contract.moveInTurn)}`);
  return { kind: 'sale', contract: state.contract };
}

/** 당첨 포기 */
export function forfeitWin(state, notice) {
  state.reWinLockUntil = state.turn + reWinLockMonths(notice.district);
  state.stats.forfeited += 1;
  state.credit = clamp(state.credit - 40, 300, 950);
  pushLog(state, 'forfeit', `당첨 포기 — ${notice.title}`,
    `재당첨 제한 ${ymLabel(state.reWinLockUntil)}까지 · 신용 −40`);
}

/** 계약 해제 (자금 조달 실패) */
export function breakContract(state) {
  const c = state.contract;
  if (!c) return;
  const forfeited = Math.round(c.paid * 0.6); // 위약금으로 납입금의 60% 몰취
  state.cash += c.paid - forfeited;
  state.debts = state.debts.filter((d) => d.type !== 'mid');
  state.reWinLockUntil = state.turn + reWinLockMonths(DISTRICTS[c.districtKey]);
  state.credit = clamp(state.credit - 90, 300, 950);
  state.stats.forfeited += 1;
  pushLog(state, 'forfeit', `💥 계약 해제 — ${c.title}`,
    `납입금 ${won(c.paid)} 중 ${won(forfeited)} 몰취 · 재당첨 제한 ${ymLabel(state.reWinLockUntil)}까지`);
  state.contract = null;
}

/* ═══════════════════════════ 전세 정리 ═══════════════════════════ */

function releaseJeonse(state) {
  if (state.housing !== 'jeonse') return 0;
  const loans = state.debts.filter((d) => d.type === 'jeonse');
  const loanTotal = loans.reduce((a, d) => a + d.principal, 0);
  const net = state.jeonseDeposit - loanTotal;
  state.cash += net;
  state.debts = state.debts.filter((d) => d.type !== 'jeonse');
  state.jeonseDeposit = 0;
  state.housing = 'monthly';
  state.monthlyRent = Math.round(livingCost(householdSize(state), 1, householdIncome(state)) * 0.42);
  return net;
}

/* ═══════════════════════════ 턴 진행 ═══════════════════════════ */

export function advanceTurn(state) {
  if (state.over) return { over: true };

  const report = {
    turn: state.turn + 1,
    payments: [], events: [], notes: [],
    crisis: null, moveIn: null, ending: null,
  };

  state.turn += 1;
  state.appliedThisTurn = false;
  state.actionTaken = null;

  /* 1. 시간 경과 */
  state.accountMonths += 1;
  state.accountPaidCount += 1;
  state.residenceMonths += 1;
  state.accountBalance += state.accountPayment;

  /* 2. 시장 */
  const tier = residenceDistrict(state).tier;
  const g = MARKET.annualGrowth[tier] / 12;
  const drift = randRange(-0.0035, 0.0055);
  state.priceIndex = clamp(state.priceIndex * (1 + g + drift), 0.55, 4.5);
  if (state.owned) {
    state.owned.marketValue = state.owned.basePrice * state.owned.premium * state.priceIndex;
  }
  if (state.contract) {
    state.contract.marketValue = state.contract.price * state.contract.premium * state.priceIndex;
  }

  /* 3. 현금흐름 */
  const size = householdSize(state);
  const living = livingCost(size, tier, householdIncome(state)) + (state.careCost ?? 0);
  const income = householdIncome(state);
  const rent = state.housing === 'monthly' ? state.monthlyRent
    : state.rental ? state.rental.monthly : 0;

  let debtPaid = 0;
  for (const d of [...state.debts]) {
    const pay = monthlyPayment(d);
    const interest = d.principal * (d.rate / 12);
    debtPaid += pay;
    if (!d.interestOnly) {
      d.principal = Math.max(0, d.principal - (pay - interest));
      d.remaining = Math.max(1, d.remaining - 1);
      if (d.principal <= 1000) state.debts = state.debts.filter((x) => x !== d);
    }
  }

  const net = income - living - rent - debtPaid - state.accountPayment;
  state.cash += net;
  report.cashflow = { income, living, rent, debt: debtPaid, savings: state.accountPayment, net };

  /* 4. 분양대금 납입 */
  if (state.contract) {
    const due = state.contract.schedule.filter((s) => !s.paid && s.turn <= state.turn);
    for (const step of due) {
      const res = payStep(state, step);
      report.payments.push(res);
      if (res.crisis) { report.crisis = res.crisis; break; }
      if (step.kind === 'balance' && step.paid) {
        report.moveIn = completeMoveIn(state);
        report.ending = finish(state, 'owner'); // 입주 = 게임의 목표 달성
      }
    }
  }

  /* 5. 스트레스 / 신용 */
  state.stress = clamp(state.stress + (net < 0 ? 4 : -1.2), 0, 100);
  if (state.stress > 85) {
    setIncome(state, state.income * 0.985);
    report.notes.push('스트레스 과다로 업무 능률이 떨어지고 있습니다 (소득 −1.5%)');
  }
  state.credit = clamp(state.credit + (net > 0 ? 0.8 : -2.2), 300, 950);

  /* 6. 파산 판정 */
  if (state.cash < 0 && !report.crisis) {
    const cap = creditCapacity(state);
    const need = -state.cash;
    if (cap >= need) {
      const amt = Math.ceil(need / 1_000_000) * 1_000_000;
      takeCreditLoan(state, amt, state.turn);
      state.cash += amt;
      state.credit = clamp(state.credit - 25, 300, 950);   // 돌려막기는 신용을 깎는다
      report.notes.push(`현금이 마이너스라 신용대출 ${won(amt)}을 실행했습니다 (신용 −25).`);
      pushLog(state, 'debt', '신용대출 자동 실행', won(amt));
    } else if (state.housing === 'jeonse') {
      const got = releaseJeonse(state);
      report.notes.push(`자금 부족으로 전세를 정리하고 월세로 전환했습니다 (회수 ${won(got)}).`);
      pushLog(state, 'move', '전세 → 월세 전환', `보증금 ${won(got)} 회수`);
    } else {
      report.ending = finish(state, 'bankrupt');
      return report;
    }
  }

  /* 7. 이벤트 */
  if (!report.crisis && !report.ending && chance(eventChance(state))) {
    const ev = rollEvent(state);
    if (ev) report.events.push(ev);
  }

  /* 8. 기록 & 종료 판정 */
  state.history.push({ turn: state.turn, net: netWorth(state), index: state.priceIndex, score: gaJeom(state).total });
  if (state.history.length > 200) state.history.shift();

  if (!report.ending && state.turn >= MAX_TURNS) {
    report.ending = finish(state, state.owned ? 'owner' : 'timeout');
  }

  return report;
}

/* ═══════════════════════════ 분양대금 납입 ═══════════════════════════ */

function payStep(state, step) {
  const c = state.contract;
  const out = { step, label: step.label, amount: step.amount, method: null, crisis: null };

  if (step.kind === 'mid' && midLoanAvailable(state, c.price)) {
    // 중도금대출 — 이자후불제
    const loan = takeMidLoan(state, step.amount, state.turn);
    c.midLoan += step.amount;
    c.paid += step.amount;
    step.paid = true;
    out.method = 'midloan';
    pushLog(state, 'pay', `${step.label} 납입`, `중도금대출 ${won(step.amount)} 실행 (이자만 월 ${won(step.amount * midLoanRate(state) / 12)})`);
    return out;
  }

  if (step.kind === 'balance') {
    // 전세보증금 회수 → 주담대 → 부족분
    const recovered = releaseJeonse(state);
    const district = DISTRICTS[c.districtKey] ?? { regulated: false };
    const mort = maxMortgage(state, { district }, c.marketValue);
    const needTotal = step.amount + c.midLoan;
    const mortgage = Math.min(needTotal, mort.limit);
    if (mortgage > 0) {
      takeMortgage(state, mortgage, state.turn);
      state.cash += mortgage;
    }
    // 중도금대출 상환
    for (const d of state.debts.filter((x) => x.type === 'mid')) {
      state.cash -= d.principal;
    }
    state.debts = state.debts.filter((d) => d.type !== 'mid');
    state.cash -= step.amount;

    if (state.cash < 0) {
      const short = -state.cash;
      state.cash = 0;
      out.crisis = makeCrisis(state, step, short, { recovered, mortgage });
      return out;
    }
    c.paid += step.amount;
    step.paid = true;
    out.method = 'mortgage';
    pushLog(state, 'pay', '잔금 납입', `주담대 ${won(mortgage)} + 현금 · 전세보증금 ${won(recovered)} 회수`);
    return out;
  }

  // 계약금 또는 중도금(대출불가) — 현금
  if (state.cash >= step.amount) {
    state.cash -= step.amount;
    c.paid += step.amount;
    step.paid = true;
    out.method = 'cash';
    pushLog(state, 'pay', `${step.label} 납입`, `현금 ${won(step.amount)}`);
    return out;
  }

  out.crisis = makeCrisis(state, step, step.amount - state.cash, {});
  return out;
}

function makeCrisis(state, step, shortfall, ctx) {
  const options = [];
  const capacity = creditCapacity(state);
  if (capacity >= shortfall) {
    options.push({
      id: 'credit',
      label: `신용대출 ${won(shortfall)} 실행`,
      hint: `금리 ${((0.068 + state.rateDelta) * 100).toFixed(1)}% · 5년 · DSR 잔여 한도 내`,
      safe: true,
    });
  } else if (capacity > 0) {
    options.push({
      id: 'credit-partial',
      label: `신용대출 ${won(capacity)} (부족분 ${won(shortfall - capacity)})`,
      hint: 'DSR 한도까지만 가능 — 여전히 부족합니다',
      safe: false,
    });
  }
  if (state.accountBalance > 0) {
    options.push({
      id: 'account',
      label: `청약통장 해지 (${won(state.accountBalance)})`,
      hint: '가입기간·예치금이 0이 됩니다. 이후 청약 사실상 불가',
      safe: false,
    });
  }
  if (state.housing === 'jeonse') {
    options.push({ id: 'jeonse', label: '전세 정리 후 월세 전환', hint: `보증금 회수 ${won(state.jeonseDeposit)}`, safe: true });
  }
  options.push({
    id: 'break',
    label: '계약 해제 (포기)',
    hint: '납입금의 60% 몰취 + 재당첨 5년 제한',
    danger: true,
  });

  return { step, shortfall, options, ctx };
}

/** 위기 상황에서 플레이어가 고른 선택지 실행 */
export function resolveCrisis(state, crisis, optionId) {
  const step = crisis.step;
  let msg = '';

  switch (optionId) {
    case 'credit': {
      const amt = Math.ceil(crisis.shortfall / 1_000_000) * 1_000_000;
      takeCreditLoan(state, amt, state.turn);
      state.cash += amt;
      msg = `신용대출 ${won(amt)} 실행`;
      break;
    }
    case 'credit-partial': {
      const amt = Math.floor(creditCapacity(state) / 1_000_000) * 1_000_000;
      takeCreditLoan(state, amt, state.turn);
      state.cash += amt;
      msg = `신용대출 ${won(amt)} 실행 (부족분 잔존)`;
      break;
    }
    case 'account': {
      state.cash += state.accountBalance;
      msg = `청약통장 해지 ${won(state.accountBalance)}`;
      state.accountBalance = 0; state.accountMonths = 0; state.accountPaidCount = 0;
      break;
    }
    case 'jeonse': {
      const got = releaseJeonse(state);
      msg = `전세 정리 — ${won(got)} 회수`;
      break;
    }
    case 'break':
      breakContract(state);
      return { broke: true, msg: '계약을 해제했습니다.' };
  }

  pushLog(state, 'debt', '자금 조달', msg);

  // 재시도
  const res = payStep(state, step);
  if (res.crisis) return { crisis: res.crisis, msg };
  if (step.kind === 'balance' && step.paid) {
    const moveIn = completeMoveIn(state);
    return { ok: true, msg, moveIn, ending: finish(state, 'owner') };
  }
  return { ok: true, msg, moveIn: null };
}

/* ═══════════════════════════ 입주 ═══════════════════════════ */

function completeMoveIn(state) {
  const c = state.contract;
  state.owned = {
    noticeId: c.noticeId,
    title: c.title,
    districtKey: c.districtKey,
    unitLabel: c.unitLabel,
    area: c.area,
    basePrice: c.price,
    premium: c.premium,
    marketValue: c.marketValue,
    movedInTurn: state.turn,
  };
  state.housing = 'owned';
  state.monthlyRent = 0;
  state.residenceKey = c.districtKey;
  state.residenceMonths = 0;
  state.rental = null;
  state.contract = null;
  pushLog(state, 'movein', `🏡 입주 완료 — ${c.title}`,
    `${c.unitLabel} · 시세 ${won(c.marketValue)} (분양가 ${won(c.price)})`);
  return { owned: state.owned, gain: c.marketValue - c.price };
}

/* ═══════════════════════════ 엔딩 ═══════════════════════════ */

export function finish(state, kind) {
  state.over = true;
  const nw = netWorth(state);
  const score = computeScore(state, nw, kind);
  const ending = buildEnding(state, kind, nw, score);
  state.ending = ending;
  pushLog(state, 'end', `게임 종료 — ${ending.rank}랭크`, ending.title);
  return ending;
}

/**
 * 최종 점수 — "얼마나 빨리 아무 집이나" 가 아니라
 * "얼마나 좋은 집에, 얼마나 건전한 재무로" 도달했는지를 본다.
 */
function computeScore(state, nw, kind) {
  if (kind === 'bankrupt') return Math.max(0, Math.round((nw / 억) * 18));
  const g = gaJeom(state).total;

  // 현금은 기여 상한을 둔다 — 통장 잔고가 아니라 "어떤 집에 도달했는가"가 등급을 가른다
  let s = Math.min(820, (nw / 억) * 30) + g * 5;

  if (state.owned) {
    const d = DISTRICTS[state.owned.districtKey] ?? residenceDistrict(state);
    s += 260 + Math.pow(d.tier, 1.7) * 260;                                  // 입지가 점수의 핵심
    s += ((state.owned.marketValue - state.owned.basePrice) / 억) * 100;      // 시세차익
  } else if (state.rental) {
    s += 80;
  }

  s -= state.stats.forfeited * 150;
  s -= state.stress * 0.8;
  return Math.max(0, Math.round(s));
}

const RANKS = [
  { min: 1750, rank: 'S', title: '수도권 핵심지 입성' },
  { min: 1300, rank: 'A', title: '내 집 마련 성공' },
  { min: 950, rank: 'B', title: '외곽이지만, 내 집' },
  { min: 600, rank: 'C', title: '아직 진행 중' },
  { min: 300, rank: 'D', title: '버티기의 연속' },
  { min: 0, rank: 'F', title: '재도전이 필요합니다' },
];

function buildEnding(state, kind, nw, score) {
  const g = gaJeom(state);
  let base = RANKS.find((r) => score >= r.min) ?? RANKS[RANKS.length - 1];
  let title = base.title;
  let body;

  if (kind === 'bankrupt') {
    base = { rank: 'F', title: '파산' };
    title = '파산';
    body = '원리금을 감당하지 못했습니다. 무리한 자금 계획은 당첨보다 무섭습니다.';
  } else if (state.owned) {
    const d = residenceDistrict(state);
    const gain = state.owned.marketValue - state.owned.basePrice;
    body = `${d.district} ${state.owned.title} ${state.owned.unitLabel}에 입주했습니다. `
      + `분양가 ${won(state.owned.basePrice)} → 현재 시세 ${won(state.owned.marketValue)} `
      + `(평가이익 ${won(gain)}). ${state.stats.applied}번 지원해서 ${state.stats.won}번 당첨.`;
  } else if (state.rental) {
    title = '임대주택 정착';
    body = `${state.rental.title}에서 주거는 안정시켰지만 내 집 마련은 이루지 못했습니다. `
      + `최종 가점 ${g.total}점 — 다음 판이라면 훨씬 유리합니다.`;
  } else {
    title = kind === 'timeout' ? '11년, 그리고 여전히 무주택' : title;
    body = `${state.stats.applied}번 청약해서 ${state.stats.won}번 당첨됐습니다. `
      + `최종 가점 ${g.total}점 / 집값 지수는 ${((state.priceIndex - 1) * 100).toFixed(0)}% 올랐습니다.`;
  }

  return {
    kind, rank: base.rank, title, body, score,
    netWorth: nw,
    gaJeom: g.total,
    priceIndex: state.priceIndex,
    turns: state.turn,
    stats: { ...state.stats },
    owned: state.owned,
    playerName: state.playerName,
    presetName: state.presetName,
  };
}

/* ═══════════════════════════ 요약 헬퍼 ═══════════════════════════ */

export function statusSummary(state) {
  const cf = monthlyCashflow(state);
  const g = gaJeom(state);
  return {
    cashflow: cf,
    gaJeom: g,
    netWorth: netWorth(state),
    debt: state.debts.reduce((a, d) => a + d.principal, 0),
    monthlyDebt: totalMonthlyPayment(state),
    size: householdSize(state),
  };
}
