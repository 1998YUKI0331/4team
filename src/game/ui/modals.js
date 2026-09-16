import { el, modal, ring } from './dom.js';
import { won, eok, pct, ymLabel, MAX_SCORE, 억 } from '../data/constants.js';
import {
  PRESETS, readBoard, createState, householdIncome, netWorth,
} from '../core/state.js';
import { affordability, monthlyCashflow } from '../core/finance.js';
import { gaJeom } from '../core/scoring.js';
import { DISTRICTS, DISTRICT_LIST } from '../data/geo.js';

/* ═══════════════════════ 인트로 ═══════════════════════ */

export function introModal() {
  return modal((done) => {
    let picked = PRESETS[0].id;
    let name = '나';

    const grid = el('div', { class: 'presets' });
    const cards = new Map();

    for (const p of PRESETS) {
      const s = p.setup;
      // 표시 수치는 실제 게임 상태에서 계산한다 — 설명과 규칙이 어긋나지 않게
      const probe = createState(p.id, '미리보기');
      const g = gaJeom(probe);
      const cf = monthlyCashflow(probe);

      const card = el('button', {
        class: `preset ${p.id === picked ? 'on' : ''}`,
        onclick: () => {
          picked = p.id;
          for (const [id, c] of cards) c.classList.toggle('on', id === picked);
        },
      },
        el('span', { class: 'emoji' }, p.emoji),
        el('h4', {}, p.name),
        el('div', { class: 'tagline' }, p.tagline),
        el('div', { class: 'desc' }, p.desc),
        el('div', { class: 'stats' },
          row('청약 가점', `${g.total} / 84`),
          row('나이', `만 ${Math.floor(s.ageMonths / 12)}세`),
          row('순자산', eok(netWorth(probe), 2)),
          row('월 소득', won(householdIncome(probe))),
          row('월 잔액', won(cf.net)),
          row('통장 가입', `${s.accountMonths}개월`),
          row('가족', `${s.married ? '기혼' : '미혼'}${s.children?.length ? ` · 자녀 ${s.children.length}` : ''}`),
          row('난이도', p.difficulty),
        ),
      );
      cards.set(p.id, card);
      grid.append(card);
    }

    const nameInput = el('input', {
      type: 'text', value: name, maxlength: '8', placeholder: '플레이어 이름',
      style: {
        width: '160px', padding: '9px 13px', borderRadius: '11px',
        background: 'rgba(255,255,255,0.06)', border: '1px solid var(--line)',
        color: 'var(--ink)', font: 'inherit', fontWeight: '600',
      },
      oninput: (e) => { name = e.target.value.trim() || '나'; },
    });

    return el('div', { class: 'modal wide' },
      el('div', { class: 'modal-head' },
        el('div', { class: 'eyebrow' }, '2026년 7월 · 수도권'),
        el('h2', {}, '청약 로드'),
        el('p', {},
          '실제 청약 공고 데이터로 돌아가는 내 집 마련 시뮬레이션입니다. ',
          '한 턴은 한 달. 11년 안에 무주택을 벗어나세요. ',
          '기다릴수록 가점은 오르지만, 집값은 더 빨리 오릅니다.'),
      ),
      el('div', { class: 'modal-body' },
        el('div', { class: 'sec-title' }, '시작 캐릭터를 고르세요'),
        grid,
      ),
      el('div', { class: 'modal-foot' },
        nameInput,
        el('button', {
          class: 'cr-btn primary', autofocus: true,
          onclick: () => done({ presetId: picked, playerName: name }),
        }, '게임 시작 →'),
      ),
    );
  });
}

function row(k, v) {
  return el('div', {}, el('span', { class: 'k' }, k), el('span', { class: 'num' }, v));
}

/* ═══════════════════════ 랜덤 이벤트 ═══════════════════════ */

