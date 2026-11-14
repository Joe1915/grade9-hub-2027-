import { h, $, toast, store, formatDate, formatPrice } from './dom.js';
import {
  isDemo, listProducts, createOrder, sendMessage,
  createSpecialRequest, getMyRequests, cancelMyRequest,
} from './api.js';
import { PRODUCT_CATEGORIES, CATEGORY_ICON } from './categories.js';

const CATEGORIES = [['all', 'الكل'], ...PRODUCT_CATEGORIES];
const SUBMIT_COOLDOWN_MS = 15000;

const state = { products: [], category: 'all', query: '', selected: null };

const isCoolingDown = (key) => Date.now() - Number(store.get(key) ?? 0) < SUBMIT_COOLDOWN_MS;
const markSubmitted = (key) => store.set(key, String(Date.now()));

const visibleProducts = () => {
  const query = state.query.trim().toLowerCase();
  return state.products.filter((product) => {
    const inCategory = state.category === 'all' || product.category === state.category;
    const inQuery = !query || `${product.name} ${product.description ?? ''}`.toLowerCase().includes(query);
    return inCategory && inQuery;
  });
};

const productPicture = (product) =>
  product.image_url?.startsWith('https://')
    ? h('img', { class: 'pic', src: product.image_url, alt: product.name, loading: 'lazy' })
    : h('div', { class: 'pic', 'aria-hidden': 'true' }, CATEGORY_ICON[product.category] ?? CATEGORY_ICON.other);

const whatsappLink = (product) => {
  const text = `مرحبا، بدي أطلب "${product.name}" (${formatPrice(product.price)}) من Grade 9 Hub.`;
  return `https://wa.me/${product.seller_whatsapp}?text=${encodeURIComponent(text)}`;
};

const productCard = (product) =>
  h('article', { class: 'card' },
    productPicture(product),
    h('div', { class: 'body' },
      h('h3', {}, product.name),
      product.description && h('p', { class: 'desc' }, product.description),
      h('div', { class: 'meta' },
        h('span', { class: 'price' }, formatPrice(product.price)),
        h('span', { class: 'seller' }, `البائع: ${product.seller_name}`),
      ),
      h('div', { class: 'actions' },
        h('button', { class: 'btn', type: 'button', onClick: () => openOrder(product) }, 'اطلب'),
        product.seller_whatsapp && h('a', {
          class: 'btn ghost',
          href: whatsappLink(product),
          target: '_blank',
          rel: 'noopener',
        }, 'واتساب'),
      ),
    ),
  );

const renderGrid = () => {
  const items = visibleProducts();
  $('#grid').replaceChildren(...items.map(productCard));
  $('#empty').hidden = items.length > 0;
};

const renderChips = () => {
  $('#chips').replaceChildren(...CATEGORIES.map(([id, label]) =>
    h('button', {
      type: 'button',
      class: `chip${state.category === id ? ' on' : ''}`,
      'aria-pressed': String(state.category === id),
      onClick: () => {
        state.category = id;
        renderChips();
        renderGrid();
      },
    }, label)));
};

// ---------- الطلب ----------

const openOrder = (product) => {
  state.selected = product;
  const form = $('#order-form');
  $('#order-title').textContent = `اطلب: ${product.name} (${formatPrice(product.price)})`;
  form.elements.name.value = store.get('buyer_name') ?? '';
  form.elements.className.value = store.get('buyer_class') ?? '';
  form.elements.note.value = '';
  $('#order-dialog').showModal();
};

const submitOrder = async (event) => {
  event.preventDefault();
  if (!state.selected) return;
  if (isCoolingDown('last_order')) return toast('استنى شوي قبل ما تبعت طلب ثاني.');

  const form = event.currentTarget;
  const buyerName = form.elements.name.value.trim();
  const buyerClass = form.elements.className.value.trim();
  if (!buyerName || !buyerClass) return toast('اكتب اسمك وشعبتك.');

  try {
    await createOrder({
      productId: state.selected.id,
      buyerName,
      buyerClass,
      note: form.elements.note.value.trim(),
    });
    store.set('buyer_name', buyerName);
    store.set('buyer_class', buyerClass);
    markSubmitted('last_order');
    $('#order-dialog').close();
    toast('وصل طلبك! البائع بجهّزه وبلاقيك بالمدرسة.');
  } catch {
    toast('صار خطأ، جرّب مرة ثانية.');
  }
};

// ---------- رسالة للقادة ----------

const submitMessage = async (event) => {
  event.preventDefault();
  if (isCoolingDown('last_message')) return toast('استنى شوي قبل ما تبعت رسالة ثانية.');

  const form = event.currentTarget;
  const body = form.elements.body.value.trim();
  if (body.length < 3) return toast('اكتب رسالة أطول شوي.');

  try {
    await sendMessage({
      senderName: form.elements.name.value.trim(),
      senderClass: form.elements.className.value.trim(),
      body,
    });
    markSubmitted('last_message');
    form.reset();
    $('#message-dialog').close();
    toast('وصلت رسالتك للقادة.');
  } catch {
    toast('صار خطأ، جرّب مرة ثانية.');
  }
};

