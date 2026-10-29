const API = 'https://api.guerrillamail.com/ajax.php';
const KEY = 'tm_sess_v2';

const state = {
  sid: null,
  email: null,
  seq: 0,
  messages: [],
  currentId: null,
  auto: true,
  timer: null,
};

const $ = (s) => document.querySelector(s);
const emailEl = $('#emailAddress');
const domainHint = $('#domainHint');
const inboxList = $('#inboxList');
const emptyState = $('#emptyState');
const msgCount = $('#msgCount');
const backdrop = $('#sheetBackdrop');
const toastEl = $('#toast');

function toast(msg, type = '') {
  toastEl.textContent = msg;
  toastEl.className = 'toast show ' + type;
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => toastEl.classList.remove('show'), 2400);
}

function fmtTime(ts) {
  const d = typeof ts === 'number' ? new Date(ts * 1000) : new Date(ts);
  if (isNaN(d)) return '';
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'baru';
  if (diff < 3600) return Math.floor(diff / 60) + ' m';
  if (diff < 86400) return Math.floor(diff / 3600) + ' j';
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function initial(name) {
  if (!name) return '?';
  const p = name.trim().split(/[\s<@]+/);
  return (p[0][0] || '?').toUpperCase();
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s ?? '';
  return d.innerHTML;
}

async function gm(params) {
  const q = new URLSearchParams(params);
  if (state.sid) q.set('sid_token', state.sid);
  const res = await fetch(`${API}?${q}`, { method: 'GET', credentials: 'omit' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      sid: state.sid,
      email: state.email,
      seq: state.seq,
    }));
  } catch {}
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    if (!d.sid || !d.email) return false;
    state.sid = d.sid;
    state.email = d.email;
    state.seq = d.seq || 0;
    return true;
  } catch {
    return false;
  }
}

function setEmailUI(addr) {
  state.email = addr;
  emailEl.textContent = addr;
  $('#emailBox').classList.add('ready');
  $('#btnCopy').disabled = false;
  const domain = addr.includes('@') ? addr.split('@')[1] : '';
  domainHint.textContent = domain ? '@' + domain : '@…';
}

async function createEmail() {
  emailEl.textContent = 'Menyiapkan…';
  $('#emailBox').classList.remove('ready');
  $('#btnCopy').disabled = true;

  try {
    const data = await gm({ f: 'get_email_address', lang: 'en' });
    if (!data.email_addr || !data.sid_token) throw new Error('Respons tidak valid');
    state.sid = data.sid_token;
    state.seq = 0;
    state.messages = [];
    setEmailUI(data.email_addr);
    save();
    renderInbox();
    msgCount.textContent = '0';
    startPoll();
    toast('Email siap', 'ok');
  } catch (e) {
    emailEl.textContent = 'Gagal membuat email';
    toast(e.message || 'Gagal terhubung', 'err');
    console.error(e);
  }
}

async function setCustom(user) {
  if (!state.sid) {
    await createEmail();
  }
  try {
    const data = await gm({
      f: 'set_email_user',
      email_user: user,
      lang: 'en',
    });
    // API returns email_addr or sometimes just confirms
    const addr = data.email_addr || `${user}@${(state.email || '').split('@')[1] || 'guerrillamailblock.com'}`;
    if (data.sid_token) state.sid = data.sid_token;
    state.seq = 0;
    state.messages = [];
    setEmailUI(addr);
    save();
    renderInbox();
    msgCount.textContent = '0';
    startPoll();
    toast('Username dipasang', 'ok');
  } catch (e) {
    toast(e.message || 'Gagal set username', 'err');
    console.error(e);
  }
}

async function restore() {
  if (!load()) return false;
  try {
    // ping session
    const data = await gm({ f: 'get_email_address', lang: 'en' });
    // If we get a different email, session may have rotated — keep ours via set
    if (data.sid_token) state.sid = data.sid_token;
    // Re-assert our address if possible
    if (state.email) {
      const user = state.email.split('@')[0];
      try {
        await gm({ f: 'set_email_user', email_user: user, lang: 'en' });
      } catch {}
    }
    setEmailUI(state.email);
    await checkMail(true);
    startPoll();
    return true;
  } catch {
    localStorage.removeItem(KEY);
    state.sid = null;
    return false;
  }
}

async function checkMail(silent = false) {
  if (!state.sid) return;
  const btn = $('#btnRefresh');
  if (!silent) btn.classList.add('spinning');

  try {
    const data = await gm({ f: 'check_email', seq: state.seq });
    if (data.list && Array.isArray(data.list)) {
      // Guerrilla returns newest first sometimes; merge by mail_id
      const map = new Map(state.messages.map((m) => [String(m.mail_id), m]));
      for (const m of data.list) {
        if (m.mail_id === 0 || m.mail_id === '0') continue; // welcome placeholder
        map.set(String(m.mail_id), m);
      }
      state.messages = Array.from(map.values()).sort(
        (a, b) => Number(b.mail_timestamp || 0) - Number(a.mail_timestamp || 0)
      );
      if (typeof data.seq !== 'undefined') state.seq = data.seq;
      save();
      msgCount.textContent = String(state.messages.length);
      renderInbox();
    }
  } catch (e) {
    if (!silent) toast('Gagal cek inbox', 'err');
    console.error(e);
  } finally {
    btn.classList.remove('spinning');
  }
}

