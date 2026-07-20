import type {
  ComponentCode,
  Course,
  DayCode,
  Meeting,
  PickedSection,
  RankMode,
  ScheduleOption,
  SchedulePrefs,
  Section,
} from "./types";

const DAY_ORDER: DayCode[] = ["M", "T", "W", "Th", "F", "S", "Su"];
const COMPONENT_ORDER = ["L", "S", "T", "R", "D", "C"];

export const COMPONENT_LABELS: Record<string, string> = {
  L: "Lecture",
  S: "Seminar",
  T: "Tutorial",
  R: "Recitation",
  D: "Discussion",
  C: "Combined",
};

export function componentLabel(code: ComponentCode): string {
  return COMPONENT_LABELS[code] ?? code;
}

export function sectionComponent(section: Section): ComponentCode {
  if (section.component) return section.component.toUpperCase();
  const m = section.section.match(/^([A-Za-z]+)/);
  return (m?.[1] ?? "X").toUpperCase();
}

function sortComponentKeys(keys: ComponentCode[]): ComponentCode[] {
  return [...keys].sort((a, b) => {
    const ia = COMPONENT_ORDER.indexOf(a);
    const ib = COMPONENT_ORDER.indexOf(b);
    const ka = ia === -1 ? COMPONENT_ORDER.length : ia;
    const kb = ib === -1 ? COMPONENT_ORDER.length : ib;
    if (ka !== kb) return ka - kb;
    return a.localeCompare(b);
  });
}

/** Ensure a course has components / requiredComponents even if JSON is older. */
export function normalizeCourse(course: Course): Course {
  if (
    course.components &&
    course.requiredComponents &&
    course.requiredComponents.length > 0
  ) {
    const components: Record<string, Section[]> = {};
    for (const key of Object.keys(course.components)) {
      components[key] = uniqueByClassNbr(
        course.components[key].map((s) => ({
          ...s,
          component: s.component ?? key,
        }))
      );
    }
    return {
      ...course,
      components,
      requiredComponents: sortComponentKeys(Object.keys(components)),
      sections: course.sections.map((s) => ({
        ...s,
        component: sectionComponent(s),
      })),
    };
  }

  const components: Record<string, Section[]> = {};
  const sections = uniqueByClassNbr(
    course.sections.map((s) => {
      const component = sectionComponent(s);
      return { ...s, component };
    })
  );
  for (const s of sections) {
    (components[s.component] ??= []).push(s);
  }
  return {
    ...course,
    sections,
    components,
    requiredComponents: sortComponentKeys(Object.keys(components)),
  };
}

export function describeRequiredComponents(course: Course): string {
  const normalized = normalizeCourse(course);
  return normalized.requiredComponents.map(componentLabel).join(" + ");
}

export function formatTime(t: string): string {
  if (!t || t === "TBA") return "TBA";
  const m = t.match(/^(\d{1,2}):(\d{2}):\d{2}\s*(AM|PM)$/i);
  if (!m) return t;
  const h = Number(m[1]);
  const min = m[2];
  const ap = m[3].toUpperCase();
  return `${h}:${min} ${ap}`;
}

/** All meeting blocks for a section (merged multi-day PDF rows). */
export function sectionMeetings(section: Section): Meeting[] {
  if (section.meetings && section.meetings.length > 0) return section.meetings;
  return [
    {
      days: section.days,
      dayList: section.dayList,
      start: section.start,
      end: section.end,
      startMin: section.startMin,
      endMin: section.endMin,
      room: section.room,
    },
  ];
}

function meetingsConflict(a: Meeting, b: Meeting): boolean {
  if (
    a.startMin == null ||
    a.endMin == null ||
    b.startMin == null ||
    b.endMin == null ||
    a.days === "TBA" ||
    b.days === "TBA"
  ) {
    return false;
  }
  const shared = a.dayList.filter((d) => b.dayList.includes(d));
  if (shared.length === 0) return false;
  return a.startMin < b.endMin && b.startMin < a.endMin;
}

export function sectionsConflict(a: Section, b: Section): boolean {
  const am = sectionMeetings(a);
  const bm = sectionMeetings(b);
  for (const x of am) {
    for (const y of bm) {
      if (meetingsConflict(x, y)) return true;
    }
  }
  return false;
}

export function picksConflict(picks: PickedSection[]): boolean {
  for (let i = 0; i < picks.length; i++) {
    for (let j = i + 1; j < picks.length; j++) {
      if (sectionsConflict(picks[i].section, picks[j].section)) return true;
    }
  }
  return false;
}

