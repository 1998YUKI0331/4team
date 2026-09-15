<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import { formatDate, priceLabel, statusLabelOf } from '../lib/notices';
import { communityStore } from '../stores/community';
import { CROWN_RANKS, RANK_LIMIT, visitStore } from '../stores/visits';
import RankCrown from './RankCrown.vue';

const props = defineProps({
  item: { type: Object, required: true },
  selected: { type: Boolean, default: false },
  match: { type: Object, default: null },
});

const emit = defineEmits(['select']);

const el = ref(null);
const price = computed(() => priceLabel(props.item));
const tags = computed(() => props.item.specialTypes.filter((t) => t !== '일반공급').slice(0, 4));
const postCount = computed(() => communityStore.countFor(props.item.id));

const visits = computed(() => visitStore.countFor(props.item.id));
const rank = computed(() => visitStore.rankOf(props.item.id));
const crownRank = computed(() => (rank.value && rank.value <= CROWN_RANKS ? rank.value : null));
const showRank = computed(() => rank.value && rank.value <= RANK_LIMIT);

/** 지도 마커로 고른 단지가 목록 밖에 있으면 스크롤로 끌어온다. */
watch(
  () => props.selected,
  (on) => {
    if (!on) return;
    nextTick(() => el.value?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  }
);
</script>

<template>
  <article
    ref="el"
    class="card"
    :class="{ 'is-selected': selected, 'is-dimmed': match && !match.ok }"
    :style="{ '--accent': item.color }"
    role="button"
    tabindex="0"
    @click="emit('select', item)"
    @keydown.enter.prevent="emit('select', item)"
    @keydown.space.prevent="emit('select', item)"
  >
    <div class="card__top">
      <span class="badge" :class="`badge--${item.status}`">{{ statusLabelOf(item) }}</span>
      <span class="card__type">{{ item.category }}</span>
      <span v-if="item.agency !== '민간'" class="card__agency">{{ item.agency }}</span>
      <span v-if="match?.ok" class="badge badge--match" :class="`badge--tier-${match.tier}`">{{ match.tierLabel }}</span>
    </div>

    <h3 class="card__title">
      <RankCrown :rank="crownRank" :size="15" />
      {{ item.title }}
    </h3>

    <p class="card__where">
      {{ item.placeLabel }}
      <span v-if="item.address" class="card__addr"> · {{ item.address }}</span>
    </p>

    <p class="card__price">{{ price }}</p>

    <div class="card__foot">
      <span>공고 {{ formatDate(item.announce) }}</span>
      <span>{{ item.deadline ? `마감 ${formatDate(item.deadline)}` : '마감일 미기재' }}</span>
      <span class="card__stats">
        <span v-if="visits" class="card__visits" :class="crownRank ? `is-top-${crownRank}` : null">
          방문 {{ visits }}<template v-if="showRank"> · {{ rank }}위</template>
        </span>
        <span v-if="postCount">💬 {{ postCount }}</span>
      </span>
    </div>

    <div v-if="tags.length" class="chips">
      <span v-for="t in tags" :key="t" class="chip chip--ghost">{{ t }}</span>
    </div>

    <!-- 기존 내집매칭의 "왜 추천되었나요?" 를 그대로 살렸다. -->
    <details v-if="match?.ok" class="why" @click.stop>
      <summary>왜 내 조건에 맞나요?</summary>
      <ul>
        <li v-for="m in match.matched" :key="m.type" :class="{ 'is-uncertain': m.uncertain }">
          <b>{{ m.label }}</b>
          <span>{{ m.note }}</span>
        </li>
      </ul>
    </details>
    <p v-else-if="match?.blockers.length" class="card__blocked">{{ match.blockers[0] }}</p>
  </article>
</template>
