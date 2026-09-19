// Static weekly schedule template. Never mutated at runtime — each day's
// expected items are generated from this list plus computed durations.
// type: "homework" (checkbox + timer, gates the driving banner) |
//       "fixed" (school/car/logistics) | "free" (free time) | "activity" (clubs/tutors/outings)

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const RAW_SCHEDULE = [
  // time,  day,   label,                      type
  ["07:00", "Mon", "Atom", "homework"],
  ["07:00", "Tue", "Atom", "homework"],
  ["07:00", "Wed", "Atom", "homework"],
  ["07:00", "Thu", "Atom", "homework"],
  ["07:00", "Fri", "Spelling", "homework"],
  ["07:00", "Sat", "Atom", "homework"],
  ["07:00", "Sun", "Atom", "homework"],

  ["07:30", "Mon", "Get Ready", "fixed"],
  ["07:30", "Tue", "Get Ready", "fixed"],
  ["07:30", "Wed", "Get Ready", "fixed"],
  ["07:30", "Thu", "Get Ready", "fixed"],
  ["07:30", "Fri", "Get Ready", "fixed"],
  ["07:30", "Sat", "Get Ready", "fixed"],
  ["07:30", "Sun", "Get Ready", "fixed"],

  ["08:00", "Mon", "Free Time", "free"],
  ["08:00", "Tue", "Free Time", "free"],
  ["08:00", "Wed", "Free Time", "free"],
  ["08:00", "Thu", "Free Time", "free"],
  ["08:00", "Fri", "Free Time", "free"],
  ["08:00", "Sat", "Free Time", "free"],
  ["08:00", "Sun", "Free Time", "free"],

  ["08:30", "Mon", "School", "fixed"],
  ["08:30", "Tue", "School", "fixed"],
  ["08:30", "Wed", "School", "fixed"],
  ["08:30", "Thu", "School", "fixed"],
  ["08:30", "Fri", "School", "fixed"],

  ["09:30", "Sun", "Krav Maga", "activity"],

  ["11:00", "Sun", "Family Lunch", "activity"],

  ["14:00", "Sat", "Car", "fixed"],
  ["14:30", "Sat", "Free Time", "free"],

  ["15:30", "Mon", "Car", "fixed"],
  ["15:30", "Tue", "Car", "fixed"],
  ["15:30", "Wed", "Car", "fixed"],
  ["15:30", "Thu", "Car", "fixed"],
  ["15:30", "Fri", "Car", "fixed"],
  ["15:30", "Sun", "Football", "activity"],

  ["16:00", "Mon", "Free Time", "free"],
  ["16:00", "Tue", "Café with Papa", "activity"],
  ["16:00", "Wed", "Fiona", "activity"],
  ["16:00", "Thu", "Free Time", "free"],
  ["16:00", "Fri", "Atom", "homework"],

  ["16:30", "Tue", "Chadah", "activity"],
  ["16:30", "Fri", "Free Time", "free"],

  ["17:00", "Wed", "Car", "fixed"],

  ["17:30", "Wed", "Mia Drums / School Work", "homework"],
  ["17:30", "Thu", "Football", "activity"],
  ["17:30", "Sun", "Car", "fixed"],

  ["18:00", "Mon", "Russell", "activity"],
  ["18:00", "Tue", "Car", "fixed"],
  ["18:00", "Fri", "Movie Night", "activity"],
  ["18:00", "Sun", "Free Time", "free"],

  ["18:30", "Tue", "Russell Homework", "homework"],
  ["18:30", "Wed", "TTRS", "homework"],
  ["18:30", "Thu", "Spelling", "homework"],
];

const DEFAULT_DURATION_BY_TYPE = { homework: 30, fixed: 30, free: 30, activity: 60 };

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Build per-day sorted lists with computed duration_minutes (gap to next
// item that day, falling back to a sensible per-type default for the
// day's last item).
function buildSchedule() {
  const byDay = new Map(DAYS.map((d) => [d, []]));
  for (const [start_time, day, label, type] of RAW_SCHEDULE) {
    byDay.get(day).push({ start_time, label, type });
  }
  for (const day of DAYS) {
    const items = byDay.get(day).sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time));
    items.forEach((item, i) => {
      const next = items[i + 1];
      item.duration_minutes = next
        ? toMinutes(next.start_time) - toMinutes(item.start_time)
        : DEFAULT_DURATION_BY_TYPE[item.type];
      item.day = day;
      item.slug = slugify(item.label);
      item.item_key = `${slugify(day)}-${item.start_time.replace(":", "")}-${item.slug}`;
    });
    byDay.set(day, items);
  }
  return byDay;
}

export const SCHEDULE = buildSchedule();

export function scheduleForDay(day) {
  return SCHEDULE.get(day) || [];
}

// Deterministic homework_log.id for a given calendar date + schedule item,
// so the same slot always upserts the same row across devices.
export function logId(dateStr, item) {
  return `${dateStr}_${item.slug}_${item.start_time.replace(":", "")}`;
}
