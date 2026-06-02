import { Alert, Platform } from "react-native";

export function showAlert(message: string): void {
  if (Platform.OS === "web") {
    window.alert(message);
  } else {
    Alert.alert("Notice", message);
  }
}

export function showConfirm(message: string): boolean {
  if (Platform.OS === "web") {
    return window.confirm(message);
  }
  return true;
}

export function openURL(url: string): void {
  if (Platform.OS === "web") {
    window.open(url, "_blank");
  }
}