export function eventModal(event) {
  return modal((done) => {
    const choices = el('div', { class: 'choices' });
    event.choices.forEach((c, i) => {
      choices.append(el('button', {
        class: `choice ${c.danger ? 'danger' : ''}`,
        onclick: () => done(i),
      },
        el('span', { class: 'n' }, i + 1),
        el('span', { class: 'txt' },
          el('b', {}, c.label),
          c.hint && el('span', {}, c.hint)),
      ));
    });

    const toneColor = { market: '#4de2ff', life: '#33e39f', risk: '#ff6b8a' }[event.tone] ?? '#ffc76b';

    return el('div', { class: 'modal' },
      el('div', { class: 'modal-head' },
        el('div', { class: 'eyebrow', style: { color: toneColor } },
          { market: '시장 동향', life: '생활', risk: '위험' }[event.tone] ?? '이벤트'),
        el('h2', {}, `${event.icon} ${event.title}`),
        el('p', {}, event.text),
      ),
      el('div', { class: 'modal-body' }, choices),
    );
  });
}

/* ═══════════════════════ 자금 위기 ═══════════════════════ */

export function crisisModal(crisis, state) {
  return modal((done) => {
    const choices = el('div', { class: 'choices' });
    crisis.options.forEach((o, i) => {
      choices.append(el('button', {
        class: `choice ${o.danger ? 'danger' : ''}`,
        onclick: () => done(o.id),
      },
        el('span', { class: 'n', style: o.danger ? { background: 'rgba(255,107,138,0.18)', color: 'var(--red)' } : {} },
          o.danger ? '!' : i + 1),
        el('span', { class: 'txt' },
          el('b', {}, o.label),
          o.hint && el('span', {}, o.hint)),
      ));
    });

    return el('div', { class: 'modal' },
      el('div', { class: 'modal-head' },
        el('div', { class: 'eyebrow', style: { color: 'var(--red)' } }, '자금 조달 실패'),
        el('h2', {}, `💸 ${crisis.step.label} 납입 불가`),
        el('p', {},
          `${ymLabel(state.turn)} ${crisis.step.label} ${won(crisis.step.amount)}을 내야 하는데 `,
          el('b', { style: { color: 'var(--red)' } }, `${won(crisis.shortfall)}이 부족합니다.`),
          ' 방법을 골라야 합니다.'),
      ),
      el('div', { class: 'modal-body' },
        el('div', { class: 'money-grid', style: { marginBottom: '14px' } },
          mcell('보유 현금', won(state.cash)),
          mcell('부족액', won(crisis.shortfall), 'danger'),
        ),
        choices,
      ),
    );
  });
}

/* ═══════════════════════ 당첨 / 낙첨 ═══════════════════════ */

export function winModal(ctx, state) {
  const { notice, unitType, odds, result, supply } = ctx;
  const isRent = notice.kind === 'rent';
  const a = isRent ? null : affordability(state, notice, unitType);

  return modal((done) => {
    const body = el('div', { class: 'modal-body' });

    body.append(el('div', { class: 'stat-grid' },
      stat('공급 유형', supply),
      stat('경쟁률', `${odds.ratio.toFixed(1)}:1`),
      odds.cutline != null ? stat('커트라인', `${result.finalCutline.toFixed(0)}점`) : null,
      odds.myScore != null ? stat('내 점수', `${odds.myScore.toFixed(0)}점`) : null,
    ));

    if (isRent) {
      body.append(el('div', { class: 'sec-title' }, '임대 조건'));
      body.append(el('div', { class: 'money-grid' },
        mcell('보증금', won(notice.rentTerms.deposit)),
        mcell('월 임대료', won(notice.rentTerms.monthly)),
      ));
      body.append(el('div', { class: 'verdict safe' }, el('span', { class: 'big' }, '🔑'),
        el('span', {}, '주거는 안정되지만 자산은 늘지 않습니다. 무주택 자격은 유지됩니다.')));
    } else {
      body.append(el('div', { class: 'sec-title' }, '계약하면 이렇게 됩니다'));
      body.append(el('div', { class: 'money-grid' },
        mcell('분양가', won(a.price)),
        mcell('예상 시세', won(a.marketValue), 'good'),
        mcell('안전마진', `+${won(a.premium)}`, 'good'),
        mcell('계약금 (다음 달)', won(a.depositAmount), state.cash >= a.depositAmount ? 'good' : 'danger'),
        mcell('입주 후 월납', won(a.mortgageMonthly)),
        mcell('입주 후 DSR', pct(a.dsrAfter, 0), a.dsrAfter > 0.4 ? 'danger' : 'good'),
        mcell('입주 예정', ymLabel(state.turn + 25)),
        mcell('입주 후 월 잔액', won(a.monthlyAfterMoveIn), a.monthlyAfterMoveIn < 0 ? 'danger' : 'good'),
      ));

      if (a.warnings.length) {
        const wl = el('div', { class: 'warn-list' });
        for (const w of a.warnings) {
          wl.append(el('div', { class: `warn-item ${w.level}` },
            w.level === 'fatal' ? '⛔' : '⚠️', el('span', {}, w.text)));
        }
        body.append(wl);
      }

      body.append(el('div', { class: `verdict ${a.verdict}` },
        el('span', { class: 'big' }, a.verdict === 'safe' ? '✅' : a.verdict === 'caution' ? '⚠️' : '⛔'),
        el('span', {}, {
          safe: '무리 없이 완주할 수 있습니다.',
          caution: '빠듯합니다. 중도금 구간에서 금리가 오르면 위험합니다.',
          danger: '지금 계약하면 잔금에서 막힐 가능성이 매우 높습니다.',
        }[a.verdict])));
    }

    return el('div', { class: 'modal' },
      el('div', { class: 'modal-head' },
        el('div', { class: 'eyebrow', style: { color: 'var(--green)' } }, '당첨'),
        el('h2', {}, `🎉 ${notice.title}`),
        el('p', {}, `${notice.region} ${notice.districtLabel} · ${unitType?.label ?? notice.rentTerms.mode}`),
      ),
      body,
      el('div', { class: 'modal-foot' },
        el('button', {
          class: 'cr-btn ghost',
          onclick: () => done('forfeit'),
          title: '재당첨 제한 5년 + 신용 하락',
        }, '포기한다'),
        el('button', {
          class: 'cr-btn primary', autofocus: true,
          onclick: () => done('accept'),
        }, isRent ? '입주 계약 →' : '분양 계약 체결 →'),
      ),
    );
  });
}

