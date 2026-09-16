<script setup>
import { computed, ref, watch } from 'vue';
import {
  AXES,
  SCOREBOARD_META,
  eok,
  loadAnalysis,
  manwon,
  meters,
  pct,
  rateText,
  ratioVerdict,
  scoreColor,
  scoreGrade,
  trendSeries,
} from '../lib/scoreboard';

const props = defineProps({
  item: { type: Object, required: true },
});

/**
 * 상세 데이터(287KB)는 이 탭을 처음 열 때만 받는다.
 * 목록 카드의 점수 배지는 따로 번들된 색인만 쓰므로 여기서 기다릴 일이 없다.
 */
const payload = ref(null);
const loading = ref(true);
const failed = ref(false);

watch(
  () => props.item.id,
  async () => {
    if (payload.value) return; // 한 번 받아 두면 공고를 바꿔도 다시 받지 않는다
    loading.value = true;
    failed.value = false;
    try {
      payload.value = await loadAnalysis();
    } catch {
      failed.value = true;
    } finally {
      loading.value = false;
    }
  },
  { immediate: true }
);

const a = computed(() => payload.value?.notices?.[props.item.id]);
const axes = SCOREBOARD_META.axes;
const weights = SCOREBOARD_META.weights;

/* ---------------------------------------------------------- 분양가 게이지 */

/** 0.6~2.6배 구간에 배수를 얹는다. 1.1~1.4 밴드가 "통상 신축 프리미엄". */
const GAUGE = { w: 380, h: 58, lo: 0.6, hi: 2.6, padL: 10, padR: 16 };
const gx = (v) =>
  GAUGE.padL +
  ((Math.min(GAUGE.hi, Math.max(GAUGE.lo, v)) - GAUGE.lo) / (GAUGE.hi - GAUGE.lo)) *
    (GAUGE.w - GAUGE.padL - GAUGE.padR);
const gaugeTicks = [0.8, 1.2, 1.6, 2.0, 2.4];

/* ----------------------------------------------------------- 시세 지수 */

const trend = computed(() => trendSeries(a.value?.comps));
const CHART = { w: 380, h: 158, padL: 30, padR: 76, padT: 10, padB: 20 };
const LINE_COLORS = ['#2f6bff', '#0f9d58', '#e5952b', '#e5484d', '#7c8794', '#9b5de5'];

const chart = computed(() => {
  const t = trend.value;
  if (!t) return null;
  const { w, h, padL, padR, padT, padB } = CHART;
  const x = (i) => padL + (i / Math.max(1, t.months.length - 1)) * (w - padL - padR);
  const y = (v) => padT + (1 - (v - t.min) / Math.max(1, t.max - t.min)) * (h - padT - padB);

  return {
    ...t,
    baseline: y(100),
    lines: t.lines.map((l, i) => {
      let d = '';
      let open = false;
      l.points.forEach((v, j) => {
        if (v == null) { open = false; return; }
        d += `${open ? 'L' : 'M'}${x(j).toFixed(1)} ${y(v).toFixed(1)} `;
        open = true;
      });
      const lastIdx = l.points.reduce((acc, v, j) => (v == null ? acc : j), -1);
      return {
        name: l.name,
        color: LINE_COLORS[i % LINE_COLORS.length],
        d,
        end: lastIdx >= 0 ? { x: x(lastIdx), y: y(l.points[lastIdx]), v: Math.round(l.points[lastIdx]) } : null,
        legendY: padT + 10 + i * 13,
      };
    }),
    firstMonth: t.months[0],
    lastMonth: t.months[t.months.length - 1],
    xEnd: w - padR,
  };
});

/* -------------------------------------------------------------- 파생값 */

const regionRows = computed(() => {
  const m = a.value?.market;
  if (!m) return [];
  return [
    { label: m.dongName, o: m, self: true },
    m.sigungu && { label: m.sigungu.name, o: m.sigungu },
    m.sido && { label: m.sido.name, o: m.sido },
  ].filter(Boolean);
});

