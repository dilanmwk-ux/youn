const API = 'https://api.mail.tm';
const STORAGE_KEY = 'tempmail_session';

const state = {
  token: null,
  accountId: null,
  address: null,
  password: null,
  domain: null,
  messages: [],
  currentMsgId: null,
  autoRefresh: true,
  pollTimer: null,
  domains: [],
};

// DOM
const $ = (sel) => document.querySelector(sel);
const emailEl = $('#emailAddress');
const domainLabel = $('#domainLabel');
const inboxList = $('#inboxList');
const emptyState = $('#emptyState');
const msgCount = $('#msgCount');
const modalOverlay = $('#modalOverlay');
const toastEl = $('#toast');

// Utils
function randomString(len = 10) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function showToast(msg, type = '') {
  toastEl.textContent = msg;
  toastEl.className = 'toast show ' + type;
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => toastEl.classList.remove('show'), 2500);
}

function formatDate(iso) {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = (now - d) / 1000;
    if (diff < 60) return 'Baru saja';
    if (diff < 3600) return Math.floor(diff / 60) + ' mnt';
    if (diff < 86400) return Math.floor(diff / 3600) + ' jam';
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

function getInitial(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// API helpers
async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...(options.headers || {}),
  };
  if (state.token) headers['Authorization'] = `Bearer ${state.token}`;

  const res = await fetch(`${API}${path}`, { ...options, headers });
  if (!res.ok) {
    let errMsg = `Error ${res.status}`;
    try {
      const body = await res.json();
      errMsg = body['hydra:description'] || body.message || errMsg;
    } catch {}
    throw new Error(errMsg);
  }
  if (res.status === 204) return null;
  return res.json();
}

// Core functions
async function loadDomains() {
  const data = await api('/domains?page=1');
  const members = data['hydra:member'] || [];
  state.domains = members.filter(d => d.isActive).map(d => d.domain);
  if (state.domains.length === 0) throw new Error('Tidak ada domain tersedia');
  state.domain = state.domains[0];
  domainLabel.textContent = `@${state.domain}`;
}

async function createAccount(username) {
  const address = `${username}@${state.domain}`;
  const password = randomString(16) + 'A1!';

  try {
    await api('/accounts', {
      method: 'POST',
      body: JSON.stringify({ address, password }),
    });
  } catch (e) {
    // Jika sudah ada, coba login saja
    if (!e.message.toLowerCase().includes('already') && !e.message.includes('422')) {
      throw e;
    }
  }

  const tokenData = await api('/token', {
    method: 'POST',
    body: JSON.stringify({ address, password }),
  });

  state.token = tokenData.token;
  state.accountId = tokenData.id;
  state.address = address;
  state.password = password;

  saveSession();
  updateEmailUI();
  await refreshInbox();
  startPolling();
}

async function createRandom() {
  emailEl.innerHTML = '<span class="loading-text">Membuat email...</span>';
  emailEl.classList.remove('ready');
  $('#btnCopy').disabled = true;

  try {
    if (!state.domain) await loadDomains();
    const username = randomString(8) + randomString(4);
    await createAccount(username);
    showToast('Email berhasil dibuat!', 'success');
  } catch (e) {
    emailEl.innerHTML = '<span class="loading-text">Gagal membuat email</span>';
    showToast(e.message || 'Gagal membuat email', 'error');
    console.error(e);
  }
}

function updateEmailUI() {
  emailEl.textContent = state.address;
  emailEl.classList.add('ready');
  $('#btnCopy').disabled = false;
  domainLabel.textContent = `@${state.domain}`;
}

function saveSession() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      token: state.token,
      accountId: state.accountId,
      address: state.address,
      password: state.password,
      domain: state.domain,
    }));
  } catch {}
}

function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data.token || !data.address) return false;
    Object.assign(state, data);
    return true;
  } catch {
    return false;
  }
}

async function restoreSession() {
  if (!loadSession()) return false;
  try {
    // Validasi token dengan fetch messages
    await api('/messages?page=1');
    updateEmailUI();
    await refreshInbox();
    startPolling();
    return true;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    state.token = null;
    return false;
  }
}

async function refreshInbox(silent = false) {
  if (!state.token) return;
  const btn = $('#btnRefresh');
  if (!silent) btn.classList.add('spinning');

  try {
    const data = await api('/messages?page=1');
    const list = data['hydra:member'] || [];
    state.messages = list;
    msgCount.textContent = list.length;
    renderInbox();
  } catch (e) {
    if (!silent) showToast('Gagal memuat inbox', 'error');
    console.error(e);
  } finally {
    btn.classList.remove('spinning');
  }
}

