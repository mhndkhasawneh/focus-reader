// Messages sent to the background service worker.

/** From a page: text was double-clicked, show the focus toolbar in that frame. */
export const SHOW_TOOLBAR = 'focus-reader:show-toolbar';
/** From the side panel: run a mode in the tab you're looking at. */
export const RUN_MODE = 'focus-reader:run';

export type Message = { type: typeof SHOW_TOOLBAR } | { type: typeof RUN_MODE; mode: 'flow' | 'reader' };
