// Static weekly schedule template. Never mutated at runtime — each day's
// expected items are generated from this list plus computed durations.
// type: "homework" (checkbox + timer, gates the driving banner) |
//       "fixed" (school/car/logistics) | "free" (free time) | "activity" (clubs/tutors/outings)

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Entries: [start_time, day, label, type, durationOverrideMinutes?]
// Duration is normally computed as the gap to the next item that day; an
// override is only needed for a day's last item (there's no "next" to
// measure against), e.g. the nightly "Reading" slot.
const RAW_SCHEDULE = [
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
  ["08:30", "Sun", "Krav Maga", "activity"],

  ["09:30", "Sun", "Family Lunch", "activity"],

  ["11:00", "Sun", "Car", "fixed"],
  ["11:30", "Sun", "Free Time", "free"],

  ["15:00", "Sun", "Football", "activity"],

  ["15:30", "Mon", "Car", "fixed"],
  ["15:30", "Tue", "Car", "fixed"],
  ["15:30", "Wed", "Car", "fixed"],
  ["15:30", "Thu", "Car", "fixed"],
  ["15:30", "Fri", "Car", "fixed"],

  ["16:00", "Mon", "Free Time", "free"],
  ["16:00", "Tue", "Café with Papa", "activity"],
  ["16:00", "Wed", "Fiona", "activity"],
  ["16:00", "Thu", "Free Time", "free"],
  ["16:00", "Fri", "Atom", "homework"],

  ["16:30", "Tue", "Chadah", "activity"],
  ["16:30", "Fri", "Free Time", "free"],
  ["16:30", "Sun", "Car", "fixed"],

  ["17:00", "Wed", "Car", "fixed"],
  ["17:00", "Fri", "Movie Night", "activity"],
  ["17:00", "Sun", "Free Time", "free"],

  ["17:30", "Wed", "Mia Drums / School Work", "homework"],
  ["17:30", "Thu", "Football", "activity"],

  ["18:00", "Mon", "Russell", "activity"],
  ["18:00", "Tue", "Car", "fixed"],
  ["18:00", "Wed", "TTRS", "homework"],
  ["18:00", "Thu", "Spelling", "homework"],

  ["18:30", "Tue", "Russell Homework", "homework"],
  ["18:30", "Wed", "Free Time", "free"],
  ["18:30", "Thu", "Fiona Homework", "homework"],

  ["19:00", "Mon", "Free Time", "free"],
  ["19:00", "Thu", "Free Time", "free"],

  ["19:30", "Tue", "Free Time", "free"],

  ["20:00", "Mon", "Reading", "homework", 60],
  ["20:00", "Tue", "Reading", "homework", 60],
  ["20:00", "Wed", "Reading", "homework", 60],
  ["20:00", "Thu", "Reading", "homework", 60],
  ["20:00", "Fri", "Reading", "homework", 60],

  ["20:30", "Sat", "Reading", "homework", 30],
  ["20:30", "Sun", "Reading", "homework", 30],
];

// Expected/target minutes for each homework task (how long it should take,
// shown next to the live elapsed timer) — distinct from duration_minutes
// above, which is just the calendar slot width and isn't shown in the UI.
const EXPECTED_MINUTES_BY_LABEL = {
  "Atom": 30,
  "Spelling": 10,
  "Russell Homework": 60,
  "Fiona Homework": 60,
  "TTRS": 20,
  "Mia Drums / School Work": 20,
  "Reading": 30,
};

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
  for (const [start_time, day, label, type, durationOverride] of RAW_SCHEDULE) {
    byDay.get(day).push({ start_time, label, type, durationOverride });
  }
  for (const day of DAYS) {
    const items = byDay.get(day).sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time));
    items.forEach((item, i) => {
      const next = items[i + 1];
      item.duration_minutes =
        item.durationOverride ??
        (next ? toMinutes(next.start_time) - toMinutes(item.start_time) : DEFAULT_DURATION_BY_TYPE[item.type]);
      delete item.durationOverride;
      item.day = day;
      item.slug = slugify(item.label);
      item.item_key = `${slugify(day)}-${item.start_time.replace(":", "")}-${item.slug}`;
      if (item.type === "homework") {
        item.expected_minutes = EXPECTED_MINUTES_BY_LABEL[item.label] ?? item.duration_minutes;
      }
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
