import { firebaseConfig, DRIVE_UPLOAD_URL, VILLAGE } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, setDoc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, onSnapshot, query, where, orderBy, limit, serverTimestamp, arrayUnion, arrayRemove } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

/* ================= helpers ================= */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let lang = localStorage.getItem('mg_lang') || 'hi';
const B = (hi, en) => (lang === 'hi' ? hi : en);
const toast = m => { const t = $('#toast'); t.textContent = m; t.style.display = 'block'; clearTimeout(toast.h); toast.h = setTimeout(() => t.style.display = 'none', 3200); };
const tsDate = x => (x?.toDate ? x.toDate() : typeof x === 'number' ? new Date(x) : x instanceof Date ? x : new Date());
const fmt = x => tsDate(x).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const ago = x => { const m = Math.floor((Date.now() - tsDate(x)) / 60000); if (m < 1) return B('अभी', 'just now'); if (m < 60) return m + B(' मिनट पहले', 'm ago'); const h = Math.floor(m / 60); if (h < 24) return h + B(' घंटे पहले', 'h ago'); return Math.floor(h / 24) + B(' दिन पहले', 'd ago'); };

const CATS = [
  ['Roads & streets', '🛣️', 'सड़क / गली', 'Roads & streets', '#c8660f'], ['Water supply', '🚰', 'पानी', 'Water supply', '#1f6fb5'],
  ['Drainage & sanitation', '🧹', 'नाली / सफाई', 'Drainage & sanitation', '#5d7d2a'], ['Electricity & streetlights', '💡', 'बिजली / स्ट्रीट लाइट', 'Electricity & streetlights', '#b88a00'],
  ['Health', '🩺', 'स्वास्थ्य', 'Health', '#b8325a'], ['Education', '🏫', 'शिक्षा / स्कूल', 'Education', '#6b49b8'],
  ['Government service', '🏛️', 'सरकारी सेवा', 'Government service', '#1b7f78'], ['Other', '📌', 'अन्य', 'Other', '#5d6486']
];
const cat = k => CATS.find(x => x[0] === k) || CATS[7];
const catLabel = k => cat(k)[1] + ' ' + B(cat(k)[2], cat(k)[3]);
const STATUSES = ['Submitted', 'Verified', 'Assigned', 'In progress', 'Resolved', 'Rejected'];
const STATUS_HI = { Submitted: 'दर्ज', Verified: 'जाँचा गया', Assigned: 'सौंपा गया', 'In progress': 'काम जारी', Resolved: 'हल हुई', Rejected: 'अस्वीकृत' };
const stLabel = s => B(STATUS_HI[s] || s, s);
const stClass = s => (s === 'Resolved' ? 's2' : s === 'Rejected' ? 's3' : s === 'Submitted' ? 's0' : 's1');
const URG = { low: ['सामान्य', 'Normal'], medium: ['जरूरी', 'Important'], high: ['बहुत जरूरी', 'Urgent'] };

/* ================= theme / language ================= */
const applyTheme = () => { const th = localStorage.getItem('mg_theme') || 'light'; document.documentElement.dataset.theme = th; $('#themeBtn').textContent = th === 'dark' ? '☀️' : '🌙'; document.querySelector('meta[name=theme-color]').content = th === 'dark' ? '#0b0f2e' : '#1f2d7a'; };
$('#themeBtn').onclick = () => { localStorage.setItem('mg_theme', (localStorage.getItem('mg_theme') || 'light') === 'dark' ? 'light' : 'dark'); applyTheme(); };
$('#langBtn').onclick = () => { lang = lang === 'hi' ? 'en' : 'hi'; localStorage.setItem('mg_lang', lang); renderAll(); };
applyTheme();

/* ================= PWA install (works without login) ================= */
let deferredPrompt = null;
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
function showInstall() { $('#installBtn').hidden = isStandalone() || !(deferredPrompt || isIOS); $('#installBtn').textContent = '📲 ' + B('इंस्टॉल', 'Install'); }
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; showInstall(); render(true); });
window.addEventListener('appinstalled', () => { deferredPrompt = null; showInstall(); render(true); toast(B('ऐप इंस्टॉल हो गया ✅', 'App installed ✅')); });
async function installApp() {
  if (deferredPrompt) { deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; showInstall(); render(true); }
  else if (isIOS) openModal(`<h3>📲 ${B('iPhone में इंस्टॉल करें', 'Install on iPhone')}</h3><p>1. Safari में नीचे <b>Share ⬆️</b> दबाएँ<br>2. <b>Add to Home Screen</b> चुनें<br>3. <b>Add</b> दबाएँ</p><button class="btn btn-brand btn-block" onclick="A.closeModal()">OK</button>`);
  else toast(B('ब्राउज़र मेन्यू ⋮ में "Install app / Add to Home screen" चुनें', 'Use browser menu ⋮ → Install app'));
}
$('#installBtn').onclick = installApp;
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

/* ================= firebase ================= */
const configured = !firebaseConfig.apiKey.startsWith('YOUR');
let app, auth, db;
if (configured) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app); auth.languageCode = 'hi';
  db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
}

const S = { demo: !configured, user: null, profile: null, authReady: !configured, ready: !configured, complaints: [], notices: [], polls: [], directory: [], mandi: [], bazaar: [], votes: {}, pending: [], geo: null, f: { st: 'all', cat: 'all', q: '' }, bf: 'all', unsubs: [], voteUnsubs: [], authStep: 'phone', confirmation: null, authOpen: false, afterLogin: null, why: '', profiles: [], chats: [], msgs: [], unsubUser: [], chatWith: null, subbedId: null, editId: null, events: [], evFirst: true, seenAt: 0, replyTo: null, editCm: null, profLive: false, chatsFirst: true };
const isAdmin = () => S.profile?.role === 'admin';
const loggedIn = () => !!(S.user && S.profile);

/* demo content so the design can be previewed before Firebase is connected */
function loadDemo() {
  const n = Date.now(), d = 864e5;
  const mk = (i, o) => ({ id: 'd' + i, ticket: 'MG-2026-' + String(100100 + i), uid: 'demo', photos: [], upvoters: [], createdAt: n - o.age * d, history: [{ s: 'Submitted', note: '', at: n - o.age * d }].concat(o.status !== 'Submitted' ? [{ s: o.status, note: o.note || '', at: n - (o.age - 2) * d, by: 'Panchayat' }] : []), ...o });
  S.complaints = [
    mk(1, { name: 'सीमा देवी', category: 'Water supply', ward: 'Ward 1', location: 'मुख्य चौक के पास', description: 'तीन दिन से पानी की सप्लाई नहीं आ रही है। टंकी खाली पड़ी है।', status: 'In progress', urgency: 'high', age: 3, upvoters: ['a', 'b', 'c', 'd'] }),
    mk(2, { name: 'मोहन लाल', category: 'Roads & streets', ward: 'Ward 2', location: 'स्कूल वाली गली', description: 'सड़क पर बड़ा गड्ढा है, बच्चों को स्कूल जाने में परेशानी होती है।', status: 'Submitted', urgency: 'medium', age: 1, upvoters: ['a', 'b'] }),
    mk(3, { name: 'रीना कुमारी', category: 'Drainage & sanitation', ward: 'Ward 3', location: 'मंदिर के पीछे', description: 'नाली जाम थी और गंदा पानी सड़क पर आ रहा था।', status: 'Resolved', urgency: 'low', age: 6, upvoters: ['a'], note: 'नाली साफ़ करवा दी गई है।' }),
    mk(4, { name: 'रामकिशन', category: 'Electricity & streetlights', ward: 'Ward 1', location: 'बस स्टैंड रोड', description: 'स्ट्रीट लाइट एक सप्ताह से बंद है, रात को अँधेरा रहता है।', status: 'Resolved', urgency: 'medium', age: 9, upvoters: ['a', 'b', 'c'], note: 'नई लाइट लगाई गई।' })
  ];
  S.notices = [
    { id: 'n1', title: 'ग्राम सभा बैठक', body: 'रविवार सुबह 11 बजे पंचायत भवन में। सभी ग्रामवासी आमंत्रित हैं।', date: 'रविवार, 11:00', type: 'meeting', pinned: true, createdAt: n - 2 * 36e5 },
    { id: 'n2', title: 'पानी की टंकी की सफाई', body: 'सोमवार को सुबह 8 से 12 बजे तक सप्लाई बंद रहेगी।', type: 'general', createdAt: n - 30 * 36e5 }
  ];
  S.polls = [{ id: 'p1', q: 'चौपाल पर नई लाइट कहाँ लगनी चाहिए?', options: ['मंदिर चौक', 'स्कूल के पास', 'बस स्टैंड'], open: true, createdAt: n }];
  S.votes = { p1: [{ uid: 'a', opt: 0 }, { uid: 'b', opt: 0 }, { uid: 'c', opt: 2 }] };
  S.mandi = [{ id: 'm1', crop: 'गेहूँ', price: '2425', unit: 'क्विंटल', mandi: 'स्थानीय मंडी', createdAt: n }, { id: 'm2', crop: 'सरसों', price: '5950', unit: 'क्विंटल', mandi: 'स्थानीय मंडी', createdAt: n }, { id: 'm3', crop: 'बाजरा', price: '2625', unit: 'क्विंटल', mandi: 'स्थानीय मंडी', createdAt: n }];
  S.bazaar = [{ id: 'b1', uid: 'x', name: 'किशन', type: 'sell', title: 'देसी गाय — दूध देने वाली', price: '45000', desc: 'दूसरा ब्यान, शांत स्वभाव।', photos: [], createdAt: n - 5 * 36e5 }, { id: 'b2', uid: 'y', name: 'राजू', type: 'rent', title: 'ट्रैक्टर किराये पर', price: '800', desc: 'प्रति घंटा, चालक सहित।', photos: [], createdAt: n - 20 * 36e5 }, { id: 'b3', uid: 'z', name: 'सुनीता', type: 'job', title: 'खेत में मजदूर चाहिए', price: '', desc: 'कटाई के लिए 5 लोग।', photos: [], createdAt: n - 40 * 36e5 }];
  S.directory = [{ id: 'd1', name: 'ग्राम पंचायत कार्यालय', role: 'सरपंच / सचिव', phone: '' }];
}
if (S.demo) loadDemo();

/* ================= realtime data (public read, so guests can explore) ================= */
let rq = 0; const sched = () => { cancelAnimationFrame(rq); rq = requestAnimationFrame(() => render(true)); };
function listen(name, q, key) {
  S.unsubs.push(onSnapshot(q, snap => { S[key] = snap.docs.map(d => ({ id: d.id, ...d.data() })); if (key === 'polls') listenVotes(); S.ready = true; sched(); }, err => { console.warn(name, err.message); S.ready = true; sched(); }));
}
function listenVotes() {
  S.voteUnsubs.forEach(u => u()); S.voteUnsubs = [];
  S.polls.forEach(p => S.voteUnsubs.push(onSnapshot(collection(db, 'polls', p.id, 'votes'), s => { S.votes[p.id] = s.docs.map(d => ({ uid: d.id, ...d.data() })); sched(); })));
}
function startListeners() {
  listen('complaints', query(collection(db, 'complaints'), orderBy('createdAt', 'desc'), limit(120)), 'complaints');
  listen('notices', query(collection(db, 'notices'), orderBy('createdAt', 'desc'), limit(50)), 'notices');
  listen('polls', query(collection(db, 'polls'), orderBy('createdAt', 'desc'), limit(20)), 'polls');
  listen('directory', query(collection(db, 'directory')), 'directory');
  listen('mandi', query(collection(db, 'mandi'), orderBy('createdAt', 'desc'), limit(60)), 'mandi');
  listen('bazaar', query(collection(db, 'bazaar'), orderBy('createdAt', 'desc'), limit(60)), 'bazaar');
  S.unsubs.push(onSnapshot(query(collection(db, 'events'), orderBy('createdAt', 'desc'), limit(40)), snap => {
    S.events = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (!S.evFirst) snap.docChanges().forEach(ch => { if (ch.type !== 'added') return; const e = ch.doc.data(); if (e.byUid === S.user?.uid || !e.createdAt?.toDate) return; toast('🔔 ' + e.title); sysNotify(e.title, e.body || ''); });
    S.evFirst = false; renderTop(); if (route() === 'alerts') sched();
  }, e => console.warn('events', e.code)));
}
try { S.seenAt = +localStorage.getItem('mg_seen') || 0; if (!S.seenAt) { S.seenAt = Date.now(); localStorage.setItem('mg_seen', S.seenAt); } } catch (_) { S.seenAt = Date.now(); }
const unseenEv = () => S.events.filter(e => e.byUid !== S.user?.uid && e.createdAt?.toDate && e.createdAt.toDate().getTime() > S.seenAt);
function sysNotify(title, body) { try { if (document.hidden && 'Notification' in window && Notification.permission === 'granted') new Notification(title, { body, icon: 'icon-192.png', tag: 'mg' }); } catch (_) {} }
async function emit(type, title, body, link) { if (!configured || !S.user) return; try { await addDoc(collection(db, 'events'), { type, title: String(title).slice(0, 150), body: String(body || '').slice(0, 200), link: link || '', by: S.profile?.name || '', byUid: S.user.uid, createdAt: serverTimestamp() }); } catch (e) { console.warn('event', e.code); } }
if (configured) {
  startListeners();
  onAuthStateChanged(auth, async u => {
    S.user = u; S.profile = null; S.authReady = true;
    if (u) { try { const s = await getDoc(doc(db, 'users', u.uid)); S.profile = s.exists() ? s.data() : null; } catch (e) { console.warn(e); } }
    if (u && S.profile) startUserListeners(); else stopUserListeners();
    if (u && !S.profile) { S.authStep = 'profile'; if (S.authOpen) openAuth(); }
    else if (u && S.profile && S.authOpen) { finishLogin(); return; }
    renderAll();
  });
}
function finishLogin() {
  closeModal(); const cb = S.afterLogin; S.afterLogin = null; renderAll();
  toast(B('स्वागत है, ', 'Welcome, ') + (S.profile?.name || '').split(' ')[0] + ' 🎉'); if (cb) setTimeout(cb, 250);
}

