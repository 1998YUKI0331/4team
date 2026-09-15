<script setup>
import { computed } from 'vue';
import { CATEGORY_META, REGIONS, SPECIAL_TYPES } from '../lib/notices';
import { activeFilterCount, filters, matchedCount, resetFilters, toggleFilter, ui } from '../stores/app';

defineProps({
  shown: { type: Number, required: true },
  total: { type: Number, required: true },
});

const PRICE_STEPS = [
  { label: '3억 이하', value: 300000000 },
  { label: '5억 이하', value: 500000000 },
  { label: '7억 이하', value: 700000000 },
];

const categories = computed(() => Object.values(CATEGORY_META).filter((c) => c.key !== '기타'));
const specials = computed(() => SPECIAL_TYPES.filter((s) => s !== '일반공급'));

function togglePrice(value) {
  filters.priceMax = filters.priceMax === value ? null : value;
}
</script>

<template>
  <div class="filters">
    <div class="filters__search">
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="9" cy="9" r="5.5" fill="none" stroke="currentColor" stroke-width="1.8" />
        <path d="M13.2 13.2 17 17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      </svg>
      <input v-model="filters.q" placeholder="단지명 · 지역 · 주소 검색" aria-label="검색" />
      <button v-if="filters.q" type="button" class="filters__clear" @click="filters.q = ''">×</button>
    </div>

    <div class="filters__row">
      <button type="button" class="chip" :class="{ 'is-on': filters.openOnly }" @click="filters.openOnly = !filters.openOnly">
        접수중만
      </button>
      <button
        v-for="c in categories"
        :key="c.key"
        type="button"
        class="chip"
        :class="{ 'is-on': filters.categories.includes(c.key) }"
        :style="{ '--chip': c.color }"
        @click="toggleFilter('categories', c.key)"
      >
        <i class="chip__dot" :style="{ background: c.color }" />
        {{ c.label }}
      </button>
      <button
        v-if="ui.matchOn"
        type="button"
        class="chip chip--match"
        :class="{ 'is-on': filters.matchOnly }"
        @click="filters.matchOnly = !filters.matchOnly"
      >
        내 조건 {{ matchedCount }}건만
      </button>
    </div>

    <div class="filters__row">
      <button
        v-for="r in REGIONS"
        :key="r"
        type="button"
        class="chip"
        :class="{ 'is-on': filters.regions.includes(r) }"
        @click="toggleFilter('regions', r)"
      >
        {{ r }}
      </button>
      <span class="filters__sep" />
      <button
        v-for="p in PRICE_STEPS"
        :key="p.value"
        type="button"
        class="chip"
        :class="{ 'is-on': filters.priceMax === p.value }"
        @click="togglePrice(p.value)"
      >
        {{ p.label }}
      </button>
    </div>

    <div class="filters__row">
      <button
        v-for="s in specials"
        :key="s"
        type="button"
        class="chip"
        :class="{ 'is-on': filters.specials.includes(s) }"
        @click="toggleFilter('specials', s)"
      >
        {{ s }}
      </button>
    </div>

    <div class="filters__summary">
      <strong>{{ shown }}</strong
      >건 표시 <span class="muted">/ 전체 {{ total }}건</span>
      <button v-if="activeFilterCount > 0" type="button" class="linkish" @click="resetFilters">
        필터 {{ activeFilterCount }}개 초기화
      </button>
    </div>
  </div>
</template>
