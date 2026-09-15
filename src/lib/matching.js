import { SPECIAL_LABEL } from './notices';

/**
 * 기존 내집매칭(asis) HTML 의 "내 조건 입력 → 자격 확인" 로직을 옮겨 왔다.
 *
 * 옮기면서 고친 것 두 가지.
 *  1) `incomeLimit: null` 은 "소득 제한 없음/공고문 확인" 이라는 뜻인데 예전 코드는
 *     `incomePct > null` 비교(= 0원 제한)로 취급해서 기관추천·노부모부양·일반공급이
 *     전부 탈락했다. 실데이터 40건에서는 이 값이 대부분이라 결과가 늘 0건이었다.
 *  2) 마감일이 없는 공고(12건)에서 날짜 계산이 깨지던 부분. 날짜 판단은 목록 쪽
 *     status 로 일원화하고 여기서는 자격만 본다.
 *
 * 자동으로 확정할 수 없는 조건(기관추천 대상 여부, 소득 기준 미기재)은 탈락시키지 않고
 * `uncertain` 으로 표시해서 "확인 필요"로 보여 준다.
 */

/** 가구원수별 도시근로자 월평균소득 100% 기준 (2026년 예시값, 단위: 만원) */
export const INCOME_BASELINE = { 1: 299, 2: 452, 3: 573, 4: 649, 5: 646, 6: 686, 7: 722 };

export function baselineIncome(household) {
  return INCOME_BASELINE[Math.min(Math.max(Number(household) || 1, 1), 7)];
}

export const MARITAL_OPTIONS = [
  { value: '미혼', label: '미혼' },
  { value: '예비', label: '예비 신혼부부 (혼인신고 전)' },
  { value: '신혼7', label: '신혼부부 (혼인 7년 이내)' },
  { value: '기혼7초과', label: '혼인 7년 초과 / 기혼' },
];

export const DEFAULT_PROFILE = {
  age: 34,
  household: 3,
  marital: '신혼7',
  children: 1,
  subMonths: 30,
  income: 580,
  noHouse: true,
  firstHome: true,
  parentSupport: false,
  newborn: false, // 2년 이내 출생 자녀 (신생아 특별공급)
};

export function createProfile() {
  return { ...DEFAULT_PROFILE };
}

export function incomePercent(profile) {
  const base = baselineIncome(profile.household);
  return Math.round(((Number(profile.income) || 0) / base) * 100);
}

/** 유형별 조건 검사. 통과하면 null, 막히면 사유 문자열을 돌려준다. */
function typeBlocker(sp, profile) {
  switch (sp.type) {
    case '신혼부부':
      return profile.marital === '예비' || profile.marital === '신혼7'
        ? null
        : `혼인 ${sp.maxMarriageYears ?? 7}년 이내 (예비 신혼부부 포함)`;
    case '신생아':
      return profile.newborn ? null : '2년 이내 출생 자녀';
    case '생애최초':
      return profile.firstHome ? null : '생애 최초 주택 구입';
    case '다자녀':
      return profile.children >= (sp.minChildren || 2) ? null : `자녀 ${sp.minChildren || 2}명 이상`;
    case '노부모부양':
      return profile.parentSupport ? null : '만 65세 이상 직계존속 3년 이상 부양';
    case '청년':
      return profile.age >= (sp.minAge || 19) && profile.age <= (sp.maxAge || 39)
        ? null
        : `만 ${sp.minAge || 19}~${sp.maxAge || 39}세`;
    default:
      return null;
  }
}

/**
 * 결과 등급 — 카드/마커에 한 단어로 붙이려고 나눠 둔다.
 *  special : 특별공급 자격이 확실히 하나 이상
 *  check   : 특별공급 후보는 있는데 기관추천·소득 미기재라 확인이 필요
 *  general : 일반공급만 가능
 *  no      : 통장/연령에 막히거나 해당 유형 없음
 */
export const TIER_LABEL = {
  special: '특별공급 가능',
  check: '자격 확인 필요',
  general: '일반공급 가능',
  no: '조건 미충족',
};

/**
 * @returns {{
 *   ok: boolean,
 *   tier: 'special'|'check'|'general'|'no',
 *   tierLabel: string,
 *   matched: Array<{type:string,label:string,note:string,uncertain:boolean}>,
 *   missed: Array<{type:string,label:string,reason:string}>,
 *   blockers: string[],
 *   incomePct: number,
 * }}
 */
export function evaluate(notice, profile) {
  const pct = incomePercent(profile);
  const matched = [];
  const missed = [];
  const blockers = [];

  // 공고 단위 조건 — 통장 가입기간·신청 연령은 유형과 무관하게 먼저 막힌다.
  if (notice.minSubMonths && (Number(profile.subMonths) || 0) < notice.minSubMonths) {
    blockers.push(`청약통장 ${notice.minSubMonths}개월 이상 필요 (내 조건 ${Number(profile.subMonths) || 0}개월)`);
  }
  if (notice.minAge && (Number(profile.age) || 0) < notice.minAge) {
    blockers.push(`만 ${notice.minAge}세 이상 신청 가능`);
  }

  for (const sp of notice.special ?? []) {
    const label = SPECIAL_LABEL[sp.type] ?? sp.type;

    if (sp.requiresNoHouse && !profile.noHouse) {
      missed.push({ type: sp.type, label, reason: '무주택 세대구성원 요건' });
      continue;
    }

    const blocked = typeBlocker(sp, profile);
    if (blocked) {
      missed.push({ type: sp.type, label, reason: blocked });
      continue;
    }

    // 소득 기준이 적혀 있는 유형만 숫자로 검사한다. null 은 "공고문 확인".
    if (sp.incomeLimit != null && pct > sp.incomeLimit) {
      missed.push({ type: sp.type, label, reason: `소득 ${pct}% > 기준 ${sp.incomeLimit}%` });
      continue;
    }

    const uncertain = sp.type === '기관추천' || sp.incomeLimit == null;
    const note =
      sp.type === '기관추천'
        ? '기관 추천 대상 여부는 해당 기관에 확인 필요'
        : sp.incomeLimit == null
          ? '소득 기준 미기재 — 공고문 확인 필요'
          : `소득 ${pct}% ≤ 기준 ${sp.incomeLimit}%`;

    matched.push({ type: sp.type, label, note, uncertain });
  }

  const specials = matched.filter((m) => m.type !== '일반공급');
  let tier = 'no';
  if (blockers.length === 0 && matched.length > 0) {
    if (specials.some((m) => !m.uncertain)) tier = 'special';
    else if (specials.length) tier = 'check';
    else tier = 'general';
  }

  return {
    ok: tier !== 'no',
    tier,
    tierLabel: TIER_LABEL[tier],
    matched,
    missed,
    blockers,
    incomePct: pct,
  };
}

/** 전체 공고에 대한 매칭 결과 Map(id -> result) */
export function evaluateAll(notices, profile) {
  const out = new Map();
  for (const n of notices) out.set(n.id, evaluate(n, profile));
  return out;
}
