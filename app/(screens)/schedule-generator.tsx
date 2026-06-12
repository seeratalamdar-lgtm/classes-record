import React, { useMemo, useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Platform, StyleSheet,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

/* ============================================================================
 AI SCHEDULE GENERATOR — v3
 CSV columns (12):
  1 Subject Code | 2 Subjects | 3 Department | 4 Instructor Name with Sections
  5 Regular/Elective | 6 Class | 7 Credit Hrs (Lec+Lab)
  8 Location CR        — comma list mapped IN ORDER to sections, e.g. "1,2" -> A:CR-1 B:CR-2
  9 Location Lab       — shared lab venue (room-clash tracked)
 10 Day Availability   — faculty days, empty = all active days  (LECTURES ONLY)
 11 Time Availibility  — "9-13" 24h window, empty = full day    (LECTURES ONLY)
 12 Combined Location  — big venue; all sections of the row attend ONE shared
                         lecture session there (lectures only, labs never combine)

 RULES
  H1  Section clash    — a section attends one thing at a time
  H2  Faculty clash    — lectures only; labs are run by TAs (LAB_USES_FACULTY=false)
  H3  Room clash       — CRs, lab rooms and combined venues tracked per slot
  H4  Faculty Day/Time availability — applies to LECTURES ONLY (TA conducts labs)
  H5  Lab = 3 consecutive hours, never spans the break
  S1  Same subject max once/day/section (falls back to a consecutive double
      lecture when availability days < lecture count — warned)
  S2  Max one lab per section per day (warned if relaxed)
  S3  Lab placed right after break, else right before, else first fit
  S4  Faculty hours consecutive, capped at 3 in a row
  S5  Faculty min days on campus: lecture hrs <=2 -> 2 days, ==3 -> 3, >=4 -> 4
  S6  Low-credit sections start 1 hour late every day
      (section weekly hrs <= max section weekly hrs - 3)
  S7  Electives of the same class share identical slots across sections
  ORDER: constrained lectures -> combined -> labs -> free lectures
        (labs are availability-exempt so they are flexible; tiny faculty
         windows must be filled first or labs eat them)
============================================================================ */

const LAB_USES_FACULTY = false; // TAs conduct labs: labs don't block or restrict faculty

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Row = {
  i: number; code: string; subject: string; dept: string; faculty: string;
  type: string; klass: string; lec: number; lab: number;
  sections: string[]; crMap: Record<string, string>;
  labLoc: string; days: string[] | null; time: { s: number; e: number } | null;
  combined: string | null;
};
type Entry = {
  faculty: string; subject: string; class: string; day: string;
  time: string; endTime: string; location: string; lecLab: "Lec" | "Lab";
  dept: string; elective: string;
};

/* ----------------------------- CSV parsing ------------------------------ */

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let cur = "", row: string[] = [], q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

function normHeader(h: string) {
  return h.toLowerCase().replace(/[^a-z]/g, "");
}

const TIME_RE = /^(\d{1,2})\s*[-–]\s*(\d{1,2})$/;

function parseRows(text: string): { rows: Row[]; warnings: string[] } {
  const raw = parseCSV(text);
  const warnings: string[] = [];
  if (raw.length < 2) return { rows: [], warnings: ["CSV has no data rows."] };
  const head = raw[0].map(normHeader);
  const col = (...names: string[]) => head.findIndex((h) => names.some((n) => h.includes(n)));
  const C = {
    code: col("subjectcode"), subject: col("subjects", "subjectname"),
    dept: col("department"), inst: col("instructor"),
    type: col("regular", "elective"), klass: col("class"),
    credit: col("credithrs", "credit"), cr: col("locationcr"),
    lab: col("locationlab"), days: col("dayavail"),
    time: col("timeavail"), comb: col("combined"),
  };
  if (C.code < 0 || C.inst < 0 || C.credit < 0 || C.klass < 0) {
    return { rows: [], warnings: ["Header row not recognised — download the new draft template."] };
  }
  if (C.comb < 0) warnings.push("No 'Combined Location' column found — combining disabled.");

  const rows: Row[] = [];
  raw.slice(1).forEach((r, idx) => {
    const g = (c: number) => (c >= 0 && c < r.length ? (r[c] || "").trim() : "");
    const n = idx + 2; // human row number
    const instRaw = g(C.inst);
    const m = instRaw.match(/^(.*?)\(([^)]+)\)\s*$/);
    const faculty = (m ? m[1] : instRaw).trim();
    const sections = m ? m[2].replace(/[^A-Za-z]/g, "").toUpperCase().split("") : ["A"];
    if (!m) warnings.push(`Row ${n}: no (sections) in instructor name — assumed single section A.`);

    const cm = g(C.credit).match(/(\d+)\s*\+\s*(\d+)/);
    if (!cm) { warnings.push(`Row ${n}: Credit Hrs "${g(C.credit)}" not in Lec+Lab form — row skipped.`); return; }
    const lec = parseInt(cm[1], 10), lab = parseInt(cm[2], 10);

    const combined = (g(C.comb) || "").trim() || null;

    // Day availability
    let days: string[] | null = null;
    if (g(C.days)) {
      days = g(C.days).split(",").map((d) => d.trim().slice(0, 3))
        .map((d) => d.charAt(0).toUpperCase() + d.slice(1).toLowerCase())
        .filter((d) => {
          const ok = DAY_NAMES.includes(d);
          if (!ok) warnings.push(`Row ${n}: unknown day "${d}" ignored.`);
          return ok;
        });
      if (!days.length) days = null;
    }

    // Time availability — venue names typed here are auto-moved to Combined Location
    let time: { s: number; e: number } | null = null;
    let combinedFinal = combined;
    const tRaw = g(C.time);
    if (tRaw) {
      const tm = tRaw.match(TIME_RE);
      if (tm) {
        time = { s: parseInt(tm[1], 10), e: parseInt(tm[2], 10) };
        if (time.e <= time.s) { warnings.push(`Row ${n}: Time Availability "${tRaw}" end <= start — ignored.`); time = null; }
      } else if (!combinedFinal) {
        combinedFinal = tRaw; // single venue name, no time range -> it's a Combined Location
        warnings.push(`Row ${n}: "${tRaw}" found in Time Availability — treated as Combined Location.`);
      } else {
        warnings.push(`Row ${n}: Time Availability "${tRaw}" is not a time range like 9-13 — ignored.`);
      }
    }

    // Location CR -> ordered map onto sections (skipped warnings for combined rows)
    const crMap: Record<string, string> = {};
    const crList = g(C.cr) ? g(C.cr).split(",").map((x) => x.trim()).filter(Boolean) : [];
    if (!combinedFinal && lec > 0) {
      if (crList.length && crList.length !== sections.length) {
        warnings.push(`Row ${n}: ${sections.length} sections but ${crList.length} CR numbers — extra sections get no room.`);
      }
      if (!crList.length) warnings.push(`Row ${n}: Location CR empty — lecture rooms left blank.`);
    }
    sections.forEach((s, k) => {
      crMap[s] = crList[k] ? (/^cr/i.test(crList[k]) ? crList[k].toUpperCase() : `CR-${crList[k]}`) : "";
    });

    rows.push({
      i: n, code: g(C.code), subject: g(C.subject), dept: g(C.dept), faculty,
      type: g(C.type) || "Regular", klass: g(C.klass), lec, lab, sections, crMap,
      labLoc: g(C.lab), days, time, combined: combinedFinal,
    });
  });
  return { rows, warnings };
}

