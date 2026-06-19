  // ═══════════════════════════════════════════════════════════════════════════════
  // GAMIFICATION ENGINE
  // ═══════════════════════════════════════════════════════════════════════════════

  // ─── StorageManager ──────────────────────────────────────────────────────────
  window.StorageManager = {
    async get(key) {
      try {
        const r = await window.storage.get("rpg_" + key);
        return r ? JSON.parse(r.value) : null;
      } catch { return null; }
    },
    async set(key, val) {
      try { await window.storage.set("rpg_" + key, JSON.stringify(val)); } catch {}
    },
    async getAll() {
      const keys = ["xp","level","streaks","recovery","achievements","exerciseHistory","statistics"];
      const out = {};
      for (const k of keys) { out[k] = await this.get(k); }
      return out;
    }
  };

  // ─── XPManager ───────────────────────────────────────────────────────────────
  window.XPManager = {
    XP_VALUES: {
      workout:              50,
      morning:              20,
      weeklyConsistency:   200,
      pr:                   50,
      improvementSmall:      5,
      improvementModerate:  15,
      improvementMajor:     25,
    },

    async getState() {
      return await StorageManager.get("xp") || { total: 0, history: [] };
    },

    async award(amount, reason) {
      const state = await this.getState();
      state.total += amount;
      state.history.push({ amount, reason, date: new Date().toISOString().slice(0,10), ts: Date.now() });
      if (state.history.length > 500) state.history = state.history.slice(-500);
      await StorageManager.set("xp", state);
      return state.total;
    },

    async getTotal() {
      const s = await this.getState();
      return s.total;
    }
  };

  // ─── LevelManager ────────────────────────────────────────────────────────────
  window.LevelManager = {
    calcLevel(totalXP) {
      return Math.floor(Math.sqrt(totalXP / 100)) + 1;
    },

    xpForLevel(level) {
      return Math.pow(level - 1, 2) * 100;
    },

    xpForNextLevel(level) {
      return Math.pow(level, 2) * 100;
    },

    progressToNext(totalXP) {
      const level     = this.calcLevel(totalXP);
      const currentFloor = this.xpForLevel(level);
      const nextFloor    = this.xpForNextLevel(level);
      const span         = nextFloor - currentFloor;
      const earned       = totalXP - currentFloor;
      return { level, current: earned, needed: span, pct: Math.min(100, (earned / span) * 100) };
    },

    async getState() {
      return await StorageManager.get("level") || { level: 1, leveledUpAt: null };
    },

    async sync(totalXP) {
      const state     = await this.getState();
      const newLevel  = this.calcLevel(totalXP);
      const didLevel  = newLevel > state.level;
      if (newLevel > state.level) {
        state.level      = newLevel;
        state.leveledUpAt = Date.now();
        await StorageManager.set("level", state);
      }
      return { state, didLevel, newLevel };
    },

    treeStage(level) {
      if (level < 5)  return { name: "Seed",        stage: 0 };
      if (level < 10) return { name: "Sprout",       stage: 1 };
      if (level < 20) return { name: "Young Tree",   stage: 2 };
      if (level < 40) return { name: "Mature Tree",  stage: 3 };
      if (level < 60) return { name: "Large Tree",   stage: 4 };
      return              { name: "Ancient Tree",  stage: 5 };
    }
  };

  // ─── StreakManager ────────────────────────────────────────────────────────────
  window.StreakManager = {
    async getState() {
      return await StorageManager.get("streaks") || {
        current: 0,
        longest: 0,
        totalActiveDays: 0,
        lastActiveDate: null,
        activeDates: []
      };
    },

    async recordActiveDay(dateStr) {
      const state  = await this.getState();
      const recovery = await RecoveryManager.getState();

      if (state.activeDates.includes(dateStr)) return { state, wasNew: false };

      state.activeDates.push(dateStr);
      if (state.activeDates.length > 1000) state.activeDates = state.activeDates.slice(-1000);

      const yesterday = this._offsetDate(dateStr, -1);
      const dayBefore  = this._offsetDate(dateStr, -2);

      const wasActiveYesterday = state.activeDates.includes(yesterday);
      const wasActiveDay2      = state.activeDates.includes(dayBefore);
      const recoveryUsedYday   = (recovery.usedDates || []).includes(yesterday);
      const recoveryUsedDay2   = (recovery.usedDates || []).includes(dayBefore);

      if (wasActiveYesterday || recoveryUsedYday) {
        state.current++;
      } else if (wasActiveDay2 && recoveryUsedYday) {
        state.current++;
      } else {
        state.current = 1;
      }

      state.longest        = Math.max(state.longest, state.current);
      state.totalActiveDays = (state.totalActiveDays || 0) + 1;
      state.lastActiveDate  = dateStr;

      await StorageManager.set("streaks", state);
      return { state, wasNew: true };
    },

    _offsetDate(dateStr, days) {
      const d = new Date(dateStr + "T12:00:00");
      d.setDate(d.getDate() + days);
      return d.toISOString().slice(0, 10);
    }
  };

  // ─── RecoveryManager ─────────────────────────────────────────────────────────
  window.RecoveryManager = {
    MAX_RECOVERY: 2,
    WINDOW_DAYS: 14,

    async getState() {
      return await StorageManager.get("recovery") || {
        usedDates: [],
        totalUsed: 0
      };
    },

    async useRecoveryDay(dateStr) {
      const state   = await this.getState();
      const streaks = await StreakManager.getState();

      if (state.usedDates.includes(dateStr)) return { ok: false, reason: "already_used" };

      const available = await this.getAvailable();
      if (available <= 0) return { ok: false, reason: "none_available" };

      state.usedDates.push(dateStr);
      state.totalUsed = (state.totalUsed || 0) + 1;
      await StorageManager.set("recovery", state);

      // Extend the streak
      if (streaks.current > 0) {
        streaks.current++;
        streaks.longest = Math.max(streaks.longest, streaks.current);
        await StorageManager.set("streaks", streaks);
      }

      return { ok: true };
    },

    async getAvailable() {
      const state   = await this.getState();
      const cutoff  = new Date();
      cutoff.setDate(cutoff.getDate() - this.WINDOW_DAYS);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      const usedInWindow = (state.usedDates || []).filter(d => d >= cutoffStr).length;
      return Math.max(0, this.MAX_RECOVERY - usedInWindow);
    }
  };

  // ─── ProgressionAnalyzer ─────────────────────────────────────────────────────
  window.ProgressionAnalyzer = {
    async getHistory() {
      return await StorageManager.get("exerciseHistory") || {};
    },

    async recordSession(exerciseName, value, metric, date) {
      const hist = await this.getHistory();
      if (!hist[exerciseName]) hist[exerciseName] = [];
      hist[exerciseName].push({ value, metric, date, ts: Date.now() });
      if (hist[exerciseName].length > 500) hist[exerciseName] = hist[exerciseName].slice(-500);
      await StorageManager.set("exerciseHistory", hist);
    },

    async analyze(exerciseName, currentValue) {
      const hist       = await this.getHistory();
      const sessions   = (hist[exerciseName] || []).slice(0, -1); // exclude just-recorded
      if (sessions.length === 0) return { isPR: true, improvement: null, xpBonus: XPManager.XP_VALUES.pr };

      const allVals   = sessions.map(s => s.value);
      const pr        = Math.max(...allVals);
      const isPR      = currentValue > pr;

      // Recent 30-day avg
      const cutoff    = new Date(); cutoff.setDate(cutoff.getDate() - 30);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      const recent    = sessions.filter(s => s.date >= cutoffStr).map(s => s.value);
      const recentAvg = recent.length > 0 ? recent.reduce((a,b) => a+b, 0) / recent.length : null;

      if (isPR) {
        return { isPR: true, improvement: recentAvg ? ((currentValue - recentAvg) / recentAvg) * 100 : null,
                 xpBonus: XPManager.XP_VALUES.pr };
      }

      if (recentAvg !== null) {
        const pct = ((currentValue - recentAvg) / recentAvg) * 100;
        if (pct >= 20)  return { isPR: false, improvement: pct, xpBonus: XPManager.XP_VALUES.improvementMajor };
        if (pct >= 10)  return { isPR: false, improvement: pct, xpBonus: XPManager.XP_VALUES.improvementModerate };
        if (pct >= 5)   return { isPR: false, improvement: pct, xpBonus: XPManager.XP_VALUES.improvementSmall };
      }

      return { isPR: false, improvement: null, xpBonus: 0 };
    },

    async getBest30Days(exerciseName) {
      const hist    = await this.getHistory();
      const sessions = hist[exerciseName] || [];
      const cutoff  = new Date(); cutoff.setDate(cutoff.getDate() - 30);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      const recent  = sessions.filter(s => s.date >= cutoffStr).map(s => s.value);
      return recent.length > 0 ? Math.max(...recent) : null;
    },

    async getAllTimePR(exerciseName) {
      const hist   = await this.getHistory();
      const vals   = (hist[exerciseName] || []).map(s => s.value);
      return vals.length > 0 ? Math.max(...vals) : null;
    }
  };

  // ─── StatisticsManager ───────────────────────────────────────────────────────
  window.StatisticsManager = {
    async getState() {
      return await StorageManager.get("statistics") || {
        totalXP: 0,
        totalWorkouts: 0,
        totalActiveDays: 0,
        totalMinutes: 0,
        totalReps: 0,
        totalDistance: 0,
        totalPRs: 0,
        totalRecoveryDaysUsed: 0,
        exerciseTotals: {}
      };
    },

    async record({ xpEarned, reps, exerciseName, isPR, isMorning }) {
      const stats = await this.getState();
      stats.totalXP          = (stats.totalXP || 0) + (xpEarned || 0);
      stats.totalReps        = (stats.totalReps || 0) + (reps || 0);
      if (isPR) stats.totalPRs = (stats.totalPRs || 0) + 1;
      if (exerciseName && reps) {
        if (!stats.exerciseTotals) stats.exerciseTotals = {};
        stats.exerciseTotals[exerciseName] = (stats.exerciseTotals[exerciseName] || 0) + reps;
      }
      await StorageManager.set("statistics", stats);
      return stats;
    },

    async recordWorkoutComplete(isMorning) {
      const stats = await this.getState();
      if (isMorning) {
        // morning counted in active days
      } else {
        stats.totalWorkouts = (stats.totalWorkouts || 0) + 1;
      }
      await StorageManager.set("statistics", stats);
    },

    async recordActiveDayComplete() {
      const stats = await this.getState();
      stats.totalActiveDays = (stats.totalActiveDays || 0) + 1;
      await StorageManager.set("statistics", stats);
    },

    async addXP(amount) {
      const stats = await this.getState();
      stats.totalXP = (stats.totalXP || 0) + amount;
      await StorageManager.set("statistics", stats);
    }
  };

  // ─── AchievementManager ──────────────────────────────────────────────────────
  window.AchievementManager = {
    DEFINITIONS: [
      // Consistency
      { id: "first_workout",    label: "First Step",         desc: "Logged your first workout",          icon: "🏋️", hidden: false, check: (s) => s.totalWorkouts >= 1 },
      { id: "streak_7",         label: "7-Day Streak",       desc: "7 consecutive active days",          icon: "🔥", hidden: false, check: (_, str) => str.current >= 7 || str.longest >= 7 },
      { id: "streak_30",        label: "30-Day Streak",      desc: "30 consecutive active days",         icon: "💫", hidden: false, check: (_, str) => str.current >= 30 || str.longest >= 30 },
      { id: "streak_100",       label: "Century",            desc: "100 consecutive active days",        icon: "👑", hidden: false, check: (_, str) => str.current >= 100 || str.longest >= 100 },
      // Progress
      { id: "first_pr",         label: "Personal Best",      desc: "First personal record",              icon: "⭐", hidden: false, check: (s) => s.totalPRs >= 1 },
      { id: "pr_10",            label: "10 Records",         desc: "Smashed 10 personal records",        icon: "🌟", hidden: false, check: (s) => s.totalPRs >= 10 },
      { id: "pr_50",            label: "50 Records",         desc: "50 personal records broken",         icon: "✨", hidden: true,  check: (s) => s.totalPRs >= 50 },
      // Volume
      { id: "pushups_1k",       label: "Push-up Thousand",   desc: "1,000 total pushups",                icon: "💪", hidden: false, check: (s) => ((s.exerciseTotals?.["Push-ups"] || 0) + (s.exerciseTotals?.["Liegestütze"] || 0)) >= 1000 },
      { id: "pushups_10k",      label: "Push-up Legend",     desc: "10,000 total pushups",               icon: "🦾", hidden: true,  check: (s) => ((s.exerciseTotals?.["Push-ups"] || 0) + (s.exerciseTotals?.["Liegestütze"] || 0)) >= 10000 },
      { id: "squats_1k",        label: "Squat Master",       desc: "1,000 total squats",                 icon: "🦵", hidden: false, check: (s) => ((s.exerciseTotals?.["Squats"] || 0) + (s.exerciseTotals?.["Kniebeugen"] || 0)) >= 1000 },
      { id: "reps_10k",         label: "Volume King",        desc: "10,000 total reps",                  icon: "🏆", hidden: true,  check: (s) => s.totalReps >= 10000 },
      // Levels
      { id: "level_5",          label: "Level 5",            desc: "Reached level 5 — Sprout",           icon: "🌱", hidden: false, check: (_, __, lv) => lv >= 5 },
      { id: "level_10",         label: "Level 10",           desc: "Reached level 10 — Young Tree",      icon: "🌿", hidden: false, check: (_, __, lv) => lv >= 10 },
      { id: "level_25",         label: "Level 25",           desc: "Reached level 25 — Mature Tree",     icon: "🌳", hidden: false, check: (_, __, lv) => lv >= 25 },
      { id: "level_50",         label: "Level 50",           desc: "Reached level 50 — Large Tree",      icon: "🌲", hidden: true,  check: (_, __, lv) => lv >= 50 },
      // Dedication
      { id: "active_30",        label: "Month Warrior",      desc: "30 total active days",               icon: "📅", hidden: false, check: (s) => s.totalActiveDays >= 30 },
      { id: "active_100",       label: "100 Days",           desc: "100 total active days",              icon: "💯", hidden: false, check: (s) => s.totalActiveDays >= 100 },
      { id: "active_365",       label: "One Year",           desc: "365 total active days",              icon: "🗓️", hidden: true,  check: (s) => s.totalActiveDays >= 365 },
    ],

    async getState() {
      return await StorageManager.get("achievements") || { unlocked: {}, history: [] };
    },

    async check(stats, streaks, level) {
      const state  = await this.getState();
      const newly  = [];
      for (const def of this.DEFINITIONS) {
        if (state.unlocked[def.id]) continue;
        if (def.check(stats, streaks, level)) {
          state.unlocked[def.id] = Date.now();
          state.history.push({ id: def.id, unlockedAt: Date.now(), date: new Date().toISOString().slice(0,10) });
          newly.push(def);
        }
      }
      if (newly.length > 0) await StorageManager.set("achievements", state);
      return { state, newly };
    },

    getDefinition(id) {
      return this.DEFINITIONS.find(d => d.id === id);
    }
  };

  // ─── Main Gamification Orchestrator ──────────────────────────────────────────
  window.Gamification = {
    async processWorkoutComplete({ exerciseSessions, isMorning, date }) {
      const today    = date || new Date().toISOString().slice(0, 10);
      const slotKey  = today + (isMorning ? ":morning" : ":training");

      // Guard: only process each slot once per day
      const processed = await StorageManager.get("processedSlots") || [];
      if (processed.includes(slotKey)) {
        return { events: [], totalXP: 0, newTotal: await XPManager.getTotal(), newLevel: (await LevelManager.getState()).level };
      }
      processed.push(slotKey);
      if (processed.length > 200) processed.splice(0, processed.length - 200);
      await StorageManager.set("processedSlots", processed);

      const events   = [];
      let totalXP    = 0;
      let newPRs     = 0;

      // 1. Award base XP
      const baseXP = isMorning ? XPManager.XP_VALUES.morning : XPManager.XP_VALUES.workout;
      totalXP += baseXP;
      events.push({ type: "xp", amount: baseXP, reason: isMorning ? "Morning Workout" : "Training" });

      // 2. Analyze exercise progressions
      for (const { name, reps } of (exerciseSessions || [])) {
        if (!name || !reps || reps <= 0) continue;
        const analysis = await ProgressionAnalyzer.analyze(name, reps);
        await ProgressionAnalyzer.recordSession(name, reps, "reps", today);

        if (analysis.xpBonus > 0) {
          totalXP += analysis.xpBonus;
          events.push({ type: analysis.isPR ? "pr" : "improvement", name, reps, analysis });
          if (analysis.isPR) newPRs++;
        }

        await StatisticsManager.record({ reps, exerciseName: name, isPR: analysis.isPR });
      }

      // 3. Award XP
      const newTotal = await XPManager.award(totalXP, "workout");
      await StatisticsManager.addXP(totalXP);

      // 4. Level sync
      const { didLevel, newLevel } = await LevelManager.sync(newTotal);
      if (didLevel) events.push({ type: "levelUp", level: newLevel });

      // 5. Streak
      const { wasNew } = await StreakManager.recordActiveDay(today);

      // 6. Weekly consistency check
      if (!isMorning && wasNew) {
        const streakState = await StreakManager.getState();
        if (streakState.current > 0 && streakState.current % 7 === 0) {
          const bonusXP = XPManager.XP_VALUES.weeklyConsistency;
          await XPManager.award(bonusXP, "weekly_consistency");
          await StatisticsManager.addXP(bonusXP);
          totalXP += bonusXP;
          events.push({ type: "weeklyBonus", amount: bonusXP });
        }
      }

      // 7. Record workout
      await StatisticsManager.recordWorkoutComplete(isMorning);
      if (!isMorning) await StatisticsManager.recordActiveDayComplete();

      // 8. Check achievements
      const stats   = await StatisticsManager.getState();
      const streaks = await StreakManager.getState();
      const { newly } = await AchievementManager.check(stats, streaks, newLevel);
      if (newly.length > 0) events.push({ type: "achievements", list: newly });

      return { events, totalXP, newTotal, newLevel };
    },

    async getSnapshot() {
      const [xpState, levelState, streakState, recoveryState, achState, stats] = await Promise.all([
        XPManager.getState(),
        LevelManager.getState(),
        StreakManager.getState(),
        RecoveryManager.getState(),
        AchievementManager.getState(),
        StatisticsManager.getState()
      ]);
      const total     = xpState.total || 0;
      const level     = LevelManager.calcLevel(total);
      const progress  = LevelManager.progressToNext(total);
      const available = await RecoveryManager.getAvailable();
      return { xpState, level, progress, streakState, recoveryState, available, achState, stats };
    }
  };
