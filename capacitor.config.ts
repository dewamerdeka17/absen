import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'id.hadirin.ai',
  appName: 'IdenTime',
  webDir: 'dist',
  backgroundColor: '#f7f9fb',
  android: {
    backgroundColor: '#f7f9fb',
    allowMixedContent: false,
    captureInput: true,
  },
  server: {
    androidScheme: 'https',
  },
}

export default config
