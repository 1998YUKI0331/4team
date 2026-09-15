import { formatWon, formatDate } from '../lib/notices';

export default function NoticeCard({ item, selected, onClick, innerRef }) {
  const price =
    item.priceMin != null
      ? `${formatWon(item.priceMin)} ~ ${formatWon(item.priceMax)}`
      : item.category === '임대'
        ? '임대조건 공고문 참고'
        : '분양가 정보 없음';

  return (
    <article
      ref={innerRef}
      className={`card ${selected ? 'is-selected' : ''}`}
      style={{ '--accent': item.color }}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClick?.())}
    >
      <div className="card__top">
        <span className={`badge badge--${item.status}`}>
          {item.status === 'open' ? item.label : item.status === 'closed' ? '접수마감' : '일정 확인'}
        </span>
        <span className="card__type">{item.category}</span>
        {item.agency !== '민간' && <span className="card__agency">{item.agency}</span>}
      </div>

      <h3 className="card__title">{item.title}</h3>

      <p className="card__where">
        {item.region} {item.district}
        {item.address && <span className="card__addr"> · {item.address}</span>}
      </p>

      <p className="card__price">{price}</p>

      <div className="card__foot">
        <span>공고 {formatDate(item.announce)}</span>
        <span>{item.deadline ? `마감 ${formatDate(item.deadline)}` : '마감일 미기재'}</span>
      </div>

      {item.specialTypes.length > 0 && (
        <div className="chips">
          {item.specialTypes
            .filter((t) => t !== '일반공급')
            .slice(0, 4)
            .map((t) => (
              <span key={t} className="chip chip--ghost">
                {t}
              </span>
            ))}
        </div>
      )}
    </article>
  );
}
