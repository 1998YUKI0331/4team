<script setup>
import { computed, ref, watch } from 'vue';
import {
  ASSET_LIMIT,
  baselineIncome,
  DEFAULT_PROFILE,
  incomePercent,
  isMarried,
  MARITAL_OPTIONS,
  monthlyFromAnnual,
  REGION_OPTIONS,
  totalAssets,
} from '../lib/matching';
import { filters, matchTierCounts, matchedCount, matches, profile, ui } from '../stores/app';
import { NOTICES } from '../lib/notices';

const pct = computed(() => incomePercent(profile));
const base = computed(() => baselineIncome(profile.household));

/** 자녀 수는 기혼(예비 포함)일 때만 묻는다 */
const married = computed(() => isMarried(profile));

// 미혼으로 되돌리면 자녀 수를 0 으로 정리한다.
// 숨긴 채로 값이 남아 있으면 보이지도 않는 입력이 다자녀 판정을 좌우한다.
watch(married, (on) => {
  if (!on) profile.children = 0;
});

/* ── 가구 월평균 소득 계산기 ───────────────────────── */
const calcOpen = ref(false);
const calcMonthly = computed(() => monthlyFromAnnual(profile));

function applyCalc() {
  profile.income = calcMonthly.value;
  calcOpen.value = false;
}

/* ── 총자산 ───────────────────────────────────────── */
const assets = computed(() => totalAssets(profile));
const assetOver = computed(() => assets.value > ASSET_LIMIT.total);
const carOver = computed(() => (Number(profile.assetCar) || 0) > ASSET_LIMIT.car);
const eok = (man) => (man / 10000).toFixed(2);

/** 접었을 때 머리글에 남기는 한 줄 요약 */
const summary = computed(() => {
  if (!ui.matchOn) return '꺼짐 · 펼쳐서 조건 입력';
  return `${matchedCount.value}건 충족 · 특별공급 ${matchTierCounts.value.special}건`;
});

