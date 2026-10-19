import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, collection, doc, setDoc, getDoc, addDoc, updateDoc, deleteDoc, getDocs, onSnapshot, query, orderBy, limit, serverTimestamp, arrayUnion } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

/* ================= helpers ================= */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toast = m => { const t = $('#toast'); t.textContent = m; t.style.display = 'block'; clearTimeout(toast.h); toast.h = setTimeout(() => t.style.display = 'none', 3400); };
const tsDate = x => (x?.toDate ? x.toDate() : typeof x === 'number' ? new Date(x) : x instanceof Date ? x : new Date());
const fmt = x => tsDate(x).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtT = x => tsDate(x).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const msg = e => ({ 'permission-denied': 'अनुमति नहीं है (Rules publish किए हैं? आप admin हैं?)', 'auth/popup-closed-by-user': '', 'auth/operation-not-allowed': 'Firebase में यह sign-in चालू करें', 'auth/unauthorized-domain': 'Firebase → Authorized domains में यह डोमेन जोड़ें' }[e.code] ?? (e.code || e.message));

const CATS = [['Roads & streets', '🛣️ सड़क / गली'], ['Water supply', '🚰 पानी'], ['Drainage & sanitation', '🧹 नाली / सफाई'], ['Electricity & streetlights', '💡 बिजली'], ['Health', '🩺 स्वास्थ्य'], ['Education', '🏫 शिक्षा'], ['Government service', '🏛️ सरकारी सेवा'], ['Other', '📌 अन्य']];
const catName = k => (CATS.find(c => c[0] === k) || CATS[7])[1];
const STATUSES = ['Submitted', 'Verified', 'Assigned', 'In progress', 'Resolved', 'Rejected'];
const stCls = s => (s === 'Resolved' ? 's2' : s === 'Rejected' ? 's3' : s === 'Submitted' ? 's0' : 's1');

/* ================= theme ================= */
const applyTheme = () => { const th = localStorage.getItem('mg_theme') || 'light'; document.documentElement.dataset.theme = th; $('#themeBtn').textContent = th === 'dark' ? '☀️' : '🌙'; };
$('#themeBtn').onclick = () => { localStorage.setItem('mg_theme', (localStorage.getItem('mg_theme') || 'light') === 'dark' ? 'light' : 'dark'); applyTheme(); };
applyTheme();

/* ================= firebase ================= */
const configured = !firebaseConfig.apiKey.startsWith('YOUR');
let auth, db;
if (configured) { const app = initializeApp(firebaseConfig); auth = getAuth(app); auth.languageCode = 'hi'; db = getFirestore(app); }

