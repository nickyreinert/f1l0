      // ─── Tabbed views (protocol / stats / settings / data) ──────────────────
      const VIEWS = ["protocol", "stats", "settings", "data"];
      const [view, setView] = useState(() => {
        const h = location.hash.replace(/^#/, "");
        return VIEWS.includes(h) ? h : "protocol";
      });
      const [copyOk, setCopyOk]     = useState(false);
      const [llmCopied, setLlmCopied] = useState(false);
      const [setupJson, setSetupJson] = useState("");
      const [setupMsg, setSetupMsg]   = useState("");
      const [importJson, setImportJson] = useState("");
      const [importErr, setImportErr]   = useState("");
      const [cloudState, setCloudState] = useState({ ...window._authState });
      const modalOrderRef = useRef({ exercise: 0, startTime: 0, history: 0 });
      const modalSeqRef = useRef(0);
      const prevOpenRef = useRef({ exercise: false, startTime: false, history: false });

      useEffect(() => {
        const currentOpen = {
          exercise: modalOpen,
          startTime: editBlockIdx !== null,
          history: !!editEntry,
        };
        Object.keys(currentOpen).forEach((key) => {
          if (currentOpen[key] && !prevOpenRef.current[key]) {
            modalOrderRef.current[key] = ++modalSeqRef.current;
          }
        });
        prevOpenRef.current = currentOpen;
      }, [modalOpen, editBlockIdx, editEntry]);

      useEffect(() => {
        const handleEscape = (e) => {
          if (e.key !== "Escape") return;
          const openModals = [
            { key: "exercise", open: modalOpen, close: () => setModalOpen(false) },
            { key: "startTime", open: editBlockIdx !== null, close: () => setEditBlockIdx(null) },
            { key: "history", open: !!editEntry, close: () => setEditEntry(null) },
          ].filter((m) => m.open);
          if (!openModals.length) return;
          const top = openModals.reduce((a, b) => (
            modalOrderRef.current[b.key] > modalOrderRef.current[a.key] ? b : a
          ));
          e.preventDefault();
          top.close();
        };
        window.addEventListener("keydown", handleEscape);
        return () => window.removeEventListener("keydown", handleEscape);
      }, [modalOpen, editBlockIdx, editEntry]);

      useEffect(() => {
        const h = (e) => setCloudState({ ...e.detail });
        window.addEventListener("authStateChanged", h);
        return () => window.removeEventListener("authStateChanged", h);
      }, []);

      // Reflect the active section in the URL hash so a reload lands on the same tab.
      useEffect(() => {
        if (location.hash.replace(/^#/, "") !== view) {
          history.replaceState(null, "", "#" + view);
        }
      }, [view]);
      // React to manual hash changes / browser back-forward navigation.
      useEffect(() => {
        const onHash = () => {
          const h = location.hash.replace(/^#/, "");
          if (VIEWS.includes(h)) setView(h);
        };
        window.addEventListener("hashchange", onHash);
        return () => window.removeEventListener("hashchange", onHash);
      }, []);

      useEffect(() => {
        const guard = (e) => {
          if (window._authState?.syncing) { e.preventDefault(); e.returnValue = "Sync still running."; }
        };
        window.addEventListener("beforeunload", guard);
        return () => window.removeEventListener("beforeunload", guard);
      }, []);

      const renderViewContent = () => {
        const streak    = calcStreak(sessions);
        const topEx     = calcTopExercises(sessions);
        const weekVol   = calcWeeklyVolume(sessions);
        const maxWeek   = Math.max(...weekVol.map(w => w[1]), 1);
        const totalDays = sessions.length;
        const totalReps = sessions.reduce((a,s) => a + sessionTotalReps(s), 0);
        const totalSets = sessions.reduce((a,s) => a + sessionExercises(s).reduce((x,ex) => x + exSetCount(ex), 0), 0);

        const handleCopy = async () => {
          const json = await exportData();
          try { await navigator.clipboard.writeText(json); setCopyOk(true); setTimeout(() => setCopyOk(false), 2500); }
          catch { setImportJson(json); setImportErr("Clipboard blocked — JSON pasted below"); }
        };
        const bodyInputStyle = { width:"100%", background:"#1a1a1a", border:`1px solid ${BDR}`, color:"#ddd", padding:"10px", borderRadius:3, outline:"none", fontSize:16, boxSizing:"border-box" };
        // Data view has no explicit SAVE, so persist body data to the cloud-synced cfg on edit.
        const persistBodyData = async (next) => {
          setBodyData(next);
          const cfg = await load("cfg");
          await save("cfg", { ...(cfg||{}), bodyData: next });
        };
        const handleLlmExport = async () => {
          const text = buildLlmExport(sessions, tmpBodyData, blockPlan);
          // Persist body data so it rides along with the cloud-synced cfg.
          const cfg = await load("cfg");
          await save("cfg", { ...(cfg||{}), bodyData: tmpBodyData });
          setBodyData(tmpBodyData);
          try {
            await navigator.clipboard.writeText(text);
            setLlmCopied(true); setTimeout(() => setLlmCopied(false), 3000);
          } catch {
            const blob = new Blob([text], { type: "text/plain" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a"); a.href = url; a.download = "training-evaluation.txt"; a.click();
            URL.revokeObjectURL(url);
          }
        };
        const handleSetupImport = async () => {
          setSetupMsg("");
          try {
            const n = await importTrainingSetup(setupJson);
            setSetupMsg("✓ " + n + " block" + (n === 1 ? "" : "s") + " imported");
            setSetupJson("");
          } catch (err) {
            setSetupMsg("Error: " + err.message);
          }
        };
        const handleImport = async () => {
          setImportErr("");
          try {
            const parsed = JSON.parse(importJson);
            if (!parsed || typeof parsed !== "object") throw new Error("not an object");
            await importData(parsed);
            const n = (parsed.sessions?.length || parsed.history?.length || 0);
            setImportErr("✓ " + n + " entries imported");
            setImportJson("");
          } catch(err) {
            setImportErr("Error: " + err.message);
          }
        };

        const updateBlockPlanSetting = (nextPlan) => {
          const bp = normalizeBlockPlan(nextPlan);
          setTmpBlockPlan(bp);
          setBlockPlan(bp);
          load("cfg").then(cfg => save("cfg", { ...(cfg||{}), blockPlan: bp }));
        };

        const KPI = ({ label, val, unit, large }) => (
          <div style={{ background:"#0a0a0a", border:`1px solid ${BDR}`, borderRadius:6, padding:"14px 12px" }}>
            <div style={{ ...lbl9, marginBottom:6 }}>{label}</div>
            <div style={{ ...mono, fontSize: large ? 30 : 22, fontWeight:700, color:ACC, lineHeight:1 }}>{val}</div>
            <div style={{ fontSize:12, color:"#aaa", marginTop:4 }}>{unit}</div>
          </div>
        );

        return (
          <>
                {view === "stats" && (sessions.length === 0
                  ? <div style={{ padding:"60px 0", textAlign:"center" }}><div style={{ ...mono, fontSize:12, color:"#aaa", letterSpacing:3 }}>NO DATA YET</div></div>
                  : <>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:8 }}>
                        <KPI label="STREAK" val={streak.cur} unit="Training Days" large /><KPI label="RECORD" val={streak.best} unit="Training Days" large /><KPI label="SESSIONS" val={totalDays} unit="total" large />
                      </div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:20 }}>
                        <KPI label="TOTAL REPS" val={totalReps.toLocaleString("en")} unit="reps" /><KPI label="TOTAL SETS" val={totalSets.toLocaleString("en")} unit="completed" />
                      </div>
                      {(() => {
                        const map = {}; sessions.forEach(s => { map[s.date] = s; });
                        const endOffset = histOffset * 28;
                        const days = Array.from({ length: 28 }, (_,i) => {
                          const d = new Date(); d.setDate(d.getDate() - endOffset - (27 - i));
                          const date = d.toISOString().slice(0,10);
                          return { date, entry: map[date] || null };
                        });
                        const rangeLabel = histOffset === 0 ? "LAST 28 DAYS" : `${histOffset * 28}–${(histOffset+1)*28} DAYS AGO`;
                        return <>
                          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
                            <div style={{ ...lbl9 }}>{rangeLabel}</div>
                            <div style={{ display:"flex", gap:6 }}>
                              <button onClick={() => setHistOffset(o => o+1)} style={{ background:"none", border:`1px solid ${BDR}`, color:"#888", borderRadius:3, padding:"2px 8px", cursor:"pointer", fontSize:14, lineHeight:1 }}>‹</button>
                              <button onClick={() => setHistOffset(o => Math.max(0,o-1))} disabled={histOffset===0} style={{ background:"none", border:`1px solid ${histOffset===0?"#222":BDR}`, color:histOffset===0?"#333":"#888", borderRadius:3, padding:"2px 8px", cursor:histOffset===0?"default":"pointer", fontSize:14, lineHeight:1 }}>›</button>
                            </div>
                          </div>
                          <div style={{ display:"grid", gridTemplateColumns:"repeat(7, 1fr)", gap:4, marginBottom:8 }}>
                            {days.map(({ date, entry }) => {
                              const isActive = sessionCountsForHeatmap(entry);
                              const hasTraining = sessionHasTraining(entry);
                              const bgColor = !isActive ? "#1a1a1a" : hasTraining ? "#1e4d08" : "#08304d";
                              const borderColor = !isActive ? "#2a2a2a" : hasTraining ? "#3a8a10" : "#1a6a9a";
                              const textColor = !isActive ? "#666" : hasTraining ? "#7acc20" : "#20aacc";
                              return (
                              <button key={date} onClick={() => setEditEntry(entry ? { ...entry } : mkSession(date, "A", []))}
                                style={{ height:36, borderRadius:3, background: bgColor, border:`1px solid ${borderColor}`, cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:1, padding:0 }}>
                                <span style={{ ...mono, fontSize:9, color: textColor, lineHeight:1 }}>{date.slice(8)}</span>
                                {isActive && <span style={{ ...mono, fontSize:8, color:"#999", lineHeight:1 }}>{entry.type}</span>}
                              </button>
                            )})}
                          </div>
                        </>;
                      })()}
                      {weekVol.length > 1 && <>
                        <div style={{ ...lbl9, marginBottom:10, marginTop:20 }}>REPS PER WEEK</div>
                        <div style={{ display:"flex", gap:6, alignItems:"flex-end", height:90 }}>
                          {weekVol.map(([week, vol]) => (
                            <div key={week} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
                              <div style={{ ...mono, fontSize:8, color:"#888" }}>{vol >= 1000 ? `${(vol/1000).toFixed(1)}k` : vol}</div>
                              <div style={{ width:"100%", background:ACC, borderRadius:"3px 3px 0 0", height:`${Math.max(4,(vol/maxWeek)*64)}px`, opacity:0.6 }} />
                              <div style={{ ...mono, fontSize:8, color:"#666" }}>{week.slice(5)}</div>
                            </div>
                          ))}
                        </div>
                      </>}
                      {topEx.length > 0 && <>
                        <div style={{ ...lbl9, marginBottom:16, marginTop:28 }}>TOTAL VOLUME BY EXERCISE</div>
                        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(280px, 1fr))", gap:10 }}>
                          {topEx.map(([name, { sets, reps }]) => {
                            const prog = calcExerciseProgression(sessions, name);
                            const maxR = Math.max(...prog.map(p => p.reps), 1);
                            return (
                              <div key={name} style={{ background:"#0a0a0a", border:`1px solid ${BDR}`, borderRadius:6, padding:16 }}>
                                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:10 }}>
                                  <span style={{ fontSize:16, fontWeight:700, color:"#ddd" }}>{name}</span>
                                  <span style={{ ...mono, fontSize:12, color:"#bbb" }}>{reps.toLocaleString("en")} reps · {sets} sets</span>
                                </div>
                                <div style={{ height:4, background:"#1a1a1a", borderRadius:2, marginBottom: prog.length > 1 ? 14 : 0 }}>
                                  <div style={{ height:4, background:ACC, opacity:0.5, width:`${(reps / topEx[0][1].reps) * 100}%`, borderRadius:2 }} />
                                </div>
                                {prog.length > 1 && <>
                                  <div style={{ ...lbl9, marginBottom:6 }}>PROGRESSION</div>
                                  <div style={{ display:"flex", gap:3, alignItems:"flex-end", height:40 }}>
                                    {prog.map((p,i) => (
                                      <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
                                        <div style={{ width:"100%", background: i===prog.length-1 ? ACC : "#2a4a00", borderRadius:"2px 2px 0 0", height:`${Math.max(3,(p.reps/maxR)*30)}px`, opacity: i===prog.length-1 ? 0.85 : 0.5 }} />
                                        <div style={{ ...mono, fontSize:7, color:"#888" }}>{p.reps}</div>
                                      </div>
                                    ))}
                                  </div>
                                </>}
                              </div>
                            );
                          })}
                        </div>
                      </>}
                    </>
                )}


                {view === "settings" && <>
                  <div style={{ background:"#0c0f14", border:`1px solid #1d2b34`, borderRadius:8, padding:"14px 14px 10px", marginBottom:14 }}>
                    <div style={{ ...lbl9, marginBottom:6, fontSize:14, color:"#9ed5ff" }}>BLOCK SETUP</div>
                    <div style={{ ...mono, fontSize:14, color:"#6f8ea3", marginBottom:12 }}>Define your blocks and their pause cadence.</div>
                    <BlockPlanEditor
                      plan={tmpBlockPlan}
                      onChange={updateBlockPlanSetting}
                      recentlyUsed={recentEx}
                      customExercises={customExercises}
                      onAddCustom={addCustomExercise}
                      exerciseImages={exerciseImages}
                      onImageUpdate={updateExerciseImage}
                    />
                  </div>

                  <div style={{ background:"#10100d", border:`1px solid #2c2a1a`, borderRadius:8, padding:"14px 14px 12px", marginBottom:14 }}>
                    <div style={{ ...lbl9, marginBottom:10, fontSize:14, color:"#d8cc8f" }}>REST TIMER AFTER SET</div>
                    <div style={{ display:"flex", borderRadius:4, overflow:"hidden", border:`1px solid ${BDR}`, marginBottom:8 }}>
                      <button onClick={() => setTmpRestSecs(v => Math.max(10, v-10))} style={{ width:82, height:82, background:CARD, border:"none", color:"#bbb", fontSize:36, cursor:"pointer", ...mono }}>−</button>
                      <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", background:"#1a1a1a", ...mono, fontSize:42, fontWeight:700 }}>{tmpRestSecs}s</div>
                      <button onClick={() => setTmpRestSecs(v => v+10)} style={{ width:82, height:82, background:CARD, border:"none", color:"#bbb", fontSize:36, cursor:"pointer", ...mono }}>+</button>
                    </div>
                    <div style={{ ...mono, fontSize:17, color:"#aaa" }}>Countdown starts after each set</div>
                  </div>

                  <div style={{ background:"#10100d", border:`1px solid #2c2a1a`, borderRadius:8, padding:"14px 14px 12px", marginBottom:14 }}>
                    <div style={{ ...lbl9, marginBottom:10, fontSize:14, color:"#d8cc8f" }}>COOLDOWN BETWEEN BLOCKS</div>
                    <div style={{ display:"flex", borderRadius:4, overflow:"hidden", border:`1px solid ${BDR}`, marginBottom:8 }}>
                      <button onClick={() => setTmpCooldownMin(v => Math.max(15, v-15))} style={{ width:82, height:82, background:CARD, border:"none", color:"#bbb", fontSize:36, cursor:"pointer", ...mono }}>−</button>
                      <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", background:"#1a1a1a", ...mono, fontSize:38, fontWeight:700 }}>
                        {Math.floor(tmpCooldownMin/60)}h {String(tmpCooldownMin%60).padStart(2,"0")}m
                      </div>
                      <button onClick={() => setTmpCooldownMin(v => v+15)} style={{ width:82, height:82, background:CARD, border:"none", color:"#bbb", fontSize:36, cursor:"pointer", ...mono }}>+</button>
                    </div>
                    <div style={{ ...mono, fontSize:17, color:"#aaa" }}>Break between training blocks (Grease the Groove)</div>
                  </div>

                  <div style={{ background:"#140d10", border:`1px solid #34202a`, borderRadius:8, padding:"14px 14px 12px", marginBottom:20 }}>
                    <div style={{ ...lbl9, marginBottom:12, marginTop:2, fontSize:14, color:"#f0b6cb" }}>SUPPLEMENTS</div>
                    <div>
                    {tmpSupplements.map((supp, si) => (
                      <div
                        key={si}
                        data-supp-row={si}
                        style={{
                          background: suppDragIdx === si ? "#1a2800" : suppDragOver === si ? "#111800" : CARD,
                          border: `1px solid ${suppDragIdx === si ? ACC : BDR}`,
                          borderRadius:6, padding:"6px 8px", marginBottom:6,
                          display:"flex", gap:6, alignItems:"center",
                          opacity: suppDragIdx === si ? 0.6 : 1,
                          transition:"background 0.12s, opacity 0.12s",
                        }}
                      >
                        {/* Drag handle */}
                        <div
                          style={{ cursor:"grab", color:"#555", fontSize:20, lineHeight:1, padding:"0 2px", touchAction:"none", userSelect:"none", flexShrink:0 }}
                          onPointerDown={(e) => {
                            e.currentTarget.setPointerCapture(e.pointerId);
                            suppDragRef.current.fromIdx = si;
                            setSuppDragIdx(si);
                            setSuppDeleteConfirm(null);
                          }}
                          onPointerMove={(e) => {
                            if (suppDragRef.current.fromIdx === null) return;
                            const el = document.elementFromPoint(e.clientX, e.clientY);
                            const row = el?.closest('[data-supp-row]');
                            if (row) {
                              const idx = parseInt(row.getAttribute('data-supp-row'), 10);
                              if (!isNaN(idx)) setSuppDragOver(idx);
                            }
                          }}
                          onPointerUp={() => {
                            const from = suppDragRef.current.fromIdx;
                            if (from !== null && suppDragOver !== null && from !== suppDragOver) {
                              const ns = [...tmpSupplements];
                              const [item] = ns.splice(from, 1);
                              ns.splice(suppDragOver, 0, item);
                              setTmpSupplements(ns);
                            }
                            suppDragRef.current.fromIdx = null;
                            setSuppDragIdx(null);
                            setSuppDragOver(null);
                          }}
                        >⠿</div>
                        {/* Name */}
                        <input type="text" placeholder="Name" value={supp.name}
                          onChange={e => { const ns=[...tmpSupplements]; ns[si]={...ns[si],name:e.target.value}; setTmpSupplements(ns); }}
                          style={{ flex:2, minWidth:0, background:"#1a1a1a", border:`1px solid ${BDR}`, color:"#ddd", padding:"8px 10px", borderRadius:3, outline:"none", fontSize:16, boxSizing:"border-box" }} />
                        {/* Volume/Amount */}
                        <input type="text" placeholder="Amount" value={supp.amount || ""}
                          onChange={e => { const ns=[...tmpSupplements]; ns[si]={...ns[si],amount:e.target.value}; setTmpSupplements(ns); }}
                          style={{ flex:1, minWidth:0, background:"#1a1a1a", border:`1px solid ${BDR}`, color:"#ddd", padding:"8px 10px", borderRadius:3, outline:"none", fontSize:16, boxSizing:"border-box" }} />
                        {/* Time */}
                        <input type="text" placeholder="Time" value={supp.time || ""}
                          onChange={e => { const ns=[...tmpSupplements]; ns[si]={...ns[si],time:e.target.value}; setTmpSupplements(ns); }}
                          style={{ flex:1, minWidth:0, background:"#1a1a1a", border:`1px solid ${BDR}`, color:"#ddd", padding:"8px 10px", borderRadius:3, outline:"none", fontSize:16, boxSizing:"border-box" }} />
                        {/* Delete */}
                        {suppDeleteConfirm === si ? (
                          <div style={{ display:"flex", gap:4, flexShrink:0 }}>
                            <button onClick={() => { setTmpSupplements(tmpSupplements.filter((_,j)=>j!==si)); setSuppDeleteConfirm(null); }}
                              style={{ height:34, padding:"0 10px", background:"#661111", border:"none", color:"#ffaaaa", borderRadius:3, cursor:"pointer", fontSize:14, letterSpacing:1, ...cond, fontWeight:700 }}>YES</button>
                            <button onClick={() => setSuppDeleteConfirm(null)}
                              style={{ height:34, padding:"0 10px", background:"transparent", border:`1px solid #333`, color:"#666", borderRadius:3, cursor:"pointer", fontSize:14, letterSpacing:1, ...cond }}>NO</button>
                          </div>
                        ) : (
                          <button onClick={() => setSuppDeleteConfirm(si)}
                            style={{ width:34, height:34, background:"transparent", border:`1px solid #661111`, color:"#aa4444", borderRadius:3, cursor:"pointer", fontSize:20, lineHeight:1, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
                        )}
                      </div>
                    ))}
                    <button onClick={() => setTmpSupplements([...tmpSupplements, { name:"", amount:"", time:"" }])}
                      style={{ width:"100%", padding:14, background:CARD, border:`1px dashed ${BDR}`, color:"#888", borderRadius:4, cursor:"pointer", fontSize:17, ...cond }}>+ ADD SUPPLEMENT</button>
                    </div>
                  </div>

                  <button onClick={() => {
                    const rs = Math.max(10, tmpRestSecs);
                    const cdMs = Math.max(15, tmpCooldownMin) * 60000;
                    const bp = normalizeBlockPlan(tmpBlockPlan);
                    setRestSecs(rs); setSupplements(tmpSupplements); setCooldownMs(cdMs); setBlockPlan(bp);
                    load("cfg").then(cfg => save("cfg", { ...(cfg||{}), restSecs: rs, cooldownMs: cdMs, supplements: tmpSupplements, blockPlan: bp }));
                    setView("protocol");
                  }} style={{ background:ACC, color:BG, border:"none", padding:18, fontSize:24, fontWeight:900, letterSpacing:3, width:"100%", borderRadius:4, cursor:"pointer", ...cond }}>SAVE</button>
                </>}

                {view === "data" && <>
                  {window._fbAuth && <>
                    <div style={{ ...lbl9, marginBottom:10 }}>CLOUD BACKUP</div>
                    {cloudState.user ? (
                      <div style={{ background:"#0a1a0a", border:`1px solid #1a3a1a`, borderRadius:6, padding:"14px 16px", marginBottom:24, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                        <div>
                          <div style={{ ...mono, fontSize:11, color: cloudState.syncing ? "#ffa500" : "#4a8c4a", letterSpacing:3, marginBottom:4 }}>
                            {cloudState.syncing ? "SYNCING…" : "BACKUP ACTIVE"}
                          </div>
                          <div style={{ fontSize:12, color:"#888" }}>{cloudState.user.displayName || cloudState.user.email}</div>
                        </div>
                        <button onClick={window._signOut} style={{ background:"transparent", border:`1px solid #333`, color:"#666", borderRadius:4, padding:"8px 14px", cursor:"pointer", fontSize:11, letterSpacing:2, ...cond }}>SIGN OUT</button>
                      </div>
                    ) : (
                      <div style={{ marginBottom:24 }}>
                        <button onClick={window._signInWithGoogle} style={{ width:"100%", padding:16, background:"#111a2a", border:`1px solid #2a3a5a`, color:"#8899cc", fontSize:14, fontWeight:700, letterSpacing:2, borderRadius:4, cursor:"pointer", ...cond, marginBottom:8 }}>
                          SIGN IN WITH GOOGLE
                        </button>
                        <div style={{ ...mono, fontSize:12, color:"#aaa" }}>Automatically back up data to Google Cloud.</div>
                      </div>
                    )}
                  </>}
                  <div style={{ background:"#0d1014", border:`1px solid #1d2530`, borderRadius:8, padding:"14px 14px 12px", marginBottom:14 }}>
                    <div style={{ ...lbl9, marginBottom:6, fontSize:14, color:"#9ed5ff" }}>BODY DATA</div>
                    <div style={{ ...mono, fontSize:14, color:"#6f8ea3", marginBottom:12 }}>Used for the training evaluation export. Synced to cloud.</div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:8 }}>
                      <div>
                        <div style={{ ...lbl9, marginBottom:4 }}>SEX</div>
                        <select value={tmpBodyData.sex} onChange={e => { const n = { ...tmpBodyData, sex: e.target.value }; setTmpBodyData(n); persistBodyData(n); }} style={{ ...bodyInputStyle, cursor:"pointer" }}>
                          <option value="">—</option>
                          <option value="male">Male</option>
                          <option value="female">Female</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      <div>
                        <div style={{ ...lbl9, marginBottom:4 }}>AGE</div>
                        <input type="number" inputMode="numeric" value={tmpBodyData.age} onChange={e => setTmpBodyData({ ...tmpBodyData, age: e.target.value })} onBlur={() => persistBodyData(tmpBodyData)} placeholder="years" style={bodyInputStyle} />
                      </div>
                      <div>
                        <div style={{ ...lbl9, marginBottom:4 }}>HEIGHT (CM)</div>
                        <input type="number" inputMode="numeric" value={tmpBodyData.height} onChange={e => setTmpBodyData({ ...tmpBodyData, height: e.target.value })} onBlur={() => persistBodyData(tmpBodyData)} placeholder="cm" style={bodyInputStyle} />
                      </div>
                      <div>
                        <div style={{ ...lbl9, marginBottom:4 }}>WEIGHT (KG)</div>
                        <input type="number" inputMode="decimal" value={tmpBodyData.weight} onChange={e => setTmpBodyData({ ...tmpBodyData, weight: e.target.value })} onBlur={() => persistBodyData(tmpBodyData)} placeholder="kg" style={bodyInputStyle} />
                      </div>
                    </div>
                    <div>
                      <div style={{ ...lbl9, marginBottom:4 }}>TRAINING GOAL</div>
                      <input type="text" value={tmpBodyData.goal} onChange={e => setTmpBodyData({ ...tmpBodyData, goal: e.target.value })} onBlur={() => persistBodyData(tmpBodyData)} placeholder="e.g. build muscle, first muscle-up, lose fat" style={bodyInputStyle} />
                    </div>
                  </div>

                  <div style={{ background:"#0d140f", border:`1px solid #1d3326`, borderRadius:8, padding:"14px 14px 12px", marginBottom:28 }}>
                    <div style={{ ...lbl9, marginBottom:6, fontSize:14, color:"#9ed5b8" }}>TRAINING EVALUATION EXPORT</div>
                    <div style={{ ...mono, fontSize:14, color:"#6fa384", marginBottom:12 }}>Compact CSV journal + a ready-to-use prompt asking an LLM to evaluate your training. Paste it into ChatGPT, Claude, etc.</div>
                    <button onClick={handleLlmExport} style={{ width:"100%", padding:16, background: llmCopied ? "#1a3a00" : CARD, border:`1px solid ${llmCopied ? "#3a8a10" : BDR}`, color: llmCopied ? ACC : "#ccc", fontSize:14, fontWeight:700, letterSpacing:2, borderRadius:4, cursor:"pointer", ...cond }}>
                      {llmCopied ? "✓ COPIED — PASTE INTO YOUR LLM" : "COPY TRAINING + PROMPT → LLM"}
                    </button>
                  </div>

                  <div style={{ background:"#0d0f14", border:`1px solid #24283a`, borderRadius:8, padding:"14px 14px 12px", marginBottom:28 }}>
                    <div style={{ ...lbl9, marginBottom:6, fontSize:14, color:"#b6b0e0" }}>IMPORT TRAINING SETUP</div>
                    <div style={{ ...mono, fontSize:14, color:"#8480a8", marginBottom:12 }}>Paste the JSON block the LLM returned. Matching blocks are updated, new ones added.</div>
                    <textarea value={setupJson} onChange={e => { setSetupJson(e.target.value); setSetupMsg(""); }} placeholder='Paste { "trainingSetup": { "blocks": [ … ] } } here…' style={{ width:"100%", height:100, background:"#1a1a1a", border:`1px solid ${setupMsg.startsWith("Error") ? RED : BDR}`, color:"#ccc", padding:12, borderRadius:4, outline:"none", resize:"none", ...mono, fontSize:11, boxSizing:"border-box" }} />
                    {setupMsg && <div style={{ ...mono, fontSize:10, color: setupMsg.startsWith("✓") ? ACC : RED, marginTop:4 }}>{setupMsg}</div>}
                    <button onClick={handleSetupImport} style={{ width:"100%", padding:16, background: setupJson ? "#12131f" : CARD, border:`1px solid ${setupJson ? "#3a3a6a" : BDR}`, color: setupJson ? "#b6b0e0" : "#555", fontSize:14, fontWeight:700, letterSpacing:2, borderRadius:4, cursor: setupJson ? "pointer" : "default", ...cond, marginTop:8 }}>
                      IMPORT SETUP
                    </button>
                  </div>

                  <div style={{ ...lbl9, marginBottom:14 }}>EXPORT</div>
                  <button onClick={handleCopy} style={{ width:"100%", padding:16, background: copyOk ? "#1a3a00" : CARD, border:`1px solid ${copyOk ? "#3a8a10" : BDR}`, color: copyOk ? ACC : "#ccc", fontSize:14, fontWeight:700, letterSpacing:2, borderRadius:4, cursor:"pointer", ...cond, marginBottom:6 }}>
                    {copyOk ? "✓ COPIED TO CLIPBOARD" : "COPY DATA → JSON"}
                  </button>
                  <div style={{ ...mono, fontSize:13, color:"#aaa", marginBottom:28 }}>cfg · sessions — everything as JSON (schema 3).</div>
                  <div style={{ ...lbl9, marginBottom:14 }}>IMPORT</div>
                  <textarea value={importJson} onChange={e => { setImportJson(e.target.value); setImportErr(""); }} placeholder="Paste JSON here…" style={{ width:"100%", height:110, background:"#1a1a1a", border:`1px solid ${importErr ? RED : BDR}`, color:"#ccc", padding:12, borderRadius:4, outline:"none", resize:"none", ...mono, fontSize:11, boxSizing:"border-box" }} />
                  {importErr && <div style={{ ...mono, fontSize:10, color: importErr.startsWith("✓") ? ACC : RED, marginTop:4 }}>{importErr}</div>}
                  <button onClick={handleImport} style={{ width:"100%", padding:16, background: importJson ? "#1a1a00" : CARD, border:`1px solid ${importJson ? "#4a4a00" : BDR}`, color: importJson ? "#cccc00" : "#555", fontSize:14, fontWeight:700, letterSpacing:2, borderRadius:4, cursor: importJson ? "pointer" : "default", ...cond, marginTop:8 }}>
                    IMPORT DATA
                  </button>
                </>}
          </>
        );
      };

      if (!ready) return <div style={{ background:BG, minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", ...mono, color:"#888", fontSize:18 }}>···</div>;

      return (
        <div style={{ background:BG, minHeight:"100vh", color:"#f0f0ed", ...cond, maxWidth:"min(96vw, 760px)", margin:"0 auto", paddingBottom:100, fontSize:18 }}>
          {/* ── Header ── */}
