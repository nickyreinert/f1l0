    // ─── Rest Timer ──────────────────────────────────────────────────────────────
    function playDone() {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const freqs = [880, 1100, 1320];
        freqs.forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain); gain.connect(ctx.destination);
          osc.type = "sine";
          osc.frequency.value = freq;
          const t = ctx.currentTime + i * 0.18;
          gain.gain.setValueAtTime(0, t);
          gain.gain.linearRampToValueAtTime(0.35, t + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
          osc.start(t); osc.stop(t + 0.5);
        });
      } catch {}
    }

    function RestTimer({ seconds, onDone, onSkip }) {
      const endAt = useRef(Date.now() + seconds * 1000);
      const [remaining, setRemaining] = useState(seconds);
      const doneRef = useRef(false);

      useEffect(() => {
        const id = setInterval(() => {
          const left = Math.ceil((endAt.current - Date.now()) / 1000);
          if (left <= 0) {
            clearInterval(id);
            setRemaining(0);
            if (!doneRef.current) { doneRef.current = true; playDone(); onDone(); }
          } else {
            setRemaining(left);
          }
        }, 500);
        return () => clearInterval(id);
      }, []);

      const pct = ((seconds - remaining) / seconds) * 100;
      const urgentColor = remaining <= 10 ? RED : ACC;

      return (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.96)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", zIndex:5000 }} onClick={onSkip}>
          <div style={{ textAlign:"center", padding:"0 32px" }} onClick={e => e.stopPropagation()}>
            <div style={{ ...mono, fontSize:11, color:"#555", letterSpacing:4, marginBottom:24 }}>PAUSE</div>
            <div style={{ position:"relative", width:200, height:200, margin:"0 auto 32px" }}>
              <svg width="200" height="200" style={{ position:"absolute", inset:0 }}>
                <circle cx="100" cy="100" r="90" fill="none" stroke="#1a1a1a" strokeWidth="8" />
                <circle cx="100" cy="100" r="90" fill="none" stroke={urgentColor} strokeWidth="8"
                  strokeDasharray={`${2 * Math.PI * 90}`}
                  strokeDashoffset={`${2 * Math.PI * 90 * (pct / 100)}`}
                  strokeLinecap="round"
                  transform="rotate(-90 100 100)"
                  style={{ transition:"stroke-dashoffset 1s linear, stroke 0.3s" }}
                />
              </svg>
              <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
                <span style={{ ...mono, fontSize:72, fontWeight:700, color: urgentColor, lineHeight:1 }}>{remaining}</span>
              </div>
            </div>
            <button onClick={onSkip} style={{ padding:"14px 40px", background:"transparent", border:`1px solid #333`, color:"#888", borderRadius:4, cursor:"pointer", fontSize:13, letterSpacing:3, ...cond }}>SKIP</button>
          </div>
        </div>
      );
    }

    // ─── Cooldown countdown (block header) ───────────────────────────────────────
    // Shows how long is left until startedAt + cooldownMs. Ticks once per second.
    function fmtCountdown(ms) {
      if (ms <= 0) return "BEREIT";
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      return h > 0 ? `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}` : `${m}:${String(s).padStart(2,"0")}`;
    }
    function Cooldown({ startedAt, cooldownMs }) {
      const [now, setNow] = useState(Date.now());
      useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
      }, []);
      const remaining = startedAt + cooldownMs - now;
      const ready = remaining <= 0;
      return (
        <span style={{ ...mono, fontSize:14, fontWeight:700, color: ready ? ACC : "#e8a000", letterSpacing:1 }}>
          {ready ? "✓ BEREIT" : `⏳ ${fmtCountdown(remaining)}`}
        </span>
      );
    }

    // ─── Start-time edit modal ───────────────────────────────────────────────────
    // Big buttons to pick the hour, plus four buttons for 0/15/30/45 minutes.
    // Sets the moment the cooldown *started* (finish = start + cooldown).
    function StartTimeModal({ startedAt, onConfirm, onClose }) {
      const init = new Date(startedAt);
      const [hour, setHour] = useState(init.getHours());
      const [min, setMin]   = useState(Math.floor(init.getMinutes() / 15) * 15);
      const confirm = () => {
        const d = new Date(startedAt);
        d.setHours(hour, min, 0, 0);
        onConfirm(d.getTime());
      };
      const hours = Array.from({ length: 24 }, (_, i) => i);
      const hBtn = (h) => ({
        height:46, background: h===hour ? ACC : "#1a1a1a", border:`1px solid ${h===hour ? ACC : "#333"}`,
        color: h===hour ? BG : "#ccc", fontSize:17, fontWeight:700, borderRadius:4, cursor:"pointer", ...mono,
      });
      const mBtn = (m) => ({
        flex:1, height:64, background: m===min ? ACC : "#1a1a1a", border:`1px solid ${m===min ? ACC : "#333"}`,
        color: m===min ? BG : "#ccc", fontSize:22, fontWeight:700, borderRadius:4, cursor:"pointer", ...mono, minWidth:0,
      });
      return (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.92)", display:"flex", alignItems:"flex-end", zIndex:2200 }} onClick={onClose}>
          <div style={{ background:"#111", width:"100%", borderRadius:"14px 14px 0 0", padding:"20px 16px 32px", maxHeight:"88vh", overflowY:"auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ ...mono, fontSize:11, color:"#555", letterSpacing:4, marginBottom:6 }}>STARTZEIT BEARBEITEN</div>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"center", marginBottom:18, minHeight:56, background:"#0a0a0a", borderRadius:6, border:`1px solid #333` }}>
              <span style={{ ...mono, fontSize:40, fontWeight:700, color:"#fff", letterSpacing:2 }}>{String(hour).padStart(2,"0")}:{String(min).padStart(2,"0")}</span>
            </div>
            <div style={{ ...lbl9, marginBottom:8 }}>STUNDE</div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(6, 1fr)", gap:6, marginBottom:18 }}>
              {hours.map(h => <button key={h} style={hBtn(h)} onClick={() => setHour(h)}>{String(h).padStart(2,"0")}</button>)}
            </div>
            <div style={{ ...lbl9, marginBottom:8 }}>MINUTE</div>
            <div style={{ display:"flex", gap:8, marginBottom:18 }}>
              {[0,15,30,45].map(m => <button key={m} style={mBtn(m)} onClick={() => setMin(m)}>{String(m).padStart(2,"0")}</button>)}
            </div>
            <button onClick={confirm} style={{ width:"100%", padding:16, background:ACC, color:BG, border:"none", borderRadius:4, fontSize:18, fontWeight:900, letterSpacing:3, cursor:"pointer", ...cond }}>OK</button>
          </div>
        </div>
      );
    }

    // ─── Tree SVG ─────────────────────────────────────────────────────────────────
    function TreeSVG({ stage, size = 120 }) {
      const s = size;
      const trees = [
        // stage 0: Seed
        () => (
          <svg width={s} height={s} viewBox="0 0 100 100">
            <ellipse cx="50" cy="72" rx="18" ry="8" fill="#1a1a00" opacity="0.5"/>
            <ellipse cx="50" cy="68" rx="10" ry="12" fill="#3d2b1f"/>
            <path d="M44 68 Q50 45 56 68" fill="#4a8c10" opacity="0.7"/>
          </svg>
        ),
        // stage 1: Sprout
        () => (
          <svg width={s} height={s} viewBox="0 0 100 100" className="tree-sway">
            <ellipse cx="50" cy="82" rx="22" ry="6" fill="#1a1a00" opacity="0.4"/>
            <rect x="48" y="55" width="4" height="28" fill="#5c3d2e" rx="2"/>
            <ellipse cx="50" cy="50" rx="16" ry="14" fill="#4a8c10"/>
            <ellipse cx="50" cy="44" rx="11" ry="10" fill="#5aaa18"/>
          </svg>
        ),
        // stage 2: Young Tree
        () => (
          <svg width={s} height={s} viewBox="0 0 100 100" className="tree-sway">
            <ellipse cx="50" cy="88" rx="26" ry="6" fill="#1a1a00" opacity="0.4"/>
            <rect x="46" y="52" width="8" height="38" fill="#6b4423" rx="3"/>
            <ellipse cx="50" cy="48" rx="22" ry="18" fill="#3d7a08"/>
            <ellipse cx="50" cy="38" rx="16" ry="14" fill="#4a8c10"/>
            <ellipse cx="50" cy="30" rx="10" ry="10" fill="#5aaa18"/>
          </svg>
        ),
        // stage 3: Mature Tree
        () => (
          <svg width={s} height={s} viewBox="0 0 100 100" className="tree-sway">
            <ellipse cx="50" cy="90" rx="30" ry="6" fill="#1a1a00" opacity="0.4"/>
            <rect x="44" y="48" width="12" height="44" fill="#7a4f2e" rx="4"/>
            <rect x="32" y="62" width="8" height="5" fill="#7a4f2e" rx="2"/>
            <rect x="60" y="58" width="8" height="5" fill="#7a4f2e" rx="2"/>
            <ellipse cx="50" cy="44" rx="30" ry="22" fill="#2d6004"/>
            <ellipse cx="50" cy="34" rx="22" ry="18" fill="#3d7a08"/>
            <ellipse cx="50" cy="24" rx="14" ry="13" fill="#4a8c10"/>
            <ellipse cx="38" cy="50" rx="12" ry="10" fill="#3a7505" opacity="0.8"/>
            <ellipse cx="62" cy="48" rx="12" ry="10" fill="#3a7505" opacity="0.8"/>
          </svg>
        ),
        // stage 4: Large Tree
        () => (
          <svg width={s} height={s} viewBox="0 0 100 100" className="tree-sway">
            <ellipse cx="50" cy="92" rx="34" ry="7" fill="#1a1a00" opacity="0.5"/>
            <rect x="42" y="44" width="16" height="50" fill="#8b5e3c" rx="5"/>
            <rect x="28" y="58" width="14" height="6" fill="#8b5e3c" rx="3"/>
            <rect x="58" y="54" width="14" height="6" fill="#8b5e3c" rx="3"/>
            <ellipse cx="50" cy="40" rx="36" ry="26" fill="#255200"/>
            <ellipse cx="50" cy="28" rx="26" ry="20" fill="#2d6004"/>
            <ellipse cx="50" cy="18" rx="17" ry="15" fill="#3d7a08"/>
            <ellipse cx="32" cy="46" rx="14" ry="12" fill="#255200" opacity="0.9"/>
            <ellipse cx="68" cy="44" rx="14" ry="12" fill="#255200" opacity="0.9"/>
            <ellipse cx="50" cy="10" rx="10" ry="9" fill="#4a8c10"/>
          </svg>
        ),
        // stage 5: Ancient Tree
        () => (
          <svg width={s} height={s} viewBox="0 0 100 100" className="tree-sway">
            <ellipse cx="50" cy="93" rx="38" ry="7" fill="#1a1a00" opacity="0.6"/>
            <rect x="40" y="38" width="20" height="57" fill="#4a2c0a" rx="6"/>
            <rect x="22" y="55" width="18" height="7" fill="#4a2c0a" rx="3"/>
            <rect x="60" y="51" width="18" height="7" fill="#4a2c0a" rx="3"/>
            <rect x="26" y="62" width="12" height="5" fill="#4a2c0a" rx="2"/>
            <rect x="62" y="60" width="12" height="5" fill="#4a2c0a" rx="2"/>
            <ellipse cx="50" cy="35" rx="40" ry="28" fill="#1a3d00"/>
            <ellipse cx="50" cy="22" rx="30" ry="22" fill="#1e4d00"/>
            <ellipse cx="50" cy="12" rx="20" ry="16" fill="#255200"/>
            <ellipse cx="28" cy="42" rx="16" ry="14" fill="#1a3d00" opacity="0.95"/>
            <ellipse cx="72" cy="40" rx="16" ry="14" fill="#1a3d00" opacity="0.95"/>
            <ellipse cx="50" cy="5" rx="12" ry="10" fill="#2d6004"/>
            <circle cx="35" cy="32" r="3" fill="#ffd700" opacity="0.6"/>
            <circle cx="65" cy="28" r="3" fill="#ffd700" opacity="0.6"/>
            <circle cx="50" cy="20" r="4" fill="#ffd700" opacity="0.7"/>
            <circle cx="42" cy="40" r="2" fill="#ffd700" opacity="0.5"/>
            <circle cx="58" cy="38" r="2" fill="#ffd700" opacity="0.5"/>
          </svg>
        ),
      ];
      return trees[Math.min(stage, trees.length - 1)]();
    }

    // ─── XP Bar ──────────────────────────────────────────────────────────────────
    function XPBar({ progress, animate }) {
      const [width, setWidth] = useState(animate ? 0 : progress.pct);
      useEffect(() => {
        if (animate) { const t = setTimeout(() => setWidth(progress.pct), 100); return () => clearTimeout(t); }
        else setWidth(progress.pct);
      }, [progress.pct, animate]);
      return (
        <div style={{ position: "relative" }}>
          <div style={{ height: 8, background: "#1a1a1a", borderRadius: 4, overflow: "hidden", border: "1px solid #2a2a2a" }}>
            <div style={{
              height: "100%", borderRadius: 4,
              background: `linear-gradient(90deg, ${ACC}, #d4ff40)`,
              width: `${width}%`,
              transition: "width 1.2s cubic-bezier(0.34, 1.56, 0.64, 1)",
              boxShadow: `0 0 8px ${ACC}88`,
            }}/>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            <span style={{ ...mono, fontSize: 9, color: "#666" }}>{progress.current} XP</span>
            <span style={{ ...mono, fontSize: 9, color: "#666" }}>{progress.needed} XP</span>
          </div>
        </div>
      );
    }

    // ─── Level Up Overlay ────────────────────────────────────────────────────────
    function LevelUpOverlay({ level, onDone }) {
      const tree = window.LevelManager.treeStage(level);
      useEffect(() => {
        const t = setTimeout(onDone, 3500);
        return () => clearTimeout(t);
      }, []);
      return (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.95)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 9000 }} onClick={onDone}>
          <div style={{ animation: "levelUp 0.6s cubic-bezier(0.34,1.56,0.64,1) forwards", textAlign: "center" }}>
            <div style={{ ...mono, fontSize: 10, color: ACC, letterSpacing: 6, marginBottom: 12 }}>LEVEL UP</div>
            <div style={{ fontSize: 96, fontWeight: 900, ...cond, color: ACC, letterSpacing: -4, lineHeight: 1, marginBottom: 8 }}>{level}</div>
            <TreeSVG stage={tree.stage} size={140} />
            <div style={{ fontSize: 22, fontWeight: 700, ...cond, color: "#ddd", marginTop: 8, letterSpacing: 2 }}>{tree.name.toUpperCase()}</div>
            <div style={{ ...mono, fontSize: 10, color: "#666", marginTop: 16 }}>Tap to continue</div>
          </div>
        </div>
      );
    }

    // ─── Achievement Toast ────────────────────────────────────────────────────────
    function AchievementToast({ achievement, onDone }) {
      useEffect(() => {
        const t = setTimeout(onDone, 4000);
        return () => clearTimeout(t);
      }, []);
      return (
        <div style={{
          position: "fixed", top: 0, left: "50%", transform: "translateX(-50%)",
          zIndex: 8000, width: "min(480px, 100vw)", padding: "0 16px",
          animation: "achievementSlide 4s ease forwards",
          pointerEvents: "none",
        }}>
          <div style={{ background: "#1a1200", border: `1px solid ${GOLD}`, borderRadius: 8, padding: "14px 18px", display: "flex", alignItems: "center", gap: 14, marginTop: 12 }}>
            <div style={{ fontSize: 32 }}>{achievement.icon}</div>
            <div>
              <div style={{ ...mono, fontSize: 9, color: GOLD, letterSpacing: 4, marginBottom: 2 }}>ACHIEVEMENT UNLOCKED</div>
              <div style={{ fontSize: 18, fontWeight: 900, ...cond, color: "#f0f0ed" }}>{achievement.label}</div>
              <div style={{ fontSize: 12, color: "#aaa", ...cond }}>{achievement.desc}</div>
            </div>
          </div>
        </div>
      );
    }

    // ─── XP Popup ────────────────────────────────────────────────────────────────
    function XPPopup({ events, onDone }) {
      useEffect(() => {
        const t = setTimeout(onDone, 3200);
        return () => clearTimeout(t);
      }, []);
      const xpEvents  = events.filter(e => e.type === "xp" || e.type === "pr" || e.type === "improvement" || e.type === "weeklyBonus");
      const totalXP   = xpEvents.reduce((s, e) => s + (e.amount || e.analysis?.xpBonus || 0), 0);
      return (
        <div style={{ position: "fixed", bottom: 120, right: 20, zIndex: 7000, animation: "levelUp 0.4s ease forwards" }}>
          <div style={{ background: "#0d1a00", border: `1px solid ${ACC}`, borderRadius: 8, padding: "12px 16px", minWidth: 160 }}>
            <div style={{ ...mono, fontSize: 11, color: ACC, fontWeight: 700, marginBottom: 6 }}>+{totalXP} XP</div>
            {xpEvents.map((e, i) => (
              <div key={i} style={{ ...mono, fontSize: 9, color: "#888", marginBottom: 2 }}>
                {e.type === "xp" && `${e.reason} +${e.amount}`}
                {e.type === "pr" && `PR: ${e.name} +${e.analysis?.xpBonus || 50}`}
                {e.type === "improvement" && `↑ ${e.name} +${e.analysis?.xpBonus}`}
                {e.type === "weeklyBonus" && `Weekly Bonus +${e.amount}`}
              </div>
            ))}
          </div>
        </div>
      );
    }

    // ─── Positive Insights ───────────────────────────────────────────────────────
    function calcInsights(snap, sessions) {
      const insights = [];
      if (!snap) return insights;
      const { streakState, stats } = snap;

      if (streakState?.current > 0 && streakState.current === streakState.longest && streakState.current > 3) {
        insights.push("Longest streak ever.");
      }
      if (stats?.totalWorkouts > 0 && stats.totalWorkouts % 10 === 0) {
        insights.push(`${stats.totalWorkouts} workouts completed.`);
      }
      if (stats?.totalPRs > 0 && stats.totalPRs % 5 === 0) {
        insights.push(`${stats.totalPRs} personal records broken.`);
      }

      // Weekly volume insight
      if (sessions && sessions.length >= 14) {
        const thisWeekStart = dateOffsetStr(6);
        const lastWeekStart = dateOffsetStr(13);
        const thisWeekReps  = sessions.filter(s => s.date >= thisWeekStart).reduce((a,s) => a + sessionTotalReps(s), 0);
        const lastWeekReps  = sessions.filter(s => s.date >= lastWeekStart && s.date < thisWeekStart).reduce((a,s) => a + sessionTotalReps(s), 0);
        if (lastWeekReps > 0 && thisWeekReps > lastWeekReps * 1.1) {
          insights.push("Most active week in recent history.");
        }
      }

      return insights.slice(0, 2);
    }

    // ─── RPG Panel ───────────────────────────────────────────────────────────────
    function RPGPanel({ snap, sessions, animateXP }) {
      if (!snap) return <div style={{ ...mono, fontSize: 10, color: "#555", padding: 20 }}>Loading…</div>;
      const { level, progress, streakState, available, achState, stats } = snap;
      const tree     = window.LevelManager.treeStage(level);
      const insights = calcInsights(snap, sessions);
      const unlocked = Object.keys(achState?.unlocked || {});
      const allDefs  = window.AchievementManager.DEFINITIONS;

      return (
        <div style={{ paddingBottom: 20 }}>
          {/* Tree + Level */}
          <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 24 }}>
            <div style={{ flexShrink: 0 }}>
              <TreeSVG stage={tree.stage} size={100} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 2 }}>
                <div style={{ fontSize: 52, fontWeight: 900, ...cond, color: ACC, lineHeight: 1, letterSpacing: -2 }}>{level}</div>
                <div style={{ ...mono, fontSize: 10, color: "#666" }}>LEVEL</div>
              </div>
              <div style={{ fontSize: 13, ...cond, color: "#888", letterSpacing: 2, marginBottom: 10 }}>{tree.name.toUpperCase()}</div>
              <XPBar progress={progress} animate={animateXP} />
            </div>
          </div>

          {/* Insights */}
          {insights.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              {insights.map((ins, i) => (
                <div key={i} style={{ background: "#0d1a00", border: `1px solid #2a4a00`, borderRadius: 6, padding: "10px 14px", marginBottom: 6, display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: ACC, flexShrink: 0 }}/>
                  <div style={{ ...cond, fontSize: 14, color: "#b0cc80" }}>{ins}</div>
                </div>
              ))}
            </div>
          )}

          {/* Streak */}
          <div style={{ ...lbl9, marginBottom: 10 }}>STREAK</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 20 }}>
            <div style={{ background: "#0a0a0a", border: `1px solid ${BDR}`, borderRadius: 6, padding: "12px 10px" }}>
              <div style={{ ...lbl9, marginBottom: 4 }}>NOW</div>
              <div style={{ ...mono, fontSize: 26, fontWeight: 700, color: ACC, lineHeight: 1 }}>{streakState?.current || 0}</div>
              <div style={{ fontSize: 10, color: "#666", marginTop: 3 }}>days</div>
            </div>
            <div style={{ background: "#0a0a0a", border: `1px solid ${BDR}`, borderRadius: 6, padding: "12px 10px" }}>
              <div style={{ ...lbl9, marginBottom: 4 }}>BEST</div>
              <div style={{ ...mono, fontSize: 26, fontWeight: 700, color: "#888", lineHeight: 1 }}>{streakState?.longest || 0}</div>
              <div style={{ fontSize: 10, color: "#666", marginTop: 3 }}>days</div>
            </div>
            <div style={{ background: "#0a0a0a", border: `1px solid ${BDR}`, borderRadius: 6, padding: "12px 10px" }}>
              <div style={{ ...lbl9, marginBottom: 4 }}>REST</div>
              <div style={{ ...mono, fontSize: 26, fontWeight: 700, color: available > 0 ? "#4a8c4a" : "#555", lineHeight: 1 }}>{available}/{window.RecoveryManager.MAX_RECOVERY}</div>
              <div style={{ fontSize: 10, color: "#666", marginTop: 3 }}>recovery</div>
            </div>
          </div>

          {/* Lifetime Stats */}
          <div style={{ ...lbl9, marginBottom: 10 }}>LIFETIME</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
            {[
              { label: "WORKOUTS",   val: stats?.totalWorkouts || 0 },
              { label: "ACTIVE DAYS",val: stats?.totalActiveDays || 0 },
              { label: "TOTAL REPS", val: (stats?.totalReps || 0).toLocaleString("de") },
              { label: "RECORDS",    val: stats?.totalPRs || 0 },
              { label: "TOTAL XP",   val: (stats?.totalXP || 0).toLocaleString("de") },
              { label: "RECOVERY",   val: stats?.totalRecoveryDaysUsed || 0 },
            ].map(({ label, val }) => (
              <div key={label} style={{ background: "#0a0a0a", border: `1px solid ${BDR}`, borderRadius: 6, padding: "12px 10px" }}>
                <div style={{ ...lbl9, marginBottom: 4 }}>{label}</div>
                <div style={{ ...mono, fontSize: 20, fontWeight: 700, color: ACC, lineHeight: 1 }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Achievements */}
          <div style={{ ...lbl9, marginBottom: 10 }}>ACHIEVEMENTS  {unlocked.length}/{allDefs.length}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {allDefs.map(def => {
              const isUnlocked = !!achState?.unlocked?.[def.id];
              if (!isUnlocked && def.hidden) {
                return (
                  <div key={def.id} style={{ background: "#0a0a0a", border: `1px solid #1a1a1a`, borderRadius: 6, padding: "12px 10px", opacity: 0.4 }}>
                    <div style={{ fontSize: 22, marginBottom: 4 }}>?</div>
                    <div style={{ ...cond, fontSize: 13, color: "#444" }}>Hidden</div>
                  </div>
                );
              }
              const unlockDate = isUnlocked ? new Date(achState.unlocked[def.id]).toLocaleDateString("en-US") : null;
              return (
                <div key={def.id} style={{ background: isUnlocked ? "#1a1200" : "#0a0a0a", border: `1px solid ${isUnlocked ? "#4a3800" : "#1a1a1a"}`, borderRadius: 6, padding: "12px 10px", opacity: isUnlocked ? 1 : 0.35 }}>
                  <div style={{ fontSize: 22, marginBottom: 4 }}>{def.icon}</div>
                  <div style={{ ...cond, fontSize: 14, fontWeight: 700, color: isUnlocked ? "#f0f0ed" : "#555", marginBottom: 2 }}>{def.label}</div>
                  <div style={{ ...cond, fontSize: 11, color: isUnlocked ? "#aaa" : "#444", marginBottom: isUnlocked ? 4 : 0 }}>{def.desc}</div>
                  {isUnlocked && <div style={{ ...mono, fontSize: 8, color: "#666" }}>{unlockDate}</div>}
                </div>
              );
            })}
          </div>
        </div>
      );
    }

