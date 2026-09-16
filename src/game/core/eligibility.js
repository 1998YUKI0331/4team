import {
  urbanIncome, REQUIRED_DEPOSIT, specialMeta, won, ymLabel,
} from '../data/constants.js';
import {
  householdSize, householdIncome, isNoHouse, minorChildren, hasNewborn,
  marriageYears, ageYears,
} from './state.js';
import { supplyBoost } from './lottery.js';

const ok = (label, detail) => ({ ok: true, label, detail });
const no = (label, detail) => ({ ok: false, label, detail });

/**
 * 공고 전체에 걸리는 차단 사유 (유형과 무관)
 * @returns {string[]} 비어 있으면 지원 가능
 */
export function noticeBlockers(state, notice) {
  const out = [];
  if (state.contract) out.push('이미 분양 계약이 진행 중입니다. 계약을 마치거나 포기해야 재청약할 수 있습니다.');
  if (state.turn < state.reWinLockUntil) {
    out.push(`재당첨 제한 기간입니다 (${ymLabel(state.reWinLockUntil)}까지).`);
  }
  if (state.appliedThisTurn) out.push('이번 달에는 이미 청약을 넣었습니다. 한 달에 한 건만 가능합니다.');
  if (notice.kind === 'info') out.push('신규 청약 공고가 아닌 안내문입니다.');
  return out;
}

/** 해당지역 거주자 우선공급에 필요한 최소 거주기간 */
export const LOCAL_PRIORITY_MONTHS = 12;

/**
 * 해당 지역 거주자 우선공급 대상인지.
 * 주소만 옮겨서는 안 되고 거주기간을 채워야 한다 — 그래야 이사·이직 이벤트의
 * "거주기간 초기화 → 지역우선 상실" 이 실제로 대가를 치른다.
 */
export function isLocalPriority(state, notice) {
  const res = state.residenceKey ?? '';
  if (res !== notice.district.key) return false;      // 그 외는 기타지역 2순위
  return (state.residenceMonths ?? 0) >= LOCAL_PRIORITY_MONTHS;
}

/**
 * 특정 공급 유형의 자격 판정
 * @returns {{type, units, eligible, checks, priority, local, meta}}
 */