// ---------- الطلبات الخاصة ----------

const REQUEST_KEY = 'request_tokens';
const REQUEST_REFRESH_MS = 30000;
const REQUEST_STATUS = {
  open: 'بانتظار بائع',
  accepted: 'قبله بائع',
  ready: 'جاهز للاستلام',
  done: 'تم التسليم',
  cancelled: 'ملغي',
};

const readTokens = () => {
  try { return JSON.parse(store.get(REQUEST_KEY) ?? '[]'); } catch { return []; }
};
const saveToken = (token) =>
  store.set(REQUEST_KEY, JSON.stringify([token, ...readTokens()].slice(0, 10)));

const requestRow = (request) =>
  h('article', { class: 'row' },
    h('div', { class: 'head' },
      h('strong', {}, request.body),
      h('span', { class: `badge ${request.status}` }, REQUEST_STATUS[request.status] ?? request.status),
    ),
    request.seller_name && h('div', {},
      `البائع: ${request.seller_name}${request.price != null ? ` — السعر: ${formatPrice(request.price)}` : ''}`),
    request.status === 'open' && request.max_price != null &&
      h('div', { class: 'desc' }, `أعلى سعر عندك: ${formatPrice(request.max_price)}`),
    request.status === 'ready' && h('div', { class: 'hint' }, 'جاهز! استلمه بالمدرسة وادفع كاش.'),
    h('div', { class: 'time' }, formatDate(request.created_at)),
    ['open', 'accepted'].includes(request.status) && h('div', { class: 'actions' },
      h('button', {
        class: 'btn small bad',
        type: 'button',
        onClick: () => cancelRequest(request.buyer_token),
      }, 'إلغاء الطلب')),
  );

const refreshMyRequests = async () => {
  const tokens = readTokens();
  if (!tokens.length) return;
  try {
    const rows = (await getMyRequests(tokens)).filter((row) => row.status !== 'cancelled');
    $('#my-requests-list').replaceChildren(...rows.map(requestRow));
    $('#my-requests').hidden = rows.length === 0;
  } catch {
    // نجرّب مرة ثانية بالتحديث الجاي
  }
};

const cancelRequest = async (token) => {
  try {
    await cancelMyRequest(token);
    await refreshMyRequests();
  } catch {
    toast('ما انلغى الطلب، جرّب مرة ثانية.');
  }
};

const openRequest = () => {
  const form = $('#request-form');
  form.elements.name.value = store.get('buyer_name') ?? '';
  form.elements.className.value = store.get('buyer_class') ?? '';
  $('#request-dialog').showModal();
};

const submitRequest = async (event) => {
  event.preventDefault();
  if (isCoolingDown('last_request')) return toast('استنى شوي قبل ما تبعت طلب ثاني.');

  const form = event.currentTarget;
  const body = form.elements.body.value.trim();
  const buyerName = form.elements.name.value.trim();
  const buyerClass = form.elements.className.value.trim();
  if (body.length < 3 || !buyerName || !buyerClass) return toast('عبّي الحقول المطلوبة.');

  const maxRaw = form.elements.maxPrice.value;
  try {
    const token = await createSpecialRequest({
      buyerName,
      buyerClass,
      body,
      maxPrice: maxRaw === '' ? null : Number(maxRaw),
    });
    saveToken(token);
    store.set('buyer_name', buyerName);
    store.set('buyer_class', buyerClass);
    markSubmitted('last_request');
    form.reset();
    $('#request-dialog').close();
    toast('وصل طلبك للبائعين. تابع حالته تحت "طلباتي الخاصة".');
    await refreshMyRequests();
  } catch {
    toast('صار خطأ، جرّب مرة ثانية.');
  }
};

// ---------- تشغيل ----------

const closeDialogs = () => {
  document.querySelectorAll('[data-close]').forEach((button) =>
    button.addEventListener('click', () => button.closest('dialog').close()));
};

const init = async () => {
  $('#demo-banner').hidden = !isDemo;
  renderChips();
  closeDialogs();

  $('#search').addEventListener('input', (event) => {
    state.query = event.target.value;
    renderGrid();
  });
  $('#order-form').addEventListener('submit', submitOrder);
  $('#message-form').addEventListener('submit', submitMessage);
  $('#open-message').addEventListener('click', () => $('#message-dialog').showModal());
  $('#request-form').addEventListener('submit', submitRequest);
  $('#open-request').addEventListener('click', openRequest);

  try {
    state.products = await listProducts();
  } catch {
    toast('ما قدرنا نحمّل المنتجات. تأكد من النت وجرّب مرة ثانية.');
  }
  renderGrid();

  refreshMyRequests();
  setInterval(refreshMyRequests, REQUEST_REFRESH_MS);
};

init();