const S = { user: null, me: null, ready: false, tab: 'dash', d: { complaints: [], notices: [], polls: [], directory: [], mandi: [], bazaar: [], users: [], events: [] }, votes: {}, unsubs: [], q: '', st: 'all', authStep: 'phone', confirmation: null, edit: null };
const isAdmin = () => S.me?.role === 'admin';
const emit = (type, title, body, link) => addDoc(collection(db, 'events'), { type, title, body: body || '', link: link || '', by: S.me.name, byUid: S.user.uid, createdAt: serverTimestamp() }).catch(e => console.warn('event', e.code));
const TAB_IDS = ['dash', 'complaints', 'notices', 'polls', 'directory', 'mandi', 'bazaar', 'users'];
const tabOf = () => { const t = location.hash.replace(/^#\/?/, '').split('/')[0]; return TAB_IDS.includes(t) ? t : 'dash'; };
window.addEventListener('hashchange', () => { S.q = ''; S.st = 'all'; closeModal(); render(); scrollTo(0, 0); });

function listen(key, q) { S.unsubs.push(onSnapshot(q, s => { S.d[key] = s.docs.map(x => ({ id: x.id, ...x.data() })); if (key === 'polls') listenVotes(); render(true); }, e => { console.warn(key, e.code); toast(key + ': ' + msg(e)); })); }
function listenVotes() {
  (S.voteUnsubs || []).forEach(u => u()); S.voteUnsubs = [];
  S.d.polls.forEach(p => S.voteUnsubs.push(onSnapshot(collection(db, 'polls', p.id, 'votes'), s => { S.votes[p.id] = s.docs.map(x => ({ uid: x.id, ...x.data() })); render(true); })));
}
function startAll() {
  stopAll();
  listen('complaints', query(collection(db, 'complaints'), orderBy('createdAt', 'desc'), limit(1000)));
  listen('notices', query(collection(db, 'notices'), orderBy('createdAt', 'desc'), limit(200)));
  listen('polls', query(collection(db, 'polls'), orderBy('createdAt', 'desc'), limit(100)));
  listen('directory', query(collection(db, 'directory')));
  listen('mandi', query(collection(db, 'mandi'), orderBy('createdAt', 'desc'), limit(300)));
  listen('bazaar', query(collection(db, 'bazaar'), orderBy('createdAt', 'desc'), limit(300)));
  listen('users', query(collection(db, 'users')));
  listen('events', query(collection(db, 'events'), orderBy('createdAt', 'desc'), limit(15)));
}
function stopAll() { S.unsubs.forEach(u => u()); (S.voteUnsubs || []).forEach(u => u()); S.unsubs = []; S.voteUnsubs = []; }

if (configured) onAuthStateChanged(auth, async u => {
  S.user = u; S.me = null; stopAll();
  if (u) { try { const s = await getDoc(doc(db, 'users', u.uid)); S.me = s.exists() ? s.data() : null; } catch (e) { console.warn(e); } }
  S.ready = true; $('#outBtn').hidden = !u; $('#who').textContent = S.me ? S.me.name : 'Mera Gaav';
  if (isAdmin()) startAll();
  render();
});
$('#outBtn').onclick = async () => { await signOut(auth); };

/* ================= modal ================= */
function openModal(h) { $('#modalBody').innerHTML = h; $('#modal').classList.add('on'); }
function closeModal() { $('#modal').classList.remove('on'); S.edit = null; }
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

/* ================= gate (login / not admin) ================= */
function resetRecaptcha() { try { window.rv?.clear(); } catch (_) {} window.rv = null; const o = $('#recaptcha'), f = document.createElement('div'); f.id = 'recaptcha'; o.replaceWith(f); }
function gate() {
  if (!configured) return `<div class="gate"><div class="panel"><h2 class="h2">Firebase जोड़ना बाकी है</h2><p>पहले <code>firebase-config.js</code> में अपनी keys डालिए (SETUP.md देखें)।</p></div></div>`;
  if (!S.ready) return `<div class="gate"><div class="skeleton"></div></div>`;
  if (!S.user) return `<div class="gate"><div class="panel"><h2 class="h2">Admin लॉगिन</h2><p class="muted" style="margin:6px 0 14px">उसी खाते से लॉगिन कीजिए जिसे आपने Firebase में <code>role = admin</code> किया है।</p>
  ${S.authStep === 'phone' ? `<button class="btn btn-line btn-block" id="gBtn" onclick="A.google()">Google से लॉगिन</button><div class="muted" style="text-align:center;margin:12px 0">या मोबाइल OTP</div><div class="field"><div class="row" style="flex-wrap:nowrap"><b>+91</b><input class="input" id="phoneIn" inputmode="numeric" maxlength="10" placeholder="10 digit number"></div></div><button class="btn btn-brand btn-block" style="margin-top:12px" id="sendBtn" onclick="A.sendOtp()">OTP भेजें</button>`
    : `<div class="field"><label>6 अंकों का OTP</label><input class="input otp" id="otpIn" inputmode="numeric" maxlength="6"></div><button class="btn btn-brand btn-block" style="margin-top:12px" id="verBtn" onclick="A.verifyOtp()">पक्का करें</button><button class="btn btn-line btn-block" style="margin-top:8px" onclick="A.resetAuth()">नंबर बदलें</button>`}
  </div></div>`;
  if (!S.me) return `<div class="gate"><div class="panel"><h2 class="h2">पहले ऐप में प्रोफ़ाइल बनाइए</h2><p>इस खाते की प्रोफ़ाइल नहीं मिली। <a href="index.html">ऐप खोलकर</a> एक बार प्रोफ़ाइल बनाइए, फिर यहाँ लौटिए।</p></div></div>`;
  return `<div class="gate"><div class="panel"><h2 class="h2">यह खाता admin नहीं है</h2><p style="margin:8px 0">Firebase Console → Firestore → <code>users</code> → नीचे वाला document → field <code>role</code> को <code>admin</code> कीजिए, फिर यह पेज reload कीजिए।</p><p class="muted">Document ID (UID):</p><p><code>${esc(S.user.uid)}</code></p></div></div>`;
}

/* ================= layout ================= */
const TABS = [['dash', '📊', 'डैशबोर्ड'], ['complaints', '📋', 'शिकायतें'], ['notices', '📢', 'सूचनाएँ'], ['polls', '🗳️', 'मतदान'], ['directory', '☎️', 'संपर्क'], ['mandi', '🌾', 'मंडी भाव'], ['bazaar', '🛒', 'बाज़ार'], ['users', '👥', 'यूज़र']];
const GROUPS = { dash: 'अवलोकन', complaints: 'शिकायतें', notices: 'गाँव का कंटेंट', users: 'लोग' };
function count(t) { const n = { complaints: S.d.complaints.filter(c => c.status === 'Submitted').length, notices: S.d.notices.length, polls: S.d.polls.length, directory: S.d.directory.length, mandi: S.d.mandi.length, bazaar: S.d.bazaar.length, users: S.d.users.length }[t]; return n ? `<span class="n">${n}</span>` : ''; }
function render(soft) {
  const app = $('#app');
  if (!isAdmin()) { if (soft && $('#phoneIn,#otpIn')) return; app.innerHTML = gate(); return; }
  if (soft && ($('#modal').classList.contains('on') || /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || ''))) return;
  const y = scrollY; S.tab = tabOf();
  app.innerHTML = `<div class="shell"><nav class="side">${TABS.map(t => `${GROUPS[t[0]] ? `<small class="grp">${GROUPS[t[0]]}</small>` : ''}<a href="#/${t[0]}" class="${S.tab === t[0] ? 'on' : ''}"><i>${t[1]}</i> <span>${t[2]}</span>${count(t[0])}</a>`).join('')}</nav><main class="main">${({ dash, complaints, notices, polls, directory, mandi, bazaar, users })[S.tab]()}</main></div>`;
  if (soft) scrollTo(0, y);
}

/* ---------- dashboard ---------- */
function dash() {
  const c = S.d.complaints, by = k => c.filter(x => x.status === k).length;
  const solved = c.filter(x => x.status === 'Resolved').map(x => { const h = (x.history || []).find(h => h.s === 'Resolved'); return h ? (tsDate(h.at) - tsDate(x.createdAt)) / 864e5 : null; }).filter(v => v != null);
  const avg = solved.length ? (solved.reduce((a, b) => a + b, 0) / solved.length).toFixed(1) : '–';
  const max = Math.max(1, ...CATS.map(k => c.filter(x => x.category === k[0]).length)), smax = Math.max(1, ...STATUSES.map(by));
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (6 - i)); const n = c.filter(x => { const t = tsDate(x.createdAt); return t >= d && t < new Date(+d + 864e5); }).length; return [d, n]; });
  const dmax = Math.max(1, ...days.map(d => d[1]));
  const openPolls = S.d.polls.filter(p => p.open !== false).length;
  return `<div class="bar-top"><h1 class="h1">डैशबोर्ड</h1></div>
  <div class="kpis"><div class="kpi hl"><b>${by('Submitted')}</b><span>नई शिकायतें (देखनी बाकी)</span></div><div class="kpi"><b>${by('Verified') + by('Assigned') + by('In progress')}</b><span>काम जारी</span></div><div class="kpi"><b>${by('Resolved')}</b><span>हल हुईं</span></div><div class="kpi"><b>${avg}</b><span>औसत दिन (हल होने में)</span></div></div>
  <div class="kpis" style="margin-top:10px"><div class="kpi"><b>${S.d.users.length}</b><span>कुल यूज़र</span></div><div class="kpi"><b>${S.d.users.filter(u => u.blocked).length}</b><span>ब्लॉक किए गए</span></div><div class="kpi"><b>${openPolls}</b><span>चालू मतदान</span></div><div class="kpi"><b>${S.d.bazaar.filter(b => !b.sold).length}</b><span>बाज़ार के विज्ञापन</span></div></div>
  <div class="two"><div class="panel"><b>पिछले 7 दिन — नई शिकायतें</b><div class="days">${days.map(([d, n]) => `<div><span>${n}</span><i style="height:${n * 100 / dmax}%"></i>${d.toLocaleDateString('en-IN', { weekday: 'short' })}</div>`).join('')}</div></div>
  <div class="panel"><b>स्थिति के अनुसार</b><div style="margin-top:10px">${STATUSES.map(s => `<div>${s} — ${by(s)}<div class="bar"><i style="width:${by(s) * 100 / smax}%"></i></div></div>`).join('')}</div></div></div>
  <div class="two"><div class="panel"><b>श्रेणी के अनुसार</b><div style="margin-top:10px">${CATS.map(k => { const n = c.filter(x => x.category === k[0]).length; return `<div>${k[1]} — ${n}<div class="bar"><i style="width:${n * 100 / max}%"></i></div></div>`; }).join('')}</div></div>
  <div class="panel"><b>हाल की गतिविधि (सबको भेजी गई सूचनाएँ)</b>${S.d.events.slice(0, 6).map(e => `<div class="rowline"><span class="clip" style="flex:1">${esc(e.title)}<div class="muted">${esc(e.by || '')} · ${fmtT(e.createdAt)}</div></span></div>`).join('') || '<div class="empty">अभी कुछ नहीं</div>'}</div></div>
  <div class="two"><div class="panel" style="grid-column:1/-1"><b>हाल की शिकायतें</b>${c.slice(0, 6).map(x => `<div class="rowline"><span class="clip" style="flex:1"><b>${esc(x.ticket)}</b> ${esc(x.description)}</span><button class="btn btn-line btn-sm" onclick="A.openC('${x.id}')">खोलें</button></div>`).join('') || '<div class="empty">अभी कोई शिकायत नहीं</div>'}</div></div>`;
}

