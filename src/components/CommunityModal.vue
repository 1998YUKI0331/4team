<script setup>
import { onMounted, onUnmounted } from 'vue';
import CommunityPanel from './CommunityPanel.vue';

defineProps({ notice: { type: Object, required: true } });
const emit = defineEmits(['close', 'goto-notice']);

/** 좁은 화면에서는 상세 패널 안에 커뮤니티를 넣을 자리가 없어 레이어 팝업으로 띄운다. */
function onKey(e) {
  if (e.key === 'Escape') emit('close');
}

onMounted(() => {
  document.addEventListener('keydown', onKey);
  document.body.classList.add('is-locked');
});
onUnmounted(() => {
  document.removeEventListener('keydown', onKey);
  document.body.classList.remove('is-locked');
});
</script>

<template>
  <Teleport to="body">
    <div class="layer" role="dialog" aria-modal="true" aria-label="커뮤니티">
      <div class="layer__dim" @click="emit('close')" />
      <div class="layer__panel">
        <header class="layer__head">
          <div>
            <strong>커뮤니티</strong>
            <span>{{ notice.title }}</span>
          </div>
          <button type="button" class="detail__close" aria-label="닫기" @click="emit('close')">×</button>
        </header>
        <div class="layer__body">
          <CommunityPanel :notice="notice" @goto-notice="emit('goto-notice', $event)" />
        </div>
      </div>
    </div>
  </Teleport>
</template>
