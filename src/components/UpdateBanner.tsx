import { useEffect, useState } from "react";
import { Download, X, RefreshCw } from "lucide-react";
import {
  checkForUpdate,
  snoozeUpdate,
  CURRENT_BUILD,
  type UpdateInfo,
} from "@/lib/updateCheck";

export default function UpdateBanner() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const res = await checkForUpdate();
      if (!cancelled) setInfo(res);
    };
    // léger délai pour ne pas bloquer le démarrage
    const t = setTimeout(run, 2500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, []);

  if (!info) return null;

  const openDownload = () => {
    const url = info.apkUrl || info.pageUrl;
    try {
      window.open(url, "_blank");
    } catch {
      location.href = url;
    }
  };

  const dismiss = () => {
    snoozeUpdate();
    setInfo(null);
  };

  return (
    <div className="fixed inset-x-0 top-0 z-[9999] px-3 pt-3">
      <div className="mx-auto max-w-md rounded-xl border-2 border-red-500 bg-zinc-900 text-white shadow-2xl">
        <div className="flex items-start gap-3 p-3">
          <div className="mt-0.5 rounded-full bg-red-600 p-2">
            <RefreshCw className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-base">Nouvelle version disponible</div>
            <div className="text-xs text-zinc-300 mt-0.5">
              Build {info.build} — vous avez {CURRENT_BUILD}
            </div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={openDownload}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 hover:bg-red-700 px-3 py-2 text-sm font-semibold"
              >
                <Download className="h-4 w-4" />
                Télécharger
              </button>
              <button
                onClick={dismiss}
                aria-label="Plus tard"
                className="rounded-lg bg-zinc-700 hover:bg-zinc-600 px-3 py-2 text-sm"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2 text-[11px] text-zinc-400">
              Ouvre l'APK depuis Téléchargements puis « Mettre à jour ». Vos données sont conservées.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
