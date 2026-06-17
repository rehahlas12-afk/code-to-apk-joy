// Vérification de mise à jour via GitHub Releases
// Tag format: build-N (workflow android.yml)

const REPO = "rehahlas12-afk/code-to-apk-joy";
const SNOOZE_KEY = "staf_update_snooze";
const SNOOZE_HOURS = 6;

export const CURRENT_BUILD = parseInt(
  (typeof __APP_BUILD__ !== "undefined" ? __APP_BUILD__ : "0") || "0",
  10
);

export interface UpdateInfo {
  build: number;
  name: string;
  apkUrl: string | null;
  pageUrl: string;
  notes: string;
}

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  // Build 0 = dev/preview, on ne propose pas
  if (!CURRENT_BUILD) return null;

  // Snooze utilisateur
  try {
    const snoozeUntil = parseInt(localStorage.getItem(SNOOZE_KEY) || "0", 10);
    if (snoozeUntil && Date.now() < snoozeUntil) return null;
  } catch {}

  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/releases/latest`,
      { headers: { Accept: "application/vnd.github+json" } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const tag: string = data.tag_name || "";
    const match = tag.match(/build-(\d+)/);
    if (!match) return null;
    const latest = parseInt(match[1], 10);
    if (latest <= CURRENT_BUILD) return null;

    const apk = (data.assets || []).find((a: any) =>
      String(a.name || "").toLowerCase().endsWith(".apk")
    );

    return {
      build: latest,
      name: data.name || tag,
      apkUrl: apk?.browser_download_url || null,
      pageUrl: data.html_url || `https://github.com/${REPO}/releases/latest`,
      notes: data.body || "",
    };
  } catch {
    return null;
  }
}

export function snoozeUpdate() {
  try {
    localStorage.setItem(
      SNOOZE_KEY,
      String(Date.now() + SNOOZE_HOURS * 3600 * 1000)
    );
  } catch {}
}
