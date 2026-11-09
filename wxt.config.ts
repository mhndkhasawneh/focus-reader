import { defineConfig } from 'wxt';

// E2E builds go to their own folder so tests never touch the build you've loaded in Chrome.
const e2e = process.env.FOCUS_READER_E2E === '1';

export default defineConfig({
  outDir: e2e ? 'dist-e2e' : 'dist',
  manifest: {
    name: 'Focus Reader',
    description: 'Distraction-free reading: reader view, bionic text, paragraph spotlight and auto-pacing.',
    // The hover highlight runs on every http(s) page, so the extension has site access everywhere. That same access
    // lets double-click and the side panel start in-page focus or reader view in any tab without another prompt.
    // The heavy focus/reader code is still injected only when you ask for it.
    permissions: ['activeTab', 'scripting', 'storage', 'contextMenus', 'sidePanel'],
    host_permissions: ['http://*/*', 'https://*/*'],
    web_accessible_resources: [{ resources: ['fonts/*.woff2'], matches: ['<all_urls>'] }],
    action: { default_title: 'Focus Reader' },
    commands: {
      'toggle-flow': {
        suggested_key: { default: 'Alt+Shift+F' },
        description: 'Focus on this page (in-page flow mode)',
      },
      'toggle-reader': {
        suggested_key: { default: 'Alt+Shift+R' },
        description: 'Open the reader view',
      },
    },
  },
});
