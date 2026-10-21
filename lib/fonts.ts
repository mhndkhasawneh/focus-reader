// @font-face does not work inside a shadow root, so the faces are declared on the page once.
export function installFonts(): void {
  if (document.getElementById('focus-reader-fonts')) return;
  const url = (f: string) => browser.runtime.getURL(`/fonts/${f}` as '/');
  const style = document.createElement('style');
  style.id = 'focus-reader-fonts';
  style.textContent = `
    @font-face { font-family: 'Lexend Variable'; font-weight: 100 900; font-display: swap; src: url(${url('lexend.woff2')}) format('woff2'); }
    @font-face { font-family: 'Atkinson Hyperlegible'; font-weight: 400; font-display: swap; src: url(${url('atkinson-400.woff2')}) format('woff2'); }
    @font-face { font-family: 'Atkinson Hyperlegible'; font-weight: 700; font-display: swap; src: url(${url('atkinson-700.woff2')}) format('woff2'); }`;
  document.head.appendChild(style);
}
