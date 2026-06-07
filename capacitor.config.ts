
  import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sabrinis.app',
  appName: 'Sabrinos',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    Permissions: {}
  }
};

export default config;

