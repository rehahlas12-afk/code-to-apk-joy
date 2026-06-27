import { registerPlugin } from "@capacitor/core";

export interface DownloadSaverPlugin {
  saveBase64(options: { fileName: string; data: string; mimeType: string }): Promise<{ uri: string; path: string }>;
  shareUri(options: { uri: string; title: string; text?: string; mimeType: string }): Promise<void>;
  pickTextFile(options?: { mimeType?: string }): Promise<{ text: string; name?: string; uri?: string }>;
}

export const DownloadSaver = registerPlugin<DownloadSaverPlugin>("DownloadSaver");