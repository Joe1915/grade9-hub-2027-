import { CURRENCY } from './config.js';

// بناء عناصر الصفحة بدون innerHTML، عشان أي نص يكتبه الطلاب ما ينفذ ككود.
export const h = (tag, props = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
};

export const $ = (selector, root = document) => root.querySelector(selector);

const dateFormat = new Intl.DateTimeFormat('ar', { dateStyle: 'short', timeStyle: 'short' });
export const formatDate = (iso) => dateFormat.format(new Date(iso));

export const toast = (text) => {
  const box = $('#toast');
  if (!box) return;
  box.textContent = text;
  box.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => box.classList.remove('show'), 3500);
};

// localStorage قد يرمي خطأ بوضع التصفح الخاص، فنتجاهله.
export const store = {
  get: (key) => {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set: (key, value) => {
    try { localStorage.setItem(key, value); } catch { /* تجاهل */ }
  },
};

// الأسعار الصغيرة تنعرض بالقروش لأن الطلاب بحكوا هيك (0.35 = 35 قرش).
export const formatPrice = (value) => {
  const amount = Number(value);
  if (amount > 0 && amount < 1) return `${Math.round(amount * 100)} قرش`;
  return `${amount.toFixed(2).replace(/\.00$/, '')} ${CURRENCY}`;
};

// بعض السيرفرات تحوّل seller.html إلى /seller وتحذف ?t=... فندعم #t=... كمان
// ونحفظ التوكن بالجلسة عشان التحديث ما يضيّعه.
export const getToken = (key) => {
  const fromQuery = new URLSearchParams(location.search).get('t');
  const fromHash = new URLSearchParams(location.hash.slice(1)).get('t');
  const found = fromQuery || fromHash;
  try {
    if (found) sessionStorage.setItem(`token_${key}`, found);
    return found || sessionStorage.getItem(`token_${key}`) || '';
  } catch {
    return found || '';
  }
};

// يقبل أرقام عربية وفاصلة عادية أو عربية: 0.35 / 0,35 / ٠٫٣٥
// يرجّع null إذا فاضي، NaN إذا مش رقم، وإلا الرقم.
export const parsePrice = (raw) => {
  const text = String(raw).trim()
    .replace(/[٠-٩]/g, (digit) => '٠١٢٣٤٥٦٧٨٩'.indexOf(digit))
    .replace(/[,،٫٬/]/g, '.');
  if (text === '') return null;
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 ? value : NaN;
};
