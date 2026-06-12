// Shared calendar date input — native HTML date picker on web, TextInput fallback on native
import React from "react";
import { Platform, TextInput } from "react-native";

export default function DateField({ value, onChange, style, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  style?: any;
  placeholder?: string;
}) {
  if (Platform.OS === "web") {
    return React.createElement("input", {
      type: "date",
      value: value || "",
      onChange: (e: any) => onChange(e.target.value),
      style: {
        border: "1px solid #CFD8DC", borderRadius: 8, padding: "9px 12px",
        fontSize: 13.5, fontFamily: "Inter_400Regular, Inter, sans-serif",
        color: "#263238", background: "#F5F7F8", width: "100%", boxSizing: "border-box",
        outline: "none",
      },
    });
  }
  return (
    <TextInput value={value} onChangeText={onChange}
      placeholder={placeholder || "YYYY-MM-DD"} placeholderTextColor="#90A4AE" style={style} />
  );
}
