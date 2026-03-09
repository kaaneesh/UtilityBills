// firestore-sync.js
// Handles Firestore cloud sync, offline queue, and real-time listeners

let fsDb = null;
let fsAuth = null;
let currentUser = null;
let syncEnabled = false;
let pendingWrites = [];

// Initialize Firebase and Firestore
async function initFirestore() {
  console.log('initFirestore() called – mode:', window.FIRESTORE_MODE, 'config present?', !!window.FIREBASE_CONFIG);

  if (!window.FIRESTORE_MODE || window.FIRESTORE_MODE !== 'online') {
    console.log('Firestore mode: offline (IndexedDB only)');
    return false;
  }

  if (typeof firebase === 'undefined') {
    console.error('Firebase SDK not loaded – check network or script tags');
    return false;
  }

  if (!window.FIREBASE_CONFIG) {
    console.error('FIREBASE_CONFIG is undefined; make sure firestore-config.js defines it');
    return false;
  }

  try {
    // Initialize Firebase
    const app = firebase.initializeApp(window.FIREBASE_CONFIG);
    fsAuth = firebase.auth(app);
    fsDb = firebase.firestore(app);

    // Enable offline persistence
    fsDb.enablePersistence().catch(err => {
      if (err.code !== 'failed-precondition' && err.code !== 'unimplemented') {
        console.warn('Firestore offline persistence not available:', err);
      }
    });

    console.log('Firestore initialized');
    return true;
  } catch (err) {
    console.error('Firestore init failed:', err);
    return false;
  }
}

// PIN-based anonymous auth (for Firestore)
async function firestoreSignIn(pin) {
  if (!fsAuth || !FIRESTORE_MODE || FIRESTORE_MODE !== 'online') {
    return false; // Firestore not enabled
  }

  try {
    // Use signInAnonymously and store PIN hash for verification
    const result = await fsAuth.signInAnonymously();
    currentUser = result.user;
    
    // Store PIN hash in localStorage (you can improve this with a backend)
    localStorage.setItem('caretaker_pin_hash', btoa(pin)); // Simple encoding (not secure for prod)
    
    syncEnabled = true;
    
    // Start listening for sync
    startRealtimeSync();
    
    // Backfill any existing local records so that the cloud has the current state
    backfillLocalData();
    
    // Flush pending writes
    flushPendingWrites();
    
    console.log('Firestore user signed in');
    return true;
  } catch (err) {
    console.error('Firestore sign-in failed:', err);
    return false;
  }
}

// Start real-time listeners for flats and readings
// listeners are scoped to the currently signed‑in user so that multiple
// browsers/users don’t stomp on one another’s data.
function startRealtimeSync() {
  if (!fsDb || !currentUser) return;

  const uid = currentUser.uid;
  const base = fsDb.collection('users').doc(uid);

  // Listen to flats collection under /users/{uid}/flats
  base.collection('flats').onSnapshot(snapshot => {
    snapshot.docChanges().forEach(change => {
      const flatData = change.doc.data();
      if (change.type === 'added' || change.type === 'modified') {
        const tx = db.transaction('flats', 'readwrite');
        tx.objectStore('flats').put({ key: change.doc.id, ...flatData });
      } else if (change.type === 'removed') {
        const tx = db.transaction('flats', 'readwrite');
        tx.objectStore('flats').delete(change.doc.id);
      }
    });
  });

  // Listen to readings collection under /users/{uid}/readings
  base.collection('readings').onSnapshot(snapshot => {
    snapshot.docChanges().forEach(change => {
      const readingData = change.doc.data();
      if (change.type === 'added' || change.type === 'modified') {
        const tx = db.transaction('readings', 'readwrite');
        tx.objectStore('readings').put({
          flatKey: readingData.flatKey,
          month: readingData.month,
          ...readingData
        });
      } else if (change.type === 'removed') {
        const tx = db.transaction('readings', 'readwrite');
        tx.objectStore('readings').delete([readingData.flatKey, readingData.month]);
      }
    });
  });
}

// Queue a write (called by app.js when saving)
// If `data` is null and `delete` flag not provided, the write will
// simply ignore the operation. To schedule a deletion, pass
// `{delete: true}` as the fourth argument.
function queueFirestoreWrite(collection, docId, data, opts = {}) {
  if (!syncEnabled || !fsDb) {
    console.warn('queueFirestoreWrite skipped (sync disabled or fsDb null)');
    return;
  }

  // simply enqueue with the plain collection name; flushPendingWrites
  // will translate into the namespaced path when sending to the server.
  if (opts.delete) {
    pendingWrites.push({ collection, docId, delete: true, timestamp: Date.now() });
  } else {
    pendingWrites.push({ collection, docId, data, timestamp: Date.now() });
  }
  flushPendingWrites();
}