/* --------------------------- The scheduler ------------------------------ */

function generate(
  rows: Row[], activeDays: string[], startHour: number, endHour: number,
  brk: { s: number; e: number } | null, slotMin: number,
): { entries: Entry[]; warnings: string[] } {
  const W: string[] = [];
  const entries: Entry[] = [];
  const startMin = startHour * 60, endMin = endHour * 60;
  const brkS = brk ? brk.s * 60 : -1, brkE = brk ? brk.e * 60 : -1;
  const LAB_MIN = 180; // a lab is always 3 clock-hours
  const labSlots = Math.max(1, Math.ceil(LAB_MIN / slotMin));
  const labLen = labSlots * slotMin;
  // Split lattice: morning slots from start time, afternoon slots restart at break end
  const SLOTS: number[] = [];
  for (let x = startMin; x + slotMin <= (brk ? brkS : endMin); x += slotMin) SLOTS.push(x);
  if (brk) for (let x = brkE; x + slotMin <= endMin; x += slotMin) SLOTS.push(x);
  const contiguousFrom = (i: number, n: number) => {
    if (i + n > SLOTS.length) return false;
    for (let k = 0; k < n - 1; k++) if (SLOTS[i + k + 1] !== SLOTS[i + k] + slotMin) return false;
    return true;
  };
  const fmt = (mm: number) => `${Math.floor(mm / 60)}:${String(mm % 60).padStart(2, "0")}`;

  const secKey = (klass: string, s: string) => `${klass}|${s}`;
  const busySec: Record<string, Record<string, Set<number>>> = {};
  const busyFac: Record<string, Record<string, Set<number>>> = {};
  const busyRoom: Record<string, Record<string, Set<number>>> = {};
  const labCountSecDay: Record<string, Record<string, number>> = {};
  const subjDaySec: Record<string, Set<string>> = {};

  const bs = (m2: any, k: string, d: string) => ((m2[k] = m2[k] || {}), (m2[k][d] = m2[k][d] || new Set<number>()));
  const free = (m2: any, k: string, d: string, x: number) => !m2[k]?.[d]?.has(x);
  const overlapsBreak = (x: number, lenMin: number) => brk !== null && x < brkE && x + lenMin > brkS;

  // S6 - late start for low-credit sections (one slot late)
  const secTotal: Record<string, number> = {};
  rows.forEach((r) => r.sections.forEach((s) => {
    secTotal[secKey(r.klass, s)] = (secTotal[secKey(r.klass, s)] || 0) + r.lec * slotMin + r.lab * LAB_MIN;
  }));
  const maxTotal = Math.max(0, ...Object.values(secTotal));
  const secStart = (k: string) =>
    (secTotal[k] ?? maxTotal) <= maxTotal - LAB_MIN ? (SLOTS[1] ?? SLOTS[0] ?? startMin) : (SLOTS[0] ?? startMin);

  // S5 - faculty allowed days from LECTURE minutes only (labs are TA-run)
  const facLecMin: Record<string, number> = {};
  rows.forEach((r) => { facLecMin[r.faculty] = (facLecMin[r.faculty] || 0) + r.lec * slotMin * (r.combined ? 1 : r.sections.length); });
  const facDayCap = (f: string) => { const mm = facLecMin[f] || 0; return mm <= 120 ? 2 : mm <= 180 ? 3 : 4; };
  const facDays: Record<string, string[]> = {};

  const facultyDayAllowed = (f: string, d: string, relax: boolean) => {
    if (relax) return true;
    const used = facDays[f] || [];
    return used.includes(d) || used.length < facDayCap(f);
  };
  const noteFacultyDay = (f: string, d: string) => {
    facDays[f] = facDays[f] || [];
    if (!facDays[f].includes(d)) facDays[f].push(d);
  };

  // S4 - consecutive preference, run capped at 180 teaching minutes
  const maxRunSlots = Math.max(1, Math.round(180 / slotMin));
  const facRunIfAdded = (f: string, d: string, x: number) => {
    const set = busyFac[f]?.[d] || new Set<number>();
    let run = 1, y = x - slotMin;
    while (set.has(y)) { run++; y -= slotMin; }
    y = x + slotMin;
    while (set.has(y)) { run++; y += slotMin; }
    return run;
  };
  const facAdjacent = (f: string, d: string, x: number) => {
    const set = busyFac[f]?.[d];
    return !!set && (set.has(x - slotMin) || set.has(x + slotMin));
  };

  const occupy = (r: Row, secs: string[], d: string, x: number, lenSlots: number, room: string, isLab: boolean) => {
    for (let y = x; y < x + lenSlots * slotMin; y += slotMin) {
      secs.forEach((s) => bs(busySec, secKey(r.klass, s), d).add(y));
      if (!isLab || LAB_USES_FACULTY) bs(busyFac, r.faculty, d).add(y);
      if (room) bs(busyRoom, room, d).add(y);
    }
    if (!isLab || LAB_USES_FACULTY) noteFacultyDay(r.faculty, d);
    secs.forEach((s) => {
      const n = isLab ? lenSlots : 1; // labs emit one entry PER SLOT (3 consecutive rows)
      for (let k = 0; k < n; k++) {
        const t0 = x + k * slotMin;
        entries.push({
          faculty: r.faculty, subject: r.subject, class: `${r.klass} (${s})`, day: d,
          time: fmt(t0), endTime: fmt(t0 + (n > 1 ? slotMin : lenSlots * slotMin)),
          location: room, lecLab: isLab ? "Lab" : "Lec",
          dept: r.dept, elective: /elective/i.test(r.type) ? "Elective" : "",
        });
      }
    });
  };

  /* ---- LAB placement (TA-run: exempt from faculty availability & clash) ---- */
  const placeLabs = () => {
  const labRows = rows.filter((r) => r.lab > 0)
    .sort((a, b) => (b.labLoc ? 1 : 0) - (a.labLoc ? 1 : 0));
  for (const r of labRows) {
    for (const s of r.sections) {
      const k = secKey(r.klass, s);
      let placed = false;
      for (const relaxOneLabPerDay of [false, true]) {
        const dayOrder = [...activeDays].sort((d1, d2) =>
          (labCountSecDay[k]?.[d1] || 0) - (labCountSecDay[k]?.[d2] || 0));
        for (const d of dayOrder) {
          if (!relaxOneLabPerDay && (labCountSecDay[k]?.[d] || 0) > 0) continue;
          const lo = secStart(k);
          const starts: number[] = [];
          const idxOK = (i: number) => SLOTS[i] >= lo && contiguousFrom(i, labSlots);
          const iAft = SLOTS.indexOf(brkE);                       // right after break (S3)
          if (brk && iAft >= 0 && idxOK(iAft)) starts.push(SLOTS[iAft]);
          if (brk) for (let i = SLOTS.length - 1; i >= 0; i--) {  // latest block ending at/before break
            if (idxOK(i) && SLOTS[i] + labLen <= brkS) { starts.push(SLOTS[i]); break; }
          }
          for (let i = 0; i < SLOTS.length; i++) if (idxOK(i)) starts.push(SLOTS[i]);
          for (const x of starts) {
            if (overlapsBreak(x, labLen)) continue;
            let ok = true;
            for (let y = x; y < x + labLen; y += slotMin) {
              if (!free(busySec, k, d, y)) ok = false;
              if (r.labLoc && !free(busyRoom, r.labLoc, d, y)) ok = false;
              if (LAB_USES_FACULTY && !free(busyFac, r.faculty, d, y)) ok = false;
            }
            if (!ok) continue;
            occupy(r, [s], d, x, labSlots, r.labLoc, true);
            labCountSecDay[k] = labCountSecDay[k] || {};
            labCountSecDay[k][d] = (labCountSecDay[k][d] || 0) + 1;
            if (relaxOneLabPerDay) W.push(`Row ${r.i}: section ${r.klass}(${s}) got a 2nd lab on ${d} (no free day left).`);
            placed = true; break;
          }
          if (placed) break;
        }
        if (placed) break;
      }
      if (!placed) W.push(`Row ${r.i}: could NOT place lab for ${r.klass}(${s}) — ${r.labLoc || "lab room"} is fully booked.`);
    }
  }
  };

  /* ---- LECTURES ---- */
  const electiveSlot: Record<string, { d: string; x: number }[]> = {};

  const placeLectures = (r: Row, secs: string[], shared: boolean) => {
    const keys = secs.map((s) => secKey(r.klass, s));
    const loWin = Math.max(...keys.map(secStart), r.time ? r.time.s * 60 : startMin);
    const hiWin = Math.min(endMin, r.time ? r.time.e * 60 : endMin);
    const allowedDays = (r.days || activeDays).filter((d) => activeDays.includes(d));
    if (r.days && !allowedDays.length) { W.push(`Row ${r.i}: none of the availability days are active schedule days.`); return; }
    if (hiWin - loWin < slotMin) { W.push(`Row ${r.i}: time window ${fmt(loWin)}-${fmt(hiWin)} smaller than one ${slotMin}-min slot.`); return; }
    if (r.days && r.lec > allowedDays.length) {
      W.push(`Row ${r.i}: ${r.lec} lectures but only ${allowedDays.length} available day(s) — using consecutive double lectures.`);
    }

    const latticeLo = Math.max(...keys.map(secStart)); // lattice base for these sections
    const subjKey = `${keys[0]}|${r.code}`;
    subjDaySec[subjKey] = subjDaySec[subjKey] || new Set();
    const room = (s: string) => (shared ? r.combined! : r.crMap[s] || "");
    const eKey = `${r.klass}|${r.type.toLowerCase()}`;
    const isElective = /elective/i.test(r.type);

    for (let li = 0; li < r.lec; li++) {
      let done = false;
      for (const [sameDay, relaxDays, relaxRun] of
        [[false, false, false], [true, false, false], [false, true, false], [true, true, true]] as const) {
        const cands: { d: string; x: number; score: number }[] = [];
        for (const d of allowedDays) {
          if (!sameDay && subjDaySec[subjKey].has(d)) continue;
          if (!facultyDayAllowed(r.faculty, d, relaxDays)) continue;
          for (const x of SLOTS) {
            if (x < latticeLo || x < loWin || x + slotMin > hiWin) continue;
            if (overlapsBreak(x, slotMin)) continue;
            if (!free(busyFac, r.faculty, d, x)) continue;
            if (keys.some((k) => !free(busySec, k, d, x))) continue;
            if (secs.some((s) => room(s) && !free(busyRoom, room(s), d, x))) continue;
            if (!relaxRun && facRunIfAdded(r.faculty, d, x) > maxRunSlots) continue;
            let score = 0;
            if (facAdjacent(r.faculty, d, x)) score += 8;
            if (sameDay && busySec[keys[0]]?.[d]?.has(x - slotMin)) score += 4;
            if ((facDays[r.faculty] || []).includes(d)) score += 3;
            if (isElective && electiveSlot[eKey]?.some((e2) => e2.d === d && e2.x === x)) score += 10;
            score -= ((x - (SLOTS[0] ?? startMin)) / slotMin) * 0.1;
            cands.push({ d, x, score });
          }
        }
        if (cands.length) {
          cands.sort((a, b) => b.score - a.score);
          const { d, x } = cands[0];
          for (let s2 = 0; s2 < secs.length; s2++) {
            const s = secs[s2];
            bs(busySec, secKey(r.klass, s), d).add(x);
            if (room(s)) bs(busyRoom, room(s), d).add(x);
            entries.push({
              faculty: r.faculty, subject: r.subject, class: `${r.klass} (${s})`, day: d,
              time: fmt(x), endTime: fmt(x + slotMin), location: room(s), lecLab: "Lec",
              dept: r.dept, elective: isElective ? "Elective" : "",
            });
          }
          bs(busyFac, r.faculty, d).add(x);
          noteFacultyDay(r.faculty, d);
          subjDaySec[subjKey].add(d);
          if (isElective) (electiveSlot[eKey] = electiveSlot[eKey] || []).push({ d, x });
          done = true; break;
        }
      }
      if (!done) W.push(`Row ${r.i}: could NOT place lecture ${li + 1}/${r.lec} for ${r.klass}(${secs.join("")}) — ${r.faculty}.`);
    }
  };

  /* ---- PASS ORDER: constrained lectures -> combined -> labs -> free lectures ---- */
  rows.filter((r) => !r.combined && r.lec > 0 && (r.days || r.time))
    .sort((a, b) => ((a.days?.length ?? 9) * (a.time ? (a.time.e - a.time.s) : 9)) -
                    ((b.days?.length ?? 9) * (b.time ? (b.time.e - b.time.s) : 9)))
    .forEach((r) => r.sections.forEach((s) => placeLectures(r, [s], false)));
  rows.filter((r) => r.combined && r.lec > 0).forEach((r) => placeLectures(r, r.sections, true));
  placeLabs();
  rows.filter((r) => !r.combined && r.lec > 0 && !r.days && !r.time)
    .forEach((r) => r.sections.forEach((s) => placeLectures(r, [s], false)));

  return { entries, warnings: [...new Set(W)] };
}

