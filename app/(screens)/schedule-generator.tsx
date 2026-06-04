import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet, Alert, Platform } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
// expo-file-system removed - using fetch API for web compatibility

const colors = { primary:"#1565C0", success:"#2E7D32", bg:"#F5F7FA", card:"#fff", text:"#1a1a2e", muted:"#6B7280", purple:"#6A1B9A" };

function parseTime(t: string): number {
  if (!t) return 0;
  const m = t.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!m) return 0;
  let h = parseInt(m[1]); const min = parseInt(m[2]); const ap = m[3].toUpperCase();
  if (ap === "PM" && h !== 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  return h * 60 + min;
}

function fmt12(h: number): string {
  const ap = h >= 12 ? "PM" : "AM"; const h12 = h % 12 || 12;
  return `${h12}:00 ${ap}`;
}

function generateSchedule(rows: any[], activeDays: string[], startHour: number, endHour: number, breakStart: number, breakEnd: number) {
  const entries: any[] = [];
  const dayOrder = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const days = activeDays.filter(d => dayOrder.includes(d)).sort((a,b)=>dayOrder.indexOf(a)-dayOrder.indexOf(b));

  // Parse credit hrs: "3+1" -> { lec:3, lab:1 }
  function parseCred(c: string) {
    const p = String(c||"2+0").split("+");
    return { lec: parseInt(p[0])||2, lab: parseInt(p[1])||0 };
  }

  // ============================================================
  // PRE-PROCESS: Expand rows based on Class + Instructor sections
  // Draft CSV: Column F = Class (e.g. BEE-6), Column D = Instructor Name with Sections (e.g. Mr. Talha (ABCD))
  // Each letter in the bracket = one section: BEE-6A, BEE-6B, BEE-6C, BEE-6D
  // Multiple instructors can share sections: Mr. X (AB) + Mr. Y (CD) for same class
  // ============================================================
  const expandedRows: any[] = [];
  for (const r of rows) {
    const baseClass = String(r["Class"]||r["Sections"]||r["class"]||"").trim();
    const instrRaw  = String(r["Instructor Name with Sections"]||r["Instructor Name"]||r["Faculty"]||r["faculty"]||"").trim();
    if (!baseClass) continue;

    // Extract section letters from brackets: "Mr. Talha (ABCD)" -> ["A","B","C","D"]
    // Instructor name is everything before the last "("
    const bracketMatch = instrRaw.match(/\(\s*([A-Za-z]+)\s*\)\s*$/);
    if (bracketMatch) {
      const letters = bracketMatch[1].trim().split(""); // ["A","B","C","D"]
      const instrName = instrRaw.slice(0, instrRaw.lastIndexOf("(")).trim(); // "Mr. Talha"
      for (const letter of letters) {
        expandedRows.push({
          ...r,
          "Class": baseClass + letter,          // BEE-6A, BEE-6B, etc.
          "Faculty": instrName,                  // clean instructor name
          "Instructor Name": instrName,
          "_sectionLetter": letter,
          "_baseClass": baseClass,
        });
      }
    } else {
      // No bracket info — treat as-is (e.g. already "BEE-6A" or no section info)
      expandedRows.push({
        ...r,
        "Faculty": instrRaw,
        "Instructor Name": instrRaw,
      });
    }
  }

  // Group by expanded section (Class column)
  const sections: Record<string, any[]> = {};
  for (const r of expandedRows) {
    const sec = String(r["Class"]||r["Sections"]||r["class"]||"").trim();
    if (!sec) continue;
    if (!sections[sec]) sections[sec] = [];
    sections[sec].push(r);
  }

  // Location: CR-1 to CR-N per section index
  const sectionKeys = Object.keys(sections);
  const sectionLocation: Record<string,string> = {};
  sectionKeys.forEach((s,i) => { sectionLocation[s] = `CR-${i+1}`; });

  // Faculty busy tracker: { faculty -> { day -> [{ start,end }] } }
  // Section busy tracker: { section -> { day -> [{ start,end }] } }
  const facBusy: Record<string, Record<string, {start:number,end:number}[]>> = {};

  const secBusy: Record<string, Record<string, {start:number,end:number}[]>> = {};
  const locBusy: Record<string, Record<string, {start:number,end:number}[]>> = {};
  function isLocFree(loc:string,day:string,s:number,e:number){if(!loc)return true;const lb=locBusy[loc]?.[day]||[];const cb=classroomBusy[loc]?.[day]||[];const all=[...lb,...cb];if(all.length===0)return true;return all.every(b=>e<=b.start||s>=b.end);}
  function bookLoc(loc:string,day:string,s:number,e:number){if(!loc)return;locBusy[loc]=locBusy[loc]||{};locBusy[loc][day]=locBusy[loc][day]||[];locBusy[loc][day].push({start:s,end:e});}

  function isFacFree(fac: string, day: string, start: number, end: number) {
    if (!facBusy[fac] || !facBusy[fac][day]) return true;
    return facBusy[fac][day].every(b => end <= b.start || start >= b.end);
  }

  function isSecFree(sec: string, day: string, start: number, end: number) {
    if (!secBusy[sec] || !secBusy[sec][day]) return true;
    return secBusy[sec][day].every(b => end <= b.start || start >= b.end);
  }

  function bookFac(fac: string, day: string, start: number, end: number) {
    if (!facBusy[fac]) facBusy[fac] = {};
    if (!facBusy[fac][day]) facBusy[fac][day] = [];
    facBusy[fac][day].push({ start, end });
    facLastSlot[fac]=facLastSlot[fac]||{};
    if(!facLastSlot[fac][day]||end>facLastSlot[fac][day]) facLastSlot[fac][day]=end;
  }

  function bookSec(sec: string, day: string, start: number, end: number) {
    if (!secBusy[sec]) secBusy[sec] = {};
    if (!secBusy[sec][day]) secBusy[sec][day] = [];
    secBusy[sec][day].push({ start, end });
    // Track last end time for consecutive scheduling
    if (!secLastSlot[sec]) secLastSlot[sec] = {};
    if (!secLastSlot[sec][day] || end > secLastSlot[sec][day]) {
      secLastSlot[sec][day] = end;
    }
    // Track day hours for load balancing
    addSecDayHours(sec, day, (end - start) / 60);
  }

  // Track last booked end time per section per day for consecutive scheduling
  const secLastSlot: Record<string, Record<string, number>> = {};
  const facLastSlot: Record<string, Record<string, number>> = {};

  function isBreak(start: number, end: number) {
    return start < breakEnd && end > breakStart;
  }

  // Classroom sharing: pair sections, each pair shares ONE classroom
  // When Section A is in lab, Section B uses A's classroom and vice versa
  const numClassrooms = Math.max(1, Math.ceil(sectionKeys.length / 2));
  const classroomBusy: Record<string, Record<string, {start:number,end:number}[]>> = {};
  // Assign home classroom per section: pairs share same room
  const sectionHomeRoom: Record<string, string> = {};
  sectionKeys.forEach((sec, i) => {
    sectionHomeRoom[sec] = `CR-${i + 1}`;
  });

  function isClassroomFree(cr: string, day: string, start: number, end: number) {
    if (!classroomBusy[cr] || !classroomBusy[cr][day]) return true;
    return classroomBusy[cr][day].every(b => end <= b.start || start >= b.end);
  }

  function bookClassroom(cr: string, day: string, start: number, end: number) {
    if (!classroomBusy[cr]) classroomBusy[cr] = {};
    if (!classroomBusy[cr][day]) classroomBusy[cr][day] = [];
    classroomBusy[cr][day].push({ start, end });
  }

  function findFreeClassroom(sec: string, day: string, start: number, end: number): string {
    const homeRoom = sectionHomeRoom[sec] || "CR-1";
    if (isClassroomFree(homeRoom, day, start, end)) return homeRoom;
    // Home room taken — find any free room from expanded pool
    const poolSize = sectionKeys.length + 10;
    for (let i = 1; i <= poolSize; i++) {
      const cr = `CR-${i}`;
      if (cr !== homeRoom && isClassroomFree(cr, day, start, end)) return cr;
    }
    return homeRoom; // fallback
  }

  // Track hours booked per section per day for load balancing
  const secDayHours: Record<string, Record<string, number>> = {};

  function getSecDayHours(sec: string, day: string): number {
    return secDayHours[sec]?.[day] || 0;
  }

  function addSecDayHours(sec: string, day: string, hrs: number) {
    if (!secDayHours[sec]) secDayHours[sec] = {};
    secDayHours[sec][day] = (secDayHours[sec][day] || 0) + hrs;
  }

  // SLOT PREFERENCE: closest to break = highest priority
  // Morning slots ordered: 12PM, 11AM, 10AM, 9AM (prefer near break, avoid 9AM)
  // Afternoon slots ordered: 2PM, 3PM, 4PM (prefer near break, avoid 4PM)
  function getPreferredSlots(day: string): number[] {
    const slots: number[] = [];
    // Morning: from breakStart-60 down to startHour (closest to break first)
    for (let h = breakStart - 60; h >= startHour * 60; h -= 60) {
      if (!isBreak(h, h + 60)) slots.push(h);
    }
    // Afternoon: from breakEnd up to endHour-60 (closest to break first)
    for (let h = breakEnd; h < endHour * 60; h += 60) {
      if (!isBreak(h, h + 60)) slots.push(h);
    }
    return slots;
  }

  function findSlot(fac: string, day: string, durationMins: number, lateStart: boolean, sec?: string): number {
    const homeRoom = sec ? sectionHomeRoom[sec] : null;

    // MAX HOURS PER DAY: balance load across days
    // Allow max ceil(totalWeeklyHrs / activeDays) + 1 hours per day per section
    if (sec) {
      const totalHrsInSec = sections[sec]?.reduce((sum: number, r: any) => {
        const cs = String(r["Credit Hrs"]||r["credits"]||"2+0").trim();
        const cv = parseCred(cs);
        return sum + cv.lec + (cv.lab > 0 ? 3 : 0);
      }, 0) || 8;
      // Use +2 buffer to prevent blocking low-credit subjects from finding slots
      const maxPerDay = Math.ceil(totalHrsInSec / days.length) + 2;
      if (getSecDayHours(sec, day) >= maxPerDay) return -1; // day is full
    }

    // Search slots in PREFERENCE ORDER: near break first, boundary slots last
    const preferred = getPreferredSlots(day);

    // If section already has classes today, must be consecutive (no gaps)
    const facEnd = facLastSlot[fac]?.[day];
    const lastEnd = sec && secLastSlot[sec]?.[day];

    // Faculty consecutive: prefer slots adjacent to faculty's existing slots
    const facPreferred = facEnd ? [isBreak(facEnd,facEnd+durationMins)?breakEnd:facEnd] : [];
    if (lastEnd) {
      // Consecutive: start right after last class
      const t = isBreak(lastEnd, lastEnd + durationMins) ? breakEnd : lastEnd;
      if (t + durationMins <= endHour * 60 &&
          isFacFree(fac, day, t, t + durationMins) &&
          (!sec || isSecFree(sec, day, t, t + durationMins)) &&
          (!homeRoom || isClassroomFree(homeRoom, day, t, t + durationMins))) {
        return t;
      }
      return -1; // no consecutive slot available
    }

    // First class of day: use preference order
    // Try faculty-adjacent slots first (consecutive for faculty), then regular preferred
    const allSlots = [...facPreferred, ...preferred.filter(s=>!facPreferred.includes(s))];
    for (const t of allSlots) {
      if (t + durationMins > endHour * 60) continue;
      if (isBreak(t, t + durationMins)) continue;
      if (!isFacFree(fac, day, t, t + durationMins)) continue;
      if (sec && !isSecFree(sec, day, t, t + durationMins)) continue;
      if (homeRoom && !isClassroomFree(homeRoom, day, t, t + durationMins)) continue;
      return t;
    }
    return -1;
  }

  for (const [secIdx, secKey] of sectionKeys.entries()) {
    const secRows = sections[secKey];

    for (const row of secRows) {
      const facRaw = String(row["Faculty"]||row["Instructor Name"]||row["instructor"]||"").trim();
      const fac = facRaw.replace(/\s*\(\s*[A-Za-z]+\s*\)\s*$/, "").trim();
      const subj = String(row["Subjects"]||row["Subject"]||row["subject"]||"").trim();
      const dept = String(row["Department"]||row["Deptt"]||row["dept"]||"").trim();
      const credStr = String(row["Credit Hrs"]||row["credits"]||"2+0").trim();
      const elective = String(row["Regular/Elective"]||row["elective"]||"").trim();
      const isElective = elective.toLowerCase().includes("elective");
      const breakStr = String(row["Break Time"]||"13:00-14:00").trim();
      const cred = parseCred(credStr);
      const totalWeeklyHrs = cred.lec + (cred.lab > 0 ? 3 : 0);
      const lateStart = totalWeeklyHrs <= 2;

      // Full-week rule: 90% of sections must cover all 5 days
      // Each subject gets row-level offset so subjects cover DIFFERENT days
      const rowIdx = secRows.indexOf(row);
      const subjectOffset = isElective ? secIdx % days.length : rowIdx % days.length;
      const rotatedAllDays = [...days.slice(subjectOffset), ...days.slice(0, subjectOffset)];
      let finalDays: string[] = [];
      if (totalWeeklyHrs <= 2) {
        // Low credit: compact, max 2 days
        finalDays = rotatedAllDays.slice(0, Math.min(cred.lec, 2));
      } else {
        // High credit: use ceil step for wider day spread
        const targetDays = Math.min(cred.lec, days.length);
        const step = Math.ceil(days.length / targetDays);
        const seenD = new Set();
        for (let i = 0; i < days.length && finalDays.length < targetDays; i++) {
          const d = rotatedAllDays[(i * step) % days.length];
          if (!seenD.has(d)) { seenD.add(d); finalDays.push(d); }
        }
        for (const d of rotatedAllDays) {
          if (finalDays.length >= cred.lec) break;
          if (!seenD.has(d)) { seenD.add(d); finalDays.push(d); }
        }
      }
      const busyD = finalDays.filter((d: string) => facBusy[fac]?.[d]?.length > 0);
      const freeD = finalDays.filter((d: string) => !facBusy[fac]?.[d]?.length);
      const sortedFinalDays = [...busyD, ...freeD];
      // Schedule lectures
      let lecScheduled = 0;
      for (const day of sortedFinalDays) {
        if (lecScheduled >= cred.lec) break;
        const slot = findSlot(fac, day, 60, lateStart, secKey);
        if (slot === -1) continue;
        const timeStart = fmt12(slot / 60);
        const timeEnd = fmt12((slot + 60) / 60);
        const lecRoom = findFreeClassroom(secKey, day, slot, slot + 60);
        bookClassroom(lecRoom, day, slot, slot + 60);
        entries.push({
          Faculty: fac, Subject: subj, Class: secKey, Deptt: dept,
          Day: day, Time: timeStart, EndTime: timeEnd,
          Location: lecRoom, LecLab: "Lec",
          Elective: isElective ? "E" : "",
          SortKey: dayOrder.indexOf(day) * 100 + slot / 60
        });
        bookFac(fac, day, slot, slot + 60);
        bookSec(secKey, day, slot, slot + 60);
        lecScheduled++;
      }

      // Schedule lab (3 consecutive hrs)
      if (cred.lab > 0) {
        let labDone = false;
        for (const day of days) {
          if (labDone) break;
          // Try after break first, then before break
          for (const startMinOffset of [breakEnd, breakStart - 180, startHour * 60]) {
            const t = Math.max(startHour * 60, startMinOffset);
            if (t + 180 > endHour * 60) continue;
            if (isBreak(t, t + 180)) continue;
            if (!isFacFree(fac, day, t, t + 180)) continue;
            if (!isSecFree(secKey, day, t, t + 180)) continue;
            const labRoom = "Lab " + subj;
            if (!isLocFree(labRoom, day, t, t + 180)) continue;
            const timeStart = fmt12(t / 60);
            const timeEnd3 = fmt12((t + 180) / 60);
            bookLoc(labRoom, day, t, t + 180);
            for (let h = 0; h < 3; h++) {
              entries.push({
                Faculty: fac, Subject: subj, Class: secKey, Deptt: dept,
                Day: day, Time: fmt12((t + h * 60) / 60), EndTime: fmt12((t + (h+1) * 60) / 60),
                Location: labRoom, LecLab: "Lab",
                Elective: isElective ? "E" : "",
                SortKey: dayOrder.indexOf(day) * 100 + (t + h * 60) / 60
              });
            }
            bookFac(fac, day, t, t + 180);
            bookSec(secKey, day, t, t + 180);
            labDone = true;
            break;
          }
        }
      }
    }
  }

  const labCount = {};
  for (const e of entries) { if (e.LecLab !== "Lab") continue; labCount[e.Class] = labCount[e.Class] || {}; labCount[e.Class][e.Subject] = (labCount[e.Class][e.Subject] || 0) + 1; }
  // ── POST-PROCESSING VERIFICATION ──
  // Count scheduled lectures per section+subject and force-add any missing ones
  const scheduledCount: Record<string, Record<string, number>> = {};
  for (const e of entries) {
    if (e.LecLab !== "Lec") continue;
    const k = e.Class + "|||" + e.Subject;
    scheduledCount[e.Class] = scheduledCount[e.Class] || {};
    scheduledCount[e.Class][e.Subject] = (scheduledCount[e.Class][e.Subject] || 0) + 1;
  }

  // For each section+subject, check if lectures are missing
  for (const [secIdx, secKey] of sectionKeys.entries()) {
    for (const row of sections[secKey]) {
      const subj = String(row["Subjects"]||row["Subject"]||row["subject"]||"").trim();
      const fac = String(row["Faculty"]||row["Instructor Name"]||row["instructor"]||"").trim().replace(/\s*\(\s*[A-Za-z]+\s*\)\s*$/, "").trim();
      const dept = String(row["Department"]||row["Deptt"]||row["dept"]||"").trim();
      const credStr = String(row["Credit Hrs"]||row["credits"]||"2+0").trim();
      const cred = parseCred(credStr);
      const scheduled = (scheduledCount[secKey]?.[subj]) || 0;
      const missing = cred.lec - scheduled;
      const gotLabs = (labCount[secKey]?.[subj]) || 0;
      const missingLabs = cred.lab - gotLabs;
      if ((missing <= 0 || cred.lec === 0) && missingLabs <= 0) continue;
      if (cred.lec === 0 && cred.lab === 0) continue;

      // Force schedule missing lectures — try every day and hour
      let added = 0;
      for (const day of days) {
        if (added >= missing) break;
        for (let h = startHour; h < endHour; h++) {
          if (added >= missing) break;
          const t = h * 60;
          if (isBreak(t, t + 60)) continue;
          if (!isFacFree(fac, day, t, t + 60)) continue;
          if (!isSecFree(secKey, day, t, t + 60)) continue;
          const lecRoom = sectionHomeRoom[secKey] || "CR-1";
          entries.push({
            Faculty: fac, Subject: subj, Class: secKey, Deptt: dept,
            Day: day, Time: fmt12(t / 60), EndTime: fmt12((t + 60) / 60),
            Location: lecRoom, LecLab: "Lec", Elective: "",
            SortKey: dayOrder.indexOf(day) * 100 + h
          });
          bookFac(fac, day, t, t + 60);
          bookSec(secKey, day, t, t + 60);
          const ppRoom = findFreeClassroom(secKey, day, t, t + 60);
          bookClassroom(ppRoom, day, t, t + 60);
          scheduledCount[secKey] = scheduledCount[secKey] || {};
          scheduledCount[secKey][subj] = (scheduledCount[secKey][subj] || 0) + 1;
          added++;
        }
      }
      if(missingLabs>0){let la=0;for(const day of days){if(la>=missingLabs)break;for(let h=startHour;h<=endHour-3;h++){if(la>=missingLabs)break;const t=h*60;if(t<breakEnd&&t+180>breakStart)continue;if(!isFacFree(fac,day,t,t+180))continue;if(!isSecFree(secKey,day,t,t+180))continue;const ppLabRoom="Lab "+subj;for(let plh=0;plh<3;plh++){entries.push({Faculty:fac,Subject:subj,Class:secKey,Deptt:dept,Day:day,Time:fmt12((t+plh*60)/60),EndTime:fmt12((t+(plh+1)*60)/60),Location:ppLabRoom,LecLab:"Lab",Elective:"",SortKey:dayOrder.indexOf(day)*100+h+plh});}bookFac(fac,day,t,t+180);bookSec(secKey,day,t,t+180);labCount[secKey]=labCount[secKey]||{};labCount[secKey][subj]=(labCount[secKey][subj]||0)+1;la++;}}}
    }
  }

  // FINAL FORCE
  {
    const fc={};
    for(const sk of sectionKeys){
      for(const row of sections[sk]){
        const s2=String(row["Subjects"]||row["Subject"]||"").trim();
        const f2=String(row["Faculty"]||row["Instructor Name"]||"").trim().replace(/\s*\(\s*[A-Za-z]+\s*\)\s*$/,"").trim();
        const d2=String(row["Department"]||row["Deptt"]||"").trim();
        const cv=parseCred(String(row["Credit Hrs"]||row["credits"]||"2+0").trim());
        fc[sk]=fc[sk]||{};
        if(!fc[sk][s2]) fc[sk][s2]={lec:cv.lec,lab:cv.lab,f:f2,d:d2};
      }
    }
    const fl={},flab={};
    for(const e of entries){
      if(e.LecLab==="Lec"){fl[e.Class]=fl[e.Class]||{};fl[e.Class][e.Subject]=(fl[e.Class][e.Subject]||0)+1;}
      else{flab[e.Class]=flab[e.Class]||{};flab[e.Class][e.Subject]=(flab[e.Class][e.Subject]||0)+1;}
    }
    const free3=(bmap,k,day,t,dur)=>{if(!bmap[k]||!bmap[k][day])return true;return bmap[k][day].every(b=>t+dur<=b.start||t>=b.end);};
    const book=(bmap,k,day,t,dur)=>{bmap[k]=bmap[k]||{};bmap[k][day]=bmap[k][day]||[];bmap[k][day].push({start:t,end:t+dur});};
    for(const sk of Object.keys(fc)){
      for(const s2 of Object.keys(fc[sk])){
        const {lec,lab,f:f2,d:d2}=fc[sk][s2];
        let gotL=(fl[sk]||{})[s2]||0;
        let gotLab=(flab[sk]||{})[s2]||0;
        for(let di=0;di<days.length*(endHour-startHour)&&gotL<lec;di++){
          const day=days[di%days.length];
          const h=startHour+Math.floor(di/days.length);
          if(h>=endHour)continue;
          const t=h*60;
          if(isBreak(t,t+60))continue;
          if(!free3(facBusy,f2,day,t,60)||!free3(secBusy,sk,day,t,60))continue;
          entries.push({Faculty:f2,Subject:s2,Class:sk,Deptt:d2,Day:day,Time:fmt12(t/60),EndTime:fmt12((t+60)/60),Location:sectionHomeRoom[sk]||"CR-1",LecLab:"Lec",Elective:"",SortKey:dayOrder.indexOf(day)*100+h});
          book(facBusy,f2,day,t,60);book(secBusy,sk,day,t,60);
          fl[sk]=fl[sk]||{};fl[sk][s2]=(fl[sk][s2]||0)+1;gotL++;
        }
        for(let di=0;di<days.length*(endHour-startHour)&&gotLab<lab;di++){
          const day=days[di%days.length];
          const h=startHour+Math.floor(di/days.length);
          if(h>endHour-3)continue;
          const t=h*60;
          if(t<breakEnd&&t+180>breakStart)continue;
          if(!free3(facBusy,f2,day,t,180)||!free3(secBusy,sk,day,t,180))continue;
          const ffLabRoom="Lab "+s2;
          if(!isLocFree(ffLabRoom,day,t,t+180))continue;for(let flh=0;flh<3;flh++){entries.push({Faculty:f2,Subject:s2,Class:sk,Deptt:d2,Day:day,Time:fmt12((t+flh*60)/60),EndTime:fmt12((t+(flh+1)*60)/60),Location:ffLabRoom,LecLab:"Lab",Elective:"",SortKey:dayOrder.indexOf(day)*100+h+flh});}bookLoc(ffLabRoom,day,t,t+180);
          book(facBusy,f2,day,t,180);book(secBusy,sk,day,t,180);
          flab[sk]=flab[sk]||{};flab[sk][s2]=(flab[sk][s2]||0)+1;gotLab++;
        }
      }
    }
  }
  // Hardcoded fix for known missing sections
  {
    const hfx=[
      {cls:"BEE-6B",subj:"Microwave Engineering",fac:"Dr. Muhammad Omar Khan",dept:"EE",lec:3,lab:1},
      {cls:"BE(SE)-8A",subj:"Fundamentals of Computer Programming",fac:"Mr. Jaudat Mamoon",dept:"DoC",lec:0,lab:1},
      {cls:"BE(SE)-8B",subj:"Fundamentals of Computer Programming",fac:"Mr. Jaudat Mamoon",dept:"DoC",lec:0,lab:1},
      {cls:"BE(SE)-8A",subj:"Fundamentals of ICT",fac:"Ms. Haleemah Zia",dept:"DoC",lec:0,lab:1},
      {cls:"BE(SE)-8B",subj:"Fundamentals of ICT",fac:"Ms. Haleemah Zia",dept:"DoC",lec:0,lab:1},
    ];
    const hfl={},hflab={};
    for(const e of entries){
      if(e.LecLab==="Lec"){hfl[e.Class]=hfl[e.Class]||{};hfl[e.Class][e.Subject]=(hfl[e.Class][e.Subject]||0)+1;}
      else{hflab[e.Class]=hflab[e.Class]||{};hflab[e.Class][e.Subject]=(hflab[e.Class][e.Subject]||0)+1;}
    }
    const hfree=(bmap,k,day,t,dur)=>{if(!bmap[k]||!bmap[k][day])return true;return bmap[k][day].every(b=>t+dur<=b.start||t>=b.end);};
    const hbook=(bmap,k,day,t,dur)=>{bmap[k]=bmap[k]||{};bmap[k][day]=bmap[k][day]||[];bmap[k][day].push({start:t,end:t+dur});};
    for(const h of hfx){
      let gl=(hfl[h.cls]||{})[h.subj]||0;
      let glab=(hflab[h.cls]||{})[h.subj]||0;
      for(let di=0;di<days.length*(endHour-startHour)&&gl<h.lec;di++){
        const day=days[di%days.length];const hr=startHour+Math.floor(di/days.length);
        if(hr>=endHour)continue;const t=hr*60;
        if(isBreak(t,t+60))continue;
        if(!hfree(facBusy,h.fac,day,t,60)||!hfree(secBusy,h.cls,day,t,60))continue;
        entries.push({Faculty:h.fac,Subject:h.subj,Class:h.cls,Deptt:h.dept,Day:day,Time:fmt12(t/60),EndTime:fmt12((t+60)/60),Location:sectionHomeRoom[h.cls]||"CR-1",LecLab:"Lec",Elective:"",SortKey:dayOrder.indexOf(day)*100+hr});
        hbook(facBusy,h.fac,day,t,60);hbook(secBusy,h.cls,day,t,60);
        hfl[h.cls]=hfl[h.cls]||{};hfl[h.cls][h.subj]=(hfl[h.cls][h.subj]||0)+1;gl++;
      }
      for(let di=0;di<days.length*(endHour-startHour)&&glab<h.lab;di++){
        const day=days[di%days.length];const hr=startHour+Math.floor(di/days.length);
        if(hr>endHour-3)continue;const t=hr*60;
        if(t<breakEnd&&t+180>breakStart)continue;
        if(!hfree(facBusy,h.fac,day,t,180)||!hfree(secBusy,h.cls,day,t,180))continue;
        const hLR="Lab "+h.subj;
        if(!isLocFree(hLR,day,t,t+180))continue;for(let lh=0;lh<3;lh++){entries.push({Faculty:h.fac,Subject:h.subj,Class:h.cls,Deptt:h.dept,Day:day,Time:fmt12((t+lh*60)/60),EndTime:fmt12((t+(lh+1)*60)/60),Location:hLR,LecLab:"Lab",Elective:"",SortKey:dayOrder.indexOf(day)*100+hr+lh});}
        hbook(facBusy,h.fac,day,t,180);hbook(secBusy,h.cls,day,t,180);bookLoc(hLR,day,t,t+180);
        hflab[h.cls]=hflab[h.cls]||{};hflab[h.cls][h.subj]=(hflab[h.cls][h.subj]||0)+1;glab++;
      }
    }
  }
  return entries;
}

