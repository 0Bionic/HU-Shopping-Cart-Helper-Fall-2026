"""Parse Fall 2026 Schedule of Classes PDF into structured JSON."""
import json
import re
from pathlib import Path

import fitz

PDF = Path(__file__).parent / "Fall 2026 Schedule of Classes.pdf"
OUT = Path(__file__).parent / "public" / "courses.json"


def page_lines(doc, i: int) -> list[str]:
    text = doc[i].get_text()
    return [ln.strip() for ln in text.splitlines() if ln.strip()]


def parse_courses(doc) -> list[dict]:
    id_lines: list[str] = []
    for i in range(0, 9):
        id_lines.extend(page_lines(doc, i))

    skip = {"Term Subject", "Catalog", "Course title", "Term", "Subject"}
    id_lines = [ln for ln in id_lines if ln not in skip and ln.lower() != "course title"]

    courses: list[dict] = []
    i = 0
    while i < len(id_lines):
        ln = id_lines[i]
        if not ln.startswith("2615"):
            i += 1
            continue
        parts = ln.split()
        subject = None
        catalog = None
        title = ""
        if len(parts) == 2:
            subject = parts[1]
            i += 1
            if i < len(id_lines) and not id_lines[i].startswith("2615"):
                catalog = id_lines[i]
                i += 1
            if i < len(id_lines) and not id_lines[i].startswith("2615"):
                title = id_lines[i]
                i += 1
        elif len(parts) >= 3:
            subject = parts[1]
            catalog = parts[2]
            i += 1
            if i < len(id_lines) and not id_lines[i].startswith("2615"):
                title = id_lines[i]
                i += 1
        else:
            i += 1
            continue
        courses.append(
            {
                "term": "2615",
                "subject": subject,
                "catalog": catalog,
                "title": title,
            }
        )
    return courses


def parse_sections(doc) -> list[dict]:
    sched_lines: list[str] = []
    for i in range(9, 18):
        sched_lines.extend(page_lines(doc, i))

    hdr = {
        "Class Nbr Section",
        "Day",
        "Start time",
        "End Time",
        "Room",
        "Class Nbr",
        "Section",
    }
    sched_lines = [ln for ln in sched_lines if ln not in hdr]

    class_re = re.compile(r"^(\d+)\s+([A-Za-z]+\d+)$")
    time_re = re.compile(r"^\d{1,2}:\d{2}:\d{2}\s*(AM|PM)$", re.I)
    sections: list[dict] = []
    i = 0
    while i < len(sched_lines):
        ln = sched_lines[i]
        m = class_re.match(ln)
        if not m:
            i += 1
            continue
        class_nbr, section = m.group(1), m.group(2)
        i += 1

        # TBA / missing schedule: next line is another class nbr
        if i >= len(sched_lines) or class_re.match(sched_lines[i]):
            sections.append(
                {
                    "classNbr": class_nbr,
                    "section": section,
                    "days": "TBA",
                    "start": "TBA",
                    "end": "TBA",
                    "room": "TBA",
                }
            )
            continue

        day = sched_lines[i]
        i += 1
        start = sched_lines[i] if i < len(sched_lines) else "TBA"
        i += 1
        end = sched_lines[i] if i < len(sched_lines) else "TBA"
        i += 1
        room = sched_lines[i] if i < len(sched_lines) else "TBA"

        # If fields got misaligned, recover
        if class_re.match(start) or not time_re.match(start):
            # day was wrong / TBA case already handled; rewind-ish fallback
            sections.append(
                {
                    "classNbr": class_nbr,
                    "section": section,
                    "days": "TBA",
                    "start": "TBA",
                    "end": "TBA",
                    "room": "TBA",
                }
            )
            # Don't advance past the next class line — back up to start
            # We already consumed day/start/end; put pointer back to day
            i -= 3
            continue

        if class_re.match(room):
            room = "TBA"
        else:
            i += 1

        sections.append(
            {
                "classNbr": class_nbr,
                "section": section,
                "days": day,
                "start": start,
                "end": end,
                "room": room,
            }
        )
    return sections

def parse_instructors(doc) -> list[str]:
    inst_lines: list[str] = []
    for i in range(18, 27):
        inst_lines.extend(page_lines(doc, i))
    return [ln for ln in inst_lines if ln != "Instructor"]


def to_minutes(t: str) -> int | None:
    m = re.match(r"^(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)$", t.strip(), re.I)
    if not m:
        return None
    h, mi, s, ap = int(m.group(1)), int(m.group(2)), int(m.group(3)), m.group(4).upper()
    if ap == "PM" and h != 12:
        h += 12
    if ap == "AM" and h == 12:
        h = 0
    return h * 60 + mi


def expand_days(day_str: str) -> list[str]:
    """Expand Habib day codes like TTh, MW, MF into individual days."""
    s = day_str.strip()
    if not s or s.upper() == "TBA":
        return []
    days: list[str] = []
    i = 0
    while i < len(s):
        if s[i : i + 2] == "Th":
            days.append("Th")
            i += 2
        elif s[i : i + 2] == "Su":
            days.append("Su")
            i += 2
        elif s[i] in "MTWFS":
            days.append(s[i])
            i += 1
        else:
            i += 1
    return days

def day_sort_key(d: str) -> int:
    order = ["M", "T", "W", "Th", "F", "S", "Su"]
    try:
        return order.index(d)
    except ValueError:
        return 99


