<script setup>
import { computed } from 'vue';
import { NOTICE_BY_ID } from '../lib/notices';
import { CATEGORY_LABEL, communityStore, formatPostDate } from '../stores/community';

const emit = defineEmits(['open-notice']);

/** 사이드바의 커뮤니티 탭 — 단지에 달린 글을 최신순으로 모아 보여 준다. */
const posts = computed(() =>
  communityStore.recent(30).map((p) => ({ ...p, notice: p.noticeId ? NOTICE_BY_ID.get(p.noticeId) : null }))
);
</script>

<template>
  <div class="feed">
    <p class="feed__lead">
      커뮤니티는 <b>단지별</b>로 열려 있어요. 글을 누르면 그 단지 상세의 커뮤니티로 바로 이동합니다.
    </p>
    <p v-if="!posts.length" class="community__empty">아직 글이 없어요. 지도에서 단지를 고르고 첫 글을 남겨보세요.</p>
    <button v-for="p in posts" :key="p.id" type="button" class="feed__item" @click="emit('open-notice', p.noticeId)">
      <span class="feed__where">{{ p.notice?.title ?? '단지 미상' }}</span>
      <span class="feed__title">{{ p.title }}</span>
      <span class="feed__meta">
        {{ CATEGORY_LABEL[p.category] }} · {{ p.author }} · {{ formatPostDate(p.createdAt) }} · ♥ {{ p.likes }} · 💬
        {{ p.comments.length }}
      </span>
    </button>
  </div>
</template>