// Flush pending writes to Firestore
async function flushPendingWrites() {
  if (!fsDb) {
    console.warn('flushPendingWrites called but fsDb is null');
    return;
  }
  if (pendingWrites.length === 0) {
    return;
  }

  const uid = currentUser ? currentUser.uid : null;
  const writes = [...pendingWrites];
  pendingWrites = [];

  for (const write of writes) {
    try {
      // obtain the proper collection reference, namespaced if we have a user
      let collRef = fsDb.collection(write.collection);
      if (uid) {
        collRef = fsDb.collection('users').doc(uid).collection(write.collection);
      }
      const docRef = collRef.doc(write.docId);

      if (write.delete) {
        await docRef.delete();
      } else {
        await docRef.set(write.data, { merge: true });
      }
    } catch (err) {
      console.error(`Failed to sync ${write.collection}/${write.docId}:`, err);
      pendingWrites.push(write);
    }
  }
}


// Backfill local IndexedDB data into the pending queue. This is run once
// when a user signs in, ensuring that all pre‑existing readings and flats
// are pushed to Firestore.
function backfillLocalData() {
  if (!db) return;
  const tx = db.transaction(["flats", "readings"], "readonly");
  const flatsStore = tx.objectStore("flats");
  const readingsStore = tx.objectStore("readings");

  flatsStore.openCursor().onsuccess = e => {
    const c = e.target.result;
    if (!c) return;
    queueFirestoreWrite("flats", c.value.key, c.value);
    c.continue();
  };

  readingsStore.openCursor().onsuccess = e => {
    const c = e.target.result;
    if (!c) return;
    const rec = c.value;
    const docId = `${rec.flatKey}_${rec.month}`;
    queueFirestoreWrite("readings", docId, rec);
    c.continue();
  };
};

// Periodic flush (every 10 seconds if online)
setInterval(() => {
  if (navigator.onLine && syncEnabled) {
    flushPendingWrites();
  }
}, 10000);

// Listen for online/offline
window.addEventListener('online', () => {
  console.log('Back online — flushing pending writes');
  flushPendingWrites();
});

window.addEventListener('offline', () => {
  console.log('Offline — writes queued locally');
});

// Export flats and readings from Firestore (for backup or manual sync)
async function exportFromFirestore() {
  if (!fsDb) {
    console.warn('exportFromFirestore: fsDb is null, attempting to init again');
    await initFirestore();
    if (!fsDb) {
      alert('Firestore not enabled – check console for init errors');
      return;
    }
  }

  if (!currentUser) {
    alert('Sign in first – export is per‑user');
    return;
  }

  try {
    const uid = currentUser.uid;
    const base = fsDb.collection('users').doc(uid);
    const flatsSnap = await base.collection('flats').get();
    const readingsSnap = await base.collection('readings').get();

    const backup = {
      version: 1,
      timestamp: new Date().toISOString(),
      flats: flatsSnap.docs.map(d => ({ key: d.id, ...d.data() })),
      readings: readingsSnap.docs.map(d => d.data())
    };

    const json = JSON.stringify(backup, null, 2);
    downloadJSON(`firestore_backup_${new Date().toISOString().slice(0, 10)}.json`, json);
    alert('Firestore backup downloaded');
  } catch (err) {
    console.error('Export failed:', err);
    alert('Failed to export from Firestore: ' + err.message);
  }
}

// Import flats and readings into Firestore
async function importToFirestore(event) {
  if (!fsDb) {
    alert('Firestore not enabled');
    return;
  }

  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const backup = JSON.parse(e.target.result);
      if (!backup.flats || !backup.readings) {
        alert('Invalid backup format');
        return;
      }

      let uploaded = 0;
      const batch = fsDb.batch();

      // decide which collection path to use
      const uid = currentUser ? currentUser.uid : null;
      let flatsColl = fsDb.collection('flats');
      let readingsColl = fsDb.collection('readings');
      if (uid) {
        const base = fsDb.collection('users').doc(uid);
        flatsColl = base.collection('flats');
        readingsColl = base.collection('readings');
      }

      // Upload flats
      backup.flats.forEach(flat => {
        const docRef = flatsColl.doc(flat.key);
        batch.set(docRef, flat);
        uploaded++;
      });

      // Upload readings
      backup.readings.forEach(reading => {
        const docRef = readingsColl.doc(
          `${reading.flatKey}_${reading.month}`
        );
        batch.set(docRef, reading);
        uploaded++;
      });

      await batch.commit();
      alert(`Imported ${uploaded} records to Firestore`);
      event.target.value = '';
    } catch (err) {
      console.error('Import failed:', err);
      alert('Import error: ' + err.message);
    }
  };
  reader.readAsText(file);
}
