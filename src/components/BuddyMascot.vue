<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { buddyState, nudge, openGeumgaengRun, pickIdleMessage, prefersReducedMotion } from '../stores/buddy';

defineProps({
  /** 상세 패널이 열린 넓은 화면에서는 패널을 피해 왼쪽으로 비켜선다. */
  shifted: { type: Boolean, default: false },
  /** 좁은 화면에서 상세·목록 시트가 덮고 있을 때는 화면 밖으로 잠시 내려간다. */
  tucked: { type: Boolean, default: false },
});

const bubble = computed(() => buddyState.message);
const typing = computed(() => buddyState.animating);

/** 아무도 안 눌러도 혼자 일하고 있는 척 — 7~14초마다 잠깐씩 타자를 친다. */
const idleTimer = ref(null);
function scheduleIdleBurst() {
  const wait = 7000 + Math.random() * 7000;
  idleTimer.value = setTimeout(() => {
    if (!buddyState.animating && !document.hidden) nudge(1400, pickIdleMessage());
    scheduleIdleBurst();
  }, wait);
}

/** 1.5초 안에 5번 두드리면 숨겨진 미니게임 "금갱런" 이 열린다. */
const CLICK_STREAK_WINDOW = 2500;
const CLICK_STREAK_TARGET = 5;
let clickStreak = [];

function poke() {
  const now = Date.now();
  clickStreak = clickStreak.filter((t) => now - t < CLICK_STREAK_WINDOW);
  clickStreak.push(now);
  if (clickStreak.length >= CLICK_STREAK_TARGET) {
    clickStreak = [];
    openGeumgaengRun();
    return;
  }
  nudge(1600, '불렀어요? 열심히 찾는 중이에요!');
}

onMounted(() => {
  if (!prefersReducedMotion()) scheduleIdleBurst();
});
onUnmounted(() => clearTimeout(idleTimer.value));
</script>

<template>
  <div class="buddy" :class="{ 'is-shifted': shifted, 'is-tucked': tucked }" data-buddy-skip>
    <transition name="buddy-bubble">
      <p v-if="bubble" class="buddy__bubble">{{ bubble }}</p>
    </transition>

    <button
      type="button"
      class="buddy__sprite"
      :class="{ 'is-typing': typing }"
      aria-label="금갱이 — 청약 길잡이 캐릭터"
      @click="poke"
    />
  </div>
</template>
