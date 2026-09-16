import { el, clear, add } from './dom.js';
import { won, eok, ymLabel, specialMeta, pct, 억 } from '../data/constants.js';
import { evaluateNotice } from '../core/eligibility.js';
import { estimateOdds, supplyMode, gradeOf, isScouted } from '../core/lottery.js';
import { affordability } from '../core/finance.js';
import { openNotices, upcomingNotices } from '../core/engine.js';
import { INFO_NOTICES } from '../data/notices.js';

/**
 * 우측 공고 패널.
 * view = { tab:'open'|'soon'|'info', selected: noticeId|null, unitId, openSupply }
 */
export class Board {
  constructor(host, handlers) {
    this.host = host;
    this.h = handlers;
    this.view = { tab: 'open', selected: null, unitId: null, openSupply: null };
  }

  select(noticeId) {
    this.view.selected = noticeId;
    this.view.unitId = null;
    this.view.openSupply = null;
    this.render();
  }

  back() {
    this.view.selected = null;
    this.render();
  }

  render(state = this.state) {
    this.state = state;
    if (!state) return;
    clear(this.host);

    const open = openNotices(state);
    this.openList = open;

    if (this.view.selected) {
      const n = open.find((x) => x.id === this.view.selected)
        ?? INFO_NOTICES.find((x) => x.id === this.view.selected);
      if (n) { this._renderDetail(state, n); return; }
      this.view.selected = null;
    }
    this._renderList(state, open);
  }

  /* ───────────────────── 목록 ───────────────────── */

  _renderList(state, open) {
    const soon = upcomingNotices(state, 4);
    const info = INFO_NOTICES;

    const tabs = el('div', { class: 'board-tabs' },
      tabBtn('open', '접수 중', open.length, this.view.tab, (t) => this._tab(t)),
      tabBtn('soon', '공고 예정', soon.length, this.view.tab, (t) => this._tab(t)),
      tabBtn('info', '시장 소식', info.length, this.view.tab, (t) => this._tab(t)),
    );

    const body = el('div', { class: 'panel-body' });
    const list = el('div', { class: 'notice-list' });

    if (this.view.tab === 'open') {
      if (!open.length) {
        list.append(emptyBox('🗓', '이번 달에는 접수 중인 공고가 없습니다.',
          '다음 달로 넘어가면 새 공고가 뜹니다.'));
      }
      for (const n of open) list.append(this._card(state, n));
    } else if (this.view.tab === 'soon') {
      if (!soon.length) list.append(emptyBox('🔭', '예정된 공고가 없습니다.', '분기마다 새 단지가 공급됩니다.'));
      for (const n of soon) list.append(this._card(state, n, true));
    } else {
      if (!info.length) list.append(emptyBox('📰', '소식이 없습니다.'));
      for (const n of info) list.append(this._infoCard(n));
    }

    body.append(list);
    this.host.append(
      el('div', { class: 'panel-head' },
        el('span', { class: 'panel-title' }, '청약 공고'),
        isScouted(state) ? el('span', { class: 'cr-badge ok' }, '🔍 임장 반영') : null,
        el('span', { class: 'cr-badge new' }, state.appliedThisTurn ? '이번 달 청약 완료' : '월 1건 신청 가능'),
      ),
      tabs, body,
    );
  }

  _tab(t) { this.view.tab = t; this.view.selected = null; this.render(); }

  _card(state, n, upcoming = false) {
    const ev = upcoming ? null : evaluateNotice(state, n);
    const ok = ev?.anyEligible;
    const price = n.kind === 'rent'
      ? n.rentTerms.mode
      : `${(n.priceRange.lo / 억).toFixed(1)}~${(n.priceRange.hi / 억).toFixed(1)}억`;

    // heat 는 0.72~1.36 범위다. 예전 임계값(2.2)은 영원히 안 걸렸다.
    const heatBadge = n.heat > 1.18 ? el('span', { class: 'cr-badge hot' }, '과열')
      : n.premium > 1.25 ? el('span', { class: 'cr-badge new' }, `안전마진 +${((n.premium - 1) * 100).toFixed(0)}%`)
        : null;

    return el('div', {
      class: `notice ${n.kind === 'rent' ? 'rent' : ok ? 'ok' : ''} ${ev && !ok ? 'dim' : ''}`,
      onclick: () => { if (!upcoming) { this.select(n.id); this.h.onFocus?.(n.district.key); } },
      onmouseenter: () => !upcoming && this.h.onHoverNotice?.(n),
    },
      el('div', { class: 'notice-top' },
        el('div', {},
          el('div', { class: 'notice-title' }, n.title),
          el('div', { class: 'notice-meta' },
            el('span', {}, `${n.region} ${n.districtLabel.split(/[,·]/)[0]}`),
            el('span', { class: 'dot' }, n.housingType),
            upcoming
              ? el('span', { class: 'dot' }, `${ymLabel(n.announceTurn)} 공고`)
              : el('span', { class: 'dot' }, `마감 ${ymLabel(n.deadlineTurn)}`),
          ),
        ),
        el('div', { class: 'notice-price num' }, price,
          n.kind === 'sale' && el('small', {}, `${n.units.toLocaleString()}세대`)),
      ),
      el('div', { class: 'tagrow' },
        n.agency === 'LH' ? el('span', { class: 'cr-badge lh' }, 'LH 공공')
          : n.agency === 'SH' ? el('span', { class: 'cr-badge lh' }, 'SH')
            : null,
        n.kind === 'rent' ? el('span', { class: 'cr-badge rent' }, '임대') : null,
        heatBadge,
        upcoming ? null
          : ok ? el('span', { class: 'cr-badge ok' }, `신청 가능 ${ev.supplies.filter((s) => s.eligible).length}개 유형`)
            : el('span', { class: 'cr-badge no' }, ev.blockers.length ? ev.blockers[0].slice(0, 16) + '…' : '자격 미달'),
      ),
    );
  }

