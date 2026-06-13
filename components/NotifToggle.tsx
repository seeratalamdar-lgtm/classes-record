// WhatsApp notification ON/OFF toggle — global, controllable by Admin/Finance/Faculty
import React, { useState, useEffect } from "react";
import { TouchableOpacity, Text, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import { showConfirm, showAlert } from "@/utils/crossPlatform";

const API = "https://" + (process.env.EXPO_PUBLIC_DOMAIN || "schoolcollege.online") + "/api";

export default function NotifToggle() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    fetch(API + "/settings/notifications").then(r => r.json()).then(d => setEnabled(d.enabled !== false)).catch(() => setEnabled(true));
  }, []);
  async function flip() {
    const next = !enabled;
    const msg = next
      ? "Turn WhatsApp notifications ON? New attendance/payment entries will message the concerned people."
      : "Turn WhatsApp notifications OFF? Use this when entering PAST records so no messages are sent. Remember to turn it back ON afterwards.";
    if (Platform.OS === "web" && !showConfirm(msg)) return;
    try {
      const r = await fetch(API + "/settings/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: next }) }).then(x => x.json());
      setEnabled(r.enabled);
      showAlert(r.enabled ? "🔔 Notifications are now ON" : "🔕 Notifications are now OFF — back-fill past records safely, then turn ON.");
    } catch { showAlert("Could not change setting. Try again."); }
  }
  if (enabled === null) return null;
  return (
    <TouchableOpacity onPress={flip}
      style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 6, paddingHorizontal: 11, borderRadius: 16, backgroundColor: enabled ? "rgba(255,255,255,0.18)" : "#C62828" }}>
      <Feather name={enabled ? "bell" : "bell-off"} size={13} color="#fff" />
      <Text style={{ color: "#fff", fontSize: 12, fontFamily: "Inter_600SemiBold" }}>{enabled ? "Alerts On" : "Alerts Off"}</Text>
    </TouchableOpacity>
  );
}