function scorePicks(picks: PickedSection[]) {
  const byDay = new Map<DayCode, { start: number; end: number }[]>();
  let earliestStart = 24 * 60;
  let latestEnd = 0;
  let totalMinutes = 0;

  for (const { section } of picks) {
    for (const meeting of sectionMeetings(section)) {
      if (meeting.startMin == null || meeting.endMin == null) continue;
      earliestStart = Math.min(earliestStart, meeting.startMin);
      latestEnd = Math.max(latestEnd, meeting.endMin);
      totalMinutes +=
        (meeting.endMin - meeting.startMin) * Math.max(meeting.dayList.length, 1);
      for (const d of meeting.dayList) {
        const list = byDay.get(d) ?? [];
        list.push({ start: meeting.startMin, end: meeting.endMin });
        byDay.set(d, list);
      }
    }
  }

  let gaps = 0;
  for (const blocks of byDay.values()) {
    blocks.sort((a, b) => a.start - b.start);
    for (let i = 1; i < blocks.length; i++) {
      const gap = blocks[i].start - blocks[i - 1].end;
      if (gap > 0) gaps += gap;
    }
  }

  return {
    gaps,
    daysUsed: byDay.size,
    earliestStart: earliestStart === 24 * 60 ? 0 : earliestStart,
    latestEnd,
    totalMinutes,
  };
}

function compareByMode(a: ScheduleOption, b: ScheduleOption, mode: RankMode): number {
  const sa = a.score;
  const sb = b.score;
  switch (mode) {
    case "latestStart":
      if (sa.earliestStart !== sb.earliestStart) return sb.earliestStart - sa.earliestStart;
      if (sa.latestEnd !== sb.latestEnd) return sa.latestEnd - sb.latestEnd;
      return sa.gaps - sb.gaps;
    case "earliestFinish":
      if (sa.latestEnd !== sb.latestEnd) return sa.latestEnd - sb.latestEnd;
      if (sa.earliestStart !== sb.earliestStart) return sb.earliestStart - sa.earliestStart;
      return sa.gaps - sb.gaps;
    case "earliestStart":
      if (sa.earliestStart !== sb.earliestStart) return sa.earliestStart - sb.earliestStart;
      if (sa.latestEnd !== sb.latestEnd) return sa.latestEnd - sb.latestEnd;
      return sa.gaps - sb.gaps;
    case "latestFinish":
      if (sa.latestEnd !== sb.latestEnd) return sb.latestEnd - sa.latestEnd;
      if (sa.earliestStart !== sb.earliestStart) return sa.earliestStart - sb.earliestStart;
      return sa.gaps - sb.gaps;
    case "balanced":
    default:
      if (sa.gaps !== sb.gaps) return sa.gaps - sb.gaps;
      if (sa.daysUsed !== sb.daysUsed) return sa.daysUsed - sb.daysUsed;
      if (sa.latestEnd !== sb.latestEnd) return sa.latestEnd - sb.latestEnd;
      return sb.earliestStart - sa.earliestStart;
  }
}

function optionSignature(picks: PickedSection[]): string {
  return picks
    .map((p) => p.section.classNbr)
    .sort()
    .join("|");
}

function uniqueByClassNbr(sections: Section[]): Section[] {
  const seen = new Set<string>();
  const out: Section[] = [];
  for (const s of sections) {
    if (seen.has(s.classNbr)) continue;
    seen.add(s.classNbr);
    out.push(s);
  }
  return out;
}

interface CoursePlan {
  course: Course;
  /** One bucket per required component, already ordered. */
  buckets: Section[][];
  branching: number;
}

function prepareCourse(course: Course): CoursePlan {
  const normalized = normalizeCourse(course);
  const buckets = normalized.requiredComponents.map(
    (key) => normalized.components[key] ?? []
  );
  const branching = buckets.reduce((acc, b) => acc * Math.max(b.length, 1), 1);
  return { course: normalized, buckets, branching };
}

/**
 * Enumerate conflict-free combinations.
 * For each course, picks exactly one section from EVERY required component
 * (e.g. Lecture + Seminar for CORE 121), ensuring those don't overlap
 * with each other or with other courses.
 */
export function enumerateSchedules(
  courses: Course[],
  opts: { maxOptions?: number; maxExplored?: number } = {}
): ScheduleOption[] {
  const maxOptions = opts.maxOptions ?? 80;
  const maxExplored = opts.maxExplored ?? 80000;

  if (courses.length === 0) return [];

  const ordered = courses
    .map(prepareCourse)
    .filter((p) => p.buckets.every((b) => b.length > 0))
    .sort((a, b) => a.branching - b.branching);

  if (ordered.length !== courses.length) {
    // A course is missing a component bucket somehow — treat as impossible.
    return [];
  }

  const results: ScheduleOption[] = [];
  const seenClassSets = new Set<string>();
  let explored = 0;

  function save(current: PickedSection[]) {
    const classSig = optionSignature(current);
    if (seenClassSets.has(classSig)) return;
    seenClassSets.add(classSig);
    results.push({
      id: results.length + 1,
      rank: 0,
      picks: [...current],
      score: scorePicks(current),
    });
  }

  function dfsComponents(
    plan: CoursePlan,
    bucketIdx: number,
    chosen: PickedSection[],
    current: PickedSection[],
    nextCourse: () => void
  ) {
    if (results.length >= maxOptions || explored >= maxExplored) return;
    if (bucketIdx === plan.buckets.length) {
      const before = current.length;
      for (const pick of chosen) current.push(pick);
      nextCourse();
      current.length = before;
      return;
    }

    const bucket = plan.buckets[bucketIdx];
    for (const section of bucket) {
      explored++;
      if (explored >= maxExplored) return;
      const conflictsOutside = current.some((p) =>
        sectionsConflict(p.section, section)
      );
      if (conflictsOutside) continue;
      const conflictsInside = chosen.some((p) =>
        sectionsConflict(p.section, section)
      );
      if (conflictsInside) continue;

      chosen.push({
        course: plan.course,
        section,
        component: section.component,
      });
      dfsComponents(plan, bucketIdx + 1, chosen, current, nextCourse);
      chosen.pop();
      if (results.length >= maxOptions) return;
    }
  }

  function dfsCourse(courseIdx: number, current: PickedSection[]) {
    if (results.length >= maxOptions || explored >= maxExplored) return;
    if (courseIdx === ordered.length) {
      save(current);
      return;
    }

    const plan = ordered[courseIdx];
    dfsComponents(plan, 0, [], current, () => {
      dfsCourse(courseIdx + 1, current);
    });
  }

  dfsCourse(0, []);
  return results;
}