  _infoCard(n) {
    return el('div', {
      class: 'notice', onclick: () => this.select(n.id),
    },
      el('div', { class: 'notice-top' },
        el('div', {},
          el('div', { class: 'notice-title' }, n.title),
          el('div', { class: 'notice-meta' },
            el('span', {}, n.agencyName ?? n.agency),
            el('span', { class: 'dot' }, n.announce),
          ),
        ),
      ),
      el('div', { class: 'tagrow' }, el('span', { class: 'cr-badge no' }, '안내문 · 신규 청약 아님')),
    );
  }

  /* ───────────────────── 상세 ───────────────────── */

  _renderDetail(state, n) {
    if (n.kind === 'info') return this._renderInfoDetail(n);

    const ev = evaluateNotice(state, n);
    const unit = n.kind === 'sale'
      ? (n.unitTypes.find((u) => u.id === this.view.unitId) ?? n.unitTypes[Math.min(2, n.unitTypes.length - 1)])
      : null;
    if (unit) this.view.unitId = unit.id;

    const head = el('div', { class: 'detail-head' },
      el('button', { class: 'back', onclick: () => this.back() }, '←', ' 공고 목록'),
      el('h3', {}, n.title),
      el('div', { class: 'sub' },
        el('span', {}, `${n.region} ${n.districtLabel}`),
        el('span', { class: 'cr-badge no' }, n.housingType),
        n.district.regulated ? el('span', { class: 'cr-badge hot' }, '규제지역 LTV 50%') : null,
        el('span', { class: 'cr-badge new' }, `${n.units.toLocaleString()}세대`),
      ),
    );

    const body = el('div', { class: 'panel-body' });

    /* 차단 사유 */
    if (ev.blockers.length) {
      body.append(el('div', { class: 'warn-list' },
        ...ev.blockers.map((b) => el('div', { class: 'warn-item fatal' }, '⛔', el('span', {}, b)))));
    }

    /* 평형 선택 */
    if (n.kind === 'sale') {
      body.append(el('div', { class: 'sec-title' }, '주택형 선택'));
      const units = el('div', { class: 'units' });
      for (const u of n.unitTypes) {
        units.append(el('button', {
          class: `unit ${u.id === unit.id ? 'on' : ''}`,
          onclick: () => { this.view.unitId = u.id; this.render(); },
        },
          el('b', {}, u.label),
          el('span', { class: 'num' }, eok(u.price, 2)),
          el('em', {}, `${u.pyeong}평`),
        ));
      }
      body.append(units);
      if (n.priceRange?.clamped) {
        body.append(el('div', { class: 'bar-hint', style: { marginTop: '2px' } },
          `공고 원문 공급금액 범위: ${(n.priceRange.rawLo / 억).toFixed(2)}억 ~ `
          + `${(n.priceRange.rawHi / 억).toFixed(2)}억 (소형·비주택 포함). `
          + '게임에서는 주택형 하한을 보정해 사용합니다.'));
      }
      body.append(this._finance(state, n, unit));
    } else {
      body.append(el('div', { class: 'sec-title' }, '임대 조건'));
      body.append(el('div', { class: 'money-grid' },
        cell('유형', n.rentTerms.mode),
        cell('보증금', won(n.rentTerms.deposit)),
        cell('월 임대료', won(n.rentTerms.monthly)),
        cell('청약통장', n.minSubMonths ? `${n.minSubMonths}개월` : '불필요'),
      ));
      if (n.note) body.append(el('div', { class: 'warn-list' },
        el('div', { class: 'warn-item warn' }, 'ℹ️', el('span', {}, n.note))));
    }

    if (n.kind === 'sale' && n.note) {
      body.append(el('div', { class: 'sec-title' }, '공고 원문'));
      body.append(el('div', { style: { fontSize: '11.5px', color: 'var(--ink-faint)', lineHeight: '1.6' } }, n.note));
    }

    /* 공급 유형 */
    body.append(el('div', { class: 'sec-title' }, '공급 유형별 자격 · 당첨 확률'));
    const ordered = [...ev.supplies].sort((a, b) => (b.eligible ? 1 : 0) - (a.eligible ? 1 : 0));
    for (const s of ordered) {
      body.append(this._supply(state, n, s, unit, ev.blockers.length > 0));
    }

    clear(this.host);
    this.host.append(head, body);
  }

