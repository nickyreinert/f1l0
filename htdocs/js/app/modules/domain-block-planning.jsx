    // WHY: Keep planning defaults centralized so new users always start with a sane setup.
    function defaultBlockPlan() {
      return {
        templates: [
          { id: "push", name: "Push Day", day: 1, cadenceEvery: 1, exerciseNames: ["Push-ups"] },
          { id: "pull", name: "Pull Day", day: 2, cadenceEvery: 1, exerciseNames: ["Pull-ups"] },
        ],
        restCap: { enabled: true, maxTrainDays: 3, restDays: 1 },
        rotation: { resumeAfterPause: true },
      };
    }

    // WHY: Normalize partial/legacy plan data so downstream code can stay branch-light.
    function normalizeBlockPlan(raw) {
      const fallback = defaultBlockPlan();
      const src = raw && typeof raw === "object" ? raw : {};
      const templates = Array.isArray(src.templates) && src.templates.length ? src.templates : fallback.templates;
      const normalizedTemplates = normalizeTemplates(templates.map(normalizeTemplate).filter(Boolean));
      return {
        templates: normalizedTemplates,
        restCap: normalizeRestCap(src.restCap),
        rotation: normalizeRotation(src.rotation),
      };
    }

    // WHY: Enforce minimal template shape so rendering and planning never crash on bad config.
    function normalizeTemplate(template) {
      if (!template || typeof template !== "object") return null;
      const day = Math.max(1, parseInt(template.day || 1, 10) || 1);
      const cadenceEvery = Math.max(1, parseInt(template.cadenceEvery || 1, 10) || 1);
      const exerciseNames = Array.isArray(template.exerciseNames) ? template.exerciseNames.filter(Boolean) : [];
      return {
        id: String(template.id || `block_${Date.now()}`),
        name: String(template.name || "Block"),
        day,
        cadenceEvery,
        exerciseNames,
      };
    }

    // WHY: Compress day numbers to a gapless 1..N sequence so rotation slots stay predictable.
    function normalizeTemplates(templates) {
      const norm = templates.map((t) => normalizeTemplate(t)).filter(Boolean);
      const days = [...new Set(norm.map((t) => t.day))].sort((a, b) => a - b);
      const remap = new Map(days.map((d, i) => [d, i + 1]));
      return norm.map((t) => ({ ...t, day: remap.get(t.day) }));
    }

    // WHY: A global cap guarantees recovery days no matter how many blocks overlap.
    function normalizeRestCap(raw) {
      const src = raw && typeof raw === "object" ? raw : {};
      const enabled = src.enabled !== false;
      const maxTrainDays = Math.max(1, parseInt(src.maxTrainDays || 3, 10) || 3);
      const restDays = Math.max(1, parseInt(src.restDays || 1, 10) || 1);
      return { enabled, maxTrainDays, restDays };
    }

    // WHY: Rotation advances through day-slots; the checkbox decides if a pause breaks that sequence.
    function normalizeRotation(raw) {
      const src = raw && typeof raw === "object" ? raw : {};
      return { resumeAfterPause: src.resumeAfterPause !== false };
    }

    // WHY: Distinct day-slots, ascending, define the rotation order.
    function planSlots(templates) {
      return [...new Set((templates || []).map((t) => t.day))].sort((a, b) => a - b);
    }

    // WHY: Rotation position is driven by real training days, not the calendar, so pauses never desync it.
    function priorTrainCount(priorSessions, resumeAfterPause) {
      const sorted = [...(priorSessions || [])].sort((a, b) => a.date.localeCompare(b.date));
      if (resumeAfterPause) return sorted.filter((s) => (s?.type || "A") === "A").length;
      let streak = 0;
      for (let i = sorted.length - 1; i >= 0; i--) {
        if ((sorted[i]?.type || "A") === "A") streak += 1; else break;
      }
      return streak;
    }

    // WHY: Pick the block-types for today's slot, then apply each block's per-rotation cadence.
    function resolveActiveTemplates(templates, priorSessions, rotation) {
      const slots = planSlots(templates);
      if (!slots.length) return [];
      const trainCount = priorTrainCount(priorSessions, rotation.resumeAfterPause);
      const currentDay = slots[trainCount % slots.length];
      const cycleIndex = Math.floor(trainCount / slots.length);
      return templates.filter((t) => t.day === currentDay && cycleIndex % Math.max(1, t.cadenceEvery) === 0);
    }

    // WHY: A day is rest only when the global cap forces it; otherwise it is a training (rotation) day.
    function resolveDayTypeWithPlan({ priorSessions, plan, fallbackType }) {
      if (!plan) return fallbackType || "A";
      const cap = normalizeBlockPlan(plan).restCap;
      if (!cap.enabled) return "A";
      const sorted = [...(priorSessions || [])].sort((a, b) => b.date.localeCompare(a.date));
      let restRun = 0;
      for (const s of sorted) { if ((s?.type || "A") !== "B") break; restRun += 1; }
      if (restRun > 0 && restRun < cap.restDays) return "B";   // still inside the forced rest window
      let trainRun = 0;
      for (const s of sorted) { if ((s?.type || "A") === "B") break; trainRun += 1; }
      if (trainRun >= cap.maxTrainDays) return "B";            // hit the cap → force a rest day
      return "A";
    }

    // WHY: Prefer template-configured exercises but gracefully fall back to history to reduce setup friction.
    function resolveTemplateExerciseNames({ template, fallbackNames, fallbackSingle }) {
      if (template?.exerciseNames?.length) return template.exerciseNames;
      if (fallbackNames?.length) return fallbackNames;
      return [fallbackSingle];
    }

    // ─── BlockPlanEditor UI components ──────────────────────────────────────────

    // WHY: Isolated, draggable sub-component so each block-type row stays readable and reorderable.
    function TemplateRow({ template, onChange, onRemove, canRemove, dragHandlers, isDragging }) {
      return (
        <div
          draggable
          onDragStart={dragHandlers.onDragStart}
          onDragOver={dragHandlers.onDragOver}
          onDrop={dragHandlers.onDrop}
          onDragEnd={dragHandlers.onDragEnd}
          style={{ background:"#101821", border:`1px solid ${isDragging ? ACC : "#2a3a4a"}`, borderRadius:8, padding:"10px 12px", marginBottom:8, opacity: isDragging ? 0.4 : 1 }}
        >
          <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:8 }}>
            <span title="Drag to reorder / move between days" style={{ ...mono, fontSize:20, color:"#56708a", cursor:"grab", userSelect:"none", padding:"0 2px" }}>⠿</span>
            <input value={template.name} onChange={e => onChange({ name: e.target.value })}
              style={{ flex:1, background:"#1a1a1a", border:`1px solid ${BDR}`, color:"#ddd", padding:"10px 12px", borderRadius:3, outline:"none", fontSize:18, ...cond, fontWeight:700, boxSizing:"border-box" }} />
            {canRemove && <button onClick={onRemove} style={{ width:40, background:"transparent", border:`1px solid #661111`, color:"#aa4444", borderRadius:3, cursor:"pointer", fontSize:20 }}>×</button>}
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ ...mono, fontSize:13, color:"#666" }}>EVERY</span>
            <button onClick={() => onChange({ cadenceEvery: Math.max(1, template.cadenceEvery - 1) })} style={{ width:34, height:34, background:CARD, border:`1px solid #444`, color:"#bbb", borderRadius:3, cursor:"pointer", ...mono, fontSize:20 }}>−</button>
            <span style={{ ...mono, fontSize:22, color:"#ddd", minWidth:24, textAlign:"center" }}>{template.cadenceEvery}</span>
            <button onClick={() => onChange({ cadenceEvery: template.cadenceEvery + 1 })} style={{ width:34, height:34, background:CARD, border:`1px solid #444`, color:"#bbb", borderRadius:3, cursor:"pointer", ...mono, fontSize:20 }}>+</button>
            <span style={{ ...mono, fontSize:13, color:"#666" }}>{template.cadenceEvery > 1 ? "ROTATIONS" : "ROTATION"}</span>
          </div>
          {template.cadenceEvery > 1
            ? <div style={{ ...mono, fontSize:12, color:"#8d8d8d", marginTop:6 }}>Shows only every {template.cadenceEvery}. time this day comes around.</div>
            : <div style={{ ...mono, fontSize:12, color:"#8d8d8d", marginTop:6 }}>Shows every time this day comes around.</div>}
        </div>
      );
    }

    // WHY: One global "max train streak → rest" cap guarantees recovery days across any block mix.
    function RestCapEditor({ cap, onChange }) {
      const on = cap.enabled;
      const Stepper = ({ label, value, onDec, onInc }) => (
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10, opacity: on ? 1 : 0.4 }}>
          <span style={{ ...mono, fontSize:14, color:"#b28ea0", minWidth:140 }}>{label}</span>
          <button disabled={!on} onClick={onDec} style={{ width:42, height:42, background:CARD, border:`1px solid #444`, color:"#bbb", borderRadius:3, cursor: on ? "pointer" : "default", ...mono, fontSize:24 }}>−</button>
          <span style={{ ...mono, fontSize:28, fontWeight:700, color:"#ddd", minWidth:34, textAlign:"center" }}>{value}</span>
          <button disabled={!on} onClick={onInc} style={{ width:42, height:42, background:CARD, border:`1px solid #444`, color:"#bbb", borderRadius:3, cursor: on ? "pointer" : "default", ...mono, fontSize:24 }}>+</button>
        </div>
      );
      return (
        <div style={{ marginTop:16, background:"#1b1216", border:`1px solid #402630`, borderRadius:8, padding:"12px 12px 10px" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
            <span style={{ ...lbl9, fontSize:14, color:"#efbacd" }}>REST CAP</span>
            <button
              onClick={() => onChange({ enabled: !on })}
              style={{
                minWidth:96, padding:"8px 10px", borderRadius:3, cursor:"pointer", ...cond, fontWeight:700, fontSize:14,
                border:`1px solid ${on ? ACC : BDR}`, background: on ? ACC : "transparent", color: on ? BG : "#777",
              }}
            >{on ? "ON" : "OFF"}</button>
          </div>
          <div style={{ ...mono, fontSize:15, color:"#b28ea0", marginBottom:14 }}>
            {on
              ? `After ${cap.maxTrainDays} training day${cap.maxTrainDays > 1 ? "s" : ""} in a row, force ${cap.restDays} rest day${cap.restDays > 1 ? "s" : ""}.`
              : "Off — rest days come only from block cadence."}
          </div>
          <Stepper label="MAX TRAIN DAYS" value={cap.maxTrainDays}
            onDec={() => onChange({ maxTrainDays: Math.max(1, cap.maxTrainDays - 1) })}
            onInc={() => onChange({ maxTrainDays: cap.maxTrainDays + 1 })} />
          <Stepper label="REST DAYS" value={cap.restDays}
            onDec={() => onChange({ restDays: Math.max(1, cap.restDays - 1) })}
            onInc={() => onChange({ restDays: cap.restDays + 1 })} />
        </div>
      );
    }

    // WHY: One checkbox decides whether a pause continues the day rotation or restarts it.
    function RotationEditor({ rotation, onChange }) {
      const on = rotation.resumeAfterPause;
      return (
        <div style={{ marginTop:16, background:"#0f1612", border:`1px solid #25402f`, borderRadius:8, padding:"12px" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <span style={{ ...lbl9, fontSize:14, color:"#bfe7cd" }}>RESUME AFTER PAUSE</span>
            <button
              onClick={() => onChange({ resumeAfterPause: !on })}
              style={{
                minWidth:96, padding:"8px 10px", borderRadius:3, cursor:"pointer", ...cond, fontWeight:700, fontSize:14,
                border:`1px solid ${on ? ACC : BDR}`, background: on ? ACC : "transparent", color: on ? BG : "#777",
              }}
            >{on ? "ON" : "OFF"}</button>
          </div>
          <div style={{ ...mono, fontSize:14, color:"#9fcbb0", marginTop:10 }}>
            {on
              ? "After a pause, the next training day continues with the next day in order."
              : "After a pause, the rotation restarts from Day 1."}
          </div>
        </div>
      );
    }

    // WHY: Top-level editor groups block-types into ordered days; rotation walks those days.
    function BlockPlanEditor({ plan, onChange }) {
      const [dragId, setDragId] = useState(null);
      const emitPlan = (next) => onChange(normalizeBlockPlan(next));
      const updateTemplate = (id, patch) => {
        const updated = plan.templates.map((t) => t.id !== id ? t : normalizeTemplate({ ...t, ...patch }));
        emitPlan({ ...plan, templates: updated });
      };
      const addTemplate = () => {
        const maxDay = plan.templates.reduce((m, t) => Math.max(m, t.day), 0);
        const t = normalizeTemplate({ id: `t${Date.now()}`, name: "New Block", day: maxDay + 1, cadenceEvery: 1 });
        emitPlan({ ...plan, templates: [...plan.templates, t] });
      };
      const removeTemplate = (id) => emitPlan({ ...plan, templates: plan.templates.filter((t) => t.id !== id) });
      const updateRestCap = (patch) => emitPlan({ ...plan, restCap: { ...plan.restCap, ...patch } });
      const updateRotation = (patch) => emitPlan({ ...plan, rotation: { ...plan.rotation, ...patch } });

      // Drop onto a row: take that row's day and slot in right before it.
      const moveBlock = (targetId) => {
        if (!dragId || dragId === targetId) return;
        const dragT = plan.templates.find((t) => t.id === dragId);
        const targetT = plan.templates.find((t) => t.id === targetId);
        if (!dragT || !targetT) return;
        const rest = plan.templates.filter((t) => t.id !== dragId);
        const idx = rest.findIndex((t) => t.id === targetId);
        const moved = { ...dragT, day: targetT.day };
        emitPlan({ ...plan, templates: [...rest.slice(0, idx), moved, ...rest.slice(idx)] });
      };
      // Drop onto a day container (not a row): just join that day.
      const dropOnDay = (day) => {
        if (!dragId) return;
        const dragT = plan.templates.find((t) => t.id === dragId);
        if (!dragT || dragT.day === day) return;
        const rest = plan.templates.filter((t) => t.id !== dragId);
        emitPlan({ ...plan, templates: [...rest, { ...dragT, day }] });
      };
      const rowHandlers = (id) => ({
        onDragStart: () => setDragId(id),
        onDragOver: (e) => e.preventDefault(),
        onDrop: (e) => { e.preventDefault(); e.stopPropagation(); moveBlock(id); setDragId(null); },
        onDragEnd: () => setDragId(null),
      });

      const slots = planSlots(plan.templates);
      return (
        <div>
          {slots.map((day) => (
            <div key={day}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); dropOnDay(day); setDragId(null); }}
              style={{ marginBottom:12, padding:"6px 6px 2px", border:`1px dashed #1f2d3a`, borderRadius:8 }}>
              <div style={{ ...lbl9, fontSize:13, color:"#7fa8c9", margin:"2px 0 8px 2px" }}>DAY {day}</div>
              {plan.templates.filter((t) => t.day === day).map((t) => (
                <TemplateRow key={t.id} template={t}
                  onChange={(p) => updateTemplate(t.id, p)}
                  onRemove={() => removeTemplate(t.id)}
                  canRemove={plan.templates.length > 1}
                  dragHandlers={rowHandlers(t.id)}
                  isDragging={dragId === t.id} />
              ))}
            </div>
          ))}
          <button onClick={addTemplate} style={{ width:"100%", padding:12, background:CARD, border:`1px dashed ${BDR}`, color:"#888", borderRadius:4, cursor:"pointer", fontSize:17, ...cond, marginBottom:4 }}>+ ADD BLOCK (NEW DAY)</button>
          <div style={{ ...mono, fontSize:12, color:"#666", marginBottom:4 }}>Drag a block onto another to put them on the same day.</div>
          <RotationEditor rotation={plan.rotation} onChange={updateRotation} />
          <RestCapEditor cap={plan.restCap} onChange={updateRestCap} />
        </div>
      );
    }

    // WHY: Create full default day payload in one place to keep App initialization focused on state wiring.
    function buildDefaultDayPayload({ date, priorSessions, dayType, lastTargets, plan }) {
      const normalized = normalizeBlockPlan(plan);
      const past = (priorSessions || []).filter((s) => s.date < date);
      const activeTemplates = dayType === "B"
        ? []
        : resolveActiveTemplates(normalized.templates, past, normalized.rotation);
      const lastTraining = [...priorSessions].reverse().find((s) => s.type === "A");
      const lastTrainNames = (lastTraining?.exercises || []).map((e) => e.name);

      const trainBlocks = activeTemplates.length
        ? buildTrainingBlocks(activeTemplates, lastTrainNames, lastTargets, priorSessions)
        : [];
      const mornExercises = [];
      return { trainBlocks, mornExercises, exercises: flattenBlocks(trainBlocks) };
    }

    // WHY: Keep block instantiation isolated so future template attributes can be added without touching App.
    function buildTrainingBlocks(templates, fallbackNames, lastTargets, priorSessions) {
      if (!templates.length) {
        const names = fallbackNames.length ? fallbackNames : ["Pull-ups"];
        return [mkBlock(mkExFromTargets(names, lastTargets), "Training Block")];
      }
      return templates.map((template) => {
        const names = resolveTemplateExerciseNames({ template, fallbackNames, fallbackSingle: "Pull-ups" });
        return mkBlock(mkExFromTargets(names, lastTargets), template.name);
      });
    }
