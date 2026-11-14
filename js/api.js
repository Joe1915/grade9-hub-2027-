import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { store } from './dom.js';

export const isDemo = !SUPABASE_URL || !SUPABASE_ANON_KEY;

// ---------- Supabase ----------

let clientPromise;
const getClient = () => {
  clientPromise ??= import('./vendor/supabase.js').then(({ createClient }) =>
    createClient(SUPABASE_URL, SUPABASE_ANON_KEY),
  );
  return clientPromise;
};

const unwrap = ({ data, error }) => {
  if (error) throw new Error(error.message);
  return data;
};

// ---------- الوضع التجريبي (بدون سيرفر) ----------

const DEMO_PRODUCTS = [
  { id: 'd1', name: 'شيبس ليز', price: 0.5, category: 'chips', description: 'كيس صغير', image_url: null, seller_name: 'بائع تجريبي', seller_whatsapp: '962790000000' },
  { id: 'd2', name: 'كولا', price: 0.75, category: 'drinks', description: 'علبة باردة', image_url: null, seller_name: 'بائع تجريبي' },
  { id: 'd3', name: 'ساندويش جبنة', price: 1, category: 'sandwiches', description: 'طازج كل يوم', image_url: null, seller_name: 'بائعة تجريبية' },
  { id: 'd4', name: 'شوكولاتة', price: 0.5, category: 'sweets', description: null, image_url: null, seller_name: 'بائعة تجريبية' },
];

const readDemo = (key) => JSON.parse(store.get(key) ?? '[]');
const writeDemo = (key, rows) => store.set(key, JSON.stringify(rows));

const demoOwnProducts = () =>
  readDemo('demo_products')
    .filter((row) => row.available)
    .map((row) => ({
      ...row,
      image_url: null,
      seller_name: 'بائع تجريبي',
      seller_whatsapp: store.get('demo_whatsapp') || null,
    }));

// ---------- واجهة موحدة ----------

export const listProducts = async () => {
  if (isDemo) return [...DEMO_PRODUCTS, ...demoOwnProducts()];
  const db = await getClient();
  return unwrap(await db.from('market_products').select('*').order('name'));
};

export const createOrder = async ({ productId, buyerName, buyerClass, note }) => {
  if (isDemo) {
    const product = DEMO_PRODUCTS.find((item) => item.id === productId);
    const rows = readDemo('demo_orders');
    rows.unshift({
      id: crypto.randomUUID(),
      product_name: product?.name ?? '',
      buyer_name: buyerName,
      buyer_class: buyerClass,
      note: note || null,
      status: 'new',
      created_at: new Date().toISOString(),
    });
    writeDemo('demo_orders', rows);
    return;
  }
  const db = await getClient();
  unwrap(await db.from('orders').insert({
    product_id: productId,
    buyer_name: buyerName,
    buyer_class: buyerClass,
    note: note || null,
  }));
};

export const sendMessage = async ({ senderName, senderClass, body }) => {
  if (isDemo) {
    const rows = readDemo('demo_messages');
    rows.unshift({
      id: crypto.randomUUID(),
      sender_name: senderName || null,
      sender_class: senderClass || null,
      body,
      created_at: new Date().toISOString(),
    });
    writeDemo('demo_messages', rows);
    return;
  }
  const db = await getClient();
  unwrap(await db.from('messages').insert({
    sender_name: senderName || null,
    sender_class: senderClass || null,
    body,
  }));
};

export const getSellerName = async (token) => {
  if (isDemo) return token === 'demo' ? 'بائع تجريبي' : null;
  const db = await getClient();
  return unwrap(await db.rpc('seller_name', { p_token: token }));
};

export const getSellerOrders = async (token) => {
  if (isDemo) return readDemo('demo_orders');
  const db = await getClient();
  return unwrap(await db.rpc('seller_orders', { p_token: token }));
};

export const setOrderStatus = async (token, orderId, status) => {
  if (isDemo) {
    writeDemo('demo_orders', readDemo('demo_orders').map((row) =>
      row.id === orderId ? { ...row, status } : row));
    return;
  }
  const db = await getClient();
  unwrap(await db.rpc('seller_set_status', { p_token: token, p_order: orderId, p_status: status }));
};

export const getLeaderName = async (token) => {
  if (isDemo) return token === 'demo' ? 'ليدر تجريبي' : null;
  const db = await getClient();
  return unwrap(await db.rpc('leader_name', { p_token: token }));
};