  _finance(state, n, unit) {
    const a = affordability(state, n, unit);
    const box = el('div', {});

    box.append(el('div', { class: 'sec-title' }, '자금 조달 시뮬레이션'));
    box.append(el('div', { class: 'money-grid' },
      cell('분양가', won(a.price)),
      cell('예상 시세', won(a.marketValue), a.premium > 0 ? 'good' : ''),
      cell('안전마진', `${a.premium >= 0 ? '+' : ''}${won(a.premium)}`, a.premium > 0 ? 'good' : 'danger'),
      cell('계약금 (10%)', won(a.depositAmount), state.cash >= a.depositAmount ? 'good' : 'danger'),
      cell('중도금 (60%)', a.midLoanOk ? `대출 ${won(a.midLoan)}` : `현금 ${won(a.midTotal)}`,
        a.midLoanOk ? '' : 'danger'),
      cell('중도금 이자', `월 ${won(a.avgMidInterest)} (평균)`),
      cell('잔금 (30%)', won(a.balance)),
      cell(`입주까지 ${a.monthsToBalance}개월 저축`, won(a.projectedSaving),
        a.projectedSaving > 0 ? 'good' : 'danger'),
      cell('잔금 시점 현금', won(a.cashAtBalance)),
      cell('주담대 예상', won(a.mortgage)),
      cell('입주 후 월납', won(a.mortgageMonthly),
        a.monthlyAfterMoveIn < 0 ? 'danger' : ''),
      cell('입주 후 DSR', pct(a.dsrAfter, 0), a.dsrAfter > 0.4 ? 'danger' : 'good'),
      cell('입주 후 월 잔액', won(a.monthlyAfterMoveIn), a.monthlyAfterMoveIn < 0 ? 'danger' : 'good'),
    ));

    if (a.warnings.length) {
      const wl = el('div', { class: 'warn-list' });
      for (const w of a.warnings) {
        wl.append(el('div', { class: `warn-item ${w.level}` },
          w.level === 'fatal' ? '⛔' : '⚠️', el('span', {}, w.text)));
      }
      box.append(wl);
    }

    const verdictText = {
      safe: '자금 계획에 무리가 없습니다',
      caution: '빠듯합니다 — 금리가 오르면 위험해집니다',
      danger: '지금 자금으로는 계약을 완주할 수 없습니다',
    }[a.verdict];
    box.append(el('div', { class: `verdict ${a.verdict}` },
      el('span', { class: 'big' }, a.verdict === 'safe' ? '✅' : a.verdict === 'caution' ? '⚠️' : '⛔'),
      el('span', {}, verdictText)));

    return box;
  }

