import { toggleReaderView } from '@/lib/reader';
import { onSettingsChanged } from '@/lib/settings';

declare global {
  interface Window {
    __focusReaderWired?: boolean;
  }
}

export default defineContentScript({
  matches: ['<all_urls>'],
  registration: 'runtime', // injected by background.ts; every injection toggles the reader
  async main() {
    await toggleReaderView();
    if (!window.__focusReaderWired) {
      window.__focusReaderWired = true;
      onSettingsChanged((s) => window.__focusReader?.update(s));
    }
  },
});
