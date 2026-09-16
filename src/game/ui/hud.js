import { el, clear, ring, add } from './dom.js';
import {
  won, eok, ymLabel, ym, DEPOSIT_OPTIONS, MAX_TURNS, FINANCE, specialMeta, 억,
} from '../data/constants.js';
import {
  netWorth, householdSize, dependents, minorChildren, marriageYears, ageYears,
  residenceDistrict, totalDebt, totalMonthlyPayment, isNoHouse, hasNewborn,
} from '../core/state.js';
import { gaJeom, nextScoreGain } from '../core/scoring.js';
import { monthlyCashflow, currentDsr, mortgageRate, dsrHeadroom } from '../core/finance.js';
import { LOCAL_PRIORITY_MONTHS } from '../core/eligibility.js';

/* ═══════════════════════ 상단 HUD ═══════════════════════ */

export function renderHud(host, state, handlers) {
  clear(host);
  const nw = netWorth(state);
  const cf = monthlyCashflow(state);
  const g = gaJeom(state);
  const { year, month } = ym(state.turn);
  const dsr = currentDsr(state);

  const prev = state.history.at(-2);
  const nwDelta = prev ? nw - prev.net : 0;

  host.append(
    el('div', { class: 'hud-date' },
      el('b', { class: 'num' }, `${year}. ${String(month).padStart(2, '0')}`),
      el('span', {}, `${state.turn + 1}개월차 · 만 ${ageYears(state)}세`),
    ),
    chip('💵', '보유 현금', won(state.cash), state.cash < 0 ? 'down' : '', null),
    chip('📊', '순자산', eok(nw, 2),
      nwDelta > 0 ? 'up' : nwDelta < 0 ? 'down' : '',
      nwDelta !== 0 ? `${nwDelta > 0 ? '▲' : '▼'}${won(Math.abs(nwDelta))}` : null),
    chip('🎯', '청약 가점', `${g.total}`, '', `/ 84`),
    chip('🏦', '월 수지', won(cf.net), cf.net >= 0 ? 'up' : 'down', null),
    chip('🏙', '집값 지수', state.priceIndex.toFixed(2),
      state.priceIndex > 1.001 ? 'down' : 'up',
      `${state.priceIndex >= 1 ? '+' : ''}${((state.priceIndex - 1) * 100).toFixed(0)}%`),
    chip('📉', 'DSR', `${(dsr * 100).toFixed(0)}%`,
      dsr > 0.4 ? 'down' : dsr > 0.3 ? '' : 'up',
      `한도 40%`),

    el('div', { class: 'hud-actions' },
      el('button', {
        class: 'icon-btn', title: '도움말 / 청약 제도 (H)', onclick: handlers.onHelp,
      }, '?'),
      el('button', {
        class: 'icon-btn', title: '전체 지도 보기 (Space)', onclick: handlers.onOverview,
      }, '🗺'),
      el('button', {
        class: 'icon-btn', title: '새 게임', onclick: handlers.onRestart,
      }, '↻'),
    ),
  );
}

function chip(ico, label, val, tone = '', sub = null) {
  return el('div', { class: 'cr-chip' },
    el('span', { class: 'chip-ico' }, ico),
    el('div', { class: 'chip-body' },
      el('span', { class: 'chip-label' }, label),
      el('span', { class: `chip-val num ${tone}` }, val, sub && el('em', { class: 'chip-sub' }, sub)),
    ),
  );
}

/* ═══════════════════════ 좌측 상태 패널 ═══════════════════════ */

