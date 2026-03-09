# GitHub Copilot / AI Agent Instructions — gasreading

Purpose: Help an AI agent become productive quickly in this small static web app that records gas meter readings and exports CSV billing.

- **Big picture:** This is a vanilla JavaScript single-page app (no bundler). UI and logic live in `app.js`; IndexedDB schema and initialization are in `db.js`; utility helpers are in `utils.js`. Open `index.html` in a browser (or serve the folder) to run.

- **Key files:**
  - `app.js` — UI handlers, IndexedDB reads/writes, CSV export flow.
  - `db.js` — database setup; exposes global `db` and object stores `flats` and `readings`.
  - `utils.js` — helpers like `getPreviousMonth()`, `getFirstDayOfMonth()`, and `downloadCSV()` used by `app.js`.

- **Data models (discoverable shapes):**
  - Flat record stored in `flats` store: { key, flat, sqft, name }
  - Reading record stored in `readings` store: { flatKey, month, prev, curr, units, rate, amount }
  - Readings use a compound key pattern: `readings.get([flatKey, month])` — preserve this shape when reading/writing.

- **Important behaviors & patterns:**
  - The app is event-driven: user selects `month` → `loadMonth()` sets `currentMonth` and calls `loadFlats()` to render rows.
  - `loadFlats()` iterates `flats` cursor and for each flat queries `readings` for `currentMonth` or previous month fallback; `drawRow()` appends a table row with inputs whose `oninput` calls `calc(flatKey)`.
  - `calc(flatKey)` computes `units = (curr - prev) * 2.6` and `amount = units * rate`, updates DOM cells and does `readings.put(...)` to persist. Do not change the multiplier `2.6` unless explicitly required.
  - UI element ids expected by code: `month`, `rate`, `rows`, `keyField`, `flatNo`, `sqft`, `ownerName`, `addFlatForm`. Keep these ids unchanged if modifying UI.

- **CSV export specifics (`exportCSV` in `app.js`):**
  - Exports rows where `c.value.month === currentMonth` and builds CSV lines using associated `flats` entries.
  - Uses `getFirstDayOfMonth(currentMonth)` for `InvoiceDate` and a formula string like `"${r.curr}-${r.prev}*2.6*${r.rate}"` in the comment column. Keep formatting consistent for downstream billing.

- **IndexedDB notes & pitfalls:**
  - Code expects a global `db` (from `db.js`) to be ready before operations. Guard UI flows against `db` being null (see `addFlat()` check).
  - Use transactions on both `flats` and `readings` as shown (`db.transaction([...], "readonly"/"readwrite")`). Follow existing key names to avoid corrupting data access.

- **Developer workflows (no build system):**
  - Run locally by opening `index.html` in a browser or serve the directory. Recommended quick server:

    python3 -m http.server 8000

  - Debugging: use browser DevTools for console logs and the Application > IndexedDB inspector to view `flats` and `readings` stores.

- **Where to change behavior safely:**
  - Change UI labels/layout in `index.html` and CSS in `styles.css`.
  - Change persistence schema only in `db.js` and update code paths in `app.js` that call `get()`/`put()`.
  - Business logic (conversion factor `2.6`, rate usage, CSV fields) lives in `app.js` — update there and update CSV formatting accordingly.

- **Examples (copy/paste patterns):**
  - Read a reading for a flat/month: `readingsStore.get([flat.key, currentMonth]).onsuccess = e => { ... }`
  - Save reading from `calc()`:
    ```js
    db.transaction('readings','readwrite').objectStore('readings').put({
      flatKey, month: currentMonth, prev: p, curr: c, units, rate, amount
    });
    ```

- **Conventions & small gotchas:**
  - The `flat` record's identifier field is `key` (not `id`). Many lookups use `flat.key`.
  - `loadFlats()` clears `rows.innerHTML` and appends rows with template literals; to change rendering, update `drawRow()`.
  - `calc()` aborts silently if `curr < prev` — preserve or explicitly handle negative readings if adding validation/UI feedback.

- **When to ask the repo owner:**
  - If you intend to change data shapes (keyPath, compound keys) — confirm export/billing consumers.
  - If you change the unit multiplier (2.6) or CSV column layout — confirm with billing requirements.

If anything in these instructions is unclear, tell me which area (DB schema, UI ids, CSV format, or run/debug) and I will expand or correct the guidance.
