import { h, $, toast, formatDate, getToken } from './dom.js';
import { isDemo, getLeaderName, getLeaderMessages } from './api.js';

const REFRESH_MS = 60000;

const token = getToken('leader');

const senderLabel = (message) => {
  const name = message.sender_name || 'طالب بدون اسم';
  return message.sender_class ? `${name} — شعبة ${message.sender_class}` : name;
};

const messageRow = (message) =>
  h('article', { class: 'row' },
    h('div', { class: 'head' },
      h('strong', {}, senderLabel(message)),
      h('span', { class: 'time' }, formatDate(message.created_at)),
    ),
    h('p', { style: 'margin:0; white-space:pre-wrap' }, message.body),
  );

const refresh = async () => {
  const messages = await getLeaderMessages(token);
  $('#list').replaceChildren(...messages.map(messageRow));
  $('#empty').hidden = messages.length > 0;
};

const init = async () => {
  $('#demo-banner').hidden = !isDemo;
  let name = null;
  let connectionFailed = false;
  if (token) {
    try {
      name = await getLeaderName(token);
    } catch {
      connectionFailed = true;
    }
  }
  if (!name) {
    $('#invalid').textContent = connectionFailed
      ? 'ما قدرنا نتصل بالسيرفر. تأكد من النت وحدّث الصفحة.'
      : 'الرابط غير صحيح. اطلب الرابط الصحيح من صاحب الموقع.';
    $('#invalid').hidden = false;
    return;
  }
  $('#title').textContent = `رسائل الطلاب — ${name}`;
  await refresh().catch(() => toast('ما قدرنا نحمّل الرسائل.'));
  setInterval(() => refresh().catch(() => {}), REFRESH_MS);
};

init();
