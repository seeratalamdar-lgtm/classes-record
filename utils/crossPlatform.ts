import { Alert, Platform, Linking } from "react-native";

export function showAlert(message: string): void {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.alert(message);
  } else {
    Alert.alert("Notice", message);
  }
}

export function showConfirm(message: string): boolean {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return window.confirm(message);
  }
  return true;
}

export function openURL(url: string): void {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.open(url, "_blank");
  } else {
    Linking.openURL(url).catch(() => {});
  }
}
