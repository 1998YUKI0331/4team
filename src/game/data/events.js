import { 만, 억, won, pct } from './constants.js';
import { makeDebt, householdIncome, setIncome, changeCareer } from '../core/state.js';
import { clamp, rand, randRange, randInt, randPick, chance } from '../core/rng.js';
import { DISTRICT_LIST, DISTRICTS } from './geo.js';

/**
 * 이벤트 = { id, title, icon, tone, text, weight(state), once?, choices:[{label,hint,apply(state)->string}] }
 * apply 는 로그에 남길 결과 문자열을 반환한다.
 */

const MARKET_TONE = 'market';
const LIFE_TONE = 'life';
const RISK_TONE = 'risk';

export const EVENTS = [
  /* ── 시장 ───────────────────────────────────────────── */
  {
    id: 'rate-up', icon: '📈', tone: MARKET_TONE, title: '기준금리 인상',
    text: '한국은행이 기준금리를 올렸습니다. 주택담보대출 금리가 따라 오르고, 대출 한도는 줄어듭니다.',
    weight: () => 10,
    choices: [{
      label: '어쩔 수 없다',
      apply(s) {
        const d = randRange(0.004, 0.013);
        s.rateDelta += d;
        for (const debt of s.debts) debt.rate += d;
        s.heatMod = clamp(s.heatMod * 0.93, 0.5, 2.2);
        return `대출 금리 +${(d * 100).toFixed(2)}%p — 현재 주담대 ${((0.041 + s.rateDelta) * 100).toFixed(2)}%`;
      },
    }],
  },
  {
    id: 'rate-down', icon: '📉', tone: MARKET_TONE, title: '기준금리 인하',
    text: '경기 부양을 위해 기준금리가 내렸습니다. 대출 여력이 늘지만 청약 경쟁도 뜨거워집니다.',
    weight: (s) => (s.rateDelta > 0 ? 9 : 4),
    choices: [{
      label: '숨통이 트인다',
      apply(s) {
        const d = randRange(0.004, 0.011);
        s.rateDelta = Math.max(-0.02, s.rateDelta - d);
        for (const debt of s.debts) debt.rate = Math.max(0.018, debt.rate - d);
        s.heatMod = clamp(s.heatMod * 1.09, 0.5, 2.2);
        return `대출 금리 −${(d * 100).toFixed(2)}%p — 청약 경쟁률 상승`;
      },
    }],
  },
  {
    id: 'ltv-ease', icon: '🏛', tone: MARKET_TONE, title: 'LTV 규제 완화',
    text: '정부가 실수요자 대상 담보인정비율을 상향 조정했습니다.',
    weight: () => 5,
    choices: [{
      label: '좋은 소식',
      apply(s) { s.ltvMod = clamp(s.ltvMod + 0.05, -0.2, 0.2); return `LTV +5%p (현재 가산 ${pct(s.ltvMod, 0)})`; },
    }],
  },
  {
    id: 'ltv-tight', icon: '🚧', tone: MARKET_TONE, title: '대출 규제 강화',
    text: '가계부채 관리 대책으로 담보인정비율이 하향됩니다.',
    weight: (s) => (s.priceIndex > 1.15 ? 8 : 4),
    choices: [{
      label: '하필 지금...',
      apply(s) { s.ltvMod = clamp(s.ltvMod - 0.05, -0.2, 0.2); return `LTV −5%p (현재 가산 ${pct(s.ltvMod, 0)})`; },
    }],
  },
  {
    id: 'boom', icon: '🔥', tone: MARKET_TONE, title: '수도권 집값 급등',
    text: '전세 매물이 사라지고 매매가가 튀어올랐습니다. 청약 경쟁률도 치솟습니다.',
    weight: () => 8,
    choices: [{
      label: '따라잡아야 한다',
      apply(s) {
        const g = randRange(0.020, 0.048);
        s.priceIndex *= 1 + g;
        s.heatMod = clamp(s.heatMod * 1.16, 0.5, 2.4);
        return `집값 지수 +${(g * 100).toFixed(1)}% → ${s.priceIndex.toFixed(3)}`;
      },
    }],
  },
  {
    id: 'slump', icon: '🧊', tone: MARKET_TONE, title: '미분양 확산',
    text: '지방과 수도권 외곽에서 미분양이 쌓이고 있습니다. 경쟁률이 내려가지만 시세차익도 줄어듭니다.',
    weight: (s) => (s.priceIndex > 1.2 ? 9 : 5),
    choices: [{
      label: '기회일 수도',
      apply(s) {
        const g = randRange(0.004, 0.022);
        s.priceIndex *= 1 - g;
        s.heatMod = clamp(s.heatMod * 0.78, 0.45, 2.4);
        return `집값 지수 −${(g * 100).toFixed(1)}%, 청약 경쟁률 급락`;
      },
    }],
  },
  {
    id: 'special-expand', icon: '📜', tone: MARKET_TONE, title: '특별공급 물량 확대',
    text: '신혼·신생아 특별공급 비율이 상향되었습니다.',
    weight: () => 4,
    choices: [{
      label: '반가운 소식',
      apply(s) { s.specialBoost = (s.specialBoost ?? 1) * 1.18; return '신혼·신생아 특별공급 물량 +18%'; },
    }],
  },
  {
    id: 'newborn-loan', icon: '👶', tone: MARKET_TONE, title: '신생아 특례대출 시행',
    text: '2년 이내 출산 가구에 초저리 주택담보대출이 공급됩니다.',
    weight: (s) => (s.children.some((c) => s.turn - c.bornTurn <= 24) ? 12 : 0),
    choices: [{
      label: '신청한다',
      apply(s) {
        s.rateDelta -= 0.010;
        for (const d of s.debts) if (d.type === 'mortgage') d.rate = Math.max(0.015, d.rate - 0.014);
        return '주담대 금리 −1.0%p 적용 (신생아 특례)';
      },
    }],
  },

  /* ── 생활 ───────────────────────────────────────────── */
  {
    id: 'bonus', icon: '💰', tone: LIFE_TONE, title: '성과급 지급',
    text: '회사 실적이 좋아 성과급이 나왔습니다.',
    weight: () => 9,
    choices: [
      {
        label: '청약통장에 넣는다', hint: '예치금 증가 — 민영주택 예치금 요건에 유리',
        apply(s) {
          const b = Math.round(householdIncome(s) * randRange(0.8, 2.4) / 10000) * 10000;
          s.accountBalance += b; s.cash += 0;
          return `성과급 ${won(b)} 전액 청약통장 예치 (잔액 ${won(s.accountBalance)})`;
        },
      },
      {
        label: '현금으로 보유', hint: '계약금 대비',
        apply(s) {
          const b = Math.round(householdIncome(s) * randRange(0.8, 2.4) / 10000) * 10000;
          s.cash += b;
          return `성과급 ${won(b)} 수령`;
        },
      },
    ],
  },
  {
    id: 'layoff', icon: '📉', tone: RISK_TONE, title: '구조조정 통보',
    text: '부서가 통폐합됩니다. 희망퇴직을 받거나, 남아서 버티거나.',
    weight: (s) => (s.turn > 6 && s.stress > 30 ? 6 : 3),
    choices: [
      {
        label: '희망퇴직 후 이직', hint: '위로금 + 소득 변동 (도박)',
        apply(s) {
          const severance = s.income * randInt(3, 8);
          s.cash += severance;
          const delta = randRange(-0.22, 0.34);
          changeCareer(s, 1 + delta);
          s.stress = clamp(s.stress + 8, 0, 100);
          return `위로금 ${won(severance)} 수령, 새 직장 소득 ${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(0)}% → 월 ${won(s.income)}`;
        },
      },
      {
        label: '버틴다', hint: '소득 유지, 스트레스 증가',
        apply(s) {
          s.stress = clamp(s.stress + 18, 0, 100);
          setIncome(s, s.income * 0.97);
          return `잔류. 임금 동결에 가까운 조정 (월 ${won(s.income)}), 스트레스 +18`;
        },
      },
    ],
  },
  {
    id: 'parents-gift', icon: '🎁', tone: LIFE_TONE, title: '부모님의 제안',
    text: '"집 살 때 보태라"며 목돈을 주시겠다고 합니다. 증여세 신고를 해야 합니다.',
    weight: (s) => (s.turn > 3 ? 6 : 2), once: true,
    choices: [
      {
        label: '감사히 받는다', hint: '현금 대폭 증가, 증여세 차감',
        apply(s) {
          const gross = randPick([5000, 8000, 12000, 15000]) * 만;
          const taxFree = 5000 * 만;
          const tax = Math.max(0, (gross - taxFree)) * 0.10;
          s.cash += gross - tax;
          return `증여 ${won(gross)} 수령, 증여세 ${won(tax)} 납부 → 순증 ${won(gross - tax)}`;
        },
      },
      { label: '사양한다', hint: '자존심은 지킨다', apply(s) { s.stress = clamp(s.stress - 4, 0, 100); return '지원을 정중히 사양했습니다.'; } },
    ],
  },
  {
    id: 'marry', icon: '💍', tone: LIFE_TONE, title: '결혼',
    text: '오래 만난 사람과 결혼 이야기가 나왔습니다. 혼인신고를 하면 신혼부부 특별공급 7년 시계가 시작됩니다.',
    weight: (s) => (!s.married && s.ageMonths + s.turn > 27 * 12 ? 9 : 0), once: true,
    choices: [
      {
        label: '혼인신고를 한다', hint: '특공 자격 + 맞벌이 소득 / 소득기준 초과 주의',
        apply(s) {
          s.married = true; s.marriageTurn = s.turn;
          s.spouseIncome = Math.round(randRange(180, 380) * 만 / 10000) * 10000;
          s.cash += randInt(1000, 4000) * 만;
          return `혼인신고 완료. 배우자 소득 월 ${won(s.spouseIncome)} 합산 — 신혼부부 특별공급 7년 카운트 시작`;
        },
      },
      { label: '조금 더 미룬다', hint: '무주택기간 가점은 계속 쌓인다', apply() { return '결혼을 미뤘습니다.'; } },
    ],
  },
  {
    id: 'child', icon: '👶', tone: LIFE_TONE, title: '아이가 생겼습니다',
    text: '출산하면 부양가족 가점이 오르고 신생아 특별공급이 2년간 열립니다. 대신 생활비가 늘어납니다.',
    weight: (s) => (s.married && s.children.length < 3 && s.ageMonths + s.turn < 44 * 12 ? 10 : 0),
    choices: [
      {
        label: '출산한다', hint: '가점 +5, 신생아 특공 2년 개방',
        apply(s) {
          s.children.push({ bornTurn: s.turn });
          s.cash -= randInt(300, 800) * 만;
          return `자녀 출생 (총 ${s.children.length}명). 부양가족 가점 +5, 신생아 특별공급 자격 24개월간 유효`;
        },
      },
      { label: '아직은 아니다', hint: '현금 흐름 유지', apply() { return '출산 계획을 미뤘습니다.'; } },
    ],
  },
  {
    id: 'parents-support', icon: '🧓', tone: LIFE_TONE, title: '노부모 부양',
    text: '어머니가 혼자 지내시기 어려워졌습니다. 모시면 3년 뒤 노부모부양 특별공급 자격이 생깁니다.',
    weight: (s) => (!s.supportingParents && s.ageMonths + s.turn > 35 * 12 ? 7 : 0), once: true,
    choices: [
      {
        label: '모신다', hint: '부양가족 +2 (가점 +10), 생활비 증가, 3년 뒤 특공 자격',
        apply(s) {
          s.supportingParents = true; s.parentsSince = s.turn;
          return '직계존속 부양 시작 — 부양가족 +2, 3년 경과 시 노부모부양 특별공급 자격';
        },
      },
      { label: '요양시설을 알아본다', hint: '월 비용 발생', apply(s) { s.careCost = 90 * 만; return '요양시설 이용 — 월 90만원 고정 지출'; } },
    ],
  },
  {
    id: 'institution', icon: '🎖', tone: LIFE_TONE, title: '기관추천 대상자 선정',
    text: '장기근속 중소기업 근로자로 기관추천 특별공급 대상자에 선정되었습니다.',
    weight: (s) => (!s.institutionRecommended && s.turn > 10 ? 4 : 0), once: true,
    choices: [{
      label: '추천서를 받는다',
      apply(s) { s.institutionRecommended = true; return '기관추천 특별공급 자격 획득 — 경쟁률이 가장 낮은 유형'; },
    }],
  },
  {
    id: 'jobhop', icon: '🚀', tone: LIFE_TONE, title: '이직 제안',
    text: '연봉을 크게 올려주는 곳에서 연락이 왔습니다. 다만 근무지가 멉니다.',
    weight: (s) => (s.turn > 8 ? 5 : 0),
    choices: [
      {
        label: '옮긴다 (이사 포함)', hint: '소득 상승 / 거주기간 초기화 → 지역우선 상실',
        apply(s) {
          const up = randRange(0.14, 0.42);
          changeCareer(s, 1 + up);
          const d = randPick(DISTRICT_LIST.filter((x) => x.tier >= 1));
          s.residenceKey = d.key; s.residenceMonths = 0;
          return `소득 +${(up * 100).toFixed(0)}% → 월 ${won(s.income)}. ${d.district}로 이사 (거주기간 초기화)`;
        },
      },
      { label: '거절한다', hint: '거주기간 유지', apply() { return '이직 제안을 거절했습니다.'; } },
    ],
  },
  {
    id: 'invest', icon: '📊', tone: RISK_TONE, title: '투자 기회',
    text: '지인이 확실하다며 권합니다. 여윳돈의 일부를 넣어볼 수 있습니다.',
    weight: (s) => (s.cash > 3000 * 만 ? 7 : 2),
    choices: [
      {
        label: '현금의 30%를 넣는다', hint: '−55% ~ +62% · 기댓값은 본전에 가깝다',
        apply(s) {
          const amt = Math.round(s.cash * 0.3);
          const r = randRange(-0.55, 0.62);
          const pnl = Math.round(amt * r);
          s.cash += pnl;
          s.stress = clamp(s.stress + (pnl < 0 ? 12 : -6), 0, 100);
          return pnl >= 0 ? `투자 성공 +${won(pnl)}` : `투자 손실 ${won(pnl)}`;
        },
      },
      { label: '거절한다', hint: '청약 자금은 건드리지 않는다', apply() { return '투자 제안을 거절했습니다.'; } },
    ],
  },
  {
    id: 'jeonse-fraud', icon: '⚠️', tone: RISK_TONE, title: '전세 보증금 위험 신호',
    text: '살고 있는 집의 등기부에 근저당이 잡혔습니다. 보증보험에 가입할 수 있습니다.',
    weight: (s) => (s.housing === 'jeonse' && !s.jeonseInsured ? 7 : 0),
    choices: [
      {
        label: '보증보험 가입', hint: `보증금의 0.15% 납입`,
        apply(s) {
          const fee = Math.round(s.jeonseDeposit * 0.0015);
          s.cash -= fee; s.jeonseInsured = true;
          return `전세보증금 반환보증 가입 (${won(fee)}) — 보증금 전액 보호`;
        },
      },
      {
        label: '무시한다', hint: '보증금을 잃을 수 있습니다',
        apply(s) { s.jeonseRisk = true; return '보증보험 미가입 — 위험을 안고 갑니다'; },
      },
    ],
  },
  {
    id: 'jeonse-raise', icon: '🏚', tone: RISK_TONE, title: '전세금 인상 요구',
    text: '집주인이 재계약 조건으로 보증금 인상을 요구합니다.',
    weight: (s) => (s.housing === 'jeonse' && s.turn > 12 ? 8 : 0),
    choices: [
      {
        label: '올려주고 눌러앉는다', hint: '전세대출 증액 — DSR 압박',
        apply(s) {
          const up = Math.round(s.jeonseDeposit * randRange(0.06, 0.16) / 1_000_000) * 1_000_000;
          s.jeonseDeposit += up;
          const cover = Math.min(up, s.cash);
          s.cash -= cover;
          const loan = up - cover;
          if (loan > 0) s.debts.push(makeDebt('jeonse', loan, 0.037 + s.rateDelta, 24 * 12, s.turn, '전세자금대출(증액)'));
          return `보증금 ${won(up)} 인상 — 현금 ${won(cover)} + 대출 ${won(loan)}`;
        },
      },
      {
        label: '더 싼 곳으로 이사', hint: '거주기간 초기화, 지역우선 상실',
        apply(s) {
          const cur = DISTRICTS[s.residenceKey];
          const cheaper = DISTRICT_LIST.filter((d) => d.base < (cur?.base ?? 8));
          const d = cheaper.length ? randPick(cheaper) : randPick(DISTRICT_LIST);
          s.residenceKey = d.key; s.residenceMonths = 0;
          s.cash += Math.round(s.jeonseDeposit * 0.12);
          s.jeonseDeposit = Math.round(s.jeonseDeposit * 0.88);
          s.stress = clamp(s.stress + 9, 0, 100);
          return `${d.district}로 이사. 보증금 차액 ${won(Math.round(s.jeonseDeposit * 0.12 / 0.88))} 회수, 거주기간 초기화`;
        },
      },
    ],
  },
  {
    id: 'account-temptation', icon: '🏦', tone: RISK_TONE, title: '청약통장 해지 유혹',
    text: '급한 돈이 필요합니다. 통장을 깨면 당장은 편하지만 가입기간이 0이 됩니다.',
    weight: (s) => (s.cash < 2000 * 만 && s.accountMonths > 24 ? 6 : 0),
    choices: [
      {
        label: '해지한다', hint: '가점 대폭 하락 — 사실상 게임 포기',
        apply(s) {
          s.cash += s.accountBalance;
          const lost = s.accountMonths;
          s.accountBalance = 0; s.accountMonths = 0; s.accountPaidCount = 0;
          return `청약통장 해지 — 현금 +${won(s.cash)}, 가입기간 ${lost}개월 소멸`;
        },
      },
      {
        label: '버틴다', hint: '신용대출로 메운다',
        apply(s) {
          const amt = Math.round(householdIncome(s) * 3 / 10000) * 10000;
          s.cash += amt;
          s.debts.push(makeDebt('credit', amt, 0.068 + s.rateDelta, 60, s.turn, '신용대출'));
          s.stress = clamp(s.stress + 6, 0, 100);
          return `신용대출 ${won(amt)} 실행 — 통장은 지켰습니다`;
        },
      },
    ],
  },
  {
    id: 'burnout', icon: '🥵', tone: RISK_TONE, title: '번아웃',
    text: '쌓인 스트레스가 몸으로 왔습니다.',
    weight: (s) => (s.stress > 62 ? 14 : 0),
    choices: [
      {
        label: '휴직한다', hint: '소득 일시 감소, 스트레스 해소',
        apply(s) {
          const lost = Math.round(s.income * 1.5);
          s.cash -= lost; s.stress = clamp(s.stress - 38, 0, 100);
          return `2개월 휴직 — 소득 손실 ${won(lost)}, 스트레스 −38`;
        },
      },
      {
        label: '약 먹고 버틴다', hint: '소득 유지, 추가 리스크',
        apply(s) {
          s.stress = clamp(s.stress + 6, 0, 100);
          setIncome(s, s.income * 0.94);
          return `버티기 선택 — 업무 효율 저하로 소득 −6% (월 ${won(s.income)})`;
        },
      },
    ],
  },
  {
    id: 'price-cap', icon: '🧾', tone: MARKET_TONE, title: '분양가상한제 확대',
    text: '분양가 규제가 강화되어 신규 단지의 분양가가 시세 대비 크게 낮아집니다. 안전마진이 커지는 만큼 경쟁도 폭발합니다.',
    weight: (s) => (s.priceIndex > 1.1 ? 6 : 3),
    choices: [{
      label: '로또 청약의 시대',
      apply(s) { s.heatMod = clamp(s.heatMod * 1.28, 0.5, 2.6); s.capBoost = (s.capBoost ?? 1) * 1.08; return '청약 경쟁률 +28%, 신규 단지 안전마진 확대'; },
    }],
  },
];

/** 이번 턴에 발생시킬 이벤트 1개 뽑기 */
export function rollEvent(state) {
  const fired = state.firedEvents ?? (state.firedEvents = {});
  const pool = EVENTS.filter((e) => {
    if (e.once && fired[e.id]) return false;
    if (e.id === 'child' && fired.child && state.turn - (fired.child ?? -99) < 18) return false;
    return (e.weight(state) ?? 0) > 0;
  });
  if (!pool.length) return null;

  const total = pool.reduce((a, e) => a + e.weight(state), 0);
  let r = rand() * total;
  for (const e of pool) {
    r -= e.weight(state);
    if (r <= 0) { fired[e.id] = state.turn; return e; }
  }
  const last = pool[pool.length - 1];
  fired[last.id] = state.turn;
  return last;
}

/** 이벤트 발생 확률 — 초반엔 잦고 후반엔 뜸하게 */
export function eventChance(state) {
  return clamp(0.34 - state.turn * 0.0009, 0.16, 0.34);
}
