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
    earliestStart: number;
    latestEnd: number;
    totalMinutes: number;
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