/* ================= login only when needed ================= */
function needLogin(cb, why) {
  if (loggedIn()) return true;
  S.afterLogin = cb || null; S.why = why || ''; S.authStep = S.user ? 'profile' : 'phone'; openAuth(); return false;
}
function openAuth() { S.authOpen = true; $('#modalBody').innerHTML = authSheet(); $('#modal').classList.add('on'); setTimeout(() => ($('#phoneIn') || $('#otpIn') || $('#obName'))?.focus(), 60); }
const wardOpts = sel => Array.from({ length: VILLAGE.wards }, (_, i) => `Ward ${i + 1}`).concat(['Not sure']).map(w => `<option ${w === sel ? 'selected' : ''}>${w}</option>`).join('');
function authSheet() {
  const head = t => `<div class="row between" style="margin-bottom:6px"><h3 style="font-size:24px">${t}</h3><button class="iconbtn" onclick="A.closeModal()" aria-label="Close">✕</button></div>`;
  if (S.demo) return head(B('Firebase जोड़ना बाकी है', 'Firebase not connected')) + `<p>${B('अभी यह डेमो है। असली लॉगिन के लिए <b>firebase-config.js</b> में अपनी Firebase keys डालें (SETUP.md देखें)।', 'This is a demo. Add your Firebase keys in <b>firebase-config.js</b> for real login (see SETUP.md).')}</p><button class="btn btn-brand btn-block" onclick="A.closeModal()">OK</button>`;
  const why = S.why ? `<p style="margin:0 0 14px;font-weight:600">${esc(S.why)}</p>` : `<p class="muted" style="margin:0 0 14px">${B('सिर्फ़ एक OTP से खाता बन जाता है।', 'One OTP is all it takes.')}</p>`;
  if (S.authStep === 'phone') return head(B('लॉगिन / खाता खोलें', 'Log in / Sign up')) + why + `<button class="btn btn-line btn-block" id="gBtn" onclick="A.google()" style="gap:10px"><svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.9 2.4 30.4 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.5 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9h12.4c-.5 2.9-2.2 5.3-4.6 7l7.2 5.6c4.3-4 6.8-9.9 6.8-17z"/><path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.100 0 24s.9 7.600 2.600 10.800l7.900-6.100z"/><path fill="#34A853" d="M24 48c6.500 0 11.900-2.100 15.900-5.800l-7.200-5.600c-2 1.400-4.600 2.200-8.700 2.200-6.300 0-11.600-4-13.500-9.800l-7.900 6.100C6.500 42.600 14.600 48 24 48z"/></svg>${B('Google से जारी रखें (मुफ़्त)', 'Continue with Google (free)')}</button><div class="muted" style="text-align:center;margin:12px 0">${B('या मोबाइल OTP से', 'or with mobile OTP')}</div><div class="field"><label>${B('मोबाइल नंबर', 'Mobile number')}</label><div class="row" style="flex-wrap:nowrap"><b>+91</b><input class="input" id="phoneIn" inputmode="numeric" maxlength="10" placeholder="10 digit number" autocomplete="tel-national"></div></div>
  <button class="btn btn-brand btn-block" style="margin-top:14px" id="sendBtn" onclick="A.sendOtp()">${B('OTP भेजें', 'Send OTP')}</button>
  <p class="muted" style="margin:12px 0 0">${B('पहली बार? लॉगिन के बाद खाता अपने-आप बन जाएगा। आपका नंबर शिकायतों में नहीं दिखता।', 'First time? Your account is created after login. Your number is never shown on complaints.')}</p>`;
  if (S.authStep === 'otp') return head(B('OTP डालें', 'Enter OTP')) + `<p class="muted" style="margin:0 0 12px">${B('SMS में आया 6 अंकों का कोड', 'The 6-digit code from your SMS')}</p><input class="input otp" id="otpIn" inputmode="numeric" maxlength="6" autocomplete="one-time-code">
  <button class="btn btn-brand btn-block" style="margin-top:14px" id="verBtn" onclick="A.verifyOtp()">${B('पक्का करें', 'Verify')}</button><button class="btn btn-line btn-block" style="margin-top:8px" onclick="A.resetAuth()">${B('नंबर बदलें', 'Change number')}</button>`;
  return head(B('अपना परिचय दें', 'Tell us who you are')) + `<div class="form-grid" style="grid-template-columns:1fr"><div class="field"><label>${B('पूरा नाम *', 'Full name *')}</label><input class="input" id="obName" value="${esc(S.user?.displayName || '')}" placeholder="${B('जैसे: रामलाल शर्मा', 'e.g. Ramlal Sharma')}"></div><div class="field"><label>${B('वार्ड', 'Ward')}</label><select id="obWard">${wardOpts()}</select></div>${S.user?.phoneNumber ? '' : `<div class="field"><label>${B('मोबाइल नंबर (वैकल्पिक)', 'Mobile number (optional)')}</label><input class="input" id="obPhone" inputmode="numeric" maxlength="10" placeholder="${B('बाज़ार में खरीदार कॉल कर सकें', 'So buyers can call you in the bazaar')}"><span class="muted">${B('सिर्फ़ लॉगिन किए लोगों को बाज़ार में दिखेगा', 'Shown only to logged-in users, in the bazaar')}</span></div>`}</div>
  <button class="btn btn-brand btn-block" style="margin-top:14px" onclick="A.saveProfile()">${B('शुरू करें', 'Get started')}</button>`;
}
function resetRecaptcha() {
  try { window.rv?.clear(); } catch (_) {} window.rv = null;
  const old = $('#recaptcha'), fresh = document.createElement('div'); fresh.id = 'recaptcha'; old.replaceWith(fresh);
}
const loginPanel = msg => `<div class="panel" style="margin-top:14px"><h3 style="font-size:22px;margin-bottom:6px">${B('इसके लिए लॉगिन चाहिए', 'You need to log in for this')}</h3><p class="muted" style="margin:0 0 14px">${msg}</p><button class="btn btn-brand" onclick="A.login()">${B('मोबाइल नंबर से जुड़ें', 'Continue with mobile')}</button></div>`;

/* ================= photos -> Google Drive ================= */
async function compress(file) {
  const bmp = await createImageBitmap(file); const r = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * r); cv.height = Math.round(bmp.height * r);
  cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
  const blob = await new Promise(res => cv.toBlob(res, 'image/jpeg', 0.72));
  return new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result.split(',')[1]); fr.readAsDataURL(blob); });
}
async function uploadPhotos(files) {
  if (!files.length) return [];
  if (!DRIVE_UPLOAD_URL) { toast(B('Drive upload सेट नहीं है — फोटो छोड़ी गई', 'Drive upload not set up — photos skipped')); return []; }
  const token = await auth.currentUser.getIdToken(); const urls = [];
  for (const f of files) {
    const data = await compress(f);
    const r = await fetch(DRIVE_UPLOAD_URL, { method: 'POST', body: JSON.stringify({ token, name: S.user.uid.slice(0, 6), mime: 'image/jpeg', data }) });
    const j = await r.json(); if (!j.ok) throw new Error(j.error || 'upload failed'); urls.push(j.url);
  }
  return urls;
}

/* ================= modal ================= */
function openModal(html) { $('#modalBody').innerHTML = html; $('#modal').classList.add('on'); }
function closeModal() { $('#modal').classList.remove('on'); S.unsubCm?.(); S.unsubCm = null; S.openId = null; S.authOpen = false; }
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

/* ================= routing ================= */
const route = () => (location.hash.replace('#/', '') || 'home');
const go = r => { location.hash = '#/' + r; };
window.addEventListener('hashchange', () => { render(); scrollTo(0, 0); });
const NAV = [['home', '🏡', 'होम', 'Home'], ['feed', '📢', 'गाँव', 'Village'], ['report', '＋', '', ''], ['more', '🧭', 'सेवाएँ', 'Services'], ['profile', '👤', 'मेरा खाता', 'Me']];
function renderNav() {
  const r = route().split('/')[0];
  $('#nav').innerHTML = NAV.map(n => n[0] === 'report' ? `<button class="fab" onclick="go('report')" aria-label="${B('शिकायत दर्ज करें', 'Report an issue')}">＋</button>` : `<button class="${r === n[0] ? 'on' : ''}" onclick="go('${n[0]}')"><span class="i">${n[1]}</span>${B(n[2], n[3])}</button>`).join('');
}
function renderTop() {
  $('#villageLine').textContent = '📍 ' + B(VILLAGE.nameHi || VILLAGE.name, VILLAGE.name) + ', ' + VILLAGE.state;
  $('#meSlot').innerHTML = !S.authReady ? '' : S.profile ? `<button class="avatar" onclick="go('profile')" aria-label="Profile">${esc((S.profile.name.trim()[0] || 'U').toUpperCase())}</button>` : `<button class="btn btn-sm btn-brand" onclick="A.login()">${B('लॉगिन', 'Login')}</button>`;
  const ne = unseenEv().length; $('#bellSlot').innerHTML = `<button class="iconbtn chatbtn" onclick="go('alerts')" aria-label="${B('सूचनाएँ', 'Notifications')}">🔔${ne ? `<span class="dot">${ne > 9 ? '9+' : ne}</span>` : ''}</button>`;
  const n = loggedIn() ? unreadCount() : 0;
  $('#chatSlot').innerHTML = loggedIn() ? `<button class="iconbtn chatbtn" onclick="go('chats')" aria-label="${B('चैट', 'Chats')}">💬${n ? `<span class="dot">${n}</span>` : ''}</button>` : '';
  showInstall();
}
function renderAll() { renderTop(); render(route() === 'report' && !!$('#f_loc')); }
function render(soft) {
  renderNav();
  const v = $('#view'), [r, arg] = route().split('/');
  if (!S.authReady) { v.innerHTML = '<div class="skeleton" style="margin-top:20px;height:260px"></div>'; return; }
  const ae = document.activeElement;
  if (soft && (r === 'report' || r === 'alerts' && false || r === 'chat' || ($('#modal').classList.contains('on') && !S.openId) || (ae && /INPUT|TEXTAREA|SELECT/.test(ae.tagName) && v.contains(ae)))) return;
  const views = { alerts, home, feed, report, mine, notices, polls, bazaar, directory, mandi, schemes, profile, admin, more, chats, chat };
  v.innerHTML = (views[r] || home)(arg);
  if (r === 'chat') enterChat(arg); else leaveChat();
  if (S.openId) refreshDetail();
  if (r === 'report') renderPrev();
  afterRender();
}
function afterRender() {
  const first = !S.countDone; S.countDone = true;
  document.querySelectorAll('[data-count]').forEach(el => {
    const to = +el.dataset.count; if (!first || !to || matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = to; return; }
    const t0 = performance.now(); const step = t => { const p = Math.min(1, (t - t0) / 1000); el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(step); }; requestAnimationFrame(step);
  });
}

