import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export const PALETTE = {
  bg: 0x05070f,
  fog: 0x070a16,
  ground: 0x0a0e1c,
  grid: 0x1b2a4a,
  plate: 0x16203a,
  plateHot: 0x2a3a66,
  rim: 0x4de2ff,
  gold: 0xffc76b,
  neon: 0x7c5cff,
  win: 0x33e39f,
  lose: 0xff5f7e,
};

/**
 * 하나의 WebGL 렌더러 + 컴포저를 공유하고, 장면(Stage)만 교체한다.
 * Stage = { scene, camera, update(dt, t), resize(w,h), onEnter?, onExit? }
 */
export class SceneManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = false;

    this.clock = new THREE.Clock();
    this.stages = new Map();
    this.active = null;
    this._raf = null;
    this._shake = { amount: 0, decay: 4 };
    this._listeners = [];

    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    // threshold 가 낮으면 라벨·창문 같은 밝은 UI 요소까지 전부 번져서
    // 화면이 하얗게 날아간다. 실제로 확인하고 올려 잡은 값.
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.55, 0.52);
    this.output = new OutputPass();
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.output);

    this._onResize = () => this.resize();
    addEventListener('resize', this._onResize);

    // CSS 적용 전에는 부모 크기가 0일 수 있다 → 레이아웃이 잡힌 뒤 다시 맞춘다
    this.resize();
    requestAnimationFrame(() => this.resize());
    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(() => this.resize());
      this._ro.observe(canvas.parentElement ?? document.body);
    }
  }

  register(name, stage) {
    this.stages.set(name, stage);
    if (stage.resize) stage.resize(this.width, this.height);
    return stage;
  }

  setActive(name) {
    const next = this.stages.get(name);
    if (!next || next === this.active) return next;
    if (this.active?.onExit) this.active.onExit();
    this.active = next;
    this.renderPass.scene = next.scene;
    this.renderPass.camera = next.camera;
    if (next.onEnter) next.onEnter();
    if (next.resize) next.resize(this.width, this.height);
    return next;
  }

  setBloom(strength, radius, threshold) {
    this.bloom.strength = strength;
    if (radius !== undefined) this.bloom.radius = radius;
    if (threshold !== undefined) this.bloom.threshold = threshold;
  }

  shake(amount = 0.6, decay = 4) {
    this._shake.amount = Math.max(this._shake.amount, amount);
    this._shake.decay = decay;
  }

  onFrame(fn) { this._listeners.push(fn); return () => { this._listeners = this._listeners.filter((f) => f !== fn); }; }

  resize() {
    const parent = this.canvas.parentElement ?? document.body;
    const w = Math.max(2, parent.clientWidth || innerWidth || 2);
    const h = Math.max(2, parent.clientHeight || innerHeight || 2);
    if (w === this.width && h === this.height) return;
    this.width = w; this.height = h;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
    for (const stage of this.stages.values()) stage.resize?.(w, h);
  }

  start() {
    if (this._raf) return;
    const loop = () => {
      this._raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, this.clock.getDelta());
      const t = this.clock.elapsedTime;

      for (const fn of this._listeners) fn(dt, t);
      this.active?.update?.(dt, t);

      // 카메라 흔들림
      if (this._shake.amount > 0.001 && this.active) {
        const cam = this.active.camera;
        if (!cam.userData._basePos) cam.userData._basePos = cam.position.clone();
        const a = this._shake.amount;
        cam.position.x += (Math.random() - 0.5) * a;
        cam.position.y += (Math.random() - 0.5) * a;
        cam.position.z += (Math.random() - 0.5) * a;
        this._shake.amount -= this._shake.decay * dt * this._shake.amount + 0.002;
        if (this._shake.amount < 0.001) this._shake.amount = 0;
      }

      this.composer.render();
    };
    loop();
  }

  stop() { if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; } }

  dispose() {
    this.stop();
    removeEventListener('resize', this._onResize);
    this._ro?.disconnect();
    this.renderer.dispose();
  }
}

/* ───────────────────────── 공용 유틸 ───────────────────────── */

export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutBack = (t) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
export const easeOutElastic = (t) => {
  const c4 = (2 * Math.PI) / 3;
  return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
};

/** 간단한 트윈 러너 */
export class Tweener {
  constructor() { this.items = []; }
  add(duration, onUpdate, { delay = 0, ease = easeOutCubic, onDone } = {}) {
    const item = { t: -delay, duration, onUpdate, ease, onDone, done: false };
    this.items.push(item);
    return item;
  }
  update(dt) {
    for (const it of this.items) {
      if (it.done) continue;
      it.t += dt;
      if (it.t < 0) continue;
      const k = Math.min(1, it.t / it.duration);
      it.onUpdate(it.ease(k), k);
      if (k >= 1) { it.done = true; it.onDone?.(); }
    }
    if (this.items.length > 80) this.items = this.items.filter((i) => !i.done);
  }
  clear() { this.items.length = 0; }
}

/** 창문이 켜진 아파트 외벽 텍스처를 절차적으로 생성 */
export function makeFacadeTexture(seedRng, { cols = 10, rows = 26, lit = 0.42, warm = true } = {}) {
  const cw = 8, ch = 10;
  const canvas = document.createElement('canvas');
  canvas.width = cols * cw;
  canvas.height = rows * ch;
  const g = canvas.getContext('2d');

  g.fillStyle = '#0d1426';
  g.fillRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const on = seedRng() < lit;
      if (on) {
        const v = 0.62 + seedRng() * 0.38;
        g.fillStyle = warm
          ? `rgba(${Math.round(255 * v)}, ${Math.round(206 * v)}, ${Math.round(140 * v)}, 1)`
          : `rgba(${Math.round(150 * v)}, ${Math.round(226 * v)}, ${Math.round(255 * v)}, 1)`;
      } else {
        g.fillStyle = `rgba(28, 40, 66, 1)`;
      }
      g.fillRect(x * cw + 1.5, y * ch + 2, cw - 3, ch - 4.5);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

/** 텍스트 라벨 스프라이트 */
export function makeLabel(text, { color = '#eaf2ff', bg = 'rgba(8,12,24,0.82)', size = 44, accent = null } = {}) {
  const pad = 18;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const font = `600 ${size}px "Pretendard", "Noto Sans KR", system-ui, sans-serif`;
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + pad * 2;
  const h = size + pad * 1.5;
  canvas.width = w; canvas.height = h;

  const c = canvas.getContext('2d');
  c.font = font;
  c.fillStyle = bg;
  roundRect(c, 0, 0, w, h, 12);
  c.fill();
  if (accent) {
    c.fillStyle = accent;
    roundRect(c, 0, 0, 5, h, 3);
    c.fill();
  }
  c.fillStyle = color;
  c.textBaseline = 'middle';
  c.fillText(text, pad, h / 2 + 1);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(w / h, 1, 1);
  sprite.userData.aspect = w / h;
  return sprite;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
