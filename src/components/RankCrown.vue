<script setup>
import { computed } from 'vue';
import { CROWN_COLORS, crownSvg } from '../lib/crown';

const props = defineProps({
  rank: { type: Number, default: null },
  size: { type: Number, default: 14 },
});

const html = computed(() => (props.rank ? crownSvg(props.rank, { size: props.size }) : ''));
const title = computed(() => (props.rank ? `방문 ${CROWN_COLORS[props.rank].label}` : ''));
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html : 상수 마크업(crown.js)만 넣는다 -->
  <span v-if="html" class="crown-wrap" :title="title" v-html="html" />
</template>