/* ---------- complaints ---------- */
function complaints() {
  const list = S.d.complaints.filter(c => (S.st === 'all' || c.status === S.st) && (!S.q || (c.ticket + c.description + c.location + c.name + c.category).toLowerCase().includes(S.q.toLowerCase())));
  return `<div class="bar-top"><h1 class="h1">शिकायतें <span class="muted">(${list.length})</span></h1><button class="btn btn-line btn-sm" onclick="A.csv('complaints')">⬇️ CSV</button></div>
  <div class="tools"><select class="input" style="max-width:180px" onchange="A.set('st',this.value)"><option value="all">सभी स्थितियाँ</option>${STATUSES.map(s => `<option ${S.st === s ? 'selected' : ''}>${s}</option>`).join('')}</select><input class="input" placeholder="🔍 खोजें" value="${esc(S.q)}" oninput="A.search(this.value)"></div>
  <div class="table-wrap"><table><thead><tr><th>Ticket</th><th>शिकायत</th><th>नागरिक</th><th>स्थिति</th><th>👍</th><th></th></tr></thead><tbody id="rows">${cRows(list)}</tbody></table></div>`;
}
const cRows = list => list.map(x => `<tr><td><b>${esc(x.ticket)}</b><div class="muted">${fmt(x.createdAt)}</div></td><td class="w"><div class="clip">${esc(x.description)}</div><div class="muted">${catName(x.category)} · 📍 ${esc(x.location)}</div></td><td>${esc(x.name)}<div class="muted">${esc(x.ward || '')}</div></td><td><span class="pill ${stCls(x.status)}">${esc(x.status)}</span>${x.urgency === 'high' ? ' 🔥' : ''}</td><td>${(x.upvoters || []).length}</td><td><button class="btn btn-brand btn-sm" onclick="A.openC('${x.id}')">देखें / बदलें</button></td></tr>`).join('') || '<tr><td colspan="6"><div class="empty">कोई शिकायत नहीं मिली</div></td></tr>';

