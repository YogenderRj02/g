# Mera Gaav v2 — Setup Guide (Hinglish)

**Naya:** website ab bina login ke khuli hai (feed, notices, mandi, bazaar, polls dekh sakte hain, app install bhi). Login sirf tab maanga jaata hai jab user shikayat jama kare, vote de, comment/support kare, ya bazaar me vishyapan dale ya seller ka number dekhe. Firebase keys dale bina app **demo data** ke saath khulti hai taaki design dekh sako.

> Rules badle hain (public read). Purani rules ki jagah `firestore.rules` dobara **Publish** karna zaroori hai, warna guest ko data nahi dikhega.

Is app me: phone-OTP login, Firebase Firestore database, Google Drive me photos, mobile install (PWA), aur admin panel.

## Step 1 — Firebase project banao
1. https://console.firebase.google.com par jao → **Add project**.
2. **Build → Authentication → Get started → Sign-in method → Phone → Enable**.
3. **Authentication → Settings → Authorized domains** me wo domain add karo jahan app host karoge (Firebase Hosting domain automatic hota hai).
4. **Build → Firestore Database → Create database** (production mode, region `asia-south1` Mumbai).
5. Firestore → **Rules** tab me `firestore.rules` file ka poora content paste karke **Publish** karo.
6. **Project settings → Your apps → Web (</>)** → app register karo → jo `firebaseConfig` mile use `firebase-config.js` me paste karo.

> Dhyan: Phone OTP SMS real numbers par bhejne ke liye Firebase ka **Blaze (pay-as-you-go)** plan chahiye hota hai. Testing ke liye **Authentication → Phone → Phone numbers for testing** me fake number + OTP add kar sakte ho (free).

## Step 2 — Index (agar console me error aaye)
Pehli baar app chalane par agar browser console me "requires an index" link aaye, to us link par click karke index bana do. (Is app me sirf single-field `createdAt` ordering hai, aam taur par zarurat nahi padti.)

## Step 3 — Photos Google Drive me (Apps Script)
1. Google Drive me ek folder banao (jaise `MeraGaav-Photos`). Folder URL ke aakhir ka ID copy karo.
2. https://script.google.com → **New project** → `drive-upload.gs` ka code paste karo.
3. Upar `FOLDER_ID` aur `FIREBASE_API_KEY` bharo.
4. **Deploy → New deployment → Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Authorize karo, phir mila hua **Web app URL** `firebase-config.js` ke `DRIVE_UPLOAD_URL` me daalo.

Security: upload sirf wahi kar sakta hai jiske paas valid Firebase login token ho (script token verify karti hai). Photos "link wale sabhi dekh sakte hain" par save hoti hain, taaki app me dikh sakein.

## Step 4 — Apne gaav ki jaankari
`firebase-config.js` me `VILLAGE` (naam, rajya, wards ki sankhya) badlo.

## Step 5 — Hosting (install button ke liye HTTPS zaroori)
Sabse aasan: Firebase Hosting
```
npm i -g firebase-tools
firebase login
firebase init hosting     # public folder = is project ka folder, single-page app = No
firebase deploy
```
Alternative: Netlify / Vercel / GitHub Pages par folder upload kar do.

## Step 6 — Pehla Admin banao
1. App me apne number se login karke profile bana lo.
2. Firebase Console → Firestore → `users` → apna document (UID wala) → field `role` ko `"admin"` karo.
3. App reload karo — **Admin panel** dikhega (shikayat status badalna, notice, poll, contacts, mandi bhav, CSV export).

## Mobile par install
- **Android Chrome**: app khulne par upar **📲 Install** button dikhega (ya Profile me). Dabao.
- **iPhone Safari**: Share → **Add to Home Screen**.

