      const [customName, setCustomName] = useState("");
      const [pendingImg, setPendingImg] = useState(null);
      const imgInputRef = useRef(null);

      useEffect(() => {
        if (open) {
          setFilter(customExercises.length > 0 ? "Custom" : recentlyUsed.length > 0 ? "Recent" : "Pull");
          setSearch(""); setCustomName("");
        }
      }, [open]);

      if (!open) return null;

      const allCats = {
        "Custom":  customExercises,
        ...(recentlyUsed.length > 0 ? { "Recent": recentlyUsed } : {}),
        ...EXERCISE_CATEGORIES,
      };

      const activeFilter = search.trim() ? null : filter;
      let displayed;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const pool = [...new Set([...customExercises, ...recentlyUsed, ...Object.values(EXERCISE_CATEGORIES).flat()])];
        displayed = pool.filter(ex => ex.toLowerCase().includes(q));
      } else {
        displayed = [...(allCats[filter] || [])];
      }

      const handleAdd = () => {
        if (!customName.trim()) return;
        onAddCustom(customName.trim()); onSelect(customName.trim()); setCustomName(""); onClose();
      };

      const handleImgBtn = (exName, e) => {
        e.stopPropagation(); setPendingImg(exName); imgInputRef.current?.click();
      };

      const handleImageFile = async (e) => {
        const file = e.target.files?.[0];
        if (!file || !pendingImg) { setPendingImg(null); return; }
        e.target.value = '';
        try { const dataUrl = await resizeImageToDataURL(file, 96); onImageUpdate(pendingImg, dataUrl); }
        catch(err) { console.warn("Image resize failed:", err); }
        setPendingImg(null);
      };

      const catIcons = { "Custom":"★", "Recent":"⏱", "Pull":"↑", "Push":"→", "Legs":"⬇", "Core":"◎", "Full Body":"⊕" };

      return (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.94)", display:"flex", alignItems:"stretch", zIndex:2000 }} onClick={onClose}>
          <div style={{ background:"#111", width:"100%", display:"flex", flexDirection:"column" }} onClick={e => e.stopPropagation()}>

            {/* ── Header: title + search ── */}
            <div style={{ padding:"16px 20px 12px", borderBottom:`1px solid ${BDR}`, flexShrink:0 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                <div style={{ fontSize:22, fontWeight:900, letterSpacing:2, ...cond }}>SELECT EXERCISE</div>
                <button onClick={onClose} style={{ background:"none", border:"none", fontSize:30, cursor:"pointer", color:"#aaa", lineHeight:1, padding:"0 4px" }}>×</button>
              </div>
              <input type="search" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search…"
                style={{ width:"100%", padding:"10px 14px", background:"#1a1a1a", border:`1px solid ${BDR}`, color:"#ddd", borderRadius:4, outline:"none", fontSize:15, boxSizing:"border-box" }} />
            </div>

            {/* ── Body: sidebar + card grid ── */}
            <div style={{ display:"flex", flex:1, minHeight:0, overflow:"hidden" }}>

              {/* Left: categories */}
              <div style={{ width:76, flexShrink:0, overflowY:"auto", borderRight:`1px solid ${BDR}`, padding:"6px 4px", display:"flex", flexDirection:"column", gap:3 }}>
                {Object.keys(allCats).map(cat => (
                  <button key={cat} onClick={() => { setFilter(cat); setSearch(""); }}
                    style={{ width:"100%", padding:"10px 2px", background: activeFilter===cat ? ACC : "transparent",
                      color: activeFilter===cat ? BG : "#777", border:"none", borderRadius:4,
                      cursor:"pointer", fontSize:11, letterSpacing:1, fontWeight:700, ...cond,
                      textAlign:"center", lineHeight:1.4 }}>
                    <div style={{ fontSize:17, marginBottom:2 }}>{catIcons[cat] || "·"}</div>
                    {cat}
                  </button>
                ))}
              </div>

              {/* Right: exercise cards */}
              <div style={{ flex:1, overflowY:"auto", padding:10 }}>
                {displayed.length === 0
                  ? <div style={{ padding:"60px 0", textAlign:"center", color:"#444", ...mono, fontSize:12, letterSpacing:3 }}>
                      {search.trim() ? "NO RESULTS" : "NO EXERCISES"}
                    </div>
                  : <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(clamp(140px, 18%, 200px), 1fr))", gap:8 }}>
                      {displayed.map(ex => (
                        <button key={ex} onClick={() => { onSelect(ex); onClose(); }}
                          style={{ position:"relative", background:CARD, border:`1px solid ${BDR}`, borderRadius:6,
                            cursor:"pointer", padding:0, overflow:"hidden", textAlign:"center",
                            display:"flex", flexDirection:"column" }}>
                          {/* Illustration area */}
                          <div style={{ height:80, background:"#0d0d0d", display:"flex", alignItems:"center",
                            justifyContent:"center", overflow:"hidden", flexShrink:0 }}>
                            {exerciseImages?.[ex]
                              ? <img src={exerciseImages[ex]} alt="" style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }} />
                              : <span style={{ fontSize:32, opacity:0.12 }}>◉</span>}
                          </div>
                          {/* Exercise name */}
                          <div style={{ padding:"8px 6px", fontSize:15, fontWeight:700, color:"#e0e0e0",
                            ...cond, letterSpacing:0.5, lineHeight:1.2, flex:1, display:"flex",
                            alignItems:"center", justifyContent:"center" }}>
                            {ex}
                          </div>
                          {/* Image upload button */}
                          <div onClick={e => handleImgBtn(ex, e)}
                            style={{ position:"absolute", top:4, right:4, width:22, height:22,
                              background:"rgba(0,0,0,0.72)", borderRadius:3, display:"flex",
                              alignItems:"center", justifyContent:"center", cursor:"pointer",
                              fontSize:11, color: exerciseImages?.[ex] ? "#aaa" : "#555",
                              border:`1px solid ${exerciseImages?.[ex] ? "#555" : "#333"}` }}
                            title="Upload image">
                            📷
                          </div>
                        </button>
                      ))}
                    </div>
                }
              </div>
            </div>

            {/* ── Footer: add custom exercise ── */}
            <div style={{ padding:"12px 16px 20px", borderTop:`1px solid ${BDR}`, flexShrink:0 }}>
              <div style={{ display:"flex", gap:8, marginBottom:6 }}>
                <input value={customName} onChange={e => setCustomName(e.target.value)}
                  onKeyDown={e => e.key==="Enter" && handleAdd()}
                  placeholder="Add new exercise…"
                  style={{ flex:1, padding:"10px 12px", background:"#1a1a1a", border:`1px solid ${BDR}`,
                    color:"#ccc", borderRadius:3, outline:"none", fontSize:14, boxSizing:"border-box" }} />
                <button onClick={handleAdd}
                  style={{ padding:"10px 16px", background: customName.trim() ? ACC : "#1a1a1a",
                    color: customName.trim() ? BG : "#444",
                    border:`1px solid ${customName.trim() ? ACC : BDR}`, borderRadius:3,
                    cursor: customName.trim() ? "pointer" : "default", fontWeight:700, fontSize:18 }}>✓</button>
              </div>
              <div style={{ ...mono, fontSize:11, color:"#444" }}>New exercises will appear permanently under "Custom"</div>
            </div>

            <input ref={imgInputRef} type="file" accept="image/*" style={{ display:"none" }} onChange={handleImageFile} />
          </div>
        </div>
      );
    }

    // ─── ExercisesSection ────────────────────────────────────────────────────────
    function ExercisesSection({ exercises, done, onSetRep, onDelRep, onAddExercise, onOpenModal, onDeleteExercise, onAddRep, onComplete, onRepAdded, onToggleDone, showComplete }) {
      const iconBtn = (icon, label, onClick, opts = {}) => (
        <button onClick={onClick} title={label} style={{
          flex:1, height:44, background:"transparent",
          border:`1px solid #2a2a2a`,
          color:"#888",
          borderRadius:4, cursor:"pointer",
          fontSize: opts.small ? 13 : 18, display:"flex", alignItems:"center", justifyContent:"center", lineHeight:1, letterSpacing: opts.small ? 1 : 0,
        }}>
          {icon}
        </button>
      );

      return (
        <div style={{ background:CARD, border:`1px solid ${BDR}`, borderRadius:6, marginBottom:12, padding:"16px 20px 20px" }}>
          {exercises.map((ex, ei) => (
            <ExRow key={ei} ex={ex} disabled={done}
              onSetRep={(si,v) => onSetRep(ei,si,v)}
              onDelRep={si => onDelRep(ei,si)}
              onOpenModal={() => onOpenModal(ei)}
              onDelete={() => onDeleteExercise(ei)}
              onAddRep={() => onAddRep(ei)}
              onRepAdded={onRepAdded}
              onToggleDone={() => onToggleDone(ei)}
              canDelete={exercises.length > 1}
            />
          ))}
          {!done && (
            <div style={{ display:"flex", gap:6, marginTop:12 }}>
              {iconBtn("＋", "EXERCISE", onAddExercise)}
              {showComplete && iconBtn("✓", "DONE", onComplete)}
            </div>
          )}
        </div>
      );
    }


    // ─── BlockCard (grease the groove) ───────────────────────────────────────────
    function BlockCard({ block, index, onSetRep, onDelRep, onAddExercise, onOpenModal,
                         onDeleteExercise, onAddRep, onRepAdded, onToggleExDone, onCheck, onUncheck,
                         onToggleCollapse, onEditStart, canDeleteBlock, onDeleteBlock }) {
      const [confirmDel, setConfirmDel] = useState(false);
      const checked = block.startedAt !== null;
      const collapsed = block.collapsed;

      return (
        <div style={{ background:CARD, border:`1px solid ${checked ? "#2a4a00" : BDR}`, borderRadius:6, marginBottom:12, overflow:"hidden" }}>
          {/* Header */}
          <div style={{ display:"flex", alignItems:"center", gap:8, padding:"12px 14px", borderBottom: collapsed ? "none" : `1px solid ${BDR}` }}>
            <button onClick={checked ? onUncheck : onCheck} title={checked ? "Done – tap to reset" : "Mark block as done"}
              style={{ width:34, height:34, flexShrink:0, borderRadius:3, border:`2px solid ${checked ? ACC : "#666"}`, background: checked ? ACC : "transparent", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", padding:0 }}>
              {checked && <span style={{ color:BG, fontSize:18, fontWeight:700, lineHeight:1 }}>✓</span>}
            </button>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ ...mono, fontSize:11, color:"#888", letterSpacing:2 }}>BLOCK {index + 1}</div>
              {checked && (
                <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:2 }}>
                  <span style={{ ...mono, fontSize:14, fontWeight:700, color:"#e8a000", letterSpacing:1 }}>
                    {`⏱ ${new Date(block.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                  </span>
                  <button onClick={onEditStart} title="Edit start time" style={{ background:"none", border:"none", color:"#777", cursor:"pointer", fontSize:13, padding:0, lineHeight:1 }}>✎</button>
                </div>
              )}
            </div>
            <button onClick={onToggleCollapse} title={collapsed ? "Expand" : "Collapse"} style={{ width:34, height:34, flexShrink:0, background:"transparent", border:`1px solid #333`, color:"#888", borderRadius:3, cursor:"pointer", fontSize:14, lineHeight:1 }}>
              {collapsed ? "▾" : "▴"}
            </button>
            {canDeleteBlock && (
              <button onClick={() => setConfirmDel(true)} title="Delete block" style={{ width:34, height:34, flexShrink:0, background:CARD, border:`1px solid #444`, color:"#ff6b6b", borderRadius:3, cursor:"pointer", fontSize:18, lineHeight:1 }}>×</button>
            )}
          </div>

          {/* Body */}
          {!collapsed && (
            <div style={{ padding:"14px 18px 18px" }}>
              {block.exercises.map((ex, ei) => (
                <ExRow key={ei} ex={ex} disabled={checked}
                  onSetRep={(si,v) => onSetRep(ei,si,v)}
                  onDelRep={si => onDelRep(ei,si)}
                  onOpenModal={() => onOpenModal(ei)}
                  onDelete={() => onDeleteExercise(ei)}
                  onAddRep={() => onAddRep(ei)}
                  onRepAdded={onRepAdded}
                  onToggleDone={() => onToggleExDone(ei)}
                  canDelete={block.exercises.length > 1}
                />
              ))}
              {!checked && (
                <button onClick={onAddExercise} style={{ width:"100%", height:44, background:"transparent", border:`1px solid #2a2a2a`, color:"#888", borderRadius:4, cursor:"pointer", fontSize:18, display:"flex", alignItems:"center", justifyContent:"center", lineHeight:1 }}>＋</button>
              )}
            </div>
          )}

          {confirmDel && (
            <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.88)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:3000, padding:"0 24px" }} onClick={() => setConfirmDel(false)}>
              <div style={{ background:"#111", border:`1px solid #333`, borderRadius:10, padding:"28px 24px", width:"100%", maxWidth:360 }} onClick={e => e.stopPropagation()}>
                <div style={{ fontSize:15, color:"#ddd", marginBottom:24, lineHeight:1.5, ...cond }}>Remove block {index + 1}?</div>
                <div style={{ display:"flex", gap:10 }}>
                  <button onClick={() => setConfirmDel(false)} style={{ flex:1, padding:14, background:"transparent", border:`1px solid #444`, color:"#aaa", borderRadius:4, cursor:"pointer", fontSize:13, letterSpacing:2, ...cond }}>CANCEL</button>
                  <button onClick={() => { setConfirmDel(false); onDeleteBlock(); }} style={{ flex:1, padding:14, background:"#2a0000", border:`1px solid ${RED}`, color:RED, borderRadius:4, cursor:"pointer", fontSize:13, letterSpacing:2, fontWeight:700, ...cond }}>REMOVE</button>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

