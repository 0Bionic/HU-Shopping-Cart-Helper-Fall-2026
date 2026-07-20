import type { Course } from "../types";
import {
  describeRequiredComponents,
  linkedLabCodeFor,
  linkedTheoryCodeFor,
  normalizeCourse,
} from "../scheduler";

interface Props {
  courses: Course[];
  onRemove: (code: string) => void;
  onClear: () => void;
}

export function Cart({ courses, onRemove, onClear }: Props) {
  const normalized = courses.map(normalizeCourse);
  const codes = new Set(normalized.map((c) => c.code));

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
          {normalized.map((c) => {
            const labCode = linkedLabCodeFor(c);
            const theoryCode = linkedTheoryCodeFor(c);
            const paired =
              (!c.isLab && labCode && codes.has(labCode)) ||
              (c.isLab && theoryCode && codes.has(theoryCode));
            return (
              <li key={c.code} className="cart-item">
                <div>
                  <strong>{c.code}</strong>
                  <span>{c.title}</span>
                  <span className="cart-item__components">
                    Needs {describeRequiredComponents(c)}
                  </span>
                  {paired && (
                    <span className="cart-item__components">
                      Paired as Lx + Tx (same section #)
                    </span>
                  )}
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
            );
          })}
        </ul>
      )}
    </section>
  );
}
