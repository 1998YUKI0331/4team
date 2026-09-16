/**
 * 수도권 시군구 좌표 테이블.
 * notices.json 에 등장하는 모든 지역 + 게임 맵을 채울 주변 지역을 포함한다.
 * 씬 좌표는 서울시청(37.5665, 126.9780)을 원점으로 한 근사 평면직교 투영이며
 * 1 world unit ≈ 1 km 로 맞춰져 있다.
 */

const ORIGIN = { lat: 37.5665, lng: 126.978 };
const KM_PER_LAT = 111.0;
const KM_PER_LNG = 88.3; // cos(37.5°) 보정

/**
 * tier : 지역 등급. 청약 경쟁률·집값 상승률·규제 여부의 기반값.
 *   3 = 서울 핵심 / 2 = 서울·경기 준핵심 / 1 = 경기 중위 / 0 = 경기 외곽
 * base : 2026-07 기준 84㎡ 환산 시세 지수 (억원). 타일 높이의 출발점.
 */
const RAW = {
  // ── 서울 ───────────────────────────────────────────────
  '서울 중구':        { lat: 37.5641, lng: 126.9979, tier: 3, base: 14.5 },
  '서울 동작구':      { lat: 37.5124, lng: 126.9393, tier: 3, base: 13.8 },
  '서울 영등포구':    { lat: 37.5264, lng: 126.8962, tier: 3, base: 13.2 },
  '서울 서대문구':    { lat: 37.5791, lng: 126.9368, tier: 2, base: 11.6 },
  '서울 성북구':      { lat: 37.5894, lng: 127.0167, tier: 2, base: 10.9 },
  '서울 노원구':      { lat: 37.6542, lng: 127.0568, tier: 2, base: 9.4 },
  '서울 강서구':      { lat: 37.5509, lng: 126.8495, tier: 2, base: 11.1 },
  '서울 강남구':      { lat: 37.5172, lng: 127.0473, tier: 3, base: 26.0 },
  '서울 송파구':      { lat: 37.5145, lng: 127.1059, tier: 3, base: 20.4 },
  '서울 마포구':      { lat: 37.5663, lng: 126.9019, tier: 3, base: 14.9 },

  // ── 인천 ───────────────────────────────────────────────
  '인천 서구':        { lat: 37.5454, lng: 126.6759, tier: 1, base: 5.6 },
  '인천 서해구':      { lat: 37.5454, lng: 126.6759, tier: 1, base: 5.6 }, // 원문 표기 보정(=서구)
  '인천 미추홀구':    { lat: 37.4636, lng: 126.6503, tier: 1, base: 4.9 },
  '인천 남동구':      { lat: 37.4474, lng: 126.7314, tier: 1, base: 5.2 },
  '인천 부평구':      { lat: 37.5070, lng: 126.7219, tier: 1, base: 5.4 },
  '인천 계양구':      { lat: 37.5373, lng: 126.7377, tier: 1, base: 5.1 },
  '인천 연수구':      { lat: 37.4100, lng: 126.6785, tier: 2, base: 7.8 },

  // ── 경기 ───────────────────────────────────────────────
  '경기 성남시 분당구': { lat: 37.3829, lng: 127.1189, tier: 3, base: 15.8 },
  '경기 과천시':      { lat: 37.4292, lng: 126.9877, tier: 3, base: 17.2 },
  '경기 하남시':      { lat: 37.5393, lng: 127.2148, tier: 2, base: 10.2 },
  '경기 광명시':      { lat: 37.4792, lng: 126.8646, tier: 2, base: 9.6 },
  '경기 안양시':      { lat: 37.3943, lng: 126.9568, tier: 2, base: 9.1 },
  '경기 의왕시':      { lat: 37.3448, lng: 126.9683, tier: 2, base: 8.3 },
  '경기 수원시':      { lat: 37.2636, lng: 127.0286, tier: 2, base: 7.9 },
  '경기 부천시':      { lat: 37.5034, lng: 126.7660, tier: 1, base: 6.4 },
  '경기 용인시':      { lat: 37.2411, lng: 127.1776, tier: 1, base: 6.8 },
  '경기 김포시':      { lat: 37.6152, lng: 126.7156, tier: 1, base: 5.5 },
  '경기 남양주시':    { lat: 37.6360, lng: 127.2165, tier: 1, base: 5.8 },
  '경기 시흥시':      { lat: 37.3800, lng: 126.8029, tier: 1, base: 5.3 },
  '경기 안산시':      { lat: 37.3219, lng: 126.8309, tier: 1, base: 5.0 },
  '경기 의정부시':    { lat: 37.7381, lng: 127.0338, tier: 1, base: 5.2 },
  '경기 화성시':      { lat: 37.1996, lng: 126.8312, tier: 1, base: 6.1 },
  '경기 오산시':      { lat: 37.1499, lng: 127.0773, tier: 0, base: 4.3 },
  '경기 평택시':      { lat: 36.9921, lng: 127.1129, tier: 0, base: 4.1 },
  '경기 이천시':      { lat: 37.2723, lng: 127.4350, tier: 0, base: 4.0 },
  '경기 여주시':      { lat: 37.2983, lng: 127.6370, tier: 0, base: 3.4 },
  '경기 안성시':      { lat: 37.0080, lng: 127.2797, tier: 0, base: 3.3 },
  '경기 양주시':      { lat: 37.7852, lng: 127.0458, tier: 0, base: 3.9 },
  '경기 포천시':      { lat: 37.8949, lng: 127.2003, tier: 0, base: 3.0 },
  '경기 동두천시':    { lat: 37.9036, lng: 127.0606, tier: 0, base: 2.8 },
  '경기 양평군':      { lat: 37.4917, lng: 127.4875, tier: 0, base: 3.2 },
  '경기 고양시':      { lat: 37.6584, lng: 126.8320, tier: 1, base: 6.6 },
  '경기 성남시':      { lat: 37.4200, lng: 127.1265, tier: 2, base: 11.4 },
};

