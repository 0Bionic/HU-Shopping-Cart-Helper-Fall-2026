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

export function sectionIndex(section: Section): number | null {
  if (section.sectionIndex != null) return section.sectionIndex;
  const m = section.section.match(/(\d+)\s*$/);
  return m ? Number(m[1]) : null;
}

export function isLabCatalog(catalog: string): boolean {
  return catalog.split("/").some((part) => /L$/i.test(part.trim()));
}

export function theoryCatalogFromLab(catalog: string): string {
  return catalog
    .split("/")
    .map((part) => part.trim().replace(/L$/i, ""))
    .join("/");
}

export function labCatalogFromTheory(catalog: string): string {
  return catalog
    .split("/")
    .map((part) => `${part.trim()}L`)
    .join("/");
}

/**
 * Components that are matched by section number to theory
 * (lab / tutorial / recitation). Seminars (S) are free-choice.
 */
function requiresIndexMatch(requiredComponents: ComponentCode[]): boolean {
  if (requiredComponents.length < 2) return false;
  return requiredComponents.some((c) => c === "T" || c === "R");
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

function withSectionMeta(section: Section, fallbackComponent?: string): Section {
  const component = (section.component ?? fallbackComponent ?? sectionComponent(section)).toUpperCase();
  return {
    ...section,
    component,
    sectionIndex: sectionIndex({ ...section, component }),
  };
}

/** Ensure a course has components / requiredComponents even if JSON is older. */
export function normalizeCourse(course: Course): Course {
  const components: Record<string, Section[]> = {};
  let sections: Section[];

  if (course.components && Object.keys(course.components).length > 0) {
    for (const key of Object.keys(course.components)) {
      components[key] = uniqueByClassNbr(
        course.components[key].map((s) => withSectionMeta(s, key))
      );
    }
    sections = uniqueByClassNbr(
      course.sections.map((s) => withSectionMeta(s))
    );
  } else {
    sections = uniqueByClassNbr(course.sections.map((s) => withSectionMeta(s)));
    for (const s of sections) {
      (components[s.component] ??= []).push(s);
    }
  }

  const isLab = course.isLab ?? isLabCatalog(course.catalog);
  let linkedTheoryCode = course.linkedTheoryCode ?? null;
  let linkedLabCode = course.linkedLabCode ?? null;
  if (isLab && !linkedTheoryCode) {
    linkedTheoryCode = `${course.subject} ${theoryCatalogFromLab(course.catalog)}`.trim();
  }

  return {
    ...course,
    sections,
    components,
    requiredComponents: sortComponentKeys(Object.keys(components)),
    isLab,
    linkedTheoryCode,
    linkedLabCode,
  };
}

export function describeRequiredComponents(course: Course): string {
  const normalized = normalizeCourse(course);
  const base = normalized.requiredComponents.map(componentLabel).join(" + ");
  if (normalized.isLab && normalized.linkedTheoryCode) {
    return `${base} (same # as ${normalized.linkedTheoryCode})`;
  }
  if (!normalized.isLab && normalized.linkedLabCode) {
    return `${base} (same # as ${normalized.linkedLabCode})`;
  }
  if (requiresIndexMatch(normalized.requiredComponents)) {
    return `${base} (matching section #)`;
  }
  return base;
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
  const dayStarts: number[] = [];
  const dayEnds: number[] = [];

  for (const blocks of byDay.values()) {
    blocks.sort((a, b) => a.start - b.start);
    dayStarts.push(blocks[0].start);
    dayEnds.push(blocks[blocks.length - 1].end);
    for (let i = 1; i < blocks.length; i++) {
      const gap = blocks[i].start - blocks[i - 1].end;
      if (gap > 0) gaps += gap;
    }
  }

  const daysUsed = byDay.size;
  const sumDayStart = dayStarts.reduce((a, b) => a + b, 0);
  const sumDayEnd = dayEnds.reduce((a, b) => a + b, 0);

  return {
    gaps,
    daysUsed,
    earliestStart: earliestStart === 24 * 60 ? 0 : earliestStart,
    latestEnd,
    totalMinutes,
    avgDayStart: daysUsed ? sumDayStart / daysUsed : 0,
    avgDayEnd: daysUsed ? sumDayEnd / daysUsed : 0,
    sumDayStart,
    sumDayEnd,
  };
}

/**
 * Rank by per-day start/end scores, not a single week extreme.
 * Primary: average across active days (so one early class doesn't dominate).
 * Tie-break: sum across days, then gaps / week extremes.
 */
function compareByMode(a: ScheduleOption, b: ScheduleOption, mode: RankMode): number {
  const sa = a.score;
  const sb = b.score;
  const eps = 0.5; // half-minute tolerance for float avgs

  switch (mode) {
    case "latestStart": {
      // Prefer later mornings on average across days you attend
      if (Math.abs(sa.avgDayStart - sb.avgDayStart) > eps) {
        return sb.avgDayStart - sa.avgDayStart;
      }
      if (sa.sumDayStart !== sb.sumDayStart) return sb.sumDayStart - sa.sumDayStart;
      if (sa.earliestStart !== sb.earliestStart) return sb.earliestStart - sa.earliestStart;
      return sa.gaps - sb.gaps;
    }
    case "earliestStart": {
      if (Math.abs(sa.avgDayStart - sb.avgDayStart) > eps) {
        return sa.avgDayStart - sb.avgDayStart;
      }
      if (sa.sumDayStart !== sb.sumDayStart) return sa.sumDayStart - sb.sumDayStart;
      if (sa.earliestStart !== sb.earliestStart) return sa.earliestStart - sb.earliestStart;
      return sa.gaps - sb.gaps;
    }
    case "earliestFinish": {
      if (Math.abs(sa.avgDayEnd - sb.avgDayEnd) > eps) {
        return sa.avgDayEnd - sb.avgDayEnd;
      }
      if (sa.sumDayEnd !== sb.sumDayEnd) return sa.sumDayEnd - sb.sumDayEnd;
      if (sa.latestEnd !== sb.latestEnd) return sa.latestEnd - sb.latestEnd;
      return sa.gaps - sb.gaps;
    }
    case "latestFinish": {
      if (Math.abs(sa.avgDayEnd - sb.avgDayEnd) > eps) {
        return sb.avgDayEnd - sa.avgDayEnd;
      }
      if (sa.sumDayEnd !== sb.sumDayEnd) return sb.sumDayEnd - sa.sumDayEnd;
      if (sa.latestEnd !== sb.latestEnd) return sb.latestEnd - sa.latestEnd;
      return sa.gaps - sb.gaps;
    }
    case "balanced":
    default:
      if (sa.gaps !== sb.gaps) return sa.gaps - sb.gaps;
      if (sa.daysUsed !== sb.daysUsed) return sa.daysUsed - sb.daysUsed;
      // Mild preference for later average starts when gaps are equal
      if (Math.abs(sa.avgDayStart - sb.avgDayStart) > eps) {
        return sb.avgDayStart - sa.avgDayStart;
      }
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
  matchIndex: boolean;
}

type ScheduleUnit =
  | { kind: "single"; plan: CoursePlan; branching: number }
  | { kind: "linked"; theory: CoursePlan; lab: CoursePlan; branching: number };

function prepareCourse(course: Course): CoursePlan {
  const normalized = normalizeCourse(course);
  const buckets = normalized.requiredComponents.map(
    (key) => normalized.components[key] ?? []
  );
  const matchIndex = requiresIndexMatch(normalized.requiredComponents);
  let branching = 1;
  if (matchIndex) {
    const indexSets = buckets.map(
      (b) => new Set(b.map(sectionIndex).filter((n): n is number => n != null))
    );
    const first = indexSets[0] ?? new Set<number>();
    const shared = [...first].filter((idx) =>
      indexSets.every((set) => set.has(idx))
    );
    branching = Math.max(shared.length, 1);
  } else {
    branching = buckets.reduce((acc, b) => acc * Math.max(b.length, 1), 1);
  }
  return { course: normalized, buckets, branching, matchIndex };
}

function buildUnits(courses: Course[]): ScheduleUnit[] {
  const plans = courses.map(prepareCourse);
  const byCode = new Map(plans.map((p) => [p.course.code, p]));
  const used = new Set<string>();
  const units: ScheduleUnit[] = [];

  for (const plan of plans) {
    if (used.has(plan.course.code)) continue;
    const course = plan.course;

    if (!course.isLab && course.linkedLabCode && byCode.has(course.linkedLabCode)) {
      const lab = byCode.get(course.linkedLabCode)!;
      used.add(course.code);
      used.add(lab.course.code);
      // Linked theory+lab: only matching section numbers count
      const theoryIndexes = new Set(
        plan.buckets.flat().map(sectionIndex).filter((n): n is number => n != null)
      );
      const labIndexes = new Set(
        lab.buckets.flat().map(sectionIndex).filter((n): n is number => n != null)
      );
      const shared = [...theoryIndexes].filter((i) => labIndexes.has(i)).length;
      units.push({
        kind: "linked",
        theory: plan,
        lab,
        branching: Math.max(shared, 1) * plan.branching * lab.branching,
      });
      continue;
    }

    if (course.isLab && course.linkedTheoryCode && byCode.has(course.linkedTheoryCode)) {
      // Theory will claim the pair when visited; if somehow lab comes first and theory unused:
      const theory = byCode.get(course.linkedTheoryCode)!;
      if (!used.has(theory.course.code)) {
        used.add(course.code);
        used.add(theory.course.code);
        const theoryIndexes = new Set(
          theory.buckets.flat().map(sectionIndex).filter((n): n is number => n != null)
        );
        const labIndexes = new Set(
          plan.buckets.flat().map(sectionIndex).filter((n): n is number => n != null)
        );
        const shared = [...theoryIndexes].filter((i) => labIndexes.has(i)).length;
        units.push({
          kind: "linked",
          theory,
          lab: plan,
          branching: Math.max(shared, 1),
        });
        continue;
      }
    }

    used.add(course.code);
    units.push({ kind: "single", plan, branching: plan.branching });
  }

  return units.sort((a, b) => a.branching - b.branching);
}

/**
 * Enumerate conflict-free combinations.
 * - Picks one section from every required component of each course.
 * - Lecture/recitation/lab components with matching numbers stay paired (L2↔R2, L3↔T3).
 * - Linked theory + lab courses (CORE 103 + CORE 103L) must share the same section #.
 */
export function enumerateSchedules(
  courses: Course[],
  opts: { maxOptions?: number; maxExplored?: number } = {}
): ScheduleOption[] {
  const maxOptions = opts.maxOptions ?? 80;
  const maxExplored = opts.maxExplored ?? 80000;

  if (courses.length === 0) return [];

  const units = buildUnits(courses);
  const plannedCount = units.reduce(
    (n, u) => n + (u.kind === "linked" ? 2 : 1),
    0
  );
  if (plannedCount !== courses.length) return [];

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
    forcedIndex: number | null,
    next: () => void
  ) {
    if (results.length >= maxOptions || explored >= maxExplored) return;
    if (bucketIdx === plan.buckets.length) {
      const before = current.length;
      for (const pick of chosen) current.push(pick);
      next();
      current.length = before;
      return;
    }

    const lockIndex =
      forcedIndex ??
      (plan.matchIndex && chosen.length > 0
        ? sectionIndex(chosen[0].section)
        : null);

    for (const section of plan.buckets[bucketIdx]) {
      explored++;
      if (explored >= maxExplored) return;

      const idx = sectionIndex(section);
      if (lockIndex != null && idx !== lockIndex) continue;

      if (current.some((p) => sectionsConflict(p.section, section))) continue;
      if (chosen.some((p) => sectionsConflict(p.section, section))) continue;

      chosen.push({
        course: plan.course,
        section,
        component: section.component,
      });
      dfsComponents(plan, bucketIdx + 1, chosen, current, forcedIndex, next);
      chosen.pop();
      if (results.length >= maxOptions) return;
    }
  }

  function primaryIndex(picks: PickedSection[]): number | null {
    const prefer = ["L", "D", "C", "S", "R", "T"];
    for (const comp of prefer) {
      const hit = picks.find((p) => p.component === comp);
      if (hit) return sectionIndex(hit.section);
    }
    return picks.length ? sectionIndex(picks[0].section) : null;
  }

  function dfsUnit(unitIdx: number, current: PickedSection[]) {
    if (results.length >= maxOptions || explored >= maxExplored) return;
    if (unitIdx === units.length) {
      save(current);
      return;
    }

    const unit = units[unitIdx];
    if (unit.kind === "single") {
      dfsComponents(unit.plan, 0, [], current, null, () => {
        dfsUnit(unitIdx + 1, current);
      });
      return;
    }

    // Linked theory + lab: choose theory first, then lab with the same §#
    dfsComponents(unit.theory, 0, [], current, null, () => {
      const theoryPicks = current.filter((p) => p.course.code === unit.theory.course.code);
      const idx = primaryIndex(theoryPicks);
      if (idx == null) return;
      dfsComponents(unit.lab, 0, [], current, idx, () => {
        dfsUnit(unitIdx + 1, current);
      });
    });
  }

  dfsUnit(0, []);
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
  latestStart: "Latest day starts (avg across days)",
  earliestFinish: "Earliest day ends (avg across days)",
  earliestStart: "Earliest day starts (avg across days)",
  latestFinish: "Latest day ends (avg across days)",
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
