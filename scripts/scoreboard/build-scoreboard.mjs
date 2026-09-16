/**
 * 입지 분석 데이터 → 앱 번들용 JSON 2종.
 *
 *   node scripts/scoreboard/build-scoreboard.mjs <dataset.json> [outDir]
 *
 * 원본 dataset.json 은 수집·스코어링 파이프라인(같은 폴더의 README 참고)이 만든 850KB 짜리 전체본이다.
 * 앱에는 화면에 실제로 쓰는 필드만 추려 넣고, 두 개로 나눈다.
 *
 *   scoreboard-index.json  점수·배수만. 목록 카드 배지에 쓰므로 초기 번들에 같이 실린다. (~5KB)
 *   scoreboard.json        상세 전체. "입지 분석" 탭을 열 때만 동적 import 로 받는다. (~285KB)
 *
 * 시계열은 [월,값] 쌍 대신 "시작 월 + 값 배열" 로 눕혀 용량을 줄인다.
 */
import fs from 'node:fs';
import path from 'node:path';

const SRC = process.argv[2];
const OUT_DIR = process.argv[3] ?? 'src/data';
if (!SRC) {
  console.error('사용법: node scripts/scoreboard/build-scoreboard.mjs <dataset.json> [outDir]');
  process.exit(1);
}

const full = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const MONTHS = 37; // 시세 지수 그래프에 쓰는 구간
const cut = (s, n) => (typeof s === 'string' && s.length > n ? s.slice(0, n) + '…' : s);

/** [["2024-01", 52000], …] → { from: "2024-01", v: [52000, …] } */
function packSeries(series) {
  const tail = (series ?? []).slice(-MONTHS);
  if (!tail.length) return null;
  return { from: tail[0][0], v: tail.map((p) => Math.round(p[1])) };
}

const notices = {};
for (const n of full.notices) {
  if (n.scores?.total == null && !n.offerRef && !n.market) continue;

  notices[n.id] = {
    scores: n.scores,

    // 분양가 ─ 주변 시세 대비 배수
    ratio: n.ratio,
    offerPerPy: n.offerPerPy,
    basePerPy: n.basePerPy,
    newPerPy: n.newPerPy,
    baseSrc: n.baseSrc,
    priceBasis: n.priceBasis,
    landLease: n.landLease || undefined,
    offerRef: n.offerRef && {
      label: n.offerRef.label, price: n.offerRef.price, py: n.offerRef.py, priv: n.offerRef.priv,
    },
    units: (n.offerUnits ?? []).map((u) => ({
      priv: u.priv, py: u.py, offer: u.offer, perPy: u.perPy,
      supply: u.supply ?? u.offerHh ?? null, rate: u.rate, score: u.score,
    })),
    correction: n.correction && { reason: n.correction.reason, sources: n.correction.sources },
    notePrice: n.notePrice && { min: n.notePrice.min, max: n.notePrice.max },

    // 청약 성적
    offerResult: n.offerResult,
    demand: n.demand && { avgRate: n.demand.avgRate, rateScore: n.demand.rateScore, under: n.demand.under },

    // 시세 흐름
    market: n.market,
    comps: (n.comps ?? []).slice(0, 6).map((c) => ({
      name: c.name, built: (c.built ?? '').slice(0, 7), households: c.households, km: c.km,
      latest: c.latest, perPy: c.perPy, refLabel: c.refLabel,
      y1pct: c.y1pct, y3pct: c.y3pct, series: packSeries(c.series),
    })),

    // 인프라
    infra: n.infra && { parts: n.infra.parts, station: n.infra.station },
    school: n.school && {
      elem: n.school.elem,
      mids: (n.school.mids ?? []).slice(0, 3),
      highs: (n.school.highs ?? []).slice(0, 2),
    },
    conv: Object.fromEntries(Object.entries(n.conv ?? {}).map(([k, v]) => [k, v.slice(0, 3)])),

    // 개발호재
    zoneLabel: n.zoneLabel,
    zoneSummary: n.zoneSummary,
    catalysts: (n.catalysts ?? []).map((c) => ({
      t: c.t, cat: c.cat, stage: c.stage, eta: c.eta, impact: c.impact, value: c.value,
      note: cut(c.note, 160), src: c.src,
    })),

    // 커뮤니티
    community: n.community && {
      subjectTotal: n.community.subjectTotal, zoneTotal: n.community.zoneTotal,
      pos: n.community.pos, neg: n.community.neg, neu: n.community.neu,
      sampled: n.community.sampled,
      topPos: (n.community.topPos ?? []).slice(0, 4),
      topNeg: (n.community.topNeg ?? []).slice(0, 4),
      subjectReviews: (n.community.subjectReviews ?? []).slice(0, 3)
        .map((r) => ({ t: cut(r.t, 220), up: r.up, d: r.d, from: r.from })),
      zoneReviews: (n.community.zoneReviews ?? []).slice(0, 4)
        .map((r) => ({ t: cut(r.t, 220), up: r.up, d: r.d, from: r.from })),
    },
    news: (n.news ?? []).slice(0, 3),

    // 단지 사실
    subject: n.subject && {
      name: n.subject.name, addr: n.subject.addr, households: n.subject.households,
      moveIn: n.subject.moveIn, builder: n.subject.builder, floorMax: n.subject.floorMax,
      buildings: n.subject.buildings, far: n.subject.far,
    },
  };
}

/* 목록 카드 배지용 — 점수와 배수만. 초기 번들에 같이 실리므로 작게 유지한다. */
const scores = {};
for (const [id, n] of Object.entries(notices)) {
  scores[id] = { ...n.scores, ratio: n.ratio, landLease: n.landLease };
}

fs.mkdirSync(OUT_DIR, { recursive: true });

const indexPath = path.join(OUT_DIR, 'scoreboard-index.json');
fs.writeFileSync(
  indexPath,
  JSON.stringify({
    generatedAt: full.meta.builtAt,
    basedOn: full.meta.today,
    weights: full.meta.weights,
    axes: full.meta.axes,
    scores,
  }),
  'utf8'
);

const fullPath = path.join(OUT_DIR, 'scoreboard.json');
fs.writeFileSync(
  fullPath,
  JSON.stringify({
    generatedAt: full.meta.builtAt,
    basedOn: full.meta.today,
    formulas: full.meta.formulas,
    caveats: full.meta.caveats,
    sources: full.meta.sources,
    notices,
  }),
  'utf8'
);

const kb = (p) => (fs.statSync(p).size / 1024).toFixed(0);
console.log(`${Object.keys(notices).length}건`);
console.log(`  ${indexPath} (${kb(indexPath)} KB) — 초기 번들`);
console.log(`  ${fullPath} (${kb(fullPath)} KB) — 탭 열 때 지연 로드`);