/* ------------------------------- Screen --------------------------------- */

const TEMPLATE =
  "Subject Code,Subjects,Department,Instructor Name with Sections,Regular/Elective,Class,Credit Hrs,Location CR,Location Lab,Day Availability,Time Availibility,Combined Location\n" +
  "MATH101,Calculus and Analytical Geometry,BS,Dr. Quanita Kiran (AB),Regular,BEE-9,3+0,\"1,2\",,\"Mon, Tue\",9-13,\n" +
  "MATH101,Calculus and Analytical Geometry,BS,Dr. Mehwish Rubab (CD),Regular,BEE-9,3+0,\"3,4\",,\"Wed, Thu\",9-13,\n" +
  "PHY101,Applied Physics,BS,Dr. Imran Malik (AB),Regular,BEE-9,3+1,\"1,2\",SNS Lab,,,\n" +
  "PHY101,Applied Physics,BS,Ms. Sabeen Sher Afghan (CD),Regular,BEE-9,3+1,\"3,4\",SNS Lab,,,\n" +
  "CS113,Introduction to Programming,DoC,Ms. Maryam Saeed (ABC),Regular,BEE-9,1+1,,Computing Lab-1,,,SEECS Seminar Hall\n" +
  "CS113,Introduction to Programming,DoC,Dr. Syed Taha Ali (D),Regular,BEE-9,1+1,4,Computing Lab-1,Fri,9-13,\n" +
  "ME104,Engineering Drawing,EE,Mr. Naqash Afzal (ABCD),Regular,BEE-9,0+1,\"1,2,3,4\",SNS Lab,,,\n" +
  "HU100,English,HU,Ms. Maryam Fatima (ABCD),Regular,BEE-9,2+0,\"1,2,3,4\",,,,\n" +
  "HU107,Pakistan Studies,HU,Mr. Amjid (ABCD),Regular,BEE-9,2+0,\"1,2,3,4\",,,,\n";

