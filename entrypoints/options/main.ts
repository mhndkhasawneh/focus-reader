import { wordsPerMinute } from '@/lib/pacer';
import { loadSettings, saveSettings, type Settings } from '@/lib/settings';

const form = document.querySelector<HTMLFormElement>('#f')!;

function show(name: string, value: number) {
  const out = form.querySelector<HTMLOutputElement>(`output[data-for="${name}"]`);
  if (!out) return;
  const unit = out.dataset.unit ?? '';
  out.value =
    unit === 'wpm' ? `~${wordsPerMinute(value)} wpm` : unit === '%' ? `${Math.round(value * 100)}%` : `${value}${unit}`;
}

function fill(s: Settings) {
  for (const [key, value] of Object.entries(s)) {
    const el = form.elements.namedItem(key) as HTMLInputElement | HTMLSelectElement | null;
    if (!el) continue;
    if (el instanceof HTMLInputElement && el.type === 'checkbox') el.checked = Boolean(value);
    else el.value = String(value);
    if (typeof value === 'number') show(key, value);
  }
}

const ALL_SITES = { origins: ['<all_urls>'] };

form.addEventListener('input', async (e) => {
  const el = e.target as HTMLInputElement | HTMLSelectElement;
  if (el.name === 'selectionToolbar' && el instanceof HTMLInputElement) {
    // permissions.request must run inside the user gesture, before any other await.
    const ok = el.checked ? await browser.permissions.request(ALL_SITES) : await browser.permissions.remove(ALL_SITES);
    if (el.checked && !ok) el.checked = false;
  }
  const value =
    el instanceof HTMLInputElement && el.type === 'checkbox' ? el.checked : el.type === 'range' ? Number(el.value) : el.value;
  if (typeof value === 'number') show(el.name, value);
  void saveSettings({ [el.name]: value } as Partial<Settings>);
});

loadSettings().then(fill);