export const getLeaderMessages = async (token) => {
  if (isDemo) return readDemo('demo_messages');
  const db = await getClient();
  return unwrap(await db.rpc('leader_messages', { p_token: token }));
};

// ---------- الطلبات الخاصة ----------

const DEMO_SELLER = 'بائع تجريبي';

export const createSpecialRequest = async ({ buyerName, buyerClass, body, maxPrice }) => {
  if (isDemo) {
    const token = crypto.randomUUID();
    const rows = readDemo('demo_requests');
    rows.unshift({
      id: crypto.randomUUID(),
      buyer_token: token,
      buyer_name: buyerName,
      buyer_class: buyerClass,
      body,
      max_price: maxPrice,
      status: 'open',
      seller_name: null,
      price: null,
      mine: false,
      created_at: new Date().toISOString(),
    });
    writeDemo('demo_requests', rows);
    return token;
  }
  const db = await getClient();
  return unwrap(await db.rpc('create_special_request', {
    p_name: buyerName,
    p_class: buyerClass,
    p_body: body,
    p_max_price: maxPrice,
  }));
};

export const getMyRequests = async (tokens) => {
  if (isDemo) return readDemo('demo_requests').filter((row) => tokens.includes(row.buyer_token));
  const db = await getClient();
  return unwrap(await db.rpc('my_special_requests', { p_tokens: tokens }));
};

export const cancelMyRequest = async (token) => {
  if (isDemo) {
    writeDemo('demo_requests', readDemo('demo_requests').map((row) =>
      row.buyer_token === token ? { ...row, status: 'cancelled' } : row));
    return;
  }
  const db = await getClient();
  unwrap(await db.rpc('cancel_my_request', { p_token: token }));
};

export const getSellerRequests = async (token) => {
  if (isDemo) return readDemo('demo_requests').filter((row) => row.status === 'open' || row.mine);
  const db = await getClient();
  return unwrap(await db.rpc('seller_requests', { p_token: token }));
};

export const acceptRequest = async (token, requestId, price) => {
  if (isDemo) {
    const rows = readDemo('demo_requests');
    const target = rows.find((row) => row.id === requestId);
    if (!target || target.status !== 'open') return false;
    Object.assign(target, { status: 'accepted', seller_name: DEMO_SELLER, price, mine: true });
    writeDemo('demo_requests', rows);
    return true;
  }
  const db = await getClient();
  return unwrap(await db.rpc('seller_accept_request', {
    p_token: token,
    p_request: requestId,
    p_price: price,
  }));
};

export const setRequestStatus = async (token, requestId, status) => {
  if (isDemo) {
    writeDemo('demo_requests', readDemo('demo_requests').map((row) =>
      row.id === requestId ? { ...row, status } : row));
    return;
  }
  const db = await getClient();
  unwrap(await db.rpc('seller_set_request_status', {
    p_token: token,
    p_request: requestId,
    p_status: status,
  }));
};

// ---------- إعلانات البائع + واتساب ----------

export const getSellerProducts = async (token) => {
  if (isDemo) return readDemo('demo_products');
  const db = await getClient();
  return unwrap(await db.rpc('seller_products', { p_token: token }));
};

export const addProduct = async (token, { name, price, category, description }) => {
  if (isDemo) {
    const rows = readDemo('demo_products');
    rows.unshift({
      id: crypto.randomUUID(),
      name,
      price,
      category,
      description: description || null,
      available: true,
      created_at: new Date().toISOString(),
    });
    writeDemo('demo_products', rows);
    return;
  }
  const db = await getClient();
  unwrap(await db.rpc('seller_add_product', {
    p_token: token,
    p_name: name,
    p_price: price,
    p_category: category,
    p_description: description || null,
  }));
};

export const setProductAvailable = async (token, productId, available) => {
  if (isDemo) {
    writeDemo('demo_products', readDemo('demo_products').map((row) =>
      row.id === productId ? { ...row, available } : row));
    return;
  }
  const db = await getClient();
  unwrap(await db.rpc('seller_set_product_available', {
    p_token: token,
    p_product: productId,
    p_available: available,
  }));
};

export const getSellerWhatsapp = async (token) => {
  if (isDemo) return store.get('demo_whatsapp') ?? '';
  const db = await getClient();
  return (unwrap(await db.rpc('seller_whatsapp', { p_token: token }))) ?? '';
};

export const setSellerWhatsapp = async (token, number) => {
  if (isDemo) {
    store.set('demo_whatsapp', number);
    return;
  }
  const db = await getClient();
  unwrap(await db.rpc('seller_set_whatsapp', { p_token: token, p_number: number }));
};
