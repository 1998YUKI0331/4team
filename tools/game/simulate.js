/**
 * 헤드리스 밸런스 시뮬레이터.
 *   node tools/simulate.js [runs]
 *
 * 브라우저 없이 게임 루프만 수천 턴 돌려서
 *  · 크래시 / NaN / 무한루프 여부
 *  · 프리셋별 엔딩 분포와 평균 점수
 *  · 공고 자격 판정이 실제로 열리는지
 * 를 확인한다. AI 플레이어는 "감당 가능한 것 중 당첨확률이 가장 높은 청약"을 고른다.
 */

import { createState, PRESETS, netWorth } from '../../src/game/core/state.js';
import {
  advanceTurn, doAction, apply, acceptWin, forfeitWin, resolveCrisis,
  openNotices, ACTIONS,
} from '../../src/game/core/engine.js';
import { evaluateNotice } from '../../src/game/core/eligibility.js';
import { computeOdds } from '../../src/game/core/lottery.js';
import { affordability } from '../../src/game/core/finance.js';
import { gaJeom } from '../../src/game/core/scoring.js';
import { seedRuntime } from '../../src/game/core/rng.js';
import { MAX_TURNS, won } from '../../src/game/data/constants.js';
import { DISTRICTS } from '../../src/game/data/geo.js';

const RUNS = Number(process.argv[2] ?? 60);

/* ─────────────── AI 한 판 ─────────────── */

function playOne(presetId, seed, reckless = false) {
  seedRuntime(seed);
  const state = createState(presetId, 'AI');
  let guard = 0;
  let rnd = seed >>> 0;
  const nextRnd = () => ((rnd = (rnd * 1664525 + 1013904223) >>> 0) / 4294967296);

  while (!state.over && guard++ < MAX_TURNS + 20) {
    // 1) 행동 — 현금이 빠듯하면 부업, 스트레스 높으면 휴식
    const act = state.stress > 70 ? 'rest' : state.cash < 3_000_0000 ? 'grind' : 'career';
    if (!state.actionTaken) doAction(state, act);

    // 2) 청약 — 당첨되면 반드시 계약할 것에만 넣는다.
    //    (당첨 후 포기는 재당첨 제한을 부르므로, 합리적 플레이어는 처음부터 지원하지 않는다)
    if (!state.appliedThisTurn && !state.contract) {
      // 시간이 남았으면 눈높이를 유지하고, 끝이 보이면 타협한다
      const patience = 980 * Math.pow(1 - state.turn / MAX_TURNS, 1.2);
      const best = pickBest(state, reckless, reckless ? 0 : patience);
      if (best) {
        const res = apply(state, best.notice, best.type, best.unit?.id);
        if (!res.error && res.result.win) acceptWin(state, best.notice, best.unit);
      }
    }

    // 3) 턴 진행
    const report = advanceTurn(state);

    // 4) 위기 — 안전한 선택지 우선, 없으면 계약 해제
    let crisis = report.crisis;
    let spin = 0;
    while (crisis && spin++ < 8) {
      const safe = crisis.options.find((o) => o.safe) ?? crisis.options.at(-1);
      const out = resolveCrisis(state, crisis, safe.id);
      if (out.broke) break;
      crisis = out.crisis;
      if (out.ending) break;
    }

    // 5) 이벤트 — 무작위 선택 (한쪽으로 쏠린 플레이를 피한다)
    for (const ev of report.events) {
      ev.choices[Math.floor(nextRnd() * ev.choices.length)].apply(state);
    }

    assertSane(state, presetId, seed);
  }

  return {
    preset: presetId,
    ending: state.ending ?? { rank: '?', kind: 'nostop', score: 0 },
    turns: state.turn,
    net: netWorth(state),
    ga: gaJeom(state).total,
    stats: state.stats,
    owned: !!state.owned,
    tier: state.owned ? (DISTRICTS[state.owned.districtKey]?.tier ?? 0) : null,
    where: state.owned ? DISTRICTS[state.owned.districtKey]?.district : null,
    priceIndex: state.priceIndex,
  };
}

/** 엔딩 점수 기여분을 그대로 "가치" 로 써서, 좋은 집을 우선하게 한다 */
function optionValue(notice, unit, state) {
  if (notice.kind !== 'sale') return 80;
  const gain = unit.price * notice.premium * state.priceIndex - unit.price;
  return 260 + Math.pow(notice.district.tier, 1.7) * 260 + (gain / 1e8) * 100;
}

