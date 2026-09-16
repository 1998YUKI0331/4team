<script setup>
import { computed, ref } from 'vue';
import { formatDate, formatWon, priceLabel, statusLabelOf } from '../lib/notices';
import { communityStore } from '../stores/community';
import { scheduleStore } from '../stores/schedule';
import { CROWN_RANKS, RANK_LIMIT, visitStore } from '../stores/visits';
import { playNotice } from '../stores/app';
import CommunityPanel from './CommunityPanel.vue';
import RankCrown from './RankCrown.vue';

const props = defineProps({
  item: { type: Object, required: true },
  match: { type: Object, default: null },
  /** 'info' | 'community' — 커뮤니티는 화면이 넓을 때만 이 패널 안에서 열린다. */
  tab: { type: String, default: 'info' },
});

const emit = defineEmits(['close', 'focus', 'select-tab', 'goto-notice']);

const pdfUrl = computed(() => (props.item.pdf ? `/공고문/${encodeURIComponent(props.item.pdf)}` : null));
const specials = computed(() => (props.item.special ?? []).filter((s) => s.type !== '일반공급'));
const general = computed(() => (props.item.special ?? []).find((s) => s.type === '일반공급'));
const postCount = computed(() => communityStore.countFor(props.item.id));
const scheduleSaved = computed(() => scheduleStore.isSaved(props.item.id));
const scheduleBusy = ref(false);

async function toggleSchedule() {
  scheduleBusy.value = true;
  try {
    await scheduleStore.toggle(props.item.id);
  } catch {
    // 저장 실패는 화면 흐름을 막지 않는다 — 오프라인 배너가 별도로 뜬다
  } finally {
    scheduleBusy.value = false;
  }
}
const visits = computed(() => visitStore.countFor(props.item.id));
const rank = computed(() => visitStore.rankOf(props.item.id));
const crownRank = computed(() => (rank.value && rank.value <= CROWN_RANKS ? rank.value : null));
const showRank = computed(() => rank.value && rank.value <= RANK_LIMIT);
const extras = computed(() =>
  props.item.extra ? Object.entries(props.item.extra).filter(([, v]) => v && typeof v !== 'object') : []
);

function specialDetail(s) {
  const bits = [];
  if (s.requiresNoHouse) bits.push('무주택');
  if (s.minChildren) bits.push(`자녀 ${s.minChildren}명 이상`);
  if (s.maxMarriageYears) bits.push(`혼인 ${s.maxMarriageYears}년 이내`);
  if (s.incomeLimit) bits.push(`소득 ${s.incomeLimit}% 이하`);
  return bits.length ? bits.join(' · ') : '별도 소득요건 없음 (공고문 확인)';
}
</script>