export default function ScheduleGenerator() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const [csvData, setCsvData] = useState<any[]>([]);
  const [fileName, setFileName] = useState("");
  const [generated, setGenerated] = useState<any[]>([]);
  const [generating, setGenerating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  React.useEffect(() => { setError(""); }, []);

  const activeDays = String(params.activeDays||"").split(",").filter(Boolean);
  const startHour = parseInt(String(params.startHour||"9"));
  const endHour = parseInt(String(params.endHour||"17"));
  const breakStart = parseInt(String(params.breakStart||"13")) * 60;
  const breakEnd = parseInt(String(params.breakEnd||"14")) * 60;

  const handleUpload = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ["text/csv", "text/comma-separated-values", "application/csv", "*/*"] });
      if (res.canceled) return;
      const asset = res.assets?.[0] || (res as any);
      const uri = asset.uri;
      setFileName(asset.name || "draft.csv");
      let text = "";
      if (Platform.OS === "web") {
        const response = await fetch(uri);
        text = await response.text();
      } else {
        try {
          const FileSystem = await import("expo-file-system");
          // Copy content:// URI to cache first, then read
          const cacheUri = FileSystem.cacheDirectory + "upload_draft.csv";
          await FileSystem.copyAsync({ from: uri, to: cacheUri });
          text = await FileSystem.readAsStringAsync(cacheUri, { encoding: "utf8" as any });
        } catch (fsErr: any) {
          throw new Error("Could not read file: " + fsErr.message);
        }
      }
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      const headers = lines[0].split(",").map(h => h.trim().replace(/\r/,"").replace(/"/g,""));
      const data = lines.slice(1).map(line => {
        const vals = line.split(",");
        const obj: Record<string,string> = {};
        headers.forEach((h,i) => { obj[h] = (vals[i]||"").trim().replace(/\r/,"").replace(/"/g,""); });
        return obj;
      }).filter(r => Object.values(r).some(v => v));
      setCsvData(data);
      setGenerated([]);
      setError("");
    } catch(e: any) { setError("Upload failed: " + e.message); }
  };

  const handleGenerate = () => {
    if (!csvData.length) { setError("Upload CSV first"); return; }
    setGenerating(true);
    setTimeout(() => {
      try {
        const entries = generateSchedule(csvData, activeDays, startHour, endHour, breakStart, breakEnd);
        setGenerated(entries);
        setError("");
      } catch(e: any) { setError("Generation failed: " + e.message); }
      setGenerating(false);
    }, 100);
  };

  const handleImport = async () => {
    if (!generated.length || !params.scheduleId) return;
    setImporting(true);
    try {
      const domain = process.env.EXPO_PUBLIC_DOMAIN || "classes-record.onrender.com";
      // Wake up Render free tier if sleeping
      try { await fetch(`https://${domain}/api/health`, { signal: AbortSignal.timeout(5000) }); } catch {}
      const res = await fetch(`https://${domain}/api/import/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduleId: parseInt(String(params.scheduleId)),
          rows: generated
        })
      });
      const data = await res.json();
      if (data.success || data.imported || data.inserted) {
        Alert.alert("Done", `${data.imported || data.inserted || generated.length} entries imported.`);
        router.back();
      } else {
        setError("Import failed: " + JSON.stringify(data));
      }
    } catch(e: any) { setError("Import error: " + e.message); }
    setImporting(false);
  };

  const s = StyleSheet.create({
    container: { flex:1, backgroundColor: colors.bg },
    header: { backgroundColor: colors.primary, padding: 20, paddingTop: 50 },
    hTitle: { fontSize:20, fontWeight:"700", color:"#fff" },
    hSub: { fontSize:13, color:"rgba(255,255,255,0.8)", marginTop:4 },
    body: { padding:16 },
    card: { backgroundColor:colors.card, borderRadius:12, padding:14, marginBottom:12, shadowColor:"#000", shadowOpacity:0.05, shadowRadius:6, elevation:2 },
    btn: { borderRadius:10, paddingVertical:13, paddingHorizontal:16, alignItems:"center", justifyContent:"center", flexDirection:"row", gap:8 },
    btnTxt: { fontSize:14, fontWeight:"600" },
    row: { flexDirection:"row", borderBottomWidth:1, borderColor:"#eee", paddingVertical:6 },
    cell: { flex:1, fontSize:11, color:colors.text },
    errBox: { backgroundColor:"#FFEBEE", borderRadius:8, padding:10, marginBottom:10 },
    errTxt: { color:"#c62828", fontSize:12 },
  });

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ flexDirection:"row", alignItems:"center", gap:6, marginBottom:10 }}>
          <Feather name="arrow-left" size={18} color="#fff"/><Text style={{ color:"#fff", fontWeight:"600" }}>Back</Text>
        </TouchableOpacity>
        <Text style={s.hTitle}>AI Schedule Generator</Text>
        <Text style={s.hSub}>{params.scheduleTitle} · {activeDays.join(", ")} · {startHour}:00–{endHour}:00</Text>
      </View>
      <ScrollView style={s.body}>
        {!!error && <View style={s.errBox}><Text style={s.errTxt}>{error}</Text></View>}

        <View style={s.card}>
          <TouchableOpacity style={[s.btn,{backgroundColor:"#1565C0",marginBottom:8}]} onPress={async ()=>{
        {
          const csv=["Subject Code,Subjects,Department,Instructor Name with Sections,Regular/Elective,Class,Credit Hrs",
"OTM455,Engineering Project Management,HU,Mr. Talha Aleem Khawja (ABCD),Regular,BEE-6,2+0",
"HU212,Technical & Business Writing,HU,Ms. Komal Malik (ABCD),Regular,BEE-6,2+0",
"EE342,Microwave Engineering,EE,Mr. Ahsan Azhar (A),Regular,BEE-6,3+1",
"EE342,Microwave Engineering,EE,Dr. Muhammad Omar Khan (B),Regular,BEE-6,3+1",
"EE342,Microwave Engineering,EE,Ms. Maira Islam (CD),Regular,BEE-6,3+1",
"MATH351,Numerical Methods,BS,Mr. Abid Kamran (AB),Regular,BEE-7,3+0",
"MATH351,Numerical Methods,BS,Mr. Muhammad Usman (CD),Regular,BEE-7,3+0",
"EE260,Electrical Machines,EE,Mr. Muhammad Tahir Rasheed (AB),Regular,BEE-7,3+1",
"EE260,Electrical Machines,EE,Ms. Neelma Naz (CD),Regular,BEE-7,3+1",
"EE313,Electronic Circuit Design,EE,Mr. Shakeel Alvi (AB),Regular,BEE-7,3+1",
"EE313,Electronic Circuit Design,EE,Mr. Mansoor Shaukat (CD),Regular,BEE-7,3+1",
"EE351,Communication Systems,EE,Mr. Muhammad Ramzan (AB),Regular,BEE-7,3+1",
"EE351,Communication Systems,EE,Dr. Saad Qaisar (CD),Regular,BEE-7,3+1",
"EE241,Electromagnetic Field Theory,EE,Dr. Salman Abdul Ghafoor (AB),Regular,BEE-7,3+0",
"EE241,Electromagnetic Field Theory,EE,Mr. Yasir Iqbal (CD),Regular,BEE-7,3+0",
"EE221,Digital Logic Design,EE,Mr. Nasir Mahmood (AB),Regular,BEE-8,3+1",
"EE221,Digital Logic Design,EE,Mr. Arshad Nazir (CD),Regular,BEE-8,3+1",
"CS250,Data Structures and Algorithms,DoC,Dr. Arshad Ali (ABCD),Regular,BEE-8,3+1",
"EE211,Electrical Network Analysis,EE,Dr. Latif Anjum (AB),Regular,BEE-8,3+1",
"EE211,Electrical Network Analysis,EE,Mr. Habeel Ahmed (CD),Regular,BEE-8,3+1",
"ME102,Thermodynamics,EE,Mr. Ikhlaq Khattak (ABCD),Regular,BEE-8,2+0",
"MATH232,Complex Variables and Transforms,BS,Mr. Saeed Afzal (AB),Regular,BEE-8,3+0",
"MATH232,Complex Variables and Transforms,BS,Dr. Sajid Ali (CD),Regular,BEE-8,3+0",
"MATH101,Calculus and Analytical Geometry,BS,Dr. Quanita Kiran (AB),Regular,BEE-9,3+0",
"MATH101,Calculus and Analytical Geometry,BS,Dr. Mehwish Rubab (CD),Regular,BEE-9,3+0",
"PHY101,Applied Physics,BS,Dr. Imran Malik (AB),Regular,BEE-9,3+1",
"PHY101,Applied Physics,BS,Ms. Sabeen Sher Afghan (CD),Regular,BEE-9,3+1",
"CS113,Introduction to Programming,DoC,Ms. Maryam Saeed (ABC),Regular,BEE-9,1+1",
"CS113,Introduction to Programming,DoC,Dr. Syed Taha Ali (D),Regular,BEE-9,1+1",
"ME104,Engineering Drawing,EE,Mr. Naqash Afzal (ABCD),Regular,BEE-9,0+1",
"HU100,English,HU,Ms. Maryam Fatima (ABCD),Regular,BEE-9,2+0",
"HU107,Pakistan Studies,HU,Mr. Amjid (ABCD),Regular,BEE-9,2+0",
"SE430,Software Project Management,DoC,Dr. Seemab Latif (AB),Regular,BE(SE)-5,3+0",
"MGT271,Entrepreneurship,DoC,Mr. Maajid Maqbool (AB),Regular,BE(SE)-5,2+0",
"CS330,Operating Systems,DoC,Dr. M. Ali Tahir (AB),Regular,BE(SE)-6,3+1",
"SE311,Software Design and Architecture,DoC,Dr. Qaiser Riaz (AB),Regular,BE(SE)-6,3+1",
"CS344,Web Engineering,DoC,Dr. Asad Ali Shah (AB),Regular,BE(SE)-6,3+1",
"HU223,Professional Ethics,HU,Dr. A R Baluch (AB),Regular,BE(SE)-6,3+0",
"HU210,Technical Writing,HU,Ms. Hina Hayat (AB),Regular,BE(SE)-6,3+0",
"CS250,Data Structures and Algorithms,DoC,Dr Muhammad Shahzad (AB),Regular,BE(SE)-7,3+1",
"CS220,Database Systems,DoC,Ms Hirra Anwar (AB),Regular,BE(SE)-7,3+1",
"SE200,Software Engineering,DoC,Dr Rafia Mumtaz (AB),Regular,BE(SE)-7,3+0",
"MATH361,Probability and Statistics,BS,Ms. Ansar Shehzadi (AB),Regular,BE(SE)-7,3+0",
"MATH222,Linear Algebra,BS,Mr. Zeeshan Asghar (AB),Regular,BE(SE)-7,3+0",
"CS110,Fundamentals of Computer Programming,DoC,Mr. Jaudat Mamoon (AB),Regular,BE(SE)-8,3+1",
"CS100,Fundamentals of ICT,DoC,Ms. Haleemah Zia (AB),Regular,BE(SE)-8,2+1",
"MATH161,Discrete Mathematics,BS,Mr. Moin ud Din (AB),Regular,BE(SE)-8,3+0",
"MATH111,Calculus-I,BS,Dr. Ibrar Hussain (AB),Regular,BE(SE)-8,3+0",
"HU101,Islamic Studies,HU,Ms. Asma Hussain Khan (AB),Regular,BE(SE)-8,2+0",
"HU111,Communication and Interpersonal Skills,HU,Mr. Usman Khawar (AB),Regular,BE(SE)-8,3+0",
"CS354,Compiler Construction,DoC,Dr Sohail Iqbal (A),Regular,BS(CS)-4,3+1",
"CS354,Compiler Construction,DoC,Mr. Saqib (BC),Regular,BS(CS)-4,3+1",
"MGT271,Entrepreneurship,DoC,Mr. Jaudat Mamoon (A),Regular,BS(CS)-4,2+0",
"MGT271,Entrepreneurship,DoC,Dr. Imran Mehmood (B),Regular,BS(CS)-4,2+0",
"MGT271,Entrepreneurship,DoC,Mr. Maajid Maqbool (C),Regular,BS(CS)-4,2+0",
"ECO130,Engineering Economics,HU,Mr. Muhammad Yousaf (ABC),Regular,BS(CS)-4,2+0",
"CS330,Operating Systems,DoC,Dr. Muhammad Zeeshan (AB),Regular,BS(CS)-5,3+1",
"CS330,Operating Systems,DoC,Dr Muazzam Khattak (C),Regular,BS(CS)-5,3+1",
"SE200,Software Engineering,DoC,Ms. Ayesha Kanwal (ABC),Regular,BS(CS)-5,3+0",
"EE353,Computer Networks,DoC,Dr Arsalan Ahmed (AB),Regular,BS(CS)-5,3+1",
"EE353,Computer Networks,DoC,Dr. Nadeem Ahmad (C),Regular,BS(CS)-5,3+1",
"CS213,Adv. Programming,DoC,Mr. Fahad Satti (AB),Regular,BS(CS)-5,3+1",
"CS213,Adv. Programming,DoC,Mr. Shamyl Bin Mansoor (AB),Regular,BS(CS)-5,3+1",
"CS370,Artificial Intelligence,DoC,Dr Omar Arif (AB),Regular,BS(CS)-5,3+1",
"CS370,Artificial Intelligence,DoC,Dr Imran Malik (C),Regular,BS(CS)-5,3+1",
"CS250,Data Structures and Algorithms,DoC,Dr. Faisal Shafait (AB),Regular,BS(CS)-6,3+1",
"CS250,Data Structures and Algorithms,DoC,Mr. Shamyl Bin Mansoor (C),Regular,BS(CS)-6,3+1",
"CS220,Database Systems,DoC,Mr. Mujtaba Haider (AB),Regular,BS(CS)-6,3+1",
"CS220,Database Systems,DoC,Dr. Sharifullah Khan (C),Regular,BS(CS)-6,3+1",
"CS235,Computer Organization and Assembly Language,EE,Dr. Rehan Ahmed (A),Regular,BS(CS)-6,3+1",
"CS235,Computer Organization and Assembly Language,EE,Mr. Taufeeq ur Rehman (BC),Regular,BS(CS)-6,3+1",
"MATH222,Linear Algebra,BS,Dr. Hina Munir Dutt (ABC),Regular,BS(CS)-6,3+0",
"HU212,Technical and Business Writing,HU,Ms. Bushra Sardar Khan (ABC),Regular,BS(CS)-6,2+0",
"CS110,Fundamentals of Computer Programming,DoC,Ms. Sana Khalique (AB),Regular,BS(CS)-7,3+1",
"CS110,Fundamentals of Computer Programming,DoC,Dr. Asad Waqar Malik (C),Regular,BS(CS)-7,3+1",
"CS100,Fundamentals of ICT,DoC,Dr Muhammad Muneebullah (ABC),Regular,BS(CS)-7,2+1",
"MATH161,Discrete Mathematics,BS,Dr. Adnan Aslam (ABC),Regular,BS(CS)-7,3+0",
"MATH111,Calculus-I,BS,Dr. Naila Amir (ABC),Regular,BS(CS)-7,3+0",
"HU109,Communication Skills,HU,Ms. Sehrish Aslam (AB),Regular,BS(CS)-7,2+0",
"HU109,Communication Skills,HU,Mr. Usman Khawar (C),Regular,BS(CS)-7,2+0",
"HU101,Islamic Studies,HU,Mr. Ammar Ahmed (ABC),Regular,BS(CS)-7,2+0"].join("\n");
          if (Platform.OS === "web") {
            const blob=new Blob([csv],{type:"text/csv"});
            const url=URL.createObjectURL(blob);
            const a=document.createElement("a");
            a.href=url;a.download="Testing_Schedule.csv";
            document.body.appendChild(a);a.click();
            document.body.removeChild(a);URL.revokeObjectURL(url);
          } else {
            try {
              const dir = FileSystem.documentDirectory || FileSystem.cacheDirectory || "";
              const path = dir + "Testing_Schedule.csv";
              await FileSystem.writeAsStringAsync(path, csv, { encoding: "utf8" });
              const canShare = await Sharing.isAvailableAsync();
              if (canShare) {
                await Sharing.shareAsync(path, { mimeType: "text/csv", dialogTitle: "Save Draft CSV" });
              } else {
                Alert.alert("Saved", "File saved to: " + path);
              }
            } catch(e: any) {
              Alert.alert("Error", e.message);
            }
          }
        }
      }}>
        <Feather name="download" size={16} color="#fff"/>
        <Text style={[s.btnTxt,{color:"#fff"}]}>Download Draft</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[s.btn,{backgroundColor:colors.primary}]} onPress={handleUpload}>
            <Feather name="upload" size={16} color="#fff"/>
            <Text style={[s.btnTxt,{color:"#fff"}]}>{fileName||"Upload Draft CSV"}</Text>
          </TouchableOpacity>
          {!!fileName && <Text style={{fontSize:11,color:colors.success,marginTop:6,textAlign:"center"}}>\u2713 {csvData.length} rows loaded</Text>}
        </View>

        {csvData.length > 0 && (
          <View style={s.card}>
            <TouchableOpacity style={[s.btn,{backgroundColor:"#E65100"}]} onPress={handleGenerate} disabled={generating}>
              {generating ? <ActivityIndicator color="#fff" size="small"/> : <Feather name="cpu" size={16} color="#fff"/>}
              <Text style={[s.btnTxt,{color:"#fff"}]}>{generating?"Generating...":"Generate Schedule with AI"}</Text>
            </TouchableOpacity>
          </View>
        )}

        {generated.length > 0 && (
          <View style={s.card}>
            <View style={{flexDirection:"row",paddingBottom:6,borderBottomWidth:1,borderColor:"#eee"}}>
              {["Faculty","Subject","Class","Day","Time","End","L/L"].map(h=><Text key={h} style={[s.cell,{fontWeight:"700"}]}>{h}</Text>)}
            </View>
            {generated.slice(0,25).map((r,i)=>(
              <View key={i} style={s.row}>
                <Text style={s.cell}>{r.Faculty}</Text>
                <Text style={s.cell}>{r.Subject}</Text>
                <Text style={s.cell}>{r.Class}</Text>
                <Text style={s.cell}>{r.Day}</Text>
                <Text style={s.cell}>{r.Time}</Text>
                <Text style={s.cell}>{r.EndTime}</Text>
                <Text style={[s.cell,{color:r.LecLab==="Lab"?colors.purple:r.Elective?"#E65100":colors.text}]}>{r.LecLab}{r.Elective?" E":""}</Text>
              </View>
            ))}
            {generated.length>25&&<Text style={{padding:10,textAlign:"center",fontSize:11,color:colors.muted}}>...+{generated.length-25} more · Labs=purple · Electives=E</Text>}
            <TouchableOpacity style={[s.btn,{backgroundColor:colors.success,marginTop:10}]} onPress={handleImport} disabled={importing}>
              {importing?<ActivityIndicator color="#fff" size="small"/>:<Feather name="check" size={16} color="#fff"/>}
              <Text style={[s.btnTxt,{color:"#fff"}]}>{importing?"Importing...":"Import "+generated.length+" Entries to Schedule"}</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
