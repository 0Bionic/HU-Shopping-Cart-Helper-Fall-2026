import { useMemo, useState } from "react";
import type { Course } from "../types";
import { describeRequiredComponents, normalizeCourse } from "../scheduler";

interface Props {
  courses: Course[];
  selectedCodes: string[];
  onAdd: (code: string) => void;
}

export function CourseSearch({ courses, selectedCodes, onAdd }: Props) {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? courses.filter((c) => {
          const hay = `${c.code} ${c.title} ${c.subject}`.toLowerCase();
          return hay.includes(q) || q.split(/\s+/).every((part) => hay.includes(part));
        })
      : courses;
    return list.slice(0, q ? 60 : 40).map(normalizeCourse);
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
          const multi = c.requiredComponents.length > 1;
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
                  {describeRequiredComponents(c)}
                  {multi ? " required" : ""}
                  {" · "}
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
