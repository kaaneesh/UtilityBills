# Firestore Integration Guide

## Quick Start

### 1. Create a Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click **Create a new project**
   - Project name: `gasreading` (or your choice)
   - Enable Google Analytics (optional)
3. Once created, go to **Project Settings** (⚙️ icon)
4. Under **Your apps**, click **Web** (</> icon)
5. Register your app and copy the config object

### 2. Update Firestore Config
Edit `firestore-config.js` with your credentials. The file defines
`window.FIREBASE_CONFIG` and `window.FIRESTORE_MODE` since the sync code
reads them from the global scope:

```javascript
// replace values below with the object from the Firebase console
// (Project Settings → Your apps → config)

window.FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// use 'online' once you have a real project; 'offline' skips Firestore
window.FIRESTORE_MODE = 'online'; // Change from 'offline' to 'online'
```

### 3. Set Up Firestore Database
1. In Firebase Console, go to **Firestore Database**
2. Click **Create database**
3. Choose region (us-central1 recommended)
4. Select **Start in production mode** (you'll add rules next)
5. Click **Create**

### 4. Set Firestore Security Rules
In Firestore > Rules, replace with (this example covers both the original flat/readings
collections and the newer per‑user namespace introduced by the sync module).

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // legacy top‑level collections (older versions of the app)
    match /flats/{document=**} {
      allow read, write: if request.auth != null;
    }
    match /readings/{document=**} {
      allow read, write: if request.auth != null;
    }

    // namespaced under /users/{uid} (current version)
    match /users/{uid}/flats/{document=**} {
      allow read, write: if request.auth.uid == uid;
    }
    match /users/{uid}/readings/{document=**} {
      allow read, write: if request.auth.uid == uid;
    }
  }
}
```

Then click **Publish**

> 💡 After enabling namespacing in `firestore-sync.js`, you must update your
> security rules as shown above; otherwise anonymous users will receive
> **permission-denied** errors when the app tries to read or write under
> `/users/{uid}`.

### 5. Enable Anonymous Authentication
1. Go to **Authentication** > **Sign-in method**
2. Enable **Anonymous** (toggle on)
3. Click **Save**

### 6. Test Locally
```bash
# Serve the app
python3 -m http.server 8000

# Open http://localhost:8000
# Login, and you should see "Sync: Online ✓"
```

---

## How It Works

### Data Flow
```
User edits readings → IndexedDB (instant)
                  ↓
            Firestore (sync in background, 10s debounce)
                  ↓
Other devices see changes (real-time listeners)
```

### Offline Support
- All reads/writes go to **IndexedDB first** (fast, offline)
- Changes queue in memory if offline
- When online, queued writes flush to Firestore
- Real-time listeners sync cloud changes → local IndexedDB

### CSV Exports
- **Export CSV / Email CSV** — uses IndexedDB (local readings)
- **Cloud Backup** — exports flats/readings from Firestore
- **Cloud Restore** — imports JSON into Firestore

---

## Architecture Changes

### New Files
- `firestore-config.js` — Firebase config (you fill this in)
- `firestore-sync.js` — Sync logic, offline queue, real-time listeners

### Modified Files
- `index.html` — Firebase SDK, new buttons, sync status
- `auth.js` — Firestore sign-in on login

### No Changes to
- `app.js` — keeps using IndexedDB (sync is transparent)
- `db.js` — IndexedDB unchanged
- CSV export functions — use local cache

---

## Features

✅ **Hybrid Approach** — IndexedDB + Firestore (best of both worlds)
✅ **Offline Queue** — writes queue if offline, flush when back online
✅ **Real-time Sync** — other devices see updates instantly
✅ **Cloud Backup/Restore** — download/upload entire dataset
✅ **No Code Changes** — `app.js` unchanged (sync is transparent)
✅ **PIN-based Auth** — works with existing login (not secure for production)

---

## Production Considerations

### Security
- **Current**: PIN stored in localStorage (not secure)
- **Recommended**: Use Firebase Auth (email/password or OAuth)
- Update `auth.js` and Firestore rules to use `request.auth.uid`

### Costs (Firestore Pricing)
- Free tier: 50K reads/day, 20K writes/day, 1GB storage
- Example usage: 10 flats × 30 reads/day = 300 reads/month (~free)
- Real-time listeners are cheap (counted as reads)

### Scaling
- If you have 100+ flats, consider:
  - Pagination (only load current month)
  - Indices (Firestore will suggest them)
  - Batch writes instead of single-doc updates

---

## Troubleshooting

### "Sync: Offline" in app
- Check Firestore config (`firestore-config.js`)
- Open DevTools Console for errors
- Verify Firebase project exists and Firestore is enabled

### Cloud Backup/Restore buttons don't work
- Check FIRESTORE_MODE is set to `'online'`
- Verify Firestore rules allow read/write
- Check browser DevTools for auth errors

### Real-time updates not syncing
- Open app on 2 different devices/browsers
- Edit readings in one
- Refresh the other (listeners may take 1–2 seconds)

### Reads/writes not queuing
- Check browser is offline (DevTools > Network > Offline)
- Edit a reading, then go online
- Watch DevTools Console for "Synced" messages

---

## Next Steps

1. **Test locally** with 2 browsers (simulate multi-user)
2. **Deploy to production** (update Firebase config for production domain)
3. **Monitor costs** in Firebase Console
4. **Consider upgrading auth** from PIN to proper Firebase Auth
