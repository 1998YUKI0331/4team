import { CATEGORY_META, REGIONS, SPECIAL_TYPES, DEFAULT_FILTERS, countActiveFilters } from '../lib/notices';

const PRICE_STEPS = [
  { label: '3억 이하', value: 300_000_000 },
  { label: '5억 이하', value: 500_000_000 },
  { label: '7억 이하', value: 700_000_000 },
];

function Toggle({ active, onClick, children, style }) {
  return (
    <button type="button" className={`chip ${active ? 'is-on' : ''}`} onClick={onClick} style={style}>
      {children}
    </button>
  );
}

export default function FilterBar({ filters, setFilters, total, shown }) {
  const toggleIn = (key, value) =>
    setFilters((f) => ({
      ...f,
      [key]: f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value],
    }));

  const active = countActiveFilters(filters);

  return (
    <div className="filters">
      <div className="filters__search">
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="9" cy="9" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M13.2 13.2 17 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <input
          value={filters.q}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
          placeholder="단지명 · 지역 · 주소 검색"
          aria-label="검색"
        />
        {filters.q && (
          <button type="button" className="filters__clear" onClick={() => setFilters((f) => ({ ...f, q: '' }))}>
            ×
          </button>
        )}
      </div>

      <div className="filters__row">
        <Toggle active={filters.openOnly} onClick={() => setFilters((f) => ({ ...f, openOnly: !f.openOnly }))}>
          접수중만
        </Toggle>
        {Object.values(CATEGORY_META)
          .filter((c) => c.key !== '기타')
          .map((c) => (
            <Toggle
              key={c.key}
              active={filters.categories.includes(c.key)}
              onClick={() => toggleIn('categories', c.key)}
              style={{ '--chip': c.color }}
            >
              <i className="chip__dot" style={{ background: c.color }} />
              {c.label}
            </Toggle>
          ))}
      </div>

      <div className="filters__row">
        {REGIONS.map((r) => (
          <Toggle key={r} active={filters.regions.includes(r)} onClick={() => toggleIn('regions', r)}>
            {r}
          </Toggle>
        ))}
        <span className="filters__sep" />
        {PRICE_STEPS.map((p) => (
          <Toggle
            key={p.value}
            active={filters.priceMax === p.value}
            onClick={() => setFilters((f) => ({ ...f, priceMax: f.priceMax === p.value ? null : p.value }))}
          >
            {p.label}
          </Toggle>
        ))}
      </div>

      <div className="filters__row">
        {SPECIAL_TYPES.filter((s) => s !== '일반공급').map((s) => (
          <Toggle key={s} active={filters.specials.includes(s)} onClick={() => toggleIn('specials', s)}>
            {s}
          </Toggle>
        ))}
      </div>

      <div className="filters__summary">
        <strong>{shown}</strong>건 표시 <span className="muted">/ 전체 {total}건</span>
        {active > 0 && (
          <button type="button" className="linkish" onClick={() => setFilters({ ...DEFAULT_FILTERS })}>
            필터 {active}개 초기화
          </button>
        )}
      </div>
    </div>
  );
}
