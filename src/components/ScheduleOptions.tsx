import type { DayCode, RankMode, ScheduleOption, SchedulePrefs } from "../types";
import {
  DAY_LABELS,
  RANK_MODE_LABELS,
  TIME_CHOICES,
  WEEKDAYS,
  minutesToLabel,
} from "../scheduler";

interface Props {
  options: ScheduleOption[];
  activeIndex: number;
  onSelect: (index: number) => void;
  prefs: SchedulePrefs;
  onPrefsChange: (prefs: SchedulePrefs) => void;
  totalBeforeFilter: number;
}

function gapLabel(mins: number): string {
  if (mins === 0) return "no gaps";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m gaps`;
  if (m === 0) return `${h}h gaps`;
  return `${h}h ${m}m gaps`;
}

export function ScheduleOptions({
  options,
  activeIndex,
  onSelect,
  prefs,
  onPrefsChange,
  totalBeforeFilter,
}: Props) {
  function toggleDayOff(day: DayCode) {
    const has = prefs.daysOff.includes(day);
    onPrefsChange({
      ...prefs,
      daysOff: has
        ? prefs.daysOff.filter((d) => d !== day)
        : [...prefs.daysOff, day],
    });
  }

  return (
    <section className="options">
      <div className="panel__head">
        <h2>
          {options.length} ranked option{options.length === 1 ? "" : "s"}
        </h2>
        <span className="hint">
          {totalBeforeFilter > options.length
            ? `${totalBeforeFilter} found · ${totalBeforeFilter - options.length} hidden by filters`
            : "Pick a ranking, then choose a combination"}
        </span>
      </div>

      <div className="prefs">
        <label className="prefs__field">
          <span>Rank by</span>
          <select
            value={prefs.rankMode}
            onChange={(e) =>
              onPrefsChange({ ...prefs, rankMode: e.target.value as RankMode })
            }
          >
            {(Object.keys(RANK_MODE_LABELS) as RankMode[]).map((mode) => (
              <option key={mode} value={mode}>
                {RANK_MODE_LABELS[mode]}
              </option>
            ))}
          </select>
        </label>

        <label className="prefs__field">
          <span>Day must start at/after</span>
          <select
            value={prefs.notBefore ?? ""}
            onChange={(e) =>
              onPrefsChange({
                ...prefs,
                notBefore: e.target.value === "" ? null : Number(e.target.value),
              })
            }
          >
            <option value="">Any start</option>
            {TIME_CHOICES.filter((t) => t.value <= 14 * 60).map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        <label className="prefs__field">
          <span>Day must end by</span>
          <select
            value={prefs.notAfter ?? ""}
            onChange={(e) =>
              onPrefsChange({
                ...prefs,
                notAfter: e.target.value === "" ? null : Number(e.target.value),
              })
            }
          >
            <option value="">Any end</option>
            {TIME_CHOICES.filter((t) => t.value >= 12 * 60).map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="prefs__days">
        <span className="prefs__days-label">Days I want off</span>
        <div className="day-toggles" role="group" aria-label="Days off">
          {WEEKDAYS.map((day) => {
            const active = prefs.daysOff.includes(day);
            return (
              <button
                key={day}
                type="button"
                className={`day-toggle ${active ? "is-active" : ""}`}
                aria-pressed={active}
                onClick={() => toggleDayOff(day)}
              >
                {DAY_LABELS[day]}
              </button>
            );
          })}
        </div>
      </div>

      {options.length === 0 ? (
        <p className="prefs__empty">
          No schedules match these filters. Loosen start/end times or days off.
        </p>
      ) : (
        <div className="option-scroller" role="list">
          {options.map((opt, i) => {
            const active = i === activeIndex;
            const classNbrs = opt.picks
              .map((p) => p.section.classNbr)
              .join(", ");
            return (
              <button
                key={`${opt.rank}-${classNbrs}`}
                type="button"
                role="listitem"
                className={`option-card ${active ? "is-active" : ""}`}
                onClick={() => onSelect(i)}
              >
                <span className="option-card__num">#{opt.rank}</span>
                <span className="option-card__window">
                  {minutesToLabel(opt.score.earliestStart)} –{" "}
                  {minutesToLabel(opt.score.latestEnd)}
                </span>
                <span className="option-card__stat">{gapLabel(opt.score.gaps)}</span>
                <span className="option-card__stat">
                  {opt.score.daysUsed} day{opt.score.daysUsed === 1 ? "" : "s"}
                </span>
                <span className="option-card__classes" title={classNbrs}>
                  Class # {classNbrs}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
