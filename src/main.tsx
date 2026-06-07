import { createRoot } from 'react-dom/client';
import App from "./App.tsx";
import "./index.css";

// Fonction magique pour forcer Android à demander le micro
async function requestMicrophonePermission() {
  try {
    if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log("Permission micro accordée !");
    }
  } catch (err) {
    console.log("Demande de micro :", err);
  }
}

// On lance la demande immédiatement au démarrage
requestMicrophonePermission();

createRoot(document.getElementById('root')!).render(<App />);