/** 규제지역(투기과열/조정대상) — LTV 50%, 중도금대출 제한이 걸린다. */
const REGULATED = new Set([
  '서울 중구', '서울 동작구', '서울 영등포구', '서울 서대문구', '서울 성북구',
  '서울 노원구', '서울 강서구', '서울 강남구', '서울 송파구', '서울 마포구',
  '경기 성남시 분당구', '경기 과천시', '경기 하남시', '경기 광명시', '경기 성남시',
]);

function project(lat, lng) {
  return {
    x: (lng - ORIGIN.lng) * KM_PER_LNG,
    z: -(lat - ORIGIN.lat) * KM_PER_LAT,
  };
}

/** key -> { key, region, district, lat, lng, x, z, tier, base, regulated } */
export const DISTRICTS = Object.fromEntries(
  Object.entries(RAW).map(([key, v]) => {
    const sp = key.indexOf(' ');
    const region = key.slice(0, sp);
    const district = key.slice(sp + 1);
    return [key, {
      key, region, district,
      lat: v.lat, lng: v.lng,
      ...project(v.lat, v.lng),
      tier: v.tier,
      base: v.base,
      regulated: REGULATED.has(key),
    }];
  })
);

export const DISTRICT_LIST = Object.values(DISTRICTS);

/**
 * notices.json 의 district 필드는 "경기 안산시, 안양시, ..." 처럼 다중 지역이거나
 * "화성시·평택시" 처럼 가운뎃점으로 묶인 경우가 있다. 대표 지역 1곳으로 정규화한다.
 */
export function resolveDistrict(region, district) {
  if (!district) return DISTRICTS[`${region} 수원시`] ?? DISTRICT_LIST[0];
  const first = String(district).split(/[,·]/)[0].trim();

  const exact = DISTRICTS[`${region} ${first}`];
  if (exact) return exact;

  // "성남시 분당구" 같이 두 단어인데 상위 시만 등록된 경우 등을 폭넓게 매칭
  const loose = DISTRICT_LIST.find(
    (d) => d.region === region && (d.district.startsWith(first) || first.startsWith(d.district))
  );
  if (loose) return loose;

  return DISTRICT_LIST.find((d) => d.region === region) ?? DISTRICT_LIST[0];
}

/** 다중 지역 공고에서 실제로 묶여 있던 모든 지역명(표시용) */
export function splitDistricts(district) {
  if (!district) return [];
  return String(district).split(/[,·]/).map((s) => s.trim()).filter(Boolean);
}

export const MAP_BOUNDS = (() => {
  const xs = DISTRICT_LIST.map((d) => d.x);
  const zs = DISTRICT_LIST.map((d) => d.z);
  return {
    minX: Math.min(...xs), maxX: Math.max(...xs),
    minZ: Math.min(...zs), maxZ: Math.max(...zs),
  };
})();
