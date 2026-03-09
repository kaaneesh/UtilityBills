// firestore-config.js
// Replace with your Firebase project credentials from Firebase Console
// Go to: Project Settings > Service Accounts > Copy config object

// NOTE: the rest of the code (firestore-sync.js) reads from
// `window.FIREBASE_CONFIG`, so expose the object globally.
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyC0RnWRsJPUQQ46ql-jkA_I5HPQdrVZES4",
  authDomain: "apartment-50f52.firebaseapp.com",
  projectId: "apartment-50f52",
  storageBucket: "apartment-50f52.firebasestorage.app",
  messagingSenderId: "1074644124308",
  appId: "1:1074644124308:web:35fcbc55ff9f5fe51a2a81",
  measurementId: "G-K9LMVYY7Q1"
};

// Optional: Firestore mode
// 'offline' = IndexedDB only (default for development)
// 'online' = Firestore + IndexedDB sync
window.FIRESTORE_MODE = 'online'; // Change to 'online' when ready
