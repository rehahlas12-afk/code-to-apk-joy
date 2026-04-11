import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Dashboard from "./pages/Dashboard";
import CameraPage from "./pages/CameraPage";
import VoiceSearchPage from "./pages/VoiceSearchPage";
import TextSearchPage from "./pages/TextSearchPage";
import PlanViewerPage from "./pages/PlanViewerPage";
import StoreNamesPage from "./pages/StoreNamesPage";
import PalletCalcPage from "./pages/PalletCalcPage";
import GalleryPage from "./pages/GalleryPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/camera" element={<CameraPage />} />
          <Route path="/voice-search" element={<VoiceSearchPage />} />
          <Route path="/text-search" element={<TextSearchPage />} />
          <Route path="/plan-viewer" element={<PlanViewerPage />} />
          <Route path="/store-names" element={<StoreNamesPage />} />
          <Route path="/pallet-calc" element={<PalletCalcPage />} />
          <Route path="/gallery" element={<GalleryPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
