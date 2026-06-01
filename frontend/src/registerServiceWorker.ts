/// <reference types="vite-plugin-pwa/client" />
import { registerSW } from 'virtual:pwa-register';

export function registerPWA() {
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    const updateSW = registerSW({
      onNeedRefresh() {
        if (confirm('New content is available. Do you want to refresh?')) {
          updateSW(true);
        }
      },
      onOfflineReady() {
        console.log('LiftSync is ready to work offline.');
      },
      onRegisterError(error) {
        console.error('Service worker registration failed:', error);
      }
    });
  }
}