<template>
  <aside class="detail" :style="{ '--accent': item.color }">
    <header class="detail__head">
      <div>
        <div class="detail__badges">
          <span class="badge" :class="`badge--${item.status}`">{{ statusLabelOf(item) }}</span>
          <span class="chip chip--solid">{{ item.housingType }}</span>
          <span v-if="item.agencyName" class="chip chip--ghost">{{ item.agencyName }}</span>
        </div>
        <h2>
          <RankCrown :rank="crownRank" :size="18" />
          {{ item.title }}
        </h2>
        <p class="detail__where">
          {{ item.address ?? item.placeLabel }}
          <em v-if="item.approxLabel" class="detail__approx"> · 위치 {{ item.approxLabel }}</em>
        </p>
        <p v-if="visits" class="detail__visits" :class="crownRank ? `is-top-${crownRank}` : null">
          방문 {{ visits }}회<template v-if="showRank"> · 많이 본 단지 {{ rank }}위</template>
        </p>
      </div>
      <button type="button" class="detail__close" aria-label="닫기" @click="emit('close')">×</button>
    </header>

    <nav class="detail__tabs" role="tablist">
      <button type="button" role="tab" :aria-selected="tab === 'info'" :class="{ 'is-on': tab === 'info' }" @click="emit('select-tab', 'info')">
        공고 정보
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="tab === 'community'"
        :class="{ 'is-on': tab === 'community' }"
        @click="emit('select-tab', 'community')"
      >
        지역 커뮤니티<i v-if="postCount">{{ postCount }}</i>
      </button>
    </nav>

    <div v-if="tab === 'info'" class="detail__body">
      <section v-if="match" class="matchbox" :class="match.ok ? 'is-ok' : 'is-no'">
        <h3>{{ match.ok ? `내 조건 — ${match.tierLabel}` : '지금 조건으로는 어려워요' }}</h3>
        <ul v-if="match.matched.length" class="matchbox__list">
          <li v-for="m in match.matched" :key="m.type" :class="{ 'is-uncertain': m.uncertain }">
            <b>{{ m.label }}</b><span>{{ m.note }}</span>
          </li>
        </ul>
        <ul v-if="match.blockers.length" class="matchbox__blockers">
          <li v-for="b in match.blockers" :key="b">{{ b }}</li>
        </ul>
        <p v-if="!match.ok && !match.blockers.length && match.missed.length" class="matchbox__miss">
          {{ match.missed[0].label }} 등 {{ match.missed.length }}개 유형이 조건에서 벗어났어요 ({{ match.missed[0].reason }})
        </p>
      </section>

      <section class="detail__price">
        <span>공급금액(공고문 기재 범위)</span>
        <strong v-if="item.priceMin != null">
          {{ formatWon(item.priceMin) }} <i>~</i> {{ formatWon(item.priceMax) }}
        </strong>
        <strong v-else class="muted">{{ priceLabel(item) }}</strong>
        <small>주택형·층·옵션에 따라 달라집니다. 정확한 금액은 원문 공고를 확인하세요.</small>
      </section>

      <dl class="facts">
        <div class="facts__row"><dt>모집공고일</dt><dd>{{ formatDate(item.announce) }}</dd></div>
        <div class="facts__row">
          <dt>청약 마감</dt>
          <dd class="facts__deadline">
            <span>{{ item.deadline ? formatDate(item.deadline) : '공고문 참고' }}</span>
            <button
              type="button"
              class="schedule-btn"
              :class="{ 'is-on': scheduleSaved }"
              :disabled="scheduleBusy"
              @click="toggleSchedule"
            >
              {{ scheduleSaved ? '캘린더에 저장됨' : '캘린더에 저장' }}
            </button>
          </dd>
        </div>
        <div class="facts__row"><dt>공급 유형</dt><dd>{{ item.housingType }}</dd></div>
        <div class="facts__row"><dt>사업 주체</dt><dd>{{ item.agencyName || item.agency }}</dd></div>
        <div class="facts__row">
          <dt>소재지</dt>
          <dd>
            {{ item.address ?? '-' }}
            <span v-if="item.addressSource" class="facts__src"> ({{ item.addressSource }})</span>
          </dd>
        </div>
        <div class="facts__row">
          <dt>청약통장</dt>
          <dd>{{ item.minSubMonths ? `가입 ${item.minSubMonths}개월 이상` : '통장 요건 없음/공고문 참고' }}</dd>
        </div>
        <div class="facts__row"><dt>신청 연령</dt><dd>{{ item.minAge ? `만 ${item.minAge}세 이상` : '공고문 참고' }}</dd></div>
      </dl>

      <section v-if="specials.length" class="detail__block">
        <h3>특별공급 {{ specials.length }}종</h3>
        <ul class="specials">
          <li v-for="s in specials" :key="s.type">
            <b>{{ s.type }}</b>
            <span>{{ specialDetail(s) }}</span>
          </li>
        </ul>
        <p v-if="general" class="detail__note">일반공급: {{ specialDetail(general) }}</p>
      </section>

      <section v-if="extras.length" class="detail__block">
        <h3>공고 요약</h3>
        <dl class="facts facts--compact">
          <div v-for="[k, v] in extras" :key="k" class="facts__row">
            <dt>{{ k.replace(/_/g, ' ') }}</dt>
            <dd>{{ v }}</dd>
          </div>
        </dl>
      </section>

      <p v-if="item.note" class="detail__note">{{ item.note }}</p>

      <footer class="detail__foot">
        <a v-if="pdfUrl" class="btn btn--primary" :href="pdfUrl" target="_blank" rel="noreferrer">공고문 원문 PDF</a>
        <a v-if="item.url" class="btn" :href="item.url" target="_blank" rel="noreferrer">기관 홈페이지</a>
        <button type="button" class="btn" @click="emit('focus', item)">지도에서 보기</button>
        <button type="button" class="btn btn--play" @click="playNotice(item)">
          🎮 이 단지로 시뮬레이션
        </button>
      </footer>
    </div>

    <div v-else class="detail__body detail__body--community">
      <CommunityPanel :notice="item" @goto-notice="emit('goto-notice', $event)" />
    </div>
  </aside>
</template>
