import * as THREE from 'three';
import { makeFacadeTexture, PALETTE, easeOutCubic } from './scene.js';
import { makeRng } from '../core/rng.js';

const FLOOR_H = 0.34;

const texCache = new Map();
function facadeFor(seed, cols, rows, warm) {
  const key = `${seed}|${cols}|${rows}|${warm}`;
  if (!texCache.has(key)) {
    texCache.set(key, makeFacadeTexture(makeRng(key), { cols, rows, lit: warm ? 0.46 : 0.3, warm }));
  }
  return texCache.get(key);
}

const concrete = new THREE.MeshStandardMaterial({ color: 0x2a3550, roughness: 0.85, metalness: 0.05 });
const podiumMat = new THREE.MeshStandardMaterial({ color: 0x1a2440, roughness: 0.7, metalness: 0.15 });

/**
 * 아파트 한 동.
 * setProgress(0→1) 로 "지어지는" 연출을 한다.
 */
export class Tower {
  constructor({ floors = 22, width = 1.5, depth = 1.1, seed = 'x', warm = true } = {}) {
    this.floors = floors;
    this.width = width;
    this.depth = depth;
    this.fullHeight = floors * FLOOR_H;
    this.group = new THREE.Group();

    const cols = Math.max(4, Math.round(width * 5));
    const tex = facadeFor(seed, cols, Math.max(6, floors), warm).clone();
    tex.needsUpdate = true;

    this.mat = new THREE.MeshStandardMaterial({
      map: tex,
      emissiveMap: tex,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.0,
      color: 0x8fa3c8,
      roughness: 0.62,
      metalness: 0.12,
    });

    // 본체 — 아래에서 위로 자라도록 피벗을 바닥에 둔다
    const geo = new THREE.BoxGeometry(width, 1, depth);
    geo.translate(0, 0.5, 0);
    this.body = new THREE.Mesh(geo, this.mat);
    this.body.scale.y = this.fullHeight;
    this.group.add(this.body);

    // 옥탑 + 안테나
    this.crown = new THREE.Group();
    const roof = new THREE.Mesh(new THREE.BoxGeometry(width * 1.06, 0.1, depth * 1.06), concrete);
    roof.position.y = 0.05;
    this.crown.add(roof);
    const mech = new THREE.Mesh(new THREE.BoxGeometry(width * 0.4, 0.22, depth * 0.4), concrete);
    mech.position.set(width * 0.16, 0.2, 0);
    this.crown.add(mech);

    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.018, 0.6, 6),
      new THREE.MeshStandardMaterial({ color: 0x415070, roughness: 0.5 })
    );
    mast.position.set(-width * 0.2, 0.35, 0);
    this.crown.add(mast);

    this.beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xff4d6d })
    );
    this.beacon.position.set(-width * 0.2, 0.66, 0);
    this.crown.add(this.beacon);
    this.group.add(this.crown);

    this.progress = 0;
    this.setProgress(0);
  }

  setProgress(p) {
    this.progress = THREE.MathUtils.clamp(p, 0, 1);
    const h = Math.max(0.001, this.fullHeight * this.progress);
    this.body.scale.y = h;
    // 텍스처를 층수에 맞춰 잘라 붙여 "층이 쌓이는" 느낌을 낸다
    const rows = Math.max(1, Math.round(this.floors * this.progress));
    this.mat.map.repeat.set(1, rows / this.floors);
    this.mat.map.offset.set(0, 0);
    this.crown.position.y = h;
    this.crown.visible = this.progress > 0.985;
  }

  /** 창문 불빛 세기 (0=완전 소등, 1=만실) */
  setLight(k) {
    this.mat.emissiveIntensity = k;
  }

  update(dt, t) {
    if (this.crown.visible) {
      this.beacon.material.color.setHSL(0.97, 0.9, 0.35 + 0.35 * (0.5 + 0.5 * Math.sin(t * 3.4)));
    }
  }

  dispose() {
    this.body.geometry.dispose();
    this.mat.map?.dispose();
    this.mat.dispose();
  }
}

/**
 * 아파트 단지 — 여러 동 + 저층 상가 + 지반
 */
export class Complex {
  constructor({ seed = 'c', units = 400, tier = 1, warm = true } = {}) {
    const rng = makeRng(`complex::${seed}`);
    this.group = new THREE.Group();
    this.towers = [];

    const count = THREE.MathUtils.clamp(Math.round(units / 160) + 1, 2, 6);
    const spread = 0.95 + count * 0.34;

    // 지반
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(spread * 1.05, spread * 1.12, 0.14, 24),
      podiumMat
    );
    pad.position.y = 0.07;
    this.group.add(pad);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(spread * 1.05, 0.028, 8, 48),
      new THREE.MeshBasicMaterial({ color: PALETTE.rim, transparent: true, opacity: 0.55 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.15;
    this.ring = ring;
    this.group.add(ring);

    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rng() * 0.5;
      const r = i === 0 ? 0 : spread * (0.45 + rng() * 0.5);
      const floors = Math.round(16 + tier * 5 + rng() * 16);
      const t = new Tower({
        floors,
        width: 0.85 + rng() * 0.5,
        depth: 0.68 + rng() * 0.3,
        seed: `${seed}-${i}`,
        warm,
      });
      t.group.position.set(Math.cos(a) * r, 0.14, Math.sin(a) * r);
      t.group.rotation.y = rng() * Math.PI;
      this.towers.push(t);
      this.group.add(t.group);
    }

    this.buildT = 0;
    this.targetProgress = 0;
  }

  /** 0 → 1 로 단지 전체가 순차 완공된다 */
  setBuild(p) {
    const n = this.towers.length;
    this.towers.forEach((t, i) => {
      const start = (i / n) * 0.55;
      const k = THREE.MathUtils.clamp((p - start) / (1 - start), 0, 1);
      t.setProgress(easeOutCubic(k));
    });
    this.buildT = p;
  }

  setLight(k) { for (const t of this.towers) t.setLight(k); }

  update(dt, t) {
    for (const tw of this.towers) tw.update(dt, t);
    if (this.ring) {
      this.ring.material.opacity = 0.35 + 0.28 * (0.5 + 0.5 * Math.sin(t * 2.1));
      this.ring.rotation.z += dt * 0.35;
    }
  }

  dispose() { for (const t of this.towers) t.dispose(); }
}

/**
 * 도시 배경을 채우는 저층 건물 무리 (InstancedMesh)
 */
export function makeFillerBlocks(positions, seedKey = 'filler') {
  const rng = makeRng(seedKey);
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x1d2742,
    roughness: 0.9,
    metalness: 0.05,
    emissive: new THREE.Color(0x0e2340),
    emissiveIntensity: 0.55,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, positions.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();

  positions.forEach((pos, i) => {
    p.set(pos.x, pos.y ?? 0, pos.z);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * Math.PI);
    const h = 0.25 + rng() * (pos.scale ?? 1) * 1.6;
    s.set(0.24 + rng() * 0.34, h, 0.24 + rng() * 0.34);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  return mesh;
}
