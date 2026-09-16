import { SceneManager } from './gfx/scene.js';
import { CityStage } from './gfx/city.js';
import { LotteryStage } from './gfx/lotteryMachine.js';

import { $, el, show, clear, toast, sleep, modal, setUiRoot } from './ui/dom.js';
import { renderHud, renderStatus } from './ui/hud.js';
import { Board } from './ui/board.js';
import { Cinema } from './ui/cinema.js';
import {
  introModal, eventModal, crisisModal, winModal, loseModal, endingModal, helpModal, moveModal,
} from './ui/modals.js';

import {
  createState, saveState, loadState, clearSave, pushBoard, pushLog, netWorth,
} from './core/state.js';
import {
  ACTIONS, advanceTurn, doAction, setDeposit, apply as applyCheongyak,
  acceptWin, forfeitWin, resolveCrisis, openNotices,
  moveResidence, moveCost, moveBlocker,
} from './core/engine.js';
import { evaluateNotice, LOCAL_PRIORITY_MONTHS } from './core/eligibility.js';
import { seedRuntime } from './core/rng.js';
import { resolveDistrict } from './data/geo.js';
import { won, ymLabel, 억 } from './data/constants.js';

/**
 * 게임 한 판을 root 엘리먼트 안에 띄운다.
 *
 * 원래는 모듈을 import 하는 것만으로 document 전체를 점유했는데,
 * 지도 앱(Vue) 안에 탭으로 얹히려면 (1) DOM 조회가 root 안으로 좁혀지고
 * (2) 붙인 리스너·렌더러를 전부 되돌릴 수 있어야 한다.
 *
 * @param root  게임 마크업(#stage, #hud …)을 담고 있는 컨테이너
 * @param opts.onRestart  새 게임 요청. 호출한 쪽에서 컴포넌트를 다시 마운트한다
 *                        (SPA 안에서는 location.reload() 를 쓸 수 없다)
 * @param opts.focus      { title, region, district } — 지도에서 넘어올 때 그 단지로 시작
 * @param opts.onEvent    (kind, payload) — 바깥(금갱이 등)이 반응할 만한 순간만 알린다
 * @returns {{ destroy(): void }}
 */