/** 역·학교·생활시설을 한 줄씩 세운 거리 목록 */
const places = computed(() => {
  const v = a.value;
  if (!v) return [];
  const out = [];
  if (v.infra?.station) {
    out.push({ k: '지하철', name: `${v.infra.station.name} (${v.infra.station.line})`, m: v.infra.station.m });
  }
  if (v.school?.elem) {
    out.push({
      k: '초등학교',
      name: v.school.elem.name,
      m: v.school.elem.m,
      note: v.school.elem.walk ? `도보 ${v.school.elem.walk}분` : null,
    });
  }
  const mid = v.school?.mids?.[0];
  if (mid) out.push({ k: '중학교', name: mid.name, m: mid.m, note: mid.pct != null ? `상위 ${mid.pct}%` : null });
  for (const key of ['공원', '마트', '의료']) {
    const first = v.conv?.[key]?.[0];
    if (first) out.push({ k: key, name: first.name, m: first.m, note: first.desc });
  }
  return out;
});

const boons = computed(() => (a.value?.catalysts ?? []).filter((c) => c.impact > 0));
const risks = computed(() => (a.value?.catalysts ?? []).filter((c) => c.impact < 0));

const sentiment = computed(() => {
  const c = a.value?.community;
  if (!c) return null;
  const total = Math.max(1, c.pos + c.neu + c.neg);
  return {
    ...c,
    posW: (c.pos / total) * 100,
    neuW: (c.neu / total) * 100,
    negW: (c.neg / total) * 100,
  };
});

const STAGE_COLOR = { 개통: '#0f9d58', 착공: '#2f6bff', 추진: '#e5952b', 계획: '#7c8794' };
const stageColor = (s) => STAGE_COLOR[s] ?? 'var(--muted)';
</script>