/* ================= shared pieces ================= */
const TILES = [
  ['report', '📝', 'शिकायत दर्ज करें', 'Report an issue', 'फोटो, लोकेशन, आवाज़ से', 'Photo, GPS, voice', '#c8321f'],
  ['feed', '📢', 'गाँव की शिकायतें', 'Village issues', 'सबकी समस्याएँ, एक जगह', 'Everyone’s issues', '#1f2d7a'],
  ['notices', '🗓️', 'पंचायत सूचना', 'Notices', 'बैठक और घोषणाएँ', 'Meetings & updates', '#7a2e6e'],
  ['polls', '🗳️', 'गाँव का मतदान', 'Village polls', 'अपनी राय दें', 'Have your say', '#1b7f78'],
  ['chats', '💬', 'निजी चैट', 'Private chat', 'गाँव के किसी से बात करें', 'Talk to anyone in the village', '#a23b72'],
  ['bazaar', '🛒', 'गाँव बाज़ार', 'Gaav Bazaar', 'खरीदें, बेचें, काम', 'Buy, sell, jobs', '#f6a609', '#241800'],
  ['mandi', '🌾', 'मंडी भाव', 'Mandi rates', 'फसलों के ताज़ा भाव', 'Crop prices', '#2f7a3b'],
  ['directory', '☎️', 'जरूरी नंबर', 'Directory', 'पंचायत, PHC, 112', 'Panchayat, PHC, 112', '#c8660f'],
  ['schemes', '🏛️', 'सरकारी योजनाएँ', 'Schemes', 'आधिकारिक पोर्टल', 'Official portals', '#111850']
];
const tileHtml = t => `<button class="tile" style="--tc:${t[6]};${t[7] ? `--tf:${t[7]}` : ''}" onclick="go('${t[0]}')"><span class="arch">${t[1]}</span><span><b>${B(t[2], t[3])}</b><small>${B(t[4], t[5])}</small></span></button>`;
function stepsBar(st) { const i = Math.max(0, STATUSES.indexOf(st)); return `<div class="steps">${STATUSES.slice(0, 5).map((s, k) => `<div class="step ${st !== 'Rejected' && k <= i ? 'done' : ''}"></div>`).join('')}</div>`; }
function daysToSolve(c) { const r = (c.history || []).find(h => h.s === 'Resolved'); return r ? Math.max(1, Math.ceil((tsDate(r.at) - tsDate(c.createdAt)) / 864e5)) : null; }
function ticket(c) {
  const up = (c.upvoters || []).length, d = c.status === 'Resolved' ? daysToSolve(c) : null;
  return `<article class="tk ${c.urgency === 'high' && c.status !== 'Resolved' ? 'hot' : ''}" style="--c:${cat(c.category)[4]}" onclick="A.openComplaint('${c.id}')" tabindex="0">
  <div class="stub">${cat(c.category)[1]}</div><div class="tk-body">
  <div class="tk-top"><b class="tk-no">${esc(c.ticket)}</b><span class="pill ${stClass(c.status)}">${esc(stLabel(c.status))}</span>${c.urgency === 'high' && c.status !== 'Resolved' ? `<span class="pill s3">${B('बहुत जरूरी', 'Urgent')}</span>` : ''}</div>
  <p>${esc((c.description || '').slice(0, 140))}${(c.description || '').length > 140 ? '…' : ''}</p>
  ${(c.photos || []).length ? `<div class="thumbs">${c.photos.slice(0, 3).map(u => `<img loading="lazy" src="${esc(u)}" alt="">`).join('')}</div>` : ''}
  ${d ? `<div class="solved">✅ ${B(`${d} दिन में हल हुई`, `Solved in ${d} day${d > 1 ? 's' : ''}`)}</div>` : ''}
  <div class="meta"><span>📍 ${esc(c.location)}</span><span>👍 ${up}</span><span>${ago(c.createdAt)}</span></div>${stepsBar(c.status)}</div></article>`;
}
function slip(n) {
  const d = tsDate(n.createdAt), ic = n.type === 'urgent' ? '🚨' : n.type === 'meeting' ? '🗓️' : '📢';
  return `<article class="slip ${n.pinned ? 'pin' : ''}"><div class="date"><b>${d.getDate()}</b><span>${d.toLocaleDateString('en-IN', { month: 'short' })}</span></div><div><h3>${ic} ${esc(n.title)}</h3><p>${esc(n.body)}</p><div class="meta">${n.date ? `<span>🕘 ${esc(n.date)}</span>` : ''}${n.pinned ? `<span>📌 ${B('ज़रूरी', 'Pinned')}</span>` : ''}<span>${ago(n.createdAt)}</span>${isAdmin() ? `<button class="btn btn-line btn-sm" onclick="A.del('notices','${n.id}')">🗑️</button>` : ''}</div></div></article>`;
}
const empty = (ic, msg, cta) => `<div class="empty"><big>${ic}</big>${msg}${cta ? `<div style="margin-top:12px">${cta}</div>` : ''}</div>`;
const HAVELI = `<svg class="haveli" viewBox="0 0 360 300" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="300" cy="52" r="24" fill="#f6a609"/><g stroke="#fbfaf6" stroke-width="2.5"><path d="M40 290V122h280v168M24 290h312"/><path d="M40 122h280M62 122v-12M98 122v-12M134 122v-12M226 122v-12M262 122v-12M298 122v-12"/><path d="M130 122V74h100v48"/><path d="M148 74a32 38 0 0 1 64 0"/><path d="M180 36V16M180 16l14 4-14 4"/><path d="M42 122v-18a15 19 0 0 1 30 0v18M288 122v-18a15 19 0 0 1 30 0v18"/><path d="M148 206v-40a32 38 0 0 1 64 0v40zM160 206v-34a20 26 0 0 1 40 0v34M138 206h84v10h-84z"/></g><g fill="#f6a609"><path d="M165 290v-34a15 18 0 0 1 30 0v34z"/><path d="M62 190v-20a10 13 0 0 1 20 0v20zM98 190v-20a10 13 0 0 1 20 0v20zM242 190v-20a10 13 0 0 1 20 0v20zM278 190v-20a10 13 0 0 1 20 0v20zM62 250v-20a10 13 0 0 1 20 0v20zM98 250v-20a10 13 0 0 1 20 0v20zM242 250v-20a10 13 0 0 1 20 0v20zM278 250v-20a10 13 0 0 1 20 0v20z"/></g></svg>`;

/* ================= views ================= */
function home() {
  const c = S.complaints, tot = c.length, res = c.filter(x => x.status === 'Resolved');
  const poll = S.polls.find(p => p.open !== false), notices = S.notices.slice().sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)).slice(0, 3);
  const showInstallStrip = !isStandalone();
  const first = S.profile ? B('नमस्ते, ', 'Namaste, ') + esc(S.profile.name.split(' ')[0]) + '। ' : '';
  return `${S.demo ? `<div class="demo">${B('👀 यह डेमो डेटा है। Firebase जोड़ते ही आपके गाँव का असली डेटा दिखेगा।', '👀 Demo data. Your village’s real data appears once Firebase is connected.')}</div>` : ''}
  <section class="wall"><div class="wall-in"><h1>${B('आपका गाँव,<br>आपकी आवाज़।', 'Your village,<br>your voice.')}</h1>
  <p class="wall-sub">${first}${B('समस्या बताइए, पंचायत की खबर देखिए, मंडी भाव और गाँव बाज़ार एक ही जगह — बिना लॉगिन के भी।', 'Report problems, follow panchayat news, mandi rates and the village market — all open to browse, no login needed.')}</p>
  <div class="row"><button class="btn btn-gold" onclick="go('report')">${B('समस्या बताएँ', 'Report an issue')}</button><button class="btn btn-ghost" onclick="go('feed')">${B('गाँव देखें', 'Explore the village')}</button></div>
  <p class="wall-count">${tot ? B(`अब तक <b data-count="${tot}">${tot}</b> शिकायतें आईं और <b data-count="${res.length}">${res.length}</b> हल हो चुकी हैं।`, `<b data-count="${tot}">${tot}</b> issues reported so far, <b data-count="${res.length}">${res.length}</b> already solved.`) : B('पहली शिकायत आप दर्ज कीजिए — गाँव सुन रहा है।', 'Be the first to report — the village is listening.')}</p></div>${HAVELI}</section><div class="jaali"></div>
  ${showInstallStrip ? `<div class="strip gold"><div>${B('फोन में ऐप की तरह लगाइए', 'Add it to your phone like an app')}<small>${B('मुफ़्त है, लॉगिन नहीं चाहिए', 'Free, no login needed')}</small></div><button class="btn btn-sm" style="background:#241800;color:#fff" onclick="A.install()">📲 ${B('इंस्टॉल', 'Install')}</button></div>` : ''}
  <a class="strip sos" href="tel:112"><div>🚨 ${B('आपातकाल? 112 पर कॉल करें', 'Emergency? Call 112')}<small>${B('पुलिस, एम्बुलेंस, फायर', 'Police, ambulance, fire')}</small></div><b>112</b></a>
  <section class="blk"><div class="sec-head"><h2 class="h2">${B('सेवाएँ', 'Services')}</h2></div><div class="tiles">${TILES.map(tileHtml).join('')}</div></section>
  ${res.length ? `<section class="blk"><div class="sec-head"><h2 class="h2">${B('हल हो चुकी समस्याएँ', 'Solved issues')}</h2><a href="#/feed" onclick="A.setF('st','Resolved')">${B('सभी देखें', 'See all')}</a></div><div class="list two">${res.slice(0, 2).map(ticket).join('')}</div></section>` : ''}
  <section class="blk"><div class="sec-head"><h2 class="h2">${B('गाँव की खबर', 'Village news')}</h2><a href="#/notices">${B('सभी देखें', 'See all')}</a></div>${notices.length ? `<div class="list">${notices.map(slip).join('')}</div>` : empty('📭', B('अभी कोई सूचना नहीं', 'No notices yet'))}</section>
  ${poll ? `<section class="blk"><div class="band"><div class="jaali top-edge"></div><div class="band-in"><div class="muted" style="color:#cfd5ff">${B('गाँव का मतदान', 'Village poll')} · ${(S.votes[poll.id] || []).length} ${B('वोट', 'votes')}</div><h3 style="margin-top:6px">${esc(poll.q)}</h3>${poll.options.slice(0, 3).map((o, i) => `<button class="opt" onclick="A.vote('${poll.id}',${i})">${esc(o)}</button>`).join('')}</div></div></section>` : ''}
  ${S.mandi.length ? `<section class="blk"><div class="sec-head"><h2 class="h2">${B('आज का मंडी भाव', 'Mandi rates')}</h2><a href="#/mandi">${B('सभी देखें', 'See all')}</a></div>${ledger(S.mandi.slice(0, 4))}</section>` : ''}
  ${S.bazaar.length ? `<section class="blk"><div class="sec-head"><h2 class="h2">${B('गाँव बाज़ार', 'Gaav Bazaar')}</h2><a href="#/bazaar">${B('सभी देखें', 'See all')}</a></div><div class="hs">${S.bazaar.filter(b => !b.sold).slice(0, 6).map(adMini).join('')}</div></section>` : ''}
  <section class="blk"><div class="sec-head"><h2 class="h2">${B('शिकायत कैसे हल होती है', 'How an issue gets solved')}</h2></div><div class="steps3"><div><i></i><span><b>${B('आप बताते हैं', 'You report it')}</b>${B('जगह, फोटो और दो लाइन। बोलकर भी लिख सकते हैं।', 'Place, photo and a line or two. You can speak it, too.')}</span></div><div><i></i><span><b>${B('पंचायत देखती है', 'Panchayat reviews')}</b>${B('जाँच के बाद काम किसी को सौंपा जाता है।', 'After checking, the work is assigned to someone.')}</span></div><div><i></i><span><b>${B('आप प्रगति देखते हैं', 'You track progress')}</b>${B('हर बदलाव टिकट पर दिखता है।', 'Every change shows up on the ticket.')}</span></div></div></section>
  ${!S.profile ? `<section class="blk"><div class="band"><div class="jaali top-edge"></div><div class="band-in"><h3>${B('खाता खोलिए, सिर्फ़ मोबाइल नंबर से', 'Open an account with just your mobile number')}</h3><p style="margin:0 0 14px;color:#dfe3ff">${B('देखना हमेशा खुला रहेगा। शिकायत दर्ज करने, वोट देने, टिप्पणी करने और बाज़ार में विज्ञापन डालने पर ही लॉगिन माँगा जाएगा।', 'Browsing stays open. Login is asked only when you report, vote, comment or post in the bazaar.')}</p><button class="btn btn-gold" onclick="A.login()">${B('मोबाइल नंबर से जुड़ें', 'Continue with mobile')}</button></div></div></section>` : ''}
  <p class="foot">${B('अपने गाँव का लिंक दोस्तों को भेजिए', 'Send this village link to your friends')}<br><button class="btn btn-line btn-sm" style="margin-top:8px" onclick="A.shareApp()">↗ ${B('शेयर करें', 'Share')}</button></p>`;
}
function ledger(rows) { return `<div class="ledger">${rows.map(m => `<div class="lrow"><span><b>${esc(m.crop)}</b><small>${esc(m.mandi || '')} · ${fmt(m.createdAt)}</small></span><i></i><span class="pr">₹${esc(m.price)}<small style="display:inline;font-family:var(--body)"> /${esc(m.unit || 'क्विंटल')}</small></span>${isAdmin() ? `<button class="btn btn-line btn-sm" onclick="A.del('mandi','${m.id}')">🗑️</button>` : ''}</div>`).join('')}</div>`; }
const BZ = { sell: ['🛍️', 'बिक्री', 'For sale'], rent: ['🚜', 'किराया', 'Rent'], job: ['👷', 'काम/रोजगार', 'Jobs'], service: ['🛠️', 'सेवा', 'Services'], lost: ['🔎', 'खोया-पाया', 'Lost & found'] };
const adMini = b => `<div class="ad" onclick="go('bazaar')"><div class="ph">${(b.photos || [])[0] ? `<img loading="lazy" src="${esc(b.photos[0])}" alt="">` : (BZ[b.type]?.[0] || '🛍️')}</div><div class="tx"><b>${esc(b.title)}</b><span class="muted">${b.price ? '₹' + esc(b.price) : B(BZ[b.type]?.[1], BZ[b.type]?.[2])}</span></div></div>`;

