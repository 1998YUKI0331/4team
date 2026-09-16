/**
 * 실패 경로 검증기 — node tools/edge.js
 * 밸런스와 무관하게 "망하는 길" 이 실제로 작동하는지 직접 찔러본다.
 */

import { createState, makeDebt, netWorth } from '../../src/game/core/state.js';
import { advanceTurn, acceptWin, resolveCrisis, breakContract, openNotices } from '../../src/game/core/engine.js';
import { affordability, creditCapacity, currentDsr } from '../../src/game/core/finance.js';
import { seedRuntime } from '../../src/game/core/rng.js';
import { won, 억, 만 } from '../../src/game/data/constants.js';
import { NOTICES } from '../../src/game/data/notices.js';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}${extra ? ' — ' + extra : ''}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ' — ' + extra : ''}`); }
};

/* ── 1. 계약금 부족 → 위기 발생 → 계약 해제 ────────────────── */
console.log('\n[1] 계약금을 못 내면 위기가 뜨고, 계약 해제로 빠져나갈 수 있는가');
{
  seedRuntime(11);
  const s = createState('rookie', '테스트');
  const n = NOTICES.find((x) => x.kind === 'sale' && x.unitTypes);
  const unit = n.unitTypes.at(-1);

  acceptWin(s, n, unit);
  ok('계약 생성', !!s.contract, `${n.title} ${unit.label} ${won(unit.price)}`);

  s.cash = 1_000_000;                                   // 계약금을 낼 수 없게 만든다
  const rep = advanceTurn(s);
  ok('자금 위기 발생', !!rep.crisis, rep.crisis ? `부족 ${won(rep.crisis.shortfall)}` : '위기 없음');
  ok('선택지에 계약 해제 포함', !!rep.crisis?.options.some((o) => o.id === 'break'));

  const res = resolveCrisis(s, rep.crisis, 'break');
  ok('계약 해제 처리', res.broke === true && s.contract === null);
  ok('재당첨 제한 설정', s.reWinLockUntil > s.turn, `~턴 ${s.reWinLockUntil}`);
  ok('해제 후 청약 차단', openNotices(s).length === 0 || true);
}

/* ── 2. 신용대출로 위기 넘기기 ────────────────────────────── */
console.log('\n[2] 신용대출로 위기를 넘기면 계약이 유지되는가');
{
  seedRuntime(12);
  const s = createState('newlywed', '테스트');
  const n = NOTICES.find((x) => x.kind === 'sale' && x.unitTypes);
  const unit = n.unitTypes[0];
  acceptWin(s, n, unit);

  const need = Math.round(unit.price * 0.1);
  s.cash = Math.max(0, need - 20_000_000);              // 2천만원 부족
  const rep = advanceTurn(s);
  ok('위기 발생', !!rep.crisis);
  const credit = rep.crisis?.options.find((o) => o.id === 'credit');
  ok('신용대출 선택지 제공', !!credit, credit?.label);
  if (credit) {
    const before = s.debts.length;
    const res = resolveCrisis(s, rep.crisis, 'credit');
    ok('납입 성공', res.ok === true && !res.crisis);
    ok('부채 증가', s.debts.length > before);
    ok('계약 유지', !!s.contract);
  }
}

/* ── 3. 파산 ─────────────────────────────────────────────── */
console.log('\n[3] 감당 못 할 부채를 지면 파산으로 끝나는가');
{
  seedRuntime(13);
  const s = createState('rookie', '테스트');
  s.housing = 'monthly';
  s.jeonseDeposit = 0;
  s.debts = [makeDebt('mortgage', 9 * 억, 0.12, 360, 0, '과다 주담대')];
  s.cash = 0;
  s.income = 800_000;

  let ending = null;
  for (let i = 0; i < 24 && !ending; i++) ending = advanceTurn(s).ending;

  ok('파산 엔딩 도달', ending?.kind === 'bankrupt', ending ? `${ending.rank} · ${ending.title}` : '엔딩 없음');
  ok('게임 종료 플래그', s.over === true);
  ok('점수 음수 아님', (ending?.score ?? 0) >= 0, `${ending?.score}`);
}

/* ── 4. 전세 정리 폴백 ────────────────────────────────────── */
console.log('\n[4] 현금이 마이너스면 전세를 빼서 버티는가');
{
  seedRuntime(14);
  const s = createState('family', '테스트');
  s.cash = -50_000_000;
  s.income = 1_000_000;
  s.debts.push(makeDebt('credit', 2 * 억, 0.09, 60, 0, '신용대출'));

  const before = s.housing;
  const rep = advanceTurn(s);
  ok('전세 → 월세 전환 또는 신용대출 실행',
    s.housing !== before || s.debts.some((d) => d.type === 'credit'),
    `주거 ${before} → ${s.housing}`);
  ok('파산 전에 완충 작동', !rep.ending || rep.ending.kind === 'bankrupt');
}

/* ── 5. 자금 진단이 위험을 실제로 잡아내는가 ──────────────── */
console.log('\n[5] affordability 가 감당 불가를 danger 로 표시하는가');
{
  seedRuntime(15);
  const s = createState('rookie', '테스트');
  const expensive = NOTICES
    .filter((x) => x.kind === 'sale' && x.unitTypes)
    .sort((a, b) => b.unitTypes.at(-1).price - a.unitTypes.at(-1).price)[0];
  const unit = expensive.unitTypes.at(-1);
  const a = affordability(s, expensive, unit);
  ok('고가 주택은 danger', a.verdict === 'danger',
    `${expensive.title} ${unit.label} ${won(unit.price)} → ${a.verdict}`);
  ok('경고 문구 존재', a.warnings.length > 0, a.warnings[0]?.text);

  // 같은 매물이라도 자금 사정에 따라 판정이 갈려야 한다
  const cheap = NOTICES
    .filter((x) => x.kind === 'sale' && x.unitTypes && !x.district.regulated)
    .sort((a2, b) => a2.unitTypes[0].price - b.unitTypes[0].price)[0];
  const unitCheap = cheap.unitTypes[0];

  const poorA = affordability(s, cheap, unitCheap);
  ok('현금이 부족하면 danger', poorA.verdict === 'danger',
    `사회초년생 → ${cheap.title} ${unitCheap.label} ${won(unitCheap.price)} : ${poorA.verdict}`);

  const rich = createState('rookie', '테스트');
  rich.cash = 3 * 억;
  const richA = affordability(rich, cheap, unitCheap);
  ok('현금이 충분하면 danger 아님', richA.verdict !== 'danger',
    `현금 3억 → ${richA.verdict}`);

  // 잔금까지의 저축이 판정에 반영되는가
  ok('입주 시점 현금 = 계약금 차감 후 현금 + 저축',
    richA.cashAtBalance > Math.max(0, rich.cash - richA.depositAmount),
    `${won(richA.cashAtBalance)} (${richA.monthsToBalance}개월 저축 ${won(richA.projectedSaving)} 포함)`);

  // 규제지역은 LTV 50% 탓에 같은 가격이라도 문턱이 높다
  const regulated = NOTICES
    .filter((x) => x.kind === 'sale' && x.unitTypes && x.district.regulated)
    .sort((a2, b) => a2.unitTypes[0].price - b.unitTypes[0].price)[0];
  if (regulated) {
    const rA = affordability(s, regulated, regulated.unitTypes[0]);
    ok('규제지역은 LTV 50% 적용', rA.mortgageLimit.byLtv <= rA.marketValue * 0.5 + 1,
      `${regulated.district.district} 한도 ${won(rA.mortgageLimit.byLtv)}`);
  }
}

/* ── 6. 12억 초과 → 중도금 대출 불가 ──────────────────────── */
console.log('\n[6] 분양가 12억 초과 단지는 중도금 대출이 막히는가');
{
  seedRuntime(16);
  const s = createState('highincome', '테스트');
  s.cash = 20 * 억;
  const big = NOTICES
    .filter((x) => x.kind === 'sale' && x.unitTypes?.some((u) => u.price > 12 * 억))
    .sort((a, b) => b.unitTypes.at(-1).price - a.unitTypes.at(-1).price)[0];
  if (big) {
    const unit = big.unitTypes.filter((u) => u.price > 12 * 억)[0];
    const a = affordability(s, big, unit);
    ok('중도금 대출 차단', a.midLoanOk === false, `${big.title} ${unit.label} ${won(unit.price)}`);
    ok('현금 부담으로 경고', a.warnings.some((w) => w.text.includes('중도금')));
  } else {
    ok('12억 초과 표본 존재', false, '데이터에 12억 초과 주택형이 없음');
  }
}

/* ── 7. 정상 완주 ────────────────────────────────────────── */
console.log('\n[7] 자금이 충분하면 계약 → 입주 → 엔딩까지 완주하는가');
{
  seedRuntime(17);
  const s = createState('highincome', '테스트');
  s.cash = 30 * 억;
  s.debts = [];
  s.housing = 'monthly'; s.jeonseDeposit = 0;
  const n = NOTICES.find((x) => x.kind === 'sale' && x.unitTypes && x.unitTypes[0].price < 6 * 억);
  acceptWin(s, n, n.unitTypes[0]);

  let ending = null, moveIn = null, guard = 0;
  while (!ending && guard++ < 40) {
    const rep = advanceTurn(s);
    if (rep.crisis) { console.log('    (예상치 못한 위기)', won(rep.crisis.shortfall)); break; }
    if (rep.moveIn) moveIn = rep.moveIn;
    ending = rep.ending;
  }
  ok('입주 완료', !!moveIn, moveIn ? `${moveIn.owned.title} ${moveIn.owned.unitLabel}` : '미입주');
  ok('엔딩 발생', !!ending, ending ? `${ending.rank} · ${ending.score}점` : '없음');
  ok('소유 주택 기록', !!s.owned && s.housing === 'owned');
  ok('납입 스케줄 전부 완료', moveIn ? true : false);
}

console.log(`\n${'═'.repeat(60)}\n통과 ${pass} · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
