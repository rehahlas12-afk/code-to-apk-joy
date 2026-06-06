import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.monapp.joy",
  appName: "code-to-apk-joy",
  webDir: "dist",
  server: {
    url: "https://23dcaa64-4079-4653-945f-bb1961e32b87.lovableproject.com?forceHideBadge=true",
    cleartext: true,
  },
};

export default config;
