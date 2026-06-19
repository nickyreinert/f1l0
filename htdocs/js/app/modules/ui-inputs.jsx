    // ─── DialPad ─────────────────────────────────────────────────────────────────
    function DialPad({ initialValue, onConfirm, onDelete, onClose }) {
      const [val, setVal] = useState(String(initialValue ?? ""));
      const press = d => setVal(v => v.length >= 4 ? v : v + d);
      const back  = () => setVal(v => v.slice(0, -1));
      const confirm = () => {
        const n = parseInt(val, 10);
        if (!isNaN(n) && n >= 1) onConfirm(n);
        else if (val === "") onConfirm(initialValue);
      };
      useEffect(() => {
        const handleKeyDown = (e) => {
          if (e.key === "Escape") { e.preventDefault(); onClose(); }
          else if (e.key === "Backspace") { e.preventDefault(); back(); }
          else if (e.key === "Enter") { e.preventDefault(); confirm(); }
          else if (e.key === "Delete") { e.preventDefault(); onDelete(); }
          else if (/^\d$/.test(e.key)) { e.preventDefault(); press(e.key); }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
      }, [val]);
      const btnStyle = (col) => ({
        flex:1, height:64, background:"#1a1a1a", border:`1px solid #333`,
        color: col || "#f0f0ed", fontSize:26, fontWeight:700, borderRadius:4,
        cursor:"pointer", ...mono, minWidth:0,
      });
      return (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.92)", display:"flex", alignItems:"flex-end", zIndex:2000 }} onClick={onClose}>
          <div style={{ background:"#111", width:"100%", borderRadius:"14px 14px 0 0", padding:"20px 16px 32px" }} onClick={e => e.stopPropagation()}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"center", marginBottom:16, minHeight:56, background:"#0a0a0a", borderRadius:6, border:`1px solid #333` }}>
              <span style={{ ...mono, fontSize:40, fontWeight:700, color: val ? "#fff" : "#555", letterSpacing:2 }}>{val || "—"}</span>
            </div>
            <div style={{ display:"flex", gap:8, marginBottom:8 }}>
              {["1","2","3"].map(d => <button key={d} style={btnStyle()} onClick={() => press(d)}>{d}</button>)}
            </div>
            <div style={{ display:"flex", gap:8, marginBottom:8 }}>
              {["4","5","6"].map(d => <button key={d} style={btnStyle()} onClick={() => press(d)}>{d}</button>)}
            </div>
            <div style={{ display:"flex", gap:8, marginBottom:8 }}>
              {["7","8","9"].map(d => <button key={d} style={btnStyle()} onClick={() => press(d)}>{d}</button>)}
            </div>
            <div style={{ display:"flex", gap:8, marginBottom:12 }}>
              <button style={btnStyle(RED)} onClick={onDelete}>✕</button>
              <button style={btnStyle()} onClick={() => press("0")}>0</button>
              <button style={btnStyle("#aaa")} onClick={back}>⌫</button>
            </div>
            <button onClick={confirm} style={{ width:"100%", padding:16, background:ACC, color:BG, border:"none", borderRadius:4, fontSize:18, fontWeight:900, letterSpacing:3, cursor:"pointer", ...cond }}>OK</button>
          </div>
        </div>
      );
    }

    // ─── RepTile ─────────────────────────────────────────────────────────────────
    function RepTile({ value, disabled, onClick }) {
      const displayVal = typeof value === 'number' ? value : (value ? "1" : "0");
      return (
        <button onClick={onClick} disabled={disabled} style={{
          width:54, height:54, borderRadius:4, flexShrink:0,
          border:`2px solid ${ACC}`,
          background:"#0d1a00",
          color: ACC,
          ...mono, fontWeight:700, fontSize:20,
          cursor: disabled ? "default" : "pointer",
        }}>{displayVal}</button>
      );
    }

    // ─── AddTile ─────────────────────────────────────────────────────────────────
    function AddTile({ onClick }) {
      return (
        <button onClick={onClick} style={{
          width:54, height:54, background:"transparent", border:`2px dashed #444`,
          color:"#aaa", borderRadius:4, cursor:"pointer", fontSize:24, lineHeight:1,
          fontWeight:700, ...mono, flexShrink:0,
        }}>+</button>
      );
    }

    // ─── ExRow ───────────────────────────────────────────────────────────────────
    function ExRow({ ex, disabled, onSetRep, onDelRep, onOpenModal, onDelete, canDelete, onAddRep, onRepAdded, onToggleDone }) {
      const [dialIdx, setDialIdx] = useState(null);
      const [pendingNewRep, setPendingNewRep] = useState(false);
      const [confirmDelete, setConfirmDelete] = useState(false);
      const openDial = (i) => { if (!disabled) setDialIdx(i); };
      const closeDial = () => { setDialIdx(null); setPendingNewRep(false); };
      const confirmRep = (v) => { if (dialIdx !== null) { onSetRep(dialIdx, v); setDialIdx(null); setPendingNewRep(false); } };
      const deleteRep = () => { if (dialIdx !== null) { onDelRep(dialIdx); setDialIdx(null); setPendingNewRep(false); } };

      const openNewDial = () => {
        if (disabled) return;
        const newIdx = ex.reps.length;
        onAddRep();
        setPendingNewRep(true);
        setDialIdx(newIdx);
      };

      // Once the new rep lands in ex.reps, the dialIdx is valid — clear the pending flag.
      useEffect(() => {
        if (pendingNewRep && dialIdx !== null && dialIdx < ex.reps.length) {
          setPendingNewRep(false);
        }
      }, [ex.reps.length]);

      const isDialOpen = dialIdx !== null && (dialIdx < ex.reps.length || pendingNewRep);

      const dialInitial = isDialOpen
        ? (() => {
            const v = ex.reps[dialIdx];
            if (typeof v === 'number') return v;
            if (typeof v === 'boolean') return v ? ex.target : 0;
            return ex.reps.length > 0 ? ex.reps[ex.reps.length - 1] : ex.target;
          })()
        : null;

      const handleConfirmRep = (v) => {
        confirmRep(v);
        if (onRepAdded) onRepAdded();
      };

      return (
        <div style={{ marginBottom:18 }}>
          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:10 }}>
            <button onClick={() => !disabled && onToggleDone && onToggleDone()} title={ex.done ? "Done" : "Mark as done"} style={{ width:38, height:38, flexShrink:0, borderRadius:3, border:`2px solid ${ex.done ? ACC : "#666"}`, background: ex.done ? ACC : "transparent", cursor: disabled ? "default" : "pointer", display:"flex", alignItems:"center", justifyContent:"center", padding:0 }}>
              {ex.done && <span style={{ color:BG, fontSize:18, fontWeight:700, lineHeight:1 }}>✓</span>}
            </button>
            <button onClick={onOpenModal} style={{ flex:1, background:"#1a1a1a", border:`1px solid #333`, color:"#e0e0e0", padding:"9px 12px", fontSize:14, ...cond, borderRadius:3, outline:"none", textAlign:"left", cursor:"pointer", fontWeight:500 }}>{ex.name}</button>
            {canDelete && <button onClick={() => setConfirmDelete(true)} title="Delete" style={{ width:38, height:38, background:CARD, border:`1px solid #444`, color:"#ff6b6b", borderRadius:3, cursor:"pointer", fontSize:18, lineHeight:1, display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>}
          </div>
          <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap", opacity: ex.done ? 1 : 0.4 }}>
            {ex.reps.map((v,i) => (
              <RepTile key={i} value={v} disabled={disabled} onClick={() => openDial(i)} />
            ))}
            <AddTile onClick={openNewDial} />
          </div>
          {isDialOpen && (
            <DialPad
              initialValue={dialInitial}
              onConfirm={handleConfirmRep}
              onDelete={deleteRep}
              onClose={closeDial}
            />
          )}
          {confirmDelete && (
            <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.88)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:3000, padding:"0 24px" }} onClick={() => setConfirmDelete(false)}>
              <div style={{ background:"#111", border:`1px solid #333`, borderRadius:10, padding:"28px 24px", width:"100%", maxWidth:360 }} onClick={e => e.stopPropagation()}>
                <div style={{ fontSize:15, color:"#ddd", marginBottom:24, lineHeight:1.5, ...cond }}>"{ex.name}" entfernen?</div>
                <div style={{ display:"flex", gap:10 }}>
                  <button onClick={() => setConfirmDelete(false)} style={{ flex:1, padding:14, background:"transparent", border:`1px solid #444`, color:"#aaa", borderRadius:4, cursor:"pointer", fontSize:13, letterSpacing:2, ...cond }}>ABBRECHEN</button>
                  <button onClick={() => { setConfirmDelete(false); onDelete(); }} style={{ flex:1, padding:14, background:"#2a0000", border:`1px solid ${RED}`, color:RED, borderRadius:4, cursor:"pointer", fontSize:13, letterSpacing:2, fontWeight:700, ...cond }}>ENTFERNEN</button>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    // ─── ExerciseModal ───────────────────────────────────────────────────────────
    function ExerciseModal({ open, onClose, onSelect, recentlyUsed, customExercises, onAddCustom, exerciseImages, onImageUpdate }) {
      const [filter, setFilter]       = useState("Pull");
      const [search, setSearch]       = useState("");
