    const { useState, useEffect, useRef, useCallback, useMemo } = React;

    // ─── Storage ────────────────────────────────────────────────────────────────
    async function load(key) {
      try {
        await window._storageReady;
        const r = await window.storage.get(key);
        return r ? JSON.parse(r.value) : null;
      } catch(e) { console.error("[load] failed for key:", key, e); return null; }
    }
    async function save(key, val) {
      try { await window._storageReady; await window.storage.set(key, JSON.stringify(val)); } catch {}
    }

    // ─── Helpers ────────────────────────────────────────────────────────────────
    function todayStr() { return new Date().toISOString().slice(0, 10); }
    function yesterdayStr() { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); }
    function fmtDate(s) { return new Date(s + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" }); }
    function computeType(ld, lt) { return (!ld || ld !== yesterdayStr()) ? "A" : (lt === "A" ? "B" : "A"); }
    function fmtMs(ms) { const h = Math.floor(ms/3600000), m = Math.floor((ms%3600000)/60000); return h > 0 ? `${h}h ${m}m` : `${m}m`; }
    function dateOffsetStr(n) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }

    // Resize an image File to a small JPEG data-URL for exercise illustration thumbnails.
    // Keeps images well under Firestore's 1 MB document limit (~8-12 KB per image at 96 px).
    function resizeImageToDataURL(file, maxDim) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
          const ratio = Math.min(maxDim / img.width, maxDim / img.height, 1);
          const w = Math.round(img.width * ratio), h = Math.round(img.height * ratio);
          const c = document.createElement('canvas'); c.width = w; c.height = h;
          c.getContext('2d').drawImage(img, 0, 0, w, h);
          URL.revokeObjectURL(url);
          resolve(c.toDataURL('image/jpeg', 0.65));
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('img load failed')); };
        img.src = url;
      });
    }

    // ─── Stats helpers ───────────────────────────────────────────────────────────
    function calcStreak(history) {
      if (!history.length) return { cur: 0, best: 0 };
      // Build a date→session map (one session per date).
      const byDate = {};
      history.forEach(s => { byDate[s.date] = s; });
      const dates = Object.keys(byDate).sort((a,b) => b.localeCompare(a));

      let best = 0, cur = 0, runTrain = 0, inCurrent = true;
      // Start from today if logged, otherwise yesterday (streak still alive).
      let expected = dates[0] === todayStr() ? todayStr() : yesterdayStr();

      for (const d of dates) {
        if (d !== expected) {
          // Calendar gap → streak broken.
          if (inCurrent) { cur = runTrain; inCurrent = false; }
          best = Math.max(best, runTrain);
          runTrain = 0;
          expected = d; // start a new (older) run from here
        }
        // Recovery days bridge the gap but don't count as streak days.
        if (sessionHasTraining(byDate[d])) runTrain++;
        const dd = new Date(expected + "T12:00:00"); dd.setDate(dd.getDate() - 1);
        expected = dd.toISOString().slice(0, 10);
      }
      best = Math.max(best, runTrain);
      if (inCurrent) cur = runTrain;
      return { cur, best };
    }
    // ─── Session model (schema 3) ────────────────────────────────────────────────
    // A session = one date. Two flat exercise arrays: mornExercises[] + exercises[].
    // No blocks, no slots, no completedAt timestamps — just reps.

    const flatExs = (arr) => (arr || []).map(ex => ({
      name: ex.name,
      reps: (Array.isArray(ex.reps) ? ex.reps : []).filter(v => typeof v === 'number' && v > 0),
    }));

    // All exercises from a session (both sections) — used for stats/gamification.
    function sessionExercises(session) {
      const flatMap = {};
      [...flatExs(session?.mornExercises), ...flatExs(session?.exercises)].forEach(ex => {
        if (!flatMap[ex.name]) flatMap[ex.name] = { name: ex.name, reps: [] };
        flatMap[ex.name].reps.push(...ex.reps);
      });

      // Import/legacy safety: some sessions may have richer trainBlocks data while
      // flat exercises[] is stale or incomplete. Fill only missing exercise names
      // from blocks to avoid double-counting when both sources are in sync.
      const blockMap = {};
      const blocks = Array.isArray(session?.trainBlocks)
        ? session.trainBlocks
        : (session?.blocks || []);
      blocks.forEach(b => (b.exercises || []).forEach(ex => {
        const reps = (Array.isArray(ex.reps) ? ex.reps : []).filter(v => typeof v === 'number' && v > 0);
        if (!reps.length) return;
        if (!blockMap[ex.name]) blockMap[ex.name] = { name: ex.name, reps: [] };
        blockMap[ex.name].reps.push(...reps);
      }));

      const merged = { ...flatMap };
      Object.keys(blockMap).forEach((name) => {
        if (!merged[name] || merged[name].reps.length === 0) merged[name] = blockMap[name];
      });

      return Object.values(merged);
    }
    const exTotalReps = ex => (Array.isArray(ex.reps) ? ex.reps : []).reduce((a,v) => a + (v || 0), 0);
    const exSetCount  = ex => (Array.isArray(ex.reps) ? ex.reps : []).filter(v => v > 0).length;
    function sessionTotalReps(session) { return sessionExercises(session).reduce((a,ex) => a + exTotalReps(ex), 0); }

    // Migrate schema 2 (blocks) → schema 3 (mornExercises + exercises)
    function migrateSession(s) {
      if (Array.isArray(s.exercises) || Array.isArray(s.mornExercises)) {
        // Backfill per-exercise `done` (added later). An exercise counts as done if
        // it already has the flag, or its section/session was marked complete.
        const fill = (exs, sectionDone) => (exs || []).map(ex =>
          typeof ex.done === "boolean" ? ex : { ...ex, done: !!(sectionDone || s.done) });
        // Migration: old `type` field (A/B toggle) → new `routineDayLetter` + `isRecoveryDay`
        // If old `type` exists but new fields don't, use `type` as routine letter and assume no recovery.
        const migrated = {
          ...s,
          exercises:     fill(s.exercises, s.done),
          mornExercises: fill(s.mornExercises, s.mornDone),
          mornCollapsed: s.mornCollapsed ?? false,
        };
        if (s.type && !migrated.routineDayLetter) {
          migrated.routineDayLetter = s.type;
          migrated.isRecoveryDay = false; // Conservative: assume no forced recovery
          delete migrated.type;
        }
        return migrated;
      }
      const toFlat = (exs) => exs.map(ex => ({ name: ex.name, target: ex.reps[0]||10, reps: ex.reps, done: true }));
      const mornMap = {}, mainMap = {};
      (s.blocks || []).forEach(b => {
        const target = b.slot === "morning" ? mornMap : mainMap;
        (b.exercises || []).forEach(ex => {
          const vals = (Array.isArray(ex.reps)?ex.reps:[]).filter(v=>typeof v==='number'&&v>0);
          if (!target[ex.name]) target[ex.name] = { name: ex.name, target: ex.target||10, reps: [] };
          target[ex.name].reps.push(...vals);
        });
      });
      const { blocks: _b, ...rest } = s;
      return {
        ...rest,
        mornExercises: toFlat(Object.values(mornMap)),
        exercises: toFlat(Object.values(mainMap)),
        mornCollapsed: false,
      };
    }

    function lastTargetsFromSessions(sessions, beforeDate) {
      const out = {};
      [...sessions]
        .filter(s => !beforeDate || s.date < beforeDate)
        .sort((a,b) => b.date.localeCompare(a.date))
        .forEach(s => sessionExercises(s).forEach(ex => {
          if (!(ex.name in out) && ex.reps.length) out[ex.name] = ex.reps;
        }));
      return out;
    }

    // Most recently logged additional weight (kg) per exercise name. Weight is an
    // optional per-exercise attribute — bodyweight exercises simply carry none.
    function lastWeightsFromSessions(sessions, beforeDate) {
      const out = {};
      const collect = (exs) => (exs || []).forEach(ex => {
        if (!(ex.name in out) && typeof ex.weight === 'number' && ex.weight > 0) out[ex.name] = ex.weight;
      });
      [...sessions]
        .filter(s => !beforeDate || s.date < beforeDate)
        .sort((a,b) => b.date.localeCompare(a.date))
        .forEach(s => {
          (Array.isArray(s.trainBlocks) ? s.trainBlocks : []).forEach(b => collect(b.exercises));
          collect(s.exercises);
          collect(s.mornExercises);
        });
      return out;
    }
    const lastSession = sessions => [...(sessions||[])].sort((a,b) => a.date.localeCompare(b.date)).pop() || null;

    function calcTopExercises(sessions) {
      const cnt = {};
      sessions.forEach(s => sessionExercises(s).forEach(ex => {
        if (!cnt[ex.name]) cnt[ex.name] = { sets: 0, reps: 0 };
        cnt[ex.name].sets += exSetCount(ex);
        cnt[ex.name].reps += exTotalReps(ex);
      }));
      return Object.entries(cnt).sort((a,b) => b[1].reps - a[1].reps);
    }
    function calcExerciseProgression(sessions, name) {
      const out = [];
      [...sessions].sort((a,b) => a.date.localeCompare(b.date)).forEach(s => {
        const found = sessionExercises(s).find(ex => ex.name === name);
        if (found) out.push({ date: s.date, reps: exTotalReps(found) });
      });
      return out.slice(-10);
    }
    function calcWeeklyVolume(sessions) {
      const wks = {};
      sessions.forEach(s => {
        const d = new Date(s.date + "T12:00:00"); d.setDate(d.getDate() - d.getDay());
        const k = d.toISOString().slice(0, 10);
        wks[k] = (wks[k] || 0) + sessionTotalReps(s);
      });
      return Object.entries(wks).sort((a,b) => a[0].localeCompare(b[0])).slice(-10);
    }
    function calcLast28(sessions) {
      const map = {}; sessions.forEach(s => { map[s.date] = s; });
      return Array.from({ length: 28 }, (_,i) => ({ date: dateOffsetStr(27-i), entry: map[dateOffsetStr(27-i)] || null }));
    }

    // ─── LLM training-evaluation export ──────────────────────────────────────────
    // Builds a compact CSV journal plus a ready-to-use prompt asking an LLM to
    // evaluate the training. Kept intentionally terse (no JSON overhead).
    function buildLlmExport(sessions, body, plan) {
      const b = body || {};
      const esc = (v) => {
        const s = String(v ?? "").trim();
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      };

      const rows = [];
      [...(sessions || [])].sort((a, c) => a.date.localeCompare(c.date)).forEach((s) => {
        const day = s.routineDayLetter || s.type || "";
        const rec = s.isRecoveryDay ? 1 : 0;
        const addRow = (section, ex) => {
          const reps = (Array.isArray(ex.reps) ? ex.reps : []).filter((v) => typeof v === "number" && v > 0);
          if (!reps.length) return;
          const total = reps.reduce((x, v) => x + v, 0);
          const w = typeof ex.weight === "number" && ex.weight > 0 ? ex.weight : "";
          rows.push([s.date, day, rec, section, esc(ex.name), w, reps.length, total, reps.join("|")].join(","));
        };
        (s.mornExercises || []).forEach((ex) => addRow("morn", ex));
        (s.exercises || []).forEach((ex) => addRow("train", ex));
      });

      const prompt = [
        "You are an experienced strength & conditioning coach specialising in calisthenics and grease-the-groove training.",
        "Evaluate the training journal below. Assess overall progress and volume trends, balance across movement patterns (push / pull / legs / core), training frequency and recovery, and whether the current approach fits the athlete's body data and goal.",
        "Then give concrete, prioritised recommendations: what to keep, what to change (exercise selection, reps / sets, added weight, frequency, rest), and any red flags.",
        "Be specific and reference the numbers.",
        "",
        "AFTER the written evaluation, ALSO output an updated training setup as a single JSON code block so it can be imported back into the app. Use exactly this schema:",
        "```json",
        '{ "trainingSetup": { "blocks": [ { "name": "Pull-Ups", "everyNDays": 1, "repeatCount": 5, "pauseDays": 2, "exercises": [ { "name": "Pull-ups", "weight": 0 } ] } ] } }',
        "```",
        "JSON rules: everyNDays = interval in days (1 = daily, 2 = every second day); repeatCount = how many times before a pause; pauseDays = rest days after the repeats (0 = ongoing, no pause); weight in kg (0 = bodyweight). Keep block names short and only include blocks you recommend.",
        "",
      ].join("\n");

      const athlete = [
        "ATHLETE",
        "sex,height_cm,weight_kg,age,goal",
        [esc(b.sex), esc(b.height), esc(b.weight), esc(b.age), esc(b.goal)].join(","),
        "",
      ].join("\n");

      const currentSetup = plan && Array.isArray(plan.templates) ? [
        "CURRENT SETUP (for reference — adjust as needed and return in the JSON block above)",
        "```json",
        JSON.stringify({ trainingSetup: { blocks: plan.templates.map((t) => ({
          name: t.name,
          everyNDays: t.everyNDays,
          repeatCount: t.repeatCount,
          pauseDays: t.pauseDays,
          exercises: (t.exerciseNames || []).map((n) => ({ name: n, weight: (t.exerciseWeights || {})[n] || 0 })),
        })) } }),
        "```",
        "",
      ].join("\n") : "";

      const log = [
        "TRAINING LOG (one row per exercise per day; reps within the day separated by |)",
        "date,day,recovery,section,exercise,weight_kg,sets,total_reps,reps",
        ...(rows.length ? rows : ["(no logged training yet)"]),
      ].join("\n");

      return prompt + athlete + currentSetup + log + "\n";
    }


    function sessionCountsForHeatmap(session) {
      if (!session) return false;
      if (session.done || session.mornDone) return true;
      if ((session.mornExercises || []).some((ex) => ex?.done === true)) return true;
      if ((session.exercises || []).some((ex) => ex?.done === true)) return true;
      const blocks = Array.isArray(session.trainBlocks) ? session.trainBlocks : [];
      if (blocks.some((block) => block?.startedAt != null)) return true;
      if (blocks.some((block) => (block.exercises || []).some((ex) => ex?.done === true))) return true;
      return false;
    }

    function sessionHasTraining(session) {
      if (!session) return false;
      if (session.done) return true;
      if ((session.exercises || []).some((ex) => ex?.done === true)) return true;
      const blocks = Array.isArray(session.trainBlocks) ? session.trainBlocks : [];
      if (blocks.some((block) => block?.startedAt != null)) return true;
      if (blocks.some((block) => (block.exercises || []).some((ex) => ex?.done === true))) return true;
      return false;
    }

    // ─── Exercise categories ─────────────────────────────────────────────────────
    const EXERCISE_CATEGORIES = {
      "Pull":      ["Pull-ups", "Table Rows", "Muscle-ups", "Hanging Leg Raises"],
      "Push":     ["Push-ups", "Pike Push-ups", "Handstand Push-ups", "Dips", "Tricep Dips"],
      "Legs":     ["Squats", "Lunges"],
      "Core":     ["Crunches", "Leg Raises", "Plank (sets)", "L-Sit"],
      "Full Body": ["Burpees", "Mountain Climbers"],
    };

    // ─── Data shapes ─────────────────────────────────────────────────────────────
    const mkEx      = (name = "Push-ups", t = 10) => ({ name, target: t, reps: [t], done: false });
    const mkSup     = () => ({ creatine: false, midProtein: false, eveCombo: false });
    // WHY: `type` parameter is now actually routineDayLetter (A/B/C...), and caller also passes isRecovery
    // separately. Create session with new field names for schema v4.
    const mkSession = (date, routineDayLetter, exercises, mornExercises, isRecoveryDay = false) =>
      ({ date, routineDayLetter, isRecoveryDay, mornExercises: mornExercises || [], exercises: exercises || [], supps: mkSup(), done: false, mornDone: false, mornCollapsed: false, notes: "" });

    // ─── Training blocks (grease the groove) ─────────────────────────────────────
    // A block = one batch of sets you do, then rest (cooldown) before the next block.
    // blocks are the source of truth for the training section; session.exercises is
    // kept as the flattened union of all block exercises so all existing
    // stats/gamification/history code keeps working unchanged.
    let _blockSeq = 0;
    const mkBlockId = () => `b${Date.now().toString(36)}${(_blockSeq++).toString(36)}`;
    const mkBlock   = (exercises, label = null, templateId = null) => ({ id: mkBlockId(), label, templateId, exercises: exercises || [mkEx("Pull-ups")], startedAt: null, collapsed: false });

    // Flatten blocks → a single exercises[] array, keeping one entry per block-exercise pair.
    // Same-named exercises across different blocks are NOT merged so the history editor
    // shows them as separate rows (e.g. 2 × Push-ups 3×10, not 1 × Push-ups 6×10).
    function flattenBlocks(blocks) {
      const result = [];
      (blocks || []).forEach(b => (b.exercises || []).forEach(ex => {
        const reps = (Array.isArray(ex.reps) ? ex.reps : []).filter(v => typeof v === 'number' && v > 0);
        const flat = { name: ex.name, target: ex.target || 10, reps, done: ex.done || false };
        if (typeof ex.weight === 'number' && ex.weight > 0) flat.weight = ex.weight;
        result.push(flat);
      }));
      return result;
    }

    // Read the training blocks out of a session, synthesising one block from the
    // flat exercises[] for sessions saved before blocks existed.
    function sessionBlocks(session) {
      if (Array.isArray(session?.trainBlocks) && session.trainBlocks.length) return session.trainBlocks;
      const exs = Array.isArray(session?.exercises) ? session.exercises : [];
      return [{ id: mkBlockId(), label: null, templateId: null, exercises: exs.length ? exs : [mkEx("Pull-ups")], startedAt: null, collapsed: false }];
    }

    function mkExFromTargets(exNames, lt, lastWeights = {}, templateWeights = {}) {
      return (exNames || []).map(name => {
        const prev = lt[name];
        const reps = Array.isArray(prev) && prev.length ? prev : [];
        // Last logged weight takes precedence over the configured template weight.
        const carried = lastWeights[name];
        const configured = templateWeights[name];
        const weight = (typeof carried === 'number' && carried > 0) ? carried
                     : (typeof configured === 'number' && configured > 0) ? configured
                     : undefined;
        const ex = { name, target: reps[0] || 10, reps: [], suggestedReps: reps, done: false };
        if (typeof weight === 'number') ex.weight = weight;
        return ex;
      });
    }

    // ─── Tokens ──────────────────────────────────────────────────────────────────
    const ACC = "#b8f500", RED = "#ff5555", BG = "#080808", CARD = "#111", BDR = "#2a2a2a";
    const GOLD = "#ffd700", PURPLE = "#9b59b6";
    const mono = { fontFamily: "'JetBrains Mono', monospace" };
    const cond = { fontFamily: "'Barlow Condensed', sans-serif" };
    const lbl9 = { fontSize: 11, letterSpacing: 3, color: "#aaa" };

    // ─── Exercise mutators (schema 3 — flat array) ───────────────────────────────
    const mutSetRep = (E,ei,si,v) => E.map((ex,k)=>k!==ei?ex:{...ex,reps:ex.reps.map((r,l)=>l===si?v:r)});
    const mutDelRep = (E,ei,si)   => E.map((ex,k)=>k!==ei?ex:{...ex,reps:ex.reps.filter((_,l)=>l!==si)});
    // Optional additional weight (kg). A value <= 0 clears it back to bodyweight.
    const mutSetWeight = (E,ei,w) => E.map((ex,k)=>{
      if (k!==ei) return ex;
      const next = {...ex};
      if (typeof w === 'number' && w > 0) next.weight = w; else delete next.weight;
      return next;
    });
    const mutAddEx  = (E)         => [...E, mkEx()];
    const mutDelEx  = (E,ei)      => E.filter((_,k)=>k!==ei);
    const mutAddRep = (E,ei)      => E.map((ex,k)=> {
      if (k !== ei) return ex;
      const suggested = (Array.isArray(ex.suggestedReps) ? ex.suggestedReps : []).filter(v => typeof v === 'number' && v > 0);
      const reps = Array.isArray(ex.reps) ? ex.reps : [];
      const next = suggested[reps.length] || (reps.length>0 ? reps[reps.length-1] : ex.target);
      return {...ex,reps:[...reps, next]};
    });
    const mutName   = (E,ei,n)    => E.map((ex,k)=>k!==ei?ex:{...ex,name:n});
    const mutToggleDone = (E,ei)  => E.map((ex,k)=>k!==ei?ex:{...ex,done:!ex.done});
    const mutTarget = (E,ei,d)    => E.map((ex,k)=>k!==ei?ex:{...ex,target:Math.max(1,ex.target+d)});

    // ─── Block mutators ──────────────────────────────────────────────────────────
    // Each maps one block's exercises[] through an ExRow-style mutator.
    const mutBlockEx  = (B,bi,fn)   => B.map((b,k)=>k!==bi?b:{...b,exercises:fn(b.exercises)});
    const mutCheckBlock = (B,bi,ts) => B.map((b,k)=>k!==bi?b:{...b,startedAt:ts,collapsed:true,exercises:b.exercises.map(ex=>({...ex,done:true}))});
    const mutUncheckBlock = (B,bi) => B.map((b,k)=>k!==bi?b:{...b,startedAt:null,collapsed:false,exercises:b.exercises.map(ex=>({...ex,done:false}))});
    const mutToggleCollapse = (B,bi) => B.map((b,k)=>k!==bi?b:{...b,collapsed:!b.collapsed});
    const mutSetCollapseAll = (B,v) => B.map(b=>({...b,collapsed:v}));
    const mutBlockStart = (B,bi,ts) => B.map((b,k)=>k!==bi?b:{...b,startedAt:ts});
    const mutAddBlock = (B)         => [...B, mkBlock()];
    const mutDelBlock = (B,bi)      => B.filter((_,k)=>k!==bi);
