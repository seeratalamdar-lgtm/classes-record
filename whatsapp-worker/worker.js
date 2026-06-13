const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const qrcode = require("qrcode-terminal");

const API = "https://schoolcollege.online/api";
const POLL_MS = 6000;
let sock = null, ready = false;

function toJid(num) {
  let d = String(num || "").replace(/[^0-9]/g, "");
  if (!d) return null;
  if (d.length === 11 && d.startsWith("0")) d = "92" + d.slice(1);
  if (d.length === 10 && d.startsWith("3")) d = "92" + d;
  return d + "@s.whatsapp.net";
}

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState("auth");
  const { version } = await fetchLatestBaileysVersion();
  sock = makeWASocket({ version, auth: state, printQRInTerminal: false });

  sock.ev.on("creds.update", saveCreds);
  sock.ev.on("connection.update", (u) => {
    const { connection, lastDisconnect, qr } = u;
    if (qr) { console.log("\n=== SCAN THIS QR WITH +923051536771 (WhatsApp > Linked Devices > Link a Device) ===\n"); qrcode.generate(qr, { small: true }); }
    if (connection === "open") { ready = true; console.log("\n✅ WhatsApp connected — sender is live.\n"); }
    if (connection === "close") {
      ready = false;
      const code = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      console.log("connection closed; code=" + code + (loggedOut ? " (logged out — delete auth/ and re-scan)" : " — reconnecting"));
      if (!loggedOut) setTimeout(start, 3000);
    }
  });
}

async function pump() {
  if (!ready || !sock) return;
  try {
    const r = await fetch(API + "/notifications?status=pending").then(x => x.json());
    const list = (r.notifications || []).filter(n => n.whatsapp && n.whatsapp.trim());
    for (const n of list) {
      const jid = toJid(n.whatsapp);
      if (!jid) { await fetch(API + "/notifications/" + n.id + "/failed", { method: "POST" }); continue; }
      try {
        await sock.sendMessage(jid, { text: n.message });
        await fetch(API + "/notifications/" + n.id + "/sent", { method: "POST" });
        console.log("sent #" + n.id + " -> " + n.whatsapp);
        await new Promise(res => setTimeout(res, 1500)); // gentle pacing
      } catch (e) {
        console.log("send failed #" + n.id + ": " + String(e).slice(0, 120));
      }
    }
  } catch (e) { console.log("poll error: " + String(e).slice(0, 120)); }
}

start();
setInterval(pump, POLL_MS);
console.log("Worker booting — waiting for WhatsApp connection...");
