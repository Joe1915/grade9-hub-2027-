import { h, $, store } from './dom.js';

// الشريط العلوي المشترك: قائمة برغر + زر فاتح/داكن.
// عند إضافة لغة ثانية لاحقًا، نغيّر النصوص هنا وبملف نصوص واحد.

const PAGES = [
  { id: 'market', href: 'index.html', icon: '🛒', label: 'السوق', hint: 'اطلب أكل وشرب من زملائك' },
  { id: 'messages', href: 'messages.html', icon: '💬', label: 'رسائل لنوّاب الشعب', hint: 'اقتراح أو مشكلة؟ ابعتها هون' },
];

const THEME_KEY = 'theme';

const currentTheme = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

const setTheme = (theme, button) => {
  document.documentElement.dataset.theme = theme;
  store.set(THEME_KEY, theme);
  paintThemeButton(button);
};

const paintThemeButton = (button) => {
  const dark = currentTheme() === 'dark';
  button.replaceChildren(
    h('span', { 'aria-hidden': 'true' }, dark ? '☀️' : '🌙'),
    h('span', { class: 'lbl' }, dark ? 'فاتح' : 'داكن'),
  );
  button.setAttribute('aria-label', dark ? 'غيّر للوضع الفاتح' : 'غيّر للوضع الداكن');
};

export const initShell = (activeId) => {
  const host = $('#site-header');
  if (!host) return;

  const menuButton = h('button', {
    class: 'icon-btn', type: 'button', id: 'menu-btn',
    'aria-label': 'افتح القائمة', 'aria-expanded': 'false', 'aria-controls': 'drawer',
  }, h('span', { class: 'bars', 'aria-hidden': 'true' }, h('span'), h('span'), h('span')));

  const themeButton = h('button', { class: 'icon-btn', type: 'button', id: 'theme-btn' });
  paintThemeButton(themeButton);
  themeButton.addEventListener('click', () =>
    setTheme(currentTheme() === 'dark' ? 'light' : 'dark', themeButton));

  const bar = h('div', { class: 'topbar' },
    menuButton,
    h('a', { class: 'brand', href: 'index.html' },
      h('span', { class: 'logo', 'aria-hidden': 'true' }, '🎒'),
      h('span', {}, 'Grade 9 Hub')),
    themeButton,
  );

  const closeButton = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'اقفل القائمة' }, '✕');
  const scrim = h('div', { id: 'scrim' });
  const drawer = h('nav', { id: 'drawer', 'aria-label': 'القائمة الرئيسية' },
    h('div', { class: 'drawer-head' }, h('h2', {}, 'القائمة'), closeButton),
    ...PAGES.map((page) =>
      h('a', {
        class: 'nav-link',
        href: page.href,
        'aria-current': page.id === activeId ? 'page' : null,
      },
      h('span', { class: 'ico', 'aria-hidden': 'true' }, page.icon),
      h('span', {}, page.label, h('small', {}, page.hint)))),
    h('p', { class: 'drawer-foot' }, 'موقع طلاب الصف التاسع'),
  );

  const setOpen = (open) => {
    drawer.classList.toggle('open', open);
    scrim.classList.toggle('open', open);
    menuButton.setAttribute('aria-expanded', String(open));
    if (open) closeButton.focus(); else menuButton.focus();
  };

  menuButton.addEventListener('click', () => setOpen(true));
  closeButton.addEventListener('click', () => setOpen(false));
  scrim.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && drawer.classList.contains('open')) setOpen(false);
  });

  host.replaceChildren(bar, scrim, drawer);
};
