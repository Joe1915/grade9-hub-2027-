import { h, $, toast, formatDate, formatPrice, getToken } from './dom.js';
import { PRODUCT_CATEGORIES } from './categories.js';
import {
  isDemo, getSellerName, getSellerOrders, setOrderStatus,
  getSellerRequests, acceptRequest, setRequestStatus,
  getSellerProducts, addProduct, setProductAvailable, getSellerWhatsapp, setSellerWhatsapp,
} from './api.js';

const REFRESH_MS = 30000;
const STATUS_LABEL = {
  new: 'جديد', open: 'مفتوح', accepted: 'قبلته', ready: 'جاهز', done: 'تم التسليم', cancelled: 'ملغي',
};

const token = getToken('seller');

const changeStatus = async (orderId, status) => {
  try {
    await setOrderStatus(token, orderId, status);
    await refresh();
  } catch {
    toast('ما انحفظ التغيير، جرّب مرة ثانية.');
  }
};

const actionsFor = (order) => {
  const act = (label, status, extra = '') =>
    h('button', {
      class: `btn small ${extra}`.trim(),
      type: 'button',
      onClick: () => changeStatus(order.id, status),
    }, label);

  if (order.status === 'new') return [act('جاهز للاستلام', 'ready'), act('إلغاء', 'cancelled', 'bad')];
  if (order.status === 'ready') return [act('تم التسليم', 'done', 'ok'), act('إلغاء', 'cancelled', 'bad')];
  return [];
};

const orderRow = (order) =>
  h('article', { class: 'row' },
    h('div', { class: 'head' },
      h('strong', {}, order.product_name),
      h('span', { class: `badge ${order.status}` }, STATUS_LABEL[order.status] ?? order.status),
    ),
    h('div', {}, `${order.buyer_name} — شعبة ${order.buyer_class}`),
    order.note && h('div', { class: 'desc' }, `ملاحظة: ${order.note}`),
    h('div', { class: 'time' }, formatDate(order.created_at)),
    h('div', { class: 'actions' }, ...actionsFor(order)),
  );

const changeRequestStatus = async (requestId, status) => {
  try {
    await setRequestStatus(token, requestId, status);
    await refresh();
  } catch {
    toast('ما انحفظ التغيير، جرّب مرة ثانية.');
  }
};

// يقبل أرقام عربية وفاصلة عادية أو عربية: 0.35 / 0,35 / ٠٫٣٥
const parsePrice = (raw) => {
  const text = String(raw).trim()
    .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/[,،٫٬/]/g, '.');
  if (text === '') return null;
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 ? value : NaN;
};

const takeRequest = async (requestId, priceInput) => {
  const price = parsePrice(priceInput.value);
  if (Number.isNaN(price)) return toast('اكتب السعر أرقام فقط، مثل 0.35');
  try {
    const won = await acceptRequest(token, requestId, price);
    toast(won ? 'قبلت الطلب. جهّزه وحدّث حالته.' : 'سبقك بائع ثاني على هالطلب.');
    await refresh();
  } catch {
    toast('صار خطأ، جرّب مرة ثانية.');
  }
};

const requestActions = (request) => {
  if (request.status === 'open') {
    const priceInput = h('input', {
      type: 'text', inputmode: 'decimal',
      placeholder: 'سعرك (اختياري)', 'aria-label': 'سعرك',
    });
    return [
      priceInput,
      h('button', { class: 'btn small', type: 'button', onClick: () => takeRequest(request.id, priceInput) }, 'أقبل الطلب'),
    ];
  }
  const act = (label, status, extra = '') =>
    h('button', {
      class: `btn small ${extra}`.trim(),
      type: 'button',
      onClick: () => changeRequestStatus(request.id, status),
    }, label);

  if (request.status === 'accepted') return [act('جاهز للاستلام', 'ready'), act('إلغاء', 'cancelled', 'bad')];
  if (request.status === 'ready') return [act('تم التسليم', 'done', 'ok'), act('إلغاء', 'cancelled', 'bad')];
  return [];
};

const requestRow = (request) =>
  h('article', { class: 'row' },
    h('div', { class: 'head' },
      h('strong', {}, request.body),
      h('span', { class: `badge ${request.status}` }, STATUS_LABEL[request.status] ?? request.status),
    ),
    h('div', {}, `${request.buyer_name} — شعبة ${request.buyer_class}`),
    request.max_price != null && h('div', { class: 'desc' }, `أعلى سعر عنده: ${formatPrice(request.max_price)}`),
    request.price != null && request.mine && h('div', { class: 'desc' }, `سعرك: ${formatPrice(request.price)}`),
    h('div', { class: 'time' }, formatDate(request.created_at)),
    h('div', { class: 'actions' }, ...requestActions(request)),
  );

