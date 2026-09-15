<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { loadNaverMaps } from '../lib/naverMaps';
import { formatWonShort } from '../lib/notices';
import { crownSvg } from '../lib/crown';
import { filtered, matchOf, select, ui } from '../stores/app';
import { defer } from '../stores/buddy';
import { CROWN_RANKS, visitStore } from '../stores/visits';

const SEOUL = { lat: 37.5326, lng: 126.9905 };

/** 줌 단계별 표시 방식: 멀리서는 지역 묶음, 가까이서는 개별 단지 */
function bucketOf(zoom) {
  if (zoom <= 9) return 'region';
  if (zoom <= 11) return 'district';
  return 'item';
}

const APT_ICON = `<svg viewBox="0 0 16 16" aria-hidden="true">
  <path d="M1.6 14.6V6.1L8 1.8l6.4 4.3v8.5H9.7v-3.4H6.3v3.4H1.6z" fill="currentColor"/>
  <rect x="3.5" y="7.2" width="1.6" height="1.6" rx=".3" fill="#fff" opacity=".9"/>
  <rect x="7.2" y="7.2" width="1.6" height="1.6" rx=".3" fill="#fff" opacity=".9"/>
  <rect x="10.9" y="7.2" width="1.6" height="1.6" rx=".3" fill="#fff" opacity=".9"/>
  <rect x="3.5" y="10.2" width="1.6" height="1.6" rx=".3" fill="#fff" opacity=".9"/>
  <rect x="10.9" y="10.2" width="1.6" height="1.6" rx=".3" fill="#fff" opacity=".9"/>
</svg>`;

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function pinHtml(item, selected) {
  const price = item.priceMin != null ? `${formatWonShort(item.priceMin)}~` : item.category;
  const badge =
    item.status === 'open'
      ? `<span class="pin__dday ${item.dday <= 3 ? 'is-urgent' : ''}">${esc(item.label)}</span>`
      : '';
  const match = ui.matchOn ? matchOf(item.id) : null;
  const matchClass = match ? (match.ok ? 'is-match' : 'is-unmatch') : '';
  const check = match?.ok ? '<span class="pin__check" title="내 조건 충족">✓</span>' : '';
  const rank = visitStore.rankOf(item.id);
  const crown = rank && rank <= CROWN_RANKS ? crownSvg(rank, { size: 13 }) : '';
  return `<div class="pin-root ${selected ? 'is-selected' : ''} is-${esc(item.status)} ${matchClass}" style="--pin:${esc(item.color)}">
    <div class="pin">
      <span class="pin__icon">${APT_ICON}</span>
      <span class="pin__body">
        <span class="pin__name">${crown}${check}${esc(item.title)}</span>
        <span class="pin__price">${esc(price)}${item.approxLabel ? ' · 근사' : ''}</span>
      </span>
      ${badge}
    </div>
    <span class="pin__stem"></span>
  </div>`;
}

function clusterHtml(group) {
  const open = group.items.filter((i) => i.status === 'open').length;
  return `<div class="cluster-root">
    <div class="cluster" style="--size:${Math.min(88, 56 + group.items.length * 4)}px">
      <b>${group.items.length}</b>
      <span>${esc(group.name)}</span>
      ${open ? `<i class="cluster__dot">${open}</i>` : ''}
    </div>
  </div>`;
}

const host = ref(null);
const zoom = ref(11);
const ready = ref(false);

let maps = null;
let map = null;
let drawn = [];
let markerIndex = new Map();
let lastSelected = null;

const bucket = computed(() => bucketOf(zoom.value));

const groups = computed(() => {
  const placed = filtered.value.filter((i) => i.lat != null && i.lng != null);
  if (bucket.value === 'item') return { clusters: [], singles: placed };

  const key = bucket.value === 'region' ? (i) => i.region : (i) => `${i.region} ${i.district ?? ''}`.trim();
  const buckets = new Map();
  for (const i of placed) {
    const k = key(i) || '기타';
    if (!buckets.has(k)) buckets.set(k, { name: bucket.value === 'region' ? k : (i.district ?? i.region), items: [] });
    buckets.get(k).items.push(i);
  }
  const list = [...buckets.values()];
  return {
    clusters: list
      .filter((g) => g.items.length > 1)
      .map((g) => ({
        ...g,
        lat: g.items.reduce((s, i) => s + i.lat, 0) / g.items.length,
        lng: g.items.reduce((s, i) => s + i.lng, 0) / g.items.length,
      })),
    singles: list.filter((g) => g.items.length === 1).map((g) => g.items[0]),
  };
});

function clearMarkers() {
  drawn.forEach((m) => m.setMap(null));
  drawn = [];
  markerIndex = new Map();
}