export function checkSupply(state, notice, supply) {
  const checks = [];
  const size = householdSize(state);
  const income = householdIncome(state);
  const meta = specialMeta(supply.type);

  // 1) 나이
  const age = ageYears(state);
  checks.push(age >= (notice.minAge ?? 19)
    ? ok('연령', `만 ${age}세`)
    : no('연령', `만 ${notice.minAge}세 이상 필요 (현재 ${age}세)`));

  // 2) 청약통장 가입기간
  const needMonths = notice.minSubMonths ?? 0;
  if (needMonths > 0) {
    checks.push(state.accountMonths >= needMonths
      ? ok('청약통장', `${state.accountMonths}개월 가입`)
      : no('청약통장', `${needMonths}개월 이상 필요 (현재 ${state.accountMonths}개월)`));
  } else {
    checks.push(ok('청약통장', '가입 요건 없음'));
  }

  // 3) 예치금 (민영 분양만)
  if (notice.kind === 'sale' && notice.agency === '민간') {
    const need = REQUIRED_DEPOSIT[notice.region] ?? 2_500_000;
    checks.push(state.accountBalance >= need
      ? ok('예치금', `${won(state.accountBalance)} 보유`)
      : no('예치금', `${notice.region} 기준 ${won(need)} 이상 필요 (현재 ${won(state.accountBalance)})`));
  }

  // 4) 무주택
  if (supply.requiresNoHouse) {
    checks.push(isNoHouse(state)
      ? ok('무주택', '무주택 세대구성원')
      : no('무주택', '주택을 보유하고 있어 신청할 수 없습니다'));
  }

  // 5) 소득 기준
  if (supply.incomeLimit != null) {
    const limit = urbanIncome(size) * (supply.incomeLimit / 100);
    checks.push(income <= limit
      ? ok('소득', `월 ${won(income)} ≤ 기준 ${won(limit)} (${supply.incomeLimit}%)`)
      : no('소득', `도시근로자 ${supply.incomeLimit}% = ${won(limit)} 초과 (현재 ${won(income)})`));
  }

  // 6) 유형별 고유 요건
  switch (supply.type) {
    case '다자녀': {
      const need = supply.minChildren ?? 2;
      const n = minorChildren(state);
      checks.push(n >= need
        ? ok('자녀', `미성년 자녀 ${n}명`)
        : no('자녀', `미성년 자녀 ${need}명 이상 필요 (현재 ${n}명)`));
      break;
    }
    case '신혼부부': {
      const y = marriageYears(state);
      const maxY = supply.maxMarriageYears ?? 7;
      if (y === null) checks.push(no('혼인', '혼인신고를 하지 않았습니다'));
      else checks.push(y <= maxY
        ? ok('혼인', `혼인 ${y.toFixed(1)}년차 (${maxY}년 이내)`)
        : no('혼인', `혼인 ${y.toFixed(1)}년차 — ${maxY}년을 초과했습니다`));
      break;
    }
    case '신생아':
    case '신생아우선공급(1순위자)': {
      checks.push(hasNewborn(state)
        ? ok('신생아', '2년 이내 출생 자녀 있음')
        : no('신생아', '공고일 기준 2년 이내 출생 자녀가 필요합니다'));
      break;
    }
    case '생애최초': {
      checks.push(state.firstHomeEver
        ? ok('생애최초', '주택 구입 이력 없음')
        : no('생애최초', '이미 주택을 소유했던 이력이 있습니다'));
      checks.push(state.taxYears >= 5
        ? ok('소득세', `${state.taxYears}년 납부`)
        : no('소득세', `5년 이상 납부 필요 (현재 ${state.taxYears}년)`));
      const hasFamily = state.married || minorChildren(state) > 0;
      checks.push(hasFamily
        ? ok('세대', '혼인 중이거나 자녀가 있음')
        : no('세대', '혼인 중이거나 미혼 자녀가 있어야 합니다'));
      break;
    }
    case '노부모부양': {
      const months = state.supportingParents ? state.turn - (state.parentsSince ?? state.turn) : -1;
      checks.push(months >= 36
        ? ok('부양', `직계존속 ${Math.floor(months / 12)}년 부양 중`)
        : no('부양', months < 0
          ? '만 65세 이상 직계존속을 부양하고 있지 않습니다'
          : `3년 이상 부양 필요 (현재 ${months}개월)`));
      break;
    }
    case '기관추천':
    case '국가유공자': {
      checks.push(state.institutionRecommended
        ? ok('기관추천', '추천 대상자로 확정')
        : no('기관추천', '기관 추천 대상자가 아닙니다'));
      break;
    }
    case '지역균형발전': {
      const need = 24;
      checks.push(state.residenceKey === notice.district.key && state.residenceMonths >= need
        ? ok('거주', `${notice.district.district} ${state.residenceMonths}개월 거주`)
        : no('거주', `${notice.district.district}에 ${need}개월 이상 거주해야 합니다`));
      break;
    }
    case '협의양도인':
    case '이주자주택': {
      checks.push(no('대상', '사업지구 내 토지 소유자·이주 대상자만 신청할 수 있습니다'));
      break;
    }
    default:
      break;
  }

  // 7) 임대주택 추가 요건
  if (notice.kind === 'rent') {
    const limit = urbanIncome(size) * 1.0;
    checks.push(income <= limit
      ? ok('임대 소득기준', `월 ${won(income)} ≤ ${won(limit)}`)
      : no('임대 소득기준', `도시근로자 100% = ${won(limit)} 이하여야 합니다`));
    const assetCap = 360_000_000;
    const assets = state.cash + state.jeonseDeposit + state.accountBalance;
    checks.push(assets <= assetCap
      ? ok('자산기준', `${won(assets)} ≤ ${won(assetCap)}`)
      : no('자산기준', `총자산 ${won(assetCap)} 이하 (현재 ${won(assets)})`));
  }

  const eligible = checks.every((c) => c.ok);
  const local = isLocalPriority(state, notice);

  return {
    type: supply.type,
    // '특별공급 물량 확대' 이벤트가 걸려 있으면 실제로 물량이 늘어난다
    units: Math.round(supply.units * supplyBoost(state, supply.type)),
    requiresNoHouse: supply.requiresNoHouse,
    incomeLimit: supply.incomeLimit,
    eligible,
    checks,
    local,
    priority: local ? 1 : 2,
    meta,
  };
}

/** 공고의 모든 공급 유형 판정 */
export function evaluateNotice(state, notice) {
  const blockers = noticeBlockers(state, notice);
  const supplies = notice.supplies.map((sp) => checkSupply(state, notice, sp));
  return {
    blockers,
    supplies,
    anyEligible: blockers.length === 0 && supplies.some((s) => s.eligible),
  };
}
