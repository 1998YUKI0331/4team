<script setup>
import { computed } from 'vue';
import { MISSING_KEY } from '../lib/naverMaps';

const props = defineProps({ error: { type: Object, required: true } });
const missingKey = computed(() => props.error.code === MISSING_KEY);
</script>

<template>
  <div class="maperror">
    <h2>{{ missingKey ? '지도 키가 아직 설정되지 않았습니다' : '지도를 불러오지 못했습니다' }}</h2>
    <p>{{ error.message }}</p>
    <ol v-if="missingKey">
      <li>배포 환경(Railway 등)의 서비스 변수에 <code>NAVER_MAP_CLIENT_ID</code> 를 넣고 재배포</li>
      <li>로컬은 <code>.env</code> 에 <code>VITE_NAVER_MAP_CLIENT_ID</code> 를 넣고 개발 서버 재시작</li>
      <li>NCP 콘솔 &gt; Maps &gt; 애플리케이션의 <b>웹 서비스 URL</b> 에 현재 주소 등록</li>
    </ol>
    <ol v-else>
      <li>NCP 콘솔 &gt; <b>Maps</b> &gt; 애플리케이션에서 <b>Web Dynamic Map</b> 이용 신청</li>
      <li><b>웹 서비스 URL</b> 에 현재 접속 주소(도메인·포트까지) 등록</li>
      <li>키 값을 다시 확인한 뒤 새로고침</li>
    </ol>
    <p class="maperror__foot">지도 없이도 왼쪽 목록·상세·커뮤니티는 그대로 쓸 수 있습니다.</p>
  </div>
</template>