export function renderStatus(host, state, handlers) {
  clear(host);
  const g = gaJeom(state);
  const cf = monthlyCashflow(state);
  const next = nextScoreGain(state);
  const d = residenceDistrict(state);

  const body = el('div', { class: 'panel-body' });

  /* 가점 */
  body.append(
    el('div', { class: 'score-ring' },
      ring(g.total, 84, { size: 66, stroke: 7 }),
      el('div', { class: 'score-main' },
        el('b', { class: 'num' }, `${g.total}`, el('small', {}, ' / 84점')),
        el('span', {}, '청약 가점'),
        next
          ? el('span', { class: 'score-next' }, `${next.months}개월 뒤 ${next.to}점`)
          : el('span', { class: 'score-next' }, '더 이상 오르지 않습니다'),
      ),
    ),
  );

  const colors = { noHouse: '#4de2ff', dependents: '#33e39f', account: '#ffc76b' };
  const bars = el('div', { class: 'bars' });
  for (const p of g.parts) {
    bars.append(
      el('div', { class: 'bar-row', title: p.hint },
        el('div', { class: 'bar-top' },
          el('span', { class: 'lbl' }, p.label),
          el('span', { class: 'val num' }, `${p.value}`, el('em', {}, ` / ${p.max} · ${p.detail}`)),
        ),
        el('div', { class: 'bar-track' },
          el('div', {
            class: 'bar-fill',
            style: { width: `${(p.value / p.max) * 100}%`, background: colors[p.key] },
          }),
        ),
      ),
    );
  }
  body.append(bars);

  /* 자격 태그 */
  body.append(el('div', { class: 'sec-title' }, '특별공급 자격'));
  const my = marriageYears(state);
  const tags = el('div', { class: 'tagrow' },
    tag('무주택', isNoHouse(state)),
    tag(`신혼 ${my !== null ? my.toFixed(1) + '년' : ''}`, my !== null && my <= 7,
      my !== null && my > 7 ? 'bad' : null),
    tag('신생아', hasNewborn(state)),
    tag(`다자녀 ${minorChildren(state)}`, minorChildren(state) >= 2),
    tag('생애최초', state.firstHomeEver && state.taxYears >= 5),
    tag('노부모부양', state.supportingParents
      && (state.turn - (state.parentsSince ?? state.turn)) >= 36),
    tag('기관추천', !!state.institutionRecommended),
  );
  body.append(tags);

  if (state.turn < state.reWinLockUntil) {
    body.append(el('div', { class: 'tagrow' },
      el('span', { class: 'tag bad' }, `재당첨 제한 ~${ymLabel(state.reWinLockUntil)}`)));
  }

  /* 자금 */
  body.append(el('div', { class: 'sec-title' }, '월 현금 흐름'));
  add(body,
    kv('소득', `+${won(cf.income)}`, 'pos'),
    kv('생활비', `−${won(cf.living)}`),
    cf.rent > 0 ? kv('주거비', `−${won(cf.rent)}`) : null,
    cf.debt > 0 ? kv('원리금 상환', `−${won(cf.debt)}`, 'neg') : null,
    kv('청약통장 납입', `−${won(cf.savings)}`),
    kv('월 잔액', `${cf.net >= 0 ? '+' : ''}${won(cf.net)}`, cf.net >= 0 ? 'pos' : 'neg'),
  );

  /* 청약통장 */
  body.append(el('div', { class: 'sec-title' }, '청약통장'));
  add(body,
    kv('가입 기간', `${Math.floor(state.accountMonths / 12)}년 ${state.accountMonths % 12}개월`),
    kv('예치금', won(state.accountBalance)),
  );
  const picker = el('div', { class: 'deposit-picker' });
  for (const amt of DEPOSIT_OPTIONS) {
    picker.append(el('button', {
      class: state.accountPayment === amt ? 'on' : '',
      onclick: () => handlers.onDeposit(amt),
      title: `월 ${won(amt)} 납입`,
    }, amt >= 10000 ? `${amt / 10000}만` : `${amt}`));
  }
  body.append(picker);

  /* 자산 / 부채 */
  const localOk = (state.residenceMonths ?? 0) >= LOCAL_PRIORITY_MONTHS;
  body.append(el('div', { class: 'sec-title' }, '자산 · 부채'));
  add(body,
    el('div', { class: 'kv' },
      el('span', { class: 'k' }, '거주지'),
      el('span', { class: 'v' },
        el('span', { class: `num ${localOk ? 'pos' : 'warn'}` },
          `${d.district}${d.regulated ? ' (규제)' : ''} · ${state.residenceMonths}개월`),
        el('button', {
          class: 'mini-btn',
          title: localOk
            ? '거주지를 옮긴다 — 지역우선 자격은 초기화된다'
            : `지역우선공급까지 ${LOCAL_PRIORITY_MONTHS - state.residenceMonths}개월 남음`,
          onclick: () => handlers.onMove?.(),
        }, '📦 이사'),
      ),
    ),
    kv('지역우선공급', localOk ? '자격 있음 (당첨 1.85배)' : `${LOCAL_PRIORITY_MONTHS}개월 거주 필요`,
      localOk ? 'pos' : 'warn'),
    kv('주거 형태', housingLabel(state)),
    state.jeonseDeposit > 0 ? kv('전세보증금', won(state.jeonseDeposit)) : null,
    kv('총 부채', won(totalDebt(state)), totalDebt(state) > 0 ? 'neg' : null),
    kv('대출 여력', won(dsrHeadroom(state) > 0 ? dsrHeadroom(state) : 0) + ' /월', 'warn'),
    kv('주담대 금리', `${(mortgageRate(state) * 100).toFixed(2)}%`),
    kv('가구원 수', `${householdSize(state)}명 (부양 ${dependents(state)})`),
    kv('스트레스', `${Math.round(state.stress)}`, state.stress > 65 ? 'neg' : state.stress > 40 ? 'warn' : 'pos'),
  );

  /* 진행 중 계약 */
  if (state.contract) body.append(contractCard(state));
  if (state.owned) body.append(ownedCard(state));
  if (state.rental) body.append(rentalCard(state));

  /* 기록 */
  body.append(el('div', { class: 'sec-title' }, '기록'));
  const logs = el('div', { class: 'logs' });
  for (const l of state.log.slice(0, 14)) {
    logs.append(el('div', { class: `log ${l.kind}` },
      el('span', { class: 'lt num' }, ym(l.turn).month + '월'),
      el('div', { class: 'lb' },
        el('b', {}, l.text),
        l.detail && el('span', {}, l.detail),
      ),
    ));
  }
  if (!state.log.length) logs.append(el('div', { class: 'empty' }, '아직 기록이 없습니다'));
  body.append(logs);

  host.append(
    el('div', { class: 'panel-head' },
      el('span', { class: 'panel-title' }, `${state.playerName} · ${state.presetName}`),
      el('span', { class: 'cr-badge new num' }, `${state.turn + 1} / ${MAX_TURNS}`),
    ),
    body,
  );
}

