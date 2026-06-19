
    // Define the storage-ready gate synchronously, BEFORE the first top-level await.
    // This script initializes Firebase asynchronously; the React layer awaits
    // window._storageReady, so it must exist before we yield — else
    // `await undefined` resolves instantly and storage reads fire before storage exists.
    let _resolveStorageReady;
    window._storageReady = new Promise(r => { _resolveStorageReady = r; });

    let _fbAuth = null;
    let _fbDb = null;

    const _bindAuthListener = () => {
      if (!_fbAuth) return;
      _fbAuth.onAuthStateChanged(async (user) => {
        window.storage._uid       = user?.uid || null;
        window._authState.user    = user;
        window._authState.syncing = !!user;
        window.dispatchEvent(new CustomEvent("authStateChanged", { detail: { ...window._authState } }));
        if (user) {
          clearTimeout(_syncReadyFallback);
          const skipSync = sessionStorage.getItem("skipCloudSync") === "1";
          console.log("[auth] user:", user.email, "skipSync:", skipSync);
          if (skipSync) {
            sessionStorage.removeItem("skipCloudSync");
            console.log("[auth] skipped cloud sync — import reload");
          } else {
            await window.storage.syncFromCloud();
          }
          window._authState.syncing = false;
          window.dispatchEvent(new CustomEvent("authStateChanged", { detail: { ...window._authState } }));
          _resolveSyncReady();
        }
      });
    };

    (async () => {
      const firebaseConfig = await fetch("/.netlify/functions/firebase-config").then(r => r.json());

      // Initialize Firebase via the already loaded compat SDK.
      const app = firebase.apps?.length ? firebase.app() : firebase.initializeApp(firebaseConfig);
      _fbAuth = firebase.auth(app);
      window._fbAuth = _fbAuth;
      _fbDb = firebase.firestore(app);
      window._fbDb = _fbDb;
      _bindAuthListener();
    })().catch((e) => {
      console.warn("Firebase init failed:", e);
    });

    // ─── Merge helpers ────────────────────────────────────────────────────────────
    function _mergeHistories(local, cloud) {
      if (!Array.isArray(local)) return Array.isArray(cloud) ? cloud : [];
      if (!Array.isArray(cloud)) return local;
      const map = {};
      [...cloud, ...local].forEach(e => { if (e?.date) map[e.date] = e; });
      return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
    }

    // ─── Storage ─────────────────────────────────────────────────────────────────
    window.storage = {
      _uid: null,

      _col() {
        if (!_fbDb || !this._uid) return null;
        return _fbDb.collection("users").doc(this._uid).collection("data");
      },

      async get(k) {
        const v = localStorage.getItem("tp_" + k);
        return v !== null ? { key: k, value: v } : null;
      },

      // Write to localStorage + Firestore on every change
      async set(k, v) {
        const ts = Date.now();
        localStorage.setItem("tp_" + k, v);
        localStorage.setItem("tp_" + k + "_ts", String(ts)); // for sync conflict resolution
        const col = this._col();
        if (col) col.doc(k).set({ value: v, ts }).catch(() => {});
        return { key: k, value: v };
      },

      async delete(k) {
        localStorage.removeItem("tp_" + k);
        const col = this._col();
        if (col) col.doc(k).delete().catch(() => {});
        return { key: k, deleted: true };
      },

      async list(prefix) {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith("tp_" + (prefix || "")) && !k.endsWith("_ts")) keys.push(k.slice(3));
        }
        return { keys };
      },

      // Push every local key up to Firestore (used after import).
      async _pushAllToCloud() {
        const col = this._col();
        if (!col) return;
        const batch = _fbDb.batch();
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k?.startsWith("tp_") && !k.endsWith("_ts")) {
            batch.set(col.doc(k.slice(3)), { value: localStorage.getItem(k), ts: Date.now() });
          }
        }
        await batch.commit();
      },

      // On login: load everything from Firestore into localStorage, then re-init UI
      async syncFromCloud() {
        const col = this._col();
        if (!col) return;
        try {
          const snap = await col.get();
          if (snap.empty) {
            // No cloud data yet — push local up
            const batch = _fbDb.batch();
            for (let i = 0; i < localStorage.length; i++) {
              const k = localStorage.key(i);
              if (k?.startsWith("tp_") && !k.endsWith("_ts")) {
                batch.set(col.doc(k.slice(3)), { value: localStorage.getItem(k), ts: Date.now() });
              }
            }
            await batch.commit();
            return;
          }
          // Merge: for sessions, union by date picking the newest updatedAt per
          // entry. For everything else, highest doc-level ts wins.
          snap.forEach(cloudDoc => {
            const key    = cloudDoc.id;
            const cldVal = cloudDoc.data().value;
            const cldTs  = cloudDoc.data().ts || 0;
            const locKey = "tp_" + key;
            const locVal = localStorage.getItem(locKey);

            if (key === "sessions") {
              const loc = locVal ? JSON.parse(locVal) : [];
              const cld = JSON.parse(cldVal);
              // Union by date. When a date exists on both sides, the one with the
              // newer per-session updatedAt wins — this is what makes a workout
              // logged on one device show up on another *the same day*. Sessions
              // saved before updatedAt existed are treated as oldest (0), so a
              // freshly-stamped edit from either device always takes precedence.
              const map = {};
              const consider = (s) => {
                const prev = map[s.date];
                if (!prev || (s.updatedAt || 0) >= (prev.updatedAt || 0)) map[s.date] = s;
              };
              cld.forEach(consider);
              loc.forEach(consider);
              const merged = Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
              localStorage.setItem(locKey, JSON.stringify(merged));
            } else {
              // For non-session keys: cloud wins (it's the authoritative remote copy)
              // unless we have a newer local write (compare timestamps)
              const locTs = parseInt(localStorage.getItem(locKey + "_ts") || "0");
              if (!locVal || cldTs > locTs) {
                localStorage.setItem(locKey, cldVal);
              }
            }
          });
          window.dispatchEvent(new CustomEvent("cloudSyncComplete"));
        } catch(e) {
          console.warn("Cloud sync error:", e);
        }
      }
    };

    _resolveStorageReady(); // storage object is now fully set up

    // ─── Auth state ───────────────────────────────────────────────────────────────
    window._authState = { user: null, syncing: false };

    // _syncReady resolves once we know the FINAL auth state and (if logged in)
    // the first cloud sync has finished. The initial onAuthStateChanged often
    // fires with user=null before the persisted session is restored, so we must
    // not resolve on that first null — we wait for the real resolution.
    let _resolveSyncReady, _syncReadyResolved = false;
    window._syncReady = new Promise(r => {
      _resolveSyncReady = () => { if (!_syncReadyResolved) { _syncReadyResolved = true; r(); } };
    });
    // Fallback: if auth never restores a user within 1.5s, unblock the UI anyway.
    const _syncReadyFallback = setTimeout(() => _resolveSyncReady(), 1500);

    window._signInWithGoogle = async () => {
      if (!_fbAuth) return;
      const provider = new firebase.auth.GoogleAuthProvider();
      await _fbAuth.signInWithPopup(provider);
    };

    window._signOut = async () => {
      if (!_fbAuth) return;
      await _fbAuth.signOut();
      window.storage._uid = null;
    };
