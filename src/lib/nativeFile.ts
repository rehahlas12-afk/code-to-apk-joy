import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

const APP_FOLDER = "STAF-Transport";

export function base64FromDataUrl(data: string): string {
  return data.includes(",") ? data.split(",")[1] : data;
}

export function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_");
}

export async function saveBase64ToPhone(fileName: string, base64: string): Promise<{ uri: string; label: string }> {
  const cleanName = safeFileName(fileName);

  try {
    await Filesystem.requestPermissions();
  } catch {
    // Android récent autorise quand même les fichiers créés par l'application.
  }

  try {
    const downloadPath = `Download/${APP_FOLDER}/${cleanName}`;
    const saved = await Filesystem.writeFile({
      path: downloadPath,
      data: base64,
      directory: Directory.ExternalStorage,
      recursive: true,
    });
    return { uri: saved.uri, label: `Téléchargements/${APP_FOLDER}/${cleanName}` };
  } catch {
    const documentPath = `${APP_FOLDER}/${cleanName}`;
    const saved = await Filesystem.writeFile({
      path: documentPath,
      data: base64,
      directory: Directory.Documents,
      recursive: true,
    });
    return { uri: saved.uri, label: `Documents/${APP_FOLDER}/${cleanName}` };
  }
}

export async function sharePhoneFile(options: {
  uri: string;
  title: string;
  text?: string;
  dialogTitle?: string;
}): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await Share.share({
      title: options.title,
      text: options.text,
      files: [options.uri],
      dialogTitle: options.dialogTitle || "Partager",
    });
  } catch {
    await Share.share({
      title: options.title,
      text: options.text,
      url: options.uri,
      dialogTitle: options.dialogTitle || "Partager",
    });
  }
}