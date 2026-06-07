import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sabrinos.app',
  appName: 'Sabrinos',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    LocalNotifications: {},
    PushNotifications: {}
  }
};

export default config;

