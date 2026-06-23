import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'id.hadirin.ai',
  appName: 'Hadirin AI',
  webDir: 'dist',
  backgroundColor: '#f4f6fa',
  android: {
    backgroundColor: '#f4f6fa',
    allowMixedContent: false,
    captureInput: true,
  },
  server: {
    androidScheme: 'https',
  },
}

export default config
