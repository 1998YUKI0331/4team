import { computed, reactive, watch } from 'vue';
import {
  NOTICES,
  NOTICE_BY_ID,
  applyFilters,
  countActiveFilters,
  createFilters,
  DEFAULT_FILTERS,
} from '../lib/notices';
import { createProfile, evaluateAll } from '../lib/matching';
import { api } from '../lib/api';
import { communityStore } from './community';
import { markOffline, markOnline, serverState } from './server';
import { visitStore } from './visits';

/**
 * 화면 전체가 공유하는 상태. 지도·목록·상세가 같은 선택/필터를 보기 때문에
 * prop 을 길게 내려보내는 대신 작은 스토어 하나로 둔다.
 */

export const filters = reactive(createFilters());
export const profile = reactive(createProfile());

export const ui = reactive({
  /** 내 조건(매칭) 사용 여부 */
  matchOn: false,
  /** 사이드바 맨 위 "내 조건 필터" 펼침 상태 — 기본은 펼침 */
  matchOpen: true,
  /** 상세 패널 탭: info | community */
  detailTab: 'info',
  selectedId: null,
  /** 지도 영역 안쪽만 목록에 보여줄지 */
  syncMap: true,
  /** 모바일 바텀시트 열림 */
  sheetOpen: false,
  /** 좁은 화면에서 커뮤니티를 레이어 팝업으로 띄울 때 */
  communityPopup: false,
  viewport: null,
  focusRequest: null,
  mapError: null,
});

export const matches = computed(() => (ui.matchOn ? evaluateAll(NOTICES, profile) : null));

export const matchedCount = computed(() => {
  if (!matches.value) return 0;
  let n = 0;
  for (const r of matches.value.values()) if (r.ok) n += 1;
  return n;
});

/** 등급별 건수 — "특별공급 12건 · 일반공급 23건" 같은 요약에 쓴다. */
export const matchTierCounts = computed(() => {
  const counts = { special: 0, check: 0, general: 0, no: 0 };
  if (!matches.value) return counts;
  for (const r of matches.value.values()) counts[r.tier] += 1;
  return counts;
});

/** 지도에 찍히는 건 필터 결과 전체 */
export const filtered = computed(() => applyFilters(NOTICES, filters, matches.value));

/** 리스트는 화면 안쪽만(옵션) */
export const listed = computed(() => {
  const all = filtered.value;
  if (!ui.syncMap || !ui.viewport?.bounds) return all;
  const { south, west, north, east } = ui.viewport.bounds;
  const inside = all.filter(
    (n) => n.lat != null && n.lat >= south && n.lat <= north && n.lng >= west && n.lng <= east
  );
  return inside.length ? inside : all;
});

export const outOfViewCount = computed(() =>
  ui.syncMap && ui.viewport?.bounds ? filtered.value.length - listed.value.length : 0
);

export const selected = computed(() => (ui.selectedId ? (NOTICE_BY_ID.get(ui.selectedId) ?? null) : null));

export const selectedMatch = computed(() =>
  matches.value && ui.selectedId ? (matches.value.get(ui.selectedId) ?? null) : null
);

export const activeFilterCount = computed(() => countActiveFilters(filters));

// 매칭을 끄면 "내 조건 충족만" 필터도 같이 내려 준다.
watch(
  () => ui.matchOn,
  (on) => {
    if (!on) filters.matchOnly = false;
  }
);

export function matchOf(id) {
  return matches.value?.get(id) ?? null;
}

/** 상세를 여는 모든 경로가 거쳐 가는 자리. 여기서만 방문수를 센다(서버 기록). */
function markVisit(id) {
  if (id && id !== ui.selectedId) visitStore.visit(id);
}

export function select(id) {
  markVisit(id);
  ui.selectedId = id;
  ui.detailTab = 'info';
  ui.communityPopup = false;
  ui.sheetOpen = false;
}

export function closeDetail() {
  ui.selectedId = null;
  ui.communityPopup = false;
}

/** 목록에서 고른 단지로 지도를 옮긴다 */
export function focusOn(item) {
  if (!item) return;
  markVisit(item.id);
  ui.selectedId = item.id;
  ui.sheetOpen = false;
  if (item.lat != null && item.lng != null) {
    ui.focusRequest = { lat: item.lat, lng: item.lng, at: Date.now() };
  }
}

export function toggleFilter(key, value) {
  const list = filters[key];
  const idx = list.indexOf(value);
  if (idx >= 0) list.splice(idx, 1);
  else list.push(value);
}

export function resetFilters() {
  Object.assign(filters, DEFAULT_FILTERS, { categories: [], regions: [], specials: [] });
}

export { NOTICES };

/* ------------------------------------------------------------ 서버 동기화 */

/**
 * 앱이 뜰 때 한 번: 방문수·글 수·저장해 둔 내 조건을 받아 온다.
 * 서버가 죽어 있어도 지도/목록/상세는 그대로 보이게 실패를 삼킨다(배너만 뜬다).
 */
export async function initApp() {
  try {
    const data = await api.bootstrap();
    visitStore.hydrate(data.visits);
    communityStore.hydrateCounts(data.postCounts);
    if (data.profile && Object.keys(data.profile).length) Object.assign(profile, data.profile);
    markOnline();
  } catch (e) {
    markOffline(e);
  } finally {
    serverState.ready = true;
  }
}

/** 내 조건은 입력할 때마다가 아니라, 손을 멈추면 한 번 저장한다. */
let saveTimer = null;

watch(
  () => ({ ...profile }),
  () => {
    if (!serverState.ready) return; // 부트스트랩이 덮어쓰는 값은 저장하지 않는다
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        await api.saveProfile({ ...profile });
        markOnline();
      } catch (e) {
        if (e.offline) markOffline(e);
      }
    }, 700);
  },
  { deep: true }
);
