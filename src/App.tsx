import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Dashboard from "./pages/Dashboard";
import CameraPage from "./pages/CameraPage";
import SearchPage from "./pages/SearchPage";
import PlanViewerPage from "./pages/PlanViewerPage";
import StoreNamesPage from "./pages/StoreNamesPage";
import PalletCalcPage from "./pages/PalletCalcPage";
import GalleryPage from "./pages/GalleryPage";
import TimeTrackingPage from "./pages/TimeTrackingPage";
import NotFound from "./pages/NotFound";
import { useEffect } from "react";
import { incrementOpenCount } from "@/lib/shareUtils";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/camera" element={<CameraPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/voice-search" element={<SearchPage />} />
          <Route path="/text-search" element={<SearchPage />} />
          <Route path="/plan-viewer" element={<PlanViewerPage />} />
          <Route path="/store-names" element={<StoreNamesPage />} />
          <Route path="/pallet-calc" element={<PalletCalcPage />} />
          <Route path="/gallery" element={<GalleryPage />} />
          <Route path="/time-tracking" element={<TimeTrackingPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
