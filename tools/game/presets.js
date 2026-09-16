/** 프리셋 시작 상태 점검 — node tools/presets.js */
import { createState, PRESETS, netWorth, householdIncome, householdSize, dependents } from '../../src/game/core/state.js';
import { gaJeom } from '../../src/game/core/scoring.js';
import { monthlyCashflow, dsrHeadroom, currentDsr } from '../../src/game/core/finance.js';
import { won } from '../../src/game/data/constants.js';

for (const p of PRESETS) {
  const s = createState(p.id, 'x');
  const g = gaJeom(s);
  const cf = monthlyCashflow(s);
  console.log(`${p.emoji} ${p.name} (${p.difficulty})`);
  console.log(`   가점 ${g.total}점  =  무주택 ${g.parts[0].value} + 부양 ${g.parts[1].value} + 통장 ${g.parts[2].value}`);
  console.log(`   가구 ${householdSize(s)}명 / 부양 ${dependents(s)}명 · 월소득 ${won(householdIncome(s))} (상한 ${won(s.incomeCap)})`);
  console.log(`   생활비 ${won(cf.living)} · 주거비 ${won(cf.rent)} · 원리금 ${won(cf.debt)} → 월 잔액 ${won(cf.net)}`);
  console.log(`   순자산 ${(netWorth(s) / 1e8).toFixed(2)}억 · DSR ${(currentDsr(s) * 100).toFixed(0)}% · 대출여력 월 ${won(dsrHeadroom(s))}`);
  console.log('');
}