## Naye features (aapne puchha tha)
- Phone OTP se signup/login, har user ka apna profile
- Photos (3 tak) + GPS location + bol kar shikayat likhna (voice)
- Gaav feed, "mujhe bhi yehi problem hai" upvote, comments, status timeline
- Urgent shikayat flag, search + filters
- Panchayat notices (pin / meeting / urgent), gaav polls (ek user = ek vote)
- Gaav Bazaar (bikri, kiraya, kaam, khoya-paya) with Call/WhatsApp
- Mandi bhav, zaruri numbers + 112 SOS button, sarkari yojana links
- Dark mode, Hindi/English toggle, offline shell (service worker)
- Admin: dashboard, category chart, CSV export

## Aage ke ideas
Push notifications (Firebase Cloud Messaging), multiple villages, Gram Sabha attendance, certificate requests.


## Guest vs login (v2)
| Guest (bina login) | Login chahiye |
|---|---|
| Home, feed, notices, polls results, mandi, bazaar listings, directory, schemes, install | Shikayat jama karna, vote, support/comment, bazaar post, seller ka phone dekhna, profile |

Bazaar me seller ka number alag private document me rakha jaata hai (`bazaar/{id}/private/contact`), isliye guest ko nahi dikhta.

## OTP error aaye to (Troubleshooting)
- **`auth/operation-not-allowed` — "SMS unable to be sent until this region enabled"**: Firebase Console → Authentication → **Settings → SMS region policy** → **Allow** → India (+91) chunke save karo. (Phone sign-in method bhi Enabled hona chahiye.)
- **`auth/billing-not-enabled`**: asli numbers par SMS ke liye Blaze plan chahiye. Tab tak Authentication → Sign-in method → Phone → **Phone numbers for testing** me apna number aur 6-digit code daal kar free me test karo.
- **`auth/unauthorized-domain`**: Authentication → Settings → **Authorized domains** me apni site ka domain add karo.
- **`auth/too-many-requests`**: kuch der baad dobara try karo, ya testing numbers use karo.
- Console me "Banner not shown: beforeinstallpromptevent.preventDefault()" sirf information hai — app apna khud ka Install button dikhati hai, error nahi.

## Free login: Google sign-in (SMS ke bina)
India me asli SMS OTP free nahi hota (har SMS ka paisa lagta hai). Isliye app me **"Google se jaari rakhein"** button bhi hai — ye bilkul free hai, koi SMS nahi, koi Blaze plan nahi.

Setup (2 minute):
1. Firebase Console → **Authentication → Sign-in method → Google → Enable** → project support email chuno → Save.
2. **Authentication → Settings → Authorized domains** me apni site ka domain jodo (jaise `yourapp.web.app`).
3. Bas. App me login sheet me Google button aa jayega.

Google se login karne wale ko profile banate waqt mobile number *optional* poochha jaata hai (sirf bazaar ke liye, bina verify kiya hua). Bazaar me post karte waqt number zaroori hai.

## SMS OTP ka kharcha (agar chahiye)
- Firebase: roz ke pehle ~10 SMS free (ek 2026 ke article ke anusaar), uske baad India me lagbhag $0.07 per SMS, aur Blaze plan zaroori. Pehle Firebase ki official pricing page par confirm karo.
- Testing ke liye hamesha free: Authentication → Phone → **Phone numbers for testing**.
- Sasta India option: MessageCentral jaise providers (~Rs 0.30 per OTP, DLT unki taraf se). Isme alag backend lagega — chahiye to bolo.


# v3: Alag Admin Panel + Private Chat

## 1) Rules dobara Publish karo (zaroori)
`firestore.rules` naye features ke liye badli hai (chat, blocked users, profiles). Firebase Console → Firestore → Rules me poora naya content paste karke **Publish** karo. Bina iske chat aur admin ke naye kaam "permission denied" denge.

