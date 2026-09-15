/**
 * 공고문 PDF -> 단지 소재지(대지위치/공급위치) 추출
 *
 * notices.json 에는 좌표도 주소도 없어서, 지도에 정확히 찍으려면 원문 공고문에서
 * 위치를 긁어와야 한다. 다행히 입주자모집공고는 거의 예외 없이
 *     ■ 공급위치 : 경기도 화성시 ○○면 ○○리 614-18번지 일원
 * 형태의 줄을 갖는다. PDF 텍스트는 글자 단위로 쪼개져 나오고 순서도 뒤섞이는
 * 경우가 있어서(예: "…중림동번지일원:157-2") 공백을 모두 제거한 문자열에서
 * 라벨 뒤 구간을 잘라내고, 주소 토큰과 지번을 따로 복원한다.
 *
 * 파일명이 `YYYY-MM-DD_지역_단지명.pdf` 라서 notices.json 과 제목으로 조인된다.
 *
 * 출력: scripts/addresses.json
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PDF_DIR = path.join(ROOT, '공고문');
const OUT = path.join(ROOT, 'scripts', 'addresses.json');
const STD_FONTS = path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts/');

/** 앞에 있을수록 신뢰도가 높은 라벨 */
const LABELS = ['공급위치', '대지위치', '건설위치', '사업위치', '주택건설위치', '단지위치', '사업장위치'];

const SIDO = [
  '서울특별시', '부산광역시', '대구광역시', '인천광역시', '광주광역시', '대전광역시', '울산광역시',
  '세종특별자치시', '경기도', '강원특별자치도', '충청북도', '충청남도',
  '전북특별자치도', '전라남도', '경상북도', '경상남도', '제주특별자치도',
];

// 시도 + 시/군/구 + (일반구) + 읍면동리 까지. 지번은 따로 복원한다.
// 공백이 제거된 문자열을 다루므로 수량자는 모두 lazy 여야 한다.
// (greedy 면 "화성시효행구" 를 시군구 한 덩어리로 삼켜버린다)
const ADDR_SRC =
  `(${SIDO.join('|')})` +
  `([가-힣]{1,4}?(?:시|군|구))` +
  `((?:[가-힣]{1,3}?구)?)` +
  `((?:[가-힣]{1,3}?[0-9]?(?:읍|면))?)` +
  `((?:[가-힣0-9]{1,7}?(?:동|리|가))?)`;
const ADDR_RE = new RegExp(ADDR_SRC);
// 빈도 기반 대비책용: 지번 뒤에 단위(㎡·세대·층…)가 붙으면 주소가 아니라 수치다.
// ("일원" 의 '일' 처럼 주소 뒤에 정상적으로 오는 글자는 제외 목록에 넣으면 안 된다)
const ADDR_RE_G = new RegExp(
  ADDR_SRC + `(산?\\d{1,5}(?:-\\d{1,4})?)(?!\\d|㎡|%|세대|층|명|가구|개월|주택형)`,
  'g'
);

/**
 * PDF 에 지번 주소 자체가 없는 공고(택지지구 안에 있어 "○○지구 S1BL" 로만 적힌 경우,
 * 모집공고가 아닌 안내문이라 위치란이 없는 경우)를 위한 수동 보정.
 * 근거를 주석으로 남긴다. 지번이 아니라 법정동 단위이므로 정밀도는 'dong' 으로 표시된다.
 */
const MANUAL = {
  // 공고문: "■공급위치: 경기도 남양주시 진접2공공주택지구 S1BL" — 진접2지구는 진접읍에 있다.
  n21: '경기도 남양주시 진접읍',
  // SH 안내문(모집공고 아님). 제목의 "마곡지구 17단지" 기준.
  n58: '서울특별시 강서구 마곡동',
};

async function readPages(file, onText) {
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(await fs.readFile(file)),
    standardFontDataUrl: STD_FONTS,
    useSystemFonts: true,
    isEvalSupported: false,
    verbosity: 0,
  }).promise;
  try {
    let buf = '';
    for (let p = 1; p <= doc.numPages; p++) {
      const tc = await (await doc.getPage(p)).getTextContent();
      buf += tc.items.map((i) => i.str).join('');
      const tight = buf.replace(/\s+/g, '');
      const hit = onText(tight);
      if (hit) return { hit, tight };
    }
    return { hit: null, tight: buf.replace(/\s+/g, '') };
  } finally {
    await doc.destroy();
  }
}

/** 라벨 뒤 구간에서 주소를 복원한다. */
function parseWindow(win, label) {
  const m = ADDR_RE.exec(win);
  if (!m) return null;
  const [, sido, sigungu, gu, eupmyeon, dongri] = m;
  if (!eupmyeon && !dongri) return null; // 시/군/구 까지만이면 라벨 매칭으로 안 침

  // 지번: "614-18번지" 가 정상이지만 순서가 깨져 "…번지일원:157-2" 로 밀리기도 한다.
  const tail = win.slice(m.index + m[0].length, m.index + m[0].length + 60);
  const jibun =
    tail.match(/^(산?\s?\d{1,5}(?:-\d{1,4})?)(?=번지|일원|외|,|$)/)?.[1] ??
    tail.match(/[:：](산?\d{1,5}(?:-\d{1,4})?)/)?.[1] ??
    tail.match(/^(\d{1,5}(?:-\d{1,4})?)/)?.[1] ??
    null;

  const parts = [sido, sigungu, gu, eupmyeon, dongri].filter(Boolean);
  return {
    address: parts.join(' ') + (jibun ? ` ${jibun}` : ''),
    addressNoJibun: parts.join(' '),
    sido,
    sigungu,
    gu: gu || null,
    dong: [eupmyeon, dongri].filter(Boolean).join(' ') || null,
    jibun,
    source: label,
  };
}

