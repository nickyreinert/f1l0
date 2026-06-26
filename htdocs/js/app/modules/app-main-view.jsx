          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12, padding:"14px 20px 0" }}>
            <div style={{ flex:1, minWidth:0 }}>
              {view === "protocol" && (() => {
                const daysSince = (lastTrainDate && lastTrainDate !== todayStr())
                  ? Math.floor((new Date(todayStr()+"T12:00:00") - new Date(lastTrainDate+"T12:00:00")) / 86400000)
                  : null;
                const isRest = trainType === "B";
                const urgency = !isRest ? 0 : (daysSince ?? 0);
                const urgencyColor = urgency <= 1 ? typeColor : urgency === 2 ? "#e8a000" : urgency === 3 ? "#e85000" : "#ff2222";
	                const urgencyTag = isRest && urgency >= 2
	                  ? urgency === 2 ? "TRAIN!" : urgency === 3 ? "TRAIN NOW!" : urgency === 4 ? "YOU MUST TRAIN!" : "LAZY BASTARD!"
	                  : null;
	                const headline = isRest ? (headerHasDailyBlocks ? "RECOVERY" : "REST") : `TRAIN ${headerRoutineDay}`;
	                const subline = isRest
	                  ? (headerHasDailyBlocks ? "DAILY BLOCKS ONLY" : "NO SCHEDULED BLOCKS")
	                  : `ROUTINE ${headerRoutineDay}`;
	                return <>
	                  <div style={{ lineHeight:0.88, position:"relative" }}>
	                    <div style={{ fontSize:"clamp(60px, 13vw, 128px)", fontWeight:900, letterSpacing:-3, color:urgencyColor }}>{headline}</div>
	                    <div style={{ ...mono, fontSize:14, color:"#888", letterSpacing:3, marginTop:8 }}>{subline}</div>
	                    {urgencyTag && <div style={{ fontSize:"clamp(28px, 4vw, 42px)", fontWeight:900, letterSpacing:2, color:urgencyColor, marginTop:4 }}>{urgencyTag}</div>}
	                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:6 }}>
                    <button onClick={() => setHeaderDayOffset(o => o - 1)} title="Previous day" style={{ background:"transparent", border:`1px solid #333`, color:"#888", borderRadius:3, padding:"4px 10px", cursor:"pointer", fontSize:20, lineHeight:1 }}>‹</button>
                    <button onClick={openHeaderDayEditor} title="Edit day" style={{ ...lbl9, background:"none", border:"none", cursor:"pointer", color:"#aaa" }}>{fmtDate(headerDate).toUpperCase()}</button>
                    <button onClick={() => setHeaderDayOffset(0)} title="Go to today" disabled={headerDayOffset === 0} style={{ background:"transparent", border:`1px solid ${headerDayOffset === 0 ? "#222" : "#333"}`, color: headerDayOffset === 0 ? "#333" : "#888", borderRadius:3, padding:"4px 10px", cursor: headerDayOffset === 0 ? "default" : "pointer", fontSize:13, letterSpacing:1.5, lineHeight:1, ...cond }}>TODAY</button>
                    <button onClick={() => setHeaderDayOffset(o => Math.min(0, o + 1))} title="Next day" disabled={headerDayOffset === 0} style={{ background:"transparent", border:`1px solid ${headerDayOffset === 0 ? "#222" : "#333"}`, color: headerDayOffset === 0 ? "#333" : "#888", borderRadius:3, padding:"4px 10px", cursor: headerDayOffset === 0 ? "default" : "pointer", fontSize:20, lineHeight:1 }}>›</button>
                  </div>
                </>;
              })()}
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
              {(() => {
                const svg = (children) => (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
                );
                const ICONS = {
                  protocol: svg(<><path d="M6.5 6.5v11M3.5 9v6M17.5 6.5v11M20.5 9v6M6.5 12h11" /></>),
                  stats: svg(<><path d="M3 21h18M6 21V11M12 21V5M18 21v-7" /></>),
                  settings: svg(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>),
                  data: svg(<><path d="M5 3h11l3 3v15H5z" /><path d="M8 3v5h7V3M8 21v-7h8v7" /></>),
                };
                const navBtn = (key, onClick, title) => (
                  <button key={key} onClick={onClick} title={title} style={{
                    width:46, height:46, background: view===key ? ACC : "transparent",
                    border:`1px solid ${view===key ? ACC : "#333"}`, color: view===key ? BG : "#999",
                    cursor:"pointer", borderRadius:6, lineHeight:0,
                    display:"flex", alignItems:"center", justifyContent:"center",
                  }}>{ICONS[key]}</button>
                );
                return <>
	                  {navBtn("protocol", () => setView("protocol"), "Routine")}
                  {navBtn("stats", () => setView("stats"), "Stats")}
                  {navBtn("settings", () => { setTmpRestSecs(restSecs); setTmpCooldownMin(Math.round(cooldownMs/60000)); setView("settings"); }, "Settings")}
                  {navBtn("data", () => setView("data"), "Data")}
                </>;
              })()}
            </div>
          </div>

          {view === "protocol" && (<>
          <div style={{ height:1, background:BDR, marginTop:20 }} />

          {mornExercises.length > 0 && (
            <>
              {/* ── Legacy Morning Block (only shown when historical data exists) ── */}
              <div style={{ padding:"20px 20px 0" }}>
                <div style={{ background:CARD, border:`1px solid ${mornDone ? "#2a4a00" : BDR}`, borderRadius:6, overflow:"hidden", marginBottom:12 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, padding:"12px 14px", borderBottom: mornCollapsed ? "none" : `1px solid ${BDR}` }}>
                    <button onClick={toggleMorningComplete} title={mornDone ? "Done - tap to reset" : "Mark block as done"}
                      style={{ width:34, height:34, flexShrink:0, borderRadius:3, border:`2px solid ${mornDone ? ACC : "#666"}`, background: mornDone ? ACC : "transparent", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", padding:0 }}>
                      {mornDone && <span style={{ color:BG, fontSize:18, fontWeight:700, lineHeight:1 }}>✓</span>}
                    </button>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ ...mono, fontSize:14, color:"#888", letterSpacing:2 }}>BLOCK 0</div>
                      <div style={{ fontSize:34, fontWeight:900, letterSpacing:1, color:"#aaa" }}>MORNING ROUTINE</div>
                    </div>
                    <button onClick={onToggleMornCollapse} title={mornCollapsed ? "Expand" : "Collapse"} style={{ width:34, height:34, flexShrink:0, background:"transparent", border:`1px solid #333`, color:"#888", borderRadius:3, cursor:"pointer", fontSize:14, lineHeight:1 }}>
                      {mornCollapsed ? "▾" : "▴"}
                    </button>
                  </div>
                  {!mornCollapsed && (
                    <div style={{ padding:"14px 18px 18px" }}>
                      <ExercisesSection
                        exercises={mornExercises}
                        done={mornDone}
                        onSetRep={onMornSetRep}
                        onDelRep={onMornDelRep}
                        onAddExercise={onMornAddEx}
                        onOpenModal={(ei) => { setModalTarget({ section:"morn", ei }); setModalOpen(true); }}
                        onDeleteExercise={onMornDelEx}
                        onAddRep={onMornAddRep}
                        onToggleDone={onMornToggleDone}
                        onComplete={toggleMorningComplete}
                        onRepAdded={() => { setRestTimer(restSecs); setRestTimerKey(k => k+1); }}
                        showComplete={!mornDone}
                      />
                    </div>
                  )}
                </div>
              </div>
              <div style={{ height:1, background:BDR, margin:"20px 0 0" }} />
            </>
          )}

          {/* ── Training ── */}
          <div style={{ padding:"20px 20px 0" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
              {trainBlocks.length > 1 && (
                <button onClick={onToggleAllCollapse} style={{ background:"transparent", border:`1px solid #333`, color:"#888", borderRadius:4, cursor:"pointer", padding:"8px 14px", fontSize:14, letterSpacing:2, ...cond, fontWeight:700 }}>
                  {allCollapsed ? "EXPAND ALL" : "COLLAPSE ALL"}
                </button>
              )}
            </div>
            {trainType === "B" && trainBlocks.length > 0 && (
              <div style={{ background:"#101510", border:`1px solid #263a26`, borderRadius:6, padding:"12px 14px", marginBottom:12 }}>
                <div style={{ fontSize:16, color:ACC, letterSpacing:3, marginBottom:4 }}>RECOVERY DAY</div>
                <div style={{ fontSize:18, color:"#aaa", lineHeight:1.5 }}>Only daily blocks are scheduled today. Spaced training blocks are held back.</div>
              </div>
            )}
            {trainBlocks.length > 0 && <>
              {trainBlocks.map((block, bi) => (
                <BlockCard
                  key={block.id}
                  block={block}
                  index={bi}
                  onSetRep={(ei,si,v) => onBlkSetRep(bi,ei,si,v)}
                  onDelRep={(ei,si) => onBlkDelRep(bi,ei,si)}
                  onAddExercise={() => onBlkAddEx(bi)}
                  onOpenModal={(ei) => { setModalTarget({ section:"block", bi, ei }); setModalOpen(true); }}
                  onDeleteExercise={(ei) => onBlkDelEx(bi,ei)}
                  onAddRep={(ei) => onBlkAddRep(bi,ei)}
                  onRepAdded={() => { setRestTimer(restSecs); setRestTimerKey(k => k+1); }}
                  onToggleExDone={(ei) => onBlkExDone(bi,ei)}
                  onCheck={() => onCheckBlock(bi)}
                  onUncheck={() => onUncheckBlock(bi)}
                  onToggleCollapse={() => onBlkCollapse(bi)}
                  onEditStart={() => setEditBlockIdx(bi)}
                  canDeleteBlock={trainBlocks.length > 1}
                  onDeleteBlock={() => onDelBlock(bi)}
                />
              ))}
              <button disabled={!canAddBlock} onClick={onAddBlock} style={{ width:"100%", padding:16, background:"transparent", border:`1px dashed ${canAddBlock ? "#444" : "#2a2a2a"}`, color: canAddBlock ? "#aaa" : "#555", borderRadius:6, cursor: canAddBlock ? "pointer" : "default", fontSize:20, letterSpacing:2, ...cond, fontWeight:700, marginBottom:12 }}>
                ＋ ADD BLOCK
              </button>
              {(() => {
                const latestStart = trainBlocks.reduce((max, b) => {
                  if (!b.startedAt) return max;
                  return b.startedAt > max ? b.startedAt : max;
                }, 0);
                if (!latestStart) return null;
                return (
                  <div style={{ display:"flex", justifyContent:"center", marginBottom:12 }}>
                    <Cooldown startedAt={latestStart} cooldownMs={cooldownMs} />
                  </div>
                );
              })()}
            </>}
            {trainType === "B" && trainBlocks.length === 0 && (
              <div style={{ background:CARD, border:`1px solid ${BDR}`, borderRadius:6, padding:20, marginBottom:12 }}>
                <div style={{ fontSize:18, color:RED, letterSpacing:4, marginBottom:12 }}>REST DAY — NO TRAINING</div>
                <div style={{ fontSize:20, color:"#aaa", lineHeight:1.7 }}>Spaced training blocks are held back today. No scheduled daily blocks are due.</div>
                <div style={{ marginTop:20, paddingTop:16, borderTop:`1px solid ${BDR}`, display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ width:8, height:8, borderRadius:"50%", background:"#2c6e35", flexShrink:0 }} />
                  <span style={{ fontSize:18, color:"#888", letterSpacing:1 }}>Cycling &amp; cardio allowed</span>
                </div>
              </div>
            )}
          </div>

          {supplements.length > 0 && (
            <div style={{ padding:"16px 20px 0" }}>
              <div style={{ ...lbl9, marginBottom:4 }}>SUPPLEMENTS</div>
              {supplements.map((supp, si) => {
                // Include time + index so two supplements with the same name
                // (e.g. "Protein" at lunch and evening) get distinct keys.
                const suppKey = `${si}_${supp.name}_${supp.time || ""}`.toLowerCase().replace(/\s+/g, "_");
                const isChecked = trainSupps[suppKey] || false;
                return (
                  <div key={suppKey} onClick={() => toggleSupp(suppKey)} style={{ display:"flex", alignItems:"center", gap:14, padding:"14px 0", borderBottom:`1px solid ${BDR}`, cursor:"pointer" }}>
                    <div style={{ width:22, height:22, borderRadius:3, border:`2px solid ${isChecked ? ACC : "#888"}`, background: isChecked ? ACC : "transparent", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
                      {isChecked && <span style={{ color:BG, fontSize:13, fontWeight:700, lineHeight:1 }}>✓</span>}
                    </div>
                    <div style={{ flex:1 }}>
                      <span style={{ fontSize:22, color: isChecked ? "#555" : "#ddd", textDecoration: isChecked ? "line-through" : "none" }}>{supp.name} {supp.amount && `— ${supp.amount}`}</span>
                      {supp.time && <div style={{ fontSize:17, color:"#bbb", marginTop:2 }}>{supp.time}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          </>)}

          {view !== "protocol" && (
            <div style={{ padding:"20px 20px 40px" }}>
              {renderViewContent()}
            </div>
          )}

          <ExerciseModal open={modalOpen} onClose={() => setModalOpen(false)} onSelect={selectExercise} recentlyUsed={recentEx} customExercises={customExercises} onAddCustom={addCustomExercise} exerciseImages={exerciseImages} onImageUpdate={updateExerciseImage} />
          {editBlockIdx !== null && trainBlocks[editBlockIdx]?.startedAt != null && (
            <StartTimeModal
              startedAt={trainBlocks[editBlockIdx].startedAt}
              onConfirm={(ts) => { onBlkSetStart(editBlockIdx, ts); setEditBlockIdx(null); }}
              onClose={() => setEditBlockIdx(null)}
            />
          )}

          {/* ── History entry edit modal ── */}
          {editEntry && (
            <HistoryDayEditModal
              entry={editEntry}
              onClose={() => setEditEntry(null)}
              onSave={saveHistoryEntry}
              lbl9={lbl9}
              mono={mono}
              cond={cond}
              ACC={ACC}
              BG={BG}
              BDR={BDR}
            />
          )}

          {/* ── Rest Timer ── */}
          {restTimer !== null && (
            <RestTimer
              key={restTimerKey}
              seconds={restTimer}
              onDone={() => setRestTimer(null)}
              onSkip={() => setRestTimer(null)}
            />
          )}

          <div style={{ textAlign:"center", padding:"24px 0 8px", fontSize:14, color:"#444" }}>
            <a href="https://github.com/nickyreinert/f1l0" target="_blank" rel="noopener noreferrer" style={{ color:"#555", textDecoration:"none", letterSpacing:2 }}>ABOUT</a>
          </div>
        </div>
      );
    }

    ReactDOM.createRoot(document.getElementById("root")).render(<App />);
