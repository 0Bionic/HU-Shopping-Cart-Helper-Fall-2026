import type { Course } from "../types";

interface Props {
  courses: Course[];
  onRemove: (code: string) => void;
  onClear: () => void;
}

export function Cart({ courses, onRemove, onClear }: Props) {
  return (
    <section className="panel panel--cart">
      <div className="panel__head">
        <h2>Your cart</h2>
        {courses.length > 0 && (
          <button type="button" className="linkish" onClick={onClear}>
            Clear
          </button>
        )}
      </div>
      {courses.length === 0 ? (
        <p className="muted">Add courses to generate schedules.</p>
      ) : (
        <ul className="cart-list">
          {courses.map((c) => (
            <li key={c.code} className="cart-item">
              <div>
                <strong>{c.code}</strong>
                <span>{c.title}</span>
              </div>
              <button
                type="button"
                className="icon-btn"
                aria-label={`Remove ${c.code}`}
                onClick={() => onRemove(c.code)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
