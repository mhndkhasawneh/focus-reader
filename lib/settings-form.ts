// Two-way binding between a <form> and the stored settings, shared by the Options page and the side panel.
// Controls are matched to settings by their `name`; checkboxes, ranges, selects, radios and colour inputs all work.
import { cursorSvg, svgUrl } from './hover';
import { wordsPerMinute } from './pacer';
import { HOVER_PRESETS, loadSettings, onSettingsChanged, saveSettings, type HoverCursor, type Settings } from './settings';

export function bindSettingsForm(form: HTMLFormElement): void {
  const show = (name: string, value: number) => {
    const out = form.querySelector<HTMLOutputElement>(`output[data-for="${name}"]`);
    if (!out) return;
    const unit = out.dataset.unit ?? '';
    out.value =
      unit === 'wpm' ? `~${wordsPerMinute(value)} wpm` : unit === '%' ? `${Math.round(value * 100)}%` : `${value}${unit}`;
  };

  // Colour swatches: <div data-swatches> gets one button per preset.
  const swatches = form.querySelector<HTMLElement>('[data-swatches]');
  const colorInput = form.elements.namedItem('hoverColor') as HTMLInputElement | null;
  if (swatches && colorInput) {
    for (const [name, color] of Object.entries(HOVER_PRESETS)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.title = name;
      b.setAttribute('aria-label', `${name} highlight`);
      b.dataset.color = color;
      b.style.background = color;
      b.addEventListener('click', () => {
        colorInput.value = color;
        colorInput.dispatchEvent(new Event('input', { bubbles: true }));
      });
      swatches.append(b);
    }
  }

  // Cursor choices: <img data-cursor="hand"> previews drawn in the current highlight colour.
  const paintCursors = (color: string) => {
    form.querySelectorAll<HTMLImageElement>('img[data-cursor]').forEach((img) => {
      const svg = cursorSvg(img.dataset.cursor as HoverCursor, color);
      if (svg) img.src = svgUrl(svg);
    });
  };

  const reflect = (s: Settings) => {
    swatches?.querySelectorAll<HTMLButtonElement>('button').forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.color === s.hoverColor)),
    );
    paintCursors(s.hoverColor);
  };

  const fill = (s: Settings) => {
    for (const [key, value] of Object.entries(s)) {
      const el = form.elements.namedItem(key) as HTMLInputElement | HTMLSelectElement | RadioNodeList | null;
      if (!el) continue;
      if (el instanceof HTMLInputElement && el.type === 'checkbox') el.checked = Boolean(value);
      else el.value = String(value);
      if (typeof value === 'number') show(key, value);
    }
    reflect(s);
  };

  form.addEventListener('input', (e) => {
    const el = e.target as HTMLInputElement | HTMLSelectElement;
    if (!el.name) return;
    const value =
      el instanceof HTMLInputElement && el.type === 'checkbox' ? el.checked : el.type === 'range' ? Number(el.value) : el.value;
    if (typeof value === 'number') show(el.name, value);
    void saveSettings({ [el.name]: value } as Partial<Settings>).then(reflect);
  });

  // Keep in sync when the other page (or a keyboard shortcut on the page) changes a setting.
  onSettingsChanged(fill);
  void loadSettings().then(fill);
}