export function loseModal(ctx) {
  const { notice, odds, result, supply } = ctx;
  return modal((done) => el('div', { class: 'modal' },
    el('div', { class: 'modal-head' },
      el('div', { class: 'eyebrow', style: { color: 'var(--ink-faint)' } }, '낙첨'),
      el('h2', {}, notice.title),
      el('p', {}, `${supply} · ${odds.mode}`),
    ),
    el('div', { class: 'modal-body' },
      el('div', { class: 'stat-grid' },
        stat('경쟁률', `${odds.ratio.toFixed(1)}:1`),
        stat('신청자', `${odds.applicants.toLocaleString()}명`),
        odds.cutline != null ? stat('커트라인', `${result.finalCutline.toFixed(0)}점`) : null,
        odds.myScore != null ? stat('내 점수', `${odds.myScore.toFixed(0)}점`) : null,
      ),
      odds.myScore != null && result.finalCutline != null
        ? el('div', { class: 'verdict caution', style: { marginTop: '14px' } },
          el('span', { class: 'big' }, '📉'),
          el('span', {}, `${(result.finalCutline - odds.myScore).toFixed(0)}점이 모자랐습니다. `
            + '가점을 더 쌓거나, 경쟁률이 낮은 지역·유형을 노려보세요.'))
        : el('div', { class: 'verdict caution', style: { marginTop: '14px' } },
          el('span', { class: 'big' }, '🎲'),
          el('span', {}, '추첨에서 밀렸습니다. 다음 달 다시 도전할 수 있습니다.')),
    ),
    el('div', { class: 'modal-foot' },
      el('button', { class: 'cr-btn primary', autofocus: true, onclick: () => done(null) }, '계속하기'),
    ),
  ));
}

/* ═══════════════════════ 엔딩 ═══════════════════════ */