const toggleProduct = async (product) => {
  try {
    await setProductAvailable(token, product.id, !product.available);
    await refresh();
  } catch {
    toast('ما انحفظ التغيير، جرّب مرة ثانية.');
  }
};

const productRow = (product) =>
  h('article', { class: 'row' },
    h('div', { class: 'head' },
      h('strong', {}, product.name),
      h('span', { class: `badge ${product.available ? 'done' : 'cancelled'}` },
        product.available ? 'ظاهر للطلاب' : 'مخفي'),
    ),
    h('div', {}, formatPrice(product.price)),
    product.description && h('div', { class: 'desc' }, product.description),
    h('div', { class: 'actions' },
      h('button', {
        class: `btn small ${product.available ? 'bad' : 'ok'}`,
        type: 'button',
        onClick: () => toggleProduct(product),
      }, product.available ? 'أخفِ الإعلان' : 'أظهر الإعلان')),
  );

const submitProduct = async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const name = form.elements.name.value.trim();
  const price = parsePrice(form.elements.price.value);
  if (!name || price === null) return toast('اكتب اسم المنتج وسعره.');
  if (Number.isNaN(price)) return toast('اكتب السعر أرقام فقط، مثل 0.35');

  try {
    await addProduct(token, {
      name,
      price,
      category: form.elements.category.value,
      description: form.elements.description.value.trim(),
    });
    form.reset();
    toast('اننشر إعلانك.');
    await refresh();
  } catch {
    toast('ما انحفظ الإعلان، جرّب مرة ثانية.');
  }
};

// يقبل 0791234567 أو 962791234567 أو أرقام عربية، ويحوّلها لصيغة دولية.
const normalizeWhatsapp = (raw) => {
  const latin = raw.replace(/[٠-٩]/g, (digit) => '٠١٢٣٤٥٦٧٨٩'.indexOf(digit));
  let digits = latin.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = `962${digits.slice(1)}`;
  return digits;
};

const submitWhatsapp = async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const number = normalizeWhatsapp(form.elements.number.value);
  if (number && !/^\d{8,15}$/.test(number)) return toast('الرقم غير صحيح.');

  try {
    await setSellerWhatsapp(token, number);
    form.elements.number.value = number;
    toast(number ? 'انحفظ رقم الواتساب.' : 'انشال رقم الواتساب.');
  } catch {
    toast('ما انحفظ الرقم، جرّب مرة ثانية.');
  }
};

const refresh = async () => {
  const [orders, requests, products] = await Promise.all([
    getSellerOrders(token),
    getSellerRequests(token),
    getSellerProducts(token),
  ]);
  $('#list').replaceChildren(...orders.map(orderRow));
  $('#empty').hidden = orders.length > 0;

  const visibleRequests = requests.filter((row) => row.status !== 'cancelled');
  $('#requests').replaceChildren(...visibleRequests.map(requestRow));
  $('#requests-empty').hidden = visibleRequests.length > 0;

  $('#my-products').replaceChildren(...products.map(productRow));
  $('#my-products-empty').hidden = products.length > 0;
};

const init = async () => {
  $('#demo-banner').hidden = !isDemo;
  let name = null;
  let connectionFailed = false;
  if (token) {
    try {
      name = await getSellerName(token);
    } catch {
      connectionFailed = true;
    }
  }
  if (!name) {
    $('#invalid').textContent = connectionFailed
      ? 'ما قدرنا نتصل بالسيرفر. تأكد من النت وحدّث الصفحة.'
      : 'الرابط غير صحيح. اطلب الرابط الصحيح من صاحب الموقع.';
    $('#invalid').hidden = false;
    $('#seller-area').hidden = true;
    return;
  }
  $('#title').textContent = `طلبات ${name}`;

  const productForm = $('#product-form');
  productForm.elements.category.replaceChildren(
    ...PRODUCT_CATEGORIES.map(([id, label]) => h('option', { value: id }, label)));
  productForm.addEventListener('submit', submitProduct);
  $('#whatsapp-form').addEventListener('submit', submitWhatsapp);
  $('#whatsapp-form').elements.number.value = await getSellerWhatsapp(token).catch(() => '');

  await refresh().catch(() => toast('ما قدرنا نحمّل الطلبات.'));
  setInterval(() => refresh().catch(() => {}), REFRESH_MS);
};

init();
