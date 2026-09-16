import { scoreNoHouse, scoreDependents, scoreAccount, MAX_SCORE } from '../data/constants.js';
import { noHouseYears, dependents, isNoHouse } from './state.js';

/**
 * 청약 가점 (84점 만점)
 *  · 무주택기간 32 · 부양가족수 35 · 청약통장 가입기간 17
 */
export function gaJeom(state) {
  const nh = isNoHouse(state) ? noHouseYears(state) : 0;
  const dep = dependents(state);
  const acc = state.accountMonths;

  const parts = [
    {
      key: 'noHouse',
      label: '무주택기간',
      value: isNoHouse(state) ? scoreNoHouse(nh) : 0,
      max: 32,
      detail: isNoHouse(state) ? `${Math.floor(nh)}년 ${Math.round((nh % 1) * 12)}개월` : '유주택 (0점)',
      hint: '만 30세 또는 혼인신고일 중 빠른 날부터 1년당 2점',
    },
    {
      key: 'dependents',
      label: '부양가족수',
      value: scoreDependents(dep),
      max: 35,
      detail: `${dep}명`,
      hint: '배우자·미성년 자녀·3년 이상 부양 직계존속. 1명당 5점',
    },
    {
      key: 'account',
      label: '통장 가입기간',
      value: scoreAccount(acc),
      max: 17,
      detail: `${Math.floor(acc / 12)}년 ${acc % 12}개월`,
      hint: '15년 이상이면 만점 17점',
    },
  ];

  return {
    total: parts.reduce((a, p) => a + p.value, 0),
    max: MAX_SCORE,
    parts,
  };
}

/** 다음 가점 상승까지 몇 개월 남았는지 — UI 에서 "기다림의 가치"를 보여준다 */
export function nextScoreGain(state) {
  const now = gaJeom(state).total;
  for (let ahead = 1; ahead <= 60; ahead++) {
    const probe = {
      ...state,
      turn: state.turn + ahead,
      accountMonths: state.accountMonths + ahead,
    };
    if (gaJeom(probe).total > now) {
      return { months: ahead, to: gaJeom(probe).total };
    }
  }
  return null;
}

/**
 * 특별공급 배점 (0~100 스케일).
 * 가점제가 아닌 유형의 내부 순위를 정한다 — 실제 공고의 배점표를 단순화한 것.
 */
export function specialRank(state, type) {
  const minors = state.children.filter((c) => (state.turn - c.bornTurn) < 19 * 12).length;
  const newborns = state.children.filter((c) => (state.turn - c.bornTurn) <= 24).length;
  const accYears = Math.min(15, state.accountMonths / 12);
  const resYears = Math.min(10, state.residenceMonths / 12);
  const nhYears = Math.min(15, noHouseYears(state));

  switch (type) {
    case '다자녀':
      // 미성년 자녀수(최대 54) + 무주택기간(최대 22) + 거주기간(최대 15) + 통장(최대 9)
      return Math.min(100, minors * 18 + nhYears * 1.5 + resYears * 1.5 + accYears * 0.6);

    case '신혼부부':
    case '신생아':
    case '신생아우선공급(1순위자)':
      // 신생아(최대 40) + 미성년 자녀(최대 27) + 거주기간(최대 18) + 통장(최대 12)
      return Math.min(100, newborns * 20 + minors * 9 + resYears * 1.8 + accYears * 0.8);

    case '노부모부양':
    case '일반공급':
      return gaJeom(state).total;

    default:
      return Math.min(100, 24 + accYears * 1.6 + resYears * 2.2 + nhYears * 1.1);
  }
}
