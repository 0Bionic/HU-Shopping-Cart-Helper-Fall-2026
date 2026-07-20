import { useMemo, useState } from "react";
import type { Course } from "../types";

interface Props {
  courses: Course[];
  selectedCodes: string[];
  onAdd: (code: string) => void;
}

export function CourseSearch({ courses, selectedCodes, onAdd }: Props) {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return courses.slice(0, 40);
    return courses
      .filter((c) => {
        const hay = `${c.code} ${c.title} ${c.subject}`.toLowerCase();
        return hay.includes(q) || q.split(/\s+/).every((part) => hay.includes(part));
      })
      .slice(0, 60);
  }, [courses, query]);

  return (
    <section className="panel">
      <div className="panel__head">
        <h2>Find courses</h2>
        <span className="hint">{courses.length} listed</span>
      </div>
      <label className="search">
        <span className="sr-only">Search courses</span>
        <input
          type="search"
          placeholder="Search code or title… e.g. CS 212, Core, Database"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
        />
      </label>
      <ul className="course-list">
        {results.map((c) => {
          const selected = selectedCodes.includes(c.code);
          return (
            <li key={c.code}>
              <button
                type="button"
                className={`course-row ${selected ? "is-selected" : ""}`}
                onClick={() => onAdd(c.code)}
                disabled={selected}
              >
                <span className="course-row__code">{c.code}</span>
                <span className="course-row__title">{c.title}</span>
                <span className="course-row__meta">
                  {c.sections.length} section{c.sections.length === 1 ? "" : "s"}
                  {selected ? " · added" : ""}
                </span>
              </button>
            </li>
          );
        })}
        {results.length === 0 && (
          <li className="muted">No courses match “{query}”.</li>
        )}
      </ul>
    </section>
  );
}