/** 조건에 막힌 사유를 한 줄 요약으로 (많이 걸리는 순서대로) */
const topBlockers = computed(() => {
  if (!matches.value) return [];
  const count = new Map();
  for (const r of matches.value.values()) {
    if (r.ok) continue;
    const reason = r.blockers[0] ?? r.missed[0]?.reason ?? '해당 유형 없음';
    count.set(reason, (count.get(reason) ?? 0) + 1);
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
});

function reset() {
  Object.assign(profile, DEFAULT_PROFILE);
}
</script>

<template>
  <section class="matchbar" :class="{ 'is-open': ui.matchOpen, 'is-active': ui.matchOn }">
    <button
      type="button"
      class="matchbar__head"
      :aria-expanded="ui.matchOpen"
      aria-controls="matchbar-body"
      @click="ui.matchOpen = !ui.matchOpen"
    >
      <b>내 조건 필터</b>
      <span class="matchbar__summary">{{ summary }}</span>
      <svg class="matchbar__chevron" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M4 6.5 8 10.5 12 6.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      </svg>
    </button>

    <div v-show="ui.matchOpen" id="matchbar-body" class="matchpanel">
      <label class="matchpanel__switch">
        <input type="checkbox" v-model="ui.matchOn" />
        <span>
          <b>내 조건으로 자격 확인</b>
          <em>켜면 목록·지도에 내 조건 충족 여부가 표시됩니다</em>
        </span>
      </label>

      <div class="field">
        <label for="mp-marital">혼인 상태</label>
        <select id="mp-marital" v-model="profile.marital">
          <option v-for="o in MARITAL_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
      </div>

      <div class="field-row">
        <div class="field">
          <label for="mp-age">만 나이</label>
          <input id="mp-age" type="number" min="19" max="90" inputmode="numeric" v-model.number="profile.age" />
        </div>
        <div class="field">
          <label for="mp-household">가구원 수</label>
          <input
            id="mp-household"
            type="number"
            min="1"
            max="8"
            inputmode="numeric"
            v-model.number="profile.household"
          />
        </div>
      </div>

      <!-- 자녀 수는 기혼(예비 포함)일 때만 -->
      <div v-if="married" class="field">
        <label for="mp-children">자녀 수</label>
        <div class="unit">
          <input id="mp-children" type="number" min="0" max="6" inputmode="numeric" v-model.number="profile.children" />
          <span>명</span>
        </div>
        <p class="field__hint">미성년 자녀 기준 · 다자녀 특별공급은 보통 2명 이상</p>
      </div>

      <fieldset class="checks">
        <legend>해당 사항</legend>
        <label><input type="checkbox" v-model="profile.noHouse" /> 무주택 세대구성원에 해당한다</label>
        <label><input type="checkbox" v-model="profile.firstHome" /> 생애 최초로 주택을 구입한다</label>
        <label><input type="checkbox" v-model="profile.newborn" /> 2년 이내 출생한 자녀가 있다</label>
        <label>
          <input type="checkbox" v-model="profile.parentSupport" /> 만 65세 이상 직계존속을 3년 이상 부양 중이다
        </label>
      </fieldset>

      <!-- ── 가구 월평균 소득 ───────────────────────── -->
      <div class="field">
        <label for="mp-income">가구 월평균소득</label>
        <div class="unit">
          <input id="mp-income" type="number" min="0" step="10" inputmode="numeric" v-model.number="profile.income" />
          <span>만원</span>
        </div>
        <p class="field__hint">
          세전 · 배우자 포함 · {{ profile.household }}인 기준 {{ base.toLocaleString() }}만원 대비
          <b :class="pct > 160 ? 'is-over' : 'is-ok'">{{ pct }}%</b>
        </p>
        <button type="button" class="linkish mp-calc__toggle" :aria-expanded="calcOpen" @click="calcOpen = !calcOpen">
          {{ calcOpen ? '계산기 닫기' : '연소득으로 계산하기' }}
        </button>

        <div v-show="calcOpen" class="mp-calc">
          <p class="mp-calc__lead">전년도 <b>세전 연소득</b>을 넣으면 12로 나눠 월평균을 잡아 줍니다.</p>
          <div class="field-row">
            <div class="field">
              <label for="mp-inc-self">본인 연소득</label>
              <div class="unit">
                <input id="mp-inc-self" type="number" min="0" step="100" inputmode="numeric" v-model.number="profile.incomeSelf" />
                <span>만원</span>
              </div>
            </div>
            <div class="field">
              <label for="mp-inc-spouse">배우자 연소득</label>
              <div class="unit">
                <input
                  id="mp-inc-spouse"
                  type="number"
                  min="0"
                  step="100"
                  inputmode="numeric"
                  :disabled="!married"
                  v-model.number="profile.incomeSpouse"
                />
                <span>만원</span>
              </div>
            </div>
          </div>
          <div class="field">
            <label for="mp-inc-other">기타 소득 (사업·임대 등)</label>
            <div class="unit">
              <input id="mp-inc-other" type="number" min="0" step="100" inputmode="numeric" v-model.number="profile.incomeOther" />
              <span>만원</span>
            </div>
          </div>
          <div class="mp-calc__out">
            <span>월평균</span>
            <b>{{ calcMonthly.toLocaleString() }}만원</b>
            <button type="button" class="mp-calc__apply" @click="applyCalc">이 값으로 넣기</button>
          </div>
        </div>
      </div>

      <!-- ── 총자산 ─────────────────────────────────── -->
      <fieldset class="mp-group">
        <legend>총자산</legend>
        <div class="field-row">
          <div class="field">
            <label for="mp-as-realty">부동산</label>
            <div class="unit">
              <input id="mp-as-realty" type="number" min="0" step="100" inputmode="numeric" v-model.number="profile.assetRealty" />
              <span>만원</span>
            </div>
          </div>
          <div class="field">
            <label for="mp-as-car">자동차</label>
            <div class="unit">
              <input id="mp-as-car" type="number" min="0" step="100" inputmode="numeric" v-model.number="profile.assetCar" />
              <span>만원</span>
            </div>
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label for="mp-as-fin">금융자산</label>
            <div class="unit">
              <input id="mp-as-fin" type="number" min="0" step="100" inputmode="numeric" v-model.number="profile.assetFinance" />
              <span>만원</span>
            </div>
          </div>
          <div class="field">
            <label for="mp-as-etc">일반자산</label>
            <div class="unit">
              <input id="mp-as-etc" type="number" min="0" step="100" inputmode="numeric" v-model.number="profile.assetEtc" />
              <span>만원</span>
            </div>
          </div>
        </div>
        <p class="mp-total" :class="{ 'is-over': assetOver || carOver }">
          합계 <b>{{ assets.toLocaleString() }}만원</b> <em>({{ eok(assets) }}억)</em>
          <span v-if="assetOver"> · 공공 특별공급 자산기준 {{ eok(ASSET_LIMIT.total) }}억 초과</span>
          <span v-else-if="carOver"> · 자동차 기준 {{ ASSET_LIMIT.car.toLocaleString() }}만원 초과</span>
        </p>
        <p class="field__hint">LH·SH 공공 공고의 특별공급에만 적용됩니다. 민영주택은 자산기준이 없습니다.</p>
      </fieldset>

      <!-- ── 거주지 · 소득 근거지 ───────────────────── -->
      <div class="field-row">
        <div class="field">
          <label for="mp-residence">거주지</label>
          <select id="mp-residence" v-model="profile.residence">
            <option v-for="o in REGION_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
        </div>
        <div class="field">
          <label for="mp-incomebase">소득 근거지</label>
          <select id="mp-incomebase" v-model="profile.incomeBase">
            <option v-for="o in REGION_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
        </div>
      </div>
      <p class="field__hint">
        거주지가 같으면 해당지역 우선공급 대상입니다. 직장(소득 근거지)만 같아도 지역 우선이 되는 경우가 있어 함께 봅니다.
      </p>

      <!-- ── 청약통장 ───────────────────────────────── -->
      <fieldset class="mp-group">
        <legend>청약통장</legend>
        <div class="field">
          <label for="mp-sub">가입 기간</label>
          <div class="unit">
            <input id="mp-sub" type="number" min="0" max="480" inputmode="numeric" v-model.number="profile.subMonths" />
            <span>개월</span>
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label for="mp-sub-count">납입 횟수</label>
            <div class="unit">
              <input id="mp-sub-count" type="number" min="0" max="480" inputmode="numeric" v-model.number="profile.subCount" />
              <span>회</span>
            </div>
          </div>
          <div class="field">
            <label for="mp-sub-total">납입 총액</label>
            <div class="unit">
              <input id="mp-sub-total" type="number" min="0" step="10" inputmode="numeric" v-model.number="profile.subTotal" />
              <span>만원</span>
            </div>
          </div>
        </div>
        <p class="field__hint">
          민영주택은 <b>납입 총액(예치금)</b>으로, 공공분양은 <b>납입 횟수</b>로 1순위를 가릅니다.
        </p>
      </fieldset>

      <div v-if="ui.matchOn" class="matchpanel__result">
        <p class="matchpanel__count">
          전체 {{ NOTICES.length }}건 중 <b>{{ matchedCount }}</b
          >건 신청 가능
        </p>
        <p class="matchpanel__tiers">
          특별공급 {{ matchTierCounts.special }}건 · 확인 필요 {{ matchTierCounts.check }}건 · 일반공급만
          {{ matchTierCounts.general }}건
        </p>
        <label class="matchpanel__only">
          <input type="checkbox" v-model="filters.matchOnly" />
          목록·지도에 충족 공고만 보기
        </label>
        <ul v-if="topBlockers.length" class="matchpanel__blockers">
          <li v-for="[reason, n] in topBlockers" :key="reason">
            {{ reason }} <span>{{ n }}건</span>
          </li>
        </ul>
        <button type="button" class="linkish" @click="reset">기본값으로 되돌리기</button>
      </div>
      <p v-else class="matchpanel__hint">
        조건을 켜면 {{ NOTICES.length }}건을 한 번에 훑어 자격을 표시합니다.
        <button type="button" class="linkish" @click="reset">기본값</button>
      </p>

      <p class="notice-tip">
        공고문 요약값 기준이라 실제 심사와 다를 수 있어요. 자동 확인이 안 되는 유형은 <b>확인 필요</b>로 표시합니다.
        입력값은 로그인 없이 브라우저 식별자에 묶여 서버에 저장되고, 다음에 열 때 그대로 불러옵니다.
      </p>
    </div>
  </section>
</template>
