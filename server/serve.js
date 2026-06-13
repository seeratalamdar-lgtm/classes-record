/**
 * Combined API + static file server for Classes Record app.
 * PostgreSQL version - matches backup.sql schema exactly.
 * Updated: May 9, 2026 - Fixed sample download, date formatting, field mapping, sequences
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");
const crypto = require("crypto");

// Email transporter
const mailTransporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER || "noreply.schoolcollege.online@gmail.com",
    pass: (process.env.GMAIL_PASS || "tzpcbplxcyefworb").replace(/\s/g, "")
  }
});

async function sendCredentialEmail({ to, name, username, password, role, scheduleName }) {
  if (!to || !to.includes("@")) return { skipped: true };
  try {
    await mailTransporter.sendMail({
      from: `"schoolcollege.online" <${process.env.GMAIL_USER || "noreply.schoolcollege.online@gmail.com"}>`,
      to,
      subject: `Your ${role} Login Credentials — ${scheduleName}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#f5f7fa;padding:30px;border-radius:12px;">
          <div style="background:#1565C0;padding:20px;border-radius:10px;text-align:center;margin-bottom:24px;">
            <h1 style="color:#fff;margin:0;font-size:22px;">schoolcollege.online</h1>
            <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;">Paperless · Errorless · Always Online</p>
          </div>
          <h2 style="color:#0D47A1;margin:0 0 8px;">Hello, ${name}!</h2>
          <p style="color:#444;margin:0 0 20px;">Your ${role} login credentials for <strong>${scheduleName}</strong> have been created.</p>
          <div style="background:#fff;border-radius:10px;padding:20px;border:1px solid #E3F2FD;margin-bottom:20px;">
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="padding:10px;color:#666;font-size:14px;">🌐 Website</td><td style="padding:10px;font-weight:bold;color:#1565C0;">schoolcollege.online</td></tr>
              <tr style="background:#F8FAFC;"><td style="padding:10px;color:#666;font-size:14px;">👤 Username</td><td style="padding:10px;font-weight:bold;font-size:16px;color:#0D47A1;">${username}</td></tr>
              <tr><td style="padding:10px;color:#666;font-size:14px;">🔒 Password</td><td style="padding:10px;font-weight:bold;font-size:16px;color:#0D47A1;">${password}</td></tr>
            </table>
          </div>
          <p style="color:#666;font-size:13px;">Please keep your credentials safe and do not share them with others. You can change your password after signing in.</p>
          <div style="text-align:center;margin-top:24px;">
            <a href="https://schoolcollege.online" style="background:#1565C0;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:bold;">Sign In Now</a>
          </div>
          <p style="color:#aaa;font-size:11px;text-align:center;margin-top:24px;">This is an automated message from schoolcollege.online. Please do not reply.</p>
        </div>
      `
    });
    return { sent: true };
  } catch(e) {
    console.error("Email error:", e.message);
    return { error: e.message };
  }
}
const { Pool } = require("pg");

const db = new Pool({ connectionString: process.env.DATABASE_URL });

// ===== Auth tokens (HMAC-signed, stateless) =====
const AUTH_SECRET = process.env.AUTH_SECRET || "dev-insecure-secret-change-me";
function b64url(buf) { return Buffer.from(buf).toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,""); }
function signToken(payload, days) {
  const body = { ...payload, exp: Date.now() + (days || 30) * 24 * 3600 * 1000 };
  const p = b64url(JSON.stringify(body));
  const sig = b64url(crypto.createHmac("sha256", AUTH_SECRET).update(p).digest());
  return p + "." + sig;
}
function verifyTokenStr(token) {
  if (!token || typeof token !== "string" || token.indexOf(".") < 0) return null;
  const [p, sig] = token.split(".");
  const expect = b64url(crypto.createHmac("sha256", AUTH_SECRET).update(p).digest());
  if (sig !== expect) return null;
  let body; try { body = JSON.parse(Buffer.from(p.replace(/-/g,"+").replace(/_/g,"/"), "base64").toString()); } catch { return null; }
  if (!body || !body.exp || body.exp < Date.now()) return null;
  return body;
}
// reads Authorization: Bearer <token> from a request, returns payload or null
function authOf(req) {
  const h = (req.headers["authorization"] || req.headers["Authorization"] || "");
  const m = /^Bearer\s+(.+)$/i.exec(String(h));
  return m ? verifyTokenStr(m[1]) : null;
}

const STATIC_ROOT = path.resolve(__dirname, "..", "static-build");
const TEMPLATE_PATH = path.resolve(__dirname, "templates", "landing-page.html");
const basePath = (process.env.BASE_PATH || "/").replace(/\/+$/, "");
const ADMIN_PASSWORD = "Administr@r@123";
const ADMIN_EMAIL = "alamdar.hussain@seecs.edu.pk";
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const otpStore = {};
async function sendOtpEmail(otp) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + RESEND_API_KEY },
    body: JSON.stringify({
      from: "Classes Record <onboarding@resend.dev>",
      to: [ADMIN_EMAIL],
      subject: "Admin Login OTP - Classes Record",
      html: '<div style="font-family:sans-serif;padding:24px;max-width:400px"><h2 style="color:#1565C0">Classes Record Admin OTP</h2><p>Your one-time login code:</p><div style="font-size:42px;font-weight:bold;letter-spacing:12px;color:#1565C0;background:#E3F2FD;padding:20px;border-radius:8px;text-align:center">' + otp + '</div><p style="color:#666;font-size:13px;margin-top:16px">Expires in <b>5 minutes</b>. Do not share.</p></div>'
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Resend API error");
}
const ADMIN_USERNAME = "patoprincipalseecs@gmail.com";

// MIME types
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif":  "image/gif",
  ".svg":  "image/svg+xml",
  ".ico":  "image/x-icon",
  ".woff": "font/woff",
  ".woff2":"font/woff2",
  ".ttf":  "font/ttf",
  ".otf":  "font/otf",
  ".map":  "application/json",
  ".csv":  "text/csv; charset=utf-8",
};

// Helpers
function json(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

function cors(res) {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type,x-admin-password,x-requested-with");
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { reject(new Error("Invalid JSON")); }
    });
    req.on("error", reject);
  });
}

function requireAdmin(req, res) {
  console.log("Admin check - received:", req.headers["x-admin-password"], "expected:", ADMIN_PASSWORD);
  if (req.headers["x-admin-password"] !== ADMIN_PASSWORD) {
    json(res, 401, { success: false, message: "Unauthorized" });
    return false;
  }
  return true;
}

function formatDate(dateVal) {
  if (!dateVal) return "";
  if (typeof dateVal === "string") return dateVal.split("T")[0];
  try { return dateVal.toISOString().split("T")[0]; }
  catch { return ""; }
}

function timeToHour(t) {
  if (!t) return 9;
  const m = t.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!m) return 9;
  let h = parseInt(m[1]);
  const ap = m[3].toUpperCase();
  if (ap === 'PM' && h !== 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return h;
}

function hourLabel(h) {
  if (h < 0 || h > 23) return '09:00 AM';
  const t12 = (h % 12) || 12;
  const ap = h >= 12 ? 'PM' : 'AM';
  return (t12 < 10 ? '0' : '') + t12 + ':00 ' + ap;
}

// Route handler
async function handleApi(method, pathname, req, res) {
  const reqUrl = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  const isMultipart = (req.headers["content-type"]||"").includes("multipart/form-data");
  const isRatesImport = pathname === "/api/finance/rates/import";
  const body = (method === "POST" || method === "PATCH") && !isMultipart && !isRatesImport ? await readBody(req) : {};

  if (method === "OPTIONS") { cors(res); res.writeHead(204); res.end(); return; }
  cors(res);

  // ========== AUTH ROUTES ==========

  // ========== FINANCE AUTH ROUTES ==========

  // POST /api/finance/auth/set-pin  (My Schedule user sets their finance PIN)
  if (method === "POST" && pathname === "/api/finance/auth/set-pin") {
    const { username, password, financePin } = body;
    if (!username || !password || !financePin) return json(res, 400, { success: false, message: "username, password and financePin required" });
    if (financePin.length < 4) return json(res, 400, { success: false, message: "Finance PIN must be at least 4 characters" });
    try {
      const r = await db.query("SELECT * FROM public.users WHERE username=$1 AND password=$2", [username.trim(), password.trim()]);
      if (!r.rows.length) return json(res, 200, { success: false, message: "Invalid username or password" });
      await db.query("UPDATE public.users SET finance_pin=$1 WHERE username=$2", [financePin.trim(), username.trim()]);
      return json(res, 200, { success: true, message: "Finance PIN set successfully" });
    } catch(e) { return json(res, 500, { success: false, message: String(e) }); }
  }

  // POST /api/finance/auth/login  (Finance login: username + finance_pin only)
  if (method === "POST" && pathname === "/api/finance/auth/login") {
    const { username, financePin } = body;
    if (!username || !financePin) return json(res, 400, { success: false, message: "Username and Finance PIN required" });
    try {
      const r = await db.query("SELECT * FROM public.users WHERE username=$1", [username.trim()]);
      if (!r.rows.length) return json(res, 200, { success: false, message: "Username not found" });
      const user = r.rows[0];
      if (!user.finance_pin || user.finance_pin.trim() === "") return json(res, 200, { success: false, message: "No Finance PIN set. Ask the schedule owner to set a Finance PIN from My Schedules → Finance PIN." });
      if (user.finance_pin.trim() !== financePin.trim()) return json(res, 200, { success: false, message: "Incorrect Finance PIN" });
      return json(res, 200, { success: true, user: username.trim(), message: "Finance login successful", token: signToken({ username: username.trim(), role: "finance" }) });
    } catch(e) { return json(res, 500, { success: false, message: String(e) }); }
  }

  // ========== FINANCE DATA ROUTES ==========

  if (method === "GET" && pathname === "/api/finance/schedules") {
    const username = reqUrl.searchParams.get("username");
    try {
      const r = username
        ? await db.query("SELECT id, name, start_date, end_date FROM public.schedules WHERE user_id=$1 ORDER BY id DESC", [username])
        : await db.query("SELECT id, name, start_date, end_date FROM public.schedules ORDER BY id DESC");
      return json(res, 200, r.rows.map(s => ({ id: s.id, name: s.name, startDate: s.start_date, endDate: s.end_date })));
    } catch(e) { return json(res, 200, []); }
  }

  // GET /api/personnel/roster?scheduleId=&type=faculty|staff — merged list with contact fields
  if (method === "GET" && pathname === "/api/personnel/roster") {
    const sid = parseInt(reqUrl.searchParams.get("scheduleId") || "0");
    const type = reqUrl.searchParams.get("type") || "faculty";
    try {
      const people = {};
      if (type === "faculty") {
        const sch = await db.query("SELECT DISTINCT faculty AS name FROM public.weekly_schedule WHERE schedule_id=$1 AND faculty != '_locations_' AND (type IS NULL OR type='') ORDER BY faculty", [sid]);
        sch.rows.forEach(r => { if (r.name) people[r.name] = { name: r.name, email: "", whatsapp: "", inSchedule: true }; });
        const fin = await db.query("SELECT name, COALESCE(email,'') AS email, COALESCE(whatsapp,'') AS whatsapp FROM public.finance_faculty WHERE schedule_id=$1", [sid]);
        fin.rows.forEach(r => { people[r.name] = { name: r.name, email: r.email, whatsapp: r.whatsapp, inSchedule: !!people[r.name] }; });
      } else if (type === "student") {
        const stu = await db.query("SELECT id, roll_no, name, COALESCE(email,'') AS email, COALESCE(whatsapp,'') AS whatsapp, COALESCE(class_name,'') AS class_name FROM public.students WHERE schedule_id=$1 ORDER BY class_name, roll_no", [sid]);
        return json(res, 200, { success: true, people: stu.rows.map(r => ({ id: r.id, rollNo: r.roll_no, name: r.name || "", email: r.email, whatsapp: r.whatsapp, className: r.class_name })) });
      } else {
        const st = await db.query("SELECT name, COALESCE(email,'') AS email, COALESCE(whatsapp,'') AS whatsapp FROM public.support_staff WHERE schedule_id=$1 ORDER BY name", [sid]);
        st.rows.forEach(r => { people[r.name] = { name: r.name, email: r.email, whatsapp: r.whatsapp, inSchedule: true }; });
      }
      const list = Object.values(people).sort((a, b) => a.name.localeCompare(b.name));
      return json(res, 200, { success: true, people: list });
    } catch (e) { return json(res, 500, { error: String(e) }); }
  }

  // POST /api/personnel/student-update — edit a student by id (roll_no is identity, safe to rename display name)
  if (method === "POST" && pathname === "/api/personnel/student-update") {
    const { id, name, email, whatsapp } = body;
    if (!id) return json(res, 400, { error: "id required" });
    const wd = String(whatsapp || "").replace(/[^0-9]/g, "");
    const wa = !wd ? "" : (wd.length === 11 && wd.startsWith("0")) ? "+92" + wd.slice(1) : wd.startsWith("92") ? "+" + wd : (wd.length === 10 && wd.startsWith("3")) ? "+92" + wd : "+" + wd;
    try {
      await db.query("UPDATE public.students SET name=$1, email=$2, whatsapp=CASE WHEN $3<>'' THEN $3 ELSE whatsapp END WHERE id=$4", [String(name || "").trim(), email || "", wa, parseInt(id)]);
      return json(res, 200, { success: true });
    } catch (e) { return json(res, 500, { error: String(e) }); }
  }

  // POST /api/personnel/update — edit one person's name/email/whatsapp (rename cascades)
  if (method === "POST" && pathname === "/api/personnel/update") {
    const { scheduleId, type, oldName, name, email, whatsapp } = body;
    const sid = parseInt(scheduleId || "0");
    if (!sid || !oldName || !name) return json(res, 400, { error: "scheduleId, oldName, name required" });
    const wd = String(whatsapp || "").replace(/[^0-9]/g, "");
    const wa = !wd ? "" : (wd.length === 11 && wd.startsWith("0")) ? "+92" + wd.slice(1) : wd.startsWith("92") ? "+" + wd : (wd.length === 10 && wd.startsWith("3")) ? "+92" + wd : "+" + wd;
    try {
      const tbl = type === "staff" ? "support_staff" : "finance_faculty";
      // upsert the contact row under the (possibly new) name
      await db.query("INSERT INTO public." + tbl + " (schedule_id, name, email, whatsapp) VALUES ($1,$2,$3,$4) ON CONFLICT (schedule_id, name) DO UPDATE SET email=$3, whatsapp=CASE WHEN $4<>'' THEN $4 ELSE public." + tbl + ".whatsapp END", [sid, name, email || "", wa]);
      if (oldName !== name) {
        // rename cascade across all tables that key on the name
        if (type !== "staff") {
          await db.query("UPDATE public.weekly_schedule SET faculty=$1 WHERE schedule_id=$2 AND faculty=$3", [name, sid, oldName]);
        }
        await db.query("UPDATE public.finance_payments SET person_name=$1 WHERE schedule_id=$2 AND person_type=$3 AND person_name=$4", [name, sid, (type === "staff" ? "staff" : "faculty"), oldName]);
        await db.query("UPDATE public.finance_rates SET person_id=$1, label=$1 WHERE schedule_id=$2 AND person_type=$3 AND (person_id=$4 OR label=$4)", [name, sid, (type === "staff" ? "staff" : "faculty"), oldName]);
        // remove the now-duplicate old contact row
        await db.query("DELETE FROM public." + tbl + " WHERE schedule_id=$1 AND name=$2", [sid, oldName]);
      }
      return json(res, 200, { success: true });
    } catch (e) { return json(res, 500, { error: String(e) }); }
  }

  if (method === "GET" && pathname === "/api/finance/persons") {
    const scheduleId = reqUrl.searchParams.get("scheduleId");
    const personType = reqUrl.searchParams.get("personType");
    if (!scheduleId || !personType) return json(res, 200, []);
    try {
      let rows = [];
      if (personType === "student") {
        const r = await db.query("SELECT roll_no, name FROM public.students WHERE schedule_id=$1 ORDER BY roll_no", [parseInt(scheduleId)]);
        rows = r.rows.map((x) => ({ personId: x.roll_no, personName: `${x.name} (${x.roll_no})` }));
      } else if (personType === "faculty") {
        const r = await db.query("SELECT DISTINCT faculty FROM public.weekly_schedule WHERE schedule_id=$1 AND faculty != '_locations_' AND (type IS NULL OR type='') ORDER BY faculty", [parseInt(scheduleId)]);
        rows = r.rows.filter(x => x.faculty).map((x) => ({ personId: x.faculty, personName: x.faculty }));
      } else if (personType === "staff") {
        const r = await db.query("SELECT id, name FROM public.support_staff WHERE schedule_id=$1 AND (active_to IS NULL OR active_to > TO_CHAR(NOW(), 'YYYY-MM')) ORDER BY name", [parseInt(scheduleId)]);
        rows = r.rows.map((x) => ({ personId: String(x.id), personName: x.name }));
      }
      return json(res, 200, rows);
    } catch(e) { return json(res, 200, []); }
  }

  if (method === "GET" && pathname === "/api/finance/payments") {
    const scheduleId = reqUrl.searchParams.get("scheduleId");
    const personType = reqUrl.searchParams.get("personType");
    const period = reqUrl.searchParams.get("period");
    if (!scheduleId || !personType || !period) return json(res, 200, []);
    try {
      const r = await db.query(
        "SELECT id, person_type, person_name, schedule_id, period, amount, COALESCE(paid_amount,0) as paid_amount, status, note FROM public.finance_payments WHERE schedule_id=$1 AND person_type=$2 AND period=$3 ORDER BY person_name",
        [parseInt(scheduleId), personType, period]
      );
      return json(res, 200, r.rows.map(p => ({ id: p.id, personType: p.person_type, personName: p.person_name, personId: p.person_name, scheduleId: p.schedule_id, period: p.period, amount: parseFloat(p.amount)||0, paidAmount: parseFloat(p.paid_amount)||0, status: p.status, note: p.note||"", notes: p.note||"" })));
    } catch(e) { return json(res, 200, []); }
  }

  // POST /api/finance/rates/import - bulk upload rates from CSV/Excel
  if (method === "POST" && pathname === "/api/finance/rates/import") {
    const scheduleId = reqUrl.searchParams.get("scheduleId");
    const personType = reqUrl.searchParams.get("personType");
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const buffer = Buffer.concat(chunks);
      // Extract CSV from multipart or raw
      let text = "";
      const ct = req.headers["content-type"] || "";
      if (ct.includes("multipart/form-data")) {
        const boundary = ct.split("boundary=")[1]?.trim();
        if (boundary) {
          const raw = buffer.toString("binary");
          const parts = raw.split("--" + boundary);
          for (const part of parts) {
            if (part.includes("filename=") || part.includes("name=")) {
              const bodyStart = part.indexOf("\r\n\r\n");
              if (bodyStart !== -1) {
                text = part.slice(bodyStart + 4).replace(/\r\n--.*$/s, "").trim();
                break;
              }
            }
          }
        }
      } else {
        text = buffer.toString("utf-8");
      }
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) return json(res, 400, { error: "Empty file" });
      const header = lines[0].split(",").map(h => h.replace(/"/g, "").trim().toLowerCase());
      const nameIdx = header.findIndex(h => h.includes("name") || h.includes("id"));
      const feeIdx = header.findIndex(h => h.includes("fee") || h.includes("pay") || h.includes("rate") || h.includes("amount"));
      if (nameIdx === -1 || feeIdx === -1) return json(res, 400, { error: "CSV must have Name/ID and Fee/Pay columns" });
      let saved = 0, skipped = 0;
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",").map(c => c.replace(/"/g, "").trim());
        const personName = cols[nameIdx];
        const amount = parseFloat(cols[feeIdx]) || 0;
        if (!personName) { skipped++; continue; }
        // Extract personId from "Name (ID)" format
        const match = personName.match(/\(([^)]+)\)$/);
        const personId = match ? match[1] : personName;
        try {
          const sid = scheduleId ? parseInt(scheduleId) : null;
          // Staff members come from HR Portal - only update rates
          // Save rate
          if (sid) {
            await db.query(
              `INSERT INTO public.finance_rates (schedule_id, person_type, person_id, label, rate) VALUES ($1,$2,$3,$3,$4) ON CONFLICT ON CONSTRAINT finance_rates_person_type_person_id_schedule_id_key DO UPDATE SET rate=$4, label=$3`,
              [sid, personType, personId, amount]
            );
          } else {
            await db.query(
              `INSERT INTO public.finance_rates (person_type, person_id, label, rate) VALUES ($1,$2,$2,$3) ON CONFLICT (person_type, person_id) DO UPDATE SET rate=$3, label=$2`,
              [personType, personId, amount]
            );
          }
          saved++;
        } catch(e) { console.error('SKIP ERR:', personId, amount, e.message); skipped++; }
      }
      return json(res, 200, { success: true, saved, skipped });
    } catch(e) { return json(res, 500, { error: String(e) }); }
  }

  // POST /api/finance/persons - add new person WEF a month
  // ========== FACULTY PORTAL ROUTES ==========

  if (method === "POST" && pathname === "/api/faculty-portal/login") {
    const { username, password } = body;
    if (!username || !password) return json(res, 400, { success: false, message: "Username and password required" });
    try {
      const r = await db.query(
        `SELECT fa.id, fa.schedule_id, fa.faculty_name, fa.username, fa.password,
                s.name as schedule_name, s.start_date, s.end_date
         FROM public.faculty_accounts fa
         JOIN public.schedules s ON s.id = fa.schedule_id
         WHERE fa.username=$1`,
        [username.trim()]
      );
      if (!r.rows.length) return json(res, 200, { success: false, message: "Username not found" });
      const account = r.rows[0];
      if (account.password !== password.trim()) return json(res, 200, { success: false, message: "Incorrect password" });
      const sessions = r.rows.map(a => ({
        id: a.id, scheduleId: a.schedule_id, scheduleName: a.schedule_name,
        scheduleTitle: a.schedule_name,
        facultyName: a.faculty_name, username: a.username,
        startDate: a.start_date ? new Date(a.start_date).toISOString() : null,
        endDate: a.end_date ? new Date(a.end_date).toISOString() : null
      }));
      const token = signToken({ role: "faculty", facultyName: account.faculty_name, username: account.username, scheduleIds: sessions.map(x => x.scheduleId) });
      return json(res, 200, { success: true, sessions, token });
    } catch(e) { return json(res, 500, { success: false, message: String(e) }); }
  }

  if (method === "POST" && pathname === "/api/faculty-portal/change-password") {
    const { username, currentPassword, newPassword } = body;
    try {
      const r = await db.query("SELECT id, password FROM public.faculty_accounts WHERE username=$1 LIMIT 1", [username]);
      if (!r.rows.length) return json(res, 200, { success: false, message: "Account not found" });
      if (r.rows[0].password !== currentPassword) return json(res, 200, { success: false, message: "Current password incorrect" });
      await db.query("UPDATE public.faculty_accounts SET password=$1 WHERE username=$2", [newPassword, username]);
      return json(res, 200, { success: true });
    } catch(e) { return json(res, 500, { success: false, message: String(e) }); }
  }

  // ========== FACULTY ACCESS ROUTES ==========

  // GET /api/faculty-access
  if (method === "GET" && pathname === "/api/faculty-access") {
    const scheduleId = reqUrl.searchParams.get("scheduleId");
    if (!scheduleId) return json(res, 200, []);
    try {
      const r = await db.query(
        "SELECT id, schedule_id, faculty_name, username, password, email, created_at FROM public.faculty_accounts WHERE schedule_id=$1 ORDER BY faculty_name",
        [parseInt(scheduleId)]
      );
      return json(res, 200, r.rows.map(a => ({
        id: a.id, scheduleId: a.schedule_id, facultyName: a.faculty_name,
        username: a.username, password: a.password, email: a.email||"",
        createdAt: a.created_at
      })));
    } catch(e) { return json(res, 200, []); }
  }

  // POST /api/faculty-access/generate
  if (method === "POST" && pathname === "/api/faculty-access/generate") {
    const { scheduleId } = body;
    if (!scheduleId) return json(res, 400, { error: "scheduleId required" });
    try {
      // Get all faculty from weekly_schedule
      const faculty = await db.query(
        "SELECT DISTINCT faculty FROM public.weekly_schedule WHERE schedule_id=$1 AND faculty != '_locations_' AND (type IS NULL OR type='') ORDER BY faculty",
        [parseInt(scheduleId)]
      );
      let created = 0;
      for (const f of faculty.rows.filter(r => r.faculty)) {
        const name = f.faculty;
        // Check if already exists
        const existing = await db.query("SELECT id FROM public.faculty_accounts WHERE schedule_id=$1 AND faculty_name=$2", [parseInt(scheduleId), name]);
        if (existing.rows.length > 0) continue;
        // Generate username and password
        const nameParts = name.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ').filter(Boolean);
        const username = (nameParts[nameParts.length-1] || 'faculty') + Math.floor(Math.random()*900+100);
        const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
        const password = Array.from({length:8}, () => chars[Math.floor(Math.random()*chars.length)]).join('');
        await db.query(
          "INSERT INTO public.faculty_accounts (schedule_id, faculty_name, username, password, email) SELECT $1,$2,$3,$4,'' WHERE NOT EXISTS (SELECT 1 FROM public.faculty_accounts WHERE schedule_id=$1 AND faculty_name=$2)",
          [parseInt(scheduleId), name, username, password]
        );
        created++;
      }
      return json(res, 200, { success: true, created });
    } catch(e) { return json(res, 500, { error: String(e) }); }
  }

  // PATCH /api/faculty-access/:id
  if (method === "PATCH" && pathname.match(/^\/api\/faculty-access\/\d+$/)) {
    const id = parseInt(pathname.split("/").pop());
    const { email, regenerate } = body;
    try {
      if (regenerate) {
        const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
        const password = Array.from({length:8}, () => chars[Math.floor(Math.random()*chars.length)]).join('');
        await db.query("UPDATE public.faculty_accounts SET password=$1 WHERE id=$2", [password, id]);
      }
      if (email !== undefined) {
        await db.query("UPDATE public.faculty_accounts SET email=$1 WHERE id=$2", [email, id]);
      }
      return json(res, 200, { success: true });
    } catch(e) { return json(res, 500, { error: String(e) }); }
  }

  // DELETE /api/faculty-access/:id
  if (method === "DELETE" && pathname.match(/^\/api\/faculty-access\/\d+$/)) {
    const id = parseInt(pathname.split("/").pop());
    try {
      await db.query("DELETE FROM public.faculty_accounts WHERE id=$1", [id]);
      return json(res, 200, { success: true });
    } catch(e) { return json(res, 500, { error: String(e) }); }
  }

  // GET /api/faculty-access/download
  if (method === "GET" && pathname === "/api/faculty-access/download") {
    const scheduleId = reqUrl.searchParams.get("scheduleId");
    if (!scheduleId) return json(res, 400, { error: "scheduleId required" });
    try {
      const r = await db.query(
        "SELECT faculty_name, username, password, email FROM public.faculty_accounts WHERE schedule_id=$1 ORDER BY faculty_name",
        [parseInt(scheduleId)]
      );
      let csv = "Faculty Name,Username,Password,Email\n";
      r.rows.forEach(a => { csv += `"${a.faculty_name}","${a.username}","${a.password}","${a.email||""}"\n`; });
      res.writeHead(200, { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=faculty-credentials.csv", "Access-Control-Allow-Origin": "*" });
      res.end(csv); return;
    } catch(e) { return json(res, 500, { error: String(e) }); }
  }

  if (method === "POST" && pathname === "/api/finance/persons") {
    const { scheduleId, personType, name, email, activeFrom } = body;
    if (!scheduleId || !personType || !name) return json(res, 400, { error: "required" });
    try {
      if (personType === "faculty") {
        const wdP = String(body.whatsapp || "").replace(/[^0-9]/g, "");
        const waP = !wdP ? "" : (wdP.length === 11 && wdP.startsWith("0")) ? "+92" + wdP.slice(1) : wdP.startsWith("92") ? "+" + wdP : (wdP.length === 10 && wdP.startsWith("3")) ? "+92" + wdP : "+" + wdP;
        await db.query("INSERT INTO public.finance_faculty (schedule_id, name, email, active_from, whatsapp) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (schedule_id, name) DO UPDATE SET active_from=$4, active_to=NULL, email=$3, whatsapp=CASE WHEN $5<>'' THEN $5 ELSE public.finance_faculty.whatsapp END", [scheduleId, name, email||"", activeFrom||null, waP]);
      } else if (personType === "staff") {
        const { designation, salary } = body;
        const wdP = String(body.whatsapp || "").replace(/[^0-9]/g, "");
        const waP = !wdP ? "" : (wdP.length === 11 && wdP.startsWith("0")) ? "+92" + wdP.slice(1) : wdP.startsWith("92") ? "+" + wdP : (wdP.length === 10 && wdP.startsWith("3")) ? "+92" + wdP : "+" + wdP;
        await db.query("INSERT INTO public.support_staff (schedule_id, name, designation, email, active_from, whatsapp) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (schedule_id, name) DO UPDATE SET designation=$3, email=$4, whatsapp=CASE WHEN $6<>'' THEN $6 ELSE public.support_staff.whatsapp END", [scheduleId, name, designation||"", email||"", activeFrom||null, waP]);
        if (salary && parseFloat(salary) > 0) {
          await db.query("INSERT INTO public.finance_rates (schedule_id, person_type, person_id, label, rate) VALUES ($1,'staff',$2,$2,$3) ON CONFLICT ON CONSTRAINT finance_rates_person_type_person_id_schedule_id_key DO UPDATE SET rate=$3, label=$2", [scheduleId, name, parseFloat(salary)||0]);
        }
      } else if (personType === "student") {
        const wdP = String(body.whatsapp || "").replace(/[^0-9]/g, "");
        const waP = !wdP ? "" : (wdP.length === 11 && wdP.startsWith("0")) ? "+92" + wdP.slice(1) : wdP.startsWith("92") ? "+" + wdP : (wdP.length === 10 && wdP.startsWith("3")) ? "+92" + wdP : "+" + wdP;
        await db.query("UPDATE public.students SET active_from=$1, active_to=NULL, whatsapp=CASE WHEN $4<>'' THEN $4 ELSE public.students.whatsapp END WHERE schedule_id=$2 AND roll_no=$3", [activeFrom||null, scheduleId, name, waP]);
      }
      return json(res, 200, { success: true });
    } catch(e) { return json(res, 500, { error: String(e) }); }
  }

  // PATCH /api/finance/persons/:id/deactivate - remove WEF a month
  if (method === "PATCH" && pathname.match(/^\/api\/finance\/persons\/[^/]+\/deactivate$/)) {
    const parts = pathname.split("/");
    const personId = parts[4];
    const { personType, scheduleId, activeTo } = body;
    try {
      if (personType === "faculty") {
        await db.query("UPDATE public.finance_faculty SET active_to=$1 WHERE id=$2", [activeTo, parseInt(personId)]);
      } else if (personType === "staff") {
        await db.query("UPDATE public.support_staff SET active_to=$1 WHERE id=$2", [activeTo, parseInt(personId)]);
      } else if (personType === "student") {
        await db.query("UPDATE public.students SET active_to=$1 WHERE schedule_id=$2 AND roll_no=$3", [activeTo, parseInt(scheduleId), personId]);
      }
      return json(res, 200, { success: true });
    } catch(e) { return json(res, 500, { error: String(e) }); }
  }

  if (method === "POST" && pathname === "/api/finance/payments") {
    const { payments } = body;
    if (!Array.isArray(payments)) return json(res, 400, { error: "payments array required" });
    try {
      for (const p of payments) {
        // ---- Queue payment notification when marked Paid / Partial ----
        try {
          const ne2 = await db.query("SELECT value FROM public.app_settings WHERE key='notifications_enabled'");
          if (ne2.rows[0] && ne2.rows[0].value === 'false') throw { __skip: true };
          const pType = p.personType || p.person_type || "";
          const pName = p.personName || p.person_name || "";
          const pSid = parseInt(p.scheduleId ?? p.schedule_id ?? body.scheduleId ?? 0) || 0;
          const pPeriod = String(p.period || "");
          const amt = parseFloat(p.amount) || 0;
          const paidAmt = parseFloat(p.paidAmount ?? p.paid_amount ?? 0) || 0;
          const st = String(p.status || "").toLowerCase();
          if ((st === "paid" || st === "partial") && paidAmt > 0 && pName) {
            let nm = pName, wa = "";
            if (pType === "student") {
              const sr = await db.query("SELECT name, COALESCE(whatsapp,'') AS whatsapp FROM public.students WHERE schedule_id=$1 AND roll_no=$2 LIMIT 1", [pSid, pName]);
              if (sr.rows[0]) { wa = sr.rows[0].whatsapp || ""; nm = sr.rows[0].name || pName; }
            }
            else if (pType === "faculty") {
              const fr = await db.query("SELECT COALESCE(whatsapp,'') AS whatsapp FROM public.finance_faculty WHERE name=$1 AND ($2::int = 0 OR schedule_id=$2) ORDER BY id DESC LIMIT 1", [pName, pSid]);
              if (fr.rows[0]) wa = fr.rows[0].whatsapp || "";
            } else if (pType === "staff") {
              const fr = await db.query("SELECT COALESCE(whatsapp,'') AS whatsapp FROM public.support_staff WHERE name=$1 ORDER BY id DESC LIMIT 1", [pName]);
              if (fr.rows[0]) wa = fr.rows[0].whatsapp || "";
            }
            const msgTxt = pType === "student"
              ? (st === "paid"
                ? "Dear " + nm + ", your fee payment of PKR " + paidAmt + " for " + pPeriod + " has been received. Status: PAID. - AcadTrack Finance"
                : "Dear " + nm + ", your partial fee payment of PKR " + paidAmt + " (of PKR " + amt + ") for " + pPeriod + " has been received. Status: PARTIAL. - AcadTrack Finance")
              : "Dear " + nm + ", your salary of PKR " + paidAmt + " for " + pPeriod + " has been " + (st === "paid" ? "paid in full" : "partially paid (of PKR " + amt + ")") + ". - AcadTrack Finance";
            await db.query(
              "INSERT INTO public.notifications (schedule_id, class_name, roll_no, student_name, whatsapp, date, session_time, message, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending') ON CONFLICT (schedule_id, class_name, roll_no, date, session_time) DO NOTHING",
              [pSid, "_payment_" + pType, pName, nm, wa, pPeriod, "amt-" + paidAmt, msgTxt]
            );
          }
        } catch (eP) { console.log("payment notify error:", String(eP)); }
        await db.query(
          `INSERT INTO public.finance_payments (person_type, person_name, schedule_id, period, amount, paid_amount, status, note)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (person_type, person_name, schedule_id, period)
           DO UPDATE SET amount=$5, paid_amount=$6, status=$7, note=$8`,
          [p.personType, p.personName, p.scheduleId, p.period, p.amount||0, p.paidAmount||0, p.status||"Unpaid", p.note||""]
        );
      }
      return json(res, 200, { success: true });
    } catch(e) { return json(res, 500, { error: String(e) }); }
  }

  // GET /api/finance/expenses — list expense register for a month
  if (method === "GET" && pathname === "/api/finance/expenses") {
    const sid = reqUrl.searchParams.get("scheduleId");
    const period = reqUrl.searchParams.get("period");
    try {
      const r = await db.query(
        "SELECT id, schedule_id, to_char(date,'YYYY-MM-DD') AS date, expense_head, description, amount, remarks FROM public.finance_expenses WHERE ($1::int IS NULL OR schedule_id=$1) AND ($2::text IS NULL OR to_char(date,'YYYY-MM')=$2) ORDER BY date DESC, id DESC",
        [sid ? parseInt(sid) : null, period || null]
      );
      return json(res, 200, r.rows.map(e => ({ id: e.id, scheduleId: e.schedule_id, date: e.date, expenseHead: e.expense_head, description: e.description || "", amount: parseFloat(e.amount) || 0, remarks: e.remarks || "" })));
    } catch (e) { return json(res, 200, []); }
  }

  // POST /api/finance/expenses — add one expense entry
  if (method === "POST" && pathname === "/api/finance/expenses") {
    const { scheduleId, date, expenseHead, description, amount, remarks } = body;
    if (!expenseHead || !(parseFloat(amount) > 0)) return json(res, 400, { error: "expenseHead and positive amount required" });
    try {
      const r = await db.query(
        "INSERT INTO public.finance_expenses (schedule_id, date, expense_head, description, amount, remarks) VALUES ($1, COALESCE($2::date, CURRENT_DATE), $3, $4, $5, $6) RETURNING id",
        [scheduleId ? parseInt(scheduleId) : null, date || null, expenseHead, description || "", parseFloat(amount) || 0, remarks || ""]
      );
      return json(res, 200, { success: true, id: r.rows[0].id });
    } catch (e) { return json(res, 500, { error: String(e) }); }
  }

  // DELETE /api/finance/expenses/:id
  if (method === "DELETE" && pathname.match(/^\/api\/finance\/expenses\/\d+$/)) {
    try {
      await db.query("DELETE FROM public.finance_expenses WHERE id=$1", [parseInt(pathname.split("/").pop())]);
      return json(res, 200, { success: true });
    } catch (e) { return json(res, 500, { error: String(e) }); }
  }

  // POST /api/finance/expenses/import — bulk from parsed CSV rows
  if (method === "POST" && pathname === "/api/finance/expenses/import") {
    const { rows, scheduleId } = body;
    if (!Array.isArray(rows) || rows.length === 0) return json(res, 400, { error: "rows required" });
    try {
      let inserted = 0, skipped = 0;
      for (const row of rows) {
        const g = (...names) => { for (const n of names) { for (const k of Object.keys(row)) { if (String(k).trim().toLowerCase() === n) { const v = String(row[k] || "").trim(); if (v) return v; } } } return ""; };
        const head = g("expense head", "head", "category");
        const amtS = g("amount", "amt").replace(/[^0-9.]/g, "");
        const amt = parseFloat(amtS) || 0;
        if (!head || amt <= 0) { skipped++; continue; }
        let dt = g("date");
        const m1 = dt.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
        if (m1) dt = m1[3] + "-" + m1[2].padStart(2, "0") + "-" + m1[1].padStart(2, "0");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dt)) dt = "";
        await db.query(
          "INSERT INTO public.finance_expenses (schedule_id, date, expense_head, description, amount, remarks) VALUES ($1, COALESCE($2::date, CURRENT_DATE), $3, $4, $5, $6)",
          [scheduleId ? parseInt(scheduleId) : null, dt || null, head, g("description", "detail"), amt, g("remarks", "note", "notes")]
        );
        inserted++;
      }
      return json(res, 200, { success: true, inserted, skipped });
    } catch (e) { return json(res, 500, { error: String(e) }); }
  }

  if (method === "GET" && pathname === "/api/finance/summary") {
    const username = reqUrl.searchParams.get("username");
    const period = reqUrl.searchParams.get("period");
    if (!period) return json(res, 200, { student: {}, faculty: {}, staff: {} });
    try {
      let r;
      if (username) {
        r = await db.query(
          "SELECT fp.person_type, CASE WHEN COALESCE(fp.paid_amount,0) >= COALESCE(fp.amount,0) AND COALESCE(fp.amount,0) > 0 THEN 'Paid' WHEN COALESCE(fp.paid_amount,0) > 0 THEN 'Partial' ELSE 'Unpaid' END as status, COUNT(*) as cnt, SUM(fp.amount) as total, SUM(COALESCE(fp.paid_amount,0)) as paidsum FROM public.finance_payments fp JOIN public.schedules s ON fp.schedule_id = s.id WHERE s.user_id=$1 AND fp.period=$2 GROUP BY fp.person_type, 2",
          [username, period]
        );
      } else {
        r = await db.query(
          "SELECT person_type, CASE WHEN COALESCE(paid_amount,0) >= COALESCE(amount,0) AND COALESCE(amount,0) > 0 THEN 'Paid' WHEN COALESCE(paid_amount,0) > 0 THEN 'Partial' ELSE 'Unpaid' END as status, COUNT(*) as cnt, SUM(amount) as total, SUM(COALESCE(paid_amount,0)) as paidsum FROM public.finance_payments WHERE period=$1 GROUP BY person_type, 2",
          [period]
        );
      }
      const summary = { student: {}, faculty: {}, staff: {} };
      r.rows.forEach((row) => {
        if (!summary[row.person_type]) summary[row.person_type] = {};
        summary[row.person_type][row.status] = { count: parseInt(row.cnt), total: parseFloat(row.total)||0, paid: parseFloat(row.paidsum)||0 };
      });
      // Count persons with a set rate but no payment row this period as Unpaid (due = rate)
      const unpaidQ = username
        ? await db.query("SELECT fr.person_type, COUNT(*) as cnt, COALESCE(SUM(fr.rate),0) as total FROM public.finance_rates fr JOIN public.schedules s ON fr.schedule_id=s.id WHERE s.user_id=$1 AND NOT EXISTS (SELECT 1 FROM public.finance_payments fp WHERE fp.person_type=fr.person_type AND fp.period=$2 AND (fp.person_name=fr.person_id OR fp.person_name=fr.label)) GROUP BY fr.person_type", [username, period])
        : await db.query("SELECT fr.person_type, COUNT(*) as cnt, COALESCE(SUM(fr.rate),0) as total FROM public.finance_rates fr WHERE NOT EXISTS (SELECT 1 FROM public.finance_payments fp WHERE fp.person_type=fr.person_type AND fp.period=$1 AND (fp.person_name=fr.person_id OR fp.person_name=fr.label)) GROUP BY fr.person_type", [period]);
      unpaidQ.rows.forEach(row => {
        if (!summary[row.person_type]) summary[row.person_type] = {};
        const ex = summary[row.person_type]["Unpaid"] || { count: 0, total: 0, paid: 0 };
        summary[row.person_type]["Unpaid"] = { count: ex.count + parseInt(row.cnt), total: (ex.total || 0) + (parseFloat(row.total) || 0), paid: ex.paid || 0 };
      });
      const paidQ = username
        ? await db.query("SELECT fp.person_type, SUM(COALESCE(fp.paid_amount,0)) AS paid FROM public.finance_payments fp LEFT JOIN public.schedules s ON fp.schedule_id=s.id WHERE fp.period=$2 AND (s.user_id=$1 OR fp.schedule_id IS NULL) GROUP BY fp.person_type", [username, period])
        : await db.query("SELECT person_type, SUM(COALESCE(paid_amount,0)) AS paid FROM public.finance_payments WHERE period=$1 GROUP BY person_type", [period]);
      const paid = { student: 0, faculty: 0, staff: 0 };
      paidQ.rows.forEach(rr => { paid[rr.person_type] = parseFloat(rr.paid) || 0; });
      const expQ = username
        ? await db.query("SELECT COALESCE(SUM(e.amount),0) AS t FROM public.finance_expenses e LEFT JOIN public.schedules s ON e.schedule_id=s.id WHERE to_char(e.date,'YYYY-MM')=$2 AND (s.user_id=$1 OR e.schedule_id IS NULL)", [username, period])
        : await db.query("SELECT COALESCE(SUM(amount),0) AS t FROM public.finance_expenses WHERE to_char(date,'YYYY-MM')=$1", [period]);
      const expTotal = parseFloat(expQ.rows[0].t) || 0;
      summary.pl = { income: paid.student, facultySalary: paid.faculty, staffSalary: paid.staff, expenses: expTotal, profit: paid.student - (paid.faculty + paid.staff + expTotal) };
      return json(res, 200, summary);
    } catch(e) { return json(res, 200, { student: {}, faculty: {}, staff: {} }); }
  }

  if (method === "GET" && pathname === "/api/finance/rates") {
    const scheduleId = reqUrl.searchParams.get("scheduleId");
    const personType = reqUrl.searchParams.get("personType");
    if (!scheduleId || !personType) return json(res, 200, []);
    try {
      const r = await db.query("SELECT id, schedule_id, person_type, COALESCE(label, person_id) as label, COALESCE(rate, 0) as amount FROM public.finance_rates WHERE schedule_id=$1 AND person_type=$2 ORDER BY label", [parseInt(scheduleId), personType]);
      return json(res, 200, r.rows.map(r => ({ id: r.id, scheduleId: r.schedule_id, personType: r.person_type, label: r.label, amount: parseFloat(r.amount)||0 })));
    } catch(e) { return json(res, 200, []); }
  }

  if (method === "POST" && pathname === "/api/finance/rates") {
    const { scheduleId, personType, rates } = body;
    if (!scheduleId || !personType || !Array.isArray(rates)) return json(res, 400, { error: "required fields missing" });
    try {
      await db.query("DELETE FROM public.finance_rates WHERE schedule_id=$1 AND person_type=$2", [scheduleId, personType]);
      for (const rate of rates) {
        await db.query("INSERT INTO public.finance_rates (schedule_id, person_type, person_id, label, rate) VALUES ($1,$2,$3,$3,$4)", [scheduleId, personType, String(rate.label || ""), parseFloat(rate.amount)||0]);
      }
      const ratePeriod = body.period;
      if (ratePeriod) {
        for (const rate of rates) {
          await db.query("UPDATE public.finance_payments SET amount=$1, status='Unpaid' WHERE person_type=$2 AND period=$3 AND person_name=$4 AND COALESCE(paid_amount,0)=0 AND ($5::int = 0 OR schedule_id=$5)", [parseFloat(rate.amount)||0, personType, ratePeriod, String(rate.label||""), parseInt(scheduleId)||0]);
        }
      }
      return json(res, 200, { success: true });
    } catch(e) { return json(res, 500, { error: String(e) }); }
  }

  if (method === "GET" && pathname === "/api/finance/staff") {
    const scheduleId = reqUrl.searchParams.get("scheduleId");
    if (!scheduleId || scheduleId === "undefined" || scheduleId === "[object Object]") return json(res, 200, []);
    try {
      const r = await db.query("SELECT id, schedule_id, name, COALESCE(designation,'') as role, COALESCE(email,'') as contact FROM public.support_staff WHERE schedule_id=$1 AND (active_to IS NULL OR active_to > TO_CHAR(NOW(), 'YYYY-MM')) ORDER BY name", [parseInt(scheduleId)]);
      return json(res, 200, r.rows.map(s => ({ id: s.id, scheduleId: s.schedule_id, name: s.name, role: s.role, contact: s.contact||"" })));
    } catch(e) { return json(res, 200, []); }
  }

  if (method === "POST" && pathname === "/api/finance/staff") {
    const { scheduleId, name, role, contact } = body;
    if (!scheduleId || !name) return json(res, 400, { error: "scheduleId and name required" });
    try {
      const r = await db.query("INSERT INTO public.support_staff (schedule_id, name, designation, email) VALUES ($1,$2,$3,$4) ON CONFLICT (schedule_id, name) DO NOTHING RETURNING id", [scheduleId, name, role||"", contact||""]);
      return json(res, 200, { success: true, id: r.rows[0].id });
    } catch(e) { return json(res, 500, { error: String(e) }); }
  }

  if (method === "DELETE" && pathname.match(/^\/api\/finance\/staff\/\d+$/)) {
    const id = parseInt(pathname.split("/").pop());
    try {
      await db.query("DELETE FROM public.support_staff WHERE id=$1", [id]);
      return json(res, 200, { success: true });
    } catch(e) { return json(res, 500, { error: String(e) }); }
  }

  if (method === "GET" && pathname === "/api/finance/student-fee") {
    const regNo = reqUrl.searchParams.get("regNo");
    if (!regNo) return json(res, 200, null);
    try {
      const r = await db.query(
        "SELECT fp.id, fp.period, fp.amount, COALESCE(fp.paid_amount,0) as paid_amount, fp.status, fp.note, s.name as student_name FROM public.finance_payments fp LEFT JOIN public.students s ON s.roll_no=fp.person_name WHERE fp.person_type='student' AND fp.person_name=$1 ORDER BY fp.period DESC LIMIT 12",
        [regNo]
      );
      return json(res, 200, r.rows.length ? { regNo, name: r.rows[0].student_name||regNo, payments: r.rows } : null);
    } catch(e) { return json(res, 200, null); }
  }

  if (method === "POST" && pathname === "/api/auth/register") {
    await db.query("SELECT setval('public.users_id_seq', COALESCE((SELECT MAX(id) FROM public.users), 0) + 1, false)").catch(() => {});
    const { username, password, pin } = body;
    if (!username || !password) return json(res, 400, { success: false, message: "Username and password required" });
    if (password.length < 4) return json(res, 400, { success: false, message: "Password must be at least 4 characters" });
    try {
      await db.query(
        "INSERT INTO public.users (id, username, password, pin) VALUES (nextval('public.users_id_seq'), $1, $2, $3) RETURNING id",
        [username.trim(), password.trim(), pin ?? ""]
      );
      return json(res, 200, { success: true });
    } catch (e) {
      if (e.message.includes("unique") || e.message.includes("duplicate")) {
        return json(res, 409, { success: false, message: "Username already taken" });
      }
      return json(res, 500, { success: false, message: e.message });
    }
  }

  if (method === "POST" && pathname === "/api/auth/login") {
    const { username, password } = body;
    try {
      const r = await db.query("SELECT * FROM public.users WHERE username = $1 AND password = $2", [username, password]);
      if (!r.rows.length) return json(res, 200, { success: false, message: "Invalid username or password" });
      const u = r.rows[0];
      if (u.is_locked) return json(res, 200, { success: false, message: "Account is locked. Contact admin." });
      if (u.expiry_date && new Date(u.expiry_date) < new Date()) return json(res, 200, { success: false, message: "Account has expired. Contact admin." });
      return json(res, 200, { success: true, user: u.username, token: signToken({ username: u.username, role: "owner" }) });
    } catch (e) { return json(res, 500, { success: false, message: e.message }); }
  }

  if (method === "POST" && pathname === "/api/auth/change-password") {
    const { username, currentPassword, newPassword } = body;
    try {
      const r = await db.query("SELECT * FROM public.users WHERE username = $1 AND password = $2", [username, currentPassword]);
      if (!r.rows.length) return json(res, 200, { success: false, message: "Current password is incorrect" });
      await db.query("UPDATE public.users SET password = $1 WHERE username = $2", [newPassword, username]);
      return json(res, 200, { success: true });
    } catch (e) { return json(res, 500, { success: false, message: e.message }); }
  }

  if (method === "POST" && pathname === "/api/auth/recover-password") {
    const { username, pin, newPassword } = body;
    try {
      const r = await db.query("SELECT * FROM public.users WHERE username = $1 AND pin = $2", [username, pin]);
      if (!r.rows.length) return json(res, 200, { success: false, message: "Username or PIN is incorrect" });
      await db.query("UPDATE public.users SET password = $1 WHERE username = $2", [newPassword, username]);
      return json(res, 200, { success: true });
    } catch (e) { return json(res, 500, { success: false, message: e.message }); }
  }

  if (method === "POST" && pathname === "/api/admin/otp") {
    const { username, password } = body;
    if (username?.trim().toLowerCase() !== ADMIN_USERNAME.toLowerCase() || password?.trim() !== ADMIN_PASSWORD) return json(res, 401, { success:false, message:"Invalid username or password" });
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    otpStore[ADMIN_EMAIL] = { otp, expires: Date.now() + 5*60*1000 };
    try { await sendOtpEmail(otp); return json(res, 200, { success:true, message:"OTP sent to " + ADMIN_EMAIL }); }
    catch(e) { return json(res, 500, { success:false, message:"Email error: " + e.message }); }
  }
  if (method === "POST" && pathname === "/api/admin/verify-otp") {
    const { otp } = body;
    const r = otpStore[ADMIN_EMAIL];
    if (!r) return json(res, 400, { success:false, message:"No OTP requested" });
    if (Date.now() > r.expires) { delete otpStore[ADMIN_EMAIL]; return json(res, 400, { success:false, message:"OTP expired" }); }
    if (r.otp !== String(otp).trim()) return json(res, 400, { success:false, message:"Incorrect OTP" });
    delete otpStore[ADMIN_EMAIL];
    return json(res, 200, { success:true, message:"Verified" });
  }
  if (method === "GET" && pathname === "/api/admin/test") {
    try {
      const r = await db.query("SELECT COUNT(*) as cnt FROM public.users");
      return json(res, 200, { success: true, count: r.rows[0].cnt });
    } catch(e) { return json(res, 500, { error: String(e) }); }
  }
  if (method === "GET" && pathname === "/api/admin/users") {
    if (!requireAdmin(req, res)) return;
    try {
      const r = await db.query("SELECT id, username, password, pin, is_locked, expiry_date, created_at FROM public.users WHERE username != $1 ORDER BY id DESC", [ADMIN_USERNAME]);
      // Get schedule count for each user
      const schedCounts = await db.query("SELECT user_id, COUNT(*) as cnt FROM public.schedules GROUP BY user_id");
      const countMap = {};
      schedCounts.rows.forEach(s => { countMap[s.user_id] = parseInt(s.cnt); });
      const users = r.rows.map(u => ({
        id: u.id, username: u.username, password: u.password, pin: u.pin,
        isLocked: u.is_locked || false, registeredAt: u.created_at || null, expiryDate: u.expiry_date || null,
        scheduleCount: countMap[u.username] || 0
      }));
      console.log("Admin users found:", users.length);
      return json(res, 200, { success: true, users });
    } catch (e) { console.error('Admin users DB error:', String(e)); return json(res, 500, { success: false, message: String(e) }); }
  }

    // DELETE /api/admin/users/:id
  if (method === "DELETE" && pathname.match(/^\/api\/admin\/users\/\d+$/)) {
    const id = parseInt(pathname.split("/")[4]);
    try {
      // First get all schedules owned by this user
      const userRow = await db.query("SELECT username FROM public.users WHERE id=$1", [id]);
      if (userRow.rows.length && userRow.rows[0].username !== ADMIN_USERNAME) {
        const username = userRow.rows[0].username;
        const userScheds = await db.query("SELECT id FROM public.schedules WHERE user_id=$1", [username]);
        for (const sched of userScheds.rows) {
          const sid = sched.id;
          await db.query("DELETE FROM public.attendance WHERE schedule_id=$1", [sid]);
          await db.query("DELETE FROM public.students WHERE schedule_id=$1", [sid]);
          await db.query("DELETE FROM public.faculty_accounts WHERE schedule_id=$1", [sid]);
          await db.query("DELETE FROM public.finance_payments WHERE schedule_id=$1", [sid]);
          await db.query("DELETE FROM public.finance_rates WHERE schedule_id=$1", [sid]);
          await db.query("DELETE FROM public.holidays WHERE schedule_id=$1", [sid]);
          await db.query("DELETE FROM public.weekly_schedule WHERE schedule_id=$1", [sid]);
          try { await db.query("DELETE FROM public.finance_faculty WHERE schedule_id=$1", [sid]); } catch {}
          try { await db.query("DELETE FROM public.support_staff WHERE schedule_id=$1", [sid]); } catch {}
          try { await db.query("DELETE FROM public.exam_marks WHERE schedule_id=$1", [sid]); } catch {}
          await db.query("DELETE FROM public.schedules WHERE id=$1", [sid]);
        }
      }
      const r = await db.query("DELETE FROM public.users WHERE id = $1 AND username != $2 RETURNING id", [id, ADMIN_USERNAME]);
      if (r.rows.length === 0) return json(res, 404, { success: false, message: "User not found or cannot delete admin" });
      return json(res, 200, { success: true });
    } catch (e) { return json(res, 500, { error: e.message }); }
  }

  // PATCH /api/admin/users/:id/password
  if (method === "PATCH" && pathname.match(/^\/api\/admin\/users\/\d+\/password$/)) {
    const id = parseInt(pathname.split("/")[4]);
    const { newPassword } = body;
    if (!newPassword) return json(res, 400, { success: false, message: "Missing newPassword" });
    try {
      const r = await db.query("UPDATE public.users SET password = $1 WHERE id = $2 AND username != $3 RETURNING id", [newPassword, id, ADMIN_USERNAME]);
      if (r.rows.length === 0) return json(res, 404, { success: false, message: "User not found" });
      return json(res, 200, { success: true });
    } catch (e) { return json(res, 500, { error: e.message }); }
  }

  // PATCH /api/admin/users/:id/lock
  if (method === "PATCH" && pathname.match(/^\/api\/admin\/users\/\d+\/lock$/)) {
    const id = parseInt(pathname.split("/")[4]);
    const { isLocked } = body;
    try {
      const r = await db.query("UPDATE public.users SET is_locked = $1 WHERE id = $2 RETURNING id, is_locked", [isLocked, id]);
      if (r.rows.length === 0) return json(res, 404, { success: false, message: "User not found" });
      return json(res, 200, { success: true, isLocked: r.rows[0].is_locked });
    } catch (e) { return json(res, 500, { error: e.message }); }
  }

  // PATCH /api/admin/users/:id/expiry
  if (method === "PATCH" && pathname.match(/^\/api\/admin\/users\/\d+\/expiry$/)) {
    const id = parseInt(pathname.split("/")[4]);
    const { expiryDate } = body;
    try {
      const r = await db.query("UPDATE public.users SET expiry_date = $1 WHERE id = $2 RETURNING id", [expiryDate || null, id]);
      if (r.rows.length === 0) return json(res, 404, { success: false, message: "User not found" });
      return json(res, 200, { success: true });
    } catch (e) { return json(res, 500, { error: e.message }); }
  }

  // ========== SCHEDULES ROUTES ==========

  if (method === "GET" && pathname === "/api/schedules/public") {
    try {
      const r = await db.query("SELECT * FROM public.schedules WHERE is_public = true ORDER BY created_at DESC");
      return json(res, 200, r.rows.map(s => ({
        id: s.id, userId: s.user_id, name: s.name,
        startDate: s.start_date, endDate: s.end_date,
        startHour: s.start_hour ?? 9, endHour: s.end_hour ?? 17, activeDays: s.active_days ?? 'Mon,Tue,Wed,Thu,Fri',
        isPublic: s.is_public, createdAt: s.created_at, breakTime: s.break_time ?? '13-14'
      })));
    } catch (e) { return json(res, 500, { error: e.message }); }
  }

  if (method === "GET" && pathname === "/api/schedules") {
    const username = reqUrl.searchParams.get("username");
    if (!username) return json(res, 400, { success: false, message: "username required" });
    try {
      const r = await db.query("SELECT * FROM public.schedules WHERE user_id = $1 ORDER BY created_at DESC", [username]);
      return json(res, 200, r.rows.map(s => ({
        id: s.id, userId: s.user_id, name: s.name,
        startDate: s.start_date, endDate: s.end_date,
        startHour: s.start_hour ?? 9, lectureDuration: s.lecture_duration ?? 60, endHour: s.end_hour ?? 17, activeDays: s.active_days ?? 'Mon,Tue,Wed,Thu,Fri',
        isPublic: s.is_public, createdAt: s.created_at, breakTime: s.break_time ?? '13-14'
      })));
    } catch (e) { return json(res, 500, { error: e.message }); }
  }

  if (method === "POST" && pathname === "/api/schedules") {
    const { username, name, startDate, endDate, startHour, endHour, activeDays, breakTime, lectureDuration } = body;
    if (!username || !name) return json(res, 400, { success: false, message: "username and name required" });
    try {
      const r = await db.query(
        "INSERT INTO public.schedules (id, user_id, name, start_date, end_date, start_hour, end_hour, active_days, break_time, lecture_duration) VALUES (nextval('public.schedules_id_seq'), $1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *",
        [username, name, startDate ?? null, endDate ?? null, startHour ?? 9, endHour ?? 17, activeDays ?? 'Mon,Tue,Wed,Thu,Fri', breakTime ?? '13-14', parseInt(lectureDuration) || 60]
      );
      const s = r.rows[0];
      return json(res, 200, { success: true, schedule: {
        id: s.id, userId: s.user_id, name: s.name,
        startDate: s.start_date, endDate: s.end_date,
        startHour: s.start_hour ?? 9, endHour: s.end_hour ?? 17, activeDays: s.active_days ?? 'Mon,Tue,Wed,Thu,Fri',
        lectureDuration: s.lecture_duration ?? 60, isPublic: s.is_public, createdAt: s.created_at
      }});
    } catch (e) { return json(res, 500, { error: e.message }); }
  }

  if (method === "POST" && pathname.match(/^\/api\/schedules\/\d+\/duration$/)) {
    const id = parseInt(pathname.split("/")[3]);
    const { lectureDuration } = body;
    try {
      await db.query("UPDATE public.schedules SET lecture_duration = $1 WHERE id = $2", [parseInt(lectureDuration) || 60, id]);
      return json(res, 200, { success: true });
    } catch(e) { return json(res, 500, { error: e.message }); }
  }

  if (method === "PATCH" && pathname.match(/^\/api\/schedules\/\d+\/settings$/)) {
    const id = parseInt(pathname.split("/")[3]);
    const { startHour, endHour, activeDays } = body;
    try {
      await db.query(
        "UPDATE public.schedules SET start_hour = $1, end_hour = $2, active_days = $3 WHERE id = $4",
        [startHour ?? 9, endHour ?? 17, activeDays ?? 'Mon,Tue,Wed,Thu,Fri', id]
      );
      return json(res, 200, { success: true });
    } catch(e) { return json(res, 500, { error: e.message }); }
  }

  if (method === "PATCH" && pathname.match(/^\/api\/schedules\/\d+\/public$/)) {
    const id = parseInt(pathname.split("/")[3]);
    const { isPublic } = body;
    try {
      const r = await db.query("UPDATE public.schedules SET is_public = $1 WHERE id = $2 RETURNING *", [isPublic, id]);
      if (!r.rows.length) return json(res, 404, { success: false, message: "Schedule not found" });
      return json(res, 200, { success: true, isPublic: r.rows[0].is_public });
    } catch (e) { return json(res, 500, { error: e.message }); }
  }

  if (method === "POST" && pathname === "/api/schedule/entry") {
    const { Faculty, Subject, Class, Dept, Day, Location, Time, EndTime, LecLab, Elective, User, scheduleId, Type, EntryDate, Remarks } = body;
    if (!Faculty || !Subject || !Class || !Day || !Time) return json(res, 400, { error: "Missing required fields" });
    try {
      function timeToHour2(t) {
        if (!t) return 9;
        const m = String(t).match(/(\d+):(\d+)\s*(AM|PM)/i);
        if (!m) return 9;
        let h = parseInt(m[1]);
        if (m[3].toUpperCase() === "PM" && h !== 12) h += 12;
        if (m[3].toUpperCase() === "AM" && h === 12) h = 0;
        return h;
      }
      const startH = timeToHour2(Time);
      const endH = timeToHour2(EndTime);
      const actualEndH = endH > startH ? endH : startH + 1;
      const sid = scheduleId != null && !isNaN(parseInt(scheduleId)) ? parseInt(scheduleId) : null;
      const entryType = Type ? Type.toLowerCase() : null;
      const entryDate = EntryDate || null;
      const entryRemarks = Remarks || null;
      for (let h = startH; h < actualEndH; h++) {
        function hourLabel2(n) { const h12 = n % 12 || 12; const ap = n >= 12 ? "PM" : "AM"; return (h12 < 10 ? "0" : "") + h12 + ":00 " + ap; }
        // Check duplicate: same schedule+faculty+subject+class+date+time
        if (entryDate) {
          const dupCheck = await db.query(
            "SELECT id FROM public.weekly_schedule WHERE schedule_id=$1 AND LOWER(faculty)=LOWER($2) AND LOWER(subject)=LOWER($3) AND LOWER(class_name)=LOWER($4) AND entry_date=$5::date AND time_start=$6 LIMIT 1",
            [sid, Faculty, Subject, Class, entryDate, hourLabel2(h)]
          );
          if (dupCheck.rows.length > 0) continue; // skip duplicate
        }
        await db.query(
          "INSERT INTO public.weekly_schedule (faculty, subject, class_name, dept, day, location, time_start, time_end, lec_lab, elective, user_email, sort_key, schedule_id, type, entry_date, remarks) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::date,$16)",
          [Faculty, Subject, Class, Dept || "", Day, Location || "", hourLabel2(h), hourLabel2(h+1), LecLab || "Lec", Elective || "", User || "", h * 60, sid, entryType, entryDate, entryRemarks]
        );
      }
      return json(res, 200, { success: true, inserted: actualEndH - startH });
    } catch(e) { return json(res, 500, { error: e.message }); }
  }

  if (method === "DELETE" && pathname.startsWith("/api/schedule/") && !pathname.startsWith("/api/schedules/")) {
    const id = parseInt(pathname.split("/").pop());
    if (!isNaN(id)) {
      try {
        await db.query("DELETE FROM public.weekly_schedule WHERE id = $1", [id]);
        return json(res, 200, { success: true });
      } catch(e) { return json(res, 500, { error: e.message }); }
    }
  }

  if (method === "DELETE" && pathname.startsWith("/api/schedules/")) {
    const id = pathname.split("/")[3];
    try {
      const sid = parseInt(id);
      // Full cascade delete - remove ALL data for this schedule
      await db.query("DELETE FROM public.attendance WHERE schedule_id = $1", [sid]);
      await db.query("DELETE FROM public.students WHERE schedule_id = $1", [sid]);
      await db.query("DELETE FROM public.faculty_accounts WHERE schedule_id = $1", [sid]);
      await db.query("DELETE FROM public.finance_payments WHERE schedule_id = $1", [sid]);
      await db.query("DELETE FROM public.finance_rates WHERE schedule_id = $1", [sid]);
      await db.query("DELETE FROM public.holidays WHERE schedule_id = $1", [sid]);
      await db.query("DELETE FROM public.weekly_schedule WHERE schedule_id = $1", [sid]);
      try { await db.query("DELETE FROM public.finance_faculty WHERE schedule_id = $1", [sid]); } catch {}
      try { await db.query("DELETE FROM public.support_staff WHERE schedule_id = $1", [sid]); } catch {}
      try { await db.query("DELETE FROM public.exam_marks WHERE schedule_id = $1", [sid]); } catch {}
      await db.query("DELETE FROM public.schedules WHERE id = $1", [sid]);
      return json(res, 200, { success: true });
    } catch (e) { return json(res, 500, { error: e.message }); }
  }

  // ========== WEEKLY SCHEDULE ROUTE ==========

  if (method === "GET" && pathname === "/api/schedule") {
    const scheduleId = reqUrl.searchParams.get("scheduleId");
    try {
      const sidInt = scheduleId && scheduleId !== "undefined" && scheduleId !== "null" && !isNaN(parseInt(scheduleId)) ? parseInt(scheduleId) : null;
      const r = sidInt
        ? await db.query("SELECT * FROM public.weekly_schedule WHERE schedule_id = $1 AND (entry_date IS NULL) ORDER BY sort_key", [sidInt])
        : await db.query("SELECT * FROM public.weekly_schedule WHERE schedule_id IS NULL AND (entry_date IS NULL) ORDER BY sort_key");
      return json(res, 200, r.rows.map(row => ({
        // Capitalized (what UI components expect)
        Faculty: row.faculty || "", Subject: row.subject || "", Class: row.class_name || "",
        Deptt: row.dept || "", Day: row.day || "", Location: row.location || "",
        Time: row.time_start || "", EndTime: row.time_end || "",
        SortKey: row.sort_key || 0, LecLab: row.lec_lab || "", Type: row.type || "",
        EntryDate: formatDate(row.entry_date), Elective: row.elective || "",
        UserEmail: row.user_email || "", ScheduleId: row.schedule_id,
        // Lowercase (for useApi.ts compatibility)
        id: row.id, faculty: row.faculty || "", subject: row.subject || "",
        class_name: row.class_name || "", dept: row.dept || "", day: row.day || "",
        location: row.location || "", time_start: row.time_start || "", time_end: row.time_end || "",
        lec_lab: row.lec_lab || "", type: row.type || "", entry_date: formatDate(row.entry_date),
        elective: row.elective || "", user_email: row.user_email || "", sort_key: row.sort_key || 0,
        schedule_id: row.schedule_id
      })));
    } catch (e) { return json(res, 500, { error: e.message }); }
  }

  // ========== SUMMARY ROUTE ==========

  if (method === "GET" && pathname === "/api/summary") {
    const scheduleId = reqUrl.searchParams.get("scheduleId");
    const start = reqUrl.searchParams.get("start");
    const end = reqUrl.searchParams.get("end");
    try {
      const sidInt = scheduleId && scheduleId !== "undefined" && !isNaN(parseInt(scheduleId)) ? parseInt(scheduleId) : null;
      const q = sidInt
        ? await db.query("SELECT *, to_char(entry_date, 'YYYY-MM-DD') as entry_date_str FROM public.weekly_schedule WHERE schedule_id = $1", [sidInt])
        : await db.query("SELECT *, to_char(entry_date, 'YYYY-MM-DD') as entry_date_str FROM public.weekly_schedule WHERE schedule_id IS NULL");
      const rows = q.rows;

      const filterStart = start ? new Date(start + "T00:00:00") : new Date("2026-01-19T00:00:00");
      const filterEnd = end ? new Date(end + "T23:59:59") : new Date();
      filterStart.setHours(0,0,0,0); filterEnd.setHours(23,59,59,999);
      // Fetch holidays to exclude from TBC count
      const holidayRows = sidInt
        ? await db.query("SELECT date::text FROM public.holidays WHERE schedule_id=$1", [sidInt])
        : await db.query("SELECT date::text FROM public.holidays WHERE schedule_id IS NULL");
      const holidayDates = new Set(holidayRows.rows.map(h => String(h.date).slice(0,10)));

      const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
      function countWeekday(dayName) {
        const dayIdx = DAY_NAMES.indexOf(dayName);
        if (dayIdx < 0) return 0;
        let d = new Date(filterStart), c = 0;
        while (d <= filterEnd) {
          const iso = d.toISOString().slice(0,10);
          if (d.getDay() === dayIdx && !holidayDates.has(iso)) c++;
          d.setDate(d.getDate()+1);
        }
        return c;
      }
      function normalizeClass(cls, isElective) {
        if (!isElective) return cls;
        cls = (cls||"").toUpperCase().trim();
        const m = cls.match(/^(2K\d{2}-[A-Z]+-\d+)[A-Z]+$/);
        return m ? m[1] : cls;
      }

      const map = {};
      for (const r of rows) {
        if (r.type && r.type.trim() !== "") continue;
        if (!r.faculty || !r.subject || !r.class_name || !r.dept) continue;
        if (!r.day || !r.time_start) continue;
        const isElective = (r.elective||"").toLowerCase() === "elective";
        const clsBase = normalizeClass(r.class_name, isElective).toUpperCase();
        const key = r.dept+"|||"+r.faculty+"|||"+r.subject+"|||"+clsBase;
        if (!map[key]) map[key] = { dept:r.dept, Faculty:r.faculty, Subject:r.subject, Class:clsBase, CreditHrs:r.lec_lab||"Lec", lecSlots:new Set(), labDays:new Set(), clsSections:new Set() };
        const isLab = (r.lec_lab||"").toLowerCase().includes("lab")||(r.lec_lab||"").toLowerCase().includes("prac");
        if (isElective) { const sm = r.class_name.toUpperCase().match(/\d+([A-Z])$/); if(sm) map[key].clsSections.add(sm[1]); }
        if (isLab) map[key].labDays.add(r.day);
        else map[key].lecSlots.add(r.day+"|||"+r.time_start);
      }

      const result = {};
      for (const [key, item] of Object.entries(map)) {
        let tbc = 0;
        item.lecSlots.forEach(slot => { tbc += countWeekday(slot.split("|||")[0]); });
        item.labDays.forEach(day => { tbc += countWeekday(day); });
        let displayClass = item.Class;
        if (item.clsSections.size > 0) displayClass = item.Class + [...item.clsSections].sort().join("");
        if (!result[item.dept]) result[item.dept] = {};
        const subKey = item.Faculty+"|||"+item.Subject+"|||"+item.Class;
        result[item.dept][subKey] = {
          Faculty:item.Faculty, Subject:item.Subject, Class:displayClass,
          CreditHrs:item.CreditHrs, ToBeConducted:tbc,
          Missed:0, Makeup:0, Late:0,
          MissedDates:[], MakeupDates:[], LateDates:[],
          GrandTotal:0, _ms:new Set(), _mk:new Set(), _lt:new Set()
        };
      }

      const labBuckets = {};
      for (const r of rows) {
        if (!r.type || r.type.trim()==="") continue;
        if (!r.entry_date) continue;
        const edRaw = r.entry_date_str || formatDate(r.entry_date);
        const ed = edRaw ? new Date(edRaw+"T00:00:00") : null;
        if (!ed || ed < filterStart || ed > filterEnd) continue;
        const isElective = (r.elective||"").toLowerCase()==="elective";
        const clsBase = normalizeClass(r.class_name, isElective).toUpperCase();
        const subKey = r.faculty+"|||"+r.subject+"|||"+clsBase;
        const rec = result[r.dept] && result[r.dept][subKey];
        if (!rec) continue;
        const dtStr = r.entry_date_str || formatDate(r.entry_date);
        const typeLow = (r.type||"").toLowerCase();
        const isLab = (r.lec_lab||"").toLowerCase().includes("lab")||(r.lec_lab||"").toLowerCase().includes("prac");
        if (isLab) {
          const lk = JSON.stringify({dept:r.dept,fac:r.faculty,sub:r.subject,cls:clsBase,dt:dtStr,tp:typeLow});
          if (!labBuckets[lk]) labBuckets[lk]=[];
          labBuckets[lk].push(r.time_start||"");
          continue;
        }
        const sk = r.faculty+"|||"+r.subject+"|||"+clsBase+"|||"+dtStr+"|||"+(r.time_start||"");
        const dtShort = dtStr.split('T')[0];
        if (typeLow==="missed" && !rec._ms.has(sk)) { rec.Missed++; rec._ms.add(sk); if(!rec.MissedDates.find(x=>x.date===dtShort)) rec.MissedDates.push({date:dtShort,remarks:r.remarks||""}); }
        else if (typeLow==="makeup" && !rec._mk.has(sk)) { rec.Makeup++; rec._mk.add(sk); if(!rec.MakeupDates.find(x=>x.date===dtShort)) rec.MakeupDates.push({date:dtShort,remarks:r.remarks||""}); }
        else if (typeLow==="late" && !rec._lt.has(sk)) { rec.Late++; rec._lt.add(sk); if(!rec.LateDates.find(x=>x.date===dtShort)) rec.LateDates.push({date:dtShort,remarks:r.remarks||""}); }
      }

      for (const [k, times] of Object.entries(labBuckets)) {
        times.sort();
        const obj = JSON.parse(k);
        const rec = result[obj.dept] && result[obj.dept][obj.fac+"|||"+obj.sub+"|||"+obj.cls];
        if (!rec) continue;
        let blocks=1;
        for (let i=1;i<times.length;i++) {
          const p=(times[i-1]||"00:00").split(":"),c=(times[i]||"00:00").split(":");
          if (parseInt(c[0])*60+parseInt(c[1]) !== parseInt(p[0])*60+parseInt(p[1])+60) blocks++;
        }
        const dtShort2 = obj.dt.split('T')[0];
        if (obj.tp==="missed") { rec.Missed+=blocks; if(!rec.MissedDates.includes(dtShort2)) rec.MissedDates.push(dtShort2); }
        else if (obj.tp==="makeup") { rec.Makeup+=blocks; if(!rec.MakeupDates.includes(dtShort2)) rec.MakeupDates.push(dtShort2); }
        else if (obj.tp==="late") { rec.Late+=blocks; if(!rec.LateDates.includes(dtShort2)) rec.LateDates.push(dtShort2); }
      }

      for (const dept of Object.keys(result)) {
        for (const rec of Object.values(result[dept])) {
          rec.GrandTotal = rec.ToBeConducted - rec.Missed + rec.Makeup + rec.Late;
          rec.MissedDates.sort((a,b)=>a.date>b.date?1:-1); rec.MakeupDates.sort((a,b)=>a.date>b.date?1:-1); rec.LateDates.sort((a,b)=>a.date>b.date?1:-1);
          delete rec._ms; delete rec._mk; delete rec._lt;
        }
      }
      return json(res, 200, result);
    } catch (e) { return json(res, 500, { error: e.message }); }
  }

  // ========== ENTRIES ROUTE ==========

  if (method === "POST" && pathname === "/api/entries") {
    const { Faculty, Subject, Class, Date: date, Location, Time, EndTime, Type, User, scheduleId } = body;
    if (!Faculty || !Subject || !Class || !date || !Type) {
      return json(res, 400, { success: false, message: "Missing required fields" });
    }
    try {
      const ref = await db.query(
        "SELECT dept, lec_lab FROM public.weekly_schedule WHERE faculty = $1 AND subject = $2 AND class_name = $3 AND (type IS NULL OR type = '') LIMIT 1",
        [Faculty, Subject, Class]
      );
      const dept = ref.rows[0]?.dept || '';
      const lecLab = ref.rows[0]?.lec_lab || 'Lec';
      const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      const dayName = dayNames[new Date(date + 'T00:00:00').getDay()];
      const startH = timeToHour(Time);
      const endH = timeToHour(EndTime);
      const actualEndH = endH > startH ? endH : startH + 1;

      const clashErrors = [];
      for (let h = startH; h < actualEndH; h++) {
        const slotTime = hourLabel(h);
        // 1. Duplicate check: same faculty+class+date+time
        const dupCheck = await db.query(
          "SELECT id FROM public.weekly_schedule WHERE LOWER(faculty)=LOWER($1) AND LOWER(class_name)=LOWER($2) AND entry_date=$3::date AND time_start=$4 LIMIT 1",
          [Faculty, Class, date, slotTime]
        );
        if (dupCheck.rows.length > 0) continue;

        // 2. Class clash: same class already has a session at this time on this date
        const classClash = await db.query(
          `SELECT id, subject FROM public.weekly_schedule WHERE LOWER(class_name)=LOWER($1) AND time_start=$2 AND (
            (entry_date IS NULL AND day=$3) OR (entry_date=$4::date)
          ) AND LOWER(COALESCE(type,'')) != 'missed' LIMIT 1`,
          [Class, slotTime, dayName, date]
        );
        if (classClash.rows.length > 0) {
          clashErrors.push(`Class ${Class} already has "${classClash.rows[0].subject}" at ${slotTime} on ${date}`);
          continue;
        }

        // 3. Faculty clash: same faculty at same time on same date
        // ALLOWED if same subject (combined section with different class)
        const facClash = await db.query(
          `SELECT id, subject, class_name FROM public.weekly_schedule WHERE LOWER(faculty)=LOWER($1) AND time_start=$2 AND (
            (entry_date IS NULL AND day=$3) OR (entry_date=$4::date)
          ) AND LOWER(COALESCE(type,'')) != 'missed' LIMIT 1`,
          [Faculty, slotTime, dayName, date]
        );
        if (facClash.rows.length > 0) {
          const isCombined = facClash.rows[0].subject.trim().toLowerCase() === Subject.trim().toLowerCase();
          if (!isCombined) {
            clashErrors.push(`Faculty ${Faculty} is busy with "${facClash.rows[0].subject}" (${facClash.rows[0].class_name}) at ${slotTime} on ${date}`);
            continue;
          }
          // Combined section: same faculty+subject, different class — allowed, no clash
        }

        // 4. Location clash: same room already occupied at this time on this date
        if (Location && Location.trim()) {
          const locClash = await db.query(
            `SELECT id, faculty, class_name FROM public.weekly_schedule WHERE LOWER(location)=LOWER($1) AND time_start=$2 AND (
              (entry_date IS NULL AND day=$3) OR (entry_date=$4::date)
            ) AND LOWER(COALESCE(type,'')) != 'missed' LIMIT 1`,
            [Location, slotTime, dayName, date]
          );
          if (locClash.rows.length > 0) {
            // Allow if same faculty+subject (combined section using same room)
            const sameFac = locClash.rows[0].faculty.trim().toLowerCase() === Faculty.trim().toLowerCase();
            if (!sameFac) {
              clashErrors.push(`Location ${Location} is occupied by ${locClash.rows[0].faculty} (${locClash.rows[0].class_name}) at ${slotTime} on ${date}`);
              continue;
            }
          }
        }

        await db.query(
          "INSERT INTO public.weekly_schedule (faculty, subject, class_name, dept, day, location, time_start, time_end, lec_lab, type, entry_date, user_email, schedule_id, sort_key) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)",
          [Faculty, Subject, Class, dept, dayName, Location || '', slotTime, hourLabel(h+1), lecLab, Type.toLowerCase(), date, User || '', scheduleId ?? null, h * 60]
        );
      }
      if (clashErrors.length > 0 && (actualEndH - startH) === clashErrors.length) {
        return json(res, 409, { success: false, clash: true, message: "⚠️ Clash detected:\n\n" + clashErrors.join("\n") + "\n\nCombined sections (same faculty+subject) are allowed." });
      }
      return json(res, 200, { success: true, message: 'Saved ' + (actualEndH - startH) + ' hour(s) as ' + Type });
    } catch (e) { return json(res, 500, { error: e.message }); }
  }

  // ========== HOLIDAYS ROUTES ==========

  if (method === "GET" && pathname === "/api/holidays") {
    const scheduleId = reqUrl.searchParams.get("scheduleId");
    const sidInt = scheduleId && !isNaN(parseInt(scheduleId)) ? parseInt(scheduleId) : null;
    try {
      // Ensure schedule_id column exists
      await db.query("ALTER TABLE public.holidays ADD COLUMN IF NOT EXISTS schedule_id INTEGER REFERENCES public.schedules(id) ON DELETE CASCADE");
      const r = sidInt
        ? await db.query("SELECT id, date::text as date, trim(both '\r\n' from description) as name FROM public.holidays WHERE schedule_id = $1 ORDER BY date", [sidInt])
        : await db.query("SELECT id, date::text as date, trim(both '\r\n' from description) as name FROM public.holidays WHERE schedule_id IS NULL ORDER BY date");
      return json(res, 200, r.rows);
    } catch (e) { return json(res, 500, { error: e.message }); }
  }

  if (method === "POST" && pathname === "/api/holidays") {
    const { date, name } = body;
    if (!date || !name) return json(res, 400, { success: false, message: "date and name required" });
    try {
      const sid2 = body.scheduleId && !isNaN(parseInt(body.scheduleId)) ? parseInt(body.scheduleId) : null;
      const r2 = await db.query("INSERT INTO public.holidays (id, date, description, schedule_id) VALUES (nextval('public.holidays_id_seq'), $1, trim($2), $3) RETURNING id, date::text as date, description as name", [date, name, sid2]);
      return json(res, 200, { success: true, holiday: r2.rows[0] });
    } catch (e) { return json(res, 500, { error: e.message }); }
  }

  if (method === "DELETE" && pathname === "/api/holidays") {
    const id = reqUrl.searchParams.get("id");
    if (!id) return json(res, 400, { success: false, message: "id required" });
    try {
      await db.query("DELETE FROM public.holidays WHERE id = $1", [id]);
      return json(res, 200, { success: true });
    } catch (e) { return json(res, 500, { error: e.message }); }
  }

  // ========== IMPORT / SAMPLE ROUTES ==========

  if (method === "POST" && pathname === "/api/import/schedule") {
    const { rows, scheduleId } = body;
    if (!rows || !Array.isArray(rows) || rows.length === 0) return json(res, 400, { success: false, message: "No rows to import" });
    try {
      let imported = 0;
      const dayOrder = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
      for (const row of rows) {
        const faculty = row.Faculty || row.faculty || "";
        const subject = row.Subject || row.subject || "";
        const className = row.Class || row.class_name || row["Class Name"] || "";
        const dept = row.Deptt || row.dept || row.Department || "";
        const day = row.Day || row.day || "";
        const location = row.Location || row.location || row.Room || "";
        const timeStart = row.Time || row.time_start || row["Start Time"] || "";
        const timeEnd = row.EndTime || row.time_end || row["End Time"] || "";
        const lecLab = row.LecLab || row.lec_lab || row["Lec/Lab"] || "Lec";
        const elective = row.Elective || row.elective || "";
        const userEmail = row.UserEmail || row.user_email || row["Email of User"] || "";
        if (!faculty || !subject || !className || !day) continue;
        const dayNum = dayOrder[day] || 0;
        const timeMatch = timeStart.match(/(\d+):(\d+)\s*(AM|PM)/i);
        let hourNum = 0;
        if (timeMatch) {
          let h = parseInt(timeMatch[1]);
          if (timeMatch[3].toUpperCase() === 'PM' && h !== 12) h += 12;
          if (timeMatch[3].toUpperCase() === 'AM' && h === 12) h = 0;
          hourNum = h;
        }
        let minNum = 0;
        if (timeMatch) minNum = parseInt(timeMatch[2]) || 0;
        const sortKey = hourNum * 60 + minNum;  // minutes format for grid display
        await db.query(
          "INSERT INTO public.weekly_schedule (faculty, subject, class_name, dept, day, location, time_start, time_end, lec_lab, elective, user_email, sort_key, schedule_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
          [faculty, subject, className, dept, day, location, timeStart, timeEnd, lecLab, elective, userEmail, sortKey, (scheduleId ? parseInt(scheduleId) : null)]
        );
        imported++;
      }
      return json(res, 200, { success: true, imported });
    } catch (e) { return json(res, 500, { error: e.message }); }
  }

  // MUST be before generic /sample catch-all
  if (method === "GET" && pathname === "/api/import/sample/schedule") {
    const csv = "Faculty,Subject,Class,Deptt,Day,Time,End Time,Location,Lec/Lab,Elective,Email of User\nDr. Example,Linear Algebra,2K24-BEE-14A,ECE,Mon,09:00 AM,10:00 AM,CR-01,Lec,,user@seecs.edu.pk\n";
    res.writeHead(200, { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=SampleWeeklySchedule.csv", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-cache" });
    res.end(csv);
    return;
  }

  // ========== STUDENTS & ATTENDANCE ROUTES ==========

  // GET /api/attendance/students/all - summary grouped by class
  if (method === "GET" && pathname === "/api/attendance/students/all") {
    const scheduleId = reqUrl.searchParams.get("scheduleId");
    if (!scheduleId) return json(res, 400, { error: "scheduleId required" });
    try {
      const r = await db.query(
        `SELECT s.id, s.class_name, s.roll_no, s.name, s.email, s.created_at,
                w.subject, w.faculty
         FROM public.students s
         LEFT JOIN (
           SELECT DISTINCT class_name, subject, faculty FROM public.weekly_schedule
           WHERE schedule_id = $1 AND (type IS NULL OR type = '') AND class_name != '_ref_'
         ) w ON w.class_name = s.class_name
         WHERE s.schedule_id = $1
         ORDER BY s.class_name, w.subject, s.roll_no`,
        [parseInt(scheduleId)]
      );
      return json(res, 200, r.rows.map(s => ({
        id: s.id, className: s.class_name, rollNo: s.roll_no, name: s.name,
        email: s.email || "", enrolledAt: s.created_at ? s.created_at.toISOString().split("T")[0] : "",
        subject: s.subject || "", faculty: s.faculty || ""
      })));
    } catch(e) { return json(res, 500, { error: String(e) }); }
  }

  // GET /api/attendance/students
  if (method === "GET" && pathname === "/api/attendance/students") {
    const scheduleId = reqUrl.searchParams.get("scheduleId");
    const className = reqUrl.searchParams.get("className");
    if (!scheduleId || !className) return json(res, 400, { error: "scheduleId and className required" });
    try {
      const r = await db.query(
        "SELECT id, schedule_id, class_name, roll_no, name, email, created_at FROM public.students WHERE schedule_id=$1 AND class_name=$2 ORDER BY roll_no",
        [parseInt(scheduleId), className]
      );
      return json(res, 200, r.rows.map(s => ({
        id: s.id, scheduleId: s.schedule_id, className: s.class_name,
        rollNo: s.roll_no, name: s.name, email: s.email || "",
        enrolledAt: s.created_at ? s.created_at.toISOString().split("T")[0] : ""
      })));
    } catch(e) { return json(res, 500, { error: String(e) }); }
  }

  // POST /api/import/students/csv — bulk enroll from parsed CSV rows
  if (method === "POST" && pathname === "/api/import/students/csv") {
    const { rows, scheduleId, className } = body;
    if (!rows || !Array.isArray(rows) || rows.length === 0 || !scheduleId || !className) return json(res, 400, { error: "rows, scheduleId, className required" });
    try {
      let inserted = 0, skipped = 0;
      for (const row of rows) {
        const g = (...names) => { for (const n of names) { for (const k of Object.keys(row)) { if (String(k).trim().toLowerCase() === n) { const v = String(row[k] || "").trim(); if (v) return v; } } } return ""; };
        const rollNo = g("reg no", "regno", "roll no", "rollno", "registration no");
        const name = g("student name", "studentname", "name");
        const email = g("email", "e-mail", "email (optional)");
        const waRaw = g("whatsapp", "whatsapp no", "whatsapp number", "phone", "mobile", "contact");
        const wd = String(waRaw || "").replace(/[^0-9]/g, "");
        const whatsapp = !wd ? "" : (wd.length === 11 && wd.startsWith("0")) ? "+92" + wd.slice(1) : wd.startsWith("92") ? "+" + wd : (wd.length === 10 && wd.startsWith("3")) ? "+92" + wd : "+" + wd;
        if (!rollNo || !name) { skipped++; continue; }
        try {
          await db.query(
            "INSERT INTO public.students (schedule_id, class_name, roll_no, name, email, whatsapp, created_at) VALUES ($1,$2,$3,$4,$5,$6,NOW())",
            [parseInt(scheduleId), className, rollNo.toUpperCase(), name, email, whatsapp]
          );
          inserted++;
        } catch (e2) { skipped++; }
      }
      return json(res, 200, { success: true, inserted, skipped });
    } catch (e) { return json(res, 500, { error: e.message }); }
  }

  // POST /api/attendance/students
  if (method === "POST" && pathname === "/api/attendance/students") {
    const { scheduleId, className, rollNo, name, email, whatsapp } = body;
    const wd0 = String(whatsapp || "").replace(/[^0-9]/g, "");
    const waNorm = !wd0 ? "" : (wd0.length === 11 && wd0.startsWith("0")) ? "+92" + wd0.slice(1) : wd0.startsWith("92") ? "+" + wd0 : (wd0.length === 10 && wd0.startsWith("3")) ? "+92" + wd0 : "+" + wd0;
    if (!scheduleId || !className || !rollNo || !name) return json(res, 400, { error: "scheduleId, className, rollNo, name required" });
    try {
      const r = await db.query(
        "INSERT INTO public.students (schedule_id, class_name, roll_no, name, email, whatsapp, created_at) VALUES ($1,$2,$3,$4,$5,$6,NOW()) RETURNING id, schedule_id, class_name, roll_no, name, email, created_at",
        [scheduleId, className, rollNo.toUpperCase(), name, email || "", waNorm]
      );
      const s = r.rows[0];
      return json(res, 200, { success: true, student: {
        id: s.id, scheduleId: s.schedule_id, className: s.class_name,
        rollNo: s.roll_no, name: s.name, email: s.email || "",
        enrolledAt: s.created_at ? s.created_at.toISOString().split("T")[0] : ""
      }});
    } catch(e) {
      if (String(e).includes("unique") || String(e).includes("duplicate")) return json(res, 409, { error: "Student already enrolled" });
      return json(res, 500, { error: String(e) });
    }
  }

  // DELETE /api/attendance/students/:id
  if (method === "DELETE" && pathname.match(/^\/api\/attendance\/students\/\d+$/)) {
    const id = parseInt(pathname.split("/").pop());
    try {
      await db.query("DELETE FROM public.students WHERE id=$1", [id]);
      return json(res, 200, { success: true });
    } catch(e) { return json(res, 500, { error: String(e) }); }
  }

  // POST /api/attendance/mark
  if (method === "POST" && pathname === "/api/attendance/mark") {
    const { scheduleId, className, date, sessionTime, records } = body;
    if (!scheduleId || !className || !date || !records) return json(res, 400, { error: "Missing required fields" });
    try {
      // Check if this session is locked (missed entry exists)
      const lockCheck = await db.query(
        `SELECT id FROM public.weekly_schedule WHERE schedule_id=$1 AND LOWER(class_name)=LOWER($2) AND LOWER(type)='missed' AND entry_date::date=$3::date LIMIT 1`,
        [body.scheduleId||reqUrl.searchParams.get("scheduleId"), body.className||body.class_name, body.date]
      );
      if (lockCheck.rows.length > 0) return json(res, 403, { error: "Session locked: class was marked as Missed on this date. Attendance cannot be taken.", locked: true });
      // Check if date is a Gazetted Holiday
      const holidayCheck = await db.query(
        "SELECT description FROM public.holidays WHERE schedule_id=$1 AND date::date=$2::date LIMIT 1",
        [body.scheduleId, body.date]
      );
      if (holidayCheck.rows.length > 0) return json(res, 403, { error: "Gazetted Holiday: " + (holidayCheck.rows[0].description || "Holiday") + ". Attendance cannot be taken on a public holiday.", locked: true });
      // ---- Queue WhatsApp notifications for Absent / Leave students ----
      try {
        const ne = await db.query("SELECT value FROM public.app_settings WHERE key='notifications_enabled'");
        if (ne.rows[0] && ne.rows[0].value === 'false') throw { __skip: true };
        const recPairs = Array.isArray(records) ? records.map(rr => [rr.rollNo || rr.roll_no, rr.status]) : Object.entries(records);
        const dow = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][new Date(String(date) + "T00:00:00").getDay()];
        const meta = await db.query(
          "SELECT faculty, subject, time_end FROM public.weekly_schedule WHERE schedule_id=$1 AND LOWER(class_name)=LOWER($2) AND LOWER(day)=LOWER($3) AND time_start=$4 AND entry_date IS NULL LIMIT 1",
          [parseInt(scheduleId), className, dow, sessionTime || ""]
        );
        const fac = meta.rows[0] ? meta.rows[0].faculty : "";
        const subj = meta.rows[0] ? meta.rows[0].subject : "";
        const tEnd = meta.rows[0] ? meta.rows[0].time_end : "";
        const flagged = recPairs.filter(p => p[1] === "A" || p[1] === "L");
        if (flagged.length) {
          const studs = await db.query(
            "SELECT roll_no, name, COALESCE(whatsapp,'') AS whatsapp FROM public.students WHERE schedule_id=$1 AND class_name=$2 AND roll_no = ANY($3)",
            [parseInt(scheduleId), className, flagged.map(p => p[0])]
          );
          const byRoll = {}; studs.rows.forEach(s => { byRoll[s.roll_no] = s; });
          for (const p of flagged) {
            const s = byRoll[p[0]]; if (!s) continue;
            const word = p[1] === "A" ? "ABSENT" : "ON LEAVE";
            const msgTxt = "Dear " + (s.name || p[0]) + ", you have been marked " + word +
              " for " + (subj || "class") + " (" + className + ") on " + dow + " " + date +
              (sessionTime ? " at " + sessionTime + (tEnd ? "-" + tEnd : "") : "") +
              (fac ? " (Faculty: " + fac + ")" : "") + ". - AcadTrack";
            await db.query(
              "INSERT INTO public.notifications (schedule_id, class_name, roll_no, student_name, whatsapp, date, session_time, message, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending') ON CONFLICT (schedule_id, class_name, roll_no, date, session_time) DO NOTHING",
              [parseInt(scheduleId), className, p[0], s.name || p[0], s.whatsapp || "", String(date), sessionTime || "", msgTxt]
            );
          }
        }
        const okRolls = recPairs.filter(p => p[1] !== "A" && p[1] !== "L").map(p => p[0]);
        if (okRolls.length) await db.query(
          "DELETE FROM public.notifications WHERE schedule_id=$1 AND class_name=$2 AND date=$3 AND session_time=$4 AND status='pending' AND roll_no = ANY($5)",
          [parseInt(scheduleId), className, String(date), sessionTime || "", okRolls]
        );
      } catch (eN) { console.log("notify queue error:", String(eN)); }
      let saved = 0, failed = 0;
      for (const rec of records) {
        try {
          let studentId = rec.studentId;
          // If no studentId, look up by rollNo
          if (!studentId && rec.rollNo) {
            const sr = await db.query(
              "SELECT id FROM public.students WHERE schedule_id=$1 AND class_name=$2 AND roll_no=$3 LIMIT 1",
              [scheduleId, className, rec.rollNo]
            );
            if (sr.rows.length) studentId = sr.rows[0].id;
          }
          if (!studentId) { failed++; continue; }
          await db.query(
            `INSERT INTO public.attendance (schedule_id, class_name, roll_no, date, session_time, status)
             VALUES ($1,$2,$3,$4,$5,$6)
             ON CONFLICT (schedule_id, class_name, roll_no, date, session_time)
             DO UPDATE SET status=$6`,
            [scheduleId, className, rec.rollNo || String(studentId), date, sessionTime || "", rec.status]
          );
          saved++;
        } catch { failed++; }
      }
      return json(res, 200, { success: true, saved, failed });
    } catch(e) { return json(res, 500, { error: String(e) }); }
  }

  // GET /api/attendance/roster
  if (method === "GET" && pathname === "/api/attendance/roster") {
    const scheduleId = reqUrl.searchParams.get("scheduleId");
    const className = reqUrl.searchParams.get("className");
    if (!scheduleId || !className) return json(res, 400, { error: "scheduleId and className required" });
    try {
      const r = await db.query(
        `SELECT a.date, a.session_time, a.status, a.roll_no,
                COALESCE(s.name, '') as name
         FROM public.attendance a
         LEFT JOIN public.students s ON s.schedule_id=a.schedule_id AND s.class_name=a.class_name AND s.roll_no=a.roll_no
         WHERE a.schedule_id=$1 AND a.class_name=$2
         ORDER BY a.date, a.session_time, a.roll_no`,
        [parseInt(scheduleId), className]
      );
      // Also return students list for this class
      const stu = await db.query(
        `SELECT id, roll_no, name, email FROM public.students
         WHERE schedule_id=$1 AND class_name=$2 ORDER BY roll_no`,
        [parseInt(scheduleId), className]
      );
      // Build slot keys and student records map
      const slotKeySet = new Set();
      const studentMap = {};
      for (const row of r.rows) {
        let d;
        try { d = row.date instanceof Date ? row.date.toISOString().slice(0,10) : String(row.date).slice(0,10); }
        catch(e) { d = String(row.date).slice(0,10); }
        const t = row.session_time || "";
        const slotKey = t ? `${d}|${t}` : d;
        slotKeySet.add(slotKey);
        const rn = row.roll_no || String(row.student_id);
        if (!studentMap[rn]) studentMap[rn] = { rollNo: rn, name: row.name || "", records: {} };
        studentMap[rn].records[slotKey] = row.status;
      }
      const dates = [...slotKeySet].sort();
      // Build complete rows for ALL students (including those with no attendance)
      const allRows = stu.rows.map(s => {
        const existing = studentMap[s.roll_no] || { rollNo: s.roll_no, name: s.name, records: {} };
        const records = existing.records;
        const statuses = Object.values(records);
        const presentCount = statuses.filter(v => v === "P").length;
        const absentCount = statuses.filter(v => v === "A").length;
        const leaveCount = statuses.filter(v => v === "L").length;
        const total = presentCount + absentCount + leaveCount;
        const percentage = total > 0 ? Math.round((presentCount / total) * 100) : 0;
        return { rollNo: s.roll_no, name: s.name, records, presentCount, absentCount, leaveCount, percentage };
      });
      return json(res, 200, {
        dates,
        students: stu.rows.map(s => ({ id: s.id, rollNo: s.roll_no, name: s.name, email: s.email })),
        rows: allRows
      });
    } catch(e) { return json(res, 500, { error: String(e) }); }
  }

  // GET /api/attendance/summary
  if (method === "GET" && pathname === "/api/attendance/summary") {
    const scheduleId = reqUrl.searchParams.get("scheduleId");
    const className = reqUrl.searchParams.get("className");
    if (!scheduleId || !className) return json(res, 400, { error: "scheduleId and className required" });
    try {
      const r = await db.query(
        `SELECT s.roll_no, s.name, s.email,
                COUNT(a.id) as total,
                SUM(CASE WHEN a.status='P' THEN 1 ELSE 0 END) as present,
                SUM(CASE WHEN a.status='A' THEN 1 ELSE 0 END) as absent,
                SUM(CASE WHEN a.status='L' THEN 1 ELSE 0 END) as late
         FROM public.students s
         LEFT JOIN public.attendance a ON a.student_id=s.id AND a.schedule_id=$1 AND a.class_name=$2
         WHERE s.schedule_id=$1 AND s.class_name=$2
         GROUP BY s.id, s.roll_no, s.name, s.email
         ORDER BY s.roll_no`,
        [parseInt(scheduleId), className]
      );
      return json(res, 200, r.rows.map(row => ({
        rollNo: row.roll_no, name: row.name, email: row.email || "",
        total: parseInt(row.total)||0, present: parseInt(row.present)||0,
        absent: parseInt(row.absent)||0, late: parseInt(row.late)||0
      })));
    } catch(e) { return json(res, 500, { error: String(e) }); }
  }

  // POST /api/import/students/csv
  if (method === "POST" && pathname === "/api/import/students/csv") {
    const { rows, scheduleId, className } = body;
    if (!rows || !scheduleId || !className) return json(res, 400, { error: "rows, scheduleId and className required" });
    try {
      let inserted = 0, skipped = 0;
      for (const row of rows) {
        const rollNo = (row["Roll No"] || row["roll_no"] || row["RollNo"] || row["Reg No"] || row["RegNo"] || "").trim();
        const name = (row["Name"] || row["name"] || row["Student Name"] || "").trim();
        const email = (row["Email"] || row["email"] || "").trim();
        if (!rollNo || !name) { skipped++; continue; }
        // Always use the className passed from frontend (selected class), ignore Class column in CSV
        try {
          await db.query(
            "INSERT INTO public.students (schedule_id, class_name, roll_no, name, email) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (schedule_id, class_name, roll_no) DO NOTHING",
            [parseInt(scheduleId), className.trim(), rollNo, name, email]
          );
          inserted++;
        } catch { skipped++; }
      }
      return json(res, 200, { success: true, inserted, skipped });
    } catch(e) { return json(res, 500, { error: e.message }); }
  }

  if (method === "GET" && pathname === "/api/import/sample/students") {
    const csv = "Reg No,Student Name,Email,WhatsApp\n2K24-BEE6-001,Ali Hassan,ali@example.com,3001234567\n2K24-BEE6-002,Sara Ahmed,sara@example.com,3012345678\n";
    res.writeHead(200, { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=SampleStudents.csv", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-cache" });
    res.end(csv);
    return;
  }

  // Finance sample CSV downloads - dynamic with actual data
  if (method === "GET" && pathname === "/api/finance/rates/sample") {
    const personType = reqUrl.searchParams.get("personType") || "student";
    const scheduleId = reqUrl.searchParams.get("scheduleId");
    const period = reqUrl.searchParams.get("period") || "";
    const amtCol = personType === "student" ? "Fee (Rs)" : "Pay (Rs)";
    let csv = "";
    try {
      // Get existing rates
      const ratesMap = {};
      if (scheduleId) {
        const rr = await db.query("SELECT COALESCE(label,person_id) as name, COALESCE(rate,0) as rate FROM public.finance_rates WHERE schedule_id=$1 AND person_type=$2", [parseInt(scheduleId), personType]);
        rr.rows.forEach(r => { ratesMap[r.name] = parseFloat(r.rate)||0; });
      }
      // Get existing payments for period
      const paidMap = {};
      if (scheduleId && period) {
        const pr = await db.query("SELECT person_name, COALESCE(amount,0) as amount, COALESCE(paid_amount,0) as paid FROM public.finance_payments WHERE schedule_id=$1 AND person_type=$2 AND period=$3", [parseInt(scheduleId), personType, period]);
        pr.rows.forEach(p => { paidMap[p.person_name] = { amount: parseFloat(p.amount)||0, paid: parseFloat(p.paid)||0 }; });
      }
      csv = `Name / ID,${amtCol},Paid (Rs),Balance (Rs)\n`;
      if (personType === "student" && scheduleId) {
        const r = await db.query("SELECT roll_no, name FROM public.students WHERE schedule_id=$1 ORDER BY roll_no", [parseInt(scheduleId)]);
        if (r.rows.length > 0) {
          r.rows.forEach(s => {
            const key = `${s.name} (${s.roll_no})`;
            const rate = ratesMap[key] || ratesMap[s.name] || 0;
            const paid = paidMap[key] || paidMap[s.name] || { amount: rate, paid: 0 };
            csv += `"${key}",${paid.amount||rate},${paid.paid},${(paid.amount||rate)-paid.paid}\n`;
          });
        } else { csv += `Ali Khan (2K24-001),15000,0,15000\n`; }
      } else if (personType === "faculty" && scheduleId) {
        const r = await db.query("SELECT DISTINCT faculty FROM public.weekly_schedule WHERE schedule_id=$1 AND faculty != '_locations_' AND (type IS NULL OR type='') ORDER BY faculty", [parseInt(scheduleId)]);
        if (r.rows.length > 0) {
          r.rows.filter(f => f.faculty).forEach(f => {
            const rate = ratesMap[f.faculty] || 0;
            const paid = paidMap[f.faculty] || { amount: rate, paid: 0 };
            csv += `"${f.faculty}",${paid.amount||rate},${paid.paid},${(paid.amount||rate)-paid.paid}\n`;
          });
        } else { csv += `Dr. Ahmad Shah,80000,0,80000\n`; }
      } else if (personType === "staff" && scheduleId) {
        const r = await db.query("SELECT name FROM public.support_staff WHERE schedule_id=$1 AND (active_to IS NULL OR active_to > NOW()) ORDER BY name", [parseInt(scheduleId)]);
        if (r.rows.length > 0) {
          r.rows.forEach(s => {
            const rate = ratesMap[s.name] || 0;
            const paid = paidMap[s.name] || { amount: rate, paid: 0 };
            csv += `"${s.name}",${paid.amount||rate},${paid.paid},${(paid.amount||rate)-paid.paid}\n`;
          });
        } else { csv += `John Security,25000,0,25000\n`; }
      } else {
        csv += personType === "student" ? `Ali Khan (2K24-001),15000,0,15000\n` : `Dr. Ahmad Shah,80000,0,80000\n`;
      }
    } catch(e) { csv = `Name / ID,${amtCol},Paid (Rs),Balance (Rs)\n`; }
    res.writeHead(200, { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename=${personType}-rates-template.csv`, "Access-Control-Allow-Origin": "*" });
    res.end(csv); return;
  }

  if (method === "GET" && pathname === "/api/finance/staff/sample") {
    const scheduleId = reqUrl.searchParams.get("scheduleId");
    let csv = "Name,Role,Pay (Rs),Contact,Email,WhatsApp\n";
    try {
      if (scheduleId) {
        const r = await db.query("SELECT name, COALESCE(designation,'') as role, COALESCE(email,'') as contact FROM public.support_staff WHERE schedule_id=$1 ORDER BY name", [parseInt(scheduleId)]);
        if (r.rows.length > 0) {
          r.rows.forEach(s => { csv += `"${s.name}","${s.role||""}",0,"${s.contact||""}","",""\n`; });
        } else {
          csv += "John Security,Security Guard,25000,0300-1234567,john@example.com,03001234567\n";
        }
      } else {
        csv += "John Security,Security Guard,25000,0300-1234567,john@example.com,03001234567\n";
      }
    } catch(e) {}
    res.writeHead(200, { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=staff-template.csv", "Access-Control-Allow-Origin": "*" });
    res.end(csv); return;
  }

  if (method === "GET" && pathname === "/api/attendance/students/sample") {
    const csv = "Reg No,Student Name,Email,WhatsApp\n2K24-BEE-001,Ali Hassan,ali@example.com,03001234567\n2K24-BEE-002,Sara Ahmed,sara@example.com,03012345678\n";
    res.writeHead(200, { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=SampleStudents.csv", "Access-Control-Allow-Origin": "*" });
    res.end(csv); return;
  }

  // Generic sample endpoints (MUST be after specific ones)
  if (pathname.includes("/sample")) return json(res, 200, []);


  // POST /api/meeting
  if (method === "POST" && pathname === "/api/meeting") {
    const { date, start, end, faculty, scheduleId } = body;
    try {
      const sidInt = scheduleId && !isNaN(parseInt(scheduleId)) ? parseInt(scheduleId) : null;
      const q = sidInt
        ? await db.query("SELECT * FROM public.weekly_schedule WHERE schedule_id = $1", [sidInt])
        : await db.query("SELECT * FROM public.weekly_schedule WHERE schedule_id IS NULL");
      const rows = q.rows;
      function timeToMin(t) {
        if (!t) return 0;
        const m = t.match(/(\d+):(\d+)\s*(AM|PM)/i);
        if (!m) return 0;
        let h = parseInt(m[1]); const ap = m[3].toUpperCase();
        if (ap==="PM" && h!==12) h+=12; if (ap==="AM" && h===12) h=0;
        return h*60+parseInt(m[2]);
      }
      const dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
      const dayName = dayNames[new Date(date+"T00:00:00").getDay()];
      const startMin = timeToMin(start), endMin = timeToMin(end);
      const allFaculty = [...new Set(rows.map(r=>r.faculty))].sort();
      const targets = (faculty && faculty.length>0) ? faculty : allFaculty;
      const free=[], busy=[];
      for (const name of targets) {
        const dept = rows.find(r=>r.faculty===name)?.dept||"";
        const busyRecs = rows.filter(r => {
          if (r.faculty!==name) return false;
          const rs=timeToMin(r.time_start), re=timeToMin(r.time_end);
          if (rs>=endMin||re<=startMin) return false;
          if (!r.type||r.type==="") return r.day===dayName;
          if (r.entry_date) {
            const ed=new Date(r.entry_date); ed.setHours(0,0,0,0);
            const td=new Date(date+"T00:00:00"); td.setHours(0,0,0,0);
            return ed.getTime()===td.getTime();
          }
          return false;
        }).map(r=>({subject:r.subject,cls:r.class_name,loc:r.location,start:timeToMin(r.time_start),end:timeToMin(r.time_end),type:r.type||"Scheduled"}));
        if (busyRecs.length===0) free.push({name,dept});
        else busy.push({name,dept,records:busyRecs});
      }
      // Calculate department summary
      const summary = {};
      for (const f of free) {
        if (!summary[f.dept]) summary[f.dept] = {free:0, busy:0};
        summary[f.dept].free++;
      }
      for (const b of busy) {
        if (!summary[b.dept]) summary[b.dept] = {free:0, busy:0};
        summary[b.dept].busy++;
      }
      return json(res, 200, {date,dayName,start,end,free,busy,summary});
    } catch(e) { return json(res, 500, {error:e.message}); }
  }


  
  
    
  // DELETE /api/cleanup-null-schedule — remove orphaned rows with no schedule_id
  if (method === "DELETE" && pathname === "/api/cleanup-null-schedule") {
    try {
      const r = await db.query("DELETE FROM public.weekly_schedule WHERE schedule_id IS NULL");
      return json(res, 200, { success: true, deleted: r.rowCount });
    } catch (e) { return json(res, 500, { error: e.message }); }
  }

// POST /api/fix-null-schedule-ids — update NULL schedule_id rows
  if (method === "POST" && pathname === "/api/fix-null-schedule-ids") {
    try {
      const chunks = []; for await (const c of req) chunks.push(c);
      const body = JSON.parse(Buffer.concat(chunks).toString());
      const sid = parseInt(body.scheduleId);
      if (!sid || isNaN(sid)) return json(res, 400, { error: "scheduleId required" });
      const r = await db.query("UPDATE public.weekly_schedule SET schedule_id=$1 WHERE schedule_id IS NULL", [sid]);
      return json(res, 200, { success: true, updated: r.rowCount });
    } catch(e) { return json(res, 500, { error: e.message }); }
  }


  // POST /api/schedule/entries/override — replace all saved entries with uploaded CSV data
  if (method === "POST" && pathname === "/api/schedule/entries/override") {
    const { scheduleId, entries } = body;
    if (!scheduleId || !entries) return json(res, 400, { error: "scheduleId and entries required" });
    try {
      console.log("OVERRIDE: scheduleId="+scheduleId+" entries="+entries.length+" first="+JSON.stringify(entries[0]));
      await db.query("DELETE FROM public.weekly_schedule WHERE schedule_id=$1 AND entry_date IS NOT NULL", [parseInt(scheduleId)]);
      let imported = 0;
      function fixDate(d) {
        if (!d) return null;
        d = String(d).trim().replace(/\r/g,"");
        const mdy = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (mdy) return mdy[3]+"-"+mdy[1].padStart(2,"0")+"-"+mdy[2].padStart(2,"0");
        return d;
      }
      function parseMin(t) {
        if (!t) return 0;
        const m = String(t).match(/(\d+):(\d+)\s*(AM|PM)/i);
        if (!m) return 0;
        let h = parseInt(m[1]); const ap = m[3].toUpperCase();
        if (ap==="PM" && h!==12) h+=12; if (ap==="AM" && h===12) h=0;
        return h*60+parseInt(m[2]);
      }
      for (const e of entries) {
        if (!e.type || !e.entry_date || !e.faculty) continue;
        const entryDate = fixDate(e.entry_date);
        if (!entryDate) continue;
        try {
          await db.query(
            "INSERT INTO public.weekly_schedule (faculty, subject, class_name, dept, day, location, time_start, time_end, lec_lab, type, entry_date, remarks, schedule_id, sort_key) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)",
            [e.faculty.trim(), (e.subject||"").trim(), (e.class_name||"").trim(), (e.dept||"").trim(), (e.day||"").trim(), (e.location||"").trim(), (e.time_start||"").trim(), (e.time_end||"").trim(), (e.lec_lab||"Lec").trim(), e.type.toLowerCase().trim(), entryDate, (e.remarks||"").trim(), parseInt(scheduleId), parseMin(e.time_start)]
          );
          imported++;
        } catch(rowErr) { console.error("Row error:", rowErr.message); }
      }
      return json(res, 200, { success: true, imported });
    } catch(e) { return json(res, 500, { error: e.message }); }
  }

  // POST /api/reassign-entries — reassign orphan entries to a schedule
  if (method === "POST" && pathname === "/api/reassign-entries") {
    const { ids, scheduleId } = body;
    try {
      const result = await db.query(
        "UPDATE public.weekly_schedule SET schedule_id=$1 WHERE id=ANY($2::int[])",
        [parseInt(scheduleId), ids]
      );
      return json(res, 200, { success: true, updated: result.rowCount });
    } catch(e) { return json(res, 500, { error: e.message }); }
  }

  // GET /api/schedule-dates — get start/end dates for a schedule
  if (method === "GET" && pathname === "/api/schedule-dates") {
    const scheduleId = reqUrl.searchParams.get("scheduleId");
    if (!scheduleId) return json(res, 400, { error: "scheduleId required" });
    try {
      const r = await db.query(
        "SELECT start_date, end_date, name FROM public.schedules WHERE id=$1",
        [parseInt(scheduleId)]
      );
      if (!r.rows.length) return json(res, 404, { error: "Not found" });
      const row = r.rows[0];
      return json(res, 200, {
        startDate: row.start_date ? new Date(row.start_date).toISOString().slice(0,10) : null,
        endDate: row.end_date ? new Date(row.end_date).toISOString().slice(0,10) : null,
        name: row.name
      });
    } catch(e) { return json(res, 500, { error: e.message }); }
  }

  // POST /api/schedule/override — clear regular entries, keep makeup/missed/attendance
  if (method === "POST" && pathname === "/api/schedule/override") {
    const { scheduleId } = body;
    if (!scheduleId) return json(res, 400, { error: "scheduleId required" });
    try {
      // Only delete regular schedule rows (type IS NULL or empty) - keeps makeup/missed entries
      const result = await db.query(
        `DELETE FROM public.weekly_schedule
         WHERE schedule_id = $1
         AND (type IS NULL OR type = '')`,
        [parseInt(scheduleId)]
      );
      return json(res, 200, { success: true, deleted: result.rowCount });
    } catch(e) { return json(res, 500, { error: e.message }); }
  }

  // ── STUDENT ACCESS ENDPOINTS ──────────────────────────────

  // ========== FACULTY NOTES API ==========
  // GET /api/notes?facultyName=X&scheduleId=Y
  if (method === "GET" && pathname === "/api/notes") {
    const facultyName = reqUrl.searchParams.get("facultyName");
    const scheduleId = reqUrl.searchParams.get("scheduleId");
    if (!facultyName || !scheduleId) return json(res, 400, { error: "facultyName and scheduleId required" });
    try {
      const r = await db.query(
        "SELECT id, faculty_name, file_name, file_type, file_size, uploaded_at FROM faculty_notes WHERE faculty_name=$1 AND schedule_id=$2 ORDER BY uploaded_at DESC",
        [facultyName, parseInt(scheduleId)]
      );
      return json(res, 200, r.rows);
    } catch(e) { return json(res, 500, { error: e.message }); }
  }

  // GET /api/notes/student?scheduleId=X
  if (method === "GET" && pathname === "/api/notes/student") {
    const scheduleId = reqUrl.searchParams.get("scheduleId");
    if (!scheduleId) return json(res, 400, { error: "scheduleId required" });
    try {
      const r = await db.query(
        "SELECT id, faculty_name, file_name, file_type, file_size, uploaded_at FROM faculty_notes WHERE schedule_id=$1 ORDER BY faculty_name, uploaded_at DESC",
        [parseInt(scheduleId)]
      );
      return json(res, 200, r.rows);
    } catch(e) { return json(res, 500, { error: e.message }); }
  }

  // GET /api/notes/:id/download
  if (method === "GET" && pathname.match(/^\/api\/notes\/\d+\/download$/)) {
    const id = parseInt(pathname.split("/")[3]);
    try {
      const r = await db.query("SELECT * FROM faculty_notes WHERE id=$1", [id]);
      if (!r.rows.length) return json(res, 404, { error: "Not found" });
      const note = r.rows[0];
      const fs = await import("fs");
      if (!fs.existsSync(note.file_path)) return json(res, 404, { error: "File not found on disk" });
      const fileBuffer = fs.readFileSync(note.file_path);
      res.writeHead(200, {
        "Content-Type": note.file_type || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${note.file_name}"`,
        "Content-Length": fileBuffer.length,
        "Access-Control-Allow-Origin": "*",
      });
      res.end(fileBuffer);
      return;
    } catch(e) { return json(res, 500, { error: e.message }); }
  }

  // DELETE /api/notes/:id
  if (method === "DELETE" && pathname.match(/^\/api\/notes\/\d+$/)) {
    const id = parseInt(pathname.split("/").pop());
    try {
      const r = await db.query("SELECT * FROM faculty_notes WHERE id=$1", [id]);
      if (!r.rows.length) return json(res, 404, { error: "Not found" });
      const note = r.rows[0];
      const fs = await import("fs");
      if (fs.existsSync(note.file_path)) fs.unlinkSync(note.file_path);
      await db.query("DELETE FROM faculty_notes WHERE id=$1", [id]);
      return json(res, 200, { success: true });
    } catch(e) { return json(res, 500, { error: e.message }); }
  }

  // POST /api/notes/upload (multipart - base64 encoded)
  if (method === "POST" && pathname === "/api/notes/upload") {
    const { facultyName, scheduleId, fileName, fileType, fileData } = body;
    if (!facultyName || !scheduleId || !fileName || !fileData) return json(res, 400, { error: "Missing required fields" });
    try {
      const MAX_TOTAL = 10 * 1024 * 1024; // 10MB per faculty
      const existing = await db.query(
        "SELECT COALESCE(SUM(file_size),0) as total FROM faculty_notes WHERE faculty_name=$1 AND schedule_id=$2",
        [facultyName, parseInt(scheduleId)]
      );
      const usedBytes = parseInt(existing.rows[0].total);
      const fileBuffer = Buffer.from(fileData, "base64");
      const fileSize = fileBuffer.length;
      if (usedBytes + fileSize > MAX_TOTAL) {
        return json(res, 400, { error: `Storage limit exceeded. Used: ${Math.round(usedBytes/1024)}KB of 10240KB. Please delete some files first.` });
      }
      const fs = await import("fs");
      const path = await import("path");
      const dir = "/home/ubuntu/notes";
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = path.join(dir, `${Date.now()}_${facultyName.replace(/[^a-z0-9]/gi,"_")}_${safeName}`);
      fs.writeFileSync(filePath, fileBuffer);
      const r = await db.query(
        "INSERT INTO faculty_notes (schedule_id, faculty_name, file_name, file_type, file_size, file_path) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
        [parseInt(scheduleId), facultyName, fileName, fileType || "application/octet-stream", fileSize, filePath]
      );
      return json(res, 200, { success: true, id: r.rows[0].id, usedBytes: usedBytes + fileSize, totalBytes: MAX_TOTAL });
    } catch(e) { return json(res, 500, { error: e.message }); }
  }
  // ========== END FACULTY NOTES API ==========

  // GET /api/student-access
  if (method === "GET" && pathname === "/api/student-access") {
    const scheduleId = reqUrl.searchParams.get("scheduleId");
    if (!scheduleId) return json(res, 400, { error: "scheduleId required" });
    try {
      const r = await db.query(
        `SELECT sa.id, sa.schedule_id, sa.student_name, sa.roll_no, sa.username,
                sa.password, sa.class_name, sa.email, sa.created_at
         FROM public.student_accounts sa
         WHERE sa.schedule_id=$1 ORDER BY sa.class_name, sa.student_name`,
        [parseInt(scheduleId)]
      );
      return json(res, 200, r.rows.map(s => ({
        id: s.id, scheduleId: s.schedule_id, studentName: s.student_name,
        rollNo: s.roll_no, username: s.username, password: s.password,
        className: s.class_name, email: s.email, createdAt: s.created_at
      })));
    } catch(e) { return json(res, 500, { error: e.message }); }
  }

  // POST /api/student-access/generate
  if (method === "POST" && pathname === "/api/student-access/generate") {
    const { scheduleId, className } = body;
    if (!scheduleId) return json(res, 400, { error: "scheduleId required" });
    try {
      // Ensure student_accounts table exists
      await db.query(`CREATE TABLE IF NOT EXISTS public.student_accounts (
        id SERIAL PRIMARY KEY,
        schedule_id INTEGER REFERENCES public.schedules(id) ON DELETE CASCADE,
        student_name TEXT NOT NULL,
        roll_no TEXT NOT NULL DEFAULT '',
        class_name TEXT NOT NULL DEFAULT '',
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        email TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMP DEFAULT now(),
        UNIQUE(schedule_id, roll_no)
      )`);
      // Get all students for this schedule (optionally filtered by class)
      const studQuery = className
        ? await db.query("SELECT id, name, roll_no, class_name, email FROM public.students WHERE schedule_id=$1 AND class_name=$2 ORDER BY roll_no, name", [parseInt(scheduleId), className])
        : await db.query("SELECT id, name, roll_no, class_name, email FROM public.students WHERE schedule_id=$1 ORDER BY roll_no, name", [parseInt(scheduleId)]);
      let created = 0, skipped = 0;
      for (const s of studQuery.rows) {
        const existing = await db.query("SELECT id FROM public.student_accounts WHERE schedule_id=$1 AND roll_no=$2", [parseInt(scheduleId), s.roll_no]);
        if (existing.rows.length) { skipped++; continue; }
        // Generate username from roll_no (e.g. 2K22-EE-01 → 2k22ee01) + random suffix
        const base = (s.roll_no || s.name || "student").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10);
        const username = base + Math.floor(100 + Math.random() * 900);
        const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
        const password = Array.from({length: 8}, () => chars[Math.floor(Math.random() * chars.length)]).join("");
        try {
          await db.query(
            "INSERT INTO public.student_accounts (schedule_id, student_name, roll_no, class_name, username, password, email) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (schedule_id, roll_no) DO NOTHING",
            [parseInt(scheduleId), s.name, s.roll_no, s.class_name, username, password, s.email || ""]
          );
          created++;
          // Email sending temporarily disabled - re-enable after Gmail unlocks
          // if (s.email && s.email.includes("@")) { sendCredentialEmail(...) }
        } catch { skipped++; }
      }
      return json(res, 200, { success: true, created, skipped });
    } catch(e) { return json(res, 500, { error: e.message }); }
  }


  // ========== FACULTY NOTES API ==========
  // GET /api/notes?facultyName=X&scheduleId=Y
  if (method === "GET" && pathname === "/api/notes") {
    const facultyName = reqUrl.searchParams.get("facultyName");
    const scheduleId = reqUrl.searchParams.get("scheduleId");
    if (!facultyName || !scheduleId) return json(res, 400, { error: "facultyName and scheduleId required" });
    try {
      const r = await db.query(
        "SELECT id, faculty_name, file_name, file_type, file_size, uploaded_at FROM faculty_notes WHERE faculty_name=$1 AND schedule_id=$2 ORDER BY uploaded_at DESC",
        [facultyName, parseInt(scheduleId)]
      );
      return json(res, 200, r.rows);
    } catch(e) { return json(res, 500, { error: e.message }); }
  }

  // GET /api/notes/student?scheduleId=X
  if (method === "GET" && pathname === "/api/notes/student") {
    const scheduleId = reqUrl.searchParams.get("scheduleId");
    if (!scheduleId) return json(res, 400, { error: "scheduleId required" });
    try {
      const r = await db.query(
        "SELECT id, faculty_name, file_name, file_type, file_size, uploaded_at FROM faculty_notes WHERE schedule_id=$1 ORDER BY faculty_name, uploaded_at DESC",
        [parseInt(scheduleId)]
      );
      return json(res, 200, r.rows);
    } catch(e) { return json(res, 500, { error: e.message }); }
  }

  // GET /api/notes/:id/download
  if (method === "GET" && pathname.match(/^\/api\/notes\/\d+\/download$/)) {
    const id = parseInt(pathname.split("/")[3]);
    try {
      const r = await db.query("SELECT * FROM faculty_notes WHERE id=$1", [id]);
      if (!r.rows.length) return json(res, 404, { error: "Not found" });
      const note = r.rows[0];
      const fs = await import("fs");
      if (!fs.existsSync(note.file_path)) return json(res, 404, { error: "File not found on disk" });
      const fileBuffer = fs.readFileSync(note.file_path);
      res.writeHead(200, {
        "Content-Type": note.file_type || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${note.file_name}"`,
        "Content-Length": fileBuffer.length,
        "Access-Control-Allow-Origin": "*",
      });
      res.end(fileBuffer);
      return;
    } catch(e) { return json(res, 500, { error: e.message }); }
  }

  // DELETE /api/notes/:id
  if (method === "DELETE" && pathname.match(/^\/api\/notes\/\d+$/)) {
    const id = parseInt(pathname.split("/").pop());
    try {
      const r = await db.query("SELECT * FROM faculty_notes WHERE id=$1", [id]);
      if (!r.rows.length) return json(res, 404, { error: "Not found" });
      const note = r.rows[0];
      const fs = await import("fs");
      if (fs.existsSync(note.file_path)) fs.unlinkSync(note.file_path);
      await db.query("DELETE FROM faculty_notes WHERE id=$1", [id]);
      return json(res, 200, { success: true });
    } catch(e) { return json(res, 500, { error: e.message }); }
  }

  // POST /api/notes/upload (multipart - base64 encoded)
  if (method === "POST" && pathname === "/api/notes/upload") {
    const { facultyName, scheduleId, fileName, fileType, fileData } = body;
    if (!facultyName || !scheduleId || !fileName || !fileData) return json(res, 400, { error: "Missing required fields" });
    try {
      const MAX_TOTAL = 10 * 1024 * 1024; // 10MB per faculty
      const existing = await db.query(
        "SELECT COALESCE(SUM(file_size),0) as total FROM faculty_notes WHERE faculty_name=$1 AND schedule_id=$2",
        [facultyName, parseInt(scheduleId)]
      );
      const usedBytes = parseInt(existing.rows[0].total);
      const fileBuffer = Buffer.from(fileData, "base64");
      const fileSize = fileBuffer.length;
      if (usedBytes + fileSize > MAX_TOTAL) {
        return json(res, 400, { error: `Storage limit exceeded. Used: ${Math.round(usedBytes/1024)}KB of 10240KB. Please delete some files first.` });
      }
      const fs = await import("fs");
      const path = await import("path");
      const dir = "/home/ubuntu/notes";
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = path.join(dir, `${Date.now()}_${facultyName.replace(/[^a-z0-9]/gi,"_")}_${safeName}`);
      fs.writeFileSync(filePath, fileBuffer);
      const r = await db.query(
        "INSERT INTO faculty_notes (schedule_id, faculty_name, file_name, file_type, file_size, file_path) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
        [parseInt(scheduleId), facultyName, fileName, fileType || "application/octet-stream", fileSize, filePath]
      );
      return json(res, 200, { success: true, id: r.rows[0].id, usedBytes: usedBytes + fileSize, totalBytes: MAX_TOTAL });
    } catch(e) { return json(res, 500, { error: e.message }); }
  }
  // ========== END FACULTY NOTES API ==========

  // GET /api/student-access/download
  if (method === "GET" && pathname === "/api/student-access/download") {
    const scheduleId = reqUrl.searchParams.get("scheduleId");
    if (!scheduleId) return json(res, 400, { error: "scheduleId required" });
    try {
      const r = await db.query(
        "SELECT student_name, roll_no, class_name, username, password, email FROM public.student_accounts WHERE schedule_id=$1 ORDER BY class_name, student_name",
        [parseInt(scheduleId)]
      );
      let csv = "Student Name,Roll No,Class,Username,Password,Email\n";
      for (const row of r.rows) {
        csv += `"${row.student_name}","${row.roll_no}","${row.class_name}","${row.username}","${row.password}","${row.email||""}"\n`;
      }
      res.writeHead(200, {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="student-credentials-${scheduleId}.csv"`,
        "Access-Control-Allow-Origin": "*",
      });
      res.end(csv);
      return;
    } catch(e) { return json(res, 500, { error: e.message }); }
  }

  // PATCH /api/student-access/:id
  if (method === "PATCH" && pathname.match(/^\/api\/student-access\/\d+$/)) {
    const id = parseInt(pathname.split("/")[3]);
    const { email, regenerate } = body;
    try {
      if (regenerate) {
        const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
        const password = Array.from({length: 8}, () => chars[Math.floor(Math.random() * chars.length)]).join("");
        await db.query("UPDATE public.student_accounts SET password=$1 WHERE id=$2", [password, id]);
      }
      if (email !== undefined) await db.query("UPDATE public.student_accounts SET email=$1 WHERE id=$2", [email, id]);
      return json(res, 200, { success: true });
    } catch(e) { return json(res, 500, { error: e.message }); }
  }

  // DELETE /api/student-access/:id
  if (method === "DELETE" && pathname.match(/^\/api\/student-access\/\d+$/)) {
    const id = parseInt(pathname.split("/")[3]);
    try {
      await db.query("DELETE FROM public.student_accounts WHERE id=$1", [id]);
      return json(res, 200, { success: true });
    } catch(e) { return json(res, 500, { error: e.message }); }
  }

  // POST /api/student-portal/login
  if (method === "POST" && pathname === "/api/student-portal/login") {
    const { username, password } = body;
    if (!username || !password) return json(res, 400, { success: false, message: "Username and password required" });
    try {
      const r = await db.query(
        `SELECT sa.*, s.name as schedule_name FROM public.student_accounts sa
         LEFT JOIN public.schedules s ON s.id = sa.schedule_id
         WHERE sa.username=$1 LIMIT 1`,
        [username.trim()]
      );
      if (!r.rows.length) return json(res, 200, { success: false, message: "Username not found" });
      const acc = r.rows[0];
      if (acc.password !== password.trim()) return json(res, 200, { success: false, message: "Incorrect password" });
      return json(res, 200, {
        success: true,
        studentName: acc.student_name, rollNo: acc.roll_no,
        className: acc.class_name, scheduleId: acc.schedule_id,
        scheduleName: acc.schedule_name, username: acc.username,
        token: signToken({ role: "student", rollNo: acc.roll_no, scheduleId: acc.schedule_id, className: acc.class_name, username: acc.username })
      });
    } catch(e) { return json(res, 500, { error: e.message }); }
  }

  // GET /api/student-portal/attendance
  if (method === "GET" && pathname === "/api/student-portal/attendance") {
    const scheduleId = reqUrl.searchParams.get("scheduleId");
    const rollNo = reqUrl.searchParams.get("rollNo");
    const className = reqUrl.searchParams.get("className");
    if (!scheduleId || !rollNo) return json(res, 400, { error: "scheduleId and rollNo required" });
    try {
      // Get all subjects for this student's class
      const subjects = await db.query(
        "SELECT DISTINCT subject, class_name FROM public.weekly_schedule WHERE schedule_id=$1 AND class_name=$2 AND (type IS NULL OR type='') ORDER BY subject",
        [parseInt(scheduleId), className]
      );
      const result = [];
      for (const subj of subjects.rows) {
        const att = await db.query(
          "SELECT status, COUNT(*) as cnt FROM public.attendance WHERE schedule_id=$1 AND class_name=$2 AND roll_no=$3 GROUP BY status",
          [parseInt(scheduleId), subj.class_name, rollNo]
        );
        const counts = { present: 0, absent: 0, late: 0, total: 0 };
        for (const r of att.rows) {
          const s = (r.status || "P").toUpperCase();
          const n = parseInt(r.cnt);
          if (s === "P") counts.present += n;
          else if (s === "A") counts.absent += n;
          else if (s === "L") counts.late += n;
          counts.total += n;
        }
        if (counts.total > 0) result.push({ subject: subj.subject, className: subj.class_name, ...counts });
      }
      return json(res, 200, result);
    } catch(e) { return json(res, 500, { error: e.message }); }
  }

  // GET /api/student-portal/marks
  if (method === "GET" && pathname === "/api/student-portal/marks") {
    const scheduleId = reqUrl.searchParams.get("scheduleId");
    const rollNo = reqUrl.searchParams.get("rollNo");
    const className = reqUrl.searchParams.get("className");
    if (!scheduleId || !rollNo) return json(res, 400, { error: "required" });
    try {
      const r = await db.query(
        `SELECT em.subject, em.class_name, em.quiz_marks, em.quiz_total,
                em.mid_marks, em.mid_total, em.final_marks, em.final_total
         FROM public.exam_marks em
         WHERE em.schedule_id=$1 AND em.class_name=$2 AND em.roll_no=$3
         ORDER BY em.subject`,
        [parseInt(scheduleId), className, rollNo]
      );
      const result = r.rows.map((row) => {
        const quiz = row.quiz_marks != null ? parseFloat(row.quiz_marks) : null;
        const mid = row.mid_marks != null ? parseFloat(row.mid_marks) : null;
        const fin = row.final_marks != null ? parseFloat(row.final_marks) : null;
        const quizT = parseFloat(row.quiz_total) || 0;
        const midT = parseFloat(row.mid_total) || 0;
        const finT = parseFloat(row.final_total) || 0;
        const totalScore = (quiz||0) + (mid||0) + (fin||0);
        const grandTotal = quizT + midT + finT;
        return { subject: row.subject, className: row.class_name, quiz, quizTotal: quizT, mid, midTotal: midT, final: fin, finalTotal: finT, totalScore: grandTotal > 0 ? totalScore : null, grandTotal: grandTotal > 0 ? grandTotal : null };
      });
      return json(res, 200, result);
    } catch(e) { return json(res, 500, { error: e.message }); }
  }

  // POST /api/student-portal/change-password
  if (method === "POST" && pathname === "/api/student-portal/change-password") {
    const { username, currentPassword, newPassword } = body;
    try {
      const r = await db.query("SELECT id, password FROM public.student_accounts WHERE username=$1 LIMIT 1", [username]);
      if (!r.rows.length) return json(res, 404, { success: false, message: "Account not found" });
      if (r.rows[0].password !== currentPassword) return json(res, 200, { success: false, message: "Current password incorrect" });
      await db.query("UPDATE public.student_accounts SET password=$1 WHERE username=$2", [newPassword, username]);
      return json(res, 200, { success: true });
    } catch(e) { return json(res, 500, { error: e.message }); }
  }

  // POST /api/fix-sortkeys — fix bad sort_key values
  if (method === "POST" && pathname === "/api/fix-sortkeys") {
    const { scheduleId } = body;
    try {
      const result = await db.query(`UPDATE public.weekly_schedule SET sort_key = (CASE WHEN time_start LIKE '12:%PM' THEN 720 WHEN time_start LIKE '%PM' THEN (CAST(split_part(time_start,':',1) AS INT)+12)*60 ELSE CAST(split_part(time_start,':',1) AS INT)*60 END) + COALESCE(NULLIF(regexp_replace(split_part(time_start, ':', 2), '[^0-9]', '', 'g'), '')::int, 0) WHERE schedule_id = $1`, [parseInt(scheduleId)]);
      return json(res, 200, { success: true, updated: result.rowCount });
    } catch(e) { return json(res, 500, { error: e.message }); }
  }



  // GET /api/schedule/entries — fetch all dated entries (missed/makeup/late) for a schedule
  if (method === "GET" && pathname === "/api/schedule/entries") {
    const sid = reqUrl.searchParams.get("scheduleId");
    if (!sid) return json(res, 400, { error: "scheduleId required" });
    try {
      const r = await db.query(
        `SELECT id, faculty, subject, class_name, dept, day, location, time_start, time_end, lec_lab,
                type, to_char(entry_date, 'YYYY-MM-DD') as entry_date, remarks, user_email, sort_key
         FROM public.weekly_schedule
         WHERE schedule_id=$1 AND type IS NOT NULL AND type != '' AND entry_date IS NOT NULL
         ORDER BY entry_date DESC, sort_key`,
        [parseInt(sid)]
      );
      return json(res, 200, r.rows);
    } catch(e) { return json(res, 500, { error: e.message }); }
  }

  // DELETE /api/schedule/entry/:id — delete a specific dated entry
  if (method === "DELETE" && pathname.startsWith("/api/schedule/entry/")) {
    const entryId = parseInt(pathname.split("/").pop());
    if (isNaN(entryId)) return json(res, 400, { error: "Invalid entry id" });
    try {
      // Also remove any attendance records for this entry (makeup sessions)
      const entryRes = await db.query("SELECT * FROM public.weekly_schedule WHERE id=$1", [entryId]);
      if (entryRes.rows.length > 0) {
        const e = entryRes.rows[0];
        if (e.type.toLowerCase() === "makeup" && e.entry_date) {
          await db.query(
            "DELETE FROM public.attendance WHERE schedule_id=$1 AND class_name=$2 AND date=$3::date",
            [e.schedule_id, e.class_name, e.entry_date]
          );
        }
      }
      await db.query("DELETE FROM public.weekly_schedule WHERE id=$1", [entryId]);
      return json(res, 200, { success: true });
    } catch(e) { return json(res, 500, { error: e.message }); }
  }

  // POST /api/schedule/bulk-day-import — bulk import all entries for a day as missed/makeup
  if (method === "POST" && pathname === "/api/schedule/bulk-day-import") {
    try {
      const { scheduleId, date, type, userEmail } = body;
      if (!scheduleId || !date || !type) return json(res, 400, { error: "scheduleId, date, type required" });
      const sid = parseInt(scheduleId);
      if (isNaN(sid)) return json(res, 400, { error: "Invalid scheduleId" });
      const dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
      const dt = new Date(date + "T00:00:00");
      const dayOfWeek = dayNames[dt.getDay()];
      const typeVal = type.toLowerCase();
      const isWeekend = dt.getDay()===0||dt.getDay()===6;
      if(isWeekend && typeVal!=="makeup") return json(res,400,{error:"Weekends (Sat/Sun) are reserved for Makeup sessions only."});
      // For weekends: use sourceDay to determine which weekday schedule to import
      const sourceDay = isWeekend && body.sourceDay ? body.sourceDay : dayOfWeek;
      if(isWeekend && !body.sourceDay) return json(res,400,{error:"Please select which weekday schedule to import for this weekend makeup session."});
      // Get all recurring entries for this schedule and day (no entry_date = recurring)
      const entriesRes = await db.query(
        "SELECT * FROM public.weekly_schedule WHERE schedule_id=$1 AND LOWER(day)=LOWER($2) AND (type IS NULL OR type='' OR LOWER(type)='regular') AND entry_date IS NULL ORDER BY sort_key",
        [sid, sourceDay]
      );
      let inserted = 0;
      for (const e of entriesRes.rows) {
        // Skip duplicates for same date+type+faculty+subject+class
        const dup = await db.query(
          "SELECT id FROM public.weekly_schedule WHERE schedule_id=$1 AND LOWER(faculty)=LOWER($2) AND LOWER(subject)=LOWER($3) AND LOWER(class_name)=LOWER($4) AND entry_date=$5::date AND LOWER(type)=$6 LIMIT 1",
          [sid, e.faculty||"", e.subject||"", e.class_name||"", date, typeVal]
        );
        if (dup.rows.length > 0) continue;
        await db.query(
          "INSERT INTO public.weekly_schedule (faculty,subject,class_name,dept,day,location,time_start,time_end,lec_lab,elective,user_email,sort_key,schedule_id,type,entry_date,remarks) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::date,$16)",
          [e.faculty,e.subject,e.class_name,e.dept||"",e.day,e.location||"",e.time_start,e.time_end,e.lec_lab||"",e.elective||"",userEmail||e.user_email||"",e.sort_key||0,sid,typeVal,date,body.remarks||null]
        );
        inserted++;
      }
      if (entriesRes.rows.length === 0) return json(res, 200, { inserted: 0, dayOfWeek, date, type: typeVal, total: 0, message: dayOfWeek + " has no scheduled classes in this schedule (schedule runs Mon-Fri only)" });
      return json(res, 200, { inserted, dayOfWeek, sourceDay, date, type: typeVal, total: entriesRes.rows.length });
    } catch(err) { return json(res, 500, { error: err.message }); }
  }

  // POST /api/import/schedule — JSON bulk import (rows with camelCase or CSV column names)
  if (method === "POST" && pathname === "/api/import/schedule") {
    try {
      const chunks = []; for await (const c of req) chunks.push(c);
      const body = JSON.parse(Buffer.concat(chunks).toString());
      const { scheduleId, rows } = body;
      if (!scheduleId || !Array.isArray(rows) || !rows.length)
        return json(res, 400, { error: "scheduleId and rows[] required" });
      const sid = parseInt(scheduleId);
      if (isNaN(sid)) return json(res, 400, { error: "Invalid scheduleId" });
      let inserted = 0;
      for (const r of rows) {
        const faculty   = r.Faculty   || r.faculty   || "";
        const subject   = r.Subject   || r.subject   || "";
        const className = r.Class     || r.className || r.class_name || "";
        const dept      = r.Deptt     || r.dept      || r.Department  || "";
        const day       = r.Day       || r.day       || "";
        const location  = r.Location  || r.location  || "";
        const timeStart = r.Time      || r.timeStart || r.time_start  || "";
        const timeEnd   = r["End Time"] || r.EndTime || r.timeEnd || r.time_end || "";
        const lecLab    = r["Lec/Lab"] || r.LecLab   || r.lec_lab    || "Lec";
        const elective  = r.Elective  || r.elective  || "";
        const userEmail = r["Email of User"] || r.UserEmail || r.user_email || "";
        const sortKey   = r.SortKey   || r.sort_key  || 0;
        await db.query(
          `INSERT INTO public.weekly_schedule (faculty,subject,class_name,dept,day,location,time_start,time_end,lec_lab,elective,user_email,sort_key,schedule_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [faculty, subject, className, dept, day, location, timeStart, timeEnd, lecLab, elective, userEmail, sortKey, sid]
        );
        inserted++;
      }
      return json(res, 200, { success: true, inserted });
    } catch(e) { return json(res, 500, { error: e.message }); }
  }

  // POST /api/import/schedule/xlsx
  if (method === "POST" && pathname === "/api/import/schedule/xlsx") {
    const scheduleId = reqUrl.searchParams.get("scheduleId");
    const sidInt = scheduleId && !isNaN(parseInt(scheduleId)) ? parseInt(scheduleId) : null;
    try {
      const XLSX = require("xlsx");
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const buf = Buffer.concat(chunks);
      const ct = req.headers["content-type"]||"";
      let fileBuf = null;
      if (ct.includes("multipart/form-data")) {
        const boundary = ct.split("boundary=")[1]?.split(";")[0]?.trim();
        if (!boundary) return json(res, 400, {success:false,message:"No boundary"});
        const sep = Buffer.from("\r\n--"+boundary);
        let pos = buf.indexOf(Buffer.from("--"+boundary));
        while (pos !== -1) {
          const hStart = pos + boundary.length + 2 + 2;
          const hEnd = buf.indexOf(Buffer.from("\r\n\r\n"), hStart);
          if (hEnd === -1) break;
          const header = buf.slice(hStart, hEnd).toString();
          const dStart = hEnd + 4;
          const next = buf.indexOf(sep, dStart);
          const dEnd = next === -1 ? buf.length : next;
          if (header.includes("filename=")) { fileBuf = buf.slice(dStart, dEnd); break; }
          pos = next === -1 ? -1 : next + sep.length;
        }
      } else { fileBuf = buf; }
      if (!fileBuf || fileBuf.length === 0) return json(res, 400, {success:false,message:"No file found"});
      const wb = XLSX.read(fileBuf, {type:"buffer"});
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {defval:""});
      const DO = {Mon:0,Tue:1,Wed:2,Thu:3,Fri:4,Sat:5,Sun:6};
      let imported = 0;
      for (const r of rows) {
        const fac=r.Faculty||r.faculty||"", sub=r.Subject||r.subject||"";
        const cls=r.Class||r.class_name||r["Class Name"]||"";
        const dept=r.Deptt||r.dept||r.Department||"";
        const day=(r.Day||r.day||"").trim();
        if (!fac||!sub||!cls||!day) continue;
        const ts=r.Time||r["Start Time"]||"", te=r["End Time"]||r.EndTime||"";
        const ll=r["Lec/Lab"]||r.LecLab||r.lec_lab||"Lec";
        const el=r.Elective||r.elective||"";
        const em=r["Email of User"]||r.UserEmail||r.user_email||"";
        function excelTimeToStr(t) {
          if (typeof t === "number") {
            const totalMin = Math.round(t * 24 * 60);
            const h = Math.floor(totalMin / 60) % 24;
            const m = totalMin % 60;
            const ap = h >= 12 ? "PM" : "AM";
            const h12 = h % 12 || 12;
            return (h12 < 10 ? "0" : "") + h12 + ":" + (m < 10 ? "0" : "") + m + " " + ap;
          }
          return String(t||"");
        }
        const tsStr = excelTimeToStr(ts);
        const teStr = excelTimeToStr(te);
        const tm=tsStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
        let h=0; if(tm){h=parseInt(tm[1]);if(tm[3].toUpperCase()==="PM"&&h!==12)h+=12;if(tm[3].toUpperCase()==="AM"&&h===12)h=0;}
        await db.query("INSERT INTO public.weekly_schedule (faculty,subject,class_name,dept,day,location,time_start,time_end,lec_lab,elective,user_email,sort_key,schedule_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
          [fac,sub,cls,dept,day,r.Location||r.location||"",tsStr,teStr,ll,el,em,(h*60),sidInt]);
        imported++;
      }
      return json(res, 200, {success:true,imported});
    } catch(e) { return json(res, 500, {error:e.message}); }
  }

  // POST /api/notifications/:id/sent — worker marks a message delivered
  if (method === "POST" && pathname.match(/^\/api\/notifications\/\d+\/sent$/)) {
    const id = parseInt(pathname.split("/")[3]);
    try {
      await db.query("UPDATE public.notifications SET status='sent', sent_at=NOW() WHERE id=$1", [id]);
      return json(res, 200, { success: true });
    } catch (e) { return json(res, 500, { error: String(e) }); }
  }

  // POST /api/notifications/:id/failed — worker marks a permanent failure
  if (method === "POST" && pathname.match(/^\/api\/notifications\/\d+\/failed$/)) {
    const id = parseInt(pathname.split("/")[3]);
    try {
      await db.query("UPDATE public.notifications SET status='failed', sent_at=NOW() WHERE id=$1", [id]);
      return json(res, 200, { success: true });
    } catch (e) { return json(res, 500, { error: String(e) }); }
  }

  // GET /api/settings/notifications — current on/off state
  if (method === "GET" && pathname === "/api/settings/notifications") {
    try {
      const r = await db.query("SELECT value FROM public.app_settings WHERE key='notifications_enabled'");
      const enabled = r.rows[0] ? r.rows[0].value === 'true' : true;
      return json(res, 200, { enabled });
    } catch (e) { return json(res, 200, { enabled: true }); }
  }

  // POST /api/settings/notifications — flip on/off { enabled: bool }
  if (method === "POST" && pathname === "/api/settings/notifications") {
    try {
      const en = body.enabled ? 'true' : 'false';
      await db.query("INSERT INTO public.app_settings (key, value) VALUES ('notifications_enabled',$1) ON CONFLICT (key) DO UPDATE SET value=$1", [en]);
      return json(res, 200, { success: true, enabled: body.enabled === true });
    } catch (e) { return json(res, 500, { error: String(e) }); }
  }

  // GET /api/notifications — inspect the WhatsApp notification queue
  if (method === "GET" && pathname === "/api/notifications") {
    const sid = reqUrl.searchParams.get("scheduleId");
    const st = reqUrl.searchParams.get("status");
    try {
      const r = await db.query(
        "SELECT id, schedule_id, class_name, roll_no, student_name, whatsapp, date, session_time, message, status, created_at, sent_at FROM public.notifications WHERE ($1::int IS NULL OR schedule_id=$1) AND ($2::text IS NULL OR status=$2) ORDER BY created_at DESC LIMIT 200",
        [sid ? parseInt(sid) : null, st || null]
      );
      return json(res, 200, { success: true, count: r.rows.length, notifications: r.rows });
    } catch (e) { return json(res, 500, { error: String(e) }); }
  }

  // POST /api/chat — Claude AI chatbot proxy
  if (method === "POST" && pathname === "/api/chat") {
    try {
      const { messages, domain, scheduleId, identity } = body;
      if (!messages || !Array.isArray(messages)) return json(res, 400, { error: "messages required" });

      // Base knowledge base (loaded once, cached)
      if (!global.__KB) { try { global.__KB = require("fs").readFileSync(__dirname + "/chatbot_kb.txt", "utf8"); } catch { global.__KB = ""; } }
      const KB = global.__KB;

      const dom = String(domain || "home");
      const sid = parseInt(scheduleId || "0") || 0;
      const ident = identity || {};
      let live = "";
      let ownershipDenied = false;

      // ---- OWNERSHIP GATE: owner-scoped domains may only access schedules the user owns ----
      const ownerScoped = ["my-schedules", "schedule", "schedule-dashboard", "finance", "admin"];
      if (ownerScoped.includes(dom) && sid) {
        const reqUser = (ident.username || "").trim();
        try {
          const own = await db.query("SELECT user_id FROM public.schedules WHERE id=$1", [sid]);
          if (!own.rows.length) { ownershipDenied = true; }
          else if (!reqUser || own.rows[0].user_id !== reqUser) { ownershipDenied = true; }
        } catch { ownershipDenied = true; }
      }

      // ---- HARD STOP: if ownership denied, refuse deterministically (never let the model answer) ----
      if (ownershipDenied) {
        return json(res, 200, { content: [{ type: "text", text: "This schedule is not under your account, so I can't share any of its details. I can only provide information for schedules you own. Please open one of your own schedules and ask again." }] });
      }

      // ---- fetch live data per domain (only if ownership not denied) ----
      try {
        if (ownershipDenied) { throw { __skip: true }; }
        if ((dom === "my-schedules" || dom === "schedule" || dom === "schedule-dashboard") && sid) {
          const sc = await db.query("SELECT name, start_hour, end_hour, active_days, break_time, lecture_duration, start_date, end_date FROM public.schedules WHERE id=$1", [sid]);
          if (sc.rows[0]) {
            const s = sc.rows[0];
            const fac = await db.query("SELECT DISTINCT faculty FROM public.weekly_schedule WHERE schedule_id=$1 AND faculty!='_locations_' AND (type IS NULL OR type='')", [sid]);
            const cls = await db.query("SELECT DISTINCT class_name FROM public.weekly_schedule WHERE schedule_id=$1 AND class_name!='_ref_' AND (type IS NULL OR type='')", [sid]);
            const cnt = await db.query("SELECT COUNT(*) AS c FROM public.weekly_schedule WHERE schedule_id=$1 AND (type IS NULL OR type='')", [sid]);
            const labc = await db.query("SELECT COUNT(*) AS lab_slots, COUNT(DISTINCT (subject||class_name||day)) AS lab_sessions FROM public.weekly_schedule WHERE schedule_id=$1 AND lec_lab ILIKE '%lab%' AND (type IS NULL OR type='')", [sid]);
            const lecc = await db.query("SELECT COUNT(*) AS c FROM public.weekly_schedule WHERE schedule_id=$1 AND (lec_lab IS NULL OR lec_lab NOT ILIKE '%lab%') AND (type IS NULL OR type='')", [sid]);
            // student counts (total + per class)
            const stuTot = await db.query("SELECT COUNT(*) AS c FROM public.students WHERE schedule_id=$1", [sid]);
            const stuByCls = await db.query("SELECT class_name, COUNT(*) AS c FROM public.students WHERE schedule_id=$1 GROUP BY class_name ORDER BY class_name", [sid]);
            // Detect a faculty name mentioned in the user's latest question → inject ONLY that faculty's timetable (keeps prompt small + reliable)
            const lastQ = (messages && messages.length ? String(messages[messages.length-1].content || "") : "").toLowerCase();
            let facSched = "";
            const matched = fac.rows.map(r=>r.faculty).filter(fn => {
              const full = fn.toLowerCase();
              // match on any name token of length>=3 appearing in the question (e.g. 'kiran', 'quanita', 'maryam')
              const toks = full.replace(/^(dr|mr|ms|mrs|prof)\.?\s+/i,"").split(/\s+/).filter(t=>t.length>=3);
              return toks.some(t => lastQ.includes(t));
            });
            if (matched.length) {
              const wanted = matched.slice(0, 4); // cap to avoid huge prompts
              const ftt = await db.query("SELECT faculty, day, time_start, time_end, subject, class_name, location FROM public.weekly_schedule WHERE schedule_id=$1 AND faculty = ANY($2) AND (type IS NULL OR type='') ORDER BY faculty, array_position(ARRAY['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], day), time_start", [sid, wanted]);
              const byFac = {};
              ftt.rows.forEach(r => { (byFac[r.faculty] = byFac[r.faculty] || []).push(r.day+" "+r.time_start+"-"+r.time_end+" "+r.subject+" ("+r.class_name+(r.location?", "+r.location:"")+")"); });
              facSched = wanted.map(fn => "  • " + fn + ": " + (byFac[fn] && byFac[fn].length ? byFac[fn].join("; ") : "no classes scheduled")).join("\n");
            }
            let weeks = "";
            if (s.start_date && s.end_date) { const ms = new Date(s.end_date) - new Date(s.start_date); const w = Math.round(ms / (7*24*3600*1000)); if (w>0) weeks = "\n- Semester length: ~" + w + " weeks (" + new Date(s.start_date).toISOString().slice(0,10) + " to " + new Date(s.end_date).toISOString().slice(0,10) + ")"; }
            live = "CURRENT SCHEDULE (live data) — answer questions using THESE exact numbers:\n- Name: " + s.name + "\n- Hours: " + s.start_hour + ":00-" + s.end_hour + ":00, " + (s.lecture_duration||60) + " min lectures, break " + (s.break_time||"none") + "\n- Active days: " + (s.active_days||"") + weeks + "\n- Faculty (" + fac.rows.length + "): " + fac.rows.map(r=>r.faculty).join(", ") + "\n- Classes (" + cls.rows.length + "): " + cls.rows.map(r=>r.class_name).join(", ") + "\n- Total students enrolled: " + stuTot.rows[0].c + (stuByCls.rows.length ? " (" + stuByCls.rows.map(r=>r.class_name+": "+r.c).join(", ") + ")" : "") + "\n- Lecture slots/week: " + lecc.rows[0].c + "\n- Lab slots/week: " + labc.rows[0].lab_slots + " (across " + labc.rows[0].lab_sessions + " distinct lab sessions)\n- Total scheduled slots/week: " + cnt.rows[0].c + (facSched ? "\n\nTIMETABLE FOR THE FACULTY MENTIONED IN THE QUESTION (use this to answer about their schedule):\n" + facSched : "\n(If the user asks about a specific faculty's timetable, their schedule rows will be provided here when you mention that faculty by name.)");
            // contact directory for the schedule OWNER (this domain is ownership-gated above)
            const ownFc = await db.query("SELECT name, COALESCE(whatsapp,'') AS wa, COALESCE(email,'') AS email FROM public.finance_faculty WHERE schedule_id=$1", [sid]);
            const ownSc = await db.query("SELECT roll_no, name, COALESCE(whatsapp,'') AS wa, COALESCE(email,'') AS email, class_name FROM public.students WHERE schedule_id=$1 ORDER BY class_name, roll_no", [sid]);
            live += "\n\nCONTACT DIRECTORY (you are the schedule owner — you MAY share these faculty and student whatsapp/email):\nFACULTY: " + (ownFc.rows.length ? ownFc.rows.map(r=>r.name+" wa:"+(r.wa||"none")+" email:"+(r.email||"none")).join("; ") : "no faculty contacts on file") + "\nSTUDENTS: " + (ownSc.rows.length ? ownSc.rows.map(r=>r.roll_no+" "+r.name+" ["+r.class_name+"] wa:"+(r.wa||"none")+" email:"+(r.email||"none")).join("; ") : "no students on file");
          }
        } else if (dom === "faculty-portal" && ident.name && sid) {
          const cl = await db.query("SELECT day, time_start, time_end, subject, class_name, location FROM public.weekly_schedule WHERE schedule_id=$1 AND faculty=$2 AND (type IS NULL OR type='') ORDER BY array_position(ARRAY['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], day), time_start", [sid, ident.name]);
          const today = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][new Date().getDay()];
          const todayCl = cl.rows.filter(r => r.day === today);
          // faculty's OWN students (in classes they teach) with whatsapp + marks
          const myStu = await db.query("SELECT DISTINCT s.roll_no, s.name, COALESCE(s.whatsapp,'') AS wa, COALESCE(s.email,'') AS email, s.class_name FROM public.students s WHERE s.schedule_id=$1 AND s.class_name IN (SELECT DISTINCT class_name FROM public.weekly_schedule WHERE schedule_id=$1 AND faculty=$2 AND (type IS NULL OR type='')) ORDER BY s.class_name, s.roll_no", [sid, ident.name]);
          const marks = await db.query("SELECT em.roll_no, em.marks, em.total_marks FROM public.exam_marks em WHERE em.roll_no IN (SELECT roll_no FROM public.students WHERE schedule_id=$1 AND class_name IN (SELECT DISTINCT class_name FROM public.weekly_schedule WHERE schedule_id=$1 AND faculty=$2 AND (type IS NULL OR type='')))", [sid, ident.name]);
          const markMap = {}; marks.rows.forEach(m => { markMap[m.roll_no] = m.marks + "/" + m.total_marks; });
          live = "FACULTY LIVE DATA for " + ident.name + ":\n- Total weekly classes: " + cl.rows.length + "\n- Today (" + today + "): " + (todayCl.length ? todayCl.map(r=>r.subject+" "+r.class_name+" at "+r.time_start+"-"+r.time_end+" ("+r.location+")").join("; ") : "no classes") + "\n- Full week: " + cl.rows.map(r=>r.day+" "+r.time_start+" "+r.subject+" "+r.class_name).join("; ") + "\n\nYOUR STUDENTS (only students in YOUR classes — you may share THEIR whatsapp/marks, but NOT other faculty's students or other faculty's contacts):\n" + myStu.rows.map(s=>s.roll_no+" "+s.name+" ["+s.class_name+"] wa:"+(s.wa||"none")+" marks:"+(markMap[s.roll_no]||"n/a")).join("\n");
        } else if (dom === "student-portal" && ident.rollNo && sid) {
          const att = await db.query("SELECT status, COUNT(*) AS c FROM public.attendance WHERE schedule_id=$1 AND roll_no=$2 GROUP BY status", [sid, ident.rollNo]);
          const fee = await db.query("SELECT period, amount, COALESCE(paid_amount,0) AS paid, status FROM public.finance_payments WHERE schedule_id=$1 AND person_type='student' AND person_name=$2 ORDER BY period DESC LIMIT 6", [sid, ident.rollNo]);
          const tot = att.rows.reduce((a,r)=>a+parseInt(r.c),0);
          const pres = att.rows.filter(r=>r.status==='P').reduce((a,r)=>a+parseInt(r.c),0);
          const meRow = await db.query("SELECT COALESCE(whatsapp,'') AS wa, COALESCE(email,'') AS email FROM public.students WHERE schedule_id=$1 AND roll_no=$2 LIMIT 1", [sid, ident.rollNo]);
          const me = meRow.rows[0] || { wa: "", email: "" };
          live = "STUDENT LIVE DATA for " + (ident.name||ident.rollNo) + " (" + ident.rollNo + "):\n- Attendance: " + pres + "/" + tot + " present" + (tot? " ("+Math.round(pres/tot*100)+"%)":"") + "\n- Fees: " + (fee.rows.length ? fee.rows.map(r=>r.period+": paid "+r.paid+"/"+r.amount+" ("+r.status+")").join("; ") : "no records") + "\n- YOUR OWN contact on file: whatsapp " + (me.wa||"none") + ", email " + (me.email||"none") + "\n(You may ONLY see your OWN contact info. You cannot see other students' or faculty's whatsapp/email/marks.)";
        } else if (dom === "finance" && sid) {
          const period = (ident.period) || (new Date().toISOString().slice(0,7));
          const pay = await db.query("SELECT person_type, COUNT(*) AS c, SUM(amount) AS due, SUM(COALESCE(paid_amount,0)) AS paid FROM public.finance_payments WHERE schedule_id=$1 AND period=$2 GROUP BY person_type", [sid, period]);
          const exp = await db.query("SELECT COALESCE(SUM(amount),0) AS t FROM public.finance_expenses WHERE to_char(date,'YYYY-MM')=$1", [period]);
          const studPaid = pay.rows.filter(r=>r.person_type==='student').reduce((a,r)=>a+parseFloat(r.paid||0),0);
          const facPaid = pay.rows.filter(r=>r.person_type==='faculty').reduce((a,r)=>a+parseFloat(r.paid||0),0);
          const staffPaid = pay.rows.filter(r=>r.person_type==='staff').reduce((a,r)=>a+parseFloat(r.paid||0),0);
          const expT = parseFloat(exp.rows[0].t)||0;
          live = "FINANCE LIVE DATA (" + period + "):\n" + pay.rows.map(r=>"- "+r.person_type+": "+r.c+" people, due "+Math.round(r.due||0)+", paid "+Math.round(r.paid||0)).join("\n") + "\n- Other expenses: " + expT + "\n- Profit/Loss: " + (studPaid - (facPaid+staffPaid+expT)) + " (fee income " + studPaid + " minus salaries " + (facPaid+staffPaid) + " minus expenses " + expT + ")";
          // full contact directory for finance
          const fc = await db.query("SELECT name, COALESCE(whatsapp,'') AS wa, COALESCE(email,'') AS email FROM public.finance_faculty WHERE schedule_id=$1", [sid]);
          const sc2 = await db.query("SELECT roll_no, name, COALESCE(whatsapp,'') AS wa, COALESCE(email,'') AS email, class_name FROM public.students WHERE schedule_id=$1 ORDER BY class_name, roll_no", [sid]);
          live += "\n\nCONTACT DIRECTORY (Finance may share all):\nFACULTY: " + (fc.rows.length ? fc.rows.map(r=>r.name+" wa:"+(r.wa||"none")+" email:"+(r.email||"none")).join("; ") : "none on file") + "\nSTUDENTS: " + sc2.rows.map(r=>r.roll_no+" "+r.name+" ["+r.class_name+"] wa:"+(r.wa||"none")+" email:"+(r.email||"none")).join("; ");
        } else if (dom === "admin" && sid) {
          // admin: full directory + schedule overview
          const fc = await db.query("SELECT name, COALESCE(whatsapp,'') AS wa, COALESCE(email,'') AS email FROM public.finance_faculty WHERE schedule_id=$1", [sid]);
          const sf = await db.query("SELECT DISTINCT faculty FROM public.weekly_schedule WHERE schedule_id=$1 AND faculty!='_locations_' AND (type IS NULL OR type='')", [sid]);
          const sc2 = await db.query("SELECT roll_no, name, COALESCE(whatsapp,'') AS wa, COALESCE(email,'') AS email, class_name FROM public.students WHERE schedule_id=$1 ORDER BY class_name, roll_no", [sid]);
          // on-demand: if the question names a faculty, include their timetable
          const lastQA = (messages && messages.length ? String(messages[messages.length-1].content || "") : "").toLowerCase();
          let admSched = "";
          const matchedA = sf.rows.map(r=>r.faculty).filter(fn => {
            const toks = fn.toLowerCase().replace(/^(dr|mr|ms|mrs|prof)\.?\s+/i,"").split(/\s+/).filter(t=>t.length>=3);
            return toks.some(t => lastQA.includes(t));
          });
          if (matchedA.length) {
            const wantedA = matchedA.slice(0, 4);
            const fttA = await db.query("SELECT faculty, day, time_start, time_end, subject, class_name, location FROM public.weekly_schedule WHERE schedule_id=$1 AND faculty = ANY($2) AND (type IS NULL OR type='') ORDER BY faculty, array_position(ARRAY['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], day), time_start", [sid, wantedA]);
            const byFacA = {};
            fttA.rows.forEach(r => { (byFacA[r.faculty] = byFacA[r.faculty] || []).push(r.day+" "+r.time_start+"-"+r.time_end+" "+r.subject+" ("+r.class_name+(r.location?", "+r.location:"")+")"); });
            admSched = "\n\nTIMETABLE FOR THE FACULTY MENTIONED:\n" + wantedA.map(fn => "  • " + fn + ": " + (byFacA[fn] && byFacA[fn].length ? byFacA[fn].join("; ") : "no classes scheduled")).join("\n");
          }
          // student count for admin too
          const stuTotA = await db.query("SELECT COUNT(*) AS c FROM public.students WHERE schedule_id=$1", [sid]);
          live = "ADMIN LIVE DATA (full access):\nFACULTY (" + sf.rows.length + "): " + sf.rows.map(r=>r.faculty).join(", ") + "\nFACULTY CONTACTS: " + (fc.rows.length ? fc.rows.map(r=>r.name+" wa:"+(r.wa||"none")+" email:"+(r.email||"none")).join("; ") : "none on file yet") + "\nSTUDENTS TOTAL: " + stuTotA.rows[0].c + "\nSTUDENT CONTACTS: " + sc2.rows.map(r=>r.roll_no+" "+r.name+" ["+r.class_name+"] wa:"+(r.wa||"none")+" email:"+(r.email||"none")).join("; ") + admSched;
        }
      } catch (eLive) { live = ""; }

      // ---- domain-specific instruction ----
      const domainMap = {
        "home": "The user is on the HOME page, not signed in. Act as a friendly TUTORIAL GUIDE. Explain the five sign-in areas (My Schedules for admins, Faculty Sign In, Student Sign In, Account & Finance, Admin Panel) and how to use each. Help them understand what the system does and how to get started.",
        "my-schedules": "The user is in MY SCHEDULES (admin area). Help with creating/managing schedules, the AI Schedule Generator, lecture durations, weekly schedule, attendance, teaching summary, HR personnel, exam marks, holidays.",
        "schedule": "The user is viewing a SPECIFIC SCHEDULE. Use the live schedule data to answer questions about its faculty, classes, days, and timetable.",
        "schedule-dashboard": "The user is on a SCHEDULE DASHBOARD. Help navigate its features (Weekly Schedule, New Entry, Teaching Summary, Attendance, HR Personnel, Exam Marks, Holidays, Meeting Availability) for this specific schedule.",
        "faculty-portal": "The user is a FACULTY member signed into their portal. Use their live data to answer about their classes, timetable, attendance, and notes. You MAY share the whatsapp numbers and exam marks of THEIR OWN students (those listed under YOUR STUDENTS in live data). You must NEVER reveal contact info or marks of other faculty's students, nor any other faculty member's personal contact details. If asked for someone outside their classes, politely decline and explain they can only access their own students' info.",
        "student-portal": "The user is a STUDENT signed into their portal. Use their live data to answer about their OWN attendance, fees, marks, notes, and schedule. You may share ONLY their OWN whatsapp/email. You must NEVER reveal any other student's or any faculty member's whatsapp, email, or marks. If asked for anyone else's contact info, politely decline.",
        "finance": "The user is in ACCOUNT & FINANCE (trusted management). Use the live finance data for fees, salaries, payments, P&L, and expenses. You MAY share the full contact directory provided (all faculty and student whatsapp/email) when asked.",
        "admin": "The user is a SUPER ADMIN (full trusted access). Help with ALL areas plus admin topics (users, passwords, locking, expiry, CSV). You MAY share any contact info in the live data — all faculty and student whatsapp/email."
      };
      let domInstr = domainMap[dom] || domainMap["home"];
      if (ownershipDenied) {
        domInstr += " IMPORTANT: The requested schedule does NOT belong to this user's account, so NO data has been provided. You must politely refuse to share any details about it and explain they can only access schedules under their own account. Do not invent any data.";
      }

      const sys = "You are the AcadTrack assistant for the schoolcollege.online academic management system. Answer concisely, practically, and in a friendly tone.\n\nCRITICAL RULES:\n1. When LIVE DATA is provided below, ANSWER THE QUESTION DIRECTLY using those exact numbers. Do NOT tell the user to go to another screen, dashboard, or CSV to find information that is already in the live data.\n2. Never say 'I don't have that information' or 'check the Schedule Dashboard' if the answer is computable from the live data provided.\n3. Only give step-by-step navigation when the user EXPLICITLY asks HOW TO DO an action (e.g. 'how do I mark attendance'). For data questions ('how many...', 'what is...'), just state the answer from live data.\n4. STAY ON TOPIC: You ONLY help with the schoolcollege.online / AcadTrack academic management system (schedules, attendance, fees, salaries, faculty, students, marks, notes, reports, and how to use the app). If asked anything unrelated (general knowledge, trivia, math, world facts, coding, etc.), politely decline: say you can only help with the AcadTrack system, and suggest an AcadTrack topic instead. Do NOT answer off-topic questions even if you know the answer.\n5. ACCOUNT PRIVACY: If the context note says the requested schedule does NOT belong to this user's account, your ONLY response is to clearly state that this schedule is not under their account and you can only share information for schedules they own. Use that exact reason — do NOT ask clarifying questions, do NOT say 'I don't have data', do NOT improvise another excuse.\n6. When sharing one person's fee/salary, report only THAT person's amounts, never a combined total of everyone.\n7. PARTIAL NAMES: Users often refer to people by part of a name — first name only ('Quanita'), surname with title ('Dr. Kiran'), or a short form. Match the partial to the full name in the live data. If it matches exactly ONE person, use them directly without asking. If it matches MULTIPLE people (e.g. 'Maryam' when two exist), briefly list those matches and ask which one — but still be ready to answer from the live data you already have. NEVER claim schedule/timetable data is missing if a PER-FACULTY WEEKLY TIMETABLE is present in the live data — it IS there; use it. Answer ONLY about the specific person asked for; do not volunteer other people's contact details, marks, or info that wasn't requested.\n\n=== CURRENT CONTEXT ===\n" + domInstr + "\n\n" + (live ? "=== LIVE DATA ===\n" + live + "\n\n" : "") + "=== SYSTEM KNOWLEDGE BASE ===\n" + KB;

      const dsMessages = [{ role: "system", content: sys }, ...messages.slice(-10).map(m => ({ role: m.role, content: m.content }))];
      const response = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + (process.env.ANTHROPIC_API_KEY || "") },
        body: JSON.stringify({ model: "deepseek-chat", max_tokens: 700, messages: dsMessages })
      });
      const ds = await response.json();
      const text = (ds.choices && ds.choices[0] && ds.choices[0].message && ds.choices[0].message.content) ? ds.choices[0].message.content : (ds.error ? ("[AI error] " + (ds.error.message || JSON.stringify(ds.error))) : "[no response]");
      return json(res, 200, { content: [{ type: "text", text }] });
    } catch(e) { return json(res, 500, { error: String(e) }); }
  }

  return json(res, 404, { error: "Not found" });
}

// ========== STATIC FILE SERVER ==========
function serveStaticFile(req, res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === "ENOENT") {
        const indexPath = path.join(STATIC_ROOT, "index.html");
        fs.readFile(indexPath, (err2, data2) => {
          if (err2) { res.writeHead(404); res.end("Not Found"); }
          else { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(data2); }
        });
      } else { res.writeHead(500); res.end("Server Error"); }
    } else {
      res.writeHead(200, { "Content-Type": contentType, "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=31536000", "Access-Control-Allow-Origin": "*" });
      res.end(data);
    }
  });
}

function staticBuildExists() {
  try { return fs.existsSync(path.join(STATIC_ROOT, "index.html")); } catch { return false; }
}

// ========== SERVER STARTUP ==========
const port = parseInt(process.env.PORT || "3000", 10);

async function fixSequences() {
  // Add new columns if they don't exist
  try {
    await db.query(`CREATE TABLE IF NOT EXISTS public.students (
      id SERIAL PRIMARY KEY,
      schedule_id INTEGER REFERENCES public.schedules(id) ON DELETE CASCADE,
      class_name TEXT NOT NULL,
      roll_no TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(schedule_id, class_name, roll_no)
    ) ON CONFLICT DO NOTHING`);
    await db.query(`CREATE TABLE IF NOT EXISTS public.attendance (
      id SERIAL PRIMARY KEY,
      schedule_id INTEGER REFERENCES public.schedules(id) ON DELETE CASCADE,
      class_name TEXT NOT NULL,
      roll_no TEXT NOT NULL DEFAULT '',
      date DATE NOT NULL,
      session_time TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'P',
      UNIQUE(schedule_id, class_name, roll_no, date, session_time)
    )`);
    // Add roll_no column if missing (migration)
    await db.query("ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS roll_no TEXT NOT NULL DEFAULT ''");
    // Drop student_id constraint if exists
    try { await db.query("ALTER TABLE public.attendance DROP COLUMN IF EXISTS student_id"); } catch {}
    console.log("\u2713 Attendance tables ensured");
  } catch(e) { console.log("Attendance table warning:", e.message); }

  try {
    await db.query(`CREATE TABLE IF NOT EXISTS public.finance_payments (
      id SERIAL PRIMARY KEY,
      person_type TEXT NOT NULL,
      person_name TEXT NOT NULL,
      schedule_id INTEGER REFERENCES public.schedules(id) ON DELETE CASCADE,
      period TEXT NOT NULL,
      amount NUMERIC(12,2) DEFAULT 0,
      paid_amount NUMERIC(12,2) DEFAULT 0,
      status TEXT DEFAULT 'Unpaid',
      note TEXT DEFAULT '',
      UNIQUE(person_type, person_name, schedule_id, period)
    )`);
    await db.query(`CREATE TABLE IF NOT EXISTS public.finance_rates (
      id SERIAL PRIMARY KEY,
      schedule_id INTEGER REFERENCES public.schedules(id) ON DELETE CASCADE,
      person_type TEXT NOT NULL,
      label TEXT NOT NULL,
      amount NUMERIC(12,2) DEFAULT 0
    )`);
    await db.query(`CREATE TABLE IF NOT EXISTS public.support_staff (
      id SERIAL PRIMARY KEY,
      schedule_id INTEGER REFERENCES public.schedules(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      role TEXT DEFAULT '',
      contact TEXT DEFAULT ''
    )`);
    console.log("\u2713 Finance tables ensured");
  } catch(e) { console.log("Finance table warning:", e.message); }

  try {
    // Add active_from/active_to to students
    await db.query("ALTER TABLE public.students ADD COLUMN IF NOT EXISTS active_from TEXT DEFAULT NULL");
    await db.query("ALTER TABLE public.students ADD COLUMN IF NOT EXISTS active_to TEXT DEFAULT NULL");
    // Create finance_faculty table for tracking faculty with effective dates
    await db.query(`CREATE TABLE IF NOT EXISTS public.finance_faculty (
      id SERIAL PRIMARY KEY,
      schedule_id INTEGER REFERENCES public.schedules(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      email TEXT DEFAULT '',
      active_from TEXT DEFAULT NULL,
      active_to TEXT DEFAULT NULL,
      UNIQUE(schedule_id, name)
    )`);
    // Add active_from/active_to to support_staff
    await db.query("ALTER TABLE public.support_staff ADD COLUMN IF NOT EXISTS active_from TEXT DEFAULT NULL");
    await db.query("ALTER TABLE public.support_staff ADD COLUMN IF NOT EXISTS active_to TEXT DEFAULT NULL");
    await db.query("ALTER TABLE public.support_staff ADD COLUMN IF NOT EXISTS schedule_id INTEGER DEFAULT NULL");
    await db.query("ALTER TABLE public.support_staff ADD COLUMN IF NOT EXISTS email TEXT DEFAULT ''");
    console.log("\u2713 Finance effective date columns ensured");
  } catch(e) { console.log("Finance date columns warning:", e.message); }

  try {
    await db.query("ALTER TABLE public.users ADD COLUMN IF NOT EXISTS finance_pin TEXT DEFAULT ''");
  await db.query("ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT FALSE");
  await db.query("ALTER TABLE public.schedules ADD COLUMN IF NOT EXISTS lecture_duration INTEGER DEFAULT 60");
  await db.query("ALTER TABLE public.students ADD COLUMN IF NOT EXISTS whatsapp TEXT DEFAULT ''");
  await db.query("CREATE TABLE IF NOT EXISTS public.notifications (id SERIAL PRIMARY KEY, schedule_id INTEGER, class_name TEXT, roll_no TEXT, student_name TEXT, whatsapp TEXT, date TEXT, session_time TEXT, message TEXT, status TEXT DEFAULT 'pending', created_at TIMESTAMP DEFAULT NOW(), sent_at TIMESTAMP)");
  await db.query("CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe ON public.notifications (schedule_id, class_name, roll_no, date, session_time)");
  await db.query("CREATE UNIQUE INDEX IF NOT EXISTS attendance_unique_session ON public.attendance (schedule_id, class_name, roll_no, date, session_time)");
  await db.query("CREATE TABLE IF NOT EXISTS public.app_settings (key TEXT PRIMARY KEY, value TEXT)");
  await db.query(`INSERT INTO public.app_settings (key, value) VALUES ('notifications_enabled','true') ON CONFLICT (key) DO NOTHING`);
  await db.query("CREATE TABLE IF NOT EXISTS public.finance_expenses (id SERIAL PRIMARY KEY, schedule_id INTEGER, date DATE, expense_head TEXT, description TEXT, amount NUMERIC(12,2) DEFAULT 0, remarks TEXT, created_at TIMESTAMP DEFAULT NOW())");
  await db.query("ALTER TABLE public.finance_faculty ADD COLUMN IF NOT EXISTS whatsapp TEXT DEFAULT ''");
  await db.query("ALTER TABLE public.support_staff ADD COLUMN IF NOT EXISTS whatsapp TEXT DEFAULT ''");
  await db.query("ALTER TABLE public.weekly_schedule ADD COLUMN IF NOT EXISTS remarks TEXT");
  await db.query("ALTER TABLE public.users ADD COLUMN IF NOT EXISTS expiry_date TIMESTAMP DEFAULT NULL");
  await db.query("ALTER TABLE public.users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()");
    console.log("\u2713 finance_pin column ensured");
  } catch(e) { console.log("finance_pin warning:", e.message); }

  try {
    await db.query("ALTER TABLE public.schedules ADD COLUMN IF NOT EXISTS start_hour INTEGER DEFAULT 9");
    await db.query("ALTER TABLE public.schedules ADD COLUMN IF NOT EXISTS end_hour INTEGER DEFAULT 17");
    await db.query("ALTER TABLE public.schedules ADD COLUMN IF NOT EXISTS active_days TEXT DEFAULT 'Mon,Tue,Wed,Thu,Fri'");
    await db.query("ALTER TABLE public.schedules ADD COLUMN IF NOT EXISTS break_time TEXT DEFAULT '13-14'");
    console.log("\u2713 Schedule columns ensured");
  } catch(e) { console.log("Column migration warning:", e.message); }

  const tables = ['users', 'schedules', 'holidays', 'attendance', 'weekly_schedule', 'faculty_accounts', 'finance_accounts', 'finance_payments', 'finance_rates', 'students', 'exam_marks', 'exam_weights', 'support_staff'];
  for (const table of tables) {
    try { await db.query("ALTER TABLE public." + table + " ALTER COLUMN id SET DEFAULT nextval('public." + table + "_id_seq')"); console.log('✓ Sequence fixed: ' + table); }
    catch (e) { console.log('→ Skipped: ' + table); }
  }
  try {
    await db.query("SELECT setval('public.users_id_seq', COALESCE((SELECT MAX(id) FROM public.users), 0) + 1, false)");
    await db.query("SELECT setval('public.schedules_id_seq', COALESCE((SELECT MAX(id) FROM public.schedules), 0) + 1, false)");
    await db.query("SELECT setval('public.holidays_id_seq', COALESCE((SELECT MAX(id) FROM public.holidays), 0) + 1, false)");
    await db.query("SELECT setval('public.weekly_schedule_id_seq', COALESCE((SELECT MAX(id) FROM public.weekly_schedule), 0) + 1, false)");
    console.log('✓ Sequence values updated');
  } catch (e) { console.log('→ Seq update skipped'); }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", 'http://' + (req.headers.host || 'localhost'));
  let pathname = url.pathname;
  if (basePath && pathname.startsWith(basePath)) pathname = pathname.slice(basePath.length) || "/";
  if (pathname.startsWith("/api/")) {
    try { await handleApi(req.method, pathname, req, res); } catch (e) { console.error('handleApi error:', e); json(res, 500, { success: false, message: String(e) }); }
    return;
  }
  if (pathname === "/health" || pathname === "/ping") {
    res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ status: "ok" })); return;
  }
  if ((pathname === "/" || pathname === "/index.html") && !staticBuildExists() && fs.existsSync(TEMPLATE_PATH)) {
    fs.readFile(TEMPLATE_PATH, "utf-8", (err, html) => {
      if (err) { res.writeHead(500); res.end("Error"); }
      else { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(html); }
    }); return;
  }
  let filePath = path.join(STATIC_ROOT, pathname === "/" ? "index.html" : pathname);
  filePath = path.resolve(filePath);
  if (!filePath.startsWith(path.resolve(STATIC_ROOT))) { res.writeHead(403); res.end("Forbidden"); return; }
  serveStaticFile(req, res, filePath);
});

server.listen(port, "127.0.0.1", async () => {
  console.log('Server running on port ' + port);
  await fixSequences();
});
// roster fix Thu May 21 02:59:54 UTC 2026
