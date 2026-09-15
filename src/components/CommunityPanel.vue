<script setup>
import { computed, ref } from 'vue';
import { CATEGORIES, CATEGORY_LABEL, communityStore, formatPostDate } from '../stores/community';
import { NOTICE_BY_ID } from '../lib/notices';

const props = defineProps({
  notice: { type: Object, required: true },
});

const emit = defineEmits(['goto-notice']);

const sort = ref('latest');
const openComments = ref(new Set());
const draft = ref({ category: '분위기', title: '', content: '', author: '' });
const commentDraft = ref({});
const writing = ref(false);
const error = ref('');

const posts = computed(() => communityStore.postsFor(props.notice.id, sort.value));
const nearby = computed(() => communityStore.nearbyPostsFor(props.notice));

function noticeTitle(id) {
  return NOTICE_BY_ID.get(id)?.title ?? '다른 단지';
}

function toggleComments(id) {
  const next = new Set(openComments.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  openComments.value = next;
}

function submitPost() {
  const title = draft.value.title.trim();
  const content = draft.value.content.trim();
  if (!title) return (error.value = '제목을 입력해 주세요.');
  if (!content) return (error.value = '내용을 입력해 주세요.');

  communityStore.addPost({
    noticeId: props.notice.id,
    category: draft.value.category,
    title,
    content,
    author: draft.value.author.trim(),
  });
  draft.value = { category: draft.value.category, title: '', content: '', author: draft.value.author };
  error.value = '';
  writing.value = false;
  sort.value = 'latest';
}

function submitComment(postId) {
  const text = (commentDraft.value[postId] ?? '').trim();
  if (!text) return;
  communityStore.addComment(postId, text, '');
  commentDraft.value = { ...commentDraft.value, [postId]: '' };
  const next = new Set(openComments.value);
  next.add(postId);
  openComments.value = next;
}
</script>

<template>
  <div class="community">
    <div class="community__head">
      <div>
        <strong>{{ notice.title }}</strong>
        <span>{{ notice.placeLabel }} · 글 {{ posts.length }}개</span>
      </div>
      <select v-model="sort" aria-label="정렬">
        <option value="latest">최신순</option>
        <option value="likes">공감순</option>
      </select>
    </div>

    <p class="community__disclaimer">
      이 게시판은 <b>브라우저에만 저장되는 데모</b>예요. 같은 기기에서만 보이며 다른 사람과 공유되지 않습니다.
    </p>

    <button v-if="!writing" type="button" class="btn btn--primary community__write" @click="writing = true">
      이 단지에 글 남기기
    </button>

    <form v-else class="community__form" @submit.prevent="submitPost">
      <div class="community__formrow">
        <select v-model="draft.category" aria-label="주제">
          <option v-for="c in CATEGORIES" :key="c.value" :value="c.value">{{ c.label }}</option>
        </select>
        <input v-model="draft.author" maxlength="20" placeholder="닉네임 (선택)" aria-label="닉네임" />
      </div>
      <input v-model="draft.title" maxlength="60" placeholder="제목" aria-label="제목" />
      <textarea v-model="draft.content" rows="4" maxlength="1000" placeholder="이 단지·동네 이야기를 남겨보세요" />
      <p v-if="error" class="community__error">{{ error }}</p>
      <div class="community__formfoot">
        <button type="button" class="btn" @click="((writing = false), (error = ''))">취소</button>
        <button type="submit" class="btn btn--primary">등록</button>
      </div>
    </form>

    <p v-if="!posts.length" class="community__empty">
      아직 이 단지에 글이 없어요.<br />가장 먼저 분위기·호재·생활 정보를 남겨보세요.
    </p>

    <article v-for="p in posts" :key="p.id" class="post">
      <div class="post__top">
        <span class="post__cat">{{ CATEGORY_LABEL[p.category] }}</span>
        <span class="post__meta">{{ p.author }} · {{ formatPostDate(p.createdAt) }}</span>
      </div>
      <h4 class="post__title">{{ p.title }}</h4>
      <p class="post__content">{{ p.content }}</p>
      <div class="post__foot">
        <button type="button" :class="{ 'is-on': p.likedByMe }" @click="communityStore.toggleLike(p.id)">
          {{ p.likedByMe ? '♥' : '♡' }} 공감 {{ p.likes }}
        </button>
        <button type="button" @click="toggleComments(p.id)">💬 댓글 {{ p.comments.length }}</button>
      </div>

      <div v-if="openComments.has(p.id)" class="post__comments">
        <div v-for="c in p.comments" :key="c.id" class="comment">
          <b>{{ c.author }}</b>
          <span>{{ c.content }}</span>
          <em>{{ formatPostDate(c.createdAt) }}</em>
        </div>
        <p v-if="!p.comments.length" class="comment comment--empty">첫 댓글을 남겨보세요.</p>
        <form class="comment__form" @submit.prevent="submitComment(p.id)">
          <input
            :value="commentDraft[p.id] ?? ''"
            maxlength="200"
            placeholder="댓글 달기"
            aria-label="댓글"
            @input="commentDraft = { ...commentDraft, [p.id]: $event.target.value }"
          />
          <button type="submit">등록</button>
        </form>
      </div>
    </article>

    <section v-if="nearby.length" class="community__nearby">
      <h5>같은 지역({{ notice.region }}) 다른 단지 이야기</h5>
      <button v-for="p in nearby" :key="p.id" type="button" class="nearby" @click="emit('goto-notice', p.noticeId)">
        <span class="nearby__title">{{ p.title }}</span>
        <span class="nearby__meta">{{ noticeTitle(p.noticeId) }} · 공감 {{ p.likes }}</span>
      </button>
    </section>
  </div>
</template>
