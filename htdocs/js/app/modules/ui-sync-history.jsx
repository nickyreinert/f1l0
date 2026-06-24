    // ─── SyncLed ──────────────────────────────────────────────────────────────────
    function SyncLed() {
      const [state, setState] = useState({ ...window._authState });
      useEffect(() => {
        const h = (e) => setState({ ...e.detail });
        window.addEventListener("authStateChanged", h);
        return () => window.removeEventListener("authStateChanged", h);
      }, []);

      if (!window._fbAuth) return null;

      const handleClick = async () => {
        if (!state.user) {
          await window._signInWithGoogle();
        } else if (!state.syncing) {
          await window.storage.syncFromCloud();
        }
      };

      const color = !state.user ? "#c0392b" : state.syncing ? "#e67e22" : "#27ae60";
      const title = !state.user ? "No sync – click to sign in" : state.syncing ? "Syncing…" : "Sync active – click to sync now";

      return (
        <button
          onClick={handleClick}
          title={title}
          style={{ background:"none", border:"none", cursor:"pointer", padding:0, display:"flex", alignItems:"center", justifyContent:"center", width:18, height:18 }}
        >
          <div style={{
            width:8, height:8, borderRadius:"50%",
            background: color,
            boxShadow: `0 0 4px 1px ${color}`,
            transition:"background 0.4s, box-shadow 0.4s"
          }} />
        </button>
      );
    }

    function HistoryExerciseEditor({ exs, setExs, label, lbl9, mono, BDR }) {
      const rowStyle = { display:"grid", gridTemplateColumns:"1fr 110px 28px", gap:6, alignItems:"center", marginBottom:6 };
      const parseReps = (str) => String(str).split(/[\s,]+/).map(s => parseInt(s,10)).filter(n => Number.isFinite(n) && n > 0);
      return (
        <>
          <div style={{ ...lbl9, marginBottom:8, marginTop:16 }}>{label}</div>
          <div style={{ ...rowStyle, marginBottom:4 }}>
            <div style={{ ...mono, fontSize:11, color:"#888" }}>EXERCISE</div>
            <div style={{ ...mono, fontSize:11, color:"#888", textAlign:"center" }}>REPS / SET</div>
            <div/>
          </div>
          {exs.map((ex, i) => (
            <div key={i} style={rowStyle}>
              <input type="text" value={ex.name} onChange={ev => setExs(exs.map((x,j)=>j===i?{...x,name:ev.target.value}:x))} placeholder="Exercise"
                style={{ background:"#1a1a1a", border:`1px solid ${BDR}`, color:"#ddd", padding:"6px 8px", borderRadius:3, outline:"none", fontSize:12, width:"100%", boxSizing:"border-box", ...mono }} />
              <input type="text" inputMode="text"
                value={ex.repsRaw !== undefined ? ex.repsRaw : (ex.reps||[]).join(", ")}
                onChange={ev => setExs(exs.map((x,j)=>j===i?{...x,repsRaw:ev.target.value}:x))}
                onBlur={ev => {
                  const r = parseReps(ev.target.value);
                  setExs(exs.map((x,j)=>j===i?{...x,repsRaw:undefined,reps:r,target:r[0]||x.target||10}:x));
                }}
                placeholder="z.B. 8, 7, 6"
                style={{ background:"#1a1a1a", border:`1px solid ${BDR}`, color:"#ddd", padding:"6px 8px", borderRadius:3, outline:"none", fontSize:12, width:"100%", boxSizing:"border-box", ...mono }} />
              <button onClick={() => setExs(exs.filter((_,j)=>j!==i))} style={{ background:"none", border:`1px solid #661111`, color:"#aa4444", borderRadius:3, cursor:"pointer", fontSize:14, height:30, width:28, lineHeight:1 }}>×</button>
            </div>
          ))}
          <button onClick={() => setExs([...exs, {name:"",target:10,reps:[]}])} style={{ width:"100%", padding:"6px 0", background:"transparent", border:`1px dashed ${BDR}`, color:"#666", borderRadius:3, cursor:"pointer", fontSize:12, marginBottom:4 }}>+ {label}</button>
        </>
      );
    }

    function HistoryDayEditModal({ entry, onClose, onSave, lbl9, mono, cond, ACC, BG, BDR }) {
      const [draft, setDraft] = useState(entry);

      useEffect(() => {
        setDraft(entry);
      }, [entry]);

      if (!draft) return null;

      const trainExs = Array.isArray(draft.exercises) ? draft.exercises : [];
      const mExs     = Array.isArray(draft.mornExercises) ? draft.mornExercises : [];
      const trainBlocks = Array.isArray(draft.trainBlocks) && draft.trainBlocks.length
        ? draft.trainBlocks
        : (trainExs.length ? [mkBlock(trainExs, "Training")] : []);
      const setTrainExs = (v) => setDraft(prev => ({ ...prev, exercises: v }));
      const setMExs     = (v) => setDraft(prev => ({ ...prev, mornExercises: v }));
      const setTrainBlocks = (v) => setDraft(prev => ({ ...prev, trainBlocks: v, exercises: flattenBlocks(v) }));

      return (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.92)", zIndex:3000, display:"flex", alignItems:"flex-end" }} onClick={onClose}>
          <div style={{ background:"#111", width:"100%", borderRadius:"14px 14px 0 0", maxHeight:"80vh", display:"flex", flexDirection:"column" }} onClick={ev => ev.stopPropagation()}>
            <div style={{ padding:"16px 20px 12px", borderBottom:`1px solid ${BDR}`, display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
              <div style={{ ...mono, fontSize:11, color:ACC, letterSpacing:2 }}>{draft.date}</div>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ display:"flex", borderRadius:3, overflow:"hidden", border:`1px solid ${BDR}` }}>
                  {["A","B"].map(t => <button key={t} onClick={() => setDraft(prev => ({...prev, type:t}))} style={{ padding:"4px 12px", background: draft.type===t ? (t==="A"?ACC:"#ff5555") : "transparent", border:"none", color: draft.type===t ? BG : "#888", fontSize:11, fontWeight:700, cursor:"pointer", ...mono }}>{t}</button>)}
                </div>
                <button onClick={onClose} style={{ background:"none", border:"none", color:"#666", fontSize:20, cursor:"pointer", lineHeight:1, padding:"0 4px" }}>×</button>
              </div>
            </div>
            <div style={{ overflowY:"auto", padding:"16px 20px 32px", flex:1, minHeight:0 }}>
              <div style={{ ...mono, fontSize:11, color:"#666", marginBottom:8 }}>Separate reps per set with commas — e.g. <span style={{ color:"#999" }}>8, 7, 6</span> = 3 sets.</div>
              <HistoryExerciseEditor exs={mExs} setExs={setMExs} label="MORNING WORKOUT" lbl9={lbl9} mono={mono} BDR={BDR} />
              {trainBlocks.length > 0 ? (
                <>
                  {trainBlocks.map((block, idx) => (
                    <div key={block.id || idx} style={{ marginTop:16, paddingTop:8, borderTop: idx === 0 ? "none" : `1px solid ${BDR}` }}>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:10 }}>
                        <div style={{ ...lbl9 }}>{String(block.label || `TRAINING BLOCK ${idx + 1}`).toUpperCase()}</div>
                        <button
                          onClick={() => setTrainBlocks(trainBlocks.filter((_, blockIdx) => blockIdx !== idx))}
                          style={{ background:"none", border:`1px solid #661111`, color:"#aa4444", borderRadius:3, cursor:"pointer", fontSize:12, padding:"4px 8px" }}
                        >REMOVE BLOCK</button>
                      </div>
                      <HistoryExerciseEditor
                        exs={Array.isArray(block.exercises) ? block.exercises : []}
                        setExs={(v) => setTrainBlocks(trainBlocks.map((item, blockIdx) => blockIdx !== idx ? item : { ...item, exercises: v }))}
                        label="TRAINING"
                        lbl9={lbl9}
                        mono={mono}
                        BDR={BDR}
                      />
                    </div>
                  ))}
                  <button
                    onClick={() => setTrainBlocks([...trainBlocks, mkBlock([mkEx()], `Training Block ${trainBlocks.length + 1}`)])}
                    style={{ width:"100%", padding:"6px 0", background:"transparent", border:`1px dashed ${BDR}`, color:"#666", borderRadius:3, cursor:"pointer", fontSize:12, marginTop:8 }}
                  >+ TRAINING BLOCK</button>
                </>
              ) : (
                <HistoryExerciseEditor exs={trainExs} setExs={setTrainExs} label="TRAINING" lbl9={lbl9} mono={mono} BDR={BDR} />
              )}
              <button onClick={() => onSave({ ...draft, exercises: trainBlocks.length > 0 ? flattenBlocks(trainBlocks) : trainExs, trainBlocks: trainBlocks.length > 0 ? trainBlocks : undefined, mornExercises: mExs })} style={{ width:"100%", padding:14, background:ACC, color:BG, border:"none", borderRadius:4, cursor:"pointer", fontSize:14, fontWeight:900, letterSpacing:3, ...cond, marginTop:16 }}>SAVE</button>
            </div>
          </div>
        </div>
      );
    }

