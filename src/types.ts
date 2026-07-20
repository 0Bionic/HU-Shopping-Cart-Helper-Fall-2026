export type DayCode = "M" | "T" | "W" | "Th" | "F" | "S" | "Su";

/** Section component letter: L lecture, S seminar, T tutorial, R recitation, etc. */
export type ComponentCode = string;

export interface Meeting {
  days: string;
  dayList: DayCode[];
  start: string;
  end: string;
  startMin: number | null;
  endMin: number | null;
  room: string;
}

export interface Section {
  id: string;
  classNbr: string;
  section: string;
  /** Letter prefix of the section code (L, S, T, …). */
  component: ComponentCode;
  /** Numeric suffix of the section code (L3 → 3, T10 → 10). */
  sectionIndex: number | null;
  days: string;
  dayList: DayCode[];
  start: string;
  end: string;
  startMin: number | null;
  endMin: number | null;
  room: string;
  instructor: string;
  /** Individual meeting blocks (multi-day sections from the PDF). */
  meetings?: Meeting[];
}

export interface Course {
  code: string;
  subject: string;
  catalog: string;
  title: string;
  /** Flat list of all sections (kept for search/display). */
  sections: Section[];
  /**
   * Sections grouped by required component type.
   * A valid enrollment picks exactly one section from each key.
   */
  components: Record<ComponentCode, Section[]>;
  /** Ordered list of required component keys, e.g. ["L","S"]. */
  requiredComponents: ComponentCode[];
  /** True when this catalog is a lab course (e.g. 103L, 224L/272L). */
  isLab?: boolean;
  /** Linked theory course code when this is a lab, e.g. CORE 103. */
  linkedTheoryCode?: string | null;
  /** Linked lab course code when this is theory, e.g. CORE 103L. */
  linkedLabCode?: string | null;
}

export interface ScheduleData {
  term: string;
  termCode: string;
  sectionCount: number;
  courseCount: number;
  courses: Course[];
}

export interface PickedSection {
  course: Course;
  section: Section;
  component: ComponentCode;
}

export interface ScheduleOption {
  id: number;
  rank: number;
  picks: PickedSection[];
  score: {
    gaps: number;
    daysUsed: number;
    /** Earliest class of the whole week (for hard filters / display). */
    earliestStart: number;
    /** Latest class end of the whole week. */
    latestEnd: number;
    totalMinutes: number;
    /** Mean of each active day's first-class start (minutes). */
    avgDayStart: number;
    /** Mean of each active day's last-class end (minutes). */
    avgDayEnd: number;
    /** Sum of each day's first-class start — favors sleeping in on more days. */
    sumDayStart: number;
    /** Sum of each day's last-class end. */
    sumDayEnd: number;
  };
}

/** How to order schedule options after conflict filtering. */
export type RankMode =
  | "balanced"
  | "latestStart"
  | "earliestFinish"
  | "earliestStart"
  | "latestFinish";

export interface SchedulePrefs {
  rankMode: RankMode;
  /** Discard options that start earlier than this (minutes from midnight). null = no limit. */
  notBefore: number | null;
  /** Discard options that end later than this (minutes from midnight). null = no limit. */
  notAfter: number | null;
  /** Weekdays the student wants completely free. */
  daysOff: DayCode[];
}
