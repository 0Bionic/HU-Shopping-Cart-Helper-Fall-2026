import { useDeferredValue, useEffect, useMemo, useState } from "react";
import type { Course, ScheduleData, ScheduleOption, SchedulePrefs } from "./types";
import { enumerateSchedules, normalizeCourse, rankSchedules } from "./scheduler";
import { CourseSearch } from "./components/CourseSearch";
import { Cart } from "./components/Cart";
import { ScheduleOptions } from "./components/ScheduleOptions";
import { Timetable } from "./components/Timetable";
import "./App.css";

const DEFAULT_PREFS: SchedulePrefs = {
  rankMode: "balanced",
  notBefore: null,
  notAfter: null,
  daysOff: [],
};

export default function App() {
  const [data, setData] = useState<ScheduleData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [activeOption, setActiveOption] = useState(0);
  const [prefs, setPrefs] = useState<SchedulePrefs>(DEFAULT_PREFS);
  const deferredCodes = useDeferredValue(selectedCodes);
  const deferredPrefs = useDeferredValue(prefs);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}courses.json`)
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load course data");
        return r.json();
      })
      .then((json: ScheduleData) => {
        setData({
          ...json,
          courses: json.courses.map(normalizeCourse),
        });
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const courseMap = useMemo(() => {
    const map = new Map<string, Course>();
    data?.courses.forEach((c) => map.set(c.code, c));
    return map;
  }, [data]);

  const selectedCourses = useMemo(
    () => deferredCodes.map((code) => courseMap.get(code)).filter(Boolean) as Course[],
    [deferredCodes, courseMap]
  );

  const allOptions = useMemo(
    () => enumerateSchedules(selectedCourses),
    [selectedCourses]
  );

  const options: ScheduleOption[] = useMemo(
    () => rankSchedules(allOptions, deferredPrefs),
    [allOptions, deferredPrefs]
  );

  const cartKey = deferredCodes.join("|");
  const prefsKey = `${deferredPrefs.rankMode}|${deferredPrefs.notBefore}|${deferredPrefs.notAfter}|${deferredPrefs.daysOff.join(",")}`;
  useEffect(() => {
    setActiveOption(0);
  }, [cartKey, prefsKey]);

  const active = options[activeOption] ?? null;

  function addCourse(code: string) {
    setSelectedCodes((prev) => (prev.includes(code) ? prev : [...prev, code]));
  }

  function removeCourse(code: string) {
    setSelectedCodes((prev) => prev.filter((c) => c !== code));
  }

  function clearCart() {
    setSelectedCodes([]);
  }

  if (error) {
    return (
      <div className="shell">
        <p className="error">Could not load courses: {error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="shell">
        <p className="loading">Loading Fall 2026 schedule…</p>
      </div>
    );
  }

  return (
    <div className="shell">
      <header className="hero">
        <p className="eyebrow">Habib University · Term 2615</p>
        <h1>Shopping Cart Helper</h1>
        <p className="lede">
          Pick your courses, then rank combinations by day start/end. Multi-part
          courses (lecture + seminar, etc.) enroll as a full set. Each option
          shows every class number you need.
        </p>
        <p className="meta">
          {data.courseCount} courses · {data.sectionCount} sections · {data.term}
        </p>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <CourseSearch
            courses={data.courses}
            selectedCodes={selectedCodes}
            onAdd={addCourse}
          />
          <Cart
            courses={selectedCourses}
            onRemove={removeCourse}
            onClear={clearCart}
          />
        </aside>

        <main className="main">
          {selectedCourses.length === 0 ? (
            <div className="empty">
              <h2>Your cart is empty</h2>
              <p>Search for courses on the left to generate schedule options.</p>
            </div>
          ) : allOptions.length === 0 ? (
            <div className="empty empty--warn">
              <h2>No conflict-free schedules</h2>
              <p>
                No combination covers every required component without overlaps.
                Try removing a course or loosening day/time filters.
              </p>
            </div>
          ) : (
            <>
              <ScheduleOptions
                options={options}
                activeIndex={activeOption}
                onSelect={setActiveOption}
                prefs={prefs}
                onPrefsChange={setPrefs}
                totalBeforeFilter={allOptions.length}
              />
              {active && <Timetable option={active} />}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
