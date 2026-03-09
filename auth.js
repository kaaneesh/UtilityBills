function login() {
  if (!db) {
    alert("App loading, please try again");
    return;
  }

  const enteredPin = document.getElementById("pin").value;

  db.transaction("settings", "readonly")
    .objectStore("settings")
    .get("pin").onsuccess = e => {

      const savedPin = e.target.result?.value;

      if (enteredPin === savedPin) {
        document.getElementById("login").classList.add("hidden");
        document.getElementById("app").classList.remove("hidden");

        // Try to sign in to Firestore if enabled
        if (window.FIRESTORE_MODE === 'online' && window.firestoreSignIn) {
          firestoreSignIn(enteredPin).then(success => {
            const statusEl = document.getElementById("syncStatus");
            if (statusEl) {
              statusEl.textContent = success ? "Sync: Online ✓" : "Sync: Offline";
            }
          });
        } else {
          const statusEl = document.getElementById("syncStatus");
          if (statusEl) {
            statusEl.textContent = "Sync: Not configured";
          }
        }
      } else {
        alert("Wrong PIN");
      }
    };
}
