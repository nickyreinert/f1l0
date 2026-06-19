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
      if (ms <= 0) return "Ready";
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
          {ready ? "✓ READY" : `⏳ ${fmtCountdown(remaining)}`}
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


