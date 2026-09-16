<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import { formatDate, statusLabelOf } from '../lib/notices';
import { scheduleStore } from '../stores/schedule';

/**
 * 상단 "캘린더" 버튼으로 여는 청약마감 캘린더.
 * 공고 상세에서 "캘린더에 저장"을 누른 공고를 마감일 달력에 표시하고,
 * 아래 목록에서 바로 상세로 이동하거나 저장을 해제할 수 있다.
 */

const emit = defineEmits(['close', 'goto-notice']);

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

const today = new Date();
today.setHours(0, 0, 0, 0);

const dateKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const todayKey = dateKey(today);

const view = reactive({ year: today.getFullYear(), month: today.getMonth() });
const selectedKey = ref(null);

const saved = computed(() => scheduleStore.saved.value);
const dated = computed(() => saved.value.filter((n) => n.deadlineDate));
const undated = computed(() => saved.value.filter((n) => !n.deadlineDate));

const byDate = computed(() => {
  const map = new Map();
  for (const item of dated.value) {
    const key = dateKey(item.deadlineDate);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
});

const monthLabel = computed(() => `${view.year}년 ${view.month + 1}월`);

const cells = computed(() => {
  const first = new Date(view.year, view.month, 1);
  const start = new Date(view.year, view.month, 1 - first.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const key = dateKey(d);
    return {
      key,
      day: d.getDate(),
      inMonth: d.getMonth() === view.month,
      isToday: key === todayKey,
      items: byDate.value.get(key) ?? [],
    };
  });
});

function prevMonth() {
  const d = new Date(view.year, view.month - 1, 1);
  view.year = d.getFullYear();
  view.month = d.getMonth();
}
function nextMonth() {
  const d = new Date(view.year, view.month + 1, 1);
  view.year = d.getFullYear();
  view.month = d.getMonth();
}
function goToday() {
  view.year = today.getFullYear();
  view.month = today.getMonth();
  selectedKey.value = null;
}

function selectDay(cell) {
  if (!cell.items.length) return;
  selectedKey.value = selectedKey.value === cell.key ? null : cell.key;
}

const visibleList = computed(() => (selectedKey.value ? (byDate.value.get(selectedKey.value) ?? []) : dated.value));

function open(item) {
  emit('goto-notice', item.id);
}

function remove(item) {
  scheduleStore.toggle(item.id);
}
</script>

<template>
  <Teleport to="body">
    <div class="layer" role="dialog" aria-modal="true" aria-label="청약마감 캘린더">
      <div class="layer__dim" @click="emit('close')" />
      <div class="layer__panel calendar">
        <header class="layer__head">
          <div>
            <strong>청약마감 캘린더</strong>
            <span>저장한 공고 {{ saved.length }}건</span>
          </div>
          <button type="button" class="detail__close" aria-label="닫기" @click="emit('close')">×</button>
        </header>

        <div class="layer__body calendar__body">
          <div class="calendar__nav">
            <button type="button" aria-label="이전 달" @click="prevMonth">‹</button>
            <button type="button" class="calendar__month" @click="goToday">{{ monthLabel }}</button>
            <button type="button" aria-label="다음 달" @click="nextMonth">›</button>
          </div>

          <div class="calendar__grid">
            <span v-for="w in ['일', '월', '화', '수', '목', '금', '토']" :key="w" class="calendar__dow">{{ w }}</span>
            <button
              v-for="cell in cells"
              :key="cell.key"
              type="button"
              class="calendar__cell"
              :class="{
                'is-out': !cell.inMonth,
                'is-today': cell.isToday,
                'is-selected': selectedKey === cell.key,
                'has-items': cell.items.length > 0,
              }"
              :disabled="!cell.items.length"
              @click="selectDay(cell)"
            >
              <span class="calendar__date">{{ cell.day }}</span>
              <i v-if="cell.items.length" class="calendar__dot">{{ cell.items.length }}</i>
            </button>
          </div>

          <div class="calendar__listhead">
            <strong>{{ selectedKey ? `${selectedKey} 마감` : '저장한 일정' }}</strong>
            <button v-if="selectedKey" type="button" class="calendar__clear" @click="selectedKey = null">전체보기</button>
          </div>

          <ul v-if="visibleList.length" class="calendar__list">
            <li v-for="item in visibleList" :key="item.id">
              <button type="button" class="calendar__item" @click="open(item)">
                <span class="badge calendar__badge" :class="`badge--${item.status}`">{{ statusLabelOf(item) }}</span>
                <span class="calendar__title">{{ item.title }}</span>
                <span class="calendar__date2">{{ formatDate(item.deadline) }}</span>
              </button>
              <button type="button" class="calendar__remove" aria-label="캘린더에서 삭제" @click="remove(item)">×</button>
            </li>
          </ul>
          <p v-else class="calendar__empty">저장한 청약 일정이 없습니다. 공고 상세에서 "캘린더에 저장"을 눌러보세요.</p>

          <div v-if="!selectedKey && undated.length" class="calendar__undated">
            <strong>마감일 미정</strong>
            <ul class="calendar__list">
              <li v-for="item in undated" :key="item.id">
                <button type="button" class="calendar__item" @click="open(item)">
                  <span class="calendar__title">{{ item.title }}</span>
                  <span class="calendar__date2">공고문 참고</span>
                </button>
                <button type="button" class="calendar__remove" aria-label="캘린더에서 삭제" @click="remove(item)">×</button>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