<template>
  <div v-if="loading" class="ana ana--empty">
    <p>분석 데이터를 불러오는 중입니다…</p>
  </div>

  <div v-else-if="failed" class="ana ana--empty">
    <p>분석 데이터를 불러오지 못했습니다.</p>
    <p class="ana__hint">네트워크 상태를 확인하고 탭을 다시 열어 보세요.</p>
  </div>

  <div v-else-if="!a" class="ana ana--empty">
    <p>이 공고는 입지 분석 대상이 아닙니다.</p>
    <p class="ana__hint">
      매입임대·전세형처럼 여러 지역에 걸친 공고는 비교할 단지를 특정할 수 없어 점수를 내지 않았습니다.
    </p>
  </div>

  <div v-else class="ana">
    <!-- 종합 ------------------------------------------------------------- -->
    <section class="ana__total">
      <div class="ana__totalnum">
        <strong :style="{ color: scoreColor(a.scores.total) }">{{ a.scores.total }}</strong>
        <span>{{ scoreGrade(a.scores.total) }}</span>
      </div>
      <ul class="ana__axes">
        <li v-for="k in AXES" :key="k">
          <span class="ana__axname">{{ axes[k] }}<i>{{ Math.round(weights[k] * 100) }}%</i></span>
          <span class="ana__track">
            <b :style="{ width: `${a.scores[k] ?? 0}%`, background: scoreColor(a.scores[k]) }" />
          </span>
          <span class="ana__axval" :style="{ color: scoreColor(a.scores[k]) }">
            {{ a.scores[k] ?? '-' }}
          </span>
        </li>
      </ul>
    </section>

    <!-- 분양가 ----------------------------------------------------------- -->
    <section v-if="a.offerRef" class="detail__block">
      <h3>분양가는 주변 시세의 몇 배인가</h3>

      <div class="ana__pricerow">
        <div>
          <span>분양 평당가</span>
          <strong>{{ manwon(a.offerPerPy) }}</strong>
          <small>{{ a.offerRef.label }} · 공급 {{ a.offerRef.py }}평</small>
        </div>
        <div>
          <span>인근 실거래 평당가</span>
          <strong class="muted">{{ manwon(a.basePerPy) }}</strong>
          <small v-if="a.newPerPy">신축 기준 {{ manwon(a.newPerPy) }}</small>
        </div>
      </div>

      <svg
        v-if="a.ratio != null"
        class="ana__gauge"
        :viewBox="`0 0 ${GAUGE.w} ${GAUGE.h}`"
        role="img"
        :aria-label="`분양가가 주변 실거래 평당가의 ${a.ratio.toFixed(2)}배`"
      >
        <rect :x="gx(1.1)" :width="gx(1.4) - gx(1.1)" y="20" height="14" fill="#eef2f7" />
        <text :x="(gx(1.1) + gx(1.4)) / 2" y="15" text-anchor="middle" class="ana__gaugecap">
          통상 신축 프리미엄
        </text>
        <line :x1="GAUGE.padL" y1="34" :x2="GAUGE.w - GAUGE.padR" y2="34" stroke="var(--line)" />
        <g v-for="t in gaugeTicks" :key="t">
          <line :x1="gx(t)" y1="31" :x2="gx(t)" y2="37" stroke="var(--line)" />
          <text :x="gx(t)" y="50" text-anchor="middle" class="ana__gaugetick">{{ t.toFixed(1) }}</text>
        </g>
        <polygon
          :points="`${gx(a.ratio)},26 ${gx(a.ratio) - 5},16 ${gx(a.ratio) + 5},16`"
          :fill="a.landLease ? 'var(--muted)' : scoreColor(a.scores.price)"
        />
        <rect
          :x="gx(a.ratio) - 1.5"
          y="24"
          width="3"
          height="16"
          :fill="a.landLease ? 'var(--muted)' : scoreColor(a.scores.price)"
        />
      </svg>

      <p class="ana__verdict" :style="{ color: a.landLease ? 'var(--muted)' : scoreColor(a.scores.price) }">
        <b>{{ a.ratio?.toFixed(2) }}배</b>
        <span>{{ a.landLease ? '토지임대부라 일반 분양가와 직접 비교할 수 없습니다.' : ratioVerdict(a.ratio) }}</span>
      </p>

      <div v-if="a.units.length" class="ana__tablewrap">
        <table class="ana__table">
          <thead>
            <tr><th>주택형</th><th>분양가</th><th>평당가</th><th>경쟁률</th></tr>
          </thead>
          <tbody>
            <tr v-for="u in a.units" :key="u.priv" :class="{ 'is-key': u.priv >= 79 && u.priv <= 87 }">
              <td>전용 {{ u.priv }}㎡<i v-if="u.score != null"> · {{ u.score }}점</i></td>
              <td>{{ eok(u.offer) }}</td>
              <td>{{ manwon(u.perPy) }}</td>
              <td :class="{ 'is-under': u.rate != null && u.rate < 1 }">{{ rateText(u.rate) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p v-if="a.baseSrc" class="ana__src">기준 시세 — {{ a.baseSrc }}</p>

      <p v-if="a.correction" class="ana__warn">
        <b>원본 보정</b> {{ a.correction.reason }}
        <a
          v-for="s in a.correction.sources"
          :key="s.u"
          :href="s.u"
          target="_blank"
          rel="noreferrer"
        >{{ s.t }}</a>
      </p>
    </section>

    <!-- 청약 성적 --------------------------------------------------------- -->
    <section v-if="a.offerResult" class="detail__block">
      <h3>실제 청약 성적</h3>
      <p class="ana__ratebig" :style="{ color: scoreColor(a.demand?.rateScore) }">
        <strong>{{ rateText(a.offerResult.avgRate) }}</strong>
        <span>{{ a.offerResult.resultType }}</span>
      </p>
      <p v-if="a.demand?.under" class="ana__note">미달 주택형 {{ a.demand.under }}개</p>
    </section>

    <!-- 시세 흐름 --------------------------------------------------------- -->
    <section v-if="a.market || a.comps.length" class="detail__block">
      <h3>주변 시세 흐름</h3>

      <dl class="facts facts--compact">
        <div v-for="r in regionRows" :key="r.label" class="facts__row">
          <dt>{{ r.label }}<i v-if="r.self" class="ana__self">기준</i></dt>
          <dd>
            {{ manwon(r.o.pricePerPy) }}/평
            <em :class="(r.o.d1y ?? 0) >= 0 ? 'is-up' : 'is-down'">1년 {{ pct(r.o.d1y) }}</em>
            <em :class="(r.o.d3y ?? 0) >= 0 ? 'is-up' : 'is-down'">3년 {{ pct(r.o.d3y) }}</em>
          </dd>
        </div>
      </dl>

      <template v-if="chart">
        <svg
          class="ana__chart"
          :viewBox="`0 0 ${CHART.w} ${CHART.h}`"
          role="img"
          aria-label="인근 단지 실거래 지수 추이"
        >
          <line
            :x1="CHART.padL"
            :y1="chart.baseline"
            :x2="chart.xEnd"
            :y2="chart.baseline"
            stroke="var(--line)"
            stroke-dasharray="3 3"
          />
          <text :x="CHART.padL - 4" :y="chart.baseline + 3" text-anchor="end" class="ana__axis">100</text>
          <path v-for="l in chart.lines" :key="l.name" :d="l.d" fill="none" :stroke="l.color" stroke-width="1.5" />
          <template v-for="l in chart.lines" :key="`${l.name}-end`">
            <circle v-if="l.end" :cx="l.end.x" :cy="l.end.y" r="2.4" :fill="l.color" />
            <text v-if="l.end" :x="chart.xEnd + 5" :y="l.legendY" :fill="l.color" class="ana__legend">
              {{ l.name.length > 6 ? `${l.name.slice(0, 6)}…` : l.name }} {{ l.end.v }}
            </text>
          </template>
          <text :x="CHART.padL" :y="CHART.h - 6" class="ana__axis">{{ chart.firstMonth }}</text>
          <text :x="chart.xEnd" :y="CHART.h - 6" text-anchor="end" class="ana__axis">{{ chart.lastMonth }}</text>
        </svg>
        <p class="ana__src">
          각 단지의 월별 실거래 평균을 {{ chart.firstMonth }} = 100 으로 지수화했습니다.
          단지마다 대표 주택형이 달라 절대 금액이 아닌 흐름 비교용입니다.
        </p>
      </template>

      <div v-if="a.comps.length" class="ana__tablewrap">
        <table class="ana__table">
          <thead>
            <tr><th>인근 단지</th><th>평당가</th><th>1년</th><th>3년</th></tr>
          </thead>
          <tbody>
            <tr v-for="c in a.comps" :key="c.name">
              <td>{{ c.name }}<i> · {{ c.built }} · {{ c.km }}km</i></td>
              <td>{{ manwon(c.perPy) }}</td>
              <td :class="(c.y1pct ?? 0) >= 0 ? 'is-up' : 'is-down'">{{ pct(c.y1pct) }}</td>
              <td :class="(c.y3pct ?? 0) >= 0 ? 'is-up' : 'is-down'">{{ pct(c.y3pct) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- 인프라 ----------------------------------------------------------- -->
    <section v-if="places.length" class="detail__block">
      <h3>생활 인프라</h3>
      <ul class="ana__places">
        <li v-for="p in places" :key="p.k + p.name">
          <span class="ana__pk">{{ p.k }}</span>
          <span class="ana__pn">{{ p.name }}<i v-if="p.note"> · {{ p.note }}</i></span>
          <b>{{ meters(p.m) }}</b>
        </li>
      </ul>
      <p class="ana__src">단지 기준 직선거리입니다. 실제 도보 경로는 더 깁니다.</p>
    </section>

    <!-- 개발호재 --------------------------------------------------------- -->
    <section v-if="a.catalysts.length" class="detail__block">
      <h3>개발호재와 리스크</h3>
      <p v-if="a.zoneSummary" class="ana__summary">{{ a.zoneSummary }}</p>
      <ul class="ana__cats">
        <li v-for="c in boons" :key="c.t">
          <span class="ana__stage" :style="{ color: stageColor(c.stage), borderColor: stageColor(c.stage) }">
            {{ c.stage }}
          </span>
          <span class="ana__ct">
            {{ c.t }}<i v-if="c.eta"> · {{ c.eta }}</i>
            <em v-if="c.note">{{ c.note }}</em>
            <a v-if="c.src" :href="c.src" target="_blank" rel="noreferrer">출처</a>
          </span>
        </li>
        <li v-for="c in risks" :key="c.t" class="is-risk">
          <span class="ana__stage ana__stage--risk">리스크</span>
          <span class="ana__ct">
            {{ c.t }}
            <em v-if="c.note">{{ c.note }}</em>
          </span>
        </li>
      </ul>
    </section>

    <!-- 커뮤니티 --------------------------------------------------------- -->
    <section v-if="sentiment" class="detail__block">
      <h3>동네 반응</h3>
      <div class="ana__sent" role="img" :aria-label="`긍정 ${sentiment.pos}, 중립 ${sentiment.neu}, 부정 ${sentiment.neg}`">
        <b :style="{ width: `${sentiment.posW}%`, background: '#0f9d58' }" />
        <b :style="{ width: `${sentiment.neuW}%`, background: 'var(--line)' }" />
        <b :style="{ width: `${sentiment.negW}%`, background: '#e5484d' }" />
      </div>
      <p class="ana__src">
        생활권 리뷰 {{ sentiment.sampled }}건 표본 · 긍정 {{ sentiment.pos }} / 중립 {{ sentiment.neu }} /
        부정 {{ sentiment.neg }}
        <template v-if="sentiment.subjectTotal">— 이 단지 리뷰 {{ sentiment.subjectTotal.toLocaleString() }}건</template>
      </p>

      <ul v-if="sentiment.subjectReviews?.length || sentiment.zoneReviews?.length" class="ana__quotes">
        <li v-for="(r, i) in [...(sentiment.subjectReviews ?? []), ...(sentiment.zoneReviews ?? [])].slice(0, 5)" :key="i">
          <p>{{ r.t }}</p>
          <span>{{ r.from }}<template v-if="r.d"> · {{ r.d }}</template><template v-if="r.up"> · 추천 {{ r.up }}</template></span>
        </li>
      </ul>

      <ul v-if="a.news?.length" class="ana__news">
        <li v-for="n in a.news" :key="n.url">
          <a :href="n.url" target="_blank" rel="noreferrer">{{ n.title }}</a>
          <span>{{ n.press }} · {{ n.at }}</span>
        </li>
      </ul>
    </section>

    <!-- 산출 기준 --------------------------------------------------------- -->
    <details class="ana__method">
      <summary>점수는 어떻게 매겼나</summary>
      <dl>
        <template v-for="k in AXES" :key="k">
          <dt>{{ axes[k] }} <i>가중치 {{ Math.round(weights[k] * 100) }}%</i></dt>
          <dd>{{ payload.formulas[k] }}</dd>
        </template>
        <dt>종합</dt>
        <dd>{{ payload.formulas.total }}</dd>
      </dl>
      <h4>읽을 때 유의할 점</h4>
      <ul>
        <li v-for="c in payload.caveats" :key="c">{{ c }}</li>
      </ul>
      <p class="ana__src">
        {{ SCOREBOARD_META.basedOn }} 기준 · 시세·평형·경쟁률·학군·역거리·리뷰는 호갱노노 공개 페이지,
        개발호재 단계는 공개 보도·지자체 자료로 확인했습니다.
      </p>
    </details>
  </div>
</template>
