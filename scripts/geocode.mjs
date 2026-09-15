/**
 * notices.json + scripts/addresses.json -> src/data/notices.geo.json
 *
 * 네이버 Geocoding API 는 브라우저에서 직접 호출할 수 없다(CORS + Secret 노출).
 * 그래서 좌표는 이 스크립트로 한 번만 만들어 정적 JSON 으로 떨군다.
 *
 * 주소가 정확할수록 좋지만 공고마다 정밀도가 다르므로, 넓은 쪽으로 단계적으로
 * 후퇴하면서 첫 성공을 채택하고 그 단계를 precision 으로 남긴다.
 *   lot(지번) > dong(읍면동) > gu(일반구) > district(시군구) > region(시도)
 * 지도에서 'dong' 이하는 "대략적 위치" 로 표시한다.
 *
 * 실행: npm run data:geocode
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  process.loadEnvFile(path.join(ROOT, '.env'));
} catch {
  /* .env 없으면 환경변수로 받는다 */
}

const ID = process.env.NAVER_MAP_CLIENT_ID;
const SECRET = process.env.NAVER_MAP_CLIENT_SECRET;
if (!ID || !SECRET) {
  console.error('NAVER_MAP_CLIENT_ID / NAVER_MAP_CLIENT_SECRET 가 없습니다. .env 를 확인하세요.');
  process.exit(1);
}

const GEOCODE = 'https://maps.apigw.ntruss.com/map-geocode/v2/geocode';
const HEADERS = {
  'x-ncp-apigw-api-key-id': ID,
  'x-ncp-apigw-api-key': SECRET,
  Accept: 'application/json',
};

const OUT = path.join(ROOT, 'src', 'data', 'notices.geo.json');
// asis(단일 HTML + serve.ps1) 쪽 "공고 지도" 탭도 같은 파일을 읽는다.
// 그 서버는 자기 폴더만 서빙하므로 사본을 하나 떨궈 둔다.
const OUT_ASIS = path.join(ROOT, 'asis', 'notices.geo.json');
const CACHE_FILE = path.join(ROOT, 'scripts', '.geocode-cache.json');

const SIDO_FULL = {
  서울: '서울특별시', 부산: '부산광역시', 대구: '대구광역시', 인천: '인천광역시',
  광주: '광주광역시', 대전: '대전광역시', 울산: '울산광역시', 세종: '세종특별자치시',
  경기: '경기도', 강원: '강원특별자치도', 충북: '충청북도', 충남: '충청남도',
  전북: '전북특별자치도', 전남: '전라남도', 경북: '경상북도', 경남: '경상남도', 제주: '제주특별자치도',
};

/** LH 임대공고처럼 특정 단지가 아닌 "관할" 단위 공고의 표시 위치 */
const JURISDICTION = {
  '북부(관할)': '의정부시', // LH 경기북부지역본부 관할
  '남부(관할)': '수원시', // LH 경기남부지역본부 관할
};

let cache = {};
try {
  cache = JSON.parse(await fs.readFile(CACHE_FILE, 'utf8'));
} catch {
  /* 첫 실행 */
}

