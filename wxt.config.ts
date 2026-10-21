import { defineConfig } from 'wxt';

// E2E builds keep host access because automated tests can't produce the user gesture activeTab needs.
const e2e = process.env.FOCUS_READER_E2E === '1';

export default defineConfig({
  outDir: e2e ? 'dist-e2e' : 'dist',
  manifest: {
    name: 'Focus Reader',
    description: 'Distraction-free reading: reader view, bionic text, paragraph spotlight and auto-pacing.',
    // activeTab + scripting: the reader is injected only into the tab you click, never into every site.
    permissions: ['activeTab', 'scripting', 'storage', 'contextMenus'],
    // Only requested if you turn on "toolbar on every site" in Options.
    optional_host_permissions: ['<all_urls>'],
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
  hooks: {
    // WXT derives <all_urls> host access from the runtime content script's matches; activeTab makes it unnecessary.
    'build:manifestGenerated': (_wxt, manifest) => {
      if (!e2e) delete manifest.host_permissions;
    },
  },
});