export default function ScheduleGenerator() {
  const p = useLocalSearchParams<{
    scheduleId?: string; scheduleTitle?: string; startHour?: string; endHour?: string;
    activeDays?: string; breakStart?: string; breakEnd?: string; lectureDuration?: string; breakTime?: string;
  }>();
  const scheduleId = p.scheduleId ?? "";
  const startHour = parseInt(p.startHour || "9", 10);
  const endHour = parseInt(p.endHour || "17", 10);
  const activeDays = (p.activeDays || "Mon,Tue,Wed,Thu,Fri").split(",").map((d) => d.trim()).filter(Boolean);
  const btp = p.breakTime ? String(p.breakTime).split("-") : null;
  const brk = p.breakStart && p.breakEnd
    ? { s: parseInt(p.breakStart, 10), e: parseInt(p.breakEnd, 10) }
    : btp && btp.length === 2
    ? { s: parseInt(btp[0], 10) || 13, e: parseInt(btp[1], 10) || (parseInt(btp[0], 10) || 13) + 1 }
    : null;
  const slotMin = Math.max(15, parseInt(p.lectureDuration || "60", 10) || 60);

  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [parseWarn, setParseWarn] = useState<string[]>([]);
  const [genWarn, setGenWarn] = useState<string[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [busy, setBusy] = useState<"" | "gen" | "import">("");
  const [imported, setImported] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  const requiredSlots = useMemo(
    () => Math.round(rows.reduce((t, r) => t + (r.lec * slotMin + r.lab * 180) * r.sections.length, 0) / 6) / 10,
    [rows, slotMin]);

  const downloadDraft = async () => {
    try {
      if (Platform.OS === "web" && typeof document !== "undefined") {
        const blob = new Blob([TEMPLATE], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = "Draft_Schedule.csv";
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        const path = FileSystem.cacheDirectory + "Draft_Schedule.csv";
        await FileSystem.writeAsStringAsync(path, TEMPLATE);
        if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(path, { mimeType: "text/csv" });
      }
    } catch (e: any) { Alert.alert("Download failed", String(e?.message || e)); }
  };

  const upload = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ["text/csv", "text/comma-separated-values", "*/*"] });
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      let text = "";
      if (Platform.OS === "web") text = await (await fetch(a.uri)).text();
      else text = await FileSystem.readAsStringAsync(a.uri);
      const parsed = parseRows(text);
      setRows(parsed.rows); setParseWarn(parsed.warnings);
      setFileName(a.name || "schedule.csv");
      setEntries([]); setGenWarn([]); setImported(false);
    } catch (e: any) { Alert.alert("Upload failed", String(e?.message || e)); }
  };

  const runGenerate = () => {
    setBusy("gen");
    setTimeout(() => {
      const out = generate(rows, activeDays, startHour, endHour, brk, slotMin);
      setEntries(out.entries); setGenWarn(out.warnings); setBusy("");
    }, 50);
  };

  const runImport = async () => {
    setBusy("import");
    setStatus(null);
    try {
      const to12 = (t: string) => {
        const [h, mm] = t.split(":").map((v) => parseInt(v, 10) || 0);
        const ap = h >= 12 ? "PM" : "AM";
        const h12 = h % 12 === 0 ? 12 : h % 12;
        return `${String(h12).padStart(2, "0")}:${String(mm).padStart(2, "0")} ${ap}`;
      };
      // serve.js expects { rows, scheduleId } with capitalised keys & 12-hour times
      const rows = entries.map((e) => ({
        Faculty: e.faculty, Subject: e.subject, Class: e.class, Deptt: e.dept,
        Day: e.day, Time: to12(e.time), EndTime: to12(e.endTime),
        Location: e.location, LecLab: e.lecLab, Elective: e.elective, UserEmail: "",
      }));
      const base = Platform.OS === "web" ? "" : `https://${process.env.EXPO_PUBLIC_DOMAIN || "schoolcollege.online"}`;
      const r = await fetch(`${base}/api/import/schedule`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduleId, rows }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.success === false) throw new Error(j?.message || j?.error || `Server ${r.status}`);
      setImported(true);
      setStatus({ ok: true, msg: `✓ Imported ${j?.imported ?? entries.length} entries — opening dashboard…` });
      setTimeout(() => { try { router.replace({ pathname: "/schedule-dashboard", params: p as any }); } catch {} }, 1200);
    } catch (e: any) {
      setStatus({ ok: false, msg: `Import failed: ${String(e?.message || e)}` });
    }
    setBusy("");
  };

  const Warn = ({ list, title }: { list: string[]; title: string }) =>
    !list.length ? null : (
      <View style={st.warnBox}>
        <Text style={st.warnTitle}>⚠ {title} ({list.length})</Text>
        {list.map((w, i) => <Text key={i} style={st.warnTxt}>• {w}</Text>)}
      </View>
    );

  return (
    <View style={st.root}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => { if ((router as any).canGoBack && (router as any).canGoBack()) { router.back(); } else { router.replace("/"); } }} style={st.backBtn}>
          <Feather name="arrow-left" size={18} color="#fff" />
          <Text style={st.backTxt}>Back</Text>
        </TouchableOpacity>
        <Text style={st.h1}>AI Schedule Generator</Text>
        <Text style={st.h2}>
          {p.scheduleTitle || "Schedule"} · {activeDays.join(", ")} · {startHour}:00–{endHour}:00 · {slotMin} min
          {brk ? ` · Break ${brk.s}:00–${brk.e}:00` : ""}
        </Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
        <View style={st.card}>
          <TouchableOpacity style={[st.btn, { backgroundColor: "#1565C0" }]} onPress={downloadDraft}>
            <Feather name="download" size={15} color="#fff" />
            <Text style={st.btnTxt}>Download Draft</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[st.btn, { backgroundColor: fileName ? "#1B5E20" : "#1565C0" }]} onPress={upload}>
            <Feather name="upload" size={15} color="#fff" />
            <Text style={st.btnTxt}>{fileName || "Upload Draft CSV"}</Text>
          </TouchableOpacity>
          {rows.length > 0 && (
            <Text style={st.okTxt}>✓ {rows.length} rows loaded · {requiredSlots} weekly hours required</Text>
          )}
          <Warn list={parseWarn} title="CSV warnings" />
        </View>

        <View style={st.card}>
          <TouchableOpacity
            disabled={!rows.length || busy !== ""}
            style={[st.btn, { backgroundColor: rows.length ? "#E65100" : "#9E9E9E" }]}
            onPress={runGenerate}>
            {busy === "gen" ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="cpu" size={15} color="#fff" />}
            <Text style={st.btnTxt}>Generate Schedule with AI</Text>
          </TouchableOpacity>
          <Warn list={genWarn} title="Generation warnings" />
        </View>

        {entries.length > 0 && (
          <View style={st.card}>
            <Text style={st.previewTitle}>Preview — {entries.length} entries</Text>
            <ScrollView horizontal>
              <View>
                <View style={[st.tr, st.thead]}>
                  {["Day", "Time", "Class", "Subject", "Faculty", "Location", "Type"].map((h) => (
                    <Text key={h} style={[st.td, st.th]}>{h}</Text>
                  ))}
                </View>
                {entries.slice(0, 40).map((e, i) => (
                  <View key={i} style={[st.tr, i % 2 ? st.zebra : null]}>
                    <Text style={st.td}>{e.day}</Text>
                    <Text style={st.td}>{e.time}–{e.endTime}</Text>
                    <Text style={st.td}>{e.class}</Text>
                    <Text style={[st.td, { width: 180 }]} numberOfLines={1}>{e.subject}</Text>
                    <Text style={[st.td, { width: 160 }]} numberOfLines={1}>{e.faculty}</Text>
                    <Text style={st.td}>{e.location || "—"}</Text>
                    <Text style={[st.td, { color: e.lecLab === "Lab" ? "#E65100" : "#1565C0" }]}>{e.lecLab}</Text>
                  </View>
                ))}
              </View>
            </ScrollView>
            {entries.length > 40 && <Text style={st.moreTxt}>…and {entries.length - 40} more</Text>}
            <TouchableOpacity
              disabled={busy !== "" || imported}
              style={[st.btn, { backgroundColor: imported ? "#1B5E20" : "#2E7D32", marginTop: 12 }]}
              onPress={runImport}>
              {busy === "import" ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="check-circle" size={15} color="#fff" />}
              <Text style={st.btnTxt}>{imported ? "Imported ✓" : `Import ${entries.length} Entries to Schedule`}</Text>
            </TouchableOpacity>
            {status && (
              <Text style={[st.statusTxt, { color: status.ok ? "#1B5E20" : "#B71C1C" }]}>{status.msg}</Text>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F1F4F8" },
  header: { backgroundColor: "#0D47A1", paddingTop: Platform.OS === "web" ? 20 : 48, paddingBottom: 16, paddingHorizontal: 16 },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  backTxt: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 13 },
  h1: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 20 },
  h2: { color: "#BBDEFB", fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 12, marginBottom: 14, elevation: 1 },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 10, paddingVertical: 12, marginBottom: 8 },
  btnTxt: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 13.5 },
  okTxt: { color: "#1B5E20", fontFamily: "Inter_600SemiBold", fontSize: 12, textAlign: "center", marginTop: 2 },
  warnBox: { backgroundColor: "#FFF8E1", borderRadius: 10, padding: 10, marginTop: 8, borderWidth: 1, borderColor: "#FFE082" },
  warnTitle: { fontFamily: "Inter_700Bold", fontSize: 12.5, color: "#8D6E00", marginBottom: 4 },
  warnTxt: { fontFamily: "Inter_400Regular", fontSize: 11.5, color: "#6D5400", marginBottom: 2 },
  previewTitle: { fontFamily: "Inter_700Bold", fontSize: 14, color: "#0D47A1", marginBottom: 8 },
  tr: { flexDirection: "row" },
  thead: { backgroundColor: "#E3F2FD", borderRadius: 6 },
  zebra: { backgroundColor: "#FAFAFA" },
  td: { width: 100, paddingVertical: 6, paddingHorizontal: 6, fontFamily: "Inter_400Regular", fontSize: 11.5, color: "#263238" },
  th: { fontFamily: "Inter_700Bold", color: "#0D47A1" },
  statusTxt: { fontFamily: "Inter_600SemiBold", fontSize: 12.5, textAlign: "center", marginTop: 8 },
  moreTxt: { fontFamily: "Inter_400Regular", fontSize: 11.5, color: "#607D8B", marginTop: 6, textAlign: "center" },
});
