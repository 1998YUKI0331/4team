<script setup>
import { defineAsyncComponent, onMounted, onUnmounted, watch } from 'vue';
import TopBar from './components/TopBar.vue';
import FilterBar from './components/FilterBar.vue';
import NoticeCard from './components/NoticeCard.vue';
import MatchPanel from './components/MatchPanel.vue';
import CommunityModal from './components/CommunityModal.vue';
import CalendarModal from './components/CalendarModal.vue';
import MapView from './components/MapView.vue';
import MapNotice from './components/MapNotice.vue';
import DetailPanel from './components/DetailPanel.vue';
import BuddyMascot from './components/BuddyMascot.vue';
import GeumgaengRun from './components/GeumgaengRun.vue';
import { useMediaQuery } from './composables/useMediaQuery';
import { NOTICE_BY_ID, NOTICES } from './lib/notices';
import {
  closeDetail,
  focusOn,
  initApp,
  listed,
  matchOf,
  outOfViewCount,
  selected,
  selectedMatch,
  ui,
} from './stores/app';
import { serverState } from './stores/server';
import { buddyState, closeGeumgaengRun, installBuddyClickDelay } from './stores/buddy';

/**
 * 청약 로드(3D 게임)는 Three.js 를 끌고 들어와 500KB 가 넘는다.
 * 지도만 쓰는 사용자가 그 값을 치르지 않도록 게임 탭을 처음 열 때만 받아 온다.
 */
const GameView = defineAsyncComponent({
  loader: () => import('./components/GameView.vue'),
  delay: 120,
});

/**
 * 커뮤니티를 상세 패널 "탭" 으로 넣을지, 화면 위에 "레이어 팝업" 으로 띄울지의 기준.
 * 상세 패널(420px)이 지도를 다 덮지 않고 커뮤니티 글까지 읽을 만한 폭이 나올 때만 탭으로 연다.
 */
const roomy = useMediaQuery('(min-width: 1180px)');

/** 모바일 폭 — 상세/목록 시트가 화면을 덮으면 금갱이는 잠시 내려간다. */
const compact = useMediaQuery('(max-width: 960px)');

function selectDetailTab(tab) {
  if (tab === 'community' && !roomy.value) {
    ui.communityPopup = true;
    return;
  }
  ui.communityPopup = false;
  ui.detailTab = tab;
}

/** 커뮤니티 글에서 다른 단지로 건너뛰기 */
function gotoNotice(id) {
  const item = NOTICE_BY_ID.get(id);
  if (!item) return;
  focusOn(item);
  selectDetailTab('community');
  ui.sheetOpen = false;
}

function onCardSelect(item) {
  focusOn(item);
  ui.detailTab = 'info';
}

/** 캘린더 목록에서 공고를 골라 상세로 이동 */
function openFromCalendar(id) {
  const item = NOTICE_BY_ID.get(id);
  if (!item) return;
  focusOn(item);
  ui.detailTab = 'info';
  ui.calendarOpen = false;
}

// 화면 폭이 바뀌면 열려 있던 커뮤니티를 알맞은 자리로 옮겨 준다.
watch(roomy, (wide) => {
  if (!selected.value) return;
  if (wide && ui.communityPopup) {
    ui.communityPopup = false;
    ui.detailTab = 'community';
  } else if (!wide && ui.detailTab === 'community') {
    ui.detailTab = 'info';
    ui.communityPopup = true;
  }
});

function onKeydown(e) {
  if (e.key !== 'Escape') return;
  if (ui.communityPopup) return; // 팝업이 스스로 닫는다
  if (selected.value) closeDetail();
}

/** 금갱이가 클릭을 0.5초 붙잡아 두는 동안 타자를 친다. 해제 함수를 받아 둔다. */
let uninstallBuddy = () => {};

onMounted(() => {
  document.addEventListener('keydown', onKeydown);
  uninstallBuddy = installBuddyClickDelay();
  initApp(); // 방문수·글 수·저장된 내 조건 불러오기 (실패해도 화면은 그대로)
});

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown);
  uninstallBuddy();
});
</script>

<template>
  <div class="app">
    <TopBar />

    <p v-if="serverState.ready && !serverState.online" class="offline">
      서버에 연결하지 못했습니다. 커뮤니티와 방문 순위는 잠시 사용할 수 없어요.
      <button type="button" @click="initApp">다시 시도</button>
    </p>

    <GameView v-if="ui.view === 'game'" />

    <div v-show="ui.view === 'map'" class="app__body">
      <section class="sidebar" :class="{ 'is-open': ui.sheetOpen }">
        <button
          type="button"
          class="sidebar__handle"
          :aria-label="ui.sheetOpen ? '목록 접기' : '목록 펼치기'"
          @click="ui.sheetOpen = !ui.sheetOpen"
        >
          <span />
          목록 {{ listed.length }}건
        </button>

        <div class="sidebar__body">
          <MatchPanel />
          <FilterBar :shown="listed.length" :total="NOTICES.length" />

          <div class="sidebar__list">
            <NoticeCard
              v-for="item in listed"
              :key="item.id"
              :item="item"
              :selected="item.id === ui.selectedId"
              :match="matchOf(item.id)"
              @select="onCardSelect"
            />
            <p v-if="!listed.length" class="sidebar__empty">조건에 맞는 공고가 없습니다.</p>
            <p v-if="outOfViewCount > 0" class="sidebar__more">
              지도 밖에 {{ outOfViewCount }}건 더 있습니다. 지도를 축소해 보세요.
            </p>
          </div>
        </div>
      </section>

      <main class="stage">
        <MapView v-if="!ui.mapError" />
        <MapNotice v-else :error="ui.mapError" />

        <div class="legend">
          <span><i style="background: #ff5a36" />민간분양</span>
          <span><i style="background: #2f6bff" />공공분양</span>
          <span><i style="background: #00b06b" />임대</span>
          <span v-if="ui.matchOn" class="legend__match"><i class="legend__check">✓</i>내 조건 충족</span>
        </div>

        <DetailPanel
          v-if="selected"
          :item="selected"
          :match="selectedMatch"
          :tab="ui.detailTab"
          @close="closeDetail"
          @focus="focusOn"
          @select-tab="selectDetailTab"
          @goto-notice="gotoNotice"
        />
      </main>
    </div>

    <!-- 금갱이는 두 탭에 모두 상주한다. 다만 비켜서기·숨기기는 지도 화면의 사정이다. -->
    <BuddyMascot
      :shifted="ui.view === 'map' && roomy && !!selected && !ui.communityPopup"
      :tucked="ui.view === 'map' && compact && (!!selected || ui.sheetOpen)"
    />

    <CommunityModal
      v-if="ui.view === 'map' && selected && ui.communityPopup"
      :notice="selected"
      @close="ui.communityPopup = false"
      @goto-notice="gotoNotice"
    />

    <CalendarModal v-if="ui.calendarOpen" @close="ui.calendarOpen = false" @goto-notice="openFromCalendar" />

    <GeumgaengRun v-if="buddyState.gameOpen" @close="closeGeumgaengRun" />
  </div>
</template>
