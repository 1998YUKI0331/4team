import * as THREE from 'three';
import { PALETTE, Tweener, easeOutCubic, easeInOutCubic, easeOutBack, makeLabel } from './scene.js';
import { Confetti, Shockwave, Sparks, makeNumberTexture } from './fx.js';
import { Complex } from './tower.js';

const DRUM_R = 4.2;
const DRUM_Y = 2.6;
const BALL_R = 0.3;
const MAX_BALLS = 84;

const BALL_COLORS = [0x4de2ff, 0x7c5cff, 0xff8fb0, 0x7ef0c4, 0xffd98a, 0xa9b8ff];

const BASE_Y = -1.5;
const BASE_RING_Y = -0.42;

/* 커트라인 게이지 배치 — 카메라 화각(48°) 안에 40개 막대와 양끝 라벨이 다 들어오도록 잡은 값 */
const GAUGE_Y = -3.3;
const GAUGE_STEP = 0.28;
const GAUGE_MY_X = 6.3;

/**
 * 청약 추첨 연출 스테이지.
 *  spin → eject → reveal → verdict
 * 가점제일 때는 경쟁자 점수 분포 게이지가 함께 올라온다.
 */
export class LotteryStage {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x03050c);
    this.scene.fog = new THREE.FogExp2(0x03050c, 0.016);

    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 300);
    this.camera.position.set(0, 3.2, 15.5);
    this.camera.lookAt(0, 2.4, 0);

    this.tweener = new Tweener();
    this.phase = 'idle';
    this.onPhase = null;
    this.t = 0;

    this._buildLights();
    this._buildStage();
    this._buildDrum();
    this._buildBalls();
    this._collectDrumMaterials();   // 공까지 포함해서 모아야 드럼이 통째로 사라진다
    this.drumK = 1;
    this._buildRevealBall();
    this._buildGauge();
    this._buildFx();
    this._buildResultComplex();
  }

  /* ───────────────── 구성 ───────────────── */

  _buildLights() {
    this.scene.add(new THREE.AmbientLight(0x3a4a7a, 0.7));
    const key = new THREE.SpotLight(0xffffff, 140, 60, 0.6, 0.45, 1.4);
    key.position.set(0, 16, 8);
    this.scene.add(key);
    this.keyLight = key;

    const back = new THREE.PointLight(0x7c5cff, 90, 40);
    back.position.set(-8, 6, -8);
    this.scene.add(back);

    this.winLight = new THREE.PointLight(0xffc76b, 0, 50);
    this.winLight.position.set(0, 4, 3);
    this.scene.add(this.winLight);
  }

  _buildStage() {
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(30, 64),
      new THREE.MeshStandardMaterial({ color: 0x080c18, roughness: 0.42, metalness: 0.55 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -2.6;
    this.scene.add(floor);

    const grid = new THREE.GridHelper(60, 40, 0x1b2a4a, 0x0d1730);
    grid.position.y = -2.58;
    grid.material.transparent = true;
    grid.material.opacity = 0.5;
    this.scene.add(grid);

    // 받침대
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(2.3, 3.0, 2.2, 32),
      new THREE.MeshStandardMaterial({ color: 0x141c33, roughness: 0.45, metalness: 0.6 })
    );
    base.position.y = BASE_Y;
    this.scene.add(base);
    this.base = base;

    const baseRing = new THREE.Mesh(
      new THREE.TorusGeometry(2.32, 0.06, 8, 64),
      new THREE.MeshBasicMaterial({ color: PALETTE.rim })
    );
    baseRing.rotation.x = Math.PI / 2;
    baseRing.position.y = BASE_RING_Y;
    this.scene.add(baseRing);
    this.baseRing = baseRing;
  }

  _buildDrum() {
    this.drum = new THREE.Group();
    this.drum.position.y = DRUM_Y;
    this.scene.add(this.drum);

    const glass = new THREE.Mesh(
      new THREE.SphereGeometry(DRUM_R, 40, 28),
      new THREE.MeshPhysicalMaterial({
        color: 0x8fd6ff,
        transparent: true,
        opacity: 0.12,
        roughness: 0.05,
        metalness: 0,
        transmission: 0.65,
        thickness: 0.6,
        side: THREE.DoubleSide,
      })
    );
    this.drum.add(glass);

    // 경선/위선 프레임
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x2c3c66, roughness: 0.3, metalness: 0.85,
      emissive: new THREE.Color(0x0e2a52), emissiveIntensity: 0.8,
    });
    for (let i = 0; i < 6; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(DRUM_R, 0.045, 8, 64), frameMat);
      ring.rotation.y = (i / 6) * Math.PI;
      this.drum.add(ring);
    }
    for (const [r, y] of [[DRUM_R * 0.86, DRUM_R * 0.5], [DRUM_R * 0.86, -DRUM_R * 0.5], [DRUM_R, 0]]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.045, 8, 64), frameMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = y;
      this.drum.add(ring);
    }

    // 배출관 — 받침대에 파묻히지 않도록 드럼 앞아래로 기울여 낸다.
    // 드럼 그룹에 넣어서 드럼이 물러날 때 같이 사라지게 한다.
    const chute = new THREE.Mesh(
      new THREE.CylinderGeometry(0.46, 0.52, 1.6, 16, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0x3a4d7a, roughness: 0.3, metalness: 0.8, side: THREE.DoubleSide,
      })
    );
    chute.rotation.x = -Math.PI * 0.32;
    chute.position.set(0, -DRUM_R * 0.66, DRUM_R * 0.62);
    this.drum.add(chute);
  }

  /**
   * 드럼(유리·프레임·공·배출관)을 통째로 페이드아웃시키기 위한 머티리얼 수집.
   * 이게 없으면 추첨이 끝난 뒤에도 드럼이 번호공·게이지·결과 단지를 전부 가린다.
   */
  _collectDrumMaterials() {
    this.drumMats = [];
    for (const root of [this.drum, this.base, this.baseRing]) {
      root.traverse((o) => {
        const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
        for (const m of mats) {
          if (this.drumMats.includes(m)) continue;
          m.__baseOpacity = m.opacity ?? 1;
          m.__wasTransparent = !!m.transparent;
          this.drumMats.push(m);
        }
      });
    }
  }

  /** k = 1 이면 제자리, 0 이면 드럼은 위로·받침대는 아래로 물러나며 사라진다 */
  _setDrumVisibility(k) {
    this.drumK = k;
    const fading = k < 0.999;
    for (const m of this.drumMats) {
      const want = fading || m.__wasTransparent;
      if (m.transparent !== want) { m.transparent = want; m.needsUpdate = true; }
      m.opacity = m.__baseOpacity * k;
    }
    this.drum.position.y = DRUM_Y + (1 - k) * 9;
    this.drum.visible = k > 0.004;

    // 받침대를 남겨두면 커트라인 게이지 한가운데를 가린다
    const sink = (1 - k) * 6;
    this.base.position.y = BASE_Y - sink;
    this.baseRing.position.y = BASE_RING_Y - sink;
    this.base.visible = this.baseRing.visible = k > 0.004;
  }

  _buildBalls() {
    const geo = new THREE.SphereGeometry(BALL_R, 14, 12);
    const mat = new THREE.MeshStandardMaterial({
      roughness: 0.28, metalness: 0.12,
      emissive: new THREE.Color(0x101828), emissiveIntensity: 0.5,
    });
    this.balls = new THREE.InstancedMesh(geo, mat, MAX_BALLS);
    this.balls.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_BALLS * 3), 3);
    this.balls.frustumCulled = false;
    this.drum.add(this.balls);

    this.bp = new Float32Array(MAX_BALLS * 3);
    this.bv = new Float32Array(MAX_BALLS * 3);
    this.ballCount = 0;
    this._m = new THREE.Matrix4();
    this._v = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3(1, 1, 1);
    this._c = new THREE.Color();
  }

  _buildRevealBall() {
    this.revealBall = new THREE.Mesh(
      new THREE.SphereGeometry(0.92, 40, 28),
      new THREE.MeshStandardMaterial({
        color: 0xffffff, roughness: 0.22, metalness: 0.1,
        emissive: new THREE.Color(0x000000), emissiveIntensity: 1,
      })
    );
    this.revealBall.visible = false;
    this.scene.add(this.revealBall);

    this.revealHalo = new THREE.Mesh(
      new THREE.TorusGeometry(1.5, 0.05, 10, 64),
      new THREE.MeshBasicMaterial({ color: PALETTE.gold, transparent: true, opacity: 0 })
    );
    this.revealHalo.visible = false;
    this.scene.add(this.revealHalo);
  }

  /** 경쟁자 점수 분포 + 커트라인 게이지 */
  _buildGauge() {
    this.gauge = new THREE.Group();
    // 드럼 뒤가 아니라 앞아래. 뒤에 두면 드럼·받침대에 가려 한 번도 보이지 않는다.
    this.gauge.position.set(0, GAUGE_Y, 0.5);
    this.gauge.visible = false;
    this.scene.add(this.gauge);

    this.gaugeBars = [];
    const barGeo = new THREE.BoxGeometry(0.24, 1, 0.24);
    barGeo.translate(0, 0.5, 0);
    for (let i = 0; i < 40; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0x2b3c66, roughness: 0.5, metalness: 0.3,
        emissive: new THREE.Color(0x14213f), emissiveIntensity: 0.8,
      });
      const bar = new THREE.Mesh(barGeo, mat);
      bar.position.x = (i - 19.5) * GAUGE_STEP;
      bar.scale.y = 0.01;
      this.gauge.add(bar);
      this.gaugeBars.push(bar);
    }

    this.cutPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 0.055),
      new THREE.MeshBasicMaterial({ color: 0xff6b8a, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
    );
    this.gauge.add(this.cutPlane);

    this.myBar = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 1, 0.4),
      new THREE.MeshStandardMaterial({
        color: PALETTE.gold, emissive: new THREE.Color(PALETTE.gold), emissiveIntensity: 1.4,
        roughness: 0.3, metalness: 0.2,
      })
    );
    this.myBar.geometry.translate(0, 0.5, 0);
    this.myBar.scale.y = 0.01;
    this.gauge.add(this.myBar);

    this.cutLabel = makeLabel('커트라인', { accent: '#ff6b8a', size: 36 });
    this.cutLabel.scale.set(this.cutLabel.userData.aspect * 0.7, 0.7, 1);
    this.gauge.add(this.cutLabel);

    this.myLabel = makeLabel('내 점수', { accent: '#ffc76b', size: 36 });
    this.myLabel.scale.set(this.myLabel.userData.aspect * 0.7, 0.7, 1);
    this.gauge.add(this.myLabel);
  }

  _buildFx() {
    this.confetti = new Confetti(460);
    this.scene.add(this.confetti.mesh);
    this.shock = new Shockwave(PALETTE.gold);
    this.scene.add(this.shock.mesh);
    this.sparks = new Sparks(260, PALETTE.gold);
    this.scene.add(this.sparks.points);
  }

  _buildResultComplex() {
    this.resultHolder = new THREE.Group();
    this.resultHolder.position.set(0, -2.6, -3);
    this.resultHolder.visible = false;
    this.scene.add(this.resultHolder);
    this.resultComplex = null;
  }

  /* ───────────────── 세팅 ───────────────── */

  /**
   * @param ctx { notice, supplyType, unitType, odds, result }
   */
  setup(ctx) {
    this.ctx = ctx;
    this.phase = 'idle';
    this.t = 0;
    this.spin = 0;
    this.tweener.clear();

    // 공 수 = 경쟁률에 비례
    const n = Math.round(THREE.MathUtils.clamp(ctx.odds.ratio * 4 + 12, 14, MAX_BALLS));
    this.ballCount = n;
    for (let i = 0; i < MAX_BALLS; i++) {
      const i3 = i * 3;
      if (i < n) {
        const r = Math.random() * (DRUM_R - BALL_R * 2.4);
        const a = Math.random() * Math.PI * 2;
        const e = Math.acos(2 * Math.random() - 1);
        this.bp[i3] = r * Math.sin(e) * Math.cos(a);
        this.bp[i3 + 1] = r * Math.cos(e);
        this.bp[i3 + 2] = r * Math.sin(e) * Math.sin(a);
        this.bv[i3] = (Math.random() - 0.5) * 3;
        this.bv[i3 + 1] = (Math.random() - 0.5) * 3;
        this.bv[i3 + 2] = (Math.random() - 0.5) * 3;
        this._c.setHex(BALL_COLORS[i % BALL_COLORS.length]);
      } else {
        this.bp[i3] = 0; this.bp[i3 + 1] = -999; this.bp[i3 + 2] = 0;
        this._c.setHex(0x000000);
      }
      this.balls.setColorAt(i, this._c);
    }
    this.balls.instanceColor.needsUpdate = true;
    this.balls.count = MAX_BALLS;

    // 내 공 = 0번, 금색
    this._c.setHex(0xffc76b);
    this.balls.setColorAt(0, this._c);
    this.balls.instanceColor.needsUpdate = true;

    // 리빌 볼 텍스처
    const win = ctx.result.win;
    const tex = makeNumberTexture(ctx.result.drawnNumber, {
      bg: win ? '#ffc76b' : '#5f6d8c',
      fg: win ? '#241703' : '#0e1424',
    });
    this.revealBall.material.map?.dispose();
    this.revealBall.material.map = tex;
    this.revealBall.material.emissiveMap = tex;
    this.revealBall.material.emissive.setHex(win ? 0x7a5410 : 0x0a0f1c);
    this.revealBall.material.needsUpdate = true;
    this.revealBall.visible = false;
    this.revealBall.scale.setScalar(1);
    this.revealBall.rotation.set(0, 0, 0);
    this.revealBall.material.emissiveIntensity = 1;
    this.revealBall.position.set(0, -0.6, 3.3);

    this.revealHalo.visible = false;
    this.revealHalo.material.opacity = 0;
    this.winLight.intensity = 0;

    // 지난 판에서 물러나 있던 드럼을 제자리로
    this._setDrumVisibility(1);

    // 게이지
    const showGauge = ctx.odds.mode !== '추첨제' && ctx.odds.cutline != null;
    this.gauge.visible = false;
    this._gaugeReady = showGauge;
    if (showGauge) {
      const maxScore = ctx.odds.mode === '가점제' ? 84 : 100;
      const sample = ctx.result.sample.slice(0, 40);
      this._gaugeData = {
        sample, maxScore,
        cut: ctx.result.finalCutline ?? ctx.odds.cutline,
        my: ctx.odds.myScore ?? 0,
        k: maxScore > 0 ? 3.6 / maxScore : 0.04,
      };
    }

    // 결과 단지
    if (this.resultComplex) {
      this.resultHolder.remove(this.resultComplex.group);
      this.resultComplex.dispose();
    }
    this.resultComplex = new Complex({
      seed: `${ctx.notice.id}-result`,
      units: ctx.notice.units,
      tier: ctx.notice.district.tier,
      warm: true,
    });
    this.resultComplex.group.scale.setScalar(0.95);
    this.resultHolder.add(this.resultComplex.group);
    this.resultComplex.setBuild(0);
    this.resultComplex.setLight(0);
    this.resultHolder.visible = false;

    this.confetti.active = false;
    this.confetti.mesh.visible = false;

    this.camera.position.set(0, 3.4, 15.5);
    this.camera.lookAt(0, 2.6, 0);
    this._camTarget = new THREE.Vector3(0, 2.6, 0);
  }

  /* ───────────────── 진행 ───────────────── */

  play() {
    return new Promise((resolve) => {
      this._resolve = resolve;
      this._setPhase('spin');
    });
  }

  _setPhase(p) {
    this.phase = p;
    this.t = 0;
    this.onPhase?.(p, this.ctx);

    if (p === 'spin') {
      this._setDrumVisibility(1);
      this.tweener.add(2.4, (k) => { this.spinTarget = 1.2 + k * 9; });
      this._camMove(new THREE.Vector3(3.6, 4.2, 12.2), new THREE.Vector3(0, DRUM_Y, 0), 2.4);
    }
    if (p === 'eject') {
      // 배출관 끝에서 공이 굴러 나와 카메라 쪽으로 떠오른다
      const from = new THREE.Vector3(0, -0.6, 3.3);
      const to = new THREE.Vector3(0, 0.1, 5.4);
      this.revealBall.visible = true;
      this.revealBall.scale.setScalar(0.25);
      this.revealBall.position.copy(from);
      this._camMove(new THREE.Vector3(0, 0.9, 11.6), new THREE.Vector3(0, 0.1, 3.4), 1.1);
      this.tweener.add(1.1, (k) => {
        this.revealBall.scale.setScalar(0.25 + k * 0.85);
        this.revealBall.position.lerpVectors(from, to, k);
        this.spinTarget = 10 * (1 - k * 0.8);
      }, { ease: easeOutCubic });
    }
    if (p === 'reveal') {
      // 드럼을 위로 물려 치운다 — 그래야 번호공·커트라인 게이지가 보인다
      this.tweener.add(0.9, (k) => this._setDrumVisibility(1 - k), { ease: easeInOutCubic });

      const from = this.revealBall.position.clone();
      const to = new THREE.Vector3(0, 1.4, 3.2);
      this.tweener.add(1.0, (k) => this.revealBall.position.lerpVectors(from, to, k), { ease: easeOutCubic });

      if (this._gaugeReady) {
        this.gauge.visible = true;
        this.gauge.position.set(0, GAUGE_Y, 0.5);
        this._animateGauge();
        this._camMove(new THREE.Vector3(0, 1.1, 12.4), new THREE.Vector3(0, -0.7, 1.2), 1.0);
      } else {
        this._camMove(new THREE.Vector3(0, 1.5, 8.4), new THREE.Vector3(0, 1.2, 2.4), 1.0);
      }
      this.shock.fire(new THREE.Vector3(0, 0.1, 3.2), {
        max: 12, duration: 1.0, color: this.ctx.result.win ? PALETTE.gold : 0x445070,
      });
    }
    if (p === 'verdict') {
      const win = this.ctx.result.win;
      if (win) {
        this.revealHalo.visible = true;
        this.confetti.burst(new THREE.Vector3(0, 6, 3), 1.25);
        this.sparks.burst(new THREE.Vector3(0, 1.2, 3), 1.2);
        this.shock.fire(new THREE.Vector3(0, -2.5, -2), { max: 26, duration: 1.4, color: PALETTE.gold });

        // 당첨공은 위로 비켜주고, 그 아래에서 단지가 올라온다
        const from = this.revealBall.position.clone();
        const to = new THREE.Vector3(0, 8.6, 4.5);
        this.tweener.add(2.2, (k) => this.revealBall.position.lerpVectors(from, to, k), { ease: easeInOutCubic });
        this._sinkGauge(2.0);

        this.resultHolder.visible = true;
        this.tweener.add(2.2, (k) => {
          this.resultComplex.setBuild(k);
          this.resultComplex.setLight(k * 1.3);
          this.winLight.intensity = 60 + 120 * k;
        }, { ease: easeOutCubic });
        this._camMove(new THREE.Vector3(0, 4.2, 18.5), new THREE.Vector3(0, 3.4, -3), 2.2);
      } else {
        // 낙첨 — 공은 가라앉고, 커트라인 게이지는 남겨서 "왜 떨어졌는지"를 보여준다
        this._camMove(
          new THREE.Vector3(0, 0.6, this._gaugeReady ? 12.4 : 8.6),
          new THREE.Vector3(0, this._gaugeReady ? -1.0 : 0.4, 1.6), 1.6,
        );
        const from = this.revealBall.position.clone();
        this.tweener.add(1.6, (k) => {
          this.revealBall.position.set(from.x, from.y - k * 2.2, from.z);
          this.revealBall.material.emissiveIntensity = 1 - k;
          this.revealBall.rotation.x += 0.02;
        }, { ease: easeOutCubic });
      }
      this.tweener.add(win ? 2.6 : 1.9, () => {}, {
        onDone: () => { this._setPhase('done'); },
      });
    }
    if (p === 'done') this._resolve?.(this.ctx.result);
  }

  _animateGauge() {
    const d = this._gaugeData;
    if (!d) return;
    this.gaugeBars.forEach((bar, i) => {
      const v = d.sample[i] ?? 0;
      const h = Math.max(0.02, v * d.k);
      bar.scale.y = 0.01;
      const win = this.ctx.result.win;
      const under = v < d.cut;
      bar.material.color.setHex(under ? 0x263454 : 0x3c5a95);
      this.tweener.add(0.55, (k) => { bar.scale.y = 0.01 + h * k; },
        { delay: 0.16 + i * 0.012, ease: easeOutCubic });
    });

    const cutY = d.cut * d.k;
    this.cutPlane.position.set(0, cutY, 0);
    this.cutLabel.position.set(-GAUGE_MY_X - 0.6, cutY + 0.3, 0.4);

    const myH = Math.max(0.02, d.my * d.k);
    this.myBar.position.set(GAUGE_MY_X, 0, 0);
    this.myLabel.position.set(GAUGE_MY_X, 0.4, 0.4);
    this.tweener.add(1.05, (k) => {
      this.myBar.scale.y = 0.01 + myH * k;
      this.myLabel.position.y = myH * k + 0.5;
    }, { delay: 0.7, ease: easeOutCubic });
  }

  /** 당첨 연출에서 결과 단지가 올라올 자리를 비워준다 */
  _sinkGauge(dur = 2.0) {
    if (!this.gauge.visible) return;
    const fromY = this.gauge.position.y;
    this.tweener.add(dur, (k) => {
      this.gauge.position.y = fromY - k * 7;
    }, { ease: easeInOutCubic, onDone: () => { this.gauge.visible = false; } });
  }

  _camMove(pos, look, dur) {
    const fromP = this.camera.position.clone();
    const fromT = this._camTarget.clone();
    this.tweener.add(dur, (k) => {
      this.camera.position.lerpVectors(fromP, pos, k);
      this._camTarget.lerpVectors(fromT, look, k);
      this.camera.lookAt(this._camTarget);
    }, { ease: easeInOutCubic });
  }

  /* ───────────────── 물리 & 루프 ───────────────── */

  _stepBalls(dt) {
    const R = DRUM_R - BALL_R;
    const swirl = this.spin ?? 0;
    for (let i = 0; i < this.ballCount; i++) {
      const i3 = i * 3;
      let x = this.bp[i3], y = this.bp[i3 + 1], z = this.bp[i3 + 2];
      let vx = this.bv[i3], vy = this.bv[i3 + 1], vz = this.bv[i3 + 2];

      vy -= 9.4 * dt;
      // 드럼 회전이 만드는 소용돌이
      vx += -z * swirl * 0.34 * dt;
      vz += x * swirl * 0.34 * dt;
      vy += swirl * 0.16 * dt;

      vx *= 1 - 0.32 * dt; vy *= 1 - 0.32 * dt; vz *= 1 - 0.32 * dt;

      x += vx * dt; y += vy * dt; z += vz * dt;

      const d = Math.hypot(x, y, z);
      if (d > R) {
        const nx = x / d, ny = y / d, nz = z / d;
        x = nx * R; y = ny * R; z = nz * R;
        const dot = vx * nx + vy * ny + vz * nz;
        vx = (vx - 2 * dot * nx) * 0.62;
        vy = (vy - 2 * dot * ny) * 0.62;
        vz = (vz - 2 * dot * nz) * 0.62;
      }

      this.bp[i3] = x; this.bp[i3 + 1] = y; this.bp[i3 + 2] = z;
      this.bv[i3] = vx; this.bv[i3 + 1] = vy; this.bv[i3 + 2] = vz;
    }

    // 공끼리 겹침 해소 (가벼운 반복 1회)
    const d2 = (BALL_R * 2) ** 2;
    for (let i = 0; i < this.ballCount; i++) {
      const i3 = i * 3;
      for (let j = i + 1; j < this.ballCount; j++) {
        const j3 = j * 3;
        const dx = this.bp[j3] - this.bp[i3];
        const dy = this.bp[j3 + 1] - this.bp[i3 + 1];
        const dz = this.bp[j3 + 2] - this.bp[i3 + 2];
        const dd = dx * dx + dy * dy + dz * dz;
        if (dd > 1e-6 && dd < d2) {
          const dist = Math.sqrt(dd);
          const push = (BALL_R * 2 - dist) * 0.5;
          const ux = dx / dist, uy = dy / dist, uz = dz / dist;
          this.bp[i3] -= ux * push; this.bp[i3 + 1] -= uy * push; this.bp[i3 + 2] -= uz * push;
          this.bp[j3] += ux * push; this.bp[j3 + 1] += uy * push; this.bp[j3 + 2] += uz * push;
        }
      }
    }

    for (let i = 0; i < MAX_BALLS; i++) {
      const i3 = i * 3;
      this._v.set(this.bp[i3], this.bp[i3 + 1], this.bp[i3 + 2]);
      this._m.compose(this._v, this._q, this._s);
      this.balls.setMatrixAt(i, this._m);
    }
    this.balls.instanceMatrix.needsUpdate = true;
  }

  update(dt, time) {
    this.tweener.update(dt);
    this.t += dt;

    this.spin = THREE.MathUtils.damp(this.spin ?? 0, this.spinTarget ?? 0, 2.2, dt);
    this.drum.rotation.y += this.spin * dt * 0.35;
    this.drum.rotation.z = Math.sin(time * 0.7) * 0.03;

    if (this.phase !== 'idle') this._stepBalls(dt);

    this.baseRing.material.color.setHSL(0.55, 0.9, 0.4 + 0.18 * Math.sin(time * 2.4));

    if (this.revealBall.visible) {
      this.revealBall.rotation.y += dt * (this.phase === 'reveal' ? 2.4 : 5.5);
    }
    if (this.revealHalo.visible) {
      this.revealHalo.position.copy(this.revealBall.position);
      this.revealHalo.rotation.x = Math.PI / 2 + Math.sin(time * 1.2) * 0.3;
      this.revealHalo.rotation.z += dt * 1.1;
      this.revealHalo.material.opacity = Math.min(0.9, (this.revealHalo.material.opacity ?? 0) + dt * 1.6);
      this.revealHalo.scale.setScalar(1 + 0.06 * Math.sin(time * 3));
    }

    this.resultComplex?.update(dt, time);
    this.confetti.update(dt);
    this.shock.update(dt);
    this.sparks.update(dt);

    // 페이즈 자동 전환
    if (this.phase === 'spin' && this.t > 2.5) this._setPhase('eject');
    else if (this.phase === 'eject' && this.t > 1.15) this._setPhase('reveal');
    else if (this.phase === 'reveal' && this.t > (this._gaugeReady ? 2.3 : 1.2)) this._setPhase('verdict');
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  onExit() {
    this.confetti.active = false;
    this.confetti.mesh.visible = false;
    this.gauge.visible = false;
    this.resultHolder.visible = false;
    this.revealBall.visible = false;
    this.revealHalo.visible = false;
    this.winLight.intensity = 0;
    this._setDrumVisibility(1);
  }
}
