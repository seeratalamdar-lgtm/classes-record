import React, { useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import * as ScreenOrientation from "expo-screen-orientation";
import { printOrShareHtml } from "@/utils/printHtml";
import { useColors } from "@/hooks/useColors";

const TOPICS = [
  {
    icon: "globe" as const,
    color: "#1565C0",
    bg: "#E3F2FD",
    title: "Introduction — Welcome to schoolcollege.online",
    body: `Welcome to schoolcollege.online — your complete Paperless and Errorless school, college, and university management system. Now your institution can go fully online with 100% accuracy and zero paperwork.

Gone are the days of physical registers, manual attendance sheets, and paper-based records. With schoolcollege.online, every record is digital, instant, and always accessible from anywhere.

Paperless. Errorless. Always online.

This platform serves four types of users:

  👤 Admin (My Schedules) — The main administrator who manages all records
  👨‍🏫 Faculty — Teachers who mark attendance, enter marks and share notes
  🎓 Student — Students who view their own records and notes
  💰 Finance & Accounts — Manages fee, salary and financial summaries

Whether you are a school, college, or university — schoolcollege.online brings your entire institution online in one place, paperlessly and errorlessly.

Need help setting up? We can digitise all your existing physical records and upload them to the system on your behalf — contact us for details.`,
  },
  {
    icon: "settings" as const,
    color: "#0D47A1",
    bg: "#BBDEFB",
    title: "1. Admin — My Schedules (Main User)",
    body: `📋 Screen: Schedule Dashboard — Weekly Schedule · New Entry · Teaching Summary · Meeting Availability · Gazetted Holidays · Attendance · HR Personnel · Exam Marks

The Admin (My Schedules user) is the most powerful role on schoolcollege.online. This user is responsible for uploading all physical hard records to the website and keeping everything paperless and errorless.

What the Admin can do:

  ✅ Create and manage academic schedules (semesters/sessions)
  ✅ Upload the complete Weekly Timetable — Mon–Fri grid showing subject, class, faculty and room. Use Override to upload CSV, Export CSV to download, and Edit mode to copy or delete cells (Paperless ✓)
  ✅ Record Makeup classes via New Entry — dedicated screen for Makeup sessions only (Errorless ✓)
  ✅ Bulk import Missed/Makeup via Import Day — imports all classes of a weekday at once with remarks (Errorless ✓)
  ✅ Add individual Missed/Late entries via All Entries → Add Entry — pick from schedule reference with full semester date list, holidays excluded (Errorless ✓)
  ✅ View/delete/export all saved entries via All Entries → Saved Entries — sorted Date→Day→Time with 🗑️ delete, 📥 Export CSV (includes regular schedule after PAGE BREAK), and 🔄 Override to bulk-replace all entries from CSV (Errorless ✓)
  ✅ View Teaching Summary — TBC/Missed/Makeup/Late/Grand Total with clickable date badges 💬 showing remarks on click. Export PDF (Errorless ✓)
  ✅ Check Meeting Availability — see who is Free/Busy at any date/time. Export PDF (Paperless ✓)
  ✅ Manage Gazetted Holidays — holidays excluded from TBC count, attendance marking blocked, and hidden from Add Entry date lists (Errorless ✓)
  ✅ Generate Faculty Credentials for Faculty Sign In
  ✅ Generate Student Credentials for Student Sign In
  ✅ Create Finance & Account user credentials
  ✅ Add/remove Faculty, Students and Staff from HR Personnel

─────────────────────────────────────
📅 IMPORT DAY — Bulk Entry Feature
─────────────────────────────────────
  Weekday (Mon–Fri): Select date → Missed or Makeup → add Remarks → Import all classes at once.
  Weekend (Sat/Sun): Makeup only (Missed disabled 🚫). Select source weekday whose classes to conduct as makeup.
  Day indicator: ✅ Friday = weekday, 📅 Saturday = weekend makeup only.
  Duplicate protection: same entry cannot be imported twice.

─────────────────────────────────────
📋 ALL ENTRIES — Two Tabs
─────────────────────────────────────
  Saved Entries tab: All Missed/Makeup/Late entries sorted by Date→Day→Time.
    🗑️ Delete: remove individual entries.
    📥 Export CSV: downloads all saved entries + regular schedule (after PAGE BREAK separator) for Excel editing.
    🔄 Override: upload modified CSV to bulk-replace ALL saved entries. Automatically converts Excel date formats (M/D/YYYY). No duplicates guaranteed — deletes all then re-inserts.
    ➕ Plus button on Makeup entries: add another makeup for same class on a future date.
  Add Entry tab: Reference schedule sorted by Day→Time. Type: Missed|Late. ➕ per class opens full semester date list (holidays excluded). Tap date → Save.
  For Makeup: use main New Entry screen (needs free slot).

─────────────────────────────────────
📊 TEACHING SUMMARY — Remarks on Click
─────────────────────────────────────
  🔴 Missed · 🟢 Makeup · 🟠 Late dates shown as pill badges with 💬 icon when remarks saved.
  Click any badge → popup: "📅 2026-06-05 — Remarks: Classes missed due to Lockdown"
  Grand Total = TBC − Missed + Makeup + Late. TBC excludes holidays.

─────────────────────────────────────
🔒 ATTENDANCE LOCKING RULES
─────────────────────────────────────
  Missed entry → session LOCKED, faculty cannot mark attendance.
  Makeup entry → NEW session created, faculty can mark attendance for that extra session.
  Gazetted Holiday → attendance BLOCKED on that date for all classes.

─────────────────────────────────────
🗓️ WEEKLY SCHEDULE — Colour Coding
─────────────────────────────────────
  🔵 Regular Lec — blue left border (default)
  🟢 Makeup session — green background + green border + MAKEUP · 02 Jun 2026 date label. Only future/today makeups shown — past ones hidden automatically.
  🟠 Lab session — orange background + orange border + LAB label
  🟣 Elective — purple border
  Makeup entries update live across Weekly Schedule, Attendance session list, and Teaching Summary counts.

─────────────────────────────────────
HR Personnel Screen:
  The Admin uses the HR Personnel screen (Students · Faculty · Staff tabs) to add or remove members.
  Students can be bulk-uploaded via CSV with columns: Reg No, Student Name, Email.
  Faculty accounts are auto-generated from the weekly schedule.

Making Records Paperless:
  Upload your WeeklySchedule CSV → all classes appear in the timetable instantly
  Bulk upload Students CSV → all student records go online in seconds
  Generate All credentials → every faculty and student gets a secure login

No computer skills in your institution? We can upload all your existing physical records to schoolcollege.online on your behalf. Contact us for the service fee.`,
  },
  {
    icon: "user-check" as const,
    color: "#2E7D32",
    bg: "#E8F5E9",
    title: "2. Faculty Sign In — Teacher Portal",
    body: `📋 Screen: Faculty Dashboard — Attendance · Exam Marks · My Notes · Change Password

Each faculty member receives a unique username and password generated by the Admin. After signing in at schoolcollege.online/faculty-portal, the teacher sees their personal dashboard — paperless and errorless.

Faculty Dashboard Features:

  📅 Attendance
    • Mark tab — mark Present (P), Absent (A), or Late (L) for each student in your assigned classes
    • Roster tab — view the full attendance grid with P/A/L counts and % per student
    • All marking is digital — no paper registers needed (Paperless ✓)

  🏆 Exam Marks
    • Enter marks for Quiz, Assignment, Mid-term and Final exams
    • Marks are instantly available to students — no paper distribution needed (Paperless ✓)
    • Weighted totals calculated automatically — Errorless ✓

  📅 My Schedule (Full Dashboard — View Only)
    • Access the complete schedule dashboard directly from your faculty portal
    • Includes: Weekly Schedule, Teaching Summary, Meeting Availability, Gazetted Holidays, Attendance Roster, and Exam Marks
    • All tiles are visible in read-only mode — no editing, adding, or deleting is possible (Errorless ✓)
    • View the full Mon–Fri timetable, check who is free at any time, and view student attendance
    • Always available without a printed copy (Paperless ✓)

  📁 My Notes (Max 10MB per faculty)
    • Upload PDF, Word, Excel, PowerPoint, or image files
    • Notes are instantly visible and downloadable by all your students
    • Organised by faculty name in the Student portal
    • Maximum 10MB total storage per faculty per schedule
    • Delete old files to free space for new uploads

  🔒 Change Password
    • Update your password at any time from the dashboard

Signing in and out is simple — your session is private and secure.`,
  },
  {
    icon: "book-open" as const,
    color: "#6A1B9A",
    bg: "#F3E5F5",
    title: "3. Student Sign In — Student Portal",
    body: `📋 Screen: Student Dashboard — Attendance · Fee Status · Exam Marks · Notes

Each student receives a unique username and password from the Admin. After signing in at schoolcollege.online/student-portal, the student sees their complete academic profile — paperless and errorless.

Student Dashboard Features:

  📊 Attendance Tab
    • View attendance for every subject — Present, Absent, Late counts
    • Colour-coded percentage: Green (≥75%), Amber (≥60%), Red (below 60%)
    • Always up to date — no waiting for paper reports (Paperless ✓)
    • 100% accurate — no manual calculation errors (Errorless ✓)

  💳 Fee Status Tab
    • View fee payment status — Paid, Partial, or Unpaid
    • See amount due, amount paid, and balance
    • No need to visit the accounts office for fee inquiries (Paperless ✓)

  🏆 Exam Marks Tab
    • View Quiz, Assignment, Mid-term and Final marks for every subject
    • Weighted total score calculated automatically (Errorless ✓)
    • Results available instantly after the faculty enters marks

  📁 Notes Tab
    • View and download notes uploaded by your faculty members
    • Notes organised in folders — one folder per faculty member
    • Tap any folder to see that faculty's files
    • Download PDF, Word, Excel, images directly to your device
    • Always available 24/7 — no need to request physical copies (Paperless ✓)

  📅 Schedule Tab (Full Dashboard — View Only)
    • Access the complete schedule dashboard directly from your student portal
    • Tap "Open Timetable" to open the full schedule dashboard for your institution
    • Includes: Weekly Schedule, Teaching Summary, Meeting Availability, Gazetted Holidays, Attendance Roster, and Exam Marks — all in view-only mode
    • No editing, adding, or deleting is possible — read-only access for students (Errorless ✓)
    • Always available 24/7 — no need for a printed timetable (Paperless ✓)

Students can also change their password from the dashboard at any time.`,
  },
  {
    icon: "dollar-sign" as const,
    color: "#E65100",
    bg: "#FFF3E0",
    title: "4. Finance & Accounts — Financial Management",
    body: `📋 Screen: Account & Finance — Summary · Students · Faculty · Staff

The Finance & Accounts user manages all financial matters for the institution — completely paperless and errorless.

Finance Dashboard Features:

  📈 Summary Tab
    • Overall financial overview — Total Due, Collected, Balance
    • Breakdown by Students, Faculty, and Support Staff
    • Paid, Partial, and Unpaid counts at a glance
    • Filter by month and by schedule/semester

  👨‍🎓 Students Tab
    • Manage student fee records
    • Mark payments as Paid, Partial, or Unpaid
    • Set fee amounts and track balances
    • Download payment reports as Excel or PDF

  👨‍🏫 Faculty Tab
    • Manage faculty salary records
    • Track pay periods and payment status
    • Salary calculations based on class rates

  👷 Staff Tab
    • Manage support staff pay records
    • Track monthly payments and balances

Key Benefits:
  ✅ No paper ledgers — all transactions are digital (Paperless ✓)
  ✅ Automatic balance calculations — no manual arithmetic (Errorless ✓)
  ✅ Instant reports — download any period\'s summary as PDF or Excel
  ✅ Multi-schedule support — manage finances for multiple semesters

The Finance user credential is created by the Admin and provides access only to financial records — keeping data secure and role-based.`,
  },
  {
    icon: "globe" as const,
    color: "#1976D2",
    bg: "#E3F2FD",
    title: "5. Public Schedules — View Only Access",
    body: `Public Schedules allow anyone to view a schedule without logging in — completely read-only. No record can be edited, added, or removed in public view.

📋 Visible on the home screen under "Public Schedules" — showing the schedule name and owner.

How to publish a schedule (Admin only):
  1. Open My Schedules → sign in → select a semester
  2. On the schedule dashboard tap the Public toggle to turn it ON
  3. The schedule immediately appears on the home screen under Public Schedules
  4. To make it private again, tap the toggle to turn it OFF

What visitors can VIEW in Public mode (read-only):

  📅 Weekly Schedule
    • Full Mon–Fri timetable for the semester
    • Filter by Class, Faculty, or Location
    • Download PDF — Paperless ✓
    • Edit button, Override, and + add buttons are all hidden

  ✏️ New Entry — HIDDEN in public view
    • Visitors cannot add Missed, Late, or Makeup entries
    • All entry buttons are removed

  📊 Teaching Summary
    • Per-faculty class counts — TBC, Deficit, Surplus
    • Download as PDF — Paperless ✓
    • No editing of entries possible

  👥 Meeting Availability
    • Check which faculty are free at any given time
    • Export result as PDF
    • No changes can be made

  ☀️ Gazetted Holidays
    • View list of public holidays used in TBC calculation
    • Add/Delete buttons are hidden in public view

  ✅ Attendance — Roster Tab Only
    • Students can search by their Reg No to view their own attendance
    • P/A/L counts and percentage shown per subject
    • Mark tab is hidden — no attendance can be marked
    • Students tab is hidden — no student records can be changed

  🏆 Exam Marks — View Only
    • Students can enter their Reg No to view their own marks
    • Quiz, Assignment, Mid and Final marks shown per subject
    • Enter Marks tab is hidden — no marks can be entered or changed
    • Weights are visible but cannot be edited

  👤 HR Personnel — HIDDEN in public view
  💰 Finance & Accounts — HIDDEN in public view

Key principle:
  Public Schedules are a read-only window into the institution's academic records. Perfect for students, parents, and visitors to stay informed — Paperless ✓ — without any risk of data being changed (Errorless ✓).`,
  },
];

function buildHtml(colors: { primary: string; foreground: string; background: string }) {
  const topicRows = TOPICS.map((t) => `
    <div style="margin-bottom:28px; padding:20px; background:#fff; border-radius:12px; border-left:5px solid ${t.color}; box-shadow:0 1px 4px rgba(0,0,0,0.08);">
      <h2 style="margin:0 0 10px 0; font-size:17px; color:${t.color};">${t.title}</h2>
      <p style="margin:0; font-size:14px; color:#333; line-height:1.7; white-space:pre-wrap;">${t.body}</p>
    </div>
  `).join("");

  return `
<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  body { font-family: 'Helvetica Neue', Arial, sans-serif; margin:0; padding:24px; background:#f5f5f5; }
  h1 { font-size:26px; color:${colors.primary}; margin-bottom:6px; }
  .sub { font-size:14px; color:#666; margin-bottom:28px; }
  .footer { text-align:center; font-size:11px; color:#aaa; margin-top:32px; }
</style></head><body>
  <h1>schoolcollege.online — User Guide</h1>
  <p class="sub">Paperless · Errorless · Always Online · ${new Date().toLocaleDateString("en-PK", { day: "numeric", month: "long", year: "numeric" })}</p>
  ${topicRows}
  <p class="footer">schoolcollege.online — Making education paperless and errorless</p>
</body></html>`;
}

export default function TutorialScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== "web") {
        ScreenOrientation?.lockAsync?.(ScreenOrientation?.OrientationLock?.PORTRAIT_UP).catch(() => {});
      }
    }, [])
  );

  async function handleDownload() {
    try {
      const html = buildHtml({ primary: colors.primary, foreground: colors.foreground, background: colors.background });
      await printOrShareHtml(html, "Save Tutorial PDF");
    } catch {
      // ignore
    }
  }

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      backgroundColor: colors.primary,
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16),
      paddingBottom: 20,
      paddingHorizontal: 20,
    },
    headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
    pill: {
      flexDirection: "row", alignItems: "center", gap: 5,
      backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 20,
      paddingHorizontal: 12, paddingVertical: 6,
    },
    pillTxt: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },
    headerTitle: { color: "#fff", fontSize: 22, fontFamily: "Inter_700Bold" },
    headerSub: { color: "rgba(255,255,255,0.75)", fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },

    scroll: { flex: 1 },
    topicCard: {
      marginHorizontal: 16, marginTop: 14,
      backgroundColor: colors.card,
      borderRadius: 14, borderWidth: 1, borderColor: colors.border,
      overflow: "hidden",
    },
    topicHeader: {
      flexDirection: "row", alignItems: "center", gap: 10,
      padding: 14, borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    topicIcon: {
      width: 36, height: 36, borderRadius: 18,
      alignItems: "center", justifyContent: "center",
    },
    topicTitle: { fontSize: 15, fontFamily: "Inter_700Bold", color: colors.foreground, flex: 1 },
    topicBody: {
      padding: 14, fontSize: 13, fontFamily: "Inter_400Regular",
      color: colors.mutedForeground, lineHeight: 20,
    },
  });

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View style={s.headerRow}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity style={s.pill} onPress={() => router.back()}>
              <Feather name="chevron-left" size={13} color="#fff" />
              <Text style={s.pillTxt}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.pill} onPress={() => router.replace("/" as never)}>
              <Feather name="home" size={13} color="#fff" />
              <Text style={s.pillTxt}>Home</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={s.pill} onPress={handleDownload}>
            <Feather name="download" size={13} color="#fff" />
            <Text style={s.pillTxt}>Download PDF</Text>
          </TouchableOpacity>
        </View>
        <Text style={s.headerTitle}>Tutorial</Text>
        <Text style={s.headerSub}>App guide · 5 topics</Text>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 40 }}>
        {TOPICS.map((topic) => (
          <View key={topic.title} style={s.topicCard}>
            <View style={s.topicHeader}>
              <View style={[s.topicIcon, { backgroundColor: topic.bg }]}>
                <Feather name={topic.icon} size={18} color={topic.color} />
              </View>
              <Text style={s.topicTitle}>{topic.title}</Text>
            </View>
            <Text style={s.topicBody}>{topic.body}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