export function createGame(root, opts = {}) {
  setUiRoot(root);

  const dom = {
    canvas: $('#stage', root),
    hud: $('#hud', root),
    status: $('#status', root),
    board: $('#board', root),
    dock: $('#dock', root),
    tip: $('#tip', root),
  };

  const sm = new SceneManager(dom.canvas);
  const city = sm.register('city', new CityStage(dom.canvas));
  const lottery = sm.register('lottery', new LotteryStage());
  const cinema = new Cinema(root);
  sm.setActive('city');
  sm.start();

  let state = null;
  let busy = false;
  let selectedAction = null;
  let destroyed = false;

  /* 붙인 리스너를 전부 되돌리기 위한 목록 */
  const offs = [];
  const emit = (kind, payload) => { if (!destroyed) opts.onEvent?.(kind, payload); };
  const on = (target, type, fn, options) => {
    target.addEventListener(type, fn, options);
    offs.push(() => target.removeEventListener(type, fn, options));
  };

  const board = new Board(dom.board, {
    onApply: (notice, type, unitId) => onApply(notice, type, unitId),
    onFocus: (key) => { city.selectDistrict(key); city.focus(key, { distance: 24 }); },
    // 카드에 마우스를 올리면 지도에서 해당 지역이 켜진다 (카메라는 움직이지 않는다)
    onHoverNotice: (n) => city.selectDistrict(n.district.key),
  });

  /* ═══════════════════════════ 게임 시작 ═══════════════════════════ */

  async function boot() {
    const saved = loadState();
    let choice = null;

    if (saved) {
      choice = await modal((done) => el('div', { class: 'modal' },
        el('div', { class: 'modal-head' },
          el('div', { class: 'eyebrow' }, '이어하기'),
          el('h2', {}, '저장된 게임이 있습니다'),
          el('p', {}, `${saved.playerName} · ${saved.presetName} · ${ymLabel(saved.turn)} 시점 · `
            + `순자산 ${won(netWorth(saved))}`),
        ),
        el('div', { class: 'modal-foot' },
          el('button', { class: 'cr-btn ghost', onclick: () => done('new') }, '새로 시작'),
          el('button', { class: 'cr-btn primary', autofocus: true, onclick: () => done('continue') }, '이어서 하기 →'),
        ),
      ));
    }
    if (destroyed) return;

    if (saved && choice === 'continue') {
      state = saved;
      seedRuntime(Date.now() >>> 0);
    } else {
      clearSave();
      const cfg = await introModal();
      if (destroyed) return;
      state = createState(cfg.presetId, cfg.playerName);
      seedRuntime(Date.now() >>> 0);
      pushLog(state, 'start', `${state.playerName}의 청약 여정 시작`, `${state.presetName} · ${ymLabel(0)}`);
    }

    show(dom.hud, true);
    show(dom.status, true);
    show(dom.board, true);
    show(dom.dock, true);

    city.setPriceIndex(state.priceIndex);
    city.overview({ duration: 0.01 });
    refresh();

    await sleep(250);
    if (destroyed) return;

    if (!applyFocus()) {
      city.focus(state.residenceKey, { distance: 32, duration: 1.6 });
      toast(`${ymLabel(state.turn)} — 청약 여정을 시작합니다`, 'gold', 3200);
    }
  }

  /**
   * 지도에서 "이 단지로 시작"으로 넘어온 경우, 그 지역으로 카메라를 옮기고
   * 같은 단지가 접수 중이면 공고 상세까지 열어 준다.
   */
  function applyFocus() {
    const f = opts.focus;
    if (!f) return false;

    const d = resolveDistrict(f.region, f.district);
    if (!d) return false;

    const open = openNotices(state);
    const norm = (s) => String(s ?? '').replace(/\s|\(.*?\)/g, '');
    const hit = open.find((n) => norm(n.title) === norm(f.title))
      ?? open.find((n) => n.district.key === d.key);

    city.selectDistrict(d.key);
    city.focus(d.key, { distance: 24, duration: 1.6 });
    if (hit) board.select(hit.id);

    toast(hit
      ? `지도에서 넘어왔습니다 — ${hit.title}`
      : `${d.district}에서 시작합니다 (해당 단지는 지금 접수 중이 아닙니다)`, 'gold', 4200);
    return true;
  }

  /* ═══════════════════════════ 렌더 ═══════════════════════════ */

  function refresh() {
    if (!state || destroyed) return;

    renderHud(dom.hud, state, {
      onHelp: () => helpModal(),
      onOverview: () => city.overview(),
      onRestart: () => restart(),
    });
    renderStatus(dom.status, state, {
      onDeposit: (amt) => { setDeposit(state, amt); refresh(); },
      onMove: () => openMove(),
    });
    board.render(state);
    renderDock();

    const notices = openNotices(state);
    city.setPriceIndex(state.priceIndex);
    city.setResidence(state.residenceKey);
    city.syncNotices(notices, (n) => evaluateNotice(state, n).anyEligible);

    saveState(state);
  }

  function renderDock() {
    clear(dom.dock);

    const acts = el('div', { class: 'actions' });
    ACTIONS.forEach((a) => {
      acts.append(el('button', {
        class: `act ${selectedAction === a.id ? 'on' : ''}`,
        disabled: busy || !!state.actionTaken,
        title: a.hint,
        onclick: () => {
          selectedAction = a.id;
          renderDock();
        },
      },
        el('span', { class: 'ico' }, a.icon),
        el('span', { class: 'lbl' }, a.label),
        el('span', { class: 'hint' }, a.hint),
      ));
    });

    dom.dock.append(acts, el('button', {
      class: 'next-btn',
      disabled: busy,
      onclick: () => nextTurn(),
    },
      el('span', {}, selectedAction ? '실행하고 다음 달' : '다음 달로'),
      el('kbd', {}, 'Enter'),
    ));
  }

  /* ═══════════════════════════ 이사 ═══════════════════════════ */

  async function openMove() {
    if (busy || !state || state.over) return;
    const key = await moveModal(state, {
      moveCost,
      blocker: moveBlocker(state),
      localMonths: LOCAL_PRIORITY_MONTHS,
    });
    if (!key || destroyed) return;

    const res = moveResidence(state, key);
    if (res.error) { toast(res.error, 'bad', 4000); return; }

    refresh();
    city.selectDistrict(key);
    city.focus(key, { distance: 26 });
    toast(`${res.district.district}로 이사했습니다 — 지역우선 자격은 ${LOCAL_PRIORITY_MONTHS}개월 뒤부터`, 'gold', 4200);
  }

  /* ═══════════════════════════ 턴 진행 ═══════════════════════════ */

  async function nextTurn() {
    if (busy || !state || state.over) return;
    busy = true;
    renderDock();

    if (selectedAction) {
      const msg = doAction(state, selectedAction);
      toast(msg, '', 3000);
      selectedAction = null;
    }

    const report = advanceTurn(state);
    refresh();
    emit('turn', { turn: state.turn });

    // 납입 알림
    for (const p of report.payments) {
      if (p.step.paid) {
        toast(`${p.step.label} ${won(p.amount)} 납입 완료`, 'good', 2800);
        await sleep(320);
        if (destroyed) return;
      }
    }
    for (const note of report.notes) toast(note, 'bad', 4200);

    // 자금 위기
    let crisis = report.crisis;
    while (crisis) {
      const pick = await crisisModal(crisis, state);
      if (destroyed) return;
      const res = resolveCrisis(state, crisis, pick ?? 'break');
      refresh();
      if (res.broke) { toast('계약이 해제되었습니다', 'bad', 4200); break; }
      if (res.msg) toast(res.msg, 'gold', 3200);
      crisis = res.crisis;
      if (res.moveIn) await playMoveIn(res.moveIn);
      if (res.ending) { await showEnding(res.ending); busy = false; return; }
    }

    // 입주
    if (report.moveIn) await playMoveIn(report.moveIn);
    if (destroyed) return;

    // 이벤트
    for (const ev of report.events) {
      const idx = await eventModal(ev);
      if (destroyed) return;
      const msg = ev.choices[idx ?? 0].apply(state);
      pushLog(state, ev.tone, `${ev.icon} ${ev.title}`, msg);
      toast(msg, ev.tone === 'risk' ? 'bad' : 'gold', 4200);
      refresh();
    }

    if (report.ending) { await showEnding(report.ending); busy = false; return; }

    refresh();
    busy = false;
    renderDock();
  }

  /* ═══════════════════════════ 청약 → 추첨 연출 ═══════════════════════════ */

  async function onApply(notice, supplyType, unitId) {
    if (busy || state.appliedThisTurn) return;
    busy = true;
    renderDock();

    const res = applyCheongyak(state, notice, supplyType, unitId);
    if (res.error) {
      toast(res.error, 'bad', 4000);
      busy = false; renderDock();
      return;
    }

    const ctx = {
      notice, supplyType, supply: supplyType,
      unitType: res.unitType, odds: res.odds, result: res.result,
    };

    emit('apply', { title: notice.title, supplyType });
    await playLottery(ctx);
    if (destroyed) return;
    emit(res.result.win ? 'win' : 'lose', { title: notice.title });

    if (res.result.win) {
      const pick = await winModal(ctx, state);
      if (destroyed) return;
      if (pick === 'accept') {
        const out = acceptWin(state, notice, res.unitType);
        toast(out.kind === 'rent' ? '임대주택 입주 계약을 체결했습니다' : '분양 계약을 체결했습니다', 'good', 4000);
        city.focus(notice.district.key, { distance: 20 });
      } else {
        forfeitWin(state, notice);
        toast('당첨을 포기했습니다 — 5년간 재당첨 제한', 'bad', 4600);
      }
    } else {
      await loseModal(ctx);
      if (destroyed) return;
    }

    board.back();
    refresh();
    busy = false;
    renderDock();
  }

  function playLottery(ctx) {
    return new Promise((resolve) => {
      let skipped = false;

      const finish = () => {
        if (skipped) return;
        skipped = true;
        cinema.close();
        hideUi(false);
        sm.setBloom(0.5, 0.55, 0.52);
        sm.setActive('city');
        resolve();
      };

      hideUi(true);
      cinema.open(() => finish());
      sm.setBloom(0.82, 0.62, 0.42);
      lottery.setup(ctx);
      sm.setActive('lottery');

      const priceLabel = ctx.notice.kind === 'rent'
        ? ctx.notice.rentTerms.mode
        : `${ctx.unitType.label} · ${(ctx.unitType.price / 억).toFixed(2)}억`;

      lottery.onPhase = (phase) => {
        if (destroyed) { finish(); return; }
        if (phase === 'spin') {
          cinema.say(ctx.notice.title, `${ctx.supplyType} · ${priceLabel} · ${ctx.odds.applicants.toLocaleString()}명 신청`);
        } else if (phase === 'eject') {
          cinema.say('추첨 중…', `경쟁률 ${ctx.odds.ratio.toFixed(1)} : 1`);
        } else if (phase === 'reveal') {
          cinema.say(
            ctx.odds.mode === '추첨제' ? '번호를 확인합니다' : '커트라인을 확인합니다',
            ctx.odds.cutline != null
              ? `내 점수 ${ctx.odds.myScore.toFixed(0)}점`
              : `당첨 확률 ${(ctx.odds.total * 100).toFixed(1)}%`,
          );
        } else if (phase === 'verdict') {
          if (ctx.result.win) {
            cinema.say('🎉 당첨되었습니다', ctx.notice.title);
            sm.shake(0.35, 5);
          } else {
            cinema.say('낙첨', ctx.odds.cutline != null
              ? `커트라인 ${ctx.result.finalCutline.toFixed(0)}점 — ${(ctx.result.finalCutline - ctx.odds.myScore).toFixed(0)}점 부족`
              : '다음 기회에');
            sm.shake(0.55, 6);
          }
        } else if (phase === 'done') {
          finish();
        }
      };

      lottery.play();
    });
  }

  /* ═══════════════════════════ 입주 연출 ═══════════════════════════ */

  async function playMoveIn(moveIn) {
    const o = moveIn.owned;
    emit('moveIn', { title: o.title });
    hideUi(true);
    cinema.open(null);
    cinema.say('🏡 입주 완료', `${o.title} ${o.unitLabel}`);
    city.focus(o.districtKey, { distance: 17, duration: 1.8 });
    sm.setBloom(0.78, 0.6, 0.4);
    sm.shake(0.25, 4);
    await sleep(2600);
    if (destroyed) return;
    cinema.say(
      `시세 ${won(o.marketValue)}`,
      `분양가 ${won(o.basePrice)} · 평가이익 ${won(moveIn.gain)}`,
    );
    await sleep(2400);
    if (destroyed) return;
    cinema.close();
    hideUi(false);
    sm.setBloom(0.5, 0.55, 0.52);
  }

  /* ═══════════════════════════ 엔딩 ═══════════════════════════ */

  async function showEnding(ending) {
    pushBoard({
      name: ending.playerName, preset: ending.presetName,
      rank: ending.rank, score: ending.score, at: Date.now(),
    });
    clearSave();
    refresh();
    await sleep(500);
    if (destroyed) return;
    const pick = await endingModal(ending);
    if (destroyed) return;
    if (pick === 'restart') opts.onRestart?.();
  }

  function restart() {
    modal((done) => el('div', { class: 'modal' },
      el('div', { class: 'modal-head' },
        el('h2', {}, '새 게임을 시작할까요?'),
        el('p', {}, '현재 진행 상황은 사라집니다.'),
      ),
      el('div', { class: 'modal-foot' },
        el('button', { class: 'cr-btn ghost', onclick: () => done(false) }, '취소'),
        el('button', { class: 'cr-btn danger', onclick: () => done(true) }, '새로 시작'),
      ),
    ), { dismissible: true }).then((yes) => {
      if (yes && !destroyed) { clearSave(); opts.onRestart?.(); }
    });
  }

  function hideUi(hide) {
    for (const n of [dom.hud, dom.status, dom.board, dom.dock]) {
      n.style.transition = 'opacity 0.35s ease';
      n.style.opacity = hide ? '0' : '1';
      n.style.pointerEvents = hide ? 'none' : '';
    }
  }

  /* ═══════════════════════════ 입력 ═══════════════════════════ */

  on(dom.canvas, 'pointermove', (e) => {
    const r = dom.canvas.getBoundingClientRect();
    city.setPointer(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    dom.tip.dataset.x = e.clientX;
    dom.tip.dataset.y = e.clientY;
  });

  on(dom.canvas, 'pointerleave', () => {
    city.setPointer(-10, -10);
    show(dom.tip, false);
  });

  let downAt = null;
  on(dom.canvas, 'pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY }; });
  on(dom.canvas, 'pointerup', (e) => {
    if (!downAt || sm.active !== city || !state) return;
    const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
    downAt = null;
    if (moved > 6 || busy) return;

    const hit = city.pick();
    if (!hit) return;
    if (hit.type === 'notice') {
      board.select(hit.marker.notice.id);
      city.selectDistrict(hit.marker.notice.district.key);
      city.focus(hit.marker.notice.district.key, { distance: 22 });
    } else if (hit.type === 'district') {
      city.selectDistrict(hit.tile.district.key);
      const n = openNotices(state).find((x) => x.district.key === hit.tile.district.key);
      if (n) board.select(n.id);
      city.focus(hit.tile.district.key, { distance: 26 });
    }
  });

  city.onHover = (hit) => {
    if (!state || sm.active !== city) { show(dom.tip, false); return; }
    if (!hit) { show(dom.tip, false); return; }

    const x = +(dom.tip.dataset.x ?? 0);
    const y = +(dom.tip.dataset.y ?? 0);
    dom.tip.style.left = `${x}px`;
    dom.tip.style.top = `${y}px`;

    if (hit.type === 'notice') {
      const n = hit.marker.notice;
      dom.tip.innerHTML = `<b>${n.title}</b>`
        + `<span>${n.region} ${n.districtLabel} · ${n.housingType}<br>`
        + (n.kind === 'rent'
          ? `보증금 ${won(n.rentTerms.deposit)} / 월 ${won(n.rentTerms.monthly)}`
          : `분양가 ${(n.priceRange.lo / 억).toFixed(1)}~${(n.priceRange.hi / 억).toFixed(1)}억 · `
            + `<span class="hot">안전마진 +${((n.premium - 1) * 100).toFixed(0)}%</span>`)
        + `</span>`;
    } else {
      const d = hit.tile.district;
      const value = d.base * state.priceIndex;
      dom.tip.innerHTML = `<b>${d.region} ${d.district}</b>`
        + `<span>84㎡ 시세 약 <span class="hot">${value.toFixed(1)}억</span>`
        + ` (시작 대비 ${((state.priceIndex - 1) * 100).toFixed(0)}%)<br>`
        + `${d.regulated ? '규제지역 · LTV 50%' : '비규제지역 · LTV 70%'}`
        + `${state.residenceKey === d.key ? '<br>📍 현재 거주지' : ''}</span>`;
    }
    show(dom.tip, true);
  };

  on(document, 'keydown', (e) => {
    if (!state || busy || destroyed) return;
    if (!root.isConnected) return;                            // 다른 탭으로 옮겨간 뒤
    if (e.isComposing || e.keyCode === 229) return;           // 한글 입력 조합 중
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (!$('#overlay', root)?.hasAttribute('hidden')) return; // 모달이 열려 있으면 무시

    // 환경에 따라 Enter 가 'Return' 으로, Space 가 'Spacebar' 로 오기도 한다
    const k = e.key;
    const isEnter = k === 'Enter' || k === 'Return' || e.code === 'Enter' || e.code === 'NumpadEnter';
    const isSpace = k === ' ' || k === 'Spacebar' || e.code === 'Space';

    if (isEnter || k.toLowerCase?.() === 'n') { e.preventDefault(); nextTurn(); }
    else if (isSpace) { e.preventDefault(); city.overview(); }
    else if (k.toLowerCase?.() === 'h') { e.preventDefault(); helpModal(); }
    else if (/^[1-5]$/.test(k)) {
      const a = ACTIONS[+k - 1];
      if (a && !state.actionTaken) { e.preventDefault(); selectedAction = a.id; renderDock(); }
    }
  });

  /* ═══════════════════════════ 개발용 디버그 핸들 ═══════════════════════════ */
  // 프로덕션 번들에는 들어가지 않는다 (import.meta.env.DEV).
  // 3D 연출은 헤드리스로 검증할 수 없어서, 개발 중에는 콘솔에서 장면을 직접
  // 렌더·전환할 수 있어야 한다. renderFrame() 은 rAF 없이 한 프레임을 강제로
  // 그리므로, 탭이 백그라운드라 rAF 가 멈춘 상태에서도 캔버스를 캡처할 수 있다.
  if (import.meta.env?.DEV) {
    window.__debug = {
      sm, city, lottery, cinema, board,
      get state() { return state; },
      renderFrame(dt = 1 / 60) {
        sm.active?.update?.(dt, (sm.clock.elapsedTime += dt));
        sm.composer.render();
      },
      step(frames = 1, dt = 1 / 60) { for (let i = 0; i < frames; i++) this.renderFrame(dt); },
      nextTurn, refresh, playLottery, playMoveIn,
    };
  }

  boot();

  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const off of offs) off();
      offs.length = 0;
      city.onHover = null;
      lottery.onPhase = null;
      cinema.dispose();
      city.dispose?.();
      sm.dispose();
      setUiRoot(null);
      if (import.meta.env?.DEV && window.__debug?.sm === sm) delete window.__debug;
    },
  };
}
