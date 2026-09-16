<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue';
import { createGame } from '../game/main.js';
import '../game/game.css';
import { nudge } from '../stores/buddy';
import { ui } from '../stores/app';

/**
 * 청약 로드(3D 시뮬레이션 게임)를 지도 앱 안에 얹는 껍데기.
 *
 * 게임 본체는 바닐라 JS + Three.js 라서 Vue 가 하는 일은 세 가지뿐이다.
 *  1) 게임이 기대하는 마크업을 만들어 두고
 *  2) createGame(root) 로 붙였다가
 *  3) 언마운트 때 destroy() 로 되돌린다.
 *
 * 이 컴포넌트는 App.vue 에서 defineAsyncComponent 로 불린다.
 * Three.js(약 500KB)를 별도 청크로 떼어내, 지도만 쓰는 사용자는 받지 않게 하려는 것.
 */

const rootEl = ref(null);
let game = null;

/**
 * 게임 안의 "새 게임"은 원래 location.reload() 였다. SPA 안에서는 앱 전체가 날아가므로,
 * 대신 인스턴스를 버리고 같은 자리에 새로 만든다.
 */
function restart() {
  game?.destroy();
  game = null;
  // DOM 이 정리된 다음 프레임에 새로 붙인다
  requestAnimationFrame(() => {
    if (rootEl.value) game = mount();
  });
}

const BUDDY_LINES = {
  turn: ['한 달 갔어요!', '다음 달 공고 보는 중!', '시간 흐르는 중…'],
  apply: ['접수 넣었어요!', '두근두근…'],
  win: ['당첨이에요! 🎉', '해냈다!'],
  lose: ['아쉽네요… 다음 기회에!', '괜찮아요, 가점은 쌓여요!'],
  moveIn: ['입주 축하해요! 🏡', '드디어 내 집!'],
};

function onGameEvent(kind) {
  const lines = BUDDY_LINES[kind];
  if (!lines) return;
  nudge(kind === 'win' || kind === 'moveIn' ? 2200 : 1200, lines[Math.floor(Math.random() * lines.length)]);
}

function mount() {
  return createGame(rootEl.value, {
    onRestart: restart,
    onEvent: onGameEvent,
    focus: ui.gameFocus,
  });
}

onMounted(() => {
  game = mount();
  ui.gameFocus = null; // 한 번 쓰고 비운다 — 탭을 다시 열 때 또 끌려가지 않게
});

onBeforeUnmount(() => {
  game?.destroy();
  game = null;
});
</script>

<template>
  <!--
    data-buddy-skip 이 꼭 필요하다.
    금갱이는 모든 button 클릭을 캡처 단계에서 가로채 0.5초 뒤 재생하는데,
    게임은 매 턴 DOM 을 통째로 다시 그리기 때문에 재생 시점엔 그 버튼이 이미 사라져 있다
    (el.isConnected === false → 클릭이 조용히 버려진다).
    그래서 게임 안에서는 클릭 가로채기를 끄고, 대신 위 onGameEvent 로 금갱이를 반응시킨다.
  -->
  <div ref="rootEl" class="game-root" data-buddy-skip>
    <canvas id="stage"></canvas>
    <div id="vignette"></div>

    <header id="hud" class="glass" hidden></header>
    <aside id="status" class="glass panel" hidden></aside>
    <aside id="board" class="panel" hidden></aside>
    <footer id="dock" hidden></footer>

    <div id="tip" hidden></div>

    <div id="cinema" hidden>
      <div class="cinema-bar top"></div>
      <div class="cinema-bar bottom"></div>
      <div id="cinema-text"></div>
      <button id="cinema-skip" type="button">건너뛰기 →</button>
    </div>

    <div id="overlay" hidden></div>
    <div id="toasts"></div>
  </div>
</template>

<style scoped>
/* 게임은 남은 화면을 꽉 채운다. 내부 요소는 game.css 가 .game-root 기준으로 배치한다. */
.game-root {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
</style>