def combine_day_codes(day_lists: list[list[str]]) -> tuple[str, list[str]]:
    seen: list[str] = []
    for dl in day_lists:
        for d in dl:
            if d not in seen:
                seen.append(d)
    seen.sort(key=day_sort_key)
    # Rebuild compact Habib-style string
    return "".join(seen), seen


def main() -> None:
    doc = fitz.open(PDF)
    courses = parse_courses(doc)
    sections = parse_sections(doc)
    instructors = parse_instructors(doc)

    print("COUNTS", len(courses), len(sections), len(instructors))
    n = min(len(courses), len(sections), len(instructors))
    if len(courses) != len(sections) or len(sections) != len(instructors):
        print(
            "WARNING: mismatched counts — truncating to",
            n,
            f"(courses={len(courses)}, sections={len(sections)}, instructors={len(instructors)})",
        )

    # Merge PDF rows that share a class number (multi-day / multi-meeting sections)
    merged: dict[str, dict] = {}
    merge_order: list[str] = []
    for i in range(n):
        c = courses[i]
        s = sections[i]
        instr = instructors[i]
        code = f"{c['subject']} {c['catalog']}".strip()
        class_nbr = s["classNbr"]
        meeting = {
            "days": s["days"],
            "dayList": expand_days(s["days"]),
            "start": s["start"],
            "end": s["end"],
            "startMin": to_minutes(s["start"]),
            "endMin": to_minutes(s["end"]),
            "room": s["room"],
        }

        if class_nbr not in merged:
            merged[class_nbr] = {
                "id": f"{class_nbr}-{s['section']}",
                "classNbr": class_nbr,
                "subject": c["subject"],
                "catalog": c["catalog"],
                "code": code,
                "title": c["title"],
                "section": s["section"],
                "meetings": [meeting],
                "instructors": [instr] if instr else [],
                "term": c["term"],
            }
            merge_order.append(class_nbr)
        else:
            entry = merged[class_nbr]
            # Avoid exact duplicate meeting rows
            sig = (
                meeting["days"],
                meeting["start"],
                meeting["end"],
                meeting["room"],
            )
            existing = {
                (m["days"], m["start"], m["end"], m["room"]) for m in entry["meetings"]
            }
            if sig not in existing:
                entry["meetings"].append(meeting)
            if instr and instr not in entry["instructors"]:
                entry["instructors"].append(instr)

    rows = []
    for class_nbr in merge_order:
        entry = merged[class_nbr]
        meetings = entry["meetings"]
        days_str, day_list = combine_day_codes([m["dayList"] for m in meetings])
        timed = [m for m in meetings if m["startMin"] is not None and m["endMin"] is not None]
        if timed:
            earliest = min(timed, key=lambda m: m["startMin"])
            latest = max(timed, key=lambda m: m["endMin"])
            start, end = earliest["start"], latest["end"]
            start_min, end_min = earliest["startMin"], latest["endMin"]
        else:
            start = meetings[0]["start"]
            end = meetings[0]["end"]
            start_min = meetings[0]["startMin"]
            end_min = meetings[0]["endMin"]

        rooms = []
        for m in meetings:
            if m["room"] and m["room"] not in rooms:
                rooms.append(m["room"])

        rows.append(
            {
                "id": entry["id"],
                "classNbr": entry["classNbr"],
                "subject": entry["subject"],
                "catalog": entry["catalog"],
                "code": entry["code"],
                "title": entry["title"],
                "section": entry["section"],
                "days": days_str if days_str else meetings[0]["days"],
                "dayList": day_list,
                "start": start,
                "end": end,
                "startMin": start_min,
                "endMin": end_min,
                "room": " / ".join(rooms) if rooms else "TBA",
                "instructor": ", ".join(entry["instructors"]) or "TBD",
                "meetings": meetings,
                "term": entry["term"],
            }
        )

    by_code: dict[str, dict] = {}
    for r in rows:
        key = r["code"]
        if key not in by_code:
            by_code[key] = {
                "code": r["code"],
                "subject": r["subject"],
                "catalog": r["catalog"],
                "title": r["title"],
                "sections": [],
            }
        by_code[key]["sections"].append(
            {
                "id": r["id"],
                "classNbr": r["classNbr"],
                "section": r["section"],
                "days": r["days"],
                "dayList": r["dayList"],
                "start": r["start"],
                "end": r["end"],
                "startMin": r["startMin"],
                "endMin": r["endMin"],
                "room": r["room"],
                "instructor": r["instructor"],
                "meetings": r["meetings"],
            }
        )

    courses_list = sorted(by_code.values(), key=lambda x: x["code"])
    OUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "term": "Fall 2026",
        "termCode": "2615",
        "sectionCount": len(rows),
        "courseCount": len(courses_list),
        "courses": courses_list,
        "sections": rows,
    }
    OUT.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Wrote {OUT} ({len(courses_list)} courses, {len(rows)} unique class numbers)")
    # Sanity: CS 381 should be one section
    for c in courses_list:
        if c["code"] == "CS 381":
            print("CS 381 sections:", len(c["sections"]), json.dumps(c["sections"][0], indent=2)[:600])
            break
    for c in courses_list:
        if c["code"] == "EE/CE 100":
            print("EE/CE 100 sections:", len(c["sections"]))
            break


if __name__ == "__main__":
    main()
