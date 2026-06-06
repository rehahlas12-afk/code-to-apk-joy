import { createRoot } from 'react-dom/client';
import App from "./App.tsx";
import "./index.css";
import { Clipboard } from '@capacitor/clipboard';

// Demande l'autorisation du micro au démarrage de l'application
navigator.mediaDevices.getUserMedia({ audio: true })
  .then(() => console.log("Micro autorisé"))
  .catch((err) => console.log("Erreur micro:", err));

createRoot(document.getElementById('root')!).render(<App />);

