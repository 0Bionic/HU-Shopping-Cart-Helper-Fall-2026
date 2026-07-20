import { useState, type CSSProperties } from "react";
import type { ScheduleOption } from "../types";
import {
  DAY_LABELS,
  WEEKDAYS,
  componentLabel,
  courseColor,
  formatTime,
  minutesToLabel,
  sectionMeetings,
} from "../scheduler";

interface Props {
  option: ScheduleOption;
}

const DAY_START = 8 * 60;
const DAY_END = 20 * 60;
const RANGE = DAY_END - DAY_START;

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.setAttribute("readonly", "");
      el.style.position = "fixed";
      el.style.left = "-9999px";
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(el);
      return ok;
    } catch {
      return false;
    }
  }
}

export function Timetable({ option }: Props) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const colors = new Map<string, string>();
  option.picks.forEach((p, i) => {
    colors.set(p.course.code, courseColor(p.course.code, i));
  });

  async function handleCopy(classNbr: string, id: string) {
    const ok = await copyText(classNbr);
    if (!ok) return;
    setCopiedId(id);
    window.setTimeout(() => {
      setCopiedId((cur) => (cur === id ? null : cur));
    }, 1500);
  }

  return (
    <section className="timetable-wrap">
      <div className="panel__head">
        <h2>
          Rank #{option.rank} ·{" "}
          {minutesToLabel(option.score.earliestStart)} –{" "}
          {minutesToLabel(option.score.latestEnd)}
        </h2>
      </div>

      <div className="timetable" style={{ "--rows": RANGE / 30 } as CSSProperties}>
        <div className="timetable__corner" />
        {WEEKDAYS.map((d) => (
          <div key={d} className="timetable__dayhead">
            {DAY_LABELS[d]}
          </div>
        ))}

        <div className="timetable__times">
          {Array.from({ length: RANGE / 60 + 1 }, (_, i) => {
            const min = DAY_START + i * 60;
            const top = ((min - DAY_START) / RANGE) * 100;
            const h24 = Math.floor(min / 60);
            const label =
              h24 === 12 ? "12 PM" : h24 > 12 ? `${h24 - 12} PM` : `${h24} AM`;
            return (
              <span key={min} className="timetable__tick" style={{ top: `${top}%` }}>
                {label}
              </span>
            );
          })}
        </div>

        {WEEKDAYS.map((day) => (
          <div key={day} className="timetable__col">
            {Array.from({ length: RANGE / 60 }, (_, i) => (
              <div
                key={i}
                className="timetable__hourline"
                style={{ top: `${(i / (RANGE / 60)) * 100}%` }}
              />
            ))}
            {option.picks.flatMap(({ course, section }) => {
              const color = colors.get(course.code) ?? "#333";
              return sectionMeetings(section).flatMap((meeting, mi) => {
                if (!meeting.dayList.includes(day)) return [];
                if (meeting.startMin == null || meeting.endMin == null) return [];
                const top = ((meeting.startMin - DAY_START) / RANGE) * 100;
                const height =
                  ((meeting.endMin - meeting.startMin) / RANGE) * 100;
                return [
                  <div
                    key={`${section.id}-${day}-${mi}`}
                    className="block"
                    style={{
                      top: `${Math.max(0, top)}%`,
                      height: `${Math.max(height, 3)}%`,
                      background: color,
                    }}
                    title={`#${section.classNbr} · ${course.code} · ${section.section} · ${formatTime(meeting.start)}–${formatTime(meeting.end)} · ${meeting.room}`}
                  >
                    <strong>{course.code}</strong>
                    <span className="block__class">#{section.classNbr}</span>
                    <span>
                      {section.section} · {formatTime(meeting.start)}
                    </span>
                    <span className="block__room">{meeting.room}</span>
                  </div>,
                ];
              });
            })}
          </div>
        ))}
      </div>

      <ul className="legend">
        {[...option.picks]
          .sort((a, b) => {
            const byCode = a.course.code.localeCompare(b.course.code);
            if (byCode !== 0) return byCode;
            return a.component.localeCompare(b.component);
          })
          .map(({ course, section }) => {
          const meetings = sectionMeetings(section);
          const justCopied = copiedId === section.id;
          return (
            <li key={section.id} className="legend__row">
              <span
                className="swatch"
                style={{ background: colors.get(course.code) }}
              />
              <div className="legend__body">
                <strong>
                  #{section.classNbr} · {course.code} ·{" "}
                  {componentLabel(section.component)} {section.section}
                </strong>
                <span>{course.title}</span>
                {meetings.map((m, i) => (
                  <span key={i}>
                    {m.days === "TBA"
                      ? "TBA"
                      : `${m.days} · ${formatTime(m.start)}–${formatTime(m.end)}`}
                    {" · "}
                    {m.room}
                  </span>
                ))}
                <span>{section.instructor}</span>
              </div>
              <button
                type="button"
                className={`copy-btn ${justCopied ? "is-copied" : ""}`}
                onClick={() => handleCopy(section.classNbr, section.id)}
              >
                {justCopied ? "Copied!" : "Copy Class Number"}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