function more() {
  return `<h1 class="h1">${B('सेवाएँ', 'Services')}</h1><p class="muted" style="margin:6px 0 14px">${B('सब कुछ बिना लॉगिन के देख सकते हैं।', 'Everything here is open to browse.')}</p><div class="tiles">${TILES.map(tileHtml).join('')}${loggedIn() ? tileHtml(['mine', '📋', 'मेरी शिकायतें', 'My issues', 'स्थिति ट्रैक करें', 'Track status', '#5d6486']) : ''}${isAdmin() ? tileHtml(['admin', '⚙️', 'एडमिन पैनल', 'Admin panel', 'सब कुछ संभालें', 'Manage everything', '#111850']) : ''}</div>`;
}
function feedFilters() {
  return `<div class="chips">${['all', ...STATUSES].map(s => `<button class="chip ${S.f.st === s ? 'on' : ''}" onclick="A.setF('st','${s}')">${s === 'all' ? B('सभी', 'All') : stLabel(s)}</button>`).join('')}</div>
  <div class="row" style="margin-bottom:12px;flex-wrap:nowrap"><select class="input" onchange="A.setF('cat',this.value)" style="flex:1"><option value="all">${B('सभी श्रेणियाँ', 'All categories')}</option>${CATS.map(c => `<option value="${c[0]}" ${S.f.cat === c[0] ? 'selected' : ''}>${c[1]} ${B(c[2], c[3])}</option>`).join('')}</select><input class="input" placeholder="🔍 ${B('खोजें', 'Search')}" value="${esc(S.f.q)}" oninput="A.setQ(this.value)" style="flex:1"></div>`;
}
function filtered(list) { return list.filter(c => (S.f.st === 'all' || c.status === S.f.st) && (S.f.cat === 'all' || c.category === S.f.cat) && (!S.f.q || (c.description + c.location + c.ticket + c.name).toLowerCase().includes(S.f.q.toLowerCase()))); }
const listHtml = l => l.length ? `<div class="list two">${l.map(ticket).join('')}</div>` : empty('📭', B('कोई शिकायत नहीं मिली', 'No issues found'), `<button class="btn btn-brand" onclick="go('report')">${B('पहली शिकायत दर्ज करें', 'Report the first issue')}</button>`);
function feed() { return `<h1 class="h1">${B('गाँव की शिकायतें', 'Village issues')}</h1><p class="muted" style="margin:6px 0 12px">${B('किसी भी शिकायत पर खोलकर “मुझे भी यही समस्या है” दबाइए।', 'Open any issue and tap “Same problem” to back it.')}</p>${feedFilters()}<div id="feedList">${S.ready ? listHtml(filtered(S.complaints)) : '<div class="skeleton"></div>'}</div>`; }
function mine() {
  if (!loggedIn()) return `<h1 class="h1">${B('मेरी शिकायतें', 'My issues')}</h1>${loginPanel(B('अपनी शिकायतें और उनकी स्थिति देखने के लिए लॉगिन करें।', 'Log in to see your issues and their status.'))}`;
  return `<h1 class="h1">${B('मेरी शिकायतें', 'My issues')}</h1><div style="height:12px"></div>${feedFilters()}<div id="feedList">${listHtml(filtered(S.complaints.filter(c => c.uid === S.user.uid)))}</div>`;
}

function report() {
  return `<h1 class="h1">${B('नई शिकायत', 'New issue')}</h1><p class="muted" style="margin:6px 0 14px">${loggedIn() ? B('* वाले खाने जरूरी हैं।', 'Fields marked * are required.') : B('फ़ॉर्म बिना लॉगिन के भरिए। जमा करते समय OTP से पक्का करना होगा।', 'Fill the form freely. You’ll verify with an OTP when you submit.')}</p>
  <div class="panel"><div class="form-grid">
  <div class="field"><label>${B('श्रेणी *', 'Category *')}</label><select id="f_cat">${CATS.map(c => `<option value="${c[0]}">${c[1]} ${B(c[2], c[3])}</option>`).join('')}</select></div>
  <div class="field"><label>${B('वार्ड', 'Ward')}</label><select id="f_ward">${wardOpts(S.profile?.ward)}</select></div>
  <div class="field full"><label>${B('जगह *', 'Location *')}</label><input id="f_loc" placeholder="${B('मोहल्ला, गली, नजदीकी जगह', 'Area, street, landmark')}"><div class="row" style="margin-top:6px"><button type="button" class="btn btn-line btn-sm" onclick="A.gps()">📍 ${B('मेरी लोकेशन जोड़ें', 'Add my GPS')}</button><span class="muted" id="gpsInfo"></span></div></div>
  <div class="field full"><label>${B('क्या समस्या है? *', 'What is the problem? *')}</label><textarea id="f_desc" placeholder="${B('क्या समस्या है और कब से है?', 'What is wrong and since when?')}"></textarea><div class="row"><button type="button" class="btn btn-line btn-sm" onclick="A.voice()">🎙️ ${B('बोलकर लिखें', 'Speak to type')}</button></div></div>
  <div class="field"><label>${B('कितनी जरूरी?', 'Urgency')}</label><select id="f_urg"><option value="low">${B(...URG.low)}</option><option value="medium">${B(...URG.medium)}</option><option value="high">${B(...URG.high)}</option></select></div>
  <div class="field full"><label>${B('फोटो (अधिकतम 3)', 'Photos (max 3)')}</label><div class="photo-pick" id="prev"></div><input id="f_photo" type="file" accept="image/*" multiple hidden onchange="A.pick(this)"></div>
  </div><div class="row" style="margin-top:18px"><button class="btn btn-brand" id="subBtn" onclick="A.submitReport()">${B('शिकायत जमा करें', 'Submit issue')}</button><button class="btn btn-line" onclick="go('home')">${B('रद्द करें', 'Cancel')}</button></div></div>`;
}
function renderPrev() {
  const p = $('#prev'); if (!p) return;
  p.innerHTML = S.pending.map((f, i) => `<div style="position:relative"><img class="ph" src="${URL.createObjectURL(f)}" alt=""><button class="btn btn-red btn-sm" style="position:absolute;top:3px;right:3px;min-height:26px;padding:0 8px" onclick="A.rmPhoto(${i})" aria-label="Remove">✕</button></div>`).join('') + (S.pending.length < 3 ? `<button type="button" class="add-ph" onclick="$('#f_photo').click()" aria-label="Add photo">📷</button>` : '');
}

function notices() { return `<div class="row between"><h1 class="h1">${B('पंचायत सूचनाएँ', 'Panchayat notices')}</h1>${isAdmin() ? `<button class="btn btn-brand btn-sm" onclick="A.adminForm('notice')">＋ ${B('नई सूचना', 'New')}</button>` : ''}</div><div style="height:14px"></div>${S.notices.length ? `<div class="list">${S.notices.slice().sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)).map(slip).join('')}</div>` : empty('📭', B('अभी कोई सूचना नहीं', 'No notices yet'))}`; }

function polls() {
  const html = S.polls.map(p => {
    const votes = S.votes[p.id] || [], total = votes.length, mineV = S.user && votes.find(v => v.uid === S.user.uid), show = mineV || p.open === false;
    return `<div class="band"><div class="jaali top-edge"></div><div class="band-in"><h3>${esc(p.q)}</h3>${p.options.map((o, i) => {
      const n = votes.filter(v => v.opt === i).length, pc = total ? Math.round(n * 100 / total) : 0;
      return show ? `<div style="margin-bottom:6px">${esc(o)} ${mineV?.opt === i ? '✅' : ''} <span style="color:#cfd5ff">— ${n} (${pc}%)</span><div class="bar" style="background:#ffffff30"><i style="width:${pc}%"></i></div></div>` : `<button class="opt" onclick="A.vote('${p.id}',${i})">${esc(o)}</button>`;
    }).join('')}<div class="meta" style="color:#cfd5ff">${total} ${B('वोट', 'votes')}${p.open === false ? ' · ' + B('बंद', 'Closed') : ''}${isAdmin() ? `<button class="btn btn-sm btn-ghost" onclick="A.closePoll('${p.id}')">${B('बंद करें', 'Close')}</button><button class="btn btn-sm btn-ghost" onclick="A.del('polls','${p.id}')">🗑️</button>` : ''}</div></div></div>`;
  }).join('');
  return `<div class="row between"><h1 class="h1">${B('गाँव का मतदान', 'Village polls')}</h1>${isAdmin() ? `<button class="btn btn-brand btn-sm" onclick="A.adminForm('poll')">＋ ${B('नया', 'New')}</button>` : ''}</div><p class="muted" style="margin:6px 0 14px">${B('वोट देने के लिए लॉगिन चाहिए। एक आदमी, एक वोट।', 'Login is needed to vote. One person, one vote.')}</p>${html ? `<div class="list">${html}</div>` : empty('🗳️', B('अभी कोई मतदान नहीं', 'No polls yet'))}`;
}

function bazaar() {
  const items = S.bazaar.filter(b => S.bf === 'all' || b.type === S.bf);
  return `<div class="row between"><h1 class="h1">${B('गाँव बाज़ार', 'Gaav Bazaar')}</h1><button class="btn btn-brand btn-sm" onclick="A.adminForm('bazaar')">＋ ${B('विज्ञापन डालें', 'Post')}</button></div><p class="muted" style="margin:6px 0 10px">${B('फोन नंबर सिर्फ़ लॉगिन किए हुए लोगों को दिखता है।', 'Phone numbers are shown only to logged-in users.')}</p>
  <div class="chips"><button class="chip ${S.bf === 'all' ? 'on' : ''}" onclick="A.setBf('all')">${B('सभी', 'All')}</button>${Object.entries(BZ).map(([k, v]) => `<button class="chip ${S.bf === k ? 'on' : ''}" onclick="A.setBf('${k}')">${v[0]} ${B(v[1], v[2])}</button>`).join('')}</div>
  ${items.length ? `<div class="list two">${items.map(b => `<div class="card" ${b.sold ? 'style="opacity:.6"' : ''}><div class="row between" style="flex-wrap:nowrap;align-items:flex-start"><b style="font-size:18px">${BZ[b.type]?.[0] || ''} ${esc(b.title)}</b>${b.price ? `<span class="pill s2">₹${esc(b.price)}</span>` : ''}</div>
  <p style="margin:6px 0">${esc(b.desc || '')}</p>${(b.photos || []).length ? `<div class="thumbs">${b.photos.map(u => `<img loading="lazy" src="${esc(u)}" alt="">`).join('')}</div>` : ''}
  <div class="meta"><span>👤 ${esc(b.name)}</span><span>${ago(b.createdAt)}</span>${b.sold ? `<span class="pill s0">${B('बिक गया', 'Sold')}</span>` : ''}</div>
  <div class="row" style="margin-top:10px">${!b.sold ? `<button class="btn btn-brand btn-sm" onclick="A.contact('${b.id}','call')">📞 ${B('कॉल', 'Call')}</button><button class="btn btn-line btn-sm" onclick="A.contact('${b.id}','wa')">💬 WhatsApp</button>` : ''}${S.user && (b.uid === S.user.uid || isAdmin()) ? `<button class="btn btn-line btn-sm" onclick="A.sold('${b.id}',${!b.sold})">${b.sold ? B('फिर चालू करें', 'Reopen') : B('बिक गया', 'Mark sold')}</button><button class="btn btn-line btn-sm" onclick="A.del('bazaar','${b.id}')">🗑️</button>` : ''}</div></div>`).join('')}</div>` : empty('🛒', B('अभी कोई विज्ञापन नहीं', 'No listings yet'))}`;
}

const STATIC_DIR = [['🚨', 'आपातकालीन / Emergency', '112'], ['👮', 'पुलिस / Police', '100'], ['🚑', 'एम्बुलेंस / Ambulance', '108'], ['🔥', 'फायर / Fire', '101'], ['👩', 'महिला हेल्पलाइन / Women', '181'], ['🧒', 'चाइल्डलाइन / Childline', '1098'], ['🧑‍🌾', 'किसान कॉल सेंटर / Kisan', '18001801551']];
function directory() {
  return `<div class="row between"><h1 class="h1">${B('जरूरी नंबर', 'Directory')}</h1>${isAdmin() ? `<button class="btn btn-brand btn-sm" onclick="A.adminForm('directory')">＋ ${B('जोड़ें', 'Add')}</button>` : ''}</div>
  <h2 class="h2" style="margin:18px 0 10px">${B('हमारे गाँव के संपर्क', 'Our village contacts')}</h2>${S.directory.filter(d => d.phone).length ? `<div class="list two">${S.directory.filter(d => d.phone).map(d => `<div class="card row between" style="flex-wrap:nowrap"><div><b>${esc(d.name)}</b><div class="muted">${esc(d.role || '')}</div><div>${esc(d.phone)}</div></div><div class="row" style="flex-wrap:nowrap"><a class="btn btn-brand btn-sm" href="tel:${esc(d.phone)}">📞</a>${isAdmin() ? `<button class="btn btn-line btn-sm" onclick="A.del('directory','${d.id}')">🗑️</button>` : ''}</div></div>`).join('')}</div>` : empty('📒', B('पंचायत, PHC और स्कूल के नंबर एडमिन यहाँ जोड़ेगा।', 'The admin will add panchayat, PHC and school numbers here.'))}
  <h2 class="h2" style="margin:24px 0 10px">${B('राष्ट्रीय हेल्पलाइन', 'National helplines')}</h2><div class="list two">${STATIC_DIR.map(d => `<div class="card row between" style="flex-wrap:nowrap"><div>${d[0]} <b>${d[1]}</b><div class="muted">${d[2]}</div></div><a class="btn btn-brand btn-sm" href="tel:${d[2]}">📞</a></div>`).join('')}</div>`;
}
function mandi() { return `<div class="row between"><h1 class="h1">${B('मंडी भाव', 'Mandi rates')}</h1>${isAdmin() ? `<button class="btn btn-brand btn-sm" onclick="A.adminForm('mandi')">＋ ${B('भाव जोड़ें', 'Add')}</button>` : ''}</div><p class="muted" style="margin:6px 0 14px">${B('भाव पंचायत/एडमिन डालते हैं। खरीद-बिक्री से पहले मंडी में पक्का कर लें।', 'Entered by the panchayat/admin. Confirm at the mandi before you trade.')}</p>${S.mandi.length ? ledger(S.mandi) : empty('🌾', B('अभी कोई भाव नहीं डाला गया', 'No rates added yet'))}`; }
const SCHEMES = [['🏛️', 'myScheme', 'https://www.myscheme.gov.in/', 'केंद्र व राज्य की योजनाएँ खोजें', 'Find central & state schemes', '#1f2d7a'], ['🪪', 'Rajasthan SSO', 'https://sso.rajasthan.gov.in/', 'राजस्थान की ऑनलाइन सेवाएँ', 'Rajasthan online services', '#c8660f'], ['📊', 'Jan Soochna', 'https://jansoochna.rajasthan.gov.in/', 'राजस्थान सरकारी जानकारी', 'Rajasthan govt data', '#1b7f78'], ['🌾', 'PM-KISAN', 'https://pmkisan.gov.in/', 'किसान सम्मान निधि', 'Farmer income support', '#2f7a3b'], ['👷', 'MGNREGA', 'https://nrega.nic.in/', 'ग्रामीण रोजगार', 'Rural employment', '#7a2e6e'], ['🇮🇳', 'India.gov.in', 'https://www.india.gov.in/', 'राष्ट्रीय पोर्टल', 'National portal', '#111850']];
function schemes() { return `<h1 class="h1">${B('सरकारी योजनाएँ', 'Government schemes')}</h1><p class="muted" style="margin:6px 0 14px">${B('पात्रता और तारीखें हमेशा आधिकारिक साइट पर जाँचिए।', 'Always verify eligibility and dates on the official site.')}</p><div class="tiles">${SCHEMES.map(s => `<a class="tile" style="--tc:${s[5]};text-decoration:none" href="${s[2]}" target="_blank" rel="noopener"><span class="arch">${s[0]}</span><span><b>${s[1]}</b><small>${B(s[3], s[4])}</small></span></a>`).join('')}</div>`; }

