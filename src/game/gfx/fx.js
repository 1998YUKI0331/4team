import * as THREE from 'three';

/* ───────────────────────── 색종이 ───────────────────────── */

const CONFETTI_COLORS = [0xffc76b, 0x33e39f, 0x7c5cff, 0x4de2ff, 0xff6b8a, 0xffffff];

export class Confetti {
  constructor(count = 420) {
    this.count = count;
    const geo = new THREE.PlaneGeometry(0.16, 0.26);
    const mat = new THREE.MeshBasicMaterial({
      side: THREE.DoubleSide, transparent: true, depthWrite: false,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;

    this.p = new Float32Array(count * 3);
    this.v = new Float32Array(count * 3);
    this.r = new Float32Array(count * 3);
    this.rv = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.active = false;

    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._pos = new THREE.Vector3();
    this._scale = new THREE.Vector3(1, 1, 1);
    this._color = new THREE.Color();
  }

  burst(origin = new THREE.Vector3(0, 6, 0), power = 1) {
    this.active = true;
    this.mesh.visible = true;
    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;
      this.p[i3] = origin.x + (Math.random() - 0.5) * 1.6;
      this.p[i3 + 1] = origin.y + (Math.random() - 0.5) * 1.2;
      this.p[i3 + 2] = origin.z + (Math.random() - 0.5) * 1.6;

      const a = Math.random() * Math.PI * 2;
      const up = 5.5 + Math.random() * 9 * power;
      const out = (1.6 + Math.random() * 5.5) * power;
      this.v[i3] = Math.cos(a) * out;
      this.v[i3 + 1] = up;
      this.v[i3 + 2] = Math.sin(a) * out;

      this.r[i3] = Math.random() * 6.28;
      this.r[i3 + 1] = Math.random() * 6.28;
      this.r[i3 + 2] = Math.random() * 6.28;
      this.rv[i3] = (Math.random() - 0.5) * 12;
      this.rv[i3 + 1] = (Math.random() - 0.5) * 12;
      this.rv[i3 + 2] = (Math.random() - 0.5) * 12;

      this.life[i] = 2.6 + Math.random() * 2.6;

      this._color.setHex(CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0]);
      this.mesh.setColorAt(i, this._color);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt) {
    if (!this.active) return;
    let alive = 0;
    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;
      if (this.life[i] <= 0) continue;
      alive++;
      this.life[i] -= dt;

      this.v[i3 + 1] -= 11 * dt;
      this.v[i3] *= 1 - 1.5 * dt;
      this.v[i3 + 2] *= 1 - 1.5 * dt;
      // 팔랑거림
      this.v[i3] += Math.sin(this.r[i3 + 1] * 2) * 1.4 * dt;

      this.p[i3] += this.v[i3] * dt;
      this.p[i3 + 1] += this.v[i3 + 1] * dt;
      this.p[i3 + 2] += this.v[i3 + 2] * dt;

      this.r[i3] += this.rv[i3] * dt;
      this.r[i3 + 1] += this.rv[i3 + 1] * dt;
      this.r[i3 + 2] += this.rv[i3 + 2] * dt;

      const k = Math.min(1, this.life[i]);
      this._pos.set(this.p[i3], this.p[i3 + 1], this.p[i3 + 2]);
      this._e.set(this.r[i3], this.r[i3 + 1], this.r[i3 + 2]);
      this._q.setFromEuler(this._e);
      this._scale.set(k, k, k);
      this._m.compose(this._pos, this._q, this._scale);
      this.mesh.setMatrixAt(i, this._m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (alive === 0) { this.active = false; this.mesh.visible = false; }
  }
}

/* ───────────────────────── 충격파 ───────────────────────── */

export class Shockwave {
  constructor(color = 0xffc76b) {
    const geo = new THREE.RingGeometry(0.6, 0.78, 72);
    geo.rotateX(-Math.PI / 2);
    this.mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0, side: THREE.DoubleSide,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.visible = false;
    this.t = 0; this.dur = 1; this.max = 20;
  }
  fire(pos, { max = 20, duration = 1.1, color } = {}) {
    if (color !== undefined) this.mat.color.setHex(color);
    this.mesh.position.copy(pos);
    this.mesh.visible = true;
    this.t = 0; this.dur = duration; this.max = max;
  }
  update(dt) {
    if (!this.mesh.visible) return;
    this.t += dt;
    const k = this.t / this.dur;
    if (k >= 1) { this.mesh.visible = false; return; }
    this.mesh.scale.setScalar(1 + k * this.max);
    this.mat.opacity = (1 - k) * 0.85;
  }
}

/* ───────────────────────── 상승 파티클 ───────────────────────── */

export class Sparks {
  constructor(count = 220, color = 0xffc76b) {
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.mat = new THREE.PointsMaterial({
      color, size: 0.22, transparent: true, opacity: 0.9,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.visible = false;
    this.count = count;
    this.active = false;
  }
  burst(origin, power = 1) {
    this.active = true; this.points.visible = true;
    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;
      this.pos[i3] = origin.x; this.pos[i3 + 1] = origin.y; this.pos[i3 + 2] = origin.z;
      const a = Math.random() * Math.PI * 2;
      const el = Math.random() * Math.PI;
      const sp = (3 + Math.random() * 11) * power;
      this.vel[i3] = Math.sin(el) * Math.cos(a) * sp;
      this.vel[i3 + 1] = Math.abs(Math.cos(el)) * sp * 1.3;
      this.vel[i3 + 2] = Math.sin(el) * Math.sin(a) * sp;
      this.life[i] = 0.8 + Math.random() * 1.2;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
  update(dt) {
    if (!this.active) return;
    let alive = 0;
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) continue;
      alive++;
      this.life[i] -= dt;
      const i3 = i * 3;
      this.vel[i3 + 1] -= 9 * dt;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.mat.opacity = Math.min(0.9, alive / this.count);
    if (alive === 0) { this.active = false; this.points.visible = false; }
  }
}

/* ───────────────────────── 번호 텍스처 ───────────────────────── */

export function makeNumberTexture(text, { fg = '#1a1208', bg = '#ffc76b', size = 256 } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, size, size);

  // 위/아래 밴드로 구형 매핑 시 자연스럽게
  const grad = g.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, 'rgba(255,255,255,0.35)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.25)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);

  g.fillStyle = fg;
  g.font = `900 ${size * 0.34}px "Pretendard", system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(text), size / 2, size / 2);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