  _supply(state, n, s, unit, blocked) {
    const meta = specialMeta(s.type);
    const odds = s.eligible ? estimateOdds(state, n, s, unit) : null;
    const grade = odds ? gradeOf(odds.total) : null;
    const isOpen = this.view.openSupply === s.type;

    const head = el('button', {
      class: 'supply-head',
      onclick: () => { this.view.openSupply = isOpen ? null : s.type; this.render(); },
    },
      el('span', { class: 'supply-ico' }, meta.icon),
      el('span', { class: 'supply-name' }, s.type,
        el('em', {}, `${s.units}세대 · ${supplyMode(n, s.type)}${s.local ? ' · 지역우선' : ''}`)),
      odds
        ? el('span', { class: 'supply-odds' },
          el('b', { class: 'num', style: { color: grade.color } }, `${(odds.total * 100).toFixed(1)}%`),
          el('span', { class: 'num' }, `${odds.ratio.toFixed(1)}:1 · ${grade.label}`))
        : el('span', { class: 'cr-badge no' }, '자격 미달'),
      el('span', { style: { color: 'var(--ink-faint)', fontSize: '11px' } }, isOpen ? '▲' : '▼'),
    );

    const box = el('div', { class: `supply ${s.eligible ? 'ok' : ''}` }, head);

    if (isOpen) {
      const bodyEl = el('div', { class: 'supply-body' });
      bodyEl.append(el('div', { style: { fontSize: '11.5px', color: 'var(--ink-faint)', marginBottom: '7px' } }, meta.desc));

      for (const c of s.checks) {
        bodyEl.append(el('div', { class: `check ${c.ok ? 'ok' : 'no'}` },
          el('span', { class: 'mark' }, c.ok ? '✓' : '✕'),
          el('span', { class: 'lbl' }, c.label),
          el('span', { class: 'det' }, c.detail),
        ));
      }

      if (odds) {
        bodyEl.append(el('div', { class: 'odds-bar' },
          el('i', {
            style: {
              width: `${Math.max(2, odds.total * 100)}%`,
              background: `linear-gradient(90deg, ${grade.color}, ${grade.color}88)`,
            },
          })));
        const info = el('div', {});
        info.append(mini(odds.precise ? '경쟁률 (임장 확인)' : '예상 경쟁률 (어림값)',
          `${odds.ratio.toFixed(1)} : 1 (${odds.applicants.toLocaleString()}명)`));
        if (odds.cutline != null) {
          info.append(mini(odds.mode === '가점제' ? '예상 커트라인' : '예상 배점 컷',
            `${odds.cutline.toFixed(0)}점 · 내 점수 ${odds.myScore.toFixed(0)}점 (${odds.scoreGap >= 0 ? '+' : ''}${odds.scoreGap.toFixed(0)})`));
        }
        if (odds.gaRatio < 1) info.append(mini('추첨 물량', `${((1 - odds.gaRatio) * 100).toFixed(0)}%`));
        bodyEl.append(info);

        bodyEl.append(el('div', { class: 'bar-hint', style: { marginTop: '6px' } },
          odds.precise
            ? '🔍 임장을 다녀와서 이 수치는 실제 경쟁률입니다.'
            : '🔍 임장 전이라 경쟁률·커트라인은 어림값입니다 (실제와 최대 ±70% 차이). 시장조사 액션을 쓰면 다음 달 공고는 실제값이 보입니다.'));

        bodyEl.append(el('button', {
          class: 'cr-btn primary',
          style: { width: '100%', marginTop: '10px' },
          disabled: blocked || state.appliedThisTurn,
          onclick: (e) => { e.stopPropagation(); this.h.onApply(n, s.type, unit?.id); },
        }, state.appliedThisTurn ? '이번 달 청약 완료' : `${s.type}으로 청약 신청 →`));
      }

      box.append(bodyEl);
    }

    return box;
  }

  _renderInfoDetail(n) {
    const body = el('div', { class: 'panel-body' });
    body.append(el('div', { class: 'warn-list' },
      el('div', { class: 'warn-item warn' }, 'ℹ️', el('span', {}, n.infoNature))));

    if (n.infoDetail) {
      for (const [k, v] of Object.entries(n.infoDetail)) {
        if (typeof v === 'string') {
          body.append(el('div', { class: 'sec-title' }, k.replace(/_/g, ' ')));
          body.append(el('div', { style: { fontSize: '12.5px', color: 'var(--ink-dim)', lineHeight: '1.6' } }, v));
        }
      }
    }

    clear(this.host);
    this.host.append(
      el('div', { class: 'detail-head' },
        el('button', { class: 'back', onclick: () => this.back() }, '←', ' 공고 목록'),
        el('h3', {}, n.title),
        el('div', { class: 'sub' },
          el('span', {}, n.agencyName),
          el('span', { class: 'cr-badge no' }, n.announce)),
      ),
      body,
    );
  }
}

/* ───────────────────── 소품 ───────────────────── */

function tabBtn(id, label, count, cur, onPick) {
  return el('button', {
    class: cur === id ? 'on' : '', onclick: () => onPick(id),
  }, label, count ? el('span', { class: 'count num' }, count) : null);
}

function cell(k, v, tone = '') {
  return el('div', { class: `money-cell ${tone}` },
    el('div', { class: 'k' }, k),
    el('div', { class: 'v num' }, v));
}

function mini(k, v) {
  return el('div', { class: 'kv', style: { fontSize: '11.5px' } },
    el('span', { class: 'k' }, k),
    el('span', { class: 'v num' }, v));
}

function emptyBox(icon, title, sub) {
  return el('div', { class: 'empty' },
    el('span', { class: 'big' }, icon),
    el('div', {}, title),
    sub && el('div', { style: { opacity: 0.7, marginTop: '4px' } }, sub));
}