function profile() {
  const common = `${!isStandalone() ? `<button class="btn btn-gold btn-block" style="margin-top:14px" onclick="A.install()">📲 ${B('ऐप फोन में इंस्टॉल करें', 'Install the app')}</button>` : ''}<button class="btn btn-line btn-block" style="margin-top:10px" onclick="A.shareApp()">↗ ${B('दोस्तों को भेजें', 'Share with friends')}</button><button class="btn btn-line btn-block" style="margin-top:10px" onclick="$('#themeBtn').click()">🌓 ${B('डार्क / लाइट थीम', 'Dark / light theme')}</button><p class="foot">Mera Gaav · ${esc(VILLAGE.name)}, ${esc(VILLAGE.state)}</p>`;
  if (!loggedIn()) return `<h1 class="h1">${B('खाता खोलिए', 'Open your account')}</h1><p style="margin:8px 0">${B('सिर्फ़ मोबाइल नंबर और एक OTP। इससे आप —', 'Just a mobile number and one OTP. With it you can —')}</p><ul class="checks"><li>${B('शिकायत दर्ज कर सकते हैं और उसे ट्रैक कर सकते हैं', 'report issues and track them')}</li><li>${B('गाँव के मतदान में वोट दे सकते हैं', 'vote in village polls')}</li><li>${B('शिकायतों पर टिप्पणी और समर्थन दे सकते हैं', 'comment on and back issues')}</li><li>${B('गाँव बाज़ार में विज्ञापन डाल सकते हैं', 'post in the village bazaar')}</li></ul><button class="btn btn-brand btn-block" onclick="A.login()">${B('मोबाइल नंबर से जुड़ें', 'Continue with mobile')}</button>${common}`;
  const my = S.complaints.filter(c => c.uid === S.user.uid);
  return `<h1 class="h1">${esc(S.profile.name)}</h1><p class="muted" style="margin:4px 0 14px">${esc(S.profile.phone || S.user.phoneNumber || S.user.email || '')} · ${isAdmin() ? 'Admin / पंचायत' : B('ग्रामवासी', 'Resident')}</p>
  <div class="kpis" style="grid-template-columns:repeat(3,1fr)"><div class="kpi"><b>${my.length}</b><span>${B('मेरी शिकायतें', 'My issues')}</span></div><div class="kpi"><b>${my.filter(c => c.status === 'Resolved').length}</b><span>${B('हल हुईं', 'Solved')}</span></div><div class="kpi"><b>${my.reduce((a, c) => a + (c.upvoters || []).length, 0)}</b><span>${B('मिले समर्थन', 'Backers')}</span></div></div>
  <div class="panel" style="margin-top:14px"><div class="form-grid"><div class="field"><label>${B('नाम', 'Name')}</label><input id="pName" value="${esc(S.profile.name)}"></div><div class="field"><label>${B('वार्ड', 'Ward')}</label><select id="pWard">${wardOpts(S.profile.ward)}</select></div></div><div class="row" style="margin-top:14px"><button class="btn btn-brand" onclick="A.updateProfile()">${B('सेव करें', 'Save')}</button><button class="btn btn-line" onclick="A.logout()">${B('लॉगआउट', 'Logout')}</button></div></div>
  <div class="row" style="margin-top:12px"><button class="btn btn-line" onclick="go('mine')">📋 ${B('मेरी शिकायतें', 'My issues')}</button>${isAdmin() ? `<button class="btn btn-line" onclick="go('admin')">⚙️ Admin</button>` : ''}</div>${common}`;
}

function admin() {
  if (!isAdmin()) return `<h1 class="h1">Admin</h1>${loggedIn() ? `<div class="panel" style="margin-top:14px"><p>${B('यह पेज सिर्फ़ पंचायत एडमिन के लिए है।', 'This page is for panchayat admins only.')}</p><p class="muted">Firebase Console → Firestore → <code>users/${esc(S.user.uid)}</code> → <code>role = "admin"</code></p></div>` : loginPanel(B('एडमिन पैनल के लिए लॉगिन करें।', 'Log in to use the admin panel.'))}`;
  return `<h1 class="h1">Admin</h1><div class="panel" style="margin-top:14px"><p style="margin:0 0 12px">${B('पूरा एडमिन पैनल अब अलग पेज पर है: शिकायतें, सूचनाएँ, मतदान, संपर्क, मंडी, बाज़ार और यूज़र, सब edit और delete के साथ।', 'The full admin panel is now its own page: complaints, notices, polls, contacts, mandi, bazaar and users, all with edit and delete.')}</p><a class="btn btn-brand" href="admin.html">⚙️ ${B('एडमिन पैनल खोलें', 'Open admin panel')}</a></div>`;
}


/* ================= notifications center ================= */
const EV_IC = { issue: '📝', comment: '💬', status: '🔧', notice: '📢', poll: '🗳️', mandi: '🌾', directory: '☎️', bazaar: '🛒' };
function alerts() {
  const prev = S.seenAt;
  setTimeout(() => { const t = Date.now(); S.seenAt = t; try { localStorage.setItem('mg_seen', t); } catch (_) {} renderTop(); }, 1500);
  const perm = 'Notification' in window ? Notification.permission : 'denied';
  return `<h1 class="h1">${B('सूचनाएँ', 'Notifications')}</h1><p class="muted" style="margin:6px 0 12px">${B('गाँव में हर नई शिकायत, टिप्पणी और पंचायत की पोस्ट यहाँ दिखती है।', 'Every new issue, comment and panchayat post shows up here.')}</p>
  ${perm === 'default' ? `<button class="btn btn-gold btn-block" style="margin-bottom:12px" onclick="A.enableNotif()">🔔 ${B('फोन/ब्राउज़र नोटिफिकेशन चालू करें', 'Turn on device notifications')}</button>` : ''}
  ${S.events.length ? `<div class="list">${S.events.map(e => `<div class="card chatrow ${e.createdAt?.toDate && e.createdAt.toDate().getTime() > prev && e.byUid !== S.user?.uid ? 'newev' : ''}" onclick="A.openEvent('${esc(e.link || '')}')" tabindex="0"><span class="av">${EV_IC[e.type] || '🔔'}</span><span style="flex:1;min-width:0"><b>${esc(e.title)}</b>${e.body ? `<span class="muted clip1" style="display:block">${esc(e.body)}</span>` : ''}</span><span class="muted" style="font-size:12px">${e.createdAt ? ago(e.createdAt) : ''}</span></div>`).join('')}</div>` : empty('🔔', B('अभी कोई नई सूचना नहीं', 'Nothing new yet'))}`;
}

/* ================= complaint detail ================= */
function refreshDetail() {
  const c = S.complaints.find(x => x.id === S.openId); if (!c) return;
  const keep = $('#cmIn')?.value || '', hadFocus = document.activeElement?.id === 'cmIn';
  const up = S.user && (c.upvoters || []).includes(S.user.uid), cm = S.comments || [];
  $('#modalBody').innerHTML = `<div class="row between" style="flex-wrap:nowrap"><div><b class="tk-no">${esc(c.ticket)}</b> <span class="pill ${stClass(c.status)}">${esc(stLabel(c.status))}</span></div><button class="iconbtn" onclick="A.closeModal()" aria-label="Close">✕</button></div>
  <h3 style="font-size:24px;margin:10px 0 4px">${catLabel(c.category)}</h3><div class="muted">${esc(c.ward || '')} · ${fmt(c.createdAt)} · ${esc(c.name)}</div>
  <p style="line-height:1.6;white-space:pre-wrap;margin:12px 0">${esc(c.description)}</p>
  <p style="margin:0 0 8px"><b>📍 ${esc(c.location)}</b> ${c.geo ? `<a target="_blank" rel="noopener" href="https://www.google.com/maps?q=${c.geo.lat},${c.geo.lng}">${B('नक्शे में देखें', 'Open map')} ↗</a>` : ''}</p>
  ${(c.photos || []).length ? `<div class="thumbs">${c.photos.map(u => `<a href="${esc(u).replace('sz=w1000', 'sz=w2000')}" target="_blank" rel="noopener"><img src="${esc(u)}" alt="" style="width:110px;height:110px"></a>`).join('')}</div>` : ''}
  ${stepsBar(c.status)}
  <div class="row" style="margin:14px 0"><button class="btn ${up ? 'btn-brand' : 'btn-line'}" onclick="A.upvote('${c.id}')">👍 ${B('मुझे भी यही समस्या है', 'Same problem')} (${(c.upvoters || []).length})</button><button class="btn btn-line" onclick="A.share('${c.id}')">↗ ${B('शेयर', 'Share')}</button>${S.user && c.uid === S.user.uid ? `<button class="btn btn-line" onclick="A.editComplaint('${c.id}')">✏️ ${B('बदलें', 'Edit')}</button><button class="btn btn-line" onclick="A.delMine('${c.id}')">🗑️ ${B('हटाएँ', 'Delete')}</button>` : ''}</div>
  <b>${B('प्रगति', 'Progress')}</b><div class="tl">${(c.history || []).slice().reverse().map(h => `<div><b>${esc(stLabel(h.s))}</b>${h.note ? esc(h.note) + '<br>' : ''}<span class="muted">${fmt(h.at)}${h.by ? ' · ' + esc(h.by) : ''}</span></div>`).join('')}</div>
  <b>💬 ${B('टिप्पणियाँ', 'Comments')} (${cm.length})</b>${cm.map(m => {
    const mine = S.user && m.uid === S.user.uid, ce = mine && canEditCm(m), del = mine || (S.user && c.uid === S.user.uid);
    return `<div class="cm">${m.replyTo ? `<div class="quote rq"><b>${esc(m.replyTo.name)}</b> ${esc(m.replyTo.text)}</div>` : ''}<b>${esc(m.name)}</b> ${m.admin ? `<span class="pill s2">${B('पंचायत', 'Panchayat')}</span>` : ''} <small>${m.createdAt ? ago(m.createdAt) : ''}${m.editedAt ? ' · ' + B('संपादित', 'edited') : ''}</small><br>${esc(m.text)}<div class="cmact">${loggedIn() ? `<button onclick="A.reply('${m.id}')">↩ ${B('जवाब', 'Reply')}</button>` : ''}${ce ? `<button onclick="A.editCm('${m.id}')">✏️ ${B('बदलें', 'Edit')}</button>` : ''}${del ? `<button onclick="A.delCm('${m.id}')">🗑️</button>` : ''}</div></div>`;
  }).join('') || `<div class="muted" style="padding:8px 0">${B('अभी कोई टिप्पणी नहीं', 'No comments yet')}</div>`}
  ${loggedIn() ? `${S.replyTo ? `<div class="editbar">↩ <span class="clip1" style="flex:1"><b>${esc(S.replyTo.name)}</b>: ${esc(S.replyTo.text)}</span><button class="btn btn-line btn-sm" onclick="A.cancelReply()">✕</button></div>` : ''}${S.editCm ? `<div class="editbar">✏️ ${B('टिप्पणी बदल रहे हैं', 'Editing comment')} <button class="btn btn-line btn-sm" onclick="A.cancelReply()">✕</button></div>` : ''}<div class="row" style="margin-top:10px;flex-wrap:nowrap"><input class="input" id="cmIn" placeholder="${B('टिप्पणी लिखिए…', 'Write a comment…')}" maxlength="1000" style="flex:1"><button class="btn btn-brand" onclick="A.comment('${c.id}')" aria-label="Send">➤</button></div>` : `<button class="btn btn-line btn-block" style="margin-top:10px" onclick="A.needComment('${c.id}')">${B('टिप्पणी के लिए लॉगिन करें', 'Log in to comment')}</button>`}`;
  const ci = $('#cmIn'); if (ci) { ci.value = keep; if (hadFocus) ci.focus(); }
}

/* ================= private chat ================= */
const chatIdOf = (a, b) => [a, b].sort().join('_');
const myChat = () => S.chats.find(c => c.id === chatIdOf(S.user.uid, S.chatWith));
const profileOf = uid => S.profiles.find(p => p.id === uid);
const unread = c => c.lastId && c.lastFrom !== S.user.uid && tsDate(c.lastAt) > tsDate(c.reads?.[S.user.uid] ?? 0);
const unreadCount = () => S.chats.filter(unread).length;
const EDIT_MS = 10 * 60 * 1000, EDIT_SAFE = 9.5 * 60 * 1000;
const canEditCm = m => m.createdAt?.toDate ? Date.now() - m.createdAt.toDate().getTime() < EDIT_SAFE : true;
const hm = x => tsDate(x).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

