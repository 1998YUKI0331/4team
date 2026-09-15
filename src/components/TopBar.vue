<script setup>
import { computed } from 'vue';
import { NOTICES, GENERATED_AT } from '../lib/notices';
import { matchTierCounts, matchedCount, ui } from '../stores/app';

const openCount = computed(() => NOTICES.filter((n) => n.status === 'open').length);

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

    <div class="topbar__right">
      <span v-if="ui.matchOn" class="topbar__match">
        내 조건 <b>{{ matchedCount }}</b
        >건<span class="topbar__match-detail"> (특별공급 {{ matchTierCounts.special }})</span>
      </span>
      <span class="topbar__ref">기준일 {{ refDate }}</span>
      <label class="topbar__sync">
        <input type="checkbox" v-model="ui.syncMap" />
        지도 영역 안만 목록에 표시
      </label>
    </div>
  </header>
</template>