function renderInbox() {
  inboxList.querySelectorAll('.msg').forEach((el) => el.remove());

  if (!state.messages.length) {
    emptyState.style.display = 'flex';
    return;
  }
  emptyState.style.display = 'none';

  for (const m of state.messages) {
    const from = m.mail_from || 'Unknown';
    const el = document.createElement('div');
    el.className = 'msg';
    el.dataset.id = m.mail_id;
    el.innerHTML = `
      <div class="msg-av">${esc(initial(from))}</div>
      <div class="msg-body">
        <div class="msg-row">
          <span class="msg-from">${esc(from)}</span>
          <span class="msg-time">${esc(fmtTime(m.mail_timestamp))}</span>
        </div>
        <div class="msg-sub">${esc(m.mail_subject || '(Tanpa subjek)')}</div>
        <div class="msg-ex">${esc(m.mail_excerpt || '')}</div>
      </div>
    `;
    el.addEventListener('click', () => openMsg(m.mail_id));
    inboxList.appendChild(el);
  }
}

async function openMsg(id) {
  state.currentId = id;
  backdrop.hidden = false;
  requestAnimationFrame(() => backdrop.classList.add('open'));
  $('#sheetFrom').textContent = 'Memuat…';
  $('#sheetSubject').textContent = '';
  $('#sheetDate').textContent = '';
  $('#sheetBody').innerHTML = '<p style="color:var(--text-3)">Memuat pesan…</p>';

  try {
    const data = await gm({ f: 'fetch_email', email_id: id });
    $('#sheetFrom').textContent = data.mail_from || '';
    $('#sheetSubject').textContent = data.mail_subject || '(Tanpa subjek)';
    $('#sheetDate').textContent = fmtTime(data.mail_timestamp);

    let body = data.mail_body || data.mail_excerpt || '(Kosong)';
    // strip scripts
    body = String(body).replace(/<script[\s\S]*?<\/script>/gi, '');
    if (/<[a-z][\s\S]*>/i.test(body)) {
      $('#sheetBody').innerHTML = body;
    } else {
      $('#sheetBody').innerHTML = `<pre>${esc(body)}</pre>`;
    }
  } catch (e) {
    $('#sheetBody').innerHTML = `<p style="color:var(--warn)">Gagal memuat: ${esc(e.message)}</p>`;
  }
}

function closeSheet() {
  backdrop.classList.remove('open');
  setTimeout(() => {
    backdrop.hidden = true;
    state.currentId = null;
  }, 220);
}

async function deleteMsg() {
  if (!state.currentId) return;
  try {
    await gm({ f: 'del_email', email_ids: `[${state.currentId}]` });
    state.messages = state.messages.filter((m) => String(m.mail_id) !== String(state.currentId));
    msgCount.textContent = String(state.messages.length);
    renderInbox();
    closeSheet();
    toast('Pesan dihapus', 'ok');
  } catch (e) {
    // still remove locally if API fails
    state.messages = state.messages.filter((m) => String(m.mail_id) !== String(state.currentId));
    msgCount.textContent = String(state.messages.length);
    renderInbox();
    closeSheet();
    toast('Dihapus dari daftar', 'ok');
  }
}

function startPoll() {
  stopPoll();
  if (!state.auto) return;
  state.timer = setInterval(() => checkMail(true), 7000);
}

function stopPoll() {
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }
}

/* Events */
$('#btnCopy').addEventListener('click', async () => {
  if (!state.email) return;
  try {
    await navigator.clipboard.writeText(state.email);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = state.email;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  const btn = $('#btnCopy');
  btn.classList.add('copied');
  btn.querySelector('span') || (btn.lastChild.textContent = ' Tersalin');
  // keep structure simple
  const label = [...btn.childNodes].find((n) => n.nodeType === 3);
  toast('Disalin', 'ok');
  setTimeout(() => btn.classList.remove('copied'), 1500);
});

$('#btnRefresh').addEventListener('click', () => checkMail(false));

$('#btnNew').addEventListener('click', async () => {
  stopPoll();
  localStorage.removeItem(KEY);
  state.sid = null;
  state.messages = [];
  state.seq = 0;
  await createEmail();
});

$('#btnCustom').addEventListener('click', async () => {
  let user = $('#customUser').value.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
  if (user.length < 3) {
    toast('Username min. 3 karakter', 'err');
    return;
  }
  if (user.length > 20) user = user.slice(0, 20);
  const btn = $('#btnCustom');
  btn.disabled = true;
  btn.textContent = '…';
  try {
    await setCustom(user);
    $('#customUser').value = '';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Pakai';
  }
});

$('#customUser').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('#btnCustom').click();
});

$('#autoRefresh').addEventListener('change', (e) => {
  state.auto = e.target.checked;
  if (state.auto) startPoll();
  else stopPoll();
});

$('#btnCloseSheet').addEventListener('click', closeSheet);
backdrop.addEventListener('click', (e) => {
  if (e.target === backdrop) closeSheet();
});
$('#btnDeleteMsg').addEventListener('click', deleteMsg);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && backdrop.classList.contains('open')) closeSheet();
});

/* Theme */
const themeBtn = $('#btnTheme');
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('tm_theme', t);
}
themeBtn.addEventListener('click', () => {
  const cur = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(cur === 'dark' ? 'light' : 'dark');
});
const savedTheme = localStorage.getItem('tm_theme');
if (savedTheme) applyTheme(savedTheme);

/* Boot */
(async () => {
  try {
    const ok = await restore();
    if (!ok) await createEmail();
  } catch (e) {
    emailEl.textContent = 'Gagal terhubung';
    toast(e.message || 'Error', 'err');
    console.error(e);
  }
})();
