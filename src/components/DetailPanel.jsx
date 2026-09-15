import { formatDate, formatWon } from '../lib/notices';

function Row({ label, children }) {
  return (
    <div className="facts__row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function specialDetail(s) {
  const bits = [];
  if (s.requiresNoHouse) bits.push('무주택');
  if (s.minChildren) bits.push(`자녀 ${s.minChildren}명 이상`);
  if (s.maxMarriageYears) bits.push(`혼인 ${s.maxMarriageYears}년 이내`);
  if (s.incomeLimit) bits.push(`소득 ${s.incomeLimit}% 이하`);
  return bits.length ? bits.join(' · ') : '별도 소득요건 없음';
}

export default function DetailPanel({ item, onClose, onFocus }) {
  if (!item) return null;

  const pdfUrl = item.pdf ? `/공고문/${encodeURIComponent(item.pdf)}` : null;
  const specials = item.special.filter((s) => s.type !== '일반공급');
  const general = item.special.find((s) => s.type === '일반공급');

  return (
    <aside className="detail" style={{ '--accent': item.color }}>
      <header className="detail__head">
        <div>
          <div className="detail__badges">
            <span className={`badge badge--${item.status}`}>
              {item.status === 'open' ? item.label : item.status === 'closed' ? '접수마감' : '일정 확인'}
            </span>
            <span className="chip chip--solid">{item.housingType}</span>
            {item.agencyName && <span className="chip chip--ghost">{item.agencyName}</span>}
          </div>
          <h2>{item.title}</h2>
          <p className="detail__where">
            {item.address ?? `${item.region} ${item.district ?? ''}`}
            {item.approxLabel && <em className="detail__approx"> · 위치 {item.approxLabel}</em>}
          </p>
        </div>
        <button type="button" className="detail__close" onClick={onClose} aria-label="닫기">
          ×
        </button>
      </header>

      <section className="detail__price">
        <span>공급금액(공고문 기재 범위)</span>
        {item.priceMin != null ? (
          <strong>
            {formatWon(item.priceMin)} <i>~</i> {formatWon(item.priceMax)}
          </strong>
        ) : (
          <strong className="muted">공고문 참고</strong>
        )}
        <small>주택형·층·옵션에 따라 달라집니다. 정확한 금액은 원문 공고를 확인하세요.</small>
      </section>

      <dl className="facts">
        <Row label="모집공고일">{formatDate(item.announce)}</Row>
        <Row label="청약 마감">{item.deadline ? formatDate(item.deadline) : '공고문 참고'}</Row>
        <Row label="공급 유형">{item.housingType}</Row>
        <Row label="사업 주체">{item.agencyName || item.agency}</Row>
        <Row label="소재지">
          {item.address ?? '-'}
          {item.addressSource && <span className="facts__src"> ({item.addressSource})</span>}
        </Row>
        <Row label="청약통장">
          {item.minSubMonths ? `가입 ${item.minSubMonths}개월 이상` : '통장 요건 없음/공고문 참고'}
        </Row>
        <Row label="신청 연령">{item.minAge ? `만 ${item.minAge}세 이상` : '공고문 참고'}</Row>
      </dl>

      {specials.length > 0 && (
        <section className="detail__block">
          <h3>특별공급 {specials.length}종</h3>
          <ul className="specials">
            {specials.map((s) => (
              <li key={s.type}>
                <b>{s.type}</b>
                <span>{specialDetail(s)}</span>
              </li>
            ))}
          </ul>
          {general && <p className="detail__note">일반공급: {specialDetail(general)}</p>}
        </section>
      )}

      {item.extra && (
        <section className="detail__block">
          <h3>공고 요약</h3>
          <dl className="facts facts--compact">
            {Object.entries(item.extra)
              .filter(([, v]) => v && typeof v !== 'object')
              .map(([k, v]) => (
                <Row key={k} label={k.replace(/_/g, ' ')}>
                  {String(v)}
                </Row>
              ))}
          </dl>
        </section>
      )}

      {item.note && <p className="detail__note">{item.note}</p>}

      <footer className="detail__foot">
        {pdfUrl && (
          <a className="btn btn--primary" href={pdfUrl} target="_blank" rel="noreferrer">
            공고문 원문 PDF
          </a>
        )}
        {item.url && (
          <a className="btn" href={item.url} target="_blank" rel="noreferrer">
            기관 홈페이지
          </a>
        )}
        <button type="button" className="btn" onClick={() => onFocus?.(item)}>
          지도에서 보기
        </button>
      </footer>
    </aside>
  );
}