function startUserListeners() {
  if (S.unsubUser.length || !S.user) return;
  S.unsubUser.push(onSnapshot(query(collection(db, 'chats'), where('members', 'array-contains', S.user.uid)), s => {
    S.chats = s.docs.map(d => ({ id: d.id, ...d.data() })); renderTop();
    if (!S.chatsFirst) s.docChanges().forEach(ch => { const c = { id: ch.doc.id, ...ch.doc.data() }; if (ch.type === 'removed' || !c.lastId || c.lastFrom === S.user.uid || ch.doc.metadata.hasPendingWrites || !unread(c)) return; if (route() === 'chat/' + c.members.find(m => m !== S.user.uid)) return; const p = profileOf(c.lastFrom); toast('💬 ' + (p?.name || B('नया संदेश', 'New message')) + ': ' + c.lastText); sysNotify('💬 ' + (p?.name || 'Mera Gaav'), c.lastText); });
    S.chatsFirst = false;
    const r = route().split('/')[0]; if (r === 'chats') sched(); else if (r === 'chat') { ensureMsgSub(); markRead(); }
  }, e => console.warn('chats', e.code)));
  beat(); S.beatT = setInterval(() => { if (!document.hidden) beat(); }, 120000);
  document.addEventListener('visibilitychange', onVis);
}
/* presence: lastSeen heartbeat every 2 min while the app is visible */
const beat = () => {
  if (!S.user || !S.profile) return; const ref = doc(db, 'profiles', S.user.uid), base = { name: S.profile.name, ward: S.profile.ward || '' };
  // lastSeen ke saath; agar purane rules hain to bina lastSeen ke, taaki user chat list me dikhe
  setDoc(ref, { ...base, lastSeen: serverTimestamp() }, { merge: true }).catch(() => { if (!S.beatFallback) { S.beatFallback = true; setDoc(ref, base, { merge: true }).catch(e => console.warn('profile', e.code)); } });
};
const onVis = () => beat();
const isOnline = p => p?.lastSeen?.toDate && Date.now() - p.lastSeen.toDate().getTime() < 5 * 60000;
const seenLabel = p => !p?.lastSeen?.toDate ? '' : isOnline(p) ? '🟢 ' + B('ऑनलाइन', 'Online') : B('आखिरी बार ', 'Last seen ') + ago(p.lastSeen);
/* user list is loaded only when someone opens chat screens (saves reads) */
function ensureProfiles() {
  if (S.profLive || !S.user) return; S.profLive = true;
  S.unsubUser.push(onSnapshot(collection(db, 'profiles'), s => { S.profiles = s.docs.map(d => ({ id: d.id, ...d.data() })); if (route().startsWith('chat/')) refreshChatHead(); else if (route() === 'chats' && !document.activeElement?.matches?.('#uq')) sched(); else if (route() === 'chats') A.userQ($('#uq').value); }, e => console.warn('profiles', e.code)));
}
function stopUserListeners() { S.unsubUser.forEach(u => u()); S.unsubUser = []; S.profiles = []; S.chats = []; S.profLive = false; S.chatsFirst = true; clearInterval(S.beatT); document.removeEventListener('visibilitychange', onVis); leaveChat(); }

function userRow(p) { return `<div class="card chatrow" onclick="go('chat/${p.id}')" tabindex="0"><span class="av ${isOnline(p) ? 'on' : ''}">${esc((p.name || '?').trim()[0] || '?')}</span><span style="flex:1;min-width:0"><b>${esc(p.name)}</b><span class="muted" style="display:block;font-size:13px">${esc(p.ward || '')}${p.ward && seenLabel(p) ? ' · ' : ''}<span class="${isOnline(p) ? 'olive' : ''}">${seenLabel(p)}</span></span></span></div>`; }
const usersList = q => { const l = S.profiles.filter(p => p.id !== S.user.uid && (!q || (p.name || '').toLowerCase().includes(q.toLowerCase()))).sort((a, b) => (isOnline(b) - isOnline(a)) || (a.name || '').localeCompare(b.name || '', 'hi')); return l.length ? l.map(userRow).join('') : `<div class="empty">${S.profiles.length ? B('कोई यूज़र नहीं मिला', 'No users found') : '…'}</div>`; };
function chats() {
  if (!loggedIn()) return `<h1 class="h1">${B('निजी चैट', 'Private chat')}</h1>${loginPanel(B('गाँव के किसी से निजी बात करने के लिए लॉगिन करें।', 'Log in to chat privately with someone in the village.'))}`;
  ensureProfiles();
  const list = S.chats.slice().sort((a, b) => tsDate(b.lastAt) - tsDate(a.lastAt));
  return `<h1 class="h1">${B('निजी चैट', 'Private chat')}</h1><p class="muted" style="margin:6px 0 12px">${B('सिर्फ़ आप दोनों ये संदेश देख सकते हैं। 10 मिनट तक संदेश बदल सकते हैं, हटाना कभी भी।', 'Only the two of you can see these. Edit within 10 minutes, delete anytime.')}</p>
  <input class="input" id="uq" placeholder="🔍 ${B('गाँव के किसी को खोजिए…', 'Search anyone in the village…')}" oninput="A.userQ(this.value)" style="margin-bottom:12px" value="${esc(S.uq || '')}">
  <div id="recentChats">${list.length && !S.uq ? `<h2 class="h2" style="margin:6px 0 8px">${B('हाल की चैट', 'Recent chats')}</h2><div class="list">${list.map(c => { const o = c.members.find(m => m !== S.user.uid), p = profileOf(o), u = unread(c); return `<div class="card chatrow" onclick="go('chat/${o}')" tabindex="0"><span class="av ${isOnline(p) ? 'on' : ''}">${esc((p?.name || '?').trim()[0] || '?')}</span><span style="flex:1;min-width:0"><b>${esc(p?.name || '…')}</b><span class="muted clip1" style="display:block">${c.lastText ? (c.lastFrom === S.user.uid ? B('आप: ', 'You: ') : '') + esc(c.lastText) : B('संदेश हटाया गया', 'Message deleted')}</span></span><span class="muted" style="text-align:right;font-size:12px">${c.lastAt ? ago(c.lastAt) : ''}${u ? '<br><span class="dot" style="position:static;display:inline-grid">●</span>' : ''}</span></div>`; }).join('')}</div>` : ''}</div>
  <h2 class="h2" style="margin:18px 0 8px">${B('सभी गाँव वाले', 'Everyone in the village')} <span class="muted" style="font-size:14px" id="uCount">${S.profiles.length ? '(' + Math.max(0, S.profiles.length - 1) + ')' : ''}</span></h2><div class="list" id="userList">${usersList(S.uq || '')}</div>`;
}
function chat(uid) {
  if (!loggedIn()) return `<h1 class="h1">${B('निजी चैट', 'Private chat')}</h1>${loginPanel(B('चैट के लिए लॉगिन करें।', 'Log in to chat.'))}`;
  if (uid === S.user.uid) { setTimeout(() => go('chats'), 0); return ''; }
  ensureProfiles();
  const p = profileOf(uid);
  return `<div class="chatbox"><div class="chat-head"><button class="iconbtn" onclick="go('chats')" aria-label="Back">←</button><span class="av">${esc((p?.name || '?').trim()[0] || '?')}</span><div><b id="chatName">${esc(p?.name || '…')}</b><div class="muted ${isOnline(p) ? 'olive' : ''}" id="chatSub">${esc(seenLabel(p) || p?.ward || '')}</div></div></div>
  <div class="chint">${B('अपने संदेश पर टैप करें: 10 मिनट तक बदलें, हटाना कभी भी', 'Tap your message: edit within 10 minutes, delete anytime')}</div><div class="msgs" id="msgs"></div><div id="editBar"></div>
  <div class="composer"><textarea id="msgIn" rows="1" maxlength="2000" placeholder="${B('संदेश लिखिए…', 'Type a message…')}"></textarea><button class="btn btn-brand" id="sendMsg" onclick="A.sendMsg()" aria-label="Send">➤</button></div></div>`;
}
function refreshChatHead() { const p = profileOf(S.chatWith); if (p && $('#chatName')) { $('#chatName').textContent = p.name; $('#chatSub').innerHTML = esc(seenLabel(p) || p.ward || ''); $('#chatSub').className = 'muted ' + (isOnline(p) ? 'olive' : ''); } }
function enterChat(uid) {
  if (!uid || !S.user) return;
  if (S.chatWith !== uid) { leaveChat(); S.chatWith = uid; }
  renderMsgs(true); ensureMsgSub(); markRead();
  const t = $('#msgIn'); if (t && !t._bound) { t._bound = true; t.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && innerWidth > 760) { e.preventDefault(); A.sendMsg(); } }); t.addEventListener('input', () => { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 120) + 'px'; }); }
}
function leaveChat() { S.unsubMsgs?.(); S.unsubMsgs = null; S.subbedId = null; S.msgs = []; S.chatWith = null; S.editId = null; }
function ensureMsgSub(force) {
  if (!S.chatWith || !S.user) return; const id = chatIdOf(S.user.uid, S.chatWith);
  if (S.subbedId === id || (!force && !myChat())) return;
  S.unsubMsgs?.(); S.subbedId = id;
  S.unsubMsgs = onSnapshot(query(collection(db, 'chats', id, 'messages'), orderBy('createdAt', 'desc'), limit(150)), s => { S.msgs = s.docs.map(d => ({ id: d.id, ...d.data() })).reverse(); renderMsgs(); markRead(); }, e => { console.warn('msgs', e.code); S.subbedId = null; });
}
function markRead() {
  const c = S.chatWith && S.user ? myChat() : null;
  if (c && unread(c) && route().startsWith('chat/')) updateDoc(doc(db, 'chats', c.id), { ['reads.' + S.user.uid]: serverTimestamp() }).catch(() => {});
}
function renderMsgs(first) {
  const el = $('#msgs'); if (!el) return;
  const near = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  let last = '', html = '';
  for (const m of S.msgs) {
    const d = tsDate(m.createdAt), key = d.toDateString();
    if (key !== last) { last = key; const today = new Date().toDateString() === key; html += `<div class="day">${today ? B('आज', 'Today') : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</div>`; }
    const mine = m.from === S.user.uid;
    html += `<div class="b ${mine ? 'me' : 'them'} ${S.editId === m.id ? 'editing' : ''}" ${mine ? `onclick="A.msgMenu('${m.id}')" tabindex="0"` : ''}><span class="tx">${esc(m.text)}</span><span class="mt">${hm(m.createdAt)}${m.editedAt ? ' · ' + B('संपादित', 'edited') : ''}</span></div>`;
  }
  el.innerHTML = html || `<div class="empty"><big>👋</big>${B('अभी कोई संदेश नहीं। पहला संदेश भेजिए।', 'No messages yet. Say hello.')}</div>`;
  if (first || near) el.scrollTop = el.scrollHeight;
}
const canEdit = m => m.createdAt?.toDate ? Date.now() - m.createdAt.toDate().getTime() < EDIT_SAFE : true;
function editBar() { const b = $('#editBar'); if (!b) return; b.innerHTML = S.editId ? `<div class="editbar">✏️ ${B('संदेश बदल रहे हैं', 'Editing message')} <button class="btn btn-line btn-sm" onclick="A.cancelEdit()">✕</button></div>` : ''; }

