<script setup>
import { computed } from 'vue';
import { NOTICES, GENERATED_AT } from '../lib/notices';
import { matchTierCounts, matchedCount, ui } from '../stores/app';
import { scheduleStore } from '../stores/schedule';

const openCount = computed(() => NOTICES.filter((n) => n.status === 'open').length);
const savedCount = computed(() => scheduleStore.ids.value.length);

const refDate = computed(() => {
  const d = GENERATED_AT ? new Date(GENERATED_AT) : new Date();
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
});
</script>

<template>
  <header class="topbar">
    <div class="topbar__brand">
      <span class="topbar__logo" aria-hidden="true">
        <svg viewBox="0 0 16 16">
          <path d="M1.6 14.6V6.1L8 1.8l6.4 4.3v8.5H9.7v-3.4H6.3v3.4H1.6z" fill="currentColor" />
        </svg>
      </span>
      <div>
        <strong>청약지도</strong>
        <span>수도권 분양·임대 공고 {{ NOTICES.length }}건 · 접수중 {{ openCount }}건</span>
      </div>
    </div>

    <nav class="topbar__tabs" aria-label="화면 전환">
      <button
        type="button"
        :class="{ 'is-on': ui.view === 'map' }"
        :aria-current="ui.view === 'map' ? 'page' : undefined"
        @click="ui.view = 'map'"
      >
        🗺 청약지도
      </button>
      <button
        type="button"
        :class="{ 'is-on': ui.view === 'game' }"
        :aria-current="ui.view === 'game' ? 'page' : undefined"
        @click="ui.view = 'game'"
      >
        🎮 청약 로드
      </button>
    </nav>

    <div class="topbar__right">
      <!-- 목록·지도에만 해당하는 컨트롤은 게임 탭에서 감춘다 -->
      <span v-if="ui.matchOn && ui.view === 'map'" class="topbar__match">
        내 조건 <b>{{ matchedCount }}</b
        >건<span class="topbar__match-detail"> (특별공급 {{ matchTierCounts.special }})</span>
      </span>
      <button type="button" class="topbar__calendar" @click="ui.calendarOpen = true">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M4.5 1.5v1.6h7V1.5H13a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1h1.5Zm-1.5 4.4v7.1h10V5.9H3Z"
            fill="currentColor"
          />
        </svg>
        캘린더
        <i v-if="savedCount">{{ savedCount }}</i>
      </button>
      <span class="topbar__ref">기준일 {{ refDate }}</span>
      <label v-if="ui.view === 'map'" class="topbar__sync">
        <input type="checkbox" v-model="ui.syncMap" />
        지도 영역 안만 목록에 표시
      </label>
    </div>
  </header>
</template>