function usesDayOff(opt: ScheduleOption, daysOff: DayCode[]): boolean {
  if (daysOff.length === 0) return false;
  const off = new Set(daysOff);
  for (const { section } of opt.picks) {
    for (const meeting of sectionMeetings(section)) {
      if (meeting.dayList.some((d) => off.has(d))) return true;
    }
  }
  return false;
}

/** Filter by start/end/days-off and apply ranking. */
export function rankSchedules(
  results: ScheduleOption[],
  prefs: SchedulePrefs
): ScheduleOption[] {
  const filtered = results.filter((opt) => {
    if (prefs.notBefore != null && opt.score.earliestStart < prefs.notBefore) return false;
    if (prefs.notAfter != null && opt.score.latestEnd > prefs.notAfter) return false;
    if (usesDayOff(opt, prefs.daysOff)) return false;
    return true;
  });

  filtered.sort((a, b) => compareByMode(a, b, prefs.rankMode));

  return filtered.map((r, i) => ({ ...r, id: i + 1, rank: i + 1 }));
}

export function generateSchedules(
  courses: Course[],
  prefs: SchedulePrefs,
  opts: { maxOptions?: number; maxExplored?: number } = {}
): ScheduleOption[] {
  return rankSchedules(enumerateSchedules(courses, opts), prefs);
}

export function minutesToLabel(min: number): string {
  const h24 = Math.floor(min / 60);
  const m = min % 60;
  const ap = h24 >= 12 ? "PM" : "AM";
  let h = h24 % 12;
  if (h === 0) h = 12;
  return `${h}:${m.toString().padStart(2, "0")} ${ap}`;
}

export const TIME_CHOICES: { label: string; value: number }[] = [
  { label: "8:00 AM", value: 8 * 60 },
  { label: "8:30 AM", value: 8 * 60 + 30 },
  { label: "9:00 AM", value: 9 * 60 },
  { label: "9:55 AM", value: 9 * 60 + 55 },
  { label: "10:00 AM", value: 10 * 60 },
  { label: "11:00 AM", value: 11 * 60 },
  { label: "11:20 AM", value: 11 * 60 + 20 },
  { label: "12:00 PM", value: 12 * 60 },
  { label: "1:00 PM", value: 13 * 60 },
  { label: "2:00 PM", value: 14 * 60 },
  { label: "2:10 PM", value: 14 * 60 + 10 },
  { label: "2:30 PM", value: 14 * 60 + 30 },
  { label: "3:00 PM", value: 15 * 60 },
  { label: "3:30 PM", value: 15 * 60 + 30 },
  { label: "4:00 PM", value: 16 * 60 },
  { label: "5:00 PM", value: 17 * 60 },
  { label: "5:10 PM", value: 17 * 60 + 10 },
  { label: "5:30 PM", value: 17 * 60 + 30 },
  { label: "6:00 PM", value: 18 * 60 },
  { label: "6:45 PM", value: 18 * 60 + 45 },
  { label: "7:00 PM", value: 19 * 60 },
  { label: "8:00 PM", value: 20 * 60 },
];

export const RANK_MODE_LABELS: Record<RankMode, string> = {
  balanced: "Balanced (fewer gaps)",
  latestStart: "Latest day start (sleep in)",
  earliestFinish: "Earliest day end (leave early)",
  earliestStart: "Earliest day start",
  latestFinish: "Latest day end",
};

export const WEEKDAYS: DayCode[] = ["M", "T", "W", "Th", "F"];
export const DAY_LABELS: Record<DayCode, string> = {
  M: "Mon",
  T: "Tue",
  W: "Wed",
  Th: "Thu",
  F: "Fri",
  S: "Sat",
  Su: "Sun",
};

export { DAY_ORDER };

export function courseColor(code: string, index: number): string {
  const palette = [
    "#1f6f5b",
    "#b45309",
    "#1d4ed8",
    "#9f1239",
    "#6d28d9",
    "#0f766e",
    "#a16207",
    "#be123c",
    "#0369a1",
    "#4d7c0f",
  ];
  let hash = 0;
  for (let i = 0; i < code.length; i++) hash = (hash * 31 + code.charCodeAt(i)) >>> 0;
  return palette[(hash + index) % palette.length];
}