/* ================= actions ================= */
const A = window.A = {
  closeModal, install: installApp,
  login() { needLogin(null, ''); },
  async shareApp() { const url = location.href.split('#')[0], text = B('मेरा गाँव — शिकायत, सूचना, मंडी भाव और गाँव बाज़ार एक जगह', 'Mera Gaav — issues, notices, mandi rates and the village market in one place'); if (navigator.share) navigator.share({ title: 'Mera Gaav', text, url }).catch(() => {}); else { navigator.clipboard?.writeText(url); toast(B('लिंक कॉपी हो गया', 'Link copied')); } },
  resetAuth() { S.authStep = 'phone'; openAuth(); },
  async sendOtp() {
    const ph = $('#phoneIn').value.trim(); if (!/^[6-9]\d{9}$/.test(ph)) return toast(B('सही 10 अंकों का मोबाइल नंबर डालें', 'Enter a valid 10-digit mobile number'));
    const btn = $('#sendBtn'); btn.disabled = true; btn.textContent = '…';
    try {
      resetRecaptcha();
      window.rv = new RecaptchaVerifier(auth, $('#recaptcha'), { size: 'invisible' });
      S.confirmation = await signInWithPhoneNumber(auth, '+91' + ph, window.rv);
      S.authStep = 'otp'; openAuth(); toast(B('OTP भेज दिया गया', 'OTP sent'));
    } catch (e) {
      console.error(e); resetRecaptcha();
      const msg = { 'auth/operation-not-allowed': B('इस क्षेत्र (India) के लिए SMS चालू नहीं है — Firebase में SMS region allow करें', 'SMS is not enabled for this region — allow India in Firebase SMS region policy'), 'auth/too-many-requests': B('बहुत बार कोशिश की, कुछ देर बाद फिर करें', 'Too many attempts, try again later'), 'auth/invalid-phone-number': B('नंबर सही नहीं है', 'Invalid number'), 'auth/captcha-check-failed': B('सुरक्षा जाँच विफल, पेज रीलोड करें', 'Security check failed, reload the page'), 'auth/billing-not-enabled': B('Firebase में Blaze प्लान चालू करना होगा', 'Firebase Blaze plan is required') }[e.code];
      toast(msg || (B('OTP नहीं भेज सके: ', 'Could not send OTP: ') + (e.code || e.message))); btn.disabled = false; btn.textContent = B('OTP भेजें', 'Send OTP');
    }
  },
  async google() {
    const btn = $('#gBtn'); btn.disabled = true;
    try { await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch (e) {
      console.error(e); btn.disabled = false;
      if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') return;
      toast(({ 'auth/operation-not-allowed': B('Firebase में Google sign-in चालू करें', 'Enable Google sign-in in Firebase'), 'auth/unauthorized-domain': B('यह डोमेन Firebase → Authorized domains में जोड़ें', 'Add this domain in Firebase → Authorized domains'), 'auth/popup-blocked': B('पॉपअप ब्लॉक है — अनुमति दें', 'Popup blocked — allow popups') })[e.code] || (B('Google लॉगिन विफल: ', 'Google login failed: ') + (e.code || e.message)));
    }
  },
  /* ---- chat actions ---- */
  newChat() { if (!needLogin(() => A.newChat(), B('चैट के लिए लॉगिन करें।', 'Log in to chat.'))) return; go('chats'); setTimeout(() => $('#uq')?.focus(), 150); },
  userQ(v) { S.uq = v; const l = $('#userList'); if (l) l.innerHTML = usersList(v); const r = $('#recentChats'); if (r) r.style.display = v ? 'none' : ''; const n = $('#uCount'); if (n) n.textContent = S.profiles.length ? '(' + Math.max(0, S.profiles.length - 1) + ')' : ''; },
  pickChat(uid) { closeModal(); go('chat/' + uid); },
  async sendMsg() {
    const t = $('#msgIn'), text = t.value.trim(); if (!text || !S.chatWith) return;
    const me = S.user.uid, other = S.chatWith, id = chatIdOf(me, other), btn = $('#sendMsg'); btn.disabled = true;
    try {
      if (S.editId) {
        const m = S.msgs.find(x => x.id === S.editId); if (!m) throw new Error('gone');
        if (!canEdit(m)) { S.editId = null; editBar(); renderMsgs(); toast(B('10 मिनट बीत चुके — अब संदेश बदला नहीं जा सकता', 'More than 10 minutes passed — editing is closed')); t.value = ''; return; }
        await updateDoc(doc(db, 'chats', id, 'messages', m.id), { text, editedAt: serverTimestamp() });
        if (myChat()?.lastId === m.id) await updateDoc(doc(db, 'chats', id), { lastText: text.slice(0, 80) });
        S.editId = null; editBar();
      } else {
        if (!myChat()) { await setDoc(doc(db, 'chats', id), { members: [me, other].sort(), lastText: '', lastAt: serverTimestamp(), lastFrom: me, lastId: '', reads: { [me]: serverTimestamp() } }); ensureMsgSub(true); }
        const ref = await addDoc(collection(db, 'chats', id, 'messages'), { from: me, text, createdAt: serverTimestamp() });
        await updateDoc(doc(db, 'chats', id), { lastText: text.slice(0, 80), lastAt: serverTimestamp(), lastFrom: me, lastId: ref.id, ['reads.' + me]: serverTimestamp() });
      }
      t.value = ''; t.style.height = 'auto'; t.focus();
    } catch (e) { console.error(e); toast(e.code === 'permission-denied' ? B('भेज नहीं सके — समय बीत गया या आप ब्लॉक हैं', 'Could not send — time passed or you are blocked') : (B('भेज नहीं सके: ', 'Could not send: ') + (e.code || e.message))); }
    finally { btn.disabled = false; }
  },
  msgMenu(mid) {
    const m = S.msgs.find(x => x.id === mid); if (!m || m.from !== S.user.uid) return; const ce = canEdit(m);
    openModal(`<div class="row between"><h3 style="font-size:22px">${B('आपका संदेश', 'Your message')}</h3><button class="iconbtn" onclick="A.closeModal()" aria-label="Close">✕</button></div><p class="quote">${esc(m.text)}</p>
    ${ce ? `<button class="btn btn-brand btn-block" onclick="A.editMsg('${mid}')">✏️ ${B('संदेश बदलें', 'Edit message')}</button><p class="muted" style="margin:6px 0 10px">${B('भेजने के 10 मिनट तक बदल सकते हैं।', 'You can edit for 10 minutes after sending.')}</p>` : `<p class="muted" style="margin:0 0 10px">${B('10 मिनट बीत चुके, अब सिर्फ़ हटा सकते हैं।', '10 minutes have passed — you can only delete now.')}</p>`}
    <button class="btn btn-red btn-block" onclick="A.delMsg('${mid}')">🗑️ ${B('संदेश हटाएँ (दोनों तरफ़ से)', 'Delete message (for both)')}</button><button class="btn btn-line btn-block" style="margin-top:8px" onclick="navigator.clipboard?.writeText(S_text('${mid}'));A.closeModal()">📋 ${B('कॉपी करें', 'Copy')}</button>`);
  },
  editMsg(mid) { const m = S.msgs.find(x => x.id === mid); if (!m) return; closeModal(); S.editId = mid; editBar(); renderMsgs(); const t = $('#msgIn'); t.value = m.text; t.focus(); },
  cancelEdit() { S.editId = null; editBar(); renderMsgs(); const t = $('#msgIn'); if (t) t.value = ''; },
  async delMsg(mid) {
    if (!confirm(B('यह संदेश दोनों तरफ़ से हट जाएगा। हटाएँ?', 'This message will be removed for both of you. Delete?'))) return;
    const id = chatIdOf(S.user.uid, S.chatWith);
    try { await deleteDoc(doc(db, 'chats', id, 'messages', mid)); if (myChat()?.lastId === mid) await updateDoc(doc(db, 'chats', id), { lastText: '', lastId: '' }); if (S.editId === mid) { S.editId = null; editBar(); } closeModal(); toast(B('संदेश हटा दिया गया', 'Message deleted')); } catch (e) { toast(e.message); }
  },
  async verifyOtp() {
    const code = $('#otpIn').value.trim(); if (code.length !== 6) return toast(B('6 अंकों का OTP डालें', 'Enter the 6-digit OTP'));
    const btn = $('#verBtn'); btn.disabled = true;
    try { await S.confirmation.confirm(code); } catch (e) { toast(B('OTP गलत है या पुराना हो गया', 'Wrong or expired OTP')); btn.disabled = false; }
  },
  async saveProfile() {
    const name = $('#obName').value.trim(); if (name.length < 2) return toast(B('अपना नाम लिखिए', 'Enter your name'));
    const typed = ($('#obPhone')?.value || '').trim(); if (typed && !/^[6-9]\d{9}$/.test(typed)) return toast(B('सही 10 अंकों का नंबर डालिए या खाली छोड़िए', 'Enter a valid 10-digit number or leave it empty'));
    const p = { name, ward: $('#obWard').value, phone: S.user.phoneNumber || (typed ? '+91' + typed : ''), email: S.user.email || '', role: 'resident', createdAt: serverTimestamp() };
    try { await setDoc(doc(db, 'users', S.user.uid), p); S.profile = { ...p }; startUserListeners(); finishLogin(); } catch (e) { toast(e.message); }
  },
  async updateProfile() {
    const name = $('#pName').value.trim(), ward = $('#pWard').value; if (name.length < 2) return;
    try { await updateDoc(doc(db, 'users', S.user.uid), { name, ward }); await setDoc(doc(db, 'profiles', S.user.uid), { name, ward }, { merge: true }); S.profile.name = name; S.profile.ward = ward; toast(B('सेव हो गया ✅', 'Saved ✅')); renderAll(); } catch (e) { toast(e.message); }
  },
  async logout() { stopUserListeners(); await signOut(auth); S.profile = null; go('home'); renderAll(); },
  setF(k, v) { S.f[k] = v; render(true); },
  setQ(v) { S.f.q = v; const l = $('#feedList'); if (l) l.innerHTML = listHtml(filtered(route() === 'mine' ? S.complaints.filter(c => c.uid === S.user?.uid) : S.complaints)); },
  setBf(v) { S.bf = v; render(true); },
  pick(inp) { for (const f of inp.files) if (S.pending.length < 3) S.pending.push(f); inp.value = ''; renderPrev(); },
  rmPhoto(i) { S.pending.splice(i, 1); renderPrev(); },
  gps() { if (!navigator.geolocation) return toast('GPS not supported'); $('#gpsInfo').textContent = '…'; navigator.geolocation.getCurrentPosition(p => { S.geo = { lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6) }; $('#gpsInfo').textContent = B('✅ लोकेशन जुड़ गई', '✅ Location added'); }, () => { $('#gpsInfo').textContent = ''; toast(B('लोकेशन की अनुमति दीजिए', 'Please allow location')); }, { enableHighAccuracy: true, timeout: 10000 }); },
  voice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) return toast(B('इस ब्राउज़र में वॉइस सपोर्ट नहीं है', 'Voice is not supported here'));
    const r = new SR(); r.lang = lang === 'hi' ? 'hi-IN' : 'en-IN'; r.onresult = e => { const d = $('#f_desc'); d.value = (d.value + ' ' + e.results[0][0].transcript).trim(); }; r.onerror = () => toast(B('सुन नहीं पाया, दोबारा बोलिए', 'Could not hear, try again')); r.start(); toast(B('बोलिए… 🎙️', 'Listening… 🎙️'));
  },
  async submitReport() {
    const loc = $('#f_loc').value.trim(), desc = $('#f_desc').value.trim();
    if (!loc || desc.length < 10) return toast(B('जगह और कम से कम 10 अक्षर का विवरण लिखिए', 'Add a location and a description (10+ characters)'));
    if (!needLogin(() => A.submitReport(), B('शिकायत जमा करने के लिए मोबाइल नंबर पक्का करना होगा। आपका भरा हुआ फ़ॉर्म वैसा ही रहेगा।', 'Verify your mobile number to submit. Your form stays as it is.'))) return;
    const btn = $('#subBtn'); btn.disabled = true; btn.textContent = B('जमा हो रहा है…', 'Submitting…');
    try {
      const photos = await uploadPhotos(S.pending);
      const tk = 'MG-' + new Date().getFullYear() + '-' + String(Math.floor(Math.random() * 900000) + 100000);
      const data = { ticket: tk, uid: S.user.uid, name: S.profile.name, category: $('#f_cat').value, ward: $('#f_ward').value, location: loc, description: desc, urgency: $('#f_urg').value, photos, status: 'Submitted', upvoters: [], history: [{ s: 'Submitted', note: '', at: Date.now() }], createdAt: serverTimestamp() };
      if (S.geo) data.geo = S.geo;
      const cref = await addDoc(collection(db, 'complaints'), data); emit('issue', B('नई शिकायत: ', 'New issue: ') + catLabel(data.category), desc.slice(0, 120), 'c:' + cref.id);
      S.pending = []; S.geo = null; toast(B('शिकायत दर्ज हुई: ', 'Submitted: ') + tk); go('mine');
    } catch (e) { console.error(e); toast(B('दर्ज नहीं हो सकी: ', 'Could not submit: ') + e.message); btn.disabled = false; btn.textContent = B('शिकायत जमा करें', 'Submit issue'); }
  },
  openComplaint(id) {
    S.openId = id; S.comments = []; S.unsubCm?.();
    if (configured) S.unsubCm = onSnapshot(query(collection(db, 'complaints', id, 'comments'), orderBy('createdAt', 'asc')), s => { S.comments = s.docs.map(d => ({ id: d.id, ...d.data() })); refreshDetail(); });
    openModal(''); S.authOpen = false; refreshDetail();
  },
  async upvote(id) {
    if (!needLogin(() => { A.openComplaint(id); A.upvote(id); }, B('समर्थन देने के लिए लॉगिन करें।', 'Log in to back this issue.'))) return;
    const c = S.complaints.find(x => x.id === id), has = (c.upvoters || []).includes(S.user.uid);
    try { await updateDoc(doc(db, 'complaints', id), { upvoters: has ? arrayRemove(S.user.uid) : arrayUnion(S.user.uid) }); } catch (e) { toast(e.message); }
  },
  needComment(id) { needLogin(() => A.openComplaint(id), B('टिप्पणी करने के लिए लॉगिन करें।', 'Log in to comment.')); },
  async comment(id) {
    const inp = $('#cmIn'), t = inp.value.trim(); if (!t) return;
    try {
      if (S.editCm) {
        const m = (S.comments || []).find(x => x.id === S.editCm); if (!m) throw new Error('gone');
        if (!canEditCm(m)) { S.editCm = null; refreshDetail(); return toast(B('10 मिनट बीत चुके — अब टिप्पणी बदली नहीं जा सकती, सिर्फ़ हटा सकते हैं', '10 minutes passed — you can only delete now')); }
        await updateDoc(doc(db, 'complaints', id, 'comments', m.id), { text: t, editedAt: serverTimestamp() }); S.editCm = null; inp.value = '';
      } else {
        const d = { uid: S.user.uid, name: S.profile.name, admin: isAdmin(), text: t, createdAt: serverTimestamp() };
        if (S.replyTo) d.replyTo = { id: S.replyTo.id, name: S.replyTo.name, text: S.replyTo.text.slice(0, 80) };
        const rt = S.replyTo; S.replyTo = null; inp.value = '';
        await addDoc(collection(db, 'complaints', id, 'comments'), d);
        const c = S.complaints.find(x => x.id === id); emit('comment', S.profile.name + B(' ने टिप्पणी की', ' commented') + (c ? ' · ' + c.ticket : ''), (rt ? '↩ ' + rt.name + ': ' : '') + t.slice(0, 120), 'c:' + id);
      }
      refreshDetail();
    } catch (e) { console.error(e); toast(e.code === 'permission-denied' ? B('टिप्पणी नहीं हो सकी — समय बीत गया या आप ब्लॉक हैं', 'Could not save — time passed or you are blocked') : e.message); }
  },
  reply(mid) { const m = (S.comments || []).find(x => x.id === mid); if (!m) return; S.editCm = null; S.replyTo = { id: m.id, name: m.name, text: m.text }; refreshDetail(); $('#cmIn')?.focus(); },
  cancelReply() { S.replyTo = null; S.editCm = null; const i = $('#cmIn'); if (i) i.value = ''; refreshDetail(); },
  editCm(mid) { const m = (S.comments || []).find(x => x.id === mid); if (!m || !canEditCm(m)) return toast(B('10 मिनट बीत चुके', '10 minutes passed')); S.replyTo = null; S.editCm = mid; refreshDetail(); const i = $('#cmIn'); i.value = m.text; i.focus(); },
  async delCm(mid) { if (!confirm(B('यह टिप्पणी हटाएँ?', 'Delete this comment?'))) return; try { await deleteDoc(doc(db, 'complaints', S.openId, 'comments', mid)); if (S.editCm === mid) S.editCm = null; toast(B('हटा दी गई', 'Deleted')); } catch (e) { toast(e.message); } },
  editComplaint(id) {
    const c = S.complaints.find(x => x.id === id); if (!c) return; S.unsubCm?.(); S.unsubCm = null;
    openModal(`<div class="row between"><h3 style="font-size:22px">${B('शिकायत बदलें', 'Edit issue')}</h3><button class="iconbtn" onclick="A.closeModal()" aria-label="Close">✕</button></div><div class="form-grid" style="grid-template-columns:1fr;margin-top:12px"><div class="field"><label>${B('श्रेणी', 'Category')}</label><select id="e_cat">${CATS.map(k => `<option value="${k[0]}" ${c.category === k[0] ? 'selected' : ''}>${k[1]} ${B(k[2], k[3])}</option>`).join('')}</select></div><div class="field"><label>${B('वार्ड', 'Ward')}</label><select id="e_ward">${wardOpts(c.ward)}</select></div><div class="field"><label>${B('जगह', 'Location')}</label><input id="e_loc" value="${esc(c.location)}"></div><div class="field"><label>${B('समस्या', 'Problem')}</label><textarea id="e_desc">${esc(c.description)}</textarea></div><div class="field"><label>${B('कितनी जरूरी?', 'Urgency')}</label><select id="e_urg">${['low', 'medium', 'high'].map(u => `<option value="${u}" ${c.urgency === u ? 'selected' : ''}>${B(...URG[u])}</option>`).join('')}</select></div></div><button class="btn btn-brand btn-block" style="margin-top:14px" onclick="A.saveComplaint('${id}')">${B('सेव करें', 'Save')}</button>`);
    S.openId = null;
  },
  async saveComplaint(id) {
    const d = { category: $('#e_cat').value, ward: $('#e_ward').value, location: $('#e_loc').value.trim(), description: $('#e_desc').value.trim(), urgency: $('#e_urg').value, editedAt: serverTimestamp() };
    if (!d.location || d.description.length < 10) return toast(B('जगह और कम से कम 10 अक्षर का विवरण लिखिए', 'Add a location and a description (10+ characters)'));
    try { await updateDoc(doc(db, 'complaints', id), d); closeModal(); toast(B('शिकायत अपडेट हो गई ✅', 'Issue updated ✅')); } catch (e) { toast(e.code === 'permission-denied' ? B('सिर्फ़ शिकायत करने वाला ही बदल सकता है', 'Only the person who reported it can edit') : e.message); }
  },
  async delMine(id) {
    if (!confirm(B('यह शिकायत और उसकी सारी टिप्पणियाँ हमेशा के लिए हट जाएँगी। पक्का?', 'This issue and all its comments will be deleted for good. Sure?'))) return;
    try { const cs = await getDocs(collection(db, 'complaints', id, 'comments')); for (const x of cs.docs) await deleteDoc(x.ref); await deleteDoc(doc(db, 'complaints', id)); closeModal(); toast(B('शिकायत हटा दी गई', 'Issue deleted')); } catch (e) { toast(e.message); }
  },
  async enableNotif() { try { const p = await Notification.requestPermission(); toast(p === 'granted' ? B('नोटिफिकेशन चालू ✅', 'Notifications on ✅') : B('अनुमति नहीं मिली', 'Permission not granted')); render(); } catch (_) {} },
  openEvent(l) { if (l.startsWith('c:')) A.openComplaint(l.slice(2)); else if (l) go(l); },
  async share(id) { const c = S.complaints.find(x => x.id === id), text = `${c.ticket}: ${c.description.slice(0, 100)} — ${VILLAGE.name}`; if (navigator.share) navigator.share({ title: 'Mera Gaav', text, url: location.href.split('#')[0] }).catch(() => {}); else { navigator.clipboard?.writeText(text); toast(B('कॉपी हो गया', 'Copied')); } },
  async setStatus(id, status) {
    const note = prompt(B('नोट (वैकल्पिक) — नागरिक को दिखेगा', 'Note (optional), visible to the resident'), '') ?? '';
    try { await updateDoc(doc(db, 'complaints', id), { status, history: arrayUnion({ s: status, note, at: Date.now(), by: S.profile.name }) }); toast(B('अपडेट हो गया', 'Updated')); } catch (e) { toast(e.message); }
  },
  async del(col, id, close) {
    if (!confirm(B('पक्का हटाएँ?', 'Delete this?'))) return;
    try { if (col === 'bazaar') { try { await deleteDoc(doc(db, 'bazaar', id, 'private', 'contact')); } catch (_) {} } await deleteDoc(doc(db, col, id)); if (close) closeModal(); toast(B('हटाया गया', 'Deleted')); } catch (e) { toast(e.message); }
  },
  async vote(pid, opt) {
    if (!needLogin(() => A.vote(pid, opt), B('वोट देने के लिए लॉगिन करें। एक आदमी, एक वोट।', 'Log in to vote. One person, one vote.'))) return;
    try { await setDoc(doc(db, 'polls', pid, 'votes', S.user.uid), { opt, createdAt: serverTimestamp() }); toast(B('वोट दर्ज ✅', 'Vote recorded ✅')); } catch (e) { toast(B('आप वोट दे चुके हैं', 'You have already voted')); }
  },
  async closePoll(id) { await updateDoc(doc(db, 'polls', id), { open: false }); },
  async sold(id, v) { await updateDoc(doc(db, 'bazaar', id), { sold: v }); },
  async contact(id, how) {
    if (!needLogin(() => A.contact(id, how), B('विक्रेता का नंबर देखने के लिए लॉगिन करें।', 'Log in to see the seller’s number.'))) return;
    try { const s = await getDoc(doc(db, 'bazaar', id, 'private', 'contact')), ph = s.data()?.phone; if (!ph) return toast(B('नंबर उपलब्ध नहीं', 'Number not available')); if (how === 'call') location.href = 'tel:' + ph; else window.open('https://wa.me/' + ph.replace(/\D/g, ''), '_blank', 'noopener'); } catch (e) { toast(e.message); }
  },
  adminForm(type) {
    if (type === 'bazaar' && !needLogin(() => A.adminForm('bazaar'), B('विज्ञापन डालने के लिए लॉगिन करें।', 'Log in to post a listing.'))) return;
    const F = {
      notice: [B('नई सूचना', 'New notice'), [['title', 'शीर्षक / Title'], ['body', 'विवरण / Details', 'textarea'], ['date', 'तारीख/समय (वैकल्पिक)'], ['type', 'प्रकार', 'select', ['general', 'meeting', 'urgent']], ['pinned', 'ऊपर पिन करें', 'select', ['no', 'yes']]]],
      poll: [B('नया मतदान', 'New poll'), [['q', 'सवाल / Question'], ['options', 'विकल्प (हर लाइन में एक)', 'textarea']]],
      directory: [B('संपर्क जोड़ें', 'Add contact'), [['name', 'नाम / संस्था'], ['role', 'पद / विभाग'], ['phone', 'फ़ोन नंबर']]],
      mandi: [B('मंडी भाव जोड़ें', 'Add mandi rate'), [['crop', 'फसल'], ['price', 'भाव (₹)'], ['unit', 'इकाई (क्विंटल/किलो)'], ['mandi', 'मंडी का नाम']]],
      bazaar: [B('विज्ञापन डालें', 'Post listing'), [['type', 'प्रकार', 'select', Object.keys(BZ)], ['title', 'शीर्षक'], ['price', 'कीमत ₹ (वैकल्पिक)'], ['desc', 'विवरण', 'textarea'], ['phone', 'फ़ोन नंबर (खरीदार कॉल करेंगे)'], ['photo', 'फोटो', 'file']]]
    }[type];
    S.formType = type; S.authOpen = false;
    openModal(`<div class="row between"><h3 style="font-size:24px">${F[0]}</h3><button class="iconbtn" onclick="A.closeModal()" aria-label="Close">✕</button></div><div class="form-grid" style="grid-template-columns:1fr;margin-top:12px">${F[1].map(([k, l, t, o]) => `<div class="field"><label>${l}</label>${t === 'textarea' ? `<textarea id="af_${k}"></textarea>` : t === 'select' ? `<select id="af_${k}">${o.map(x => `<option>${x}</option>`).join('')}</select>` : t === 'file' ? `<input id="af_${k}" type="file" accept="image/*" multiple>` : `<input id="af_${k}">`}</div>`).join('')}</div>${type === 'bazaar' ? `<p class="muted">${B('आपका नंबर सिर्फ़ लॉगिन किए हुए लोगों को दिखेगा।', 'Your number is shown only to logged-in users.')}</p>` : ''}<button class="btn btn-brand btn-block" style="margin-top:14px" id="afBtn" onclick="A.saveAdmin()">${B('सेव करें', 'Save')}</button>`);
  },
  async saveAdmin() {
    const type = S.formType, v = k => ($('#af_' + k)?.value || '').trim(), btn = $('#afBtn'); btn.disabled = true;
    try {
      let d, col = type === 'notice' ? 'notices' : type === 'poll' ? 'polls' : type;
      if (type === 'notice') { if (!v('title')) throw new Error(B('शीर्षक लिखिए', 'Add a title')); d = { title: v('title'), body: v('body'), date: v('date'), type: v('type'), pinned: v('pinned') === 'yes', by: S.profile.name }; }
      if (type === 'poll') { const o = v('options').split('\n').map(x => x.trim()).filter(Boolean); if (!v('q') || o.length < 2) throw new Error(B('सवाल और कम से कम 2 विकल्प चाहिए', 'Need a question and 2+ options')); d = { q: v('q'), options: o.slice(0, 6), open: true }; }
      if (type === 'directory') { if (!v('name') || !v('phone')) throw new Error(B('नाम और फ़ोन लिखिए', 'Add a name and phone')); d = { name: v('name'), role: v('role'), phone: v('phone') }; }
      if (type === 'mandi') { if (!v('crop') || !v('price')) throw new Error(B('फसल और भाव लिखिए', 'Add a crop and price')); d = { crop: v('crop'), price: v('price'), unit: v('unit') || 'क्विंटल', mandi: v('mandi') }; }
      if (type === 'bazaar') { if (!v('title')) throw new Error(B('शीर्षक लिखिए', 'Add a title')); const files = [...($('#af_photo').files || [])].slice(0, 3); d = { uid: S.user.uid, name: S.profile.name, type: v('type'), title: v('title'), price: v('price'), desc: v('desc'), photos: await uploadPhotos(files), sold: false }; const ph = (v('phone') || S.profile.phone || S.user.phoneNumber || '').replace(/[\s-]/g, ''); if (!/^(\+91)?[6-9]\d{9}$/.test(ph)) throw new Error(B('सही 10 अंकों का फ़ोन नंबर लिखिए', 'Enter a valid 10-digit phone number')); d._ph = ph.startsWith('+') ? ph : '+91' + ph; }
      const phoneForDoc = d._ph; delete d._ph; d.createdAt = serverTimestamp(); const ref = await addDoc(collection(db, col), d);
      if (type === 'bazaar') { await setDoc(doc(db, 'bazaar', ref.id, 'private', 'contact'), { phone: phoneForDoc }); emit('bazaar', B('बाज़ार में नया: ', 'New in bazaar: ') + d.title, d.price ? '₹' + d.price : '', 'bazaar'); }
      if (isAdmin() && type !== 'bazaar') emit(type === 'poll' ? 'poll' : type, ({ notice: '📢 ', poll: '🗳️ ', directory: '☎️ ', mandi: '🌾 ' }[type] || '') + (d.title || d.q || d.name || d.crop + ' ₹' + d.price), d.body || '', ({ notice: 'notices', poll: 'polls', directory: 'directory', mandi: 'mandi' })[type]);
      closeModal(); toast(B('सेव हो गया ✅', 'Saved ✅'));
    } catch (e) { toast(e.message); btn.disabled = false; }
  },
  csv() {
    const rows = [['Ticket', 'Category', 'Ward', 'Location', 'Resident', 'Status', 'Urgency', 'Upvotes', 'Description', 'Date']].concat(S.complaints.map(c => [c.ticket, c.category, c.ward, c.location, c.name, c.status, c.urgency, (c.upvoters || []).length, c.description, tsDate(c.createdAt).toISOString().slice(0, 10)]));
    const csv = '﻿' + rows.map(r => r.map(x => '"' + String(x ?? '').replace(/"/g, '""') + '"').join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'complaints.csv'; a.click();
  }
};
window.S = S; window.go = go; window.$ = $; window.S_text = id => S.msgs.find(m => m.id === id)?.text || '';

renderTop();
render();