async function openC(id) {
  const c = S.d.complaints.find(x => x.id === id); if (!c) return;
  S.edit = { type: 'c', id }; openModal('<div class="skeleton"></div>');
  let cms = []; try { cms = (await getDocs(query(collection(db, 'complaints', id, 'comments'), orderBy('createdAt', 'asc')))).docs.map(d => ({ id: d.id, ...d.data() })); } catch (e) { console.warn(e); }
  $('#modalBody').innerHTML = `<div class="row between"><h3 style="font-size:22px">${esc(c.ticket)}</h3><button class="iconbtn" onclick="A.close()">✕</button></div><div class="muted">${esc(c.name)} · ${esc(c.ward || '')} · ${fmtT(c.createdAt)}</div>
  ${(c.photos || []).length ? `<div class="thumbs">${c.photos.map(u => `<a href="${esc(u)}" target="_blank" rel="noopener"><img src="${esc(u)}" alt=""></a>`).join('')}</div>` : ''}${c.geo ? `<p><a target="_blank" rel="noopener" href="https://www.google.com/maps?q=${c.geo.lat},${c.geo.lng}">📍 नक्शे में देखें</a></p>` : ''}
  <p style="white-space:pre-wrap;margin:12px 0">${esc(c.description)}</p><p><b>📍 ${esc(c.location)}</b> · ${catName(c.category)}</p><div class="steps" style="margin:8px 0">${STATUSES.slice(0, 5).map((x, k) => `<div class="step ${c.status !== 'Rejected' && k <= STATUSES.indexOf(c.status) ? 'done' : ''}"></div>`).join('')}</div>
  <h4 style="margin:14px 0 8px">प्रगति बदलिए (सब यूज़र को सूचना जाएगी)</h4><div class="form-grid"><div class="field"><label>स्थिति</label><select id="cs">${STATUSES.map(s => `<option ${c.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div><div class="field"><label>नोट</label><input id="cn" placeholder="जैसे: मिस्त्री कल आएगा"></div></div><button class="btn btn-brand" style="margin-top:10px" onclick="A.setStatus('${id}')">स्थिति सेव करें</button>
  <p class="muted" style="margin-top:14px">🔒 एडमिन शिकायत को हटा या उसका विवरण नहीं बदल सकता — सिर्फ़ शिकायत करने वाला ही ऐसा कर सकता है। एडमिन सिर्फ़ प्रगति (स्थिति + नोट) बदलता है।</p>
  <h4 style="margin:18px 0 6px">इतिहास</h4><div class="tl">${(c.history || []).slice().reverse().map(h => `<div><b>${esc(h.s)}</b>${h.note ? esc(h.note) + '<br>' : ''}<span class="muted">${fmtT(h.at)}${h.by ? ' · ' + esc(h.by) : ''}</span></div>`).join('')}</div>
  <h4 style="margin:14px 0 4px">टिप्पणियाँ (${cms.length})</h4>${cms.map(m => `<div class="cm row between" style="flex-wrap:nowrap"><span><b>${esc(m.name)}</b> ${m.admin ? '<span class="tag admin">Admin</span>' : ''} <small>${fmtT(m.createdAt)}</small><br>${esc(m.text)}</span><button class="btn btn-line btn-sm" onclick="A.delCm('${id}','${m.id}')">🗑️</button></div>`).join('') || '<div class="muted">कोई टिप्पणी नहीं</div>'}`;
}

/* ---------- generic content (notices, directory, mandi) ---------- */
const SCHEMA = {
  notices: { title: 'सूचना', fields: [['title', 'शीर्षक', 'text'], ['body', 'विवरण', 'textarea'], ['date', 'तारीख / समय (वैकल्पिक)', 'text'], ['type', 'प्रकार', 'select', ['general', 'meeting', 'urgent']], ['pinned', 'ऊपर पिन करें', 'select', ['no', 'yes']]], req: ['title'] },
  directory: { title: 'संपर्क', fields: [['name', 'नाम / संस्था', 'text'], ['role', 'पद / विभाग', 'text'], ['phone', 'फ़ोन नंबर', 'text']], req: ['name', 'phone'] },
  mandi: { title: 'मंडी भाव', fields: [['crop', 'फसल', 'text'], ['price', 'भाव (₹)', 'text'], ['unit', 'इकाई', 'text'], ['mandi', 'मंडी का नाम', 'text']], req: ['crop', 'price'] },
  polls: { title: 'मतदान', fields: [['q', 'सवाल', 'text'], ['options', 'विकल्प (हर लाइन में एक)', 'textarea']], req: ['q', 'options'] },
  bazaar: { title: 'बाज़ार विज्ञापन', fields: [['title', 'शीर्षक', 'text'], ['price', 'कीमत ₹', 'text'], ['desc', 'विवरण', 'textarea']], req: ['title'] }
};
function head(col, extra = '') { return `<div class="bar-top"><h1 class="h1">${{ notices: 'सूचनाएँ', directory: 'संपर्क', mandi: 'मंडी भाव', polls: 'मतदान', bazaar: 'बाज़ार' }[col]}</h1><div class="row">${extra}${col !== 'bazaar' ? `<button class="btn btn-brand" onclick="A.form('${col}')">＋ नया जोड़ें</button>` : ''}</div></div>`; }
const acts = (col, id) => `<button class="btn btn-line btn-sm" onclick="A.form('${col}','${id}')">✏️ Edit</button><button class="btn btn-line btn-sm" onclick="A.del('${col}','${id}')">🗑️</button>`;
const tbl = (cols, rows) => `<div class="table-wrap"><table><thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows || `<tr><td colspan="${cols.length}"><div class="empty">अभी कुछ नहीं जोड़ा गया</div></td></tr>`}</tbody></table></div>`;

function notices() { return head('notices') + tbl(['सूचना', 'प्रकार', 'तारीख', ''], S.d.notices.map(n => `<tr><td class="w"><b>${n.pinned ? '📌 ' : ''}${esc(n.title)}</b><div class="clip muted">${esc(n.body)}</div></td><td>${esc(n.type || 'general')}</td><td>${fmt(n.createdAt)}</td><td>${acts('notices', n.id)}</td></tr>`).join('')); }
function directory() { return head('directory') + tbl(['नाम', 'पद', 'फ़ोन', ''], S.d.directory.map(d => `<tr><td><b>${esc(d.name)}</b></td><td>${esc(d.role || '')}</td><td>${esc(d.phone)}</td><td>${acts('directory', d.id)}</td></tr>`).join('')); }
function mandi() { return head('mandi') + tbl(['फसल', 'भाव', 'मंडी', 'तारीख', ''], S.d.mandi.map(m => `<tr><td><b>${esc(m.crop)}</b></td><td>₹${esc(m.price)} / ${esc(m.unit || 'क्विंटल')}</td><td>${esc(m.mandi || '')}</td><td>${fmt(m.createdAt)}</td><td>${acts('mandi', m.id)}</td></tr>`).join('')); }
function polls() {
  return head('polls') + tbl(['सवाल', 'नतीजा', 'स्थिति', ''], S.d.polls.map(p => { const v = S.votes[p.id] || []; return `<tr><td class="w"><b>${esc(p.q)}</b></td><td>${p.options.map((o, i) => `${esc(o)}: <b>${v.filter(x => x.opt === i).length}</b>`).join('<br>')}<div class="muted">कुल ${v.length} वोट</div></td><td>${p.open === false ? '<span class="tag">बंद</span>' : '<span class="pill s2">चालू</span>'}</td><td><button class="btn btn-line btn-sm" onclick="A.form('polls','${p.id}')">✏️ Edit</button><button class="btn btn-line btn-sm" onclick="A.togglePoll('${p.id}',${p.open === false})">${p.open === false ? 'फिर खोलें' : 'बंद करें'}</button><button class="btn btn-line btn-sm" onclick="A.del('polls','${p.id}')">🗑️</button></td></tr>`; }).join(''));
}
function bazaar() {
  return head('bazaar') + tbl(['विज्ञापन', 'विक्रेता', 'तारीख', ''], S.d.bazaar.map(b => `<tr ${b.sold ? 'style="opacity:.6"' : ''}><td class="w"><b>${esc(b.title)}</b> ${b.price ? '₹' + esc(b.price) : ''}${b.sold ? ' <span class="tag">बिका</span>' : ''}<div class="clip muted">${esc(b.desc || '')}</div></td><td>${esc(b.name)}</td><td>${fmt(b.createdAt)}</td><td><button class="btn btn-line btn-sm" onclick="A.form('bazaar','${b.id}')">✏️ Edit</button><button class="btn btn-line btn-sm" onclick="A.sold('${b.id}',${!b.sold})">${b.sold ? 'फिर चालू' : 'बिका'}</button><button class="btn btn-line btn-sm" onclick="A.del('bazaar','${b.id}')">🗑️</button></td></tr>`).join(''));
}
function users() {
  const list = S.d.users.filter(u => !S.q || (u.name + (u.phone || '') + (u.email || '')).toLowerCase().includes(S.q.toLowerCase()));
  return `<div class="bar-top"><h1 class="h1">यूज़र <span class="muted">(${list.length})</span></h1><div class="row"><button class="btn btn-line btn-sm" onclick="A.syncChat()">🔄 चैट लिस्ट सिंक</button><button class="btn btn-line btn-sm" onclick="A.csv('users')">⬇️ CSV</button></div></div><div class="tools"><input class="input" placeholder="🔍 नाम / फ़ोन / ईमेल" value="${esc(S.q)}" oninput="A.searchU(this.value)"></div>
  <div class="table-wrap"><table><thead><tr><th>नाम</th><th>संपर्क</th><th>वार्ड</th><th>भूमिका</th><th>जुड़े</th><th></th></tr></thead><tbody id="rows">${uRows(list)}</tbody></table></div>
  <p class="muted" style="margin-top:10px">ब्लॉक किया हुआ यूज़र देख सकता है, पर शिकायत, टिप्पणी, चैट या विज्ञापन नहीं लिख सकता। “रिकॉर्ड हटाएँ” सिर्फ़ ऐप का रिकॉर्ड हटाता है; लॉगिन खाता Firebase Console → Authentication से हटता है।</p>`;
}
const uRows = list => list.map(u => { const me = u.id === S.user.uid; return `<tr><td><b>${esc(u.name)}</b> ${me ? '<span class="tag">आप</span>' : ''}${u.blocked ? ' <span class="tag red">ब्लॉक</span>' : ''}</td><td>${esc(u.phone || u.email || '–')}</td><td>${esc(u.ward || '')}</td><td>${u.role === 'admin' ? '<span class="tag admin">Admin</span>' : 'ग्रामवासी'}</td><td>${u.createdAt ? fmt(u.createdAt) : '–'}</td><td>${me ? '' : `<button class="btn btn-line btn-sm" onclick="A.role('${u.id}','${u.role === 'admin' ? 'resident' : 'admin'}')">${u.role === 'admin' ? 'Admin हटाएँ' : 'Admin बनाएँ'}</button><button class="btn btn-line btn-sm" onclick="A.block('${u.id}',${!u.blocked})">${u.blocked ? 'अनब्लॉक' : 'ब्लॉक'}</button><button class="btn btn-line btn-sm" onclick="A.delU('${u.id}')">🗑️</button>`}</td></tr>`; }).join('') || '<tr><td colspan="6"><div class="empty">कोई यूज़र नहीं</div></td></tr>';

/* ================= actions ================= */
const A = window.A = {
  close: closeModal, openC,
  tab(t) { location.hash = '#/' + t; },
  set(k, v) { S[k] = v; render(); },
  search(v) { S.q = v; const l = S.d.complaints.filter(c => (S.st === 'all' || c.status === S.st) && (!S.q || (c.ticket + c.description + c.location + c.name + c.category).toLowerCase().includes(S.q.toLowerCase()))); $('#rows').innerHTML = cRows(l); },
  searchU(v) { S.q = v; $('#rows').innerHTML = uRows(S.d.users.filter(u => !S.q || (u.name + (u.phone || '') + (u.email || '')).toLowerCase().includes(S.q.toLowerCase()))); },
  async google() { try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch (e) { const m = msg(e); if (m) toast(m); } },
  resetAuth() { S.authStep = 'phone'; render(); },
  async sendOtp() {
    const ph = $('#phoneIn').value.trim(); if (!/^[6-9]\d{9}$/.test(ph)) return toast('सही 10 अंकों का नंबर डालिए');
    const b = $('#sendBtn'); b.disabled = true;
    try { resetRecaptcha(); window.rv = new RecaptchaVerifier(auth, $('#recaptcha'), { size: 'invisible' }); S.confirmation = await signInWithPhoneNumber(auth, '+91' + ph, window.rv); S.authStep = 'otp'; render(); }
    catch (e) { resetRecaptcha(); toast(msg(e)); b.disabled = false; }
  },
  async verifyOtp() { const c = $('#otpIn').value.trim(); if (c.length !== 6) return toast('6 अंकों का OTP डालिए'); try { await S.confirmation.confirm(c); S.authStep = 'phone'; } catch (e) { toast('OTP गलत है या पुराना हो गया'); } },

  async setStatus(id) {
    const s = $('#cs').value, note = $('#cn').value.trim();
    try { await updateDoc(doc(db, 'complaints', id), { status: s, history: arrayUnion({ s, note, at: Date.now(), by: S.me.name }) }); const c = S.d.complaints.find(x => x.id === id); emit('status', (c?.ticket || '') + ' → ' + s, note || (c?.description || '').slice(0, 100), 'c:' + id); toast('प्रगति सेव हो गई ✅ — सबको सूचना भेजी गई'); closeModal(); } catch (e) { toast(msg(e)); }
  },
  async delCm(cid, mid) { if (!confirm('यह टिप्पणी हटाएँ?')) return; try { await deleteDoc(doc(db, 'complaints', cid, 'comments', mid)); toast('हटा दी गई'); openC(cid); } catch (e) { toast(msg(e)); } },

  form(col, id) {
    const sc = SCHEMA[col], cur = id ? S.d[col].find(x => x.id === id) : null; S.edit = { type: 'f', col, id };
    const val = k => { if (!cur) return ''; if (k === 'options') return (cur.options || []).join('\n'); if (k === 'pinned') return cur.pinned ? 'yes' : 'no'; return cur[k] ?? ''; };
    const locked = col === 'polls' && id && (S.votes[id] || []).length > 0;
    openModal(`<div class="row between"><h3 style="font-size:22px">${sc.title} ${id ? 'edit करें' : 'जोड़ें'}</h3><button class="iconbtn" onclick="A.close()">✕</button></div>${locked ? '<p class="muted" style="margin:8px 0">इस मतदान में वोट पड़ चुके हैं, इसलिए सिर्फ़ सवाल बदला जा सकता है, विकल्प नहीं।</p>' : ''}
    <div class="form-grid" style="grid-template-columns:1fr;margin-top:12px">${sc.fields.map(([k, l, t, o]) => `<div class="field"><label>${l}${sc.req.includes(k) ? ' *' : ''}</label>${t === 'textarea' ? `<textarea id="f_${k}" ${locked && k === 'options' ? 'disabled' : ''}>${esc(val(k))}</textarea>` : t === 'select' ? `<select id="f_${k}">${o.map(x => `<option ${val(k) === x ? 'selected' : ''}>${x}</option>`).join('')}</select>` : `<input id="f_${k}" value="${esc(val(k))}">`}</div>`).join('')}</div>
    <button class="btn btn-brand btn-block" style="margin-top:14px" id="saveBtn" onclick="A.save()">${id ? 'बदलाव सेव करें' : 'सेव करें'}</button>`);
  },
  async save() {
    const { col, id } = S.edit, sc = SCHEMA[col], v = k => ($('#f_' + k)?.value || '').trim(), b = $('#saveBtn'); b.disabled = true;
    try {
      for (const k of sc.req) if (!v(k)) throw new Error('जरूरी खाना खाली है');
      let d = {};
      for (const [k] of sc.fields) d[k] = v(k);
      if (col === 'notices') d.pinned = d.pinned === 'yes';
      if (col === 'mandi') d.unit = d.unit || 'क्विंटल';
      if (col === 'polls') {
        const cur = id ? S.d.polls.find(p => p.id === id) : null, locked = cur && (S.votes[id] || []).length > 0;
        const o = d.options.split('\n').map(x => x.trim()).filter(Boolean); if (!locked && o.length < 2) throw new Error('कम से कम 2 विकल्प चाहिए');
        d = locked ? { q: d.q } : { q: d.q, options: o.slice(0, 6) }; if (!id) d.open = true;
      }
      if (id) { await updateDoc(doc(db, col, id), d); toast('सेव हो गया ✅'); }
      else {
        d.createdAt = serverTimestamp(); if (col === 'notices') d.by = S.me.name; await addDoc(collection(db, col), d);
        const T = { notices: ['📢 ', d.title, d.body], polls: ['🗳️ नया मतदान: ', d.q, ''], mandi: ['🌾 मंडी भाव: ', d.crop + ' ₹' + d.price, d.mandi], directory: ['☎️ नया संपर्क: ', d.name, d.role] }[col];
        if (T) await emit(col === 'notices' ? 'notice' : col === 'polls' ? 'poll' : col, T[0] + T[1], T[2], col);
        toast('सेव हो गया ✅ — सभी यूज़र को सूचना भेजी गई');
      }
      closeModal();
    } catch (e) { toast(msg(e) || e.message); b.disabled = false; }
  },
  async del(col, id) {
    if (!confirm('पक्का हटाएँ? यह वापस नहीं आएगा।')) return;
    try {
      if (col === 'polls') { const vs = await getDocs(collection(db, 'polls', id, 'votes')); for (const x of vs.docs) await deleteDoc(x.ref); }
      if (col === 'bazaar') { try { await deleteDoc(doc(db, 'bazaar', id, 'private', 'contact')); } catch (_) {} }
      await deleteDoc(doc(db, col, id)); toast('हटा दिया गया');
    } catch (e) { toast(msg(e)); }
  },
  async togglePoll(id, open) { try { await updateDoc(doc(db, 'polls', id), { open }); } catch (e) { toast(msg(e)); } },
  async sold(id, v) { try { await updateDoc(doc(db, 'bazaar', id), { sold: v }); } catch (e) { toast(msg(e)); } },

  async role(id, role) { if (!confirm(role === 'admin' ? 'इन्हें Admin बनाएँ? ये सब कुछ बदल और हटा सकेंगे।' : 'इनसे Admin अधिकार हटाएँ?')) return; try { await updateDoc(doc(db, 'users', id), { role }); toast('भूमिका बदल गई ✅'); } catch (e) { toast(msg(e)); } },
  async block(id, blocked) { if (!confirm(blocked ? 'इस यूज़र को ब्लॉक करें?' : 'अनब्लॉक करें?')) return; try { await updateDoc(doc(db, 'users', id), { blocked }); toast(blocked ? 'ब्लॉक किया गया' : 'अनब्लॉक किया गया'); } catch (e) { toast(msg(e)); } },
  async syncChat() {
    let n = 0; try { for (const u of S.d.users) { if (!u.name) continue; await setDoc(doc(db, 'profiles', u.id), { name: u.name, ward: u.ward || '' }, { merge: true }); n++; } toast('चैट लिस्ट सिंक हो गई: ' + n + ' यूज़र ✅'); } catch (e) { toast(msg(e)); }
  },
  async delU(id) { if (!confirm('इस यूज़र का रिकॉर्ड हटाएँ? (शिकायतें बनी रहेंगी)')) return; try { await deleteDoc(doc(db, 'profiles', id)); await deleteDoc(doc(db, 'users', id)); toast('रिकॉर्ड हटा दिया गया'); } catch (e) { toast(msg(e)); } },

  csv(what) {
    const rows = what === 'users'
      ? [['Name', 'Phone', 'Email', 'Ward', 'Role', 'Blocked', 'Joined']].concat(S.d.users.map(u => [u.name, u.phone || '', u.email || '', u.ward || '', u.role, !!u.blocked, u.createdAt ? tsDate(u.createdAt).toISOString().slice(0, 10) : '']))
      : [['Ticket', 'Category', 'Ward', 'Location', 'Resident', 'Status', 'Urgency', 'Upvotes', 'Description', 'Date']].concat(S.d.complaints.map(c => [c.ticket, c.category, c.ward, c.location, c.name, c.status, c.urgency, (c.upvoters || []).length, c.description, tsDate(c.createdAt).toISOString().slice(0, 10)]));
    const csv = '﻿' + rows.map(r => r.map(x => '"' + String(x ?? '').replace(/"/g, '""') + '"').join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = what + '.csv'; a.click();
  }
};

render();
