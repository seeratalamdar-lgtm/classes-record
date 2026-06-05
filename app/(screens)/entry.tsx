import { showAlert, showConfirm, openURL } from "@/utils/crossPlatform";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Platform, TextInput, Modal, Linking,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { ScrollView as KeyboardAwareScrollView } from "react-native";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";

import { useColors } from "@/hooks/useColors";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useAuth } from "@/context/AuthContext";
import {
  fetchSchedule, fetchOptions, saveEntry, importEntriesExcel,
  ScheduleRow, ScheduleOptions,
} from "@/hooks/useApi";
import { PickerModal } from "@/components/PickerModal";
import { ExcelImportButton, ImportPanel } from "@/components/ExcelImportButton";

const TYPE_OPTIONS = ["Makeup"] as const;
type EntryType = typeof TYPE_OPTIONS[number];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getDateDay(dateStr: string): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return "";
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return DAY_NAMES[d.getDay()] ?? "";
}

function formatHour(h: number): string {
  const t12 = (h % 12) || 12;
  return `${t12.toString().padStart(2, "0")}:00 ${h >= 12 ? "PM" : "AM"}`;
}

function hourFromTime(t: string): number {
  const m = t.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return 0;
  let h = Number(m[1]);
  const ap = m[3].toUpperCase();
  if (ap === "PM" && h !== 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  return h;
}

type PickerField = "faculty" | "subject" | "cls" | null;

export default function EntryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { user, login , isLoading } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams();
  const scheduleId = params.scheduleId ? parseInt(String(params.scheduleId)) : undefined;

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== "web") {
        
      }
      return () => {
        if (Platform.OS !== "web") {
          
        }
      };
    }, [])
  );

  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [showNotify, setShowNotify] = useState(false);
  const [notifyStudents, setNotifyStudents] = useState<{ rollNo: string; name: string; email: string }[]>([]);
  const [lastMakeup, setLastMakeup] = useState<{ subject: string; cls: string; date: string; time: string; location: string } | null>(null);

  const [faculty, setFaculty] = useState("");
  const [subject, setSubject] = useState("");
  const [cls, setCls] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showBulkDatePicker, setShowBulkDatePicker] = useState(false);
  const [date, setDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [type, setType] = useState<EntryType>("Makeup");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [activePicker, setActivePicker] = useState<PickerField>(null);
  const [showImport, setShowImport] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [showViewEntries, setShowViewEntries] = useState(false);
  const [bulkDate, setBulkDate] = useState("");
  const [bulkType, setBulkType] = useState<"missed"|"makeup">("missed");
  const [bulkRemarks, setBulkRemarks] = useState("");
  const [bulkSourceDay, setBulkSourceDay] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState("");
  const [allEntries, setAllEntries] = useState<any[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [entriesTab, setEntriesTab] = useState<"saved"|"reference">("saved");
  const [showEntriesOverride, setShowEntriesOverride] = useState(false);
  const [entriesOverrideLoading, setEntriesOverrideLoading] = useState(false);
  const [refType, setRefType] = useState<"missed"|"late">("missed");
  const [scheduleEntries, setScheduleEntries] = useState<any[]>([]);
  const [addingEntry, setAddingEntry] = useState<any>(null);
  const [addDate, setAddDate] = useState("");
  const [addSaving, setAddSaving] = useState(false);
  const [addingMakeupEntry, setAddingMakeupEntry] = useState<any>(null);
  const [addMakeupDate, setAddMakeupDate] = useState("");
  const [addMakeupSaving, setAddMakeupSaving] = useState(false);
  const [makeupTargetDay, setMakeupTargetDay] = useState(0);
  const [holidayDates, setHolidayDates] = useState<Set<string>>(new Set());

  const { data: schedule = [] } = useQuery({ queryKey: ["schedule", scheduleId], queryFn: () => fetchSchedule(scheduleId) });
  const { data: options } = useQuery<ScheduleOptions>({ queryKey: ["options", scheduleId], queryFn: () => fetchOptions(scheduleId) });

  const facultyList = useMemo(() => {
    const fromDB = [...new Set(schedule.filter((r) => !r.Type).map((r) => r.Faculty))].sort();
    if (fromDB.length > 0) return fromDB;
    return options?.faculty ?? [];
  }, [schedule, options]);

  const subjectList = useMemo(() => {
    if (!faculty) return [];
    const fromDB = [...new Set(schedule.filter((r) => !r.Type && r.Faculty === faculty).map((r) => r.Subject))].sort();
    if (fromDB.length > 0) return fromDB;
    return options?.facSubjects[faculty] ?? options?.subjects ?? [];
  }, [schedule, options, faculty]);

  const classList = useMemo(() => {
    if (!faculty || !subject) return [];
    const rows = schedule.filter((r) => !r.Type && r.Faculty === faculty && r.Subject === subject);
    const fromDB = [...new Set(rows.map((r) => r.Class))].sort();
    if (!fromDB.length) {
      const key = faculty + "|||" + subject;
      return options?.facSubClasses[key] ?? options?.classes ?? [];
    }
    // Check if any rows are elective
    const hasElective = rows.some((r) => (r.Elective || "").toLowerCase() === "elective");
    if (hasElective) {
      // Build merged elective class name e.g. 2K22-BEE-14ABCD
      const classes = [...new Set(rows.map((r) => r.Class.toUpperCase()))];
      const infos = classes.map((c) => {
        const m = c.match(/^(2K\d{2}-[A-Z]+-\d+)([A-Z])$/);
        return m ? { base: m[1], sec: m[2] } : null;
      }).filter(Boolean) as { base: string; sec: string }[];
      if (infos.length > 0) {
        const base = infos[0].base;
        const secs = [...new Set(infos.map((x) => x.sec))].sort().join("");
        return [`ELECTIVE:${base}${secs}`, ...fromDB];
      }
    }
    return fromDB;
  }, [schedule, options, faculty, subject]);

  const selectedDay = getDateDay(date);

  const { startSlots, endSlots, locationSlots } = useMemo(() => {
    if (!faculty || !subject || !cls || !date) return { startSlots: [], endSlots: [], locationSlots: [] };

    const isElective = cls.startsWith("ELECTIVE:");
    const electiveClasses = isElective
      ? schedule.filter((r) => !r.Type && r.Faculty === faculty && r.Subject === subject && (r.Elective||"").toLowerCase()==="elective").map((r) => r.Class)
      : [];
    const dayRows = schedule.filter((r) => {
      if (isElective) return !r.Type && r.Day === selectedDay && r.Faculty === faculty && r.Subject === subject && (r.Elective||"").toLowerCase()==="elective";
      return !r.Type && r.Day === selectedDay && r.Faculty === faculty && r.Subject === subject && r.Class === cls;
    });

    if ((type as string) === "Missed" || (type as string) === "Late") {
      const busyHours = dayRows.map((r) => Math.floor((r.SortKey || 0) / 60));
      const start = [...new Set(busyHours)].sort((a, b) => a - b).map(formatHour);
      const locs = [...new Set(dayRows.map((r) => r.Location).filter(Boolean))];
      return { startSlots: start, endSlots: [], locationSlots: locs };
    } else {
      const allBusyHours = schedule.filter((r) => {
        // Block hours where this class is scheduled on this day
        if (!r.Type && r.Day === selectedDay && r.Class === cls) return true;
        // Block hours where this faculty is scheduled on this day
        if (!r.Type && r.Day === selectedDay && r.Faculty === faculty) return true;
        // Block makeup classes for same class/elective on same date
        if (r.Type === "Makeup" && (r.Class === cls || (isElective && electiveClasses.includes(r.Class))) && r.EntryDate) {
          const d = new Date(r.EntryDate);
          const s = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
          return s === date;
        }
        // Block makeup classes for same faculty on same date
        if (r.Type === "Makeup" && r.Faculty === faculty && r.EntryDate) {
          const d = new Date(r.EntryDate);
          const s = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
          return s === date;
        }
        return false;
      }).map((r) => Math.floor((r.SortKey || 0) / 60));

      const freeStart = Array.from({ length: 9 }, (_, i) => i + 9).filter((h) => !allBusyHours.includes(h)).map(formatHour);

      const busyLocs = new Set(schedule.filter((r) => {
        const h = Math.floor((r.SortKey || 0) / 60);
        return !r.Type && r.Day === selectedDay && allBusyHours.includes(h);
      }).map((r) => r.Location).filter(Boolean));

      const allLocs = options?.locations ?? [...new Set(schedule.map((r) => r.Location).filter(Boolean))].sort();
      const freeLocs = allLocs.filter((l) => !busyLocs.has(l));
      return { startSlots: freeStart, endSlots: [], locationSlots: freeLocs };
    }
  }, [schedule, options, faculty, subject, cls, date, selectedDay, type]);

  useEffect(() => { setStartTime(startSlots[0] || ""); }, [startSlots]);
  useEffect(() => { setLocation(locationSlots[0] || ""); }, [locationSlots]);
  useEffect(() => {
    if (startTime) setEndTime(formatHour(hourFromTime(startTime) + 1));
  }, [startTime]);

  const saveMutation = useMutation({
    mutationFn: saveEntry,
    onSuccess: async (_, vars) => {
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      setStartTime(""); setEndTime(""); setLocation("");
      qc.invalidateQueries({ queryKey: ["schedule"] });
      if (vars.Type === "Makeup" && user) {
        setLastMakeup({ subject: vars.Subject, cls: vars.Class, date: vars.Date, time: vars.Time, location: vars.Location ?? "" });
        try {
          setNotifyStudents([]);
        } catch { setNotifyStudents([]); }
        setShowNotify(true);
      } else {
        showAlert("✅ Entry saved successfully!");
      }
    },
    onError: () => showAlert("❌ Failed to save entry. Please try again."),
  });

  const handleLogin = async () => {
    if (!loginUsername || !loginPassword) { setLoginError("Enter username and password"); return; }
    setLoginLoading(true); setLoginError("");
    const result = await login(loginUsername, loginPassword);
    setLoginLoading(false);
    if (!result.success) setLoginError(result.message || "Invalid credentials");
  };

  async function handleBulkImport() {
    if (!bulkDate) { showAlert("Please select a date."); return; }
    setBulkLoading(true); setBulkResult("");
    try {
      const _domain = process.env.EXPO_PUBLIC_DOMAIN || "schoolcollege.online";
      const schedId = scheduleId || params?.scheduleId;
      const res = await fetch("https://" + _domain + "/api/schedule/bulk-day-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduleId: (schedId as any), date: bulkDate, type: bulkType, remarks: bulkRemarks, userEmail: user?.email || "", sourceDay: bulkSourceDay || "" })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      const msg = data.inserted === 0 ? (data.message || "No scheduled classes found for " + data.dayOfWeek + ". Please select a Mon-Fri date.") : data.inserted + " entries imported as " + bulkType.charAt(0).toUpperCase()+bulkType.slice(1) + " for " + bulkDate + " (" + data.dayOfWeek + "). Total scheduled: " + data.total;
      setBulkResult((data.inserted===0?"⚠️ ":"✅ ") + msg);
      setTimeout(() => { setShowBulkImport(false); setBulkResult(""); setBulkRemarks(""); }, 2500);
    } catch(e: any) { showAlert("Import failed: " + e.message); }
    setBulkLoading(false);
  }

  async function handleViewEntries() {
    setEntriesLoading(true); setShowViewEntries(true); setEntriesTab("saved");
    try {
      const _domain = process.env.EXPO_PUBLIC_DOMAIN || "schoolcollege.online";
      const schedId = scheduleId || params?.scheduleId;
      // Fetch holidays
      const hRes = await fetch("https://" + _domain + "/api/holidays?scheduleId=" + schedId);
      const hData = await hRes.json();
      setHolidayDates(new Set(Array.isArray(hData) ? hData.map((h:any)=>h.date?.slice(0,10)||""): []));
      // Fetch saved entries
      const res = await fetch("https://" + _domain + "/api/schedule/entries?scheduleId=" + schedId);
      const data = await res.json();
      const sorted = Array.isArray(data) ? data.sort((a:any,b:any)=>{
        const dayO:any={"Mon":1,"Tue":2,"Wed":3,"Thu":4,"Fri":5,"Sat":6,"Sun":7};
        if(a.entry_date!==b.entry_date) return a.entry_date>b.entry_date?1:-1;
        if(a.day!==b.day) return (dayO[a.day]||9)-(dayO[b.day]||9);
        return (a.time_start||"")>(b.time_start||"")?1:-1;
      }) : [];
      setAllEntries(sorted);
      // Fetch recurring schedule entries for reference
      const res2 = await fetch("https://" + _domain + "/api/schedule?scheduleId=" + schedId);
      const sched = await res2.json();
      const recurring = Array.isArray(sched) ? sched.filter((r:any)=>!r.type||r.type==="").sort((a:any,b:any)=>{
        const dayO:any={"Mon":1,"Tue":2,"Wed":3,"Thu":4,"Fri":5,"Sat":6,"Sun":7};
        if(a.day!==b.day) return (dayO[a.day]||9)-(dayO[b.day]||9);
        return (a.time_start||"")>(b.time_start||"")?1:-1;
      }) : [];
      setScheduleEntries(recurring);
    } catch(e) { setAllEntries([]); setScheduleEntries([]); }
    setEntriesLoading(false);
  }

  async function handleSaveMakeupFromEntry() {
    if(!addMakeupDate||!addingMakeupEntry) return;
    setAddMakeupSaving(true);
    try {
      const _domain = process.env.EXPO_PUBLIC_DOMAIN || "schoolcollege.online";
      const schedId = scheduleId || params?.scheduleId;
      const e = addingMakeupEntry;
      const res = await fetch("https://"+_domain+"/api/entries",{
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({Faculty:e.faculty,Subject:e.subject,Class:e.class_name,Dept:e.dept||"",Date:addMakeupDate,Location:e.location||"",Time:e.time_start,EndTime:e.time_end,LecLab:e.lec_lab||"Lec",Type:"Makeup",User:user||"",scheduleId:schedId})
      });
      const data=await res.json();
      if(data.success){ showAlert("✅ Makeup entry saved for "+addMakeupDate+"!"); setAddingMakeupEntry(null); setAddMakeupDate(""); handleViewEntries(); }
      else if(data.clash){ showAlert("Clash Detected: "+data.message); }
      else { showAlert("Save failed: "+(data.error||data.message||"Unknown")); }
    } catch(ex:any){ showAlert("Error: "+ex.message); }
    setAddMakeupSaving(false);
  }

  async function handleAddSingleEntry() {
    if(!addDate||!addingEntry) return;
    setAddSaving(true);
    try {
      const _domain = process.env.EXPO_PUBLIC_DOMAIN || "schoolcollege.online";
      const schedId = scheduleId || params?.scheduleId;
      const res = await fetch("https://"+_domain+"/api/schedule/entry",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          Faculty:addingEntry.faculty, Subject:addingEntry.subject, Class:addingEntry.class_name,
          Dept:addingEntry.dept||"", Day:addingEntry.day, Location:addingEntry.location||"",
          Time:addingEntry.time_start, EndTime:addingEntry.time_end, LecLab:addingEntry.lec_lab||"Lec",
          Type:refType, EntryDate:addDate, scheduleId:schedId, User:""
        })
      });
      const data=await res.json();
      if(data.success){ setAddingEntry(null); setAddDate(""); handleViewEntries(); }
      else if(data.clash){ showAlert("Clash Detected: "+data.message); }
      else { showAlert("Save failed: "+(data.error||"Unknown error")); }
    } catch(e:any){ showAlert("Error: "+e.message); }
    setAddSaving(false);
  }

  async function handleDeleteEntry(id: number) {
    const _domain = process.env.EXPO_PUBLIC_DOMAIN || "schoolcollege.online";
    if (!showConfirm("Delete this entry? This will also remove related attendance data.")) return;
    try {
      const res = await fetch("https://" + _domain + "/api/schedule/entry/" + id, { method: "DELETE" });
      if (res.ok) { setAllEntries(prev => prev.filter(e => e.id !== id)); }
      else { showAlert("Delete failed"); }
    } catch(e) { showAlert("Error deleting entry"); }
  }

  const typeColors: Record<string, string> = {
    Missed: colors.errorBg, Late: "#FFE1F4", Makeup: colors.successBg,
  };
  const typeTextColors: Record<string, string> = {
    Missed: colors.destructive, Late: "#C2185B", Makeup: colors.success,
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      backgroundColor: "#1565C0", paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0),
      paddingBottom: 16, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.15)",
    },
    homeBtn: {
      flexDirection: "row", alignItems: "center", gap: 6,
      backgroundColor: "rgba(255,255,255,0.18)", borderRadius: 20,
      paddingHorizontal: 12, paddingVertical: 6, alignSelf: "flex-start", marginBottom: 10,
    },
    homeBtnTxt: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 13 },
    headerTitle: { fontSize: 24, fontFamily: "Inter_700Bold", color: "#fff" },
    headerSub: { fontSize: 13, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.8)", marginTop: 2 },
    scroll: { padding: 16 },
    label: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, marginBottom: 6, marginTop: 16, textTransform: "uppercase", letterSpacing: 0.5 },
    pickerBtn: {
      backgroundColor: colors.card, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
      borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    },
    pickerBtnActive: { borderColor: colors.primary, backgroundColor: "#E3F2FD" },
    pickerTxt: { fontFamily: "Inter_400Regular", fontSize: 14, color: colors.mutedForeground, flex: 1 },
    pickerTxtActive: { color: "#0D47A1", fontFamily: "Inter_700Bold" },
    optRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
    optBtn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    optBtnActive: { backgroundColor: "#1565C0", borderColor: "#1565C0" },
    optTxt: { fontFamily: "Inter_500Medium", fontSize: 13, color: colors.foreground },
    optTxtActive: { color: "#fff" },
    dateRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    dayBadge: { backgroundColor: "#1565C0", paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.primary },
    dayBadgeTxt: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff" },
    dateInput: {
      flex: 1, backgroundColor: colors.card, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
      fontFamily: "Inter_400Regular", fontSize: 14, color: colors.foreground,
      borderWidth: 1, borderColor: colors.border,
    },
    noSlots: { color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 4, fontStyle: "italic" },
    saveBtn: { backgroundColor: typeTextColors[type], borderRadius: 12, padding: 16, alignItems: "center", marginTop: 24, marginBottom: 20 },
    saveBtnDisabled: { opacity: 0.5 },
    saveBtnTxt: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 16 },
    loginCard: { flex: 1, justifyContent: "center", padding: 32, backgroundColor: colors.background, paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) },
    loginIcon: { alignSelf: "center", marginBottom: 24 },
    loginTitle: { fontSize: 26, fontFamily: "Inter_700Bold", color: colors.foreground, textAlign: "center", marginBottom: 8 },
    loginSub: { fontSize: 14, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center", marginBottom: 32 },
    loginInput: {
      backgroundColor: colors.card, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
      fontFamily: "Inter_400Regular", fontSize: 15, color: colors.foreground,
      borderWidth: 1, borderColor: colors.border, marginBottom: 12,
    },
    loginError: { color: colors.destructive, fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 12, textAlign: "center" },
    loginBtn: { backgroundColor: colors.primary, borderRadius: 12, padding: 16, alignItems: "center", marginTop: 8 },
    loginBtnTxt: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 16 },
    divider: { height: 1, backgroundColor: colors.border, marginVertical: 12 },
  });


  function handleEntriesExportCsv() {
    if (!allEntries.length && !schedule.length) { showAlert("No entries to export."); return; }
    const header = ["Type","Date","Day","Faculty","Subject","Class","Dept","Location","Time","EndTime","Lec/Lab","Remarks"];
    const csvRows = (allEntries as any[]).map((e:any) => [
      e.type||"", e.entry_date||"", e.day||"", e.faculty||"", e.subject||"", e.class_name||"", e.dept||"", e.location||"", e.time_start||"", e.time_end||"", e.lec_lab||"", e.remarks||""
    ].map((v:string) => `"${String(v).replace(/"/g,'""')}"`).join(","));
    // Add separator then regular schedule entries
    csvRows.push("--- PAGE BREAK ---,,,,,,,,,,,,");
    const regularRows = (schedule as any[]).filter((r:any) => !r.EntryDate);
    regularRows.forEach((r:any) => {
      csvRows.push(["",r.Day||"",r.Day||"",r.Faculty||"",r.Subject||"",r.Class||"",r.Deptt||"",r.Location||"",r.Time||"",r.EndTime||"",r.LecLab||"",""].map((v:string)=>`"${String(v).replace(/"/g,'""')}"`).join(","));
    });
    const csv = [header.join(","), ...csvRows].join("\n");
    const blob = new Blob([csv], {type:"text/csv"});
    if (Platform.OS !== "web") { Alert.alert("Info", "PDF export is available on the website version."); return; }
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = "SavedEntries.csv"; a.click(); URL.revokeObjectURL(url);
  }

  async function handleEntriesOverride(uri:string, name:string, mimeType:string, file?:File) {
    setEntriesOverrideLoading(true);
    try {
      const _domain = process.env.EXPO_PUBLIC_DOMAIN || "schoolcollege.online";
      const schedId = scheduleId || params?.scheduleId;
      let text = "";
      try {
        if (Platform.OS === "web") {
          const r2 = await fetch(uri); text = await r2.text();
        } else {
          const response = await fetch(uri);
          text = await response.text();
        }
      } catch(fe) { if (file) text = await (file as any).text(); }
      text = text.replace(/^﻿/, "");
      const lines = text.split("\n").map((l:string)=>l.trim()).filter(Boolean);
      const headers = lines[0].split(",").map((h:string)=>h.replace(/^"|"$/g,"").trim());
      const entries = lines.slice(1).map((line:string) => {
        const vals = line.split(",");
        const row:any = {};
        headers.forEach((h:string,i:number) => { row[h] = (vals[i]||"").replace(/^"|"$/g,"").replace(/""/g,'"').trim(); });
        return { type: row["Type"]||"", entry_date: row["Date"]||"", day: row["Day"]||"", faculty: row["Faculty"]||"", subject: row["Subject"]||"", class_name: row["Class"]||"", dept: row["Dept"]||"", location: row["Location"]||"", time_start: row["Time"]||"", time_end: row["EndTime"]||"", lec_lab: row["Lec/Lab"]||"Lec", remarks: row["Remarks"]||"" };
      }).filter((e:any) => e.type && e.entry_date && e.faculty);
      const res2 = await fetch("https://"+_domain+"/api/schedule/entries/override", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({scheduleId: schedId, entries})
      });
      const result = await res2.json();
      if (result.success) { setShowEntriesOverride(false); showAlert("Override complete! "+result.imported+" entries updated."); handleViewEntries(); }
      else showAlert("Override failed: "+(result.error||"Unknown error"));
    } catch(e:any) { showAlert("Override failed: "+e.message); }
    setEntriesOverrideLoading(false);
  }
    if (isLoading) return <View style={{flex:1,justifyContent:"center",alignItems:"center"}}><ActivityIndicator size="large" color="#1565C0"/></View>;
  if (!user) {
  
  return (
      <View style={s.loginCard}>
        <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 24 }} onPress={() => router.replace("/" as never)}>
          <Feather name="home" size={16} color={colors.primary} />
          <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 13 }}>Home</Text>
        </TouchableOpacity>
        <Feather name="lock" size={48} color={colors.primary} style={s.loginIcon} />
        <Text style={s.loginTitle}>Login Required</Text>
        <Text style={s.loginSub}>Enter your credentials to record entries</Text>
        <TextInput style={s.loginInput} placeholder="Username" placeholderTextColor={colors.mutedForeground} value={loginUsername} onChangeText={setLoginUsername} autoCapitalize="none" />
        <TextInput style={s.loginInput} placeholder="Password" placeholderTextColor={colors.mutedForeground} value={loginPassword} onChangeText={setLoginPassword} secureTextEntry />
        {loginError ? <Text style={s.loginError}>{loginError}</Text> : null}
        <TouchableOpacity style={s.loginBtn} onPress={handleLogin} disabled={loginLoading}>
          {loginLoading ? <ActivityIndicator color="#fff" /> : <Text style={s.loginBtnTxt}>Login</Text>}
        </TouchableOpacity>
      </View>
    );
  }

  const canSave = !!(faculty && subject && cls && date && startTime && endTime) && !saveMutation.isPending;

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
          <TouchableOpacity style={[s.homeBtn, { marginBottom: 0 }]} onPress={() => router.back()}>
            <Feather name="chevron-left" size={14} color="#fff" />
            <Text style={s.homeBtnTxt}>Back</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.homeBtn, { marginBottom: 0 }]} onPress={() => router.replace("/" as never)}>
            <Feather name="home" size={14} color="#fff" />
            <Text style={s.homeBtnTxt}>Home</Text>
          </TouchableOpacity>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View>
            <Text style={s.headerTitle}>New Entry</Text>
            <Text style={s.headerSub}>Logged in as {user}</Text>
          </View>
          <TouchableOpacity
            onPress={() => setShowImport(true)}
            style={{ backgroundColor: "rgba(255,255,255,0.22)", borderRadius: 12, padding: 8, borderWidth: 2, borderColor: "rgba(255,255,255,0.5)" }}
          >
            <Feather name="upload" size={18} color="#fff" />
          </TouchableOpacity>
              <TouchableOpacity onPress={() => { setBulkDate(""); setBulkType("missed"); setBulkRemarks(""); setBulkResult(""); setShowBulkImport(true); }}
                style={{ backgroundColor: "rgba(255,255,255,0.22)", borderRadius: 12, padding: 8, borderWidth: 2, borderColor: "rgba(255,255,255,0.5)", flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12 }}>
                <Feather name="calendar" size={16} color="#fff" />
                <Text style={{ color: "#fff", fontSize: 12, fontFamily: "Inter_600SemiBold" }}>Import Day</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleViewEntries}
                style={{ backgroundColor: "rgba(255,255,255,0.22)", borderRadius: 12, padding: 8, borderWidth: 2, borderColor: "rgba(255,255,255,0.5)", flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12 }}>
                <Feather name="list" size={16} color="#fff" />
                <Text style={{ color: "#fff", fontSize: 12, fontFamily: "Inter_600SemiBold" }}>All Entries</Text>
              </TouchableOpacity>
        </View>
      </View>

      <KeyboardAwareScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Text style={s.label}>Entry Type</Text>
        <View style={s.optRow}>
          {TYPE_OPTIONS.map((t) => (
            <TouchableOpacity
              key={t}
              style={[s.optBtn, type === t && { borderColor: typeTextColors[t], backgroundColor: typeTextColors[t] }]}
              onPress={() => setType(t)}
            >
              <Text style={[s.optTxt, type === t && { color: "#fff", fontFamily: "Inter_700Bold" }]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={s.divider} />

        <Text style={s.label}>Faculty *</Text>
        <TouchableOpacity style={[s.pickerBtn, faculty && s.pickerBtnActive]} onPress={() => setActivePicker("faculty")}>
          <Text style={[s.pickerTxt, faculty && s.pickerTxtActive]} numberOfLines={1}>{faculty || "Tap to select faculty…"}</Text>
          <Feather name="chevron-down" size={16} color={faculty ? colors.primary : colors.mutedForeground} />
        </TouchableOpacity>

        <Text style={s.label}>Subject *</Text>
        <TouchableOpacity
          style={[s.pickerBtn, subject && s.pickerBtnActive, !faculty && { opacity: 0.5 }]}
          onPress={() => faculty && setActivePicker("subject")}
        >
          <Text style={[s.pickerTxt, subject && s.pickerTxtActive]} numberOfLines={1}>
            {subject || (faculty ? "Tap to select subject…" : "Select faculty first")}
          </Text>
          <Feather name="chevron-down" size={16} color={subject ? colors.primary : colors.mutedForeground} />
        </TouchableOpacity>

        <Text style={s.label}>Class *</Text>
        <TouchableOpacity
          style={[s.pickerBtn, cls && s.pickerBtnActive, !subject && { opacity: 0.5 }]}
          onPress={() => subject && setActivePicker("cls")}
        >
          <Text style={[s.pickerTxt, cls && s.pickerTxtActive]} numberOfLines={1}>
            {cls || (subject ? "Tap to select class…" : "Select subject first")}
          </Text>
          <Feather name="chevron-down" size={16} color={cls ? colors.primary : colors.mutedForeground} />
        </TouchableOpacity>

        <View style={s.divider} />

        <Text style={s.label}>Date *</Text>
        <View style={s.dateRow}>
          {Platform.OS==="web" ? (
            <input type="date" value={date} onChange={(e:any)=>setDate(e.target.value)}
              style={{flex:1,backgroundColor:"#fff",borderRadius:10,paddingLeft:14,paddingRight:14,paddingTop:12,paddingBottom:12,fontSize:14,border:"1px solid "+colors.border,color:colors.foreground,fontFamily:"inherit",outline:"none",height:46}}/>
          ) : (
            <>
              <TouchableOpacity onPress={() => setShowDatePicker(true)} style={[s.dateInput, {justifyContent:"center"}]}>
                <Text style={{color:date?colors.foreground:colors.mutedForeground,fontSize:14,fontFamily:"Inter_400Regular"}}>{date || "Select Date"}</Text>
              </TouchableOpacity>
              {showDatePicker && <DateTimePicker value={date?new Date(date):new Date()} mode="date" display="calendar" onChange={(e,d)=>{setShowDatePicker(false);if(d){const y=d.getFullYear();const m=String(d.getMonth()+1).padStart(2,"0");const dd=String(d.getDate()).padStart(2,"0");setDate(`${y}-${m}-${dd}`);}}} />}
            </>
          )}
          {selectedDay ? <View style={s.dayBadge}><Text style={s.dayBadgeTxt}>{selectedDay}</Text></View> : null}
        </View>

        {cls && date && (
          <>
            <View style={s.divider} />

            <Text style={s.label}>
              Start Time *{type !== "Makeup" ? " (scheduled slots)" : " (free slots)"}
            </Text>
            {startSlots.length === 0 ? (
              <Text style={s.noSlots}>
                {type === "Makeup" ? "No free slots available for this class/date" : "No scheduled class found for this faculty/subject/class on this day"}
              </Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: "row", gap: 8, paddingBottom: 4 }}>
                  {startSlots.map((t) => (
                    <TouchableOpacity key={t} style={[s.optBtn, startTime === t && s.optBtnActive]} onPress={() => setStartTime(t)}>
                      <Text style={[s.optTxt, startTime === t && s.optTxtActive]}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            )}

            {startTime ? (
              <>
                <Text style={s.label}>End Time *</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: "row", gap: 8, paddingBottom: 4 }}>
                    {Array.from({ length: 17 - hourFromTime(startTime) }, (_, i) => formatHour(hourFromTime(startTime) + 1 + i)).map((t) => (
                      <TouchableOpacity key={t} style={[s.optBtn, endTime === t && s.optBtnActive]} onPress={() => setEndTime(t)}>
                        <Text style={[s.optTxt, endTime === t && s.optTxtActive]}>{t}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>

                <Text style={s.label}>Location</Text>
                {locationSlots.length > 0 ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={{ flexDirection: "row", gap: 8, paddingBottom: 4 }}>
                      {locationSlots.map((l) => (
                        <TouchableOpacity key={l} style={[s.optBtn, location === l && s.optBtnActive]} onPress={() => setLocation(l)}>
                          <Text style={[s.optTxt, location === l && s.optTxtActive]}>{l}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                ) : (
                  <TextInput
                    style={{ backgroundColor: colors.card, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontFamily: "Inter_400Regular", fontSize: 14, color: colors.foreground, borderWidth: 1, borderColor: colors.border }}
                    value={location} onChangeText={setLocation} placeholder="Enter location" placeholderTextColor={colors.mutedForeground}
                  />
                )}
              </>
            ) : null}
          </>
        )}

        <TouchableOpacity
          style={[s.saveBtn, !canSave && s.saveBtnDisabled]}
          disabled={!canSave}
          onPress={() => saveMutation.mutate({ Faculty: faculty, Subject: subject, Class: cls, Date: date, Location: location, Time: startTime, EndTime: endTime, Type: type, User: user! } as any)}
        >
          {saveMutation.isPending
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.saveBtnTxt}>Save {type} Entry</Text>
          }
        </TouchableOpacity>
      </KeyboardAwareScrollView>

      <ImportPanel visible={showImport} onClose={() => setShowImport(false)} title="Import Data Entries">
        <ExcelImportButton
          label="Import Data Entries"
          description="DataEntries.xlsx — Missed / Late / Makeup entries with Faculty, Subject, Class, Date, Type"
          icon="file-text"
          variant="primary"
          onImport={importEntriesExcel}
          onSuccess={() => { setShowImport(false); qc.invalidateQueries({ queryKey: ["schedule"] }); }}
        />
      </ImportPanel>

      <PickerModal visible={activePicker === "faculty"} title="Select Faculty" items={facultyList} selected={faculty}
        onSelect={(v) => { setFaculty(v); setSubject(""); setCls(""); }} onClose={() => setActivePicker(null)} />

      {/* Makeup Email Notification Modal */}
      {showNotify && (
        <View style={{position:"absolute",top:0,left:0,right:0,bottom:0,backgroundColor:"rgba(0,0,0,0.5)",justifyContent:"flex-end",zIndex:9999}}>
          <View style={{backgroundColor:"#fff",borderTopLeftRadius:20,borderTopRightRadius:20,padding:24,maxHeight:"80%"}}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <Text style={{ fontSize: 17, fontFamily: "Inter_700Bold", color: "#1A1A1A" }}>Notify Students</Text>
              <TouchableOpacity onPress={() => { setShowNotify(false); showAlert("✅ Makeup entry saved successfully!"); }}>
                <Feather name="x" size={22} color="#666" />
              </TouchableOpacity>
            </View>
            {lastMakeup && (
              <View style={{ backgroundColor: "#F0FFF4", borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: "#C6F6D5" }}>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: "#2E7D32" }}>Makeup Class Saved ✓</Text>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: "#555", marginTop: 4 }}>
                  {lastMakeup.subject} · {lastMakeup.cls}{"\n"}{lastMakeup.date} at {lastMakeup.time}{lastMakeup.location ? ` · ${lastMakeup.location}` : ""}
                </Text>
              </View>
            )}
            {notifyStudents.length === 0 ? (
              <View style={{ alignItems: "center", paddingVertical: 24 }}>
                <Feather name="mail" size={36} color="#bbb" />
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: "#888", marginTop: 10, textAlign: "center" }}>
                  No student emails found for this class.{"\n"}Add emails in the Attendance → Students tab.
                </Text>
              </View>
            ) : (
              <>
                <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: "#888", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  {notifyStudents.filter(s => s.email).length} of {notifyStudents.length} students have emails
                </Text>
                <ScrollView style={{ maxHeight: 200, marginBottom: 16 }}>
                  {notifyStudents.map(stu => (
                    <View key={stu.rollNo} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#F0F0F0" }}>
                      <Feather name={stu.email ? "mail" : "user"} size={14} color={stu.email ? "#1976D2" : "#bbb"} style={{ marginRight: 10 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: "#1A1A1A" }}>{stu.name}</Text>
                        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: "#888" }}>{stu.email || "No email"}</Text>
                      </View>
                    </View>
                  ))}
                </ScrollView>

                <TouchableOpacity
                  style={{ backgroundColor: "#1976D2", borderRadius: 12, padding: 14, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}
                  onPress={() => {
                    const emails = notifyStudents.filter(s => s.email).map(s => s.email).join(",");
                    const subj = encodeURIComponent(`Makeup Class: ${lastMakeup?.subject ?? ""}`);
                    const body = encodeURIComponent(
                      `Dear Students,\n\nA makeup class has been scheduled:\n\nSubject: ${lastMakeup?.subject ?? ""}\nClass: ${lastMakeup?.cls ?? ""}\nDate: ${lastMakeup?.date ?? ""}\nTime: ${lastMakeup?.time ?? ""}${lastMakeup?.location ? `\nLocation: ${lastMakeup.location}` : ""}\n\nPlease ensure your attendance.\n\nRegards`
                    );
                    Linking.openURL(`mailto:${emails}?subject=${subj}&body=${body}`);
                  }}
                >
                  <Feather name="send" size={16} color="#fff" />
                  <Text style={{ color: "#fff", fontFamily: "Inter_700Bold", fontSize: 15 }}>Open Email Client</Text>
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity
              style={{ marginTop: 12, padding: 12, alignItems: "center" }}
              onPress={() => { setShowNotify(false); showAlert("✅ Makeup entry saved successfully!"); }}
            >
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 14, color: "#888" }}>Skip Notification</Text>
            </TouchableOpacity>
          </View>
        </View>
            )}
      <PickerModal visible={activePicker === "subject"} title="Select Subject" items={subjectList} selected={subject}
        onSelect={(v) => { setSubject(v); setCls(""); }} onClose={() => setActivePicker(null)} />
      <PickerModal visible={activePicker === "cls"} title="Select Class" items={classList} selected={cls}
        onSelect={(v) => { setCls(v); }} onClose={() => setActivePicker(null)} />
      {/* ── Import Day Modal ── */}
      {showBulkImport && (
        <View style={{position:"absolute",top:0,left:0,right:0,bottom:0,backgroundColor:"rgba(0,0,0,0.6)",justifyContent:"center",alignItems:"center",zIndex:9999}}>
          <View style={{backgroundColor:"#fff",borderRadius:16,padding:24,width:340,maxHeight:"85%"}}>
            <Text style={{fontSize:18,fontWeight:"700",color:"#1A237E",marginBottom:4}}>Import Day Schedule</Text>
            <Text style={{fontSize:13,color:"#666",marginBottom:16}}>Bulk import all scheduled classes for a weekday as Missed or Makeup entries.</Text>
            <Text style={{fontSize:12,fontWeight:"600",color:"#333",marginBottom:6,textTransform:"uppercase"}}>Date</Text>
            <View style={{borderWidth:1,borderColor:"#ddd",borderRadius:8,marginBottom:6}}>
              {Platform.OS==="web" ? <input type="date" value={bulkDate} onChange={(e:any)=>setBulkDate(e.target.value)} style={{width:"100%",padding:"10px 12px",fontSize:14,border:"none",borderRadius:8,outline:"none",fontFamily:"inherit"}}/> : <><TouchableOpacity onPress={() => setShowBulkDatePicker(true)} style={{padding:12,borderRadius:8,borderWidth:1,borderColor:"#ddd",backgroundColor:"#fff"}}><Text style={{color:bulkDate?"#000":"#999",fontSize:14,fontFamily:"Inter_400Regular"}}>{bulkDate || "Select Date"}</Text></TouchableOpacity>{showBulkDatePicker && <DateTimePicker value={bulkDate?new Date(bulkDate):new Date()} mode="date" display="calendar" onChange={(e,d)=>{setShowBulkDatePicker(false);if(d){const y=d.getFullYear();const m=String(d.getMonth()+1).padStart(2,"0");const dd=String(d.getDate()).padStart(2,"0");setBulkDate(`${y}-${m}-${dd}`);}}} />}</>}
            </View>
            {bulkDate?(()=>{const d=new Date(bulkDate+"T00:00:00");const days=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];const dn=days[d.getDay()];const isWknd=d.getDay()===0||d.getDay()===6;if(isWknd&&bulkType!=="makeup")setBulkType("makeup");return(<Text style={{fontSize:12,marginBottom:12,fontWeight:"600",color:isWknd?"#E65100":"#2E7D32"}}>{isWknd?"📅 "+dn+" — Weekend: Makeup sessions only allowed.":"✅ "+dn+" — Classes will be imported."}</Text>);})():null}
            {bulkDate&&(()=>{const dd=new Date(bulkDate+"T00:00:00");return dd.getDay()===0||dd.getDay()===6;})()&&bulkType==="makeup"&&(<><Text style={{fontSize:12,fontWeight:"600",color:"#333",marginBottom:6,textTransform:"uppercase"}}>Import Schedule From (Weekday)</Text><Text style={{fontSize:12,color:"#666",marginBottom:8}}>Select which weekday's classes to conduct as Makeup on this weekend.</Text><View style={{flexDirection:"row",flexWrap:"wrap",gap:6,marginBottom:12}}>{["Mon","Tue","Wed","Thu","Fri"].map(d=>(<TouchableOpacity key={d} onPress={()=>setBulkSourceDay(d)} style={{paddingHorizontal:14,paddingVertical:8,borderRadius:8,backgroundColor:bulkSourceDay===d?"#1565C0":"#f5f5f5",borderWidth:2,borderColor:bulkSourceDay===d?"#1565C0":"#ddd"}}><Text style={{fontWeight:"700",fontSize:13,color:bulkSourceDay===d?"#fff":"#555"}}>{d}</Text></TouchableOpacity>))}</View></>)}
            <Text style={{fontSize:12,fontWeight:"600",color:"#333",marginBottom:8,textTransform:"uppercase"}}>Entry Type</Text>
            <View style={{flexDirection:"row",gap:8,marginBottom:12}}>
              {(["missed","makeup"] as const).map(t=>{const isWkndCheck=bulkDate?(()=>{const dd=new Date(bulkDate+"T00:00:00");return dd.getDay()===0||dd.getDay()===6;})():false;const disabled=isWkndCheck&&t==="missed";return(<TouchableOpacity key={t} disabled={disabled} onPress={()=>setBulkType(t)} style={{flex:1,paddingVertical:10,borderRadius:8,alignItems:"center",opacity:disabled?0.35:1,backgroundColor:bulkType===t?(t==="missed"?"#C62828":"#2E7D32"):"#f5f5f5",borderWidth:2,borderColor:bulkType===t?(t==="missed"?"#C62828":"#2E7D32"):"#ddd"}}><Text style={{fontWeight:"700",fontSize:13,color:bulkType===t?"#fff":"#555",textTransform:"capitalize"}}>{t}{disabled?" 🚫":""}</Text></TouchableOpacity>);})}
            </View>
            <Text style={{fontSize:12,fontWeight:"600",color:"#333",marginBottom:6,textTransform:"uppercase"}}>Remarks (optional)</Text>
            {Platform.OS==="web" ? <textarea value={bulkRemarks} onChange={(e:any)=>setBulkRemarks(e.target.value)} placeholder={bulkType==="missed"?"e.g. Classes missed due to Government Lockdown":"e.g. Makeup for missed Lec of 15 May 2026"} style={{width:"100%",padding:"10px 12px",fontSize:13,border:"1px solid #ddd",borderRadius:8,outline:"none",fontFamily:"inherit",minHeight:72,resize:"vertical",marginBottom:12}}/> : <TextInput value={bulkRemarks} onChangeText={setBulkRemarks} placeholder={bulkType==="missed"?"e.g. Classes missed due to Government Lockdown":"e.g. Makeup for missed Lec of 15 May 2026"} placeholderTextColor="#999" multiline numberOfLines={3} style={{padding:10,fontSize:13,borderWidth:1,borderColor:"#ddd",borderRadius:8,fontFamily:"Inter_400Regular",minHeight:72,marginBottom:12}} />}
            {bulkResult?<Text style={{fontSize:13,color:"#2E7D32",marginBottom:12,textAlign:"center"}}>{bulkResult}</Text>:null}
            <View style={{flexDirection:"row",gap:8,marginTop:4}}>
              <TouchableOpacity onPress={()=>setShowBulkImport(false)} style={{flex:1,paddingVertical:12,borderRadius:8,alignItems:"center",backgroundColor:"#f5f5f5",borderWidth:1,borderColor:"#ddd"}}>
                <Text style={{fontWeight:"600",color:"#555"}}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleBulkImport} disabled={bulkLoading} style={{flex:2,paddingVertical:12,borderRadius:8,alignItems:"center",backgroundColor:bulkLoading?"#90CAF9":(bulkType==="missed"?"#C62828":"#2E7D32")}}>
                <Text style={{fontWeight:"700",color:"#fff"}}>{bulkLoading?"Importing...":"Import as "+bulkType.charAt(0).toUpperCase()+bulkType.slice(1)}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* ── View All Entries Modal ── */}
      {showViewEntries && (
        <View style={{position:"absolute",top:0,left:0,right:0,bottom:0,backgroundColor:"rgba(0,0,0,0.6)",justifyContent:"center",alignItems:"center",zIndex:9999}}>
          <View style={{backgroundColor:"#fff",borderRadius:16,padding:0,width:380,maxHeight:"90%",overflow:"hidden"}}>
            {/* Header */}
            <View style={{backgroundColor:"#1565C0",padding:16,flexDirection:"row",justifyContent:"space-between",alignItems:"center"}}>
              <Text style={{fontSize:17,fontWeight:"700",color:"#fff"}}>All Entries</Text>
              <TouchableOpacity onPress={()=>setShowViewEntries(false)}><Feather name="x" size={22} color="#fff"/></TouchableOpacity>
            </View>
            {/* Tabs */}
            <View style={{flexDirection:"row",borderBottomWidth:1,borderColor:"#eee"}}>
              {([["saved","Saved Entries"],["reference","Add Entry"]] as const).map(([t,l])=>(
                <TouchableOpacity key={t} onPress={()=>setEntriesTab(t)} style={{flex:1,paddingVertical:10,alignItems:"center",borderBottomWidth:2,borderColor:entriesTab===t?"#1565C0":"transparent"}}>
                  <Text style={{fontWeight:"700",fontSize:13,color:entriesTab===t?"#1565C0":"#888"}}>{l}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {entriesTab==="saved"&&(
              <View style={{flexDirection:"row",gap:6,paddingHorizontal:12,paddingVertical:8,borderBottomWidth:1,borderColor:"#eee"}}>
                <TouchableOpacity onPress={handleEntriesExportCsv} style={{flexDirection:"row",alignItems:"center",gap:4,backgroundColor:"#1565C0",borderRadius:6,paddingHorizontal:10,paddingVertical:6}}>
                  <Feather name="file-text" size={13} color="#fff"/>
                  <Text style={{color:"#fff",fontSize:12,fontWeight:"600"}}>Export CSV</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={()=>{Alert.alert("Info", "This feature is available on the website version.");}} style={{flexDirection:"row",alignItems:"center",gap:4,backgroundColor:"#E65100",borderRadius:6,paddingHorizontal:10,paddingVertical:6}}>
                  <Feather name="refresh-cw" size={13} color="#fff"/>
                  <Text style={{color:"#fff",fontSize:12,fontWeight:"600"}}>{entriesOverrideLoading?"Uploading...":"Override"}</Text>
                </TouchableOpacity>
                {typeof document!=="undefined"&&React.createElement("input",{id:"entries-override-input",type:"file",accept:".csv,.xlsx",style:{display:"none"},onChange:(ev:any)=>{const f=ev.target.files?.[0];if(f){ev.target.value="";handleEntriesOverride(URL.createObjectURL(f),f.name,f.type,f);}}})}
              </View>
            )}
            {entriesLoading?<ActivityIndicator color="#1565C0" size="large" style={{margin:24}}/>:

            entriesTab==="saved"?(
              /* ── SAVED ENTRIES TAB ── */
              <ScrollView style={{maxHeight:520}}>
                {allEntries.length===0?<Text style={{textAlign:"center",color:"#999",padding:24}}>No saved entries yet.</Text>:
                allEntries.map((e,i)=>{
                  const tc=e.type==="missed"||e.type==="Missed"?"#C62828":e.type==="makeup"||e.type==="Makeup"?"#2E7D32":"#E65100";
                  const bg=e.type==="missed"?"#FFEBEE":e.type==="makeup"?"#E8F5E9":"#FFF3E0";
                  return(
                    <View key={e.id||i} style={{flexDirection:"row",alignItems:"center",borderBottomWidth:1,borderColor:"#f0f0f0",paddingVertical:10,paddingHorizontal:12,backgroundColor:i%2===0?"#fff":"#fafafa"}}>
                      <View style={{flex:1}}>
                        <View style={{flexDirection:"row",alignItems:"center",gap:6,marginBottom:2}}>
                          <View style={{backgroundColor:tc,borderRadius:4,paddingHorizontal:6,paddingVertical:1}}><Text style={{color:"#fff",fontSize:10,fontWeight:"700",textTransform:"capitalize"}}>{e.type}</Text></View>
                          <Text style={{fontSize:11,color:"#888",fontFamily:"Inter_500Medium"}}>{e.entry_date}</Text>
                          <Text style={{fontSize:11,color:"#888"}}>·</Text>
                          <Text style={{fontSize:11,color:"#555",fontFamily:"Inter_500Medium"}}>{e.day} {e.time_start}</Text>
                        </View>
                        <Text style={{fontSize:13,fontWeight:"600",color:"#222"}}>{e.subject}</Text>
                        <Text style={{fontSize:11,color:"#666"}}>{e.faculty} · {e.class_name}</Text>
                        {e.remarks?<Text style={{fontSize:11,color:tc,fontStyle:"italic",marginTop:2}}>"{e.remarks}"</Text>:null}
                      </View>
                      {(e.type==="makeup"||e.type==="Makeup")&&(
                        <TouchableOpacity onPress={()=>{const ed=e.entry_date||""; const td=ed?new Date(ed+"T12:00:00").getDay():1; setMakeupTargetDay(td); setAddingMakeupEntry(e);setAddMakeupDate("");}}
                          style={{padding:8,marginLeft:4,backgroundColor:"#E3F2FD",borderRadius:8}}>
                          <Feather name="plus-circle" size={18} color="#1565C0"/>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity onPress={()=>handleDeleteEntry(e.id)} style={{padding:8,marginLeft:4}}>
                        <Feather name="trash-2" size={18} color="#EF5350"/>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </ScrollView>
            ):(
              /* ── REFERENCE / ADD ENTRY TAB ── */
              <View style={{flex:1}}>
                {/* Type selector */}
                <View style={{flexDirection:"row",gap:8,padding:12,borderBottomWidth:1,borderColor:"#eee"}}>
                  <Text style={{fontSize:13,fontWeight:"600",color:"#333",alignSelf:"center"}}>Type:</Text>
                  {(["missed","late"] as const).map(t=>(
                    <TouchableOpacity key={t} onPress={()=>setRefType(t)} style={{paddingHorizontal:14,paddingVertical:6,borderRadius:8,backgroundColor:refType===t?(t==="missed"?"#C62828":"#E65100"):"#f5f5f5",borderWidth:1.5,borderColor:refType===t?(t==="missed"?"#C62828":"#E65100"):"#ddd"}}>
                      <Text style={{fontWeight:"700",fontSize:12,color:refType===t?"#fff":"#555",textTransform:"capitalize"}}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                  <Text style={{fontSize:11,color:"#888",alignSelf:"center",flex:1,textAlign:"right"}}>Tap + to add date</Text>
                </View>
                <ScrollView style={{maxHeight:460}}>
                  {scheduleEntries.length===0?<Text style={{textAlign:"center",color:"#999",padding:24}}>No schedule entries found.</Text>:
                  scheduleEntries.map((e,i)=>(
                    <View key={e.id||i} style={{flexDirection:"row",alignItems:"center",borderBottomWidth:1,borderColor:"#f0f0f0",paddingVertical:8,paddingHorizontal:12,backgroundColor:i%2===0?"#fff":"#fafafa"}}>
                      <View style={{flex:1}}>
                        <View style={{flexDirection:"row",alignItems:"center",gap:6,marginBottom:2}}>
                          <View style={{backgroundColor:"#1565C0",borderRadius:4,paddingHorizontal:6,paddingVertical:1}}><Text style={{color:"#fff",fontSize:10,fontWeight:"700"}}>{e.day}</Text></View>
                          <Text style={{fontSize:11,color:"#666"}}>{e.time_start}</Text>
                          <Text style={{fontSize:11,color:"#999"}}>·</Text>
                          <Text style={{fontSize:11,color:"#666"}}>{e.lec_lab||"Lec"}</Text>
                        </View>
                        <Text style={{fontSize:13,fontWeight:"600",color:"#222"}}>{e.subject}</Text>
                        <Text style={{fontSize:11,color:"#666"}}>{e.faculty} · {e.class_name}</Text>
                      </View>
                      <TouchableOpacity onPress={()=>{setAddingEntry(e);setAddDate("");}}
                        style={{padding:8,backgroundColor:"#E3F2FD",borderRadius:8,marginLeft:4}}>
                        <Feather name="plus-circle" size={20} color="#1565C0"/>
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>
        </View>
      )}

      {/* ── Add Single Entry Date Picker ── */}
      {addingEntry && (
        <View style={{position:"absolute",top:0,left:0,right:0,bottom:0,backgroundColor:"rgba(0,0,0,0.7)",justifyContent:"center",alignItems:"center",zIndex:10000}}>
          <View style={{backgroundColor:"#fff",borderRadius:16,padding:24,width:340}}>
            <Text style={{fontSize:16,fontWeight:"700",color:"#1A237E",marginBottom:4}}>Add {refType.charAt(0).toUpperCase()+refType.slice(1)} Entry</Text>
            <Text style={{fontSize:13,fontWeight:"600",color:"#333",marginBottom:2}}>{addingEntry.subject}</Text>
            <Text style={{fontSize:12,color:"#666",marginBottom:16}}>{addingEntry.faculty} · {addingEntry.class_name} · {addingEntry.day} {addingEntry.time_start}</Text>
            <Text style={{fontSize:12,fontWeight:"600",color:"#333",marginBottom:6,textTransform:"uppercase"}}>Select Date ({addingEntry?.day} sessions · holidays excluded</Text>
            <ScrollView style={{maxHeight:180,borderWidth:1,borderColor:"#eee",borderRadius:8,marginBottom:16}}>
              {(()=>{
                const dayMap:any={Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6,Sun:0};
                const targetDay=dayMap[addingEntry?.day]??1;
                const start=new Date((params?.startDate||"2026-06-01").toString().split("T")[0]);
                const end=new Date((params?.endDate||"2026-08-28").toString().split("T")[0]);
                const dates:string[]=[];
                const cur=new Date(start);
                while(cur.getDay()!==targetDay&&dates.length<7) cur.setDate(cur.getDate()+1);
                while(cur<=end){
                  const dd=cur.getFullYear()+"-"+String(cur.getMonth()+1).padStart(2,"0")+"-"+String(cur.getDate()).padStart(2,"0"); dates.push(dd);
                  cur.setDate(cur.getDate()+7);
                }
                const filteredDates=dates.filter((d:string)=>!holidayDates.has(d));
                  return filteredDates.map((d,i)=>{
                  const dt=new Date(d+"T00:00:00");
                  const label=dt.toLocaleDateString("en-US",{weekday:"short",day:"numeric",month:"short",year:"numeric"});
                  const isSelected=addDate===d;
                  return(
                    <TouchableOpacity key={d} onPress={()=>setAddDate(d)}
                      style={{paddingHorizontal:14,paddingVertical:10,borderBottomWidth:i<filteredDates.length-1?1:0,borderColor:"#f0f0f0",flexDirection:"row",alignItems:"center",justifyContent:"space-between",backgroundColor:isSelected?"#E3F2FD":"#fff"}}>
                      <Text style={{fontSize:13,color:isSelected?"#1565C0":"#333",fontWeight:isSelected?"700":"400"}}>{label}</Text>
                      {isSelected&&<Feather name="check-circle" size={16} color="#1565C0"/>}
                    </TouchableOpacity>
                  );
                });
              })()}
            </ScrollView>
            <View style={{flexDirection:"row",gap:8}}>
              <TouchableOpacity onPress={()=>{setAddingEntry(null);setAddDate("");}}
                style={{flex:1,paddingVertical:12,borderRadius:8,alignItems:"center",backgroundColor:"#f5f5f5",borderWidth:1,borderColor:"#ddd"}}>
                <Text style={{fontWeight:"600",color:"#555"}}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleAddSingleEntry} disabled={addSaving||!addDate}
                style={{flex:2,paddingVertical:12,borderRadius:8,alignItems:"center",
                  backgroundColor:addSaving||!addDate?"#90CAF9":(refType==="missed"?"#C62828":"#E65100")}}>
                <Text style={{fontWeight:"700",color:"#fff"}}>{addSaving?"Saving...":"Save "+refType.charAt(0).toUpperCase()+refType.slice(1)}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
      {addingMakeupEntry && (
        <View style={{position:"absolute",top:0,left:0,right:0,bottom:0,backgroundColor:"rgba(0,0,0,0.7)",justifyContent:"center",alignItems:"center",zIndex:10001}}>
          <View style={{backgroundColor:"#fff",borderRadius:16,padding:24,width:340,maxHeight:"80%"}}>
            <Text style={{fontSize:16,fontWeight:"700",color:"#1A237E",marginBottom:4}}>Add Makeup Entry</Text>
            <Text style={{fontSize:13,fontWeight:"600",color:"#333"}}>{addingMakeupEntry.subject}</Text>
            <Text style={{fontSize:12,color:"#666",marginBottom:4}}>{addingMakeupEntry.faculty} · {addingMakeupEntry.class_name}</Text>
            <Text style={{fontSize:12,color:"#1565C0",marginBottom:12,fontWeight:"600"}}>📅 {addingMakeupEntry.day} {addingMakeupEntry.time_start} · {addingMakeupEntry.location||"No location"}</Text>
            <Text style={{fontSize:11,fontWeight:"600",color:"#333",marginBottom:6,textTransform:"uppercase"}}>Select Date ({addingMakeupEntry.day} · future dates · holidays excluded)</Text>
            <ScrollView style={{maxHeight:200,borderWidth:1,borderColor:"#eee",borderRadius:8,marginBottom:16}}>
              {(()=>{
                const targetDay=makeupTargetDay||1;
                const today=new Date(); today.setHours(0,0,0,0);
                const end=new Date((params?.endDate||"2026-08-28").toString().split("T")[0]);
                const dates:string[]=[];
                const entryMinDate=addingMakeupEntry?.entry_date?new Date(addingMakeupEntry.entry_date+"T00:00:00"):today; const minStart=entryMinDate>today?entryMinDate:today; const cur=new Date(minStart); cur.setDate(cur.getDate()+1);
                while(cur.getDay()!==targetDay) cur.setDate(cur.getDate()+1);
                while(cur<=end){ const d=cur.getFullYear()+"-"+String(cur.getMonth()+1).padStart(2,"0")+"-"+String(cur.getDate()).padStart(2,"0"); if(!holidayDates.has(d)) dates.push(d); cur.setDate(cur.getDate()+7); }
                return dates.length===0?<Text style={{padding:12,color:"#999",textAlign:"center"}}>No future dates available.</Text>:
                dates.map((d,i)=>{ const dt=new Date(d+"T00:00:00"); const label=dt.toLocaleDateString("en-US",{weekday:"short",day:"numeric",month:"short",year:"numeric"}); const sel=addMakeupDate===d;
                  return(<TouchableOpacity key={d} onPress={()=>setAddMakeupDate(d)} style={{paddingHorizontal:14,paddingVertical:10,borderBottomWidth:i<dates.length-1?1:0,borderColor:"#f0f0f0",flexDirection:"row",alignItems:"center",justifyContent:"space-between",backgroundColor:sel?"#E3F2FD":"#fff"}}>
                    <Text style={{fontSize:13,color:sel?"#1565C0":"#333",fontWeight:sel?"700":"400"}}>{label}</Text>
                    {sel&&<Feather name="check-circle" size={16} color="#1565C0"/>}
                  </TouchableOpacity>);
                });
              })()}
            </ScrollView>
            <View style={{flexDirection:"row",gap:8}}>
              <TouchableOpacity onPress={()=>{setAddingMakeupEntry(null);setAddMakeupDate("");}} style={{flex:1,paddingVertical:12,borderRadius:8,alignItems:"center",backgroundColor:"#f5f5f5",borderWidth:1,borderColor:"#ddd"}}>
                <Text style={{fontWeight:"600",color:"#555"}}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSaveMakeupFromEntry} disabled={addMakeupSaving||!addMakeupDate} style={{flex:2,paddingVertical:12,borderRadius:8,alignItems:"center",backgroundColor:addMakeupSaving||!addMakeupDate?"#90CAF9":"#2E7D32"}}>
                <Text style={{fontWeight:"700",color:"#fff"}}>{addMakeupSaving?"Saving...":"Save Makeup"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
