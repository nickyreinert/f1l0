    // ─── App ─────────────────────────────────────────────────────────────────────
    function App() {
      const [ready, setReady]               = useState(false);
      const [lastTrainDate, setLastTrainDate] = useState(null);
      const [trainType, setTrainType]       = useState("A");
      // Training section
      const [exercises, setExercises]       = useState([]);
      const [trainBlocks, setTrainBlocks]   = useState([]);
      const [trainSupps, setTrainSupps]     = useState(mkSup());
      const [trainDone, setTrainDone]       = useState(false);
      // WHY: Cooldown drives "grease the groove" pacing — configurable so user isn't locked to 4h.
      const [cooldownMs, setCooldownMs]     = useState(4 * 3600000);
      const [tmpCooldownMin, setTmpCooldownMin] = useState(240);
      const [editBlockIdx, setEditBlockIdx] = useState(null);
      // WHY: blockPlan is the schedule source of truth; tmpBlockPlan is the editable copy in Settings.
      const [blockPlan, setBlockPlan]       = useState(() => normalizeBlockPlan(null));
      const [tmpBlockPlan, setTmpBlockPlan] = useState(() => normalizeBlockPlan(null));
      // Frühsport section
      const [mornExercises, setMornExercises] = useState([]);
      const [mornDone, setMornDone]           = useState(false);
      const [mornCollapsed, setMornCollapsed] = useState(false);
      // Rest timer
      const [restTimer, setRestTimer]       = useState(null);
      const [restTimerKey, setRestTimerKey] = useState(0);
      const [restSecs, setRestSecs]         = useState(60);
      const [tmpRestSecs, setTmpRestSecs]   = useState(60);
      // Modal
      const [modalOpen, setModalOpen]       = useState(false);
      const [modalTarget, setModalTarget]   = useState(null); // { section: "train"|"morn", ei }
      const [recentEx, setRecentEx]         = useState([]);
      const [sessions, setSessions]         = useState([]);
      const [customExercises, setCustomEx]  = useState([]);
      const [exerciseImages, setExerciseImages] = useState({});
      const [supplements, setSupplements]   = useState([]);
      const [tmpSupplements, setTmpSupplements] = useState([]);
      const [suppDeleteConfirm, setSuppDeleteConfirm] = useState(null);
      const [suppDragIdx, setSuppDragIdx]     = useState(null);
      const [suppDragOver, setSuppDragOver]   = useState(null);
      const suppDragRef = useRef({ fromIdx: null });

      const [rpgSnap, setRpgSnap]           = useState(null);
      const [levelUpEvent, setLevelUpEvent] = useState(null);
      const [xpEvents, setXpEvents]         = useState(null);
      const [achQueue, setAchQueue]         = useState([]);
      const [animateXP, setAnimateXP]       = useState(false);

      const refreshSnap = useCallback(async () => {
        const snap = await window.Gamification.getSnapshot();
        setRpgSnap(snap);
      }, []);

      // WHY: Extracted to avoid duplicating 9 setters in both initApp and selectedSession effect.
      const applySessionToState = (today) => {
        setTrainType(today.type);
        const blocks = sessionBlocks(today);
        setTrainBlocks(blocks);
        setExercises(flattenBlocks(blocks));
        setTrainSupps(today.supps ?? mkSup());
        setTrainDone(today.done ?? false);
        setMornExercises(today.mornExercises || []);
        setMornDone(today.mornDone ?? false);
        setMornCollapsed(today.mornCollapsed ?? false);
      };

      const initApp = useCallback(async () => {
          await window._syncReady;
          const cfg = await load("cfg") || {};
          const rawAll = await load("sessions") || [];
          const all = rawAll.map(migrateSession);
          if (all.some((s,i) => s !== rawAll[i])) await save("sessions", all);

          const rs = cfg.restSecs ?? 60;
          setRestSecs(rs); setTmpRestSecs(rs);
          const cdMs = cfg.cooldownMs ?? 4 * 3600000;
          setCooldownMs(cdMs); setTmpCooldownMin(Math.round(cdMs / 60000));
          // WHY: Deep copy via JSON round-trip so edits in Settings don't mutate live schedule.
          const bp = normalizeBlockPlan(cfg.blockPlan);
          setBlockPlan(bp); setTmpBlockPlan(JSON.parse(JSON.stringify(bp)));
          setCustomEx(cfg.customExercises || []);
          const imgs = await load("exerciseImages") || {};
          setExerciseImages(imgs);
          const supp = cfg.supplements || [];
          setSupplements(supp); setTmpSupplements(supp);

          const t = todayStr();
          const prior = all.filter(s => s.date !== t);
          const lastPrev = lastSession(prior);
          if (lastPrev) setLastTrainDate(lastPrev.date);

          let today = all.find(s => s.date === t);
          if (!today) {
            const fallbackType = computeType(lastPrev?.date, lastPrev?.type);
            const plan = normalizeBlockPlan(cfg.blockPlan);
            const nt = resolveDayTypeWithPlan({ date: t, priorSessions: prior, plan, fallbackType });
            const lt = lastTargetsFromSessions(prior, t);
            const defaults = buildDefaultDayPayload({
              date: t,
              priorSessions: prior,
              dayType: nt,
              lastTargets: lt,
              plan,
            });
            today = {
              ...mkSession(t, nt, defaults.exercises, defaults.mornExercises),
              trainBlocks: defaults.trainBlocks,
            };
            const next = [...prior, today];
            // Only persist a freshly-created default session once the user has
            // actually interacted; persisting here would push a blank today over
            // good cloud data before sync. Keep it in React state only for now.
            setSessions(next);
          } else {
            setSessions(all);
          }

          applySessionToState(today);
          await refreshSnap();
          setReady(true);
      }, []);  // WHY: applySessionToState is stable (only closes over state setters)

      useEffect(() => {
        initApp();
        // Re-init if a later cloud sync brings down newer data
        const onSync = () => initApp();
        window.addEventListener("cloudSyncComplete", onSync);
        return () => window.removeEventListener("cloudSyncComplete", onSync);
      }, [initApp]);

      const persistSelectedDay = async (patch) => {
        const t = headerDate;
        const all = await load("sessions") || [];
        const existing = all.find(s => s.date === t) || mkSession(t, trainType, [], []);
        // Stamp every write so cross-device merge can pick the newest edit per date.
        const updated = { ...existing, ...patch, updatedAt: Date.now() };
        const next = [...all.filter(s => s.date !== t), updated].sort((a,b) => a.date.localeCompare(b.date));
        await save("sessions", next);
        setSessions(next);
        return updated;
      };

      const saveExercises = (exs, su, d) => persistSelectedDay({
        type: trainType, exercises: exs ?? exercises,
        supps: su ?? trainSupps, done: d ?? trainDone,
      });
      // Source of truth for training is blocks; exercises[] is the derived flat union.
      const saveTrainBlocks = (blocks, su, d) => persistSelectedDay({
        type: trainType, trainBlocks: blocks ?? trainBlocks, exercises: flattenBlocks(blocks ?? trainBlocks),
        supps: su ?? trainSupps, done: d ?? trainDone,
      });
      const saveMorn = (exs, md, mc) => persistSelectedDay({
        mornExercises: exs ?? mornExercises,
        mornDone: md ?? mornDone,
        mornCollapsed: mc ?? mornCollapsed,
      });

      // Training handlers (block-based). Each commits new blocks + derived exercises.
      const commitBlocks = (n) => { setTrainBlocks(n); setExercises(flattenBlocks(n)); saveTrainBlocks(n); };
      const onBlkSetRep   = (bi,ei,si,v) => commitBlocks(mutBlockEx(trainBlocks,bi,E=>mutSetRep(E,ei,si,v)));
      const onBlkDelRep   = (bi,ei,si)   => commitBlocks(mutBlockEx(trainBlocks,bi,E=>mutDelRep(E,ei,si)));
      const onBlkAddEx    = (bi)         => commitBlocks(mutBlockEx(trainBlocks,bi,E=>mutAddEx(E)));
      const onBlkDelEx    = (bi,ei)      => commitBlocks(mutBlockEx(trainBlocks,bi,E=>mutDelEx(E,ei)));
      const onBlkAddRep   = (bi,ei)      => commitBlocks(mutBlockEx(trainBlocks,bi,E=>mutAddRep(E,ei)));
      const onBlkExName   = (bi,ei,nm)   => commitBlocks(mutBlockEx(trainBlocks,bi,E=>mutName(E,ei,nm)));
      const onBlkExDone   = (bi,ei)      => commitBlocks(mutBlockEx(trainBlocks,bi,E=>mutToggleDone(E,ei)));
      const onCheckBlock  = (bi)         => commitBlocks(mutCheckBlock(trainBlocks,bi,Date.now()));
      const onUncheckBlock= (bi)         => commitBlocks(mutUncheckBlock(trainBlocks,bi));
      const onBlkCollapse = (bi)         => commitBlocks(mutToggleCollapse(trainBlocks,bi));
      const onBlkSetStart = (bi,ts)      => commitBlocks(mutBlockStart(trainBlocks,bi,ts));
      const onAddBlock    = ()           => commitBlocks(mutAddBlock(trainBlocks));
      const onDelBlock    = (bi)         => commitBlocks(mutDelBlock(trainBlocks,bi));
      const allCollapsed  = trainBlocks.length > 0 && trainBlocks.every(b => b.collapsed);
      const onToggleAllCollapse = () => commitBlocks(mutSetCollapseAll(trainBlocks, !allCollapsed));
      // Frühsport handlers
      const onMornSetRep = (ei,si,v) => { const n=mutSetRep(mornExercises,ei,si,v); setMornExercises(n); saveMorn(n); };
      const onMornDelRep = (ei,si)   => { const n=mutDelRep(mornExercises,ei,si);   setMornExercises(n); saveMorn(n); };
      const onMornAddEx  = ()        => { const n=mutAddEx(mornExercises);           setMornExercises(n); saveMorn(n); };
      const onMornDelEx  = (ei)      => { const n=mutDelEx(mornExercises,ei);        setMornExercises(n); saveMorn(n); };
      const onMornAddRep = (ei)      => { const n=mutAddRep(mornExercises,ei);       setMornExercises(n); saveMorn(n); };
      const onMornToggleDone = (ei)  => { const n=mutToggleDone(mornExercises,ei);   setMornExercises(n); saveMorn(n); };
      const onToggleMornCollapse = () => {
        const next = !mornCollapsed;
        setMornCollapsed(next);
        saveMorn(null, null, next);
      };

      const addCustomExercise = async (name) => {
        if (customExercises.includes(name)) return;
        const updated = [...customExercises, name];
        setCustomEx(updated);
        const cfg = await load("cfg") || {};
        await save("cfg", { ...cfg, customExercises: updated });
      };

      const updateExerciseImage = async (exName, dataUrl) => {
        const updated = { ...exerciseImages, [exName]: dataUrl };
        setExerciseImages(updated);
        await save("exerciseImages", updated);
      };

      const selectExercise = (exName) => {
        if (!modalTarget) return;
        const { section, ei } = modalTarget;

        // Look up last logged reps for this exercise name from history
        const prior = sessions.filter(s => s.date < headerDate);
        const lt = lastTargetsFromSessions(prior, headerDate);
        const lastReps = lt[exName];

        // Apply name + historical reps suggestion (only if exercise not yet done today)
        const applyEx = (ex) => {
          const base = { ...ex, name: exName };
          if (!ex.done && lastReps && lastReps.length) {
            return { ...base, target: lastReps[0], reps: lastReps };
          }
          return base;
        };

        if (section === "morn") {
          const n = mornExercises.map((ex, k) => k !== ei ? ex : applyEx(ex));
          setMornExercises(n); saveMorn(n);
        } else if (section === "block") {
          const newBlocks = mutBlockEx(trainBlocks, modalTarget.bi, E => E.map((ex, k) => k !== ei ? ex : applyEx(ex)));
          commitBlocks(newBlocks);
        } else {
          const n = exercises.map((ex, k) => k !== ei ? ex : applyEx(ex));
          setExercises(n); saveExercises(n);
        }
        setRecentEx(prev => [exName, ...prev.filter(e => e !== exName)].slice(0,8));
        setModalOpen(false);
      };

      // ─── History edit / selected day ───────────────────────────────────────
      const [histOffset, setHistOffset] = useState(0);
      const [editEntry, setEditEntry]   = useState(null);
      const [headerDayOffset, setHeaderDayOffset] = useState(0);

      const headerDate = useMemo(() => {
        const d = new Date();
        d.setDate(d.getDate() + headerDayOffset);
        return d.toISOString().slice(0, 10);
      }, [headerDayOffset]);
      const isViewingToday = headerDate === todayStr();

      const selectedSession = useMemo(() => {
        return sessions.find(s => s.date === headerDate) || mkSession(headerDate, "A", [], []);
      }, [sessions, headerDate]);

      // WHY: Sync all UI state when user navigates to a different day in the history.
      useEffect(() => {
        applySessionToState(migrateSession(selectedSession));
      }, [selectedSession]);

      const fireGamificationEvents = (events, newLevel) => {
        const levelUpEv = events.find(e => e.type === "levelUp");
        const achEv     = events.find(e => e.type === "achievements");
        const xpEv      = events.filter(e => ["xp","pr","improvement","weeklyBonus"].includes(e.type));
        if (levelUpEv) { setLevelUpEvent(newLevel); }
        else { if (xpEv.length > 0) { setXpEvents(xpEv); setTimeout(() => setXpEvents(null), 3500); } }
        if (achEv?.list?.length > 0) setAchQueue(q => [...q, ...achEv.list]);
        setAnimateXP(true);
        setTimeout(() => setAnimateXP(false), 2000);
      };

      // Only confirmed (done) exercises count toward XP — pre-filled suggestions don't.
      const gamSessions = (exs) => exs.filter(ex => ex.done).map(ex => ({ name: ex.name, reps: exTotalReps(ex) }));

      const completeMorning = async () => {
        if (mornDone || !isViewingToday) return;
        setMornDone(true);
        await saveMorn(null, true);
        const result = await window.Gamification.processWorkoutComplete({
          exerciseSessions: gamSessions(mornExercises), isMorning: true, date: todayStr(),
        });
        await refreshSnap();
        fireGamificationEvents(result.events, result.newLevel);
      };

      const toggleMorningComplete = async () => {
        if (mornDone) {
          setMornDone(false);
          await saveMorn(null, false);
          return;
        }
        if (!isViewingToday) {
          setMornDone(true);
          await saveMorn(null, true);
          return;
        }
        await completeMorning();
      };

      const completeDay = async () => {
        if (trainDone || !isViewingToday) return;
        setTrainDone(true);
        await saveExercises(null, null, true);
        setLastTrainDate(todayStr());
        const result = await window.Gamification.processWorkoutComplete({
          exerciseSessions: gamSessions([...mornExercises, ...exercises]),
          isMorning: false, date: todayStr(),
        });
        await refreshSnap();
        fireGamificationEvents(result.events, result.newLevel);
      };

      // Auto-complete a section (award XP) once every exercise in it is confirmed.
      useEffect(() => {
        if (!ready || !isViewingToday || mornDone) return;
        if (mornExercises.length > 0 && mornExercises.every(ex => ex.done)) completeMorning();
      }, [ready, isViewingToday, mornDone, mornExercises]);

      useEffect(() => {
        if (!ready || !isViewingToday || trainDone || trainType !== "A") return;
        // Day completes once every training block has been checked off.
        if (trainBlocks.length > 0 && trainBlocks.every(b => b.startedAt !== null)) completeDay();
      }, [ready, isViewingToday, trainDone, trainType, trainBlocks]);

      const toggleSupp = k => {
        const ns = { ...trainSupps, [k]: !trainSupps[k] };
        setTrainSupps(ns); saveExercises(null, ns, null);
      };

      const exportData = async () => JSON.stringify({
        schema: 3, cfg: await load("cfg"), sessions: await load("sessions"), exportedAt: new Date().toISOString(),
      }, null, 2);

      const legacyToSessions = (parsed) => {
        const byDate = {};
        const ensure = (date, type) => (byDate[date] ||= mkSession(date, type || "A", [], []));
        const toExs = (arr) => {
          const map = {};
          (arr || []).forEach(ex => {
            const reps = Array.isArray(ex.sets) ? ex.sets
                       : (ex.sets > 0 ? Array(ex.sets).fill(Math.round((ex.reps||0)/ex.sets)) : (ex.reps ? [ex.reps] : []));
            if (!map[ex.name]) map[ex.name] = { name: ex.name, target: reps[0]||10, reps: [] };
            map[ex.name].reps.push(...reps);
          });
          return Object.values(map);
        };
        (parsed.history || []).forEach(e => {
          const s = ensure(e.date, e.type);
          s.mornExercises = toExs(e.mornExercises);
          s.exercises = toExs(e.exercises);
          if (e.notes) s.notes = e.notes;
        });
        return Object.values(byDate).sort((a,b) => a.date.localeCompare(b.date));
      };

      const importData = async (parsed) => {
        let sess;
        if ((parsed.schema === 2 || parsed.schema === 3) && Array.isArray(parsed.sessions)) {
          sess = parsed.sessions.map(migrateSession);
        } else {
          sess = legacyToSessions(parsed);
        }
        localStorage.setItem("tp_sessions", JSON.stringify(sess));
        if (parsed.cfg) localStorage.setItem("tp_cfg", JSON.stringify(parsed.cfg));
        ["tp_day","tp_morn","tp_history"].forEach(k => localStorage.removeItem(k));
        try { await window.storage._pushAllToCloud(); } catch(e) {}
        setSessions(sess);
        await refreshSnap();
      };

      const typeColor = trainType === "A" ? ACC : RED;

      const openHeaderDayEditor = () => {
        const existing = sessions.find(s => s.date === headerDate);
        setEditEntry(existing ? { ...existing } : mkSession(headerDate, "A", []));
      };

      const saveHistoryEntry = async (updated) => {
        // WHY: Discard stale blocks so the edited flat list becomes the canonical source again.
        const { trainBlocks: _drop, ...rest } = updated;
        const migrated = { ...migrateSession(rest), updatedAt: Date.now() };
        const next = [...sessions.filter(s => s.date !== migrated.date), migrated]
          .sort((a,b) => a.date.localeCompare(b.date));
        setSessions(next);
        await save("sessions", next);
        if (migrated.date === headerDate) applySessionToState(migrated);
        setEditEntry(null);
      };