export function endingModal(ending) {
  const board = readBoard();
  return modal((done) => el('div', { class: 'modal wide' },
    el('div', { class: 'modal-body' },
      el('div', { class: 'result-hero' },
        el('div', { class: 'rank' }, ending.rank),
        el('h2', {}, ending.title),
        el('p', {}, ending.body),
      ),
      el('div', { class: 'stat-grid' },
        stat('최종 점수', ending.score.toLocaleString()),
        stat('순자산', eok(ending.netWorth, 2)),
        stat('청약 가점', `${ending.gaJeom} / 84`),
        stat('플레이 기간', `${Math.floor(ending.turns / 12)}년 ${ending.turns % 12}개월`),
        stat('청약 횟수', `${ending.stats.applied}회`),
        stat('당첨', `${ending.stats.won}회`),
        stat('집값 상승', `${((ending.priceIndex - 1) * 100).toFixed(0)}%`),
        stat('포기·해제', `${ending.stats.forfeited}회`),
      ),
      board.length ? el('div', {},
        el('div', { class: 'sec-title' }, '명예의 전당'),
        el('div', { class: 'board-list' },
          ...board.slice(0, 6).map((b, i) => el('div', { class: 'board-row' },
            el('span', { class: 'rk' }, `${i + 1}`),
            el('span', { class: 'nm' }, `${b.name} · ${b.preset}`),
            el('span', { class: 'cr-badge new' }, b.rank),
            el('span', { class: 'sc num' }, b.score.toLocaleString()),
          )),
        ),
      ) : null,
    ),
    el('div', { class: 'modal-foot' },
      el('button', { class: 'cr-btn primary', autofocus: true, onclick: () => done('restart') }, '다시 도전하기'),
    ),
  ));
}

/* ═══════════════════════ 도움말 ═══════════════════════ */

export function helpModal() {
  return modal((done) => el('div', { class: 'modal wide' },
    el('div', { class: 'modal-head' },
      el('div', { class: 'eyebrow' }, '규칙'),
      el('h2', {}, '청약 제도 한눈에'),
      el('p', {}, '이 게임의 규칙은 실제 주택공급규칙을 단순화한 것입니다.'),
    ),
    el('div', { class: 'modal-body' },
      section('🎯 가점제 (84점)', [
        ['무주택기간 (32점)', '만 30세 또는 혼인신고일 중 빠른 날부터 1년당 2점, 15년 이상 만점.'],
        ['부양가족수 (35점)', '배우자·미성년 자녀·3년 이상 부양한 직계존속. 0명 5점에서 1명당 +5점.'],
        ['청약통장 (17점)', '가입 6개월 미만 1점에서 시작해 15년 이상이면 17점.'],
      ]),
      section('🏠 공급 유형', [
        ['일반공급', '규제지역 85㎡ 이하는 100% 가점제. 그 외는 가점 60% + 추첨 40%.'],
        ['특별공급', '신혼부부·생애최초·다자녀·신생아·노부모부양·기관추천. 소득 기준(도시근로자 대비 %)이 걸립니다.'],
        ['지역우선', '해당 시·군·구 거주자가 물량의 상당수를 먼저 가져갑니다. 이사하면 거주기간이 0이 됩니다.'],
      ]),
      section('💸 당첨 이후가 진짜', [
        ['계약금 10%', '당첨 다음 달 현금으로 납입. 못 내면 계약 해제.'],
        ['중도금 60%', '3개월마다 6회. 분양가 12억 초과 단지는 중도금 대출이 막힙니다.'],
        ['잔금 30%', '입주 시점에 주택담보대출로 전환. LTV(규제 50% / 비규제 70%)와 DSR 40%를 동시에 통과해야 합니다.'],
        ['계약 해제', '납입금의 60%를 잃고 5년간 재당첨이 제한됩니다.'],
      ]),
      section('⏳ 시간의 역설', [
        ['기다리면', '무주택기간·통장기간 가점이 오릅니다.'],
        ['하지만', '집값 지수도 함께 올라 같은 아파트가 더 비싸집니다. 지도의 지역 타일이 실제로 솟아오릅니다.'],
        ['신혼 특공', '혼인 7년이 지나면 창이 닫힙니다. 타이밍이 전부입니다.'],
      ]),
      section('⌨️ 단축키', [
        ['Enter / N', '다음 달로'],
        ['1 ~ 5', '행동 선택'],
        ['Space', '전체 지도 보기'],
        ['H', '이 도움말'],
      ]),
    ),
    el('div', { class: 'modal-foot' },
      el('button', { class: 'cr-btn primary', autofocus: true, onclick: () => done(null) }, '닫기'),
    ),
  ), { dismissible: true });
}

function section(title, rows) {
  return el('div', {},
    el('div', { class: 'sec-title' }, title),
    ...rows.map(([k, v]) => el('div', { style: { marginBottom: '8px' } },
      el('b', { style: { fontSize: '12.5px' } }, k),
      el('div', { style: { fontSize: '12px', color: 'var(--ink-dim)', lineHeight: '1.6' } }, v),
    )),
  );
}

