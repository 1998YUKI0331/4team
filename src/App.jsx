import { useCallback, useMemo, useRef, useState } from 'react';
import MapView from './components/MapView';
import FilterBar from './components/FilterBar';
import NoticeCard from './components/NoticeCard';
import DetailPanel from './components/DetailPanel';
import { NOTICES, DEFAULT_FILTERS, applyFilters } from './lib/notices';

export default function App() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [selectedId, setSelectedId] = useState(null);
  const [viewport, setViewport] = useState(null);
  const [syncMap, setSyncMap] = useState(true);
  const [focusRequest, setFocusRequest] = useState(null);
  const [mapError, setMapError] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const cardRefs = useRef(new Map());

  const filtered = useMemo(() => applyFilters(NOTICES, filters), [filters]);

  /** 지도에 찍히는 건 필터 결과 전체, 리스트는 화면 안쪽만(옵션) */
  const listed = useMemo(() => {
    if (!syncMap || !viewport?.bounds) return filtered;
    const { south, west, north, east } = viewport.bounds;
    const inside = filtered.filter(
      (n) => n.lat != null && n.lat >= south && n.lat <= north && n.lng >= west && n.lng <= east
    );
    return inside.length ? inside : filtered;
  }, [filtered, syncMap, viewport]);

  const outOfView = syncMap && viewport?.bounds ? filtered.length - listed.length : 0;
  const selected = useMemo(() => NOTICES.find((n) => n.id === selectedId) ?? null, [selectedId]);

  const select = useCallback((id) => {
    setSelectedId(id);
    setSheetOpen(false);
    requestAnimationFrame(() => {
      cardRefs.current.get(id)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }, []);

  const focus = useCallback((item) => {
    setSelectedId(item.id);
    setFocusRequest({ lat: item.lat, lng: item.lng, at: Date.now() });
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__brand">
          <span className="topbar__logo" aria-hidden="true">
            <svg viewBox="0 0 16 16">
              <path d="M1.6 14.6V6.1L8 1.8l6.4 4.3v8.5H9.7v-3.4H6.3v3.4H1.6z" fill="currentColor" />
            </svg>
          </span>
          <div>
            <strong>청약지도</strong>
            <span>수도권 분양·임대 공고 {NOTICES.length}건</span>
          </div>
        </div>
        <label className="topbar__sync">
          <input type="checkbox" checked={syncMap} onChange={(e) => setSyncMap(e.target.checked)} />
          지도 영역 안만 목록에 표시
        </label>
      </header>

      <div className="app__body">
        <section className={`sidebar ${sheetOpen ? 'is-open' : ''}`}>
          <button
            type="button"
            className="sidebar__handle"
            onClick={() => setSheetOpen((v) => !v)}
            aria-label={sheetOpen ? '목록 접기' : '목록 펼치기'}
          >
            <span />
            목록 {listed.length}건
          </button>

          <FilterBar filters={filters} setFilters={setFilters} total={NOTICES.length} shown={listed.length} />

          <div className="sidebar__list">
            {listed.map((item) => (
              <NoticeCard
                key={item.id}
                item={item}
                selected={item.id === selectedId}
                innerRef={(el) => {
                  if (el) cardRefs.current.set(item.id, el);
                  else cardRefs.current.delete(item.id);
                }}
                onClick={() => focus(item)}
              />
            ))}
            {listed.length === 0 && <p className="sidebar__empty">조건에 맞는 공고가 없습니다.</p>}
            {outOfView > 0 && (
              <p className="sidebar__more">지도 밖에 {outOfView}건 더 있습니다. 지도를 축소해 보세요.</p>
            )}
          </div>
        </section>

        <main className="stage">
          {mapError ? (
            <div className="maperror">
              <h2>지도를 불러오지 못했습니다</h2>
              <p>{mapError.message}</p>
              <ol>
                <li>
                  NCP 콘솔 &gt; <b>Maps</b> &gt; 애플리케이션(fourteam)에서 <b>Web Dynamic Map</b> 이용 신청
                </li>
                <li>
                  <b>웹 서비스 URL</b> 에 <code>http://localhost:5173</code> 등록
                </li>
                <li>
                  <code>.env</code> 의 <code>VITE_NAVER_MAP_CLIENT_ID</code> 확인 후 개발 서버 재시작
                </li>
              </ol>
            </div>
          ) : (
            <MapView
              items={filtered}
              selectedId={selectedId}
              onSelect={select}
              onViewportChange={setViewport}
              focusRequest={focusRequest}
              onError={setMapError}
            />
          )}

          <div className="legend">
            <span>
              <i style={{ background: '#ff5a36' }} />
              민간분양
            </span>
            <span>
              <i style={{ background: '#2f6bff' }} />
              공공분양
            </span>
            <span>
              <i style={{ background: '#00b06b' }} />
              임대
            </span>
          </div>
        </main>

        {selected && <DetailPanel item={selected} onClose={() => setSelectedId(null)} onFocus={focus} />}
      </div>
    </div>
  );
}