## 2) Admin Panel (alag page: `admin.html`)
- Link: `apni-site/admin.html` (ya app me Profile → Admin → "एडमिन पैनल खोलें").
- Login usi account se jo `users/<UID>` me `role = admin` ho (pehla admin Console se banta hai, upar Step 6 dekho).
- Tabs: **डैशबोर्ड** (KPIs, 7-din chart, status/category), **शिकायतें** (search, filter, status+note, edit, delete, comments delete, CSV), **सूचनाएँ / मतदान / संपर्क / मंडी भाव** (add, edit, delete), **बाज़ार** (edit, sold, delete), **यूज़र** (Admin banana/hatana, block/unblock, record hatana, CSV).
- Poll me vote padne ke baad sirf sawal edit hota hai (vikalp lock), taaki results na bigdein.
- Admin khud ko demote/block nahi kar sakta.
- Ye page `noindex` hai, par asli suraksha Firestore rules se hai: admin na hone par kuch nahi dikhta.

## 3) Private Chat
- Login ke baad header me 💬 button (unread count ke saath) ya Services → "निजी चैट".
- "नई चैट" → gaav ke sabhi users ki list (naam se search) → kisi ko chuno → baat shuru.
- Apne message par tap: **10 minute tak edit**, **delete kabhi bhi** (dono taraf se hat jaata hai). 10 minute ka niyam server rules me bhi laga hai, sirf screen par nahi.
- Chat sirf dono logon ko dikhti hai — admin ko bhi nahi (rules me admin ka access nahi hai).
- Dhyan: ye end-to-end encrypted nahi hai. Firebase project ka owner Console me data dekh sakta hai. Users ko ye bata do.
- Blocked user (admin ne block kiya) chat, shikayat, comment, vote, bazaar post nahi kar sakta.
- Chat ke liye users ke **naam aur ward** ki ek public list (`profiles`) banti hai, jo sirf login kiye logon ko dikhti hai. Phone/email isme nahi hai. Purane users ki entry unke agle login par apne-aap ban jaati hai.


# v4: Notifications, Comments, Presence, Admin redesign

## 1) Rules dobara Publish karo (zaroori)
`firestore.rules` badli hai (naya `events` collection, comment edit/delete, admin issue delete nahi kar sakta, `lastSeen`). Console → Firestore → Rules → poora paste → **Publish**. Bina iske comment edit, notifications aur online status "permission denied" denge.

## 2) Kya naya hai
- **Admin**: shikayat DELETE ya uska text edit nahi kar sakta. Sirf **progress** (status + note) badalta hai. Sirf shikayat karne wala apni shikayat edit/delete kar sakta hai (kisi bhi status me). Admin comments moderation ke liye hata sakta hai.
- **Admin tabs** ab link hain: `admin.html#/polls`, `#/complaints`, `#/users` ... (refresh/bookmark par bhi wahi section khulta hai).
- **Notifications 🔔** (header me): admin ki har nayi soochna/matdaan/mandi/sampark, har nayi shikayat, har naya comment, har progress badlav — sabko dikhta hai (login ke bina bhi). Unread count badge ke saath.
- **Comments**: 10 min tak edit, delete kabhi bhi, **Reply** se kisi comment ko quote karke jawab. Shikayat ka malik apni shikayat ke neeche koi bhi comment hata sakta hai.
- **Chat**: Chats page par upar search bar, neeche gaav ke sabhi users; har user ke saath 🟢 Online / "20 मिनट पहले". Naya message aane par toast + (permission di ho to) device notification.
- **Speed**: listeners kam (complaints 120, bazaar 60), users ki list sirf chat screens kholne par load hoti hai, renders batch hote hain.

## 3) Notifications ki sachchai (zaroor padho)
Abhi notifications **app khula ho ya background tab me ho** tab milti hain (in-app + browser notification). **Band app par phone ka push** tab hi ja sakta hai jab server ho: Firebase Cloud Messaging + Cloud Function (Blaze plan, card chahiye). Bina server ke koi bhi static app ye nahi kar sakta. Chaho to agla step ye bana dunga.

## 4) Online status ka kharcha
Har khula app 2 minute me ek chhota write karta hai (`profiles/<uid>.lastSeen`). 5 minute ke andar = Online. Free quota (20k writes/din) me ~50 log roz ghante-bhar chalein to theek hai; zyada users par interval badha do (`app.js` me `120000`).