function pickBest(state, reckless = false, minValue = 0) {
  let best = null;
  for (const n of openNotices(state)) {
    const ev = evaluateNotice(state, n);
    if (ev.blockers.length || !ev.anyEligible) continue;
    const units = n.kind === 'sale' ? n.unitTypes : [null];
    for (const s of ev.supplies.filter((x) => x.eligible)) {
      for (const u of units) {
        if (!reckless && u && affordability(state, n, u).verdict === 'danger') continue;
        const value = optionValue(n, u, state);
        if (value < minValue) continue;               // 눈높이에 못 미치면 아예 넣지 않는다
        const odds = computeOdds(state, n, s, u);
        const expected = odds.total * value;
        if (!best || expected > best.expected) best = { expected, value, notice: n, type: s.type, unit: u };
      }
    }
  }
  return best;
}

function assertSane(state, preset, seed) {
  const checks = {
    cash: state.cash, priceIndex: state.priceIndex,
    income: state.income, accountBalance: state.accountBalance,
    stress: state.stress, credit: state.credit,
  };
  for (const [k, v] of Object.entries(checks)) {
    if (!Number.isFinite(v)) {
      throw new Error(`NaN/Infinity: ${k}=${v} (preset=${preset} seed=${seed} turn=${state.turn})`);
    }
  }
  for (const d of state.debts) {
    if (!Number.isFinite(d.principal) || d.principal < 0) {
      throw new Error(`bad debt ${d.type}=${d.principal} (preset=${preset} seed=${seed} turn=${state.turn})`);
    }
  }
}

/* ─────────────── 실행 ─────────────── */

const byPreset = new Map();
let failures = 0;

for (const p of PRESETS) {
  const rows = [];
  for (let i = 0; i < RUNS; i++) {
    try {
      rows.push(playOne(p.id, 0x9e37 + i * 7919));
    } catch (e) {
      failures++;
      console.error(`✗ ${p.id} #${i}: ${e.message}`);
      if (failures > 4) { console.error(e.stack); process.exit(1); }
    }
  }
  byPreset.set(p.id, rows);
}

console.log(`\n청약 로드 — 밸런스 시뮬레이션 (프리셋당 ${RUNS}판)\n${'═'.repeat(76)}`);

for (const p of PRESETS) {
  const rows = byPreset.get(p.id);
  if (!rows.length) continue;
  const ranks = {};
  for (const r of rows) ranks[r.ending.rank] = (ranks[r.ending.rank] ?? 0) + 1;

  const ownedRate = rows.filter((r) => r.owned).length / rows.length;
  const avg = (f) => rows.reduce((a, r) => a + f(r), 0) / rows.length;
  const bankrupt = rows.filter((r) => r.ending.kind === 'bankrupt').length;

  console.log(
    `\n${p.emoji} ${p.name.padEnd(8)} (${p.difficulty})\n`
    + `  입주 성공률 ${(ownedRate * 100).toFixed(0).padStart(3)}%   파산 ${bankrupt}건   `
    + `평균 점수 ${avg((r) => r.ending.score).toFixed(0).padStart(5)}\n`
    + `  평균 진행 ${(avg((r) => r.turns) / 12).toFixed(1)}년   평균 순자산 ${(avg((r) => r.net) / 1e8).toFixed(2)}억   `
    + `평균 가점 ${avg((r) => r.ga).toFixed(1)}\n`
    + `  청약 ${avg((r) => r.stats.applied).toFixed(1)}회 / 당첨 ${avg((r) => r.stats.won).toFixed(2)}회 / `
    + `포기·해제 ${avg((r) => r.stats.forfeited).toFixed(2)}회\n`
    + `  등급 분포 ${Object.entries(ranks).sort().map(([k, v]) => `${k}:${v}`).join('  ')}\n`
    + `  입주 지역 등급 ${[0, 1, 2, 3].map((t) => `T${t}:${rows.filter((r) => r.tier === t).length}`).join(' ')}`
  );
}

const all = [...byPreset.values()].flat();
console.log(`\n${'═'.repeat(76)}`);
console.log(`총 ${all.length}판 · 예외 ${failures}건 · `
  + `집값 지수 평균 ${(all.reduce((a, r) => a + r.priceIndex, 0) / all.length).toFixed(2)}`);

/* ── 무모한 플레이 : 위기·파산·계약해제 코드 경로가 실제로 도는지 확인 ── */
const reck = [];
for (const p of PRESETS) {
  for (let i = 0; i < Math.max(10, RUNS / 2); i++) {
    try { reck.push(playOne(p.id, 0x51ed + i * 4111, true)); }
    catch (e) { failures++; console.error(`✗ reckless ${p.id} #${i}: ${e.message}`); }
  }
}
const bankrupt = reck.filter((r) => r.ending.kind === 'bankrupt').length;
const broke = reck.reduce((a, r) => a + r.stats.forfeited, 0);
console.log(`\n무모한 플레이 ${reck.length}판 — 파산 ${bankrupt}건 · 포기/계약해제 ${broke}건 · `
  + `입주 ${reck.filter((r) => r.owned).length}건 · 평균 점수 `
  + `${(reck.reduce((a, r) => a + r.ending.score, 0) / reck.length).toFixed(0)}`);

process.exit(failures ? 1 : 0);
