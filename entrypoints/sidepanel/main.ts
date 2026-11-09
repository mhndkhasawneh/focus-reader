import { RUN_MODE, type Message } from '@/lib/messages';
import { bindSettingsForm } from '@/lib/settings-form';

bindSettingsForm(document.querySelector<HTMLFormElement>('#f')!);

document.querySelectorAll<HTMLButtonElement>('[data-run]').forEach((b) =>
  b.addEventListener('click', () => {
    void browser.runtime.sendMessage({ type: RUN_MODE, mode: b.dataset.run as 'flow' | 'reader' } satisfies Message);
  }),
);
document.querySelector('#all')!.addEventListener('click', () => void browser.runtime.openOptionsPage());
