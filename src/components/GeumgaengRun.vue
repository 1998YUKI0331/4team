<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';

/**
 * 금갱런 — 금갱이를 연속 5번 두드리면 열리는 숨겨진 크롬 공룡런 스타일 미니게임.
 * 스페이스바 / 위 화살표 / 클릭·탭으로 점프해서 장애물을 피한다. 공중에서 한 번 더 눌러 2단 점프도 가능하다.
 */

const emit = defineEmits(['close']);

const canvasRef = ref(null);
const score = ref(0);
const highScore = ref(Number(localStorage.getItem('geumgaengrun-highscore')) || 0);
const status = ref('ready'); // ready | playing | over

const GROUND_Y = 150;
const GRAVITY = 0.0022;
const JUMP_VELOCITY = -0.62;
const PLAYER_X = 46;
const PLAYER_W = 46;
const PLAYER_H = 56;
const FRAME_W = 208;
const FRAME_H = 260;
const FRAME_COUNT = 8;

/** 착지 전까지 쓸 수 있는 점프 횟수(2단 점프). */
const MAX_JUMPS = 2;
const player = { y: GROUND_Y - PLAYER_H, vy: 0, jumpCount: 0 };
let obstacles = [];
let speed = 0.28;
let elapsed = 0;
let spawnTimer = 0;
let nextSpawnGap = 700;

let ctx;
let raf = 0;
let lastTime = 0;

const sprite = new Image();
sprite.src = new URL('../assets/geumgaengi-typing.webp', import.meta.url).href;

function reset() {
  player.y = GROUND_Y - PLAYER_H;
  player.vy = 0;
  player.jumpCount = 0;
  obstacles = [];
  speed = 0.28;
  elapsed = 0;
  spawnTimer = 0;
  nextSpawnGap = 700 + Math.random() * 500;
  score.value = 0;
}

function start() {
  status.value = 'playing';
  reset();
  lastTime = performance.now();
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(loop);
}

function jump() {
  if (status.value !== 'playing') {
    start();
    return;
  }
  if (player.jumpCount < MAX_JUMPS) {
    player.vy = JUMP_VELOCITY;
    player.jumpCount += 1;
  }
}

function endGame() {
  status.value = 'over';
  cancelAnimationFrame(raf);
  const final = Math.floor(elapsed / 100);
  score.value = final;
  if (final > highScore.value) {
    highScore.value = final;
    localStorage.setItem('geumgaengrun-highscore', String(final));
  }
  draw();
}

function loop(now) {
  const dt = Math.min(now - lastTime, 40);
  lastTime = now;
  elapsed += dt;

  player.vy += GRAVITY * dt;
  player.y += player.vy * dt;
  if (player.y >= GROUND_Y - PLAYER_H) {
    player.y = GROUND_Y - PLAYER_H;
    player.vy = 0;
    player.jumpCount = 0;
  }

  speed = 0.28 + Math.min(elapsed / 20000, 0.35);

  spawnTimer += dt;
  if (spawnTimer >= nextSpawnGap) {
    spawnTimer = 0;
    nextSpawnGap = (500 + Math.random() * 700) / (speed / 0.28);
    const h = 28 + Math.random() * 26;
    obstacles.push({ x: canvasRef.value.width, w: 16 + Math.random() * 12, h });
  }

  obstacles.forEach((o) => (o.x -= speed * dt));
  obstacles = obstacles.filter((o) => o.x + o.w > 0);

  const pRect = { x: PLAYER_X + 8, y: player.y + 8, w: PLAYER_W - 16, h: PLAYER_H - 12 };
  for (const o of obstacles) {
    const oRect = { x: o.x, y: GROUND_Y - o.h, w: o.w, h: o.h };
    if (
      pRect.x < oRect.x + oRect.w &&
      pRect.x + pRect.w > oRect.x &&
      pRect.y < oRect.y + oRect.h &&
      pRect.y + pRect.h > oRect.y
    ) {
      endGame();
      return;
    }
  }

  score.value = Math.floor(elapsed / 100);
  draw();
  raf = requestAnimationFrame(loop);
}

function draw() {
  const canvas = canvasRef.value;
  if (!canvas || !ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  ctx.strokeStyle = '#c9c2b6';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y);
  ctx.lineTo(w, GROUND_Y);
  ctx.stroke();

  ctx.fillStyle = '#2f6b4f';
  obstacles.forEach((o) => {
    ctx.fillRect(o.x, GROUND_Y - o.h, o.w, o.h);
  });

  const frame = Math.floor(elapsed / 90) % FRAME_COUNT;
  if (sprite.complete && sprite.naturalWidth) {
    ctx.drawImage(sprite, frame * FRAME_W, 0, FRAME_W, FRAME_H, PLAYER_X, player.y, PLAYER_W, PLAYER_H);
  } else {
    ctx.fillStyle = '#f5b301';
    ctx.fillRect(PLAYER_X, player.y, PLAYER_W, PLAYER_H);
  }
}

/** 닫기는 X 버튼으로만 — 배경 클릭·Esc 로는 닫히지 않는다. */
function onKeydown(e) {
  if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'Spacebar') {
    e.preventDefault();
    jump();
  }
}

onMounted(() => {
  ctx = canvasRef.value.getContext('2d');
  draw();
  window.addEventListener('keydown', onKeydown);
});

onBeforeUnmount(() => {
  cancelAnimationFrame(raf);
  window.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <div class="geumgaengrun" data-buddy-skip role="dialog" aria-modal="true" aria-label="금갱런 미니게임">
    <div class="geumgaengrun__dim" />
    <div class="geumgaengrun__card">
      <button type="button" class="geumgaengrun__close" aria-label="닫기" @click="emit('close')">✕</button>

      <div class="geumgaengrun__score">
        <span>점수 {{ score }}</span>
        <span class="geumgaengrun__best">최고 {{ highScore }}</span>
      </div>

      <canvas
        ref="canvasRef"
        width="600"
        height="200"
        class="geumgaengrun__canvas"
        @click="jump"
        @touchstart.prevent="jump"
      />

      <p v-if="status === 'ready'" class="geumgaengrun__hint">
        스페이스바 · 위 화살표 · 클릭/탭으로 점프! 공중에서 한 번 더 누르면 2단 점프.
      </p>
      <p v-else-if="status === 'over'" class="geumgaengrun__hint">
        게임 종료! 다시 눌러서 재도전하세요.
      </p>
    </div>
  </div>
</template>