async function geocode(query) {
  if (query in cache) return cache[query];
  const res = await fetch(`${GEOCODE}?query=${encodeURIComponent(query)}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`geocode ${res.status} ${await res.text()}`);
  const json = await res.json();
  const a = json.addresses?.[0];
  const hit = a ? { lat: Number(a.y), lng: Number(a.x), matched: a.roadAddress || a.jibunAddress } : null;
  cache[query] = hit;
  await new Promise((r) => setTimeout(r, 120)); // 호출 간격 여유
  return hit;
}

/** 넓은 쪽으로 후퇴하는 질의 후보들 */
function buildQueries(notice, addr) {
  const sido = SIDO_FULL[notice.region] ?? notice.region ?? '';
  const district = (notice.district ?? '').split('·')[0].trim();
  const mapped = JURISDICTION[district] ?? district;

  const out = [];
  const push = (query, precision) => {
    if (query && query.trim().length > 2) out.push({ query: query.replace(/\s+/g, ' ').trim(), precision });
  };

  if (addr?.address) push(addr.address, addr.jibun ? 'lot' : 'dong');
  if (addr?.addressNoJibun && addr.addressNoJibun !== addr.address) push(addr.addressNoJibun, 'dong');
  if (addr?.sido && addr?.sigungu) push([addr.sido, addr.sigungu, addr.gu].filter(Boolean).join(' '), 'gu');
  if (mapped) push(`${sido} ${mapped}`, 'district');
  push(sido, 'region');
  return out;
}

/** "_비고" 안의 분양가 범위를 숫자로 뽑는다. */
function parsePrice(note) {
  if (typeof note !== 'string') return { min: null, max: null };
  const m = note.match(/최저\s*([\d,]+)\s*~\s*최고\s*([\d,]+)/);
  if (!m) return { min: null, max: null };
  const n = (s) => Number(s.replace(/,/g, ''));
  return { min: n(m[1]), max: n(m[2]) };
}

function categoryOf(housingType = '') {
  if (housingType.includes('민간분양')) return '민간분양';
  if (housingType.includes('공공분양')) return '공공분양';
  if (housingType.includes('임대')) return '임대';
  return '기타';
}

const notices = JSON.parse(await fs.readFile(path.join(ROOT, 'notices.json'), 'utf8'));
const addresses = JSON.parse(await fs.readFile(path.join(ROOT, 'scripts', 'addresses.json'), 'utf8'));

const items = [];
for (const n of notices) {
  const addr = addresses[n.id];
  const candidates = buildQueries(n, addr);

  let geo = null;
  let used = null;
  for (const c of candidates) {
    try {
      const hit = await geocode(c.query);
      if (hit) {
        geo = hit;
        used = c;
        break;
      }
    } catch (e) {
      console.warn(`  ! ${n.id} "${c.query}" ${e.message}`);
    }
  }

  if (!geo) console.warn(`  !! ${n.id} 좌표 실패: ${n.title}`);

  const price = parsePrice(n._비고);
  items.push({
    id: n.id,
    title: n.title,
    agency: n.agency,
    agencyName: n.agencyName,
    region: n.region,
    district: n.district,
    housingType: n.housingType,
    category: categoryOf(n.housingType),
    announce: n.announce,
    deadline: n.deadline,
    special: n.special ?? [],
    specialTypes: (n.special ?? []).map((s) => s.type),
    minSubMonths: n.minSubMonths,
    minAge: n.minAge,
    url: n.url,
    note: typeof n._비고 === 'string' ? n._비고 : null,
    extra: typeof n._비고 === 'object' && n._비고 ? n._비고 : null,
    priceMin: price.min,
    priceMax: price.max,
    address: addr?.address ?? null,
    addressSource: addr?.source ?? null,
    pdf: addr?.pdf ?? null,
    lat: geo?.lat ?? null,
    lng: geo?.lng ?? null,
    precision: used?.precision ?? null,
    geoQuery: used?.query ?? null,
    geoMatched: geo?.matched ?? null,
  });

  console.log(
    `${n.id.padEnd(4)} ${(used?.precision ?? 'FAIL').padEnd(9)} ${String(geo?.lat ?? '').padEnd(10)} ${String(geo?.lng ?? '').padEnd(11)} ${used?.query ?? ''}`
  );
}

/**
 * 같은 좌표에 여러 공고가 겹치면(예: 같은 동만 아는 두 블록) 마커가 하나처럼 보인다.
 * 지도에서 구분되도록 30m 남짓 원형으로 흩어놓고 표시만 분리한다.
 */
const byPos = new Map();
for (const it of items) {
  if (it.lat == null) continue;
  const key = `${it.lat.toFixed(6)},${it.lng.toFixed(6)}`;
  if (!byPos.has(key)) byPos.set(key, []);
  byPos.get(key).push(it);
}
let nudged = 0;
for (const group of byPos.values()) {
  if (group.length < 2) continue;
  group.forEach((it, i) => {
    const angle = (2 * Math.PI * i) / group.length;
    const r = 0.00035; // 약 35~40m
    it.lat += r * Math.sin(angle);
    it.lng += r * Math.cos(angle) * 1.25;
    it.nudged = true;
    nudged++;
  });
}

const payload = JSON.stringify(
  { generatedAt: new Date().toISOString(), count: items.length, items },
  null,
  2
);
await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, payload, 'utf8');
try {
  await fs.access(path.dirname(OUT_ASIS));
  await fs.writeFile(OUT_ASIS, payload, 'utf8');
  console.log(`사본 -> ${path.relative(ROOT, OUT_ASIS)}`);
} catch {
  /* asis 폴더가 없으면 건너뛴다 */
}
await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');

const ok = items.filter((i) => i.lat != null).length;
const lot = items.filter((i) => i.precision === 'lot').length;
console.log(`\n좌표 ${ok}/${items.length} (지번 정밀도 ${lot}건, 겹침 보정 ${nudged}건) -> ${path.relative(ROOT, OUT)}`);
