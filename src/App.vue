<script setup>
import { computed, onMounted, onUnmounted, watch } from 'vue';
import TopBar from './components/TopBar.vue';
import FilterBar from './components/FilterBar.vue';
import NoticeCard from './components/NoticeCard.vue';
import MatchPanel from './components/MatchPanel.vue';
import CommunityFeed from './components/CommunityFeed.vue';
import CommunityModal from './components/CommunityModal.vue';
import MapView from './components/MapView.vue';
import MapNotice from './components/MapNotice.vue';
import DetailPanel from './components/DetailPanel.vue';
import { useMediaQuery } from './composables/useMediaQuery';
import { NOTICE_BY_ID, NOTICES } from './lib/notices';
import { communityStore } from './stores/community';
import { closeDetail, focusOn, listed, matchOf, outOfViewCount, selected, selectedMatch, ui } from './stores/app';

/**
 * 커뮤니티를 상세 패널 "탭" 으로 넣을지, 화면 위에 "레이어 팝업" 으로 띄울지의 기준.
 * 상세 패널(396px)이 지도를 다 덮지 않고 커뮤니티 글까지 읽을 만한 폭이 나올 때만 탭으로 연다.
 */
const roomy = useMediaQuery('(min-width: 1180px)');

const totalPosts = computed(() => communityStore.posts.value.length);

const SIDEBAR_TABS = computed(() => [
  { key: 'list', label: `공고 ${listed.value.length}` },
  { key: 'match', label: ui.matchOn ? '내 조건 ✓' : '내 조건' },
  { key: 'community', label: `커뮤니티 ${totalPosts.value}` },
]);

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

onMounted(() => document.addEventListener('keydown', onKeydown));
onUnmounted(() => document.removeEventListener('keydown', onKeydown));
</script>

<template>
  <div class="app">
    <TopBar />

    <div class="app__body">
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

        <nav class="sidebar__tabs">
          <button
            v-for="t in SIDEBAR_TABS"
            :key="t.key"
            type="button"
            :class="{ 'is-on': ui.sidebarTab === t.key }"
            @click="ui.sidebarTab = t.key"
          >
            {{ t.label }}
          </button>
        </nav>

        <div v-show="ui.sidebarTab === 'list'" class="sidebar__pane">
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

        <div v-show="ui.sidebarTab === 'match'" class="sidebar__pane sidebar__pane--scroll">
          <MatchPanel />
        </div>

        <div v-show="ui.sidebarTab === 'community'" class="sidebar__pane sidebar__pane--scroll">
          <CommunityFeed @open-notice="gotoNotice" />
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

    <CommunityModal
      v-if="selected && ui.communityPopup"
      :notice="selected"
      @close="ui.communityPopup = false"
      @goto-notice="gotoNotice"
    />
  </div>
</template>
