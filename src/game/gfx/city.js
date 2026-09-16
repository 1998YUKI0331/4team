import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DISTRICT_LIST, DISTRICTS } from '../data/geo.js';
import { PALETTE, makeLabel, easeInOutCubic, easeOutCubic, Tweener } from './scene.js';
import { Complex } from './tower.js';
import { makeRng } from '../core/rng.js';

const MAP_SCALE = 0.8;
const HEIGHT_K = 0.28;       // 1억 = 0.28 world unit
const PLATE_R = 1.55;

const worldX = (d) => d.x * MAP_SCALE;
const worldZ = (d) => d.z * MAP_SCALE;

/* ───────────────────────── 지역 타일 ───────────────────────── */

class DistrictTile {
  constructor(district) {
    this.district = district;
    this.group = new THREE.Group();
    this.group.position.set(worldX(district), 0, worldZ(district));

    const hot = district.tier >= 2;
    this.baseMat = new THREE.MeshStandardMaterial({
      color: hot ? PALETTE.plateHot : PALETTE.plate,
      roughness: 0.78,
      metalness: 0.22,
      emissive: new THREE.Color(hot ? 0x1b2f5e : 0x101a33),
      emissiveIntensity: 0.6,
    });

    const geo = new THREE.CylinderGeometry(PLATE_R, PLATE_R * 1.04, 1, 6, 1);
    geo.translate(0, 0.5, 0);
    this.plate = new THREE.Mesh(geo, this.baseMat);
    this.plate.userData.tile = this;
    this.group.add(this.plate);

    // 상단 테두리 — 선택/호버 표시에 쓴다
    this.rimMat = new THREE.MeshBasicMaterial({
      color: PALETTE.rim, transparent: true, opacity: 0.16,
    });
    const rimGeo = new THREE.TorusGeometry(PLATE_R * 0.99, 0.035, 6, 6);
    rimGeo.rotateX(Math.PI / 2);
    rimGeo.rotateZ(Math.PI / 6);
    this.rim = new THREE.Mesh(rimGeo, this.rimMat);
    this.group.add(this.rim);

    // 타일 위 저층 건물 (병합해서 draw call 1개)
    this.cluster = buildCluster(district);
    this.group.add(this.cluster);

    this.height = 0.2;
    this.targetHeight = district.base * HEIGHT_K;
    this.hoverK = 0;
    this.selected = false;
    this.applyHeight(this.targetHeight);
  }

  applyHeight(h) {
    this.height = h;
    this.plate.scale.y = h;
    this.rim.position.y = h + 0.01;
    this.cluster.position.y = h;
  }

  setTarget(priceIndex) {
    this.targetHeight = Math.max(0.25, this.district.base * priceIndex * HEIGHT_K);
  }

  update(dt, t) {
    const h = THREE.MathUtils.damp(this.height, this.targetHeight, 3.2, dt);
    if (Math.abs(h - this.height) > 0.0005) this.applyHeight(h);

    const want = this.selected ? 1 : this.hoverK;
    const o = 0.16 + want * 0.72 + (this.selected ? 0.12 * Math.sin(t * 4) : 0);
    this.rimMat.opacity = o;
    this.rimMat.color.set(this.selected ? PALETTE.gold : PALETTE.rim);
    this.baseMat.emissiveIntensity = 0.6 + want * 0.9;
  }
}

function buildCluster(district) {
  const rng = makeRng(`cluster::${district.key}`);
  const n = 5 + Math.round(district.tier * 2.5);
  const geos = [];
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * PLATE_R * 0.7;
    const h = 0.18 + rng() * (0.4 + district.tier * 0.55);
    const g = new THREE.BoxGeometry(0.16 + rng() * 0.22, h, 0.16 + rng() * 0.22);
    g.translate(Math.cos(a) * r, h / 2, Math.sin(a) * r);
    geos.push(g);
  }
  const merged = mergeGeometries(geos, false);
  geos.forEach((g) => g.dispose());
  const mat = new THREE.MeshStandardMaterial({
    color: 0x24314f,
    roughness: 0.88,
    metalness: 0.06,
    emissive: new THREE.Color(0x14325c),
    emissiveIntensity: 0.5,
  });
  return new THREE.Mesh(merged, mat);
}