function tag(label, on, forceClass = null) {
  return el('span', { class: `tag ${forceClass ?? (on ? 'on' : 'off')}` },
    `${on ? '✓' : '·'} ${label}`);
}

function kv(k, v, tone = '') {
  return el('div', { class: 'kv' },
    el('span', { class: 'k' }, k),
    el('span', { class: `v num ${tone}` }, v),
  );
}

function housingLabel(state) {
  return { monthly: '월세', jeonse: '전세', rent: '공공임대', owned: '자가' }[state.housing] ?? '월세';
}

function contractCard(state) {
  const c = state.contract;
  const next = c.schedule.find((s) => !s.paid);
  const dots = el('div', { class: 'sched' });
  for (const s of c.schedule) {
    dots.append(el('i', { class: `sched-dot ${s.paid ? 'paid' : s === next ? 'next' : ''}`, title: `${s.label} ${ymLabel(s.turn)} · ${won(s.amount)}` }));
  }
  return el('div', { class: 'contract-card' },
    el('h4', {}, `📝 ${c.title}`),
    el('div', { class: 'sub' }, `${c.unitLabel} · 분양가 ${won(c.price)}`),
    dots,
    kv('납입 완료', `${won(c.paid)} / ${won(c.price)}`),
    next ? kv('다음 납입', `${next.label} · ${ymLabel(next.turn)}`, 'warn') : null,
    next ? kv('필요 금액', won(next.amount), state.cash < next.amount && next.kind !== 'mid' ? 'neg' : 'pos') : null,
    kv('예상 시세', won(c.marketValue), 'pos'),
    kv('입주 예정', ymLabel(c.moveInTurn)),
  );
}

function ownedCard(state) {
  const o = state.owned;
  const gain = o.marketValue - o.basePrice;
  return el('div', { class: 'contract-card' },
    el('h4', {}, `🏡 ${o.title}`),
    el('div', { class: 'sub' }, `${o.unitLabel} · 입주 ${ymLabel(o.movedInTurn)}`),
    kv('분양가', won(o.basePrice)),
    kv('현재 시세', won(o.marketValue), 'pos'),
    kv('평가 손익', `${gain >= 0 ? '+' : ''}${won(gain)}`, gain >= 0 ? 'pos' : 'neg'),
  );
}

function rentalCard(state) {
  const r = state.rental;
  return el('div', { class: 'contract-card' },
    el('h4', {}, `🔑 ${r.title}`),
    el('div', { class: 'sub' }, r.mode),
    kv('보증금', won(r.deposit)),
    kv('월 임대료', won(r.monthly)),
  );
}
