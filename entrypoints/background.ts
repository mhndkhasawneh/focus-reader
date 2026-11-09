import { loadSettings, onSettingsChanged } from '@/lib/settings';
import type { FlowIntent } from './flow.content';
import { RUN_MODE, SHOW_TOOLBAR, type Message } from '@/lib/messages';

const FLOW_SCRIPT_ID = 'focus-reader-selection-toolbar';

export default defineBackground(() => {
  const injectable = (tab?: Browser.tabs.Tab): tab is Browser.tabs.Tab & { id: number } =>
    Boolean(tab?.id && /^https?:/.test(tab.url ?? ''));

  async function openReader(tab?: Browser.tabs.Tab) {
    if (!injectable(tab)) return;
    await browser.scripting.executeScript({ target: { tabId: tab.id }, files: ['/content-scripts/reader.js'] });
  }

  async function runFlow(tab: Browser.tabs.Tab | undefined, intent: FlowIntent, frameId?: number) {
    if (!injectable(tab)) return;
    const target = { tabId: tab.id, frameIds: frameId === undefined ? undefined : [frameId] };
    await browser.scripting.executeScript({
      target,
      func: (i: FlowIntent) => void (window.__focusFlowIntent = i),
      args: [intent],
    });
    await browser.scripting.executeScript({ target, files: ['/content-scripts/flow.js'] });
  }

  const activeTab = async () => (await browser.tabs.query({ active: true, currentWindow: true }))[0];

  browser.action.onClicked.addListener(async (tab) => {
    // sidePanel.open needs the click's user gesture, so it goes first, before any await.
    if (tab.id) void browser.sidePanel.open({ tabId: tab.id }).catch(() => {});
    const { defaultMode } = await loadSettings();
    await (defaultMode === 'reader' ? openReader(tab) : runFlow(tab, 'toggle'));
  });

  browser.commands.onCommand.addListener(async (command, tab) => {
    tab ??= await activeTab();
    if (command === 'toggle-reader') await openReader(tab);
    if (command === 'toggle-flow') await runFlow(tab, 'toggle');
  });

  browser.runtime.onMessage.addListener((msg: Message, sender) => {
    // Double-click on a page: arm in-page focus in that frame and show the toolbar for the selection.
    if (msg?.type === SHOW_TOOLBAR && sender.tab) void runFlow(sender.tab, 'show', sender.frameId);
    if (msg?.type === RUN_MODE) {
      void activeTab().then((tab) => (msg.mode === 'reader' ? openReader(tab) : runFlow(tab, 'toggle')));
    }
  });

  browser.runtime.onInstalled.addListener(() => {
    browser.contextMenus.create({ id: 'focus-here', title: 'Focus from here', contexts: ['selection'] });
    browser.contextMenus.create({ id: 'reader', title: 'Open in reader view', contexts: ['page'] });
  });
  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === 'focus-here') await runFlow(tab, 'start');
    if (info.menuItemId === 'reader') await openReader(tab);
  });

  // Optional: show the toolbar on every selection, not only on double-click.
  async function syncSelectionToolbar(enabled: boolean) {
    const registered = (await browser.scripting.getRegisteredContentScripts({ ids: [FLOW_SCRIPT_ID] })).length > 0;
    if (enabled && !registered) {
      await browser.scripting.registerContentScripts([
        { id: FLOW_SCRIPT_ID, js: ['/content-scripts/flow.js'], matches: ['http://*/*', 'https://*/*'], runAt: 'document_idle' },
      ]);
    } else if (!enabled && registered) {
      await browser.scripting.unregisterContentScripts({ ids: [FLOW_SCRIPT_ID] });
    }
  }
  loadSettings().then((s) => syncSelectionToolbar(s.selectionToolbar));
  onSettingsChanged((s) => void syncSelectionToolbar(s.selectionToolbar));
});
