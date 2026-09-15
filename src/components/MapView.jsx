import { useEffect, useMemo, useRef, useState } from 'react';
import { loadNaverMaps } from '../lib/naverMaps';
import { formatWonShort } from '../lib/notices';

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
  return `<div class="pin-root ${selected ? 'is-selected' : ''} is-${esc(item.status)}" style="--pin:${esc(item.color)}">
    <div class="pin">
      <span class="pin__icon">${APT_ICON}</span>
      <span class="pin__body">
        <span class="pin__name">${esc(item.title)}</span>
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

export default function MapView({
  items,
  selectedId,
  onSelect,
  onViewportChange,
  focusRequest,
  onReady,
  onError,
}) {
  const hostRef = useRef(null);
  const mapRef = useRef(null);
  const mapsRef = useRef(null);
  const markersRef = useRef(new Map());
  const [zoom, setZoom] = useState(11);
  const [ready, setReady] = useState(false);

  /* 지도 생성 (한 번) */
  useEffect(() => {
    let cancelled = false;
    loadNaverMaps()
      .then((maps) => {
        if (cancelled || !hostRef.current) return;
        const map = new maps.Map(hostRef.current, {
          center: new maps.LatLng(SEOUL.lat, SEOUL.lng),
          zoom: 11,
          minZoom: 7,
          maxZoom: 19,
          scaleControl: false,
          mapDataControl: false,
          logoControlOptions: { position: maps.Position.BOTTOM_RIGHT },
          zoomControl: false,
        });
        mapsRef.current = maps;
        mapRef.current = map;

        const emit = () => {
          const b = map.getBounds();
          setZoom(map.getZoom());
          onViewportChange?.({
            zoom: map.getZoom(),
            bounds: {
              south: b.getSW().lat(),
              west: b.getSW().lng(),
              north: b.getNE().lat(),
              east: b.getNE().lng(),
            },
          });
        };
        maps.Event.addListener(map, 'idle', emit);
        maps.Event.once(map, 'init', emit);
        setReady(true);
        onReady?.(map);
      })
      .catch((e) => !cancelled && onError?.(e));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* 줌 단계에 따라 개별 마커 / 지역 묶음을 고른다. 1건짜리는 묶지 않고 그대로 보여준다. */
  const bucket = bucketOf(zoom);
  const { clusters, singles } = useMemo(() => {
    const placed = items.filter((i) => i.lat != null && i.lng != null);
    if (bucket === 'item') return { clusters: [], singles: placed };

    const key = bucket === 'region' ? (i) => i.region : (i) => `${i.region} ${i.district ?? ''}`.trim();
    const map = new Map();
    for (const i of placed) {
      const k = key(i) || '기타';
      if (!map.has(k)) map.set(k, { name: bucket === 'region' ? k : i.district || i.region, items: [] });
      map.get(k).items.push(i);
    }
    const groups = [...map.values()];
    return {
      clusters: groups
        .filter((g) => g.items.length > 1)
        .map((g) => ({
          ...g,
          lat: g.items.reduce((s, i) => s + i.lat, 0) / g.items.length,
          lng: g.items.reduce((s, i) => s + i.lng, 0) / g.items.length,
        })),
      singles: groups.filter((g) => g.items.length === 1).map((g) => g.items[0]),
    };
  }, [items, bucket]);

  /* 마커 그리기 */
  useEffect(() => {
    const maps = mapsRef.current;
    const map = mapRef.current;
    if (!maps || !map) return;

    const created = [];
    markersRef.current.clear();

    for (const g of clusters) {
      const marker = new maps.Marker({
        map,
        position: new maps.LatLng(g.lat, g.lng),
        icon: { content: clusterHtml(g), anchor: new maps.Point(0, 0) },
        zIndex: 10,
      });
      maps.Event.addListener(marker, 'click', () => {
        const bounds = new maps.LatLngBounds(new maps.LatLng(g.lat, g.lng), new maps.LatLng(g.lat, g.lng));
        g.items.forEach((i) => bounds.extend(new maps.LatLng(i.lat, i.lng)));
        map.fitBounds(bounds, { top: 96, right: 72, bottom: 72, left: 72 });
        if (map.getZoom() < 12) map.setZoom(12, true);
      });
      created.push(marker);
    }

    for (const item of singles) {
      const marker = new maps.Marker({
        map,
        position: new maps.LatLng(item.lat, item.lng),
        icon: { content: pinHtml(item, item.id === selectedId), anchor: new maps.Point(0, 0) },
        zIndex: item.status === 'open' ? 60 : 40,
      });
      maps.Event.addListener(marker, 'click', () => onSelect?.(item.id));
      markersRef.current.set(item.id, { marker, item });
      created.push(marker);
    }

    return () => created.forEach((m) => m.setMap(null));
    // selectedId 는 아래 효과에서 아이콘만 갈아끼운다 (마커 재생성 방지)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusters, singles, ready]);

  /* 선택 강조 */
  const prevSelected = useRef(null);
  useEffect(() => {
    const maps = mapsRef.current;
    if (!maps) return;
    const repaint = (id, selected) => {
      const entry = markersRef.current.get(id);
      if (!entry) return;
      entry.marker.setIcon({ content: pinHtml(entry.item, selected), anchor: new maps.Point(0, 0) });
      entry.marker.setZIndex(selected ? 200 : entry.item.status === 'open' ? 60 : 40);
    };
    if (prevSelected.current && prevSelected.current !== selectedId) repaint(prevSelected.current, false);
    if (selectedId) repaint(selectedId, true);
    prevSelected.current = selectedId;
  }, [selectedId, clusters, singles]);

  /* 리스트에서 고른 단지로 이동 */
  useEffect(() => {
    const maps = mapsRef.current;
    const map = mapRef.current;
    if (!maps || !map || !focusRequest?.lat) return;
    map.morph(new maps.LatLng(focusRequest.lat, focusRequest.lng), Math.max(map.getZoom(), 14), {
      duration: 400,
      easing: 'easeOutCubic',
    });
  }, [focusRequest]);

  const zoomBy = (delta) => {
    const map = mapRef.current;
    if (map) map.setZoom(map.getZoom() + delta, true);
  };

  return (
    <div className="mapview">
      <div className="mapview__canvas" ref={hostRef} />
      <div className="mapview__zoom">
        <button type="button" onClick={() => zoomBy(1)} aria-label="확대">
          +
        </button>
        <button type="button" onClick={() => zoomBy(-1)} aria-label="축소">
          −
        </button>
      </div>
      {clusters.length > 0 && ready && (
        <div className="mapview__hint">동그라미를 누르거나 확대하면 단지별로 펼쳐집니다</div>
      )}
    </div>
  );
}