/* ═══════════════════════ 이사 ═══════════════════════ */

/**
 * 거주지 이전 모달.
 * 지역우선공급을 노리고 옮길 수 있게 하되, 거주기간이 0 으로 돌아간다는 대가를 명확히 보여준다.
 * @returns 선택한 districtKey 또는 null
 */
export function moveModal(state, { moveCost, blocker, localMonths }) {
  return modal((done) => {
    const cur = DISTRICTS[state.residenceKey];
    let picked = null;

    const rows = el('div', { class: 'board-list' });
    const cards = new Map();

    const list = [...new Set(DISTRICT_LIST)]
      .filter((d) => d.key !== '인천 서해구')
      .sort((a, b) => b.tier - a.tier || b.base - a.base);

    for (const d of list) {
      const c = moveCost(state, d);
      const here = d.key === cur?.key;
      const afford = state.cash >= c.total;

      const row = el('button', {
        class: `board-row ${here ? 'me' : ''}`,
        disabled: here || !afford || !!blocker,
        style: { width: '100%', textAlign: 'left', opacity: here || !afford ? '0.5' : '1' },
        onclick: () => {
          picked = d.key;
          for (const [k, node] of cards) node.classList.toggle('on', k === picked);
        },
      },
        el('span', { class: 'num', style: { width: '26px', color: 'var(--gold)' } }, `T${d.tier}`),
        el('div', { style: { flex: '1' } },
          el('b', {}, `${d.region} ${d.district}`, here ? ' · 현재 거주지' : ''),
          el('div', { style: { fontSize: '11px', color: 'var(--ink-faint)' } },
            `84㎡ 시세 ${(d.base * state.priceIndex).toFixed(1)}억 · ${d.regulated ? '규제지역 LTV 50%' : '비규제 LTV 70%'}`),
        ),
        el('div', { class: 'num', style: { textAlign: 'right', fontSize: '11.5px' } },
          el('div', { style: { color: afford ? 'var(--ink)' : 'var(--red)' } }, won(c.total)),
          c.depositGap !== 0
            ? el('div', { style: { color: 'var(--ink-faint)', fontSize: '10px' } },
              `보증금 ${c.depositGap > 0 ? '+' : ''}${won(c.depositGap)}`)
            : null,
        ),
      );
      cards.set(d.key, row);
      rows.append(row);
    }

    return el('div', { class: 'modal wide' },
      el('div', { class: 'modal-head' },
        el('div', { class: 'eyebrow' }, '거주지 이전'),
        el('h2', {}, '이사'),
        el('p', {}, blocker
          ? blocker
          : `해당지역 거주자 우선공급은 당첨 확률을 약 1.85배로 올립니다 (기타지역은 0.52배). `
            + `다만 이사하면 거주기간이 0 이 되고, 우선공급 자격은 ${localMonths}개월을 채워야 다시 살아납니다.`),
      ),
      el('div', { class: 'modal-body' },
        el('div', { class: 'warn-list' },
          el('div', { class: 'warn-item warn' }, '⚠️',
            el('span', {}, `현재 ${cur?.region ?? ''} ${cur?.district ?? ''} · 거주 ${state.residenceMonths}개월`
              + ` — 지금은 ${(state.residenceMonths ?? 0) >= localMonths ? '지역우선 자격 있음' : '지역우선 자격 없음'}`)),
        ),
        el('div', { class: 'sec-title' }, '이사 갈 지역 · 비용'),
        rows,
      ),
      el('div', { class: 'modal-foot' },
        el('button', { class: 'cr-btn ghost', onclick: () => done(null) }, '취소'),
        el('button', {
          class: 'cr-btn primary',
          onclick: () => done(picked),
        }, '이사하기'),
      ),
    );
  }, { dismissible: true });
}

/* ───────────────────── 소품 ───────────────────── */

function stat(k, v) {
  return el('div', { class: 'stat' },
    el('div', { class: 'k' }, k),
    el('div', { class: 'v num' }, v));
}

function mcell(k, v, tone = '') {
  return el('div', { class: `money-cell ${tone}` },
    el('div', { class: 'k' }, k),
    el('div', { class: 'v num' }, v));
}
