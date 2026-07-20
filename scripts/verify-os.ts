import data from "../public/courses.json";
import { enumerateSchedules, normalizeCourse } from "../src/scheduler.ts";

const get = (c: string) => normalizeCourse(data.courses.find((x) => x.code === c)!);
const courses = [
  get("CS/CE 232/324"),
  get("CS/CE 232L/324L"),
  get("CORE 101"),
  get("MATH 205"),
];
const opts = enumerateSchedules(courses);
const bad = opts.filter((o) => {
  const L = o.picks.find((p) => p.course.code === "CS/CE 232/324");
  const T = o.picks.find((p) => p.course.code === "CS/CE 232L/324L");
  return L && T && L.section.sectionIndex !== T.section.sectionIndex;
});
console.log("opts", opts.length, "bad", bad.length);
console.log(
  "os samples",
  opts.slice(0, 5).map((o) =>
    o.picks
      .filter((p) => p.course.code.includes("232"))
      .map((p) => p.section.section)
      .join("+")
  )
);