/* ───────────────────────── 공고 마커 ───────────────────────── */

class NoticeMarker {
  constructor(notice, tile, opts = {}) {
    this.notice = notice;
    this.tile = tile;
    this.group = new THREE.Group();
    this.eligible = opts.eligible ?? true;
    this.spawnT = 0;

    const accent = this.eligible ? PALETTE.gold : 0x5a6b8f;

    this.complex = new Complex({
      seed: notice.id,
      units: notice.units,
      tier: notice.district.tier,
      warm: this.eligible,
    });
    this.complex.group.scale.setScalar(0.62);
    this.group.add(this.complex.group);

    // 빛기둥
    const beamGeo = new THREE.CylinderGeometry(0.16, 0.5, 9, 12, 1, true);
    beamGeo.translate(0, 4.5, 0);
    this.beamMat = new THREE.MeshBasicMaterial({
      color: accent, transparent: true, opacity: 0.16,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.beam = new THREE.Mesh(beamGeo, this.beamMat);
    this.group.add(this.beam);

    // 바닥 파동
    this.pulseMat = new THREE.MeshBasicMaterial({
      color: accent, transparent: true, opacity: 0.5,
      depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const pg = new THREE.RingGeometry(0.7, 0.86, 40);
    pg.rotateX(-Math.PI / 2);
    this.pulse = new THREE.Mesh(pg, this.pulseMat);
    this.pulse.position.y = 0.06;
    this.group.add(this.pulse);

    // 라벨
    const price = notice.kind === 'rent'
      ? notice.rentTerms.mode
      : `${(notice.priceRange.lo / 1e8).toFixed(1)}~${(notice.priceRange.hi / 1e8).toFixed(1)}억`;
    this.label = makeLabel(`${notice.title.slice(0, 16)}  ·  ${price}`, {
      accent: this.eligible ? '#ffc76b' : '#5a6b8f',
      color: this.eligible ? '#fff4dd' : '#9fb0cc',
      size: 40,
    });
    const s = 1.5;
    this.label.scale.set(this.label.userData.aspect * s, s, 1);
    this.label.position.y = 5.4;
    this.group.add(this.label);

    // 클릭 히트박스
    this.hit = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.1, 5, 8),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    this.hit.position.y = 2.2;
    this.hit.userData.marker = this;
    this.group.add(this.hit);

    this.complex.setBuild(0.22);
    this.complex.setLight(this.eligible ? 0.55 : 0.18);
  }

  update(dt, t) {
    this.spawnT = Math.min(1, this.spawnT + dt * 0.85);
    const k = easeOutCubic(this.spawnT);
    this.complex.setBuild(0.25 + k * 0.75);
    this.group.position.y = this.tile.height;

    this.complex.update(dt, t);

    const p = (t * 0.55) % 1;
    this.pulse.scale.setScalar(0.8 + p * 2.6);
    this.pulseMat.opacity = (1 - p) * (this.eligible ? 0.55 : 0.22) * k;

    this.beamMat.opacity = (0.10 + 0.07 * Math.sin(t * 2.2)) * k * (this.eligible ? 1 : 0.5);
    this.label.material.opacity = k;
    this.label.position.y = 4.6 + 0.18 * Math.sin(t * 1.6);
  }

  dispose() {
    this.complex.dispose();
    this.beam.geometry.dispose(); this.beamMat.dispose();
    this.pulse.geometry.dispose(); this.pulseMat.dispose();
    this.label.material.map?.dispose(); this.label.material.dispose();
    this.hit.geometry.dispose();
  }
}

/* ───────────────────────── 도시 스테이지 ───────────────────────── */

export class CityStage {
  constructor(canvas) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(PALETTE.bg);
    this.scene.fog = new THREE.Fog(PALETTE.fog, 55, 190);

    this.camera = new THREE.PerspectiveCamera(46, 1, 0.5, 600);
    this.camera.position.set(6, 62, 78);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.minDistance = 12;
    this.controls.maxDistance = 165;
    this.controls.maxPolarAngle = Math.PI * 0.46;
    this.controls.minPolarAngle = 0.12;
    this.controls.target.set(9, 0, 9);
    this.controls.enablePan = true;
    this.controls.screenSpacePanning = false;

    this.tweener = new Tweener();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2(-10, -10);
    this.markers = new Map();
    this.onHover = null;
    this._focusTween = null;

    this._buildLights();
    this._buildGround();
    this._buildTiles();
    this._buildHomeMarker();
  }

  /* ── 구성 ─────────────────────────────── */

  _buildLights() {
    this.scene.add(new THREE.HemisphereLight(0x5f7cff, 0x05070f, 0.55));
    const key = new THREE.DirectionalLight(0xbfd4ff, 1.15);
    key.position.set(-40, 70, 40);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xff9f6b, 0.45);
    rim.position.set(50, 25, -40);
    this.scene.add(rim);
    this.scene.add(new THREE.AmbientLight(0x2a3a66, 0.6));
  }

  _buildGround() {
    const g = new THREE.Mesh(
      new THREE.PlaneGeometry(600, 600),
      new THREE.MeshStandardMaterial({ color: PALETTE.ground, roughness: 1, metalness: 0 })
    );
    g.rotation.x = -Math.PI / 2;
    g.position.y = -0.02;
    this.scene.add(g);

    const grid = new THREE.GridHelper(420, 84, PALETTE.grid, 0x0e1730);
    grid.material.transparent = true;
    grid.material.opacity = 0.42;
    grid.position.y = 0;
    this.scene.add(grid);

    // 한강 — 서울을 가로지르는 띠 (분위기용)
    const river = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 2.6, 60, 1),
      new THREE.MeshBasicMaterial({ color: 0x123a6b, transparent: true, opacity: 0.55 })
    );
    river.rotation.x = -Math.PI / 2;
    river.rotation.z = -0.06;
    river.position.set(2, 0.02, 4.2);
    const pos = river.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, pos.getY(i) + Math.sin(pos.getX(i) * 0.18) * 1.6);
    }
    pos.needsUpdate = true;
    this.scene.add(river);
  }

  _buildTiles() {
    this.tiles = new Map();
    const seen = new Set();
    for (const d of DISTRICT_LIST) {
      const k = `${d.x.toFixed(2)},${d.z.toFixed(2)}`;
      if (seen.has(k)) continue;          // 인천 서구/서해구 중복 제거
      seen.add(k);
      const tile = new DistrictTile(d);
      this.tiles.set(d.key, tile);
      this.scene.add(tile.group);
    }
    // 별칭 지역도 같은 타일을 가리키게
    for (const d of DISTRICT_LIST) {
      if (!this.tiles.has(d.key)) {
        const alias = [...this.tiles.values()].find((t) => t.district.x === d.x && t.district.z === d.z);
        if (alias) this.tiles.set(d.key, alias);
      }
    }
    this.pickables = [...new Set(this.tiles.values())].map((t) => t.plate);
  }

  _buildHomeMarker() {
    const g = new THREE.Group();
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.42, 1.0, 5),
      new THREE.MeshBasicMaterial({ color: PALETTE.win })
    );
    cone.rotation.x = Math.PI;
    cone.position.y = 1.5;
    g.add(cone);
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.36, 14, 12),
      new THREE.MeshBasicMaterial({ color: PALETTE.win })
    );
    ball.position.y = 2.15;
    g.add(ball);
    this.homeMarker = g;
    this.homeMarker.visible = false;
    this.scene.add(g);
  }

  /* ── 상태 반영 ─────────────────────────── */

  setPriceIndex(idx) {
    for (const t of new Set(this.tiles.values())) t.setTarget(idx);
  }

  setResidence(districtKey) {
    const tile = this.tiles.get(districtKey);
    if (!tile) { this.homeMarker.visible = false; return; }
    this.homeMarker.visible = true;
    this.homeMarker.userData.tile = tile;
    this.homeMarker.position.set(tile.group.position.x, tile.height, tile.group.position.z);
  }

  /** 접수 중인 공고를 3D 마커로 동기화 */
  syncNotices(notices, isEligible = () => true) {
    const wanted = new Set(notices.map((n) => n.id));

    for (const [id, marker] of this.markers) {
      if (!wanted.has(id)) {
        this.scene.remove(marker.group);
        marker.dispose();
        this.markers.delete(id);
      }
    }

    // 같은 지역에 여러 공고가 뜨면 조금씩 밀어서 배치
    const perTile = new Map();
    for (const n of notices) {
      const tile = this.tiles.get(n.district.key);
      if (!tile) continue;
      const i = perTile.get(tile) ?? 0;
      perTile.set(tile, i + 1);

      let marker = this.markers.get(n.id);
      const elig = isEligible(n);
      if (marker && marker.eligible !== elig) {
        this.scene.remove(marker.group); marker.dispose(); this.markers.delete(n.id); marker = null;
      }
      if (!marker) {
        marker = new NoticeMarker(n, tile, { eligible: elig });
        this.markers.set(n.id, marker);
        this.scene.add(marker.group);
      }
      const a = i * 2.2;
      const r = i === 0 ? 0 : 0.85;
      marker.group.position.set(
        tile.group.position.x + Math.cos(a) * r,
        tile.height,
        tile.group.position.z + Math.sin(a) * r
      );
      marker.tile = tile;
    }

    this.markerHits = [...this.markers.values()].map((m) => m.hit);
  }

  selectDistrict(districtKey) {
    for (const t of new Set(this.tiles.values())) t.selected = false;
    const tile = this.tiles.get(districtKey);
    if (tile) tile.selected = true;
  }

  /** 지역으로 카메라 이동 */
  focus(districtKey, { distance = 26, duration = 1.1 } = {}) {
    const tile = this.tiles.get(districtKey);
    if (!tile) return;
    const to = new THREE.Vector3(tile.group.position.x, tile.height * 0.6, tile.group.position.z);
    const fromT = this.controls.target.clone();
    const fromP = this.camera.position.clone();
    const dir = new THREE.Vector3(0.25, 0.86, 0.95).normalize();
    const toP = to.clone().add(dir.multiplyScalar(distance));

    this._focusTween = this.tweener.add(duration, (k) => {
      this.controls.target.lerpVectors(fromT, to, k);
      this.camera.position.lerpVectors(fromP, toP, k);
    }, { ease: easeInOutCubic });
  }

  overview({ duration = 1.2 } = {}) {
    const fromT = this.controls.target.clone();
    const fromP = this.camera.position.clone();
    const toT = new THREE.Vector3(9, 0, 9);
    const toP = new THREE.Vector3(6, 62, 78);
    this.tweener.add(duration, (k) => {
      this.controls.target.lerpVectors(fromT, toT, k);
      this.camera.position.lerpVectors(fromP, toP, k);
    }, { ease: easeInOutCubic });
  }

  /* ── 입력 ─────────────────────────────── */

  setPointer(nx, ny) { this.pointer.set(nx, ny); }

  pick() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const mHits = this.raycaster.intersectObjects(this.markerHits ?? [], false);
    if (mHits.length) return { type: 'notice', marker: mHits[0].object.userData.marker };
    const tHits = this.raycaster.intersectObjects(this.pickables, false);
    if (tHits.length) return { type: 'district', tile: tHits[0].object.userData.tile };
    return null;
  }

  /* ── 루프 ─────────────────────────────── */

  update(dt, t) {
    this.tweener.update(dt);
    this.controls.update();

    const hit = this.pick();
    const hoverTile = hit?.type === 'district' ? hit.tile
      : hit?.type === 'notice' ? hit.marker.tile : null;

    for (const tile of new Set(this.tiles.values())) {
      const want = tile === hoverTile ? 1 : 0;
      tile.hoverK = THREE.MathUtils.damp(tile.hoverK, want, 10, dt);
      tile.update(dt, t);
    }
    for (const m of this.markers.values()) m.update(dt, t);

    if (this.homeMarker.visible) {
      const tile = this.homeMarker.userData.tile;
      if (tile) this.homeMarker.position.y = tile.height + 0.25 * Math.sin(t * 2.2);
    }

    this._hover = hit;
    this.onHover?.(hit);
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