function renderInbox() {
  const existing = inboxList.querySelectorAll('.msg-item');
  existing.forEach(el => el.remove());

  if (state.messages.length === 0) {
    emptyState.style.display = 'flex';
    return;
  }

  emptyState.style.display = 'none';

  state.messages.forEach(msg => {
    const fromName = msg.from?.name || msg.from?.address || 'Unknown';
    const fromAddr = msg.from?.address || '';
    const item = document.createElement('div');
    item.className = 'msg-item' + (msg.seen ? '' : ' unread');
    item.dataset.id = msg.id;

    item.innerHTML = `
      <div class="msg-avatar">${getInitial(fromName)}</div>
      <div class="msg-content">
        <div class="msg-top">
          <span class="msg-from">${escapeHtml(fromName)}</span>
          <span class="msg-date">${formatDate(msg.createdAt)}</span>
        </div>
        <div class="msg-subject">${escapeHtml(msg.subject || '(Tanpa subjek)')}</div>
        <div class="msg-intro">${escapeHtml(msg.intro || '')}</div>
      </div>
    `;

    item.addEventListener('click', () => openMessage(msg.id));
    inboxList.appendChild(item);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function openMessage(id) {
  state.currentMsgId = id;
  modalOverlay.classList.add('open');
  $('#modalFrom').textContent = 'Memuat...';
  $('#modalSubject').textContent = '';
  $('#modalDate').textContent = '';
  $('#modalBody').innerHTML = '<p style="color:var(--text-muted)">Memuat pesan...</p>';

  try {
    const msg = await api(`/messages/${id}`);
    const fromName = msg.from?.name || '';
    const fromAddr = msg.from?.address || '';
    $('#modalFrom').textContent = fromName ? `${fromName} <${fromAddr}>` : fromAddr;
    $('#modalSubject').textContent = msg.subject || '(Tanpa subjek)';
    $('#modalDate').textContent = formatDate(msg.createdAt);

    // Prefer HTML body, fallback text
    let body = msg.html || msg.text || msg.intro || '(Kosong)';
    // Sanitize basic: remove scripts
    body = body.replace(/<script[\s\S]*?<\/script>/gi, '');
    if (msg.html) {
      $('#modalBody').innerHTML = body;
    } else {
      $('#modalBody').innerHTML = `<pre>${escapeHtml(body)}</pre>`;
    }

    // Mark as seen
    try {
      await api(`/messages/${id}`, { method: 'PATCH', body: '{}' });
      const item = inboxList.querySelector(`[data-id="${id}"]`);
      if (item) item.classList.remove('unread');
    } catch {}
  } catch (e) {
    $('#modalBody').innerHTML = `<p style="color:var(--danger)">Gagal memuat pesan: ${escapeHtml(e.message)}</p>`;
  }
}

function closeModal() {
  modalOverlay.classList.remove('open');
  state.currentMsgId = null;
}

async function deleteCurrentMessage() {
  if (!state.currentMsgId) return;
  try {
    await api(`/messages/${state.currentMsgId}`, { method: 'DELETE' });
    closeModal();
    showToast('Pesan dihapus', 'success');
    await refreshInbox(true);
  } catch (e) {
    showToast('Gagal menghapus pesan', 'error');
  }
}

function startPolling() {
  stopPolling();
  if (!state.autoRefresh) return;
  state.pollTimer = setInterval(() => refreshInbox(true), 8000);
}

function stopPolling() {
  if (state.pollTimer) {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
}

// Event listeners
$('#btnCopy').addEventListener('click', async () => {
  if (!state.address) return;
  try {
    await navigator.clipboard.writeText(state.address);
    const btn = $('#btnCopy');
    btn.classList.add('copied');
    btn.querySelector('span').textContent = 'Tersalin!';
    showToast('Email disalin!', 'success');
    setTimeout(() => {
      btn.classList.remove('copied');
      btn.querySelector('span').textContent = 'Salin';
    }, 1800);
  } catch {
    // Fallback
    const ta = document.createElement('textarea');
    ta.value = state.address;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('Email disalin!', 'success');
  }
});

$('#btnRefresh').addEventListener('click', () => refreshInbox());

$('#btnNew').addEventListener('click', async () => {
  stopPolling();
  localStorage.removeItem(STORAGE_KEY);
  state.token = null;
  state.messages = [];
  renderInbox();
  msgCount.textContent = '0';
  await createRandom();
});

$('#btnCustom').addEventListener('click', async () => {
  const input = $('#customUsername');
  let username = input.value.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
  if (!username || username.length < 3) {
    showToast('Username minimal 3 karakter (huruf/angka)', 'error');
    return;
  }
  if (username.length > 32) username = username.slice(0, 32);

  const btn = $('#btnCustom');
  btn.disabled = true;
  btn.textContent = '...';
  stopPolling();
  localStorage.removeItem(STORAGE_KEY);
  state.token = null;

  try {
    if (!state.domain) await loadDomains();
    await createAccount(username);
    input.value = '';
    showToast('Email custom berhasil!', 'success');
  } catch (e) {
    showToast(e.message || 'Gagal membuat email custom', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Gunakan';
  }
});

$('#customUsername').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('#btnCustom').click();
});

$('#autoRefresh').addEventListener('change', (e) => {
  state.autoRefresh = e.target.checked;
  if (state.autoRefresh) startPolling();
  else stopPolling();
});

$('#btnCloseModal').addEventListener('click', closeModal);
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) closeModal();
});
$('#btnDeleteMsg').addEventListener('click', deleteCurrentMessage);

// Theme
const themeBtn = $('#btnTheme');
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('tempmail_theme', theme);
}
themeBtn.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
});
const savedTheme = localStorage.getItem('tempmail_theme');
if (savedTheme) applyTheme(savedTheme);

// Keyboard
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modalOverlay.classList.contains('open')) closeModal();
});

// Init
(async function init() {
  try {
    const restored = await restoreSession();
    if (!restored) {
      await loadDomains();
      await createRandom();
    }
  } catch (e) {
    emailEl.innerHTML = '<span class="loading-text">Gagal terhubung ke server</span>';
    showToast(e.message || 'Gagal inisialisasi', 'error');
    console.error(e);
  }
})();
