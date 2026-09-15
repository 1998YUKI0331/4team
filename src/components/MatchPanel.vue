<script setup>
import { computed } from 'vue';
import { baselineIncome, DEFAULT_PROFILE, incomePercent, MARITAL_OPTIONS } from '../lib/matching';
import { filters, matchTierCounts, matchedCount, matches, profile, ui } from '../stores/app';
import { NOTICES } from '../lib/notices';

const pct = computed(() => incomePercent(profile));
const base = computed(() => baselineIncome(profile.household));

/** 접었을 때 머리글에 남기는 한 줄 요약 */
const summary = computed(() => {
  if (!ui.matchOn) return '꺼짐 · 펼쳐서 조건 입력';
  return `${matchedCount.value}건 충족 · 특별공급 ${matchTierCounts.value.special}건`;
});

/** 조건에 막힌 사유를 한 줄 요약으로 (많이 걸리는 순서대로) */
const topBlockers = computed(() => {
  if (!matches.value) return [];
  const count = new Map();
  for (const r of matches.value.values()) {
    if (r.ok) continue;
    const reason = r.blockers[0] ?? r.missed[0]?.reason ?? '해당 유형 없음';
    count.set(reason, (count.get(reason) ?? 0) + 1);
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
});

function reset() {
  Object.assign(profile, DEFAULT_PROFILE);
}
</script>

<template>
  <section class="matchbar" :class="{ 'is-open': ui.matchOpen, 'is-active': ui.matchOn }">
    <button
      type="button"
      class="matchbar__head"
      :aria-expanded="ui.matchOpen"
      aria-controls="matchbar-body"
      @click="ui.matchOpen = !ui.matchOpen"
    >
      <b>내 조건 필터</b>
      <span class="matchbar__summary">{{ summary }}</span>
      <svg class="matchbar__chevron" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M4 6.5 8 10.5 12 6.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      </svg>
    </button>

    <div v-show="ui.matchOpen" id="matchbar-body" class="matchpanel">
      <label class="matchpanel__switch">
        <input type="checkbox" v-model="ui.matchOn" />
        <span>
          <b>내 조건으로 자격 확인</b>
          <em>켜면 목록·지도에 내 조건 충족 여부가 표시됩니다</em>
        </span>
      </label>

      <div class="field">
        <label for="mp-marital">혼인 상태</label>
        <select id="mp-marital" v-model="profile.marital">
          <option v-for="o in MARITAL_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
      </div>

      <div class="field-row">
        <div class="field">
          <label for="mp-age">만 나이</label>
          <input id="mp-age" type="number" min="19" max="90" inputmode="numeric" v-model.number="profile.age" />
        </div>
        <div class="field">
          <label for="mp-household">가구원 수</label>
          <input
            id="mp-household"
            type="number"
            min="1"
            max="8"
            inputmode="numeric"
            v-model.number="profile.household"
          />
        </div>
      </div>

      <div class="field-row">
        <div class="field">
          <label for="mp-children">자녀 수</label>
          <input id="mp-children" type="number" min="0" max="6" inputmode="numeric" v-model.number="profile.children" />
        </div>
        <div class="field">
          <label for="mp-sub">청약통장 가입</label>
          <div class="unit">
            <input id="mp-sub" type="number" min="0" max="480" inputmode="numeric" v-model.number="profile.subMonths" />
            <span>개월</span>
          </div>
        </div>
      </div>

      <div class="field">
        <label for="mp-income">가구 월평균소득</label>
        <div class="unit">
          <input id="mp-income" type="number" min="0" step="10" inputmode="numeric" v-model.number="profile.income" />
          <span>만원</span>
        </div>
        <p class="field__hint">
          세전 · 배우자 포함 · {{ profile.household }}인 기준 {{ base.toLocaleString() }}만원 대비
          <b :class="pct > 160 ? 'is-over' : 'is-ok'">{{ pct }}%</b>
        </p>
      </div>

      <fieldset class="checks">
        <legend>해당 사항</legend>
        <label><input type="checkbox" v-model="profile.noHouse" /> 현재 무주택자다</label>
        <label><input type="checkbox" v-model="profile.firstHome" /> 생애 최초로 주택을 구입한다</label>
        <label><input type="checkbox" v-model="profile.newborn" /> 2년 이내 출생한 자녀가 있다</label>
        <label>
          <input type="checkbox" v-model="profile.parentSupport" /> 만 65세 이상 직계존속을 3년 이상 부양 중이다
        </label>
      </fieldset>

      <div v-if="ui.matchOn" class="matchpanel__result">
        <p class="matchpanel__count">
          전체 {{ NOTICES.length }}건 중 <b>{{ matchedCount }}</b
          >건 신청 가능
        </p>
        <p class="matchpanel__tiers">
          특별공급 {{ matchTierCounts.special }}건 · 확인 필요 {{ matchTierCounts.check }}건 · 일반공급만
          {{ matchTierCounts.general }}건
        </p>
        <label class="matchpanel__only">
          <input type="checkbox" v-model="filters.matchOnly" />
          목록·지도에 충족 공고만 보기
        </label>
        <ul v-if="topBlockers.length" class="matchpanel__blockers">
          <li v-for="[reason, n] in topBlockers" :key="reason">
            {{ reason }} <span>{{ n }}건</span>
          </li>
        </ul>
        <button type="button" class="linkish" @click="reset">기본값으로 되돌리기</button>
      </div>
      <p v-else class="matchpanel__hint">
        조건을 켜면 {{ NOTICES.length }}건을 한 번에 훑어 자격을 표시합니다.
        <button type="button" class="linkish" @click="reset">기본값</button>
      </p>

      <p class="notice-tip">
        공고문 요약값 기준이라 실제 심사와 다를 수 있어요. 자동 확인이 안 되는 유형은 <b>확인 필요</b>로 표시합니다.
      </p>
    </div>
  </section>
</template>