function draw() {
  if (!maps || !map) return;
  clearMarkers();

  for (const g of groups.value.clusters) {
    const marker = new maps.Marker({
      map,
      position: new maps.LatLng(g.lat, g.lng),
      icon: { content: clusterHtml(g), anchor: new maps.Point(0, 0) },
      zIndex: 10,
    });
    maps.Event.addListener(marker, 'click', () =>
      defer(() => {
        const bounds = new maps.LatLngBounds(new maps.LatLng(g.lat, g.lng), new maps.LatLng(g.lat, g.lng));
        g.items.forEach((i) => bounds.extend(new maps.LatLng(i.lat, i.lng)));
        map.fitBounds(bounds, { top: 96, right: 72, bottom: 72, left: 72 });
        if (map.getZoom() < 12) map.setZoom(12, true);
      })
    );
    drawn.push(marker);
  }

  for (const item of groups.value.singles) {
    const marker = new maps.Marker({
      map,
      position: new maps.LatLng(item.lat, item.lng),
      icon: { content: pinHtml(item, item.id === ui.selectedId), anchor: new maps.Point(0, 0) },
      zIndex: item.status === 'open' ? 60 : 40,
    });
    // 지도 마커도 금갱이가 0.5초 두드린 뒤 열린다(버튼들과 같은 리듬).
    maps.Event.addListener(marker, 'click', () => defer(() => select(item.id)));
    markerIndex.set(item.id, { marker, item });
    drawn.push(marker);
  }
  lastSelected = ui.selectedId;
}

function repaint(id, selected) {
  const entry = markerIndex.get(id);
  if (!entry || !maps) return;
  entry.marker.setIcon({ content: pinHtml(entry.item, selected), anchor: new maps.Point(0, 0) });
  entry.marker.setZIndex(selected ? 200 : entry.item.status === 'open' ? 60 : 40);
}

onMounted(() => {
  loadNaverMaps()
    .then((sdk) => {
      if (!host.value) return;
      maps = sdk;
      map = new maps.Map(host.value, {
        center: new maps.LatLng(SEOUL.lat, SEOUL.lng),
        zoom: 11,
        minZoom: 7,
        maxZoom: 19,
        scaleControl: false,
        mapDataControl: false,
        logoControlOptions: { position: maps.Position.BOTTOM_RIGHT },
        zoomControl: false,
      });

      const emit = () => {
        const b = map.getBounds();
        zoom.value = map.getZoom();
        ui.viewport = {
          zoom: map.getZoom(),
          bounds: {
            south: b.getSW().lat(),
            west: b.getSW().lng(),
            north: b.getNE().lat(),
            east: b.getNE().lng(),
          },
        };
      };
      maps.Event.addListener(map, 'idle', emit);
      maps.Event.once(map, 'init', emit);
      ready.value = true;
      draw();
    })
    .catch((e) => {
      ui.mapError = { message: e.message, code: e.code ?? null };
    });
});

onBeforeUnmount(() => {
  clearMarkers();
  if (map?.destroy) map.destroy();
  map = null;
  maps = null;
});

watch(groups, () => ready.value && draw());

// 방문 순위가 바뀌면 왕관이 붙거나 떨어진 마커만 다시 그린다(전체 재생성 방지).
watch(
  () => visitStore
    .top(CROWN_RANKS)
    .map((t) => `${t.id}:${t.rank}`)
    .join(','),
  (now, prev) => {
    if (!ready.value) return;
    const ids = new Set(
      [...(prev ?? '').split(','), ...now.split(',')].map((s) => s.split(':')[0]).filter(Boolean)
    );
    ids.forEach((id) => repaint(id, id === ui.selectedId));
  }
);

// 선택 강조는 마커를 다시 만들지 않고 아이콘만 갈아끼운다.
watch(
  () => ui.selectedId,
  (id) => {
    if (!ready.value) return;
    if (lastSelected && lastSelected !== id) repaint(lastSelected, false);
    if (id) repaint(id, true);
    lastSelected = id;
  }
);

watch(
  () => ui.focusRequest,
  (req) => {
    if (!map || !maps || !req?.lat) return;
    map.morph(new maps.LatLng(req.lat, req.lng), Math.max(map.getZoom(), 14), {
      duration: 400,
      easing: 'easeOutCubic',
    });
  }
);

function zoomBy(delta) {
  if (map) map.setZoom(map.getZoom() + delta, true);
}

function fitAll() {
  if (!map || !maps) return;
  const placed = filtered.value.filter((i) => i.lat != null);
  if (!placed.length) return;
  const bounds = new maps.LatLngBounds(
    new maps.LatLng(placed[0].lat, placed[0].lng),
    new maps.LatLng(placed[0].lat, placed[0].lng)
  );
  placed.forEach((i) => bounds.extend(new maps.LatLng(i.lat, i.lng)));
  map.fitBounds(bounds, { top: 80, right: 80, bottom: 80, left: 80 });
}

defineExpose({ fitAll });
</script>

<template>
  <div class="mapview">
    <div class="mapview__canvas" ref="host" />

    <div class="mapview__tools">
      <button type="button" class="mapview__tool" title="전체 보기" aria-label="전체 보기" @click="fitAll">⤢</button>
      <div class="mapview__zoom">
        <button type="button" aria-label="확대" @click="zoomBy(1)">+</button>
        <button type="button" aria-label="축소" @click="zoomBy(-1)">−</button>
      </div>
    </div>

    <div v-if="groups.clusters.length && ready" class="mapview__hint">
      동그라미를 누르거나 확대하면 단지별로 펼쳐집니다
    </div>
  </div>
</template>
