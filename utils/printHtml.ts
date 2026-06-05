import { Platform } from "react-native";
import * as Sharing from "expo-sharing";
import { Alert } from "react-native";

export async function printOrShareHtml(html: string, shareDialogTitle: string): Promise<void> {
  if (Platform.OS === "web") {
    const win = window.open("", "_blank");
    if (!win) {
      Alert.alert("Blocked", "Please allow pop-ups for this site to download PDFs.");
      return;
    }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
    }, 500);
  } else {
    try {
      const { cacheDirectory, writeAsStringAsync, EncodingType } = await import("expo-file-system");
      const path = (cacheDirectory ?? "") + "report.html";
      await writeAsStringAsync(path, html, { encoding: EncodingType.UTF8 });
      await Sharing.shareAsync(path, { mimeType: "text/html", dialogTitle: shareDialogTitle });
    } catch (e: any) {
      Alert.alert("Error", "Could not generate PDF. Please try again.");
    }
  }
}
