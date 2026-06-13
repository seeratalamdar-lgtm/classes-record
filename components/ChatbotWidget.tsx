import React, { useState, useRef, useEffect } from "react";
import { View, Text, TouchableOpacity, TextInput, ScrollView, StyleSheet, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import { usePathname, useLocalSearchParams } from "expo-router";

const KB: { keywords: string[]; answer: string }[] = [
  { keywords: ["sign in","login","log in","signin","faculty portal","faculty sign","faculty login","teacher login","teacher sign"],
    answer: "To sign in as Faculty:\n1. Go to schoolcollege.online\n2. Tap 'Faculty Sign In'\n3. Enter username and password (given by Admin)\n4. Tap Sign In\n\nDashboard shows: Attendance, Exam Marks, My Notes, My Schedule, Change Password." },
  { keywords: ["student sign","student login","student portal","student access","student account","how student","student enter"],
    answer: "To sign in as Student:\n1. Go to schoolcollege.online\n2. Tap 'Student Sign In'\n3. Enter username and password (given by Admin)\n4. Tap Sign In\n\n5 tabs: Attendance, Fee Status, Exam Marks, Notes, Schedule." },
  { keywords: ["admin","my schedule","main user","owner","administrator","schedule owner","create schedule","new schedule"],
    answer: "Admin (My Schedules):\n1. Go to schoolcollege.online\n2. Tap 'My Schedules'\n3. Register or sign in\n4. Tap + to create a schedule\n5. Dashboard: Weekly Schedule, Attendance, Teaching Summary, HR Personnel, Exam Marks, Holidays, Meeting Availability." },
  { keywords: ["finance","account","fee manage","salary","pay staff","financial","billing","accounts user","finance login","finance sign"],
    answer: "Finance & Accounts user:\n1. Sign in as Finance & Accounts\n2. Dashboard shows Summary, Students, Faculty, Staff tabs\n3. Summary tab: total collected, balance, paid/unpaid\n4. Mark payments as Paid/Partial/Unpaid\n5. Filter by month and schedule\n6. Download reports as PDF or Excel." },
  { keywords: ["credential","username","password","generate","account","create account","faculty account","student account","give access","how to give"],
    answer: "To generate credentials (Admin only):\n1. Open schedule dashboard\n2. Go to HR Personnel\n3. Faculty tab → tap 'Generate All'\n4. Student tab → tap 'Student Access' → Generate All\n5. Download Excel to share credentials\n\nCredentials include username and password for each person." },
  { keywords: ["change password","reset password","update password","forgot password","new password","password change"],
    answer: "To change password:\n1. Sign in (Faculty or Student)\n2. Scroll to 'Change My Password'\n3. Enter current password\n4. Enter new password twice\n5. Tap Save\n\nForgot password? Ask Admin to regenerate your credentials from HR Personnel." },
  { keywords: ["attendance","mark","present","absent","leave","p/a/l","roster","mark attendance","take attendance","record attendance"],
    answer: "To mark attendance (Faculty):\n1. Sign in → tap Attendance\n2. Select class from dropdown\n3. Tap a session to expand\n4. Toggle P/A/L for each student\n5. Or tap '✓ All Present' for all at once\n6. Tap Save\n\nRoster tab: full grid with P/A/L counts and % per student." },
  { keywords: ["attendance percentage","attendance report","attendance pdf","download attendance","export attendance","attendance summary"],
    answer: "Attendance Reports:\n1. Go to Attendance → Roster tab\n2. See colour-coded grid: Green=Present, Red=Absent, Amber=Late\n3. % shown per student: Green≥75%, Amber≥60%, Red<60%\n4. Tap Download PDF to export\n5. Students can view their own attendance from Student Portal." },
  { keywords: ["exam","marks","quiz","mid","final","grades","score","enter marks","result","marks entry","grade entry"],
    answer: "To enter exam marks (Faculty):\n1. Sign in → tap Exam Marks\n2. Select class and subject\n3. Enter Quiz, Assignment, Mid, Final marks\n4. Marks instantly visible to students\n\nAdmin sets weights (% for each exam type).\nStudents view marks from Exam Marks tab in their portal." },
  { keywords: ["exam weight","marks weight","percentage weight","quiz weight","mid weight","final weight"],
    answer: "To set exam weights (Admin only):\n1. Open schedule dashboard\n2. Go to Exam Marks\n3. Tap Weights tab\n4. Set percentage for Quiz, Assignment, Mid, Final\n5. Total must equal 100%\n6. Weighted total calculated automatically." },
  { keywords: ["notes","upload notes","pdf notes","share notes","faculty notes","upload document","upload file","my notes"],
    answer: "To upload notes (Faculty):\n1. Sign in → tap My Notes\n2. Tap Upload button\n3. Select PDF, Word, Excel or image\n4. Max 10MB total per faculty\n5. Notes appear in student portal Notes tab\n\nStudents see notes in folders organized by faculty name." },
  { keywords: ["student notes","view notes","download notes","see notes","access notes","notes tab","get notes"],
    answer: "To view faculty notes (Student):\n1. Sign in → tap Notes tab\n2. See folders — one per faculty\n3. Tap folder to see files\n4. Tap Download icon to save\n\nNotes are always available 24/7 — no need to request physical copies." },
  { keywords: ["delete notes","remove notes","notes storage","notes limit","notes full","10mb"],
    answer: "Notes storage limit:\n• Max 10MB total per faculty per schedule\n• To free space: Sign in → My Notes → tap Delete icon on any file\n• Supported formats: PDF, Word, Excel, PowerPoint, images\n• Students can download but cannot delete faculty notes." },
  { keywords: ["fee","payment","paid","unpaid","balance","fee status","fee check","tuition","my fee"],
    answer: "Fee Status (Student):\n1. Sign in → tap Fee Status tab\n2. See Paid/Partial/Unpaid status\n3. View amount due and balance\n4. No need to visit accounts office\n\nFinance user updates payment status from Finance & Accounts portal." },
  { keywords: ["schedule","timetable","weekly","weekly schedule","class time","upload schedule","import schedule","override schedule"],
    answer: "Weekly Schedule (Admin):\n1. Open schedule dashboard\n2. Tap Weekly Schedule\n3. Tap Override to upload CSV timetable\n4. Filter by Class, Faculty, or Location\n5. Tap Edit to copy/delete slots\n6. Download PDF or Export CSV\n\nFaculty and Students can view schedule from their own portals." },
  { keywords: ["edit schedule","change schedule","modify schedule","update schedule","delete slot","copy slot","edit timetable"],
    answer: "To edit the schedule:\n1. Open Weekly Schedule\n2. Tap Edit button (top right)\n3. Copy icon (📋) appears on each cell — tap to copy a class\n4. Delete icon (🗑) — tap to remove a class\n5. Tap Edit again to hide icons\n\nAll changes save immediately." },
  { keywords: ["ai schedule","generate schedule","auto schedule","schedule generator","automatic timetable","ai timetable","generate timetable"],
    answer: "AI Schedule Generator:\n1. Open schedule dashboard\n2. Tap AI Schedule Generator\n3. Tap Download Draft to get CSV template\n4. Fill in: Subject Code, Subjects, Department, Instructor Name, Class, Credit Hrs\n5. Upload the CSV\n6. Tap Generate Schedule with AI\n7. Review generated timetable\n8. Upload via Override button in Weekly Schedule." },
  { keywords: ["csv format","csv template","csv columns","what columns","excel format","upload format","file format","draft csv"],
    answer: "CSV format for schedule generator:\nColumns: Subject Code, Subjects, Department, Instructor Name with Sections, Regular/Elective, Class, Credit Hrs\n\nFor student bulk upload:\nColumns: Reg No, Student Name, Email, WhatsApp\n\nDownload templates from the respective upload buttons." },
  { keywords: ["bulk","bulk upload","csv upload","import student","upload student","student list","add many","multiple student","register student"],
    answer: "Bulk upload students:\n1. Go to Attendance screen\n2. Tap Students tab\n3. Tap 'Bulk Upload Students'\n4. CSV format: Reg No, Student Name, Email, WhatsApp\n5. Upload the file\n\nOr: HR Personnel → Student tab → Upload CSV\nDownload sample template from upload button." },
  { keywords: ["add student","enroll student","new student","single student","add one student"],
    answer: "To add a single student:\n1. Go to Attendance screen\n2. Select the class\n3. Tap Students tab\n4. Enter Reg No, Student Name, Email\n5. Tap + button\n\nStudent appears immediately in the class list." },
  { keywords: ["remove student","delete student","withdraw student","unenroll"],
    answer: "To remove a student (Admin only):\n1. Go to Attendance → Students tab\n2. Find the student\n3. Tap the Delete icon\n4. Confirm deletion\n\nOr via HR Personnel → Student tab → find and remove." },
  { keywords: ["public schedule","public","view without login","anyone view","share schedule","guest view","no login"],
    answer: "Public Schedules:\n1. Open schedule dashboard\n2. Toggle the Public switch ON\n3. Appears on home screen under 'Public Schedules'\n4. Anyone views without login (read-only)\n\nPublic shows: Weekly Schedule, Teaching Summary, Attendance Roster, Exam Marks, Meeting Availability, Holidays." },
  { keywords: ["teaching summary","tbc","deficit","surplus","missed class","makeup class","late class","class count","faculty summary","grand total"],
    answer: "Teaching Summary (Admin):\n1. Open schedule dashboard\n2. Tap Teaching Summary\n3. Shows TBC, Missed, Makeup, Late, Grand Total per faculty\n4. Red badge = Deficit · Green = Surplus\n5. Missed/Makeup/Late dates shown as coloured pill badges\n6. 💬 icon = remarks saved — tap badge to see remarks popup\n7. Grand Total = TBC − Missed + Makeup + Late\n8. Gazetted Holidays auto-excluded from TBC\n9. Download PDF report." },
  { keywords: ["new entry","makeup entry","record makeup","makeup class","makeup session","new makeup"],
    answer: "New Entry (Admin) — Makeup sessions only:\n1. Open schedule dashboard\n2. Tap New Entry\n3. Select Faculty → Subject → Class\n4. Pick Date and free time slot\n5. Tap Save Makeup Entry\n\n• For Missed/Late entries: tap All Entries button → Add Entry tab\n• For bulk import of whole day: tap Import Day button\n\nAll entries update Teaching Summary automatically." },
  { keywords: ["meeting","free","busy","availability","who is free","faculty free","check availability","meeting time"],
    answer: "Meeting Availability (Admin):\n1. Open schedule dashboard\n2. Tap Meeting Availability\n3. Enter Date\n4. Select Start Time and End Time\n5. Tap Check Availability\n6. See Free and Busy faculty lists\n7. Download result as PDF." },
  { keywords: ["holiday","gazetted","off day","public holiday","national holiday","add holiday","eid","pakistan day"],
    answer: "Gazetted Holidays (Admin):\n1. Open schedule dashboard\n2. Tap Gazetted Holidays\n3. Add Single Day or Date Range\n4. Enter holiday name → Save\n\nHolidays affect 3 screens:\n• Teaching Summary: excluded from TBC count (Errorless ✓)\n• Attendance: faculty cannot mark attendance on holidays (blocked)\n• Add Entry dates: holiday dates hidden from semester date list\n\nDelete icon removes any holiday." },
  { keywords: ["hr","personnel","hr personnel","human resource","add faculty","remove faculty","staff management","manage people"],
    answer: "HR Personnel (Admin only):\n1. Open schedule dashboard\n2. Tap HR Personnel\n3. Faculty tab: view/generate/download credentials\n4. Student tab: add/remove/bulk upload students\n5. Staff tab: manage support staff\n\nOnly Admin can add or remove members." },
  { keywords: ["photo","profile photo","profile picture","camera","picture","avatar","change photo","update photo"],
    answer: "To update profile photo:\n1. Sign in (Faculty or Student)\n2. Tap the profile circle at top\n3. Tap the camera icon\n4. Select photo from device\n5. Photo saves automatically\n\nPhoto appears on your dashboard profile." },
  { keywords: ["tutorial","guide","help","how to use","instructions","user guide","manual","documentation"],
    answer: "Full tutorial at: schoolcollege.online/tutorial\n\nCovers 6 topics:\n1. Introduction — Paperless & Errorless system\n2. Admin (My Schedules) — all admin features\n3. Faculty Sign In — attendance, marks, notes\n4. Student Sign In — view records, notes, schedule\n5. Finance & Accounts — fees and payments\n6. Public Schedules — read-only access for all" },
  { keywords: ["sign out","logout","log out","signout","exit","leave portal"],
    answer: "To sign out:\n1. Look for Sign Out button (top right of dashboard)\n2. Tap Sign Out\n3. Returns to home screen\n\nYour session is cleared and data is secure after sign out." },
  { keywords: ["download pdf","pdf report","export pdf","print","pdf download"],
    answer: "PDF Downloads available from:\n• Weekly Schedule → Download button\n• Teaching Summary → Download button\n• Attendance Roster → Download PDF button\n• Meeting Availability → Download button\n• Tutorial → Download PDF button\n\nPDFs are generated on-device and can be shared via WhatsApp, email, or saved to files." },
  { keywords: ["department","dept","ecm","hm","bscs","bee","se","filter department","department filter"],
    answer: "Department filters:\n• Available in Teaching Summary and Schedule screens\n• Filter by: EE, DoC, BS, HU, or ALL\n• Helps narrow down faculty and subjects by department\n• Set department in the subject CSV when uploading schedule." },
  { keywords: ["section","class section","a section","b section","abcd","multiple section","group"],
    answer: "Class Sections:\n• Format: BEE-6A, BEE-6B, BEE-7C etc.\n• In AI Generator CSV: use bracket notation\n  e.g. 'Mr. Ali (ABCD)' = teaches all 4 sections\n  e.g. 'Ms. Sara (AB)' = teaches sections A and B only\n• Each section gets its own timetable row." },
  { keywords: ["credit hours","credit hr","lec","lab","lecture","laboratory","3+1","2+0"],
    answer: "Credit Hours format:\n• 3+1 = 3 lecture hours + 1 lab (3 hrs)\n• 3+0 = 3 lectures only\n• 2+0 = 2 lectures only\n• 0+1 = lab only\n\nThe AI Generator uses credit hours to decide how many sessions per week to schedule." },
  { keywords: ["break","lunch","break time","lunch break","prayer break","1pm","13:00"],
    answer: "Break Time:\n• Default: 1:00 PM - 2:00 PM\n• No classes scheduled during break\n• Break time can be set when creating a schedule\n• Shows as highlighted row in Weekly Schedule view." },
  { keywords: ["location","room","classroom","cr","lab room","venue","where"],
    answer: "Classroom/Location:\n• Each section is assigned a home classroom (e.g. CR-1, CR-2)\n• Two sections share one classroom when one is in lab\n• Filter by Location in Weekly Schedule\n• Lab sessions use separate lab rooms\n• Location shown on each class card in the timetable." },
  { keywords: ["what is","about","explain","describe","overview","introduction","what does"],
    answer: "schoolcollege.online is a Paperless & Errorless management system for schools, colleges and universities.\n\n4 user types:\n1. Admin — manages everything\n2. Faculty — marks attendance, enters marks, shares notes\n3. Student — views records, notes, schedule\n4. Finance — manages fees and payments\n\nAll records are digital, accurate and always accessible.\nVisit schoolcollege.online/tutorial for the full guide." },
  { keywords: ["cost","price","fee","subscription","plan","pricing","how much","free"],
    answer: "For pricing and subscription information:\n• Contact the schoolcollege.online team\n• We can also upload all your existing physical records to the system on your behalf\n• Ask about our data entry service for institutions without IT staff\n\nVisit schoolcollege.online for more information." },
  { keywords: ["mobile","phone","android","ios","app","mobile app","download app"],
    answer: "schoolcollege.online works on:\n• Any web browser on mobile or desktop\n• Chrome, Safari, Firefox, Edge\n• No app download needed — just open schoolcollege.online\n• Works on Android and iOS browsers\n• All features available on mobile screens." },
  { keywords: ["error","problem","issue","not working","bug","wrong","failed","something went wrong"],
    answer: "Common fixes:\n1. Hard refresh: Ctrl+Shift+R (desktop) or pull down to refresh (mobile)\n2. Clear browser cache and try again\n3. Make sure you have internet connection\n4. Try a different browser\n5. Sign out and sign in again\n\nIf problem persists, contact your Admin or schoolcollege.online support." },
  { keywords: ["import day","bulk import","bulk missed","bulk makeup","import all","whole day","all classes","day import"],
    answer: "Import Day — bulk import all classes for a weekday:\n\nWeekday (Mon–Fri):\n1. Go to New Entry screen\n2. Tap Import Day button\n3. Select date (shows ✅ Friday — weekday)\n4. Choose Missed or Makeup\n5. Add Remarks (e.g. Classes missed due to Lockdown)\n6. Tap Import\n→ All classes for that weekday imported at once\n\nWeekend (Sat/Sun):\n1. Select Saturday or Sunday\n2. Makeup auto-selected (Missed disabled 🚫)\n3. Select source weekday (which day's classes to conduct)\n4. Add Remarks → Import\n→ e.g. Saturday makeup for Friday's missed classes\n\nDuplicate protection: same entry cannot be imported twice." },
  { keywords: ["all entries","saved entries","view entries","delete entry","remove entry","entry list","manage entries"],
    answer: "All Entries button (in New Entry screen) has 2 tabs:\n\n📋 Saved Entries tab:\n• Lists all Missed/Makeup/Late entries\n• Sorted by Date → Day → Time\n• Each row: Type badge | Date | Day+Time | Subject | Faculty · Class | Remarks\n• 🗑️ Delete icon at end of row — removes entry and related attendance\n• Use to fix errors: e.g. delete Monday 9AM entry after wrong import\n\n➕ Add Entry tab:\n• Shows full weekly schedule as reference\n• Type selector: Missed (default) | Late\n• Click ➕ on any class → full semester date list appears\n• Dates for that weekday shown (Gazetted Holidays excluded)\n• Tap date → checkmark → Save Missed/Late\n• For Makeup: use main New Entry screen (needs free slot)" },
  { keywords: ["export csv entries","download entries","saved entries csv","entries excel","entries export","page break","entries download"],
    answer: "Export CSV from Saved Entries:\n\nHow to export:\n1. Open New Entry screen\n2. Tap All Entries button\n3. Go to Saved Entries tab\n4. Tap blue Export CSV button\n\nThe downloaded file contains:\n• Section 1: All Missed/Makeup/Late dated entries (Type, Date, Day, Faculty, Subject, Class, Dept, Location, Time, EndTime, Lec/Lab, Remarks)\n• --- PAGE BREAK --- separator row\n• Section 2: All regular Lec/Lab schedule entries for reference\n\nOpen in Excel to sort, filter, edit, then re-upload via Override button." },
  { keywords: ["override entries","bulk replace entries","upload entries","replace entries","entries override","csv override entries"],
    answer: "Override Saved Entries:\n\nHow to use Override:\n1. First Export CSV to get current data as template\n2. Edit in Excel (add/remove/modify rows)\n3. Save as CSV\n4. Open All Entries → Saved Entries tab\n5. Tap orange Override button\n6. Select your modified CSV file\n7. Confirm — all entries replaced instantly\n\nKey features:\n• Auto-converts Excel date format (6/1/2026 → 2026-06-01)\n• Strips Excel BOM characters automatically\n• Deletes ALL existing dated entries first, then re-inserts\n• No duplicates possible\n• Works with both Regular and Makeup entries\n• Updates sync to: Weekly Schedule, Attendance sessions, Teaching Summary" },
  { keywords: ["colour code","color code","green cell","orange cell","lab highlight","makeup highlight","card colour","schedule colour","cell colour","makeup date","lab label"],
    answer: "Weekly Schedule Colour Coding:\n\n🔵 Regular Lecture — blue left border (default)\n🟢 Makeup session — green background + green border\n   Shows date label: MAKEUP · 02 Jun 2026\n   Only future/today makeups shown (past hidden)\n🟠 Lab session — orange background + orange border + LAB label\n🟣 Elective — purple border\n\nMakeup entries are added via:\n• New Entry screen (single makeup)\n• Import Day button (bulk makeup for whole day)\n• All Entries → Override (bulk CSV upload)\n• Plus ➕ button on existing makeup entry (chain makeups)" },
  { keywords: ["makeup attendance","makeup session attendance","makeup roster","extra session","new session makeup","attendance makeup"],
    answer: "Makeup Sessions in Attendance:\n\n• When a Makeup entry is saved, a NEW attendance session is automatically created\n• Appears in faculty Attendance screen session list (e.g. Tue 02 Jun 11:00 AM — Makeup)\n• Faculty CAN mark attendance for makeup sessions\n• Makeup label shown next to time in session list\n• Students appear in roster for makeup sessions\n\nThis is different from Missed entries:\n• Missed → session LOCKED (faculty cannot mark)\n• Makeup → NEW session created (faculty marks normally)\n• Holiday → all sessions BLOCKED" },
  { keywords: ["remarks","notes entry","entry notes","entry remarks","reason","why missed","lockdown","class reason"],
    answer: "Remarks in New Entry:\n• Available in Import Day modal and Add Entry\n• Add reason for Missed: e.g. 'Classes missed due to Government Lockdown'\n• Add reason for Makeup: e.g. 'Makeup for May 15 Lockdown'\n\nRemarks appear in Teaching Summary:\n• 💬 icon on date badges shows remarks are saved\n• Click any date badge → popup shows full remarks\n• Example: 📅 2026-06-05 — Remarks: Classes missed due to Lockdown\n\nIn downloaded PDF: hover over dates to see remarks as tooltip." },
  { keywords: ["weekend makeup","saturday makeup","sunday makeup","weekend class","makeup weekend","off day makeup"],
    answer: "Weekend Makeup (Sat/Sun):\n• Weekends can ONLY be used for Makeup — never Missed\n• Missed button is disabled 🚫 on weekends\n\nHow to import weekend makeup:\n1. Tap Import Day → select Saturday/Sunday\n2. Missed button greyed out, Makeup auto-selected\n3. 'Import Schedule From (Weekday)' section appears\n4. Select which weekday's classes to conduct (Mon/Tue/Wed/Thu/Fri)\n5. Add Remarks → Import as Makeup\n\nExample: Classes missed Friday May 15 → Makeup on Saturday May 16\nSelect May 16 (Sat) → choose Fri → Remarks: 'Makeup for May 15 Lockdown' → Import" },
  { keywords: ["attendance lock","session lock","locked session","cannot mark","blocked attendance","missed lock","locked class"],
    answer: "Attendance Locking Rules:\n\n🔒 Missed entry:\n• Faculty CANNOT mark attendance\n• Server blocks with: 'Session locked: class marked as Missed on this date'\n• Session does not appear in student roster\n\n✅ Makeup entry:\n• NEW attendance session created\n• Faculty CAN mark attendance\n• Appears in both faculty and student rosters\n\n📅 Gazetted Holiday:\n• Faculty CANNOT mark attendance on holiday date\n• Server blocks with: 'Gazetted Holiday: {name}'\n\nGrand Total = TBC − Missed + Makeup + Late\nMissed deducted · Makeup counted independently" },
  { keywords: ["data","safe","secure","privacy","backup","data loss","my data"],
    answer: "Data Security:\n• All data stored on secure Oracle Cloud servers\n• Data is backed up automatically\n• Only authorized users can access records\n• Admin controls who has access\n• Student data is private — students only see their own records\n• The system is Paperless and Errorless by design." },
];

function getAnswer(q: string): string {
  const lower = q.toLowerCase();
  let best = { score: 0, answer: "" };
  for (const item of KB) {
    let score = 0;
    for (const k of item.keywords) {
      if (lower.includes(k)) score += k.split(" ").length;
    }
    if (score > best.score) best = { score, answer: item.answer };
  }
  if (best.score > 0) return best.answer;
  return "I can help you with:\n\n• Faculty / Student sign in\n• Marking attendance (P/A/L)\n• Import Day — bulk Missed/Makeup entries\n• All Entries — view, add & delete\n• Remarks on Teaching Summary dates 💬\n• Weekend Makeup (Sat/Sun) sessions\n• Attendance locking rules\n• Gazetted Holidays — full integration\n• Weekly Schedule & AI Generator\n• Bulk uploading students via CSV\n• Fee status & Finance\n• HR Personnel management\n• Meeting Availability\n• Teaching Summary & Reports\n\nTry asking about any topic above, or visit:\nschoolcollege.online/tutorial";
}

interface Message { role: "user" | "bot"; text: string; }

const QUICK = [
  "How to sign in as faculty?",
  "How to mark attendance?",
  "How to use Import Day?",
  "How to add missed entries?",
  "How to Export CSV from Saved Entries?",
  "What can the Admin do?",
];

export default function ChatbotWidget() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const params = useLocalSearchParams();
  function detectContext() {
    const p = (pathname || "").toLowerCase();
    let domain = "home", identity: any = {};
    const sid = (params as any)?.scheduleId || "";
    if (p.includes("faculty-portal")) {
      domain = "faculty-portal";
      try { const s = JSON.parse((typeof localStorage !== "undefined" && localStorage.getItem("facultySession")) || "{}"); if (s.name || s.facultyName || s.username) identity = { name: s.name || s.facultyName || s.username }; } catch {}
    } else if (p.includes("student-portal")) {
      domain = "student-portal";
      try { const s = JSON.parse((typeof localStorage !== "undefined" && localStorage.getItem("STUDENT_PORTAL_SESSION")) || "{}"); if (s.rollNo || s.roll_no || s.username) identity = { rollNo: s.rollNo || s.roll_no || s.username, name: s.name || "" }; } catch {}
    } else if (p.includes("finance")) { domain = "finance"; }
    else if (p.includes("admin-panel")) { domain = "admin"; }
    else if (p.includes("schedule-dashboard")) { domain = "schedule-dashboard"; }
    else if (p.includes("schedule-generator")) { domain = "my-schedules"; }
    else if (p.includes("/schedule")) { domain = "schedule"; }
    else if (p.includes("my-schedules")) { domain = "my-schedules"; }
    else if (p.includes("attendance") || p.includes("summary") || p.includes("personnel") || p.includes("exam") || p.includes("holidays") || p.includes("meeting") || p.includes("students") || p.includes("entry")) { domain = "schedule-dashboard"; }
    return { domain, scheduleId: sid, identity };
  }

  const [messages, setMessages] = useState<Message[]>([
    { role: "bot", text: "Hello! 👋 I am your guide for schoolcollege.online.\n\nI can answer questions about:\n• Signing in (Faculty/Student/Admin)\n• Attendance, Marks, Notes\n• Import Day — bulk Missed/Makeup entries\n• All Entries — view, add & delete entries\n• Remarks on Teaching Summary dates\n• Weekend Makeup sessions\n• Gazetted Holidays integration\n• Schedule generation & much more\n\nWhat would you like help with?" }
  ]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (open) setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages, open]);

  const [typing, setTyping] = useState(false);
  const CHAT_API = "https://" + ((typeof process !== "undefined" && process.env && process.env.EXPO_PUBLIC_DOMAIN) || "schoolcollege.online") + "/api/chat";
  async function send(text?: string) {
    const msg = (text || input).trim();
    if (!msg || typing) return;
    setInput("");
    const history = [...messages, { role: "user" as const, text: msg }];
    setMessages(prev => [...prev, { role: "user", text: msg }]);
    setTyping(true);
    try {
      const ctx = detectContext();
      const apiMessages = history.filter(m => m.role === "user" || m.role === "bot").slice(-10).map(m => ({ role: m.role === "bot" ? "assistant" : "user", content: m.text }));
      const r = await fetch(CHAT_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages, domain: ctx.domain, scheduleId: ctx.scheduleId, identity: ctx.identity })
      }).then(x => x.json());
      const answer = (r && r.content && r.content[0] && r.content[0].text) ? r.content[0].text : getAnswer(msg);
      setMessages(prev => [...prev, { role: "bot", text: answer }]);
    } catch {
      setMessages(prev => [...prev, { role: "bot", text: getAnswer(msg) }]);
    }
    setTyping(false);
  }

  if (Platform.OS !== "web") return null;

  return (
    <View style={s.wrapper} pointerEvents="box-none">
      {open && (
        <View style={s.panel}>
          <View style={s.header}>
            <View style={s.headerIcon}><Feather name="book-open" size={18} color="#fff" /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.headerTitle}>schoolcollege Guide</Text>
              <Text style={s.headerSub}>45+ topics covered · Always available</Text>
            </View>
            <TouchableOpacity onPress={() => setOpen(false)}>
              <Feather name="x" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
          <ScrollView ref={scrollRef} style={s.msgs} contentContainerStyle={{ padding: 12, gap: 10 }}>
            {messages.map((m, i) => (
              <View key={i} style={[s.msgRow, m.role === "user" ? s.userRow : s.botRow]}>
                <View style={[s.bubble, m.role === "user" ? s.userBubble : s.botBubble]}>
                  <Text style={[s.msgTxt, m.role === "user" ? s.userTxt : s.botTxt]}>{m.text}</Text>
                </View>
              </View>
            ))}
            {typing && (
              <View style={[s.msgRow, s.botRow]}>
                <View style={[s.bubble, s.botBubble]}><Text style={[s.msgTxt, s.botTxt]}>…</Text></View>
              </View>
            )}
            {messages.length === 1 && (
              <View style={{ gap: 6, marginTop: 4 }}>
                {QUICK.map((q, i) => (
                  <TouchableOpacity key={i} style={s.quickBtn} onPress={() => send(q)}>
                    <Text style={s.quickTxt}>{q}</Text>
                    <Feather name="arrow-right" size={12} color="#1565C0" />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </ScrollView>
          <View style={s.inputRow}>
            <TextInput
              style={s.input}
              value={input}
              onChangeText={setInput}
              placeholder="Ask anything about the website..."
              placeholderTextColor="#94A3B8"
              onSubmitEditing={() => send()}
              returnKeyType="send"
            />
            <TouchableOpacity style={s.sendBtn} onPress={() => send()}>
              <Feather name="send" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      )}
      <TouchableOpacity style={s.fab} onPress={() => setOpen(!open)} activeOpacity={0.85}>
        <Feather name={open ? "x" : "message-circle"} size={26} color="#fff" />
        {!open && <View style={s.badge}><Text style={s.badgeTxt}>?</Text></View>}
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  wrapper: { position: "absolute", bottom: 88, right: 24, alignItems: "flex-end", zIndex: 9999 },
  fab: { width: 56, height: 56, borderRadius: 28, backgroundColor: "#1565C0", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  badge: { position: "absolute", top: -2, right: -2, width: 18, height: 18, borderRadius: 9, backgroundColor: "#E65100", alignItems: "center", justifyContent: "center" },
  badgeTxt: { color: "#fff", fontSize: 10, fontWeight: "700" },
  panel: { width: 340, height: 500, backgroundColor: "#fff", borderRadius: 16, marginBottom: 12, overflow: "hidden", shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, borderWidth: 1, borderColor: "#E2E8F0" },
  header: { backgroundColor: "#1565C0", padding: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  headerIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#fff", fontSize: 14, fontWeight: "700" },
  headerSub: { color: "rgba(255,255,255,0.7)", fontSize: 10 },
  msgs: { flex: 1, backgroundColor: "#F8FAFC" },
  msgRow: { flexDirection: "row", marginBottom: 8 },
  userRow: { justifyContent: "flex-end" },
  botRow: { justifyContent: "flex-start" },
  bubble: { maxWidth: "82%", borderRadius: 14, padding: 10 },
  userBubble: { backgroundColor: "#1565C0", borderBottomRightRadius: 4 },
  botBubble: { backgroundColor: "#fff", borderBottomLeftRadius: 4, borderWidth: 1, borderColor: "#E2E8F0" },
  msgTxt: { fontSize: 13, lineHeight: 20 },
  userTxt: { color: "#fff" },
  botTxt: { color: "#0F172A" },
  quickBtn: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#fff", borderRadius: 10, padding: 10, borderWidth: 1, borderColor: "#BFDBFE" },
  quickTxt: { fontSize: 12, color: "#1565C0", flex: 1 },
  inputRow: { flexDirection: "row", padding: 10, gap: 8, borderTopWidth: 1, borderTopColor: "#E2E8F0", backgroundColor: "#fff" },
  input: { flex: 1, backgroundColor: "#F1F5F9", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, fontSize: 13, color: "#0F172A" },
  sendBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#1565C0", alignItems: "center", justifyContent: "center" },
});
