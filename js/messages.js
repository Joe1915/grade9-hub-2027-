import { $, toast, store } from './dom.js';
import { isDemo, sendMessage } from './api.js';
import { initShell } from './shell.js';

const COOLDOWN_MS = 15000;

const submitMessage = async (event) => {
  event.preventDefault();
  if (Date.now() - Number(store.get('last_message') ?? 0) < COOLDOWN_MS) {
    return toast('استنى شوي قبل ما تبعت رسالة ثانية.');
  }

  const form = event.currentTarget;
  const body = form.elements.body.value.trim();
  if (body.length < 3) return toast('اكتب رسالة أطول شوي.');

  try {
    await sendMessage({
      senderName: form.elements.name.value.trim(),
      senderClass: form.elements.className.value.trim(),
      body,
    });
    store.set('last_message', String(Date.now()));
    form.reset();
    $('#form-box').hidden = true;
    $('#done-box').hidden = false;
  } catch {
    toast('صار خطأ، جرّب مرة ثانية.');
  }
};

initShell('messages');
$('#demo-banner').hidden = !isDemo;
$('#message-form').addEventListener('submit', submitMessage);
$('#again').addEventListener('click', () => {
  $('#done-box').hidden = true;
  $('#form-box').hidden = false;
});