function findLocation(tight) {
  for (const label of LABELS) {
    let from = 0;
    for (;;) {
      const at = tight.indexOf(label, from);
      if (at === -1) break;
      from = at + label.length;
      // 라벨 바로 뒤 구간만 본다. 다음 항목(■/○/·) 전까지.
      let win = tight.slice(at + label.length, at + label.length + 130);
      win = win.split(/[■□▣●]/)[0];
      const got = parseWindow(win, label);
      if (got) return got;
    }
  }
  return null;
}

/**
 * 라벨 매칭이 실패한 공고용 대비책.
 * 문서 전체에서 "지번까지 붙은 주소"를 모아, 공고의 시군구와 일치하는 것 중
 * 가장 자주 등장하는 주소를 고른다. (시행사 본사·견본주택 주소가 섞여 들어오므로
 * 시군구 필터가 필수다)
 */
function guessByFrequency(tight, notice) {
  const want = (notice.district ?? '').split(/[\s·]/)[0]; // "성남시 분당구" -> "성남시"
  const counts = new Map();
  let m;
  ADDR_RE_G.lastIndex = 0;
  while ((m = ADDR_RE_G.exec(tight))) {
    const [, sido, sigungu, gu, eup, dong, jibun] = m;
    if (!dong && !eup) continue;
    if (want && sigungu !== want) continue;
    const key = JSON.stringify({ sido, sigungu, gu, eup, dong, jibun });
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  if (!counts.size) return null;
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const { sido, sigungu, gu, eup, dong, jibun } = JSON.parse(best);
  const parts = [sido, sigungu, gu, eup, dong].filter(Boolean);
  return {
    address: parts.join(' ') + (jibun ? ` ${jibun}` : ''),
    addressNoJibun: parts.join(' '),
    sido,
    sigungu,
    gu: gu || null,
    dong: [eup, dong].filter(Boolean).join(' ') || null,
    jibun: jibun || null,
    source: '본문빈도',
  };
}

const normTitle = (s) => s.replace(/\s+/g, '').replace(/[()（）·ㆍ,]/g, '').toLowerCase();

const notices = JSON.parse(await fs.readFile(path.join(ROOT, 'notices.json'), 'utf8'));
const files = (await fs.readdir(PDF_DIR)).filter((f) => f.toLowerCase().endsWith('.pdf'));
const byTitle = new Map(notices.map((n) => [normTitle(n.title), n]));

const result = {};
const unmatched = [];

for (const f of files) {
  const base = f.replace(/\.pdf$/i, '');
  const titlePart = base.match(/^(\d{4}-\d{2}-\d{2})_([^_]+)_(.+)$/)?.[3] ?? base;
  const nt = normTitle(titlePart);
  const notice =
    byTitle.get(nt) ??
    notices.find((n) => {
      const k = normTitle(n.title);
      return k.includes(nt.slice(0, 8)) || nt.includes(k.slice(0, 8));
    });

  if (!notice) {
    unmatched.push(f);
    continue;
  }

  try {
    const { hit, tight } = await readPages(path.join(PDF_DIR, f), (t) => findLocation(t));
    let found = hit ?? guessByFrequency(tight, notice);
    if (!found && MANUAL[notice.id]) {
      const addr = MANUAL[notice.id];
      found = { address: addr, addressNoJibun: addr, jibun: null, source: '수동보정' };
    }
    result[notice.id] = { title: notice.title, pdf: f, ...(found ?? { address: null, source: null }) };
    console.log(
      `${notice.id.padEnd(4)} ${(found?.source ?? '  --  ').padEnd(6)} ${(found?.address ?? '(추출 실패)').padEnd(34)} << ${notice.title}`
    );
  } catch (e) {
    result[notice.id] = { title: notice.title, pdf: f, address: null, source: null, error: e.message };
    console.log(`${notice.id.padEnd(4)} ERROR  ${e.message}  << ${notice.title}`);
  }
}

const noPdf = notices.filter((n) => !result[n.id]);
await fs.writeFile(OUT, JSON.stringify(result, null, 2), 'utf8');

const ok = Object.values(result).filter((r) => r.address).length;
console.log(`\n주소 추출 ${ok}/${files.length} 건 -> ${path.relative(ROOT, OUT)}`);
if (unmatched.length) console.log('공고 매칭 실패한 PDF:', unmatched);
if (noPdf.length) {
  console.log('PDF 없는 공고(시군구 중심 좌표로 표시):');
  for (const n of noPdf) console.log(`  ${n.id} ${n.region} ${n.district} | ${n.title}`);
}
