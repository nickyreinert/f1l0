    // WHY: Keep planning defaults centralized so new users always start with a sane setup.
    function defaultBlockPlan() {
      return {
        templates: [
          { id: "morning", name: "Morning", cadenceEvery: 1, exerciseNames: ["Push-ups"] },
          { id: "workout", name: "Workout", cadenceEvery: 2, exerciseNames: ["Pull-ups"] },
        ],
        restCap: { enabled: true, maxTrainDays: 3, restDays: 1 },
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
      };
    }

    // WHY: Enforce minimal template shape so rendering and planning never crash on bad config.
    function normalizeTemplate(template) {
      if (!template || typeof template !== "object") return null;
      const cadenceEvery = Math.max(1, parseInt(template.cadenceEvery || 1, 10) || 1);
      const exerciseNames = Array.isArray(template.exerciseNames) ? template.exerciseNames.filter(Boolean) : [];
      return {
        id: String(template.id || `block_${Date.now()}`),
        name: String(template.name || "Block"),
        cadenceEvery,
        exerciseNames,
      };
    }

    // WHY: Block-types are independent; just keep the valid ones (no day-slot remapping).
    function normalizeTemplates(templates) {
      return templates.map((t) => normalizeTemplate(t)).filter(Boolean);
    }

    // WHY: A global cap guarantees recovery days no matter how many blocks overlap.
    function normalizeRestCap(raw) {
      const src = raw && typeof raw === "object" ? raw : {};
      const enabled = src.enabled !== false;
      const maxTrainDays = Math.max(1, parseInt(src.maxTrainDays || 3, 10) || 3);
      const restDays = Math.max(1, parseInt(src.restDays || 1, 10) || 1);
      return { enabled, maxTrainDays, restDays };
    }

    // WHY: Each block-type recurs on its own "every Nth training day" cadence, independent of the others.
    //      Cadence counts real training days (type A), so a rest day pauses — never desyncs — the count.
    function resolveActiveTemplates(templates, priorSessions) {
      const trainIndex = (priorSessions || []).filter((s) => (s?.type || "A") === "A").length;
      return (templates || []).filter((t) => trainIndex % Math.max(1, t.cadenceEvery) === 0);
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
    function TemplateRow({ template, onChange, onRemove, canRemove }) {
      const ordinal = (n) => { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
      return (
        <div
          style={{ background:"#101821", border:`1px solid #2a3a4a`, borderRadius:8, padding:"10px 12px", marginBottom:8 }}
        >
          <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:8 }}>
            <input value={template.name} onChange={e => onChange({ name: e.target.value })}
              style={{ flex:1, background:"#1a1a1a", border:`1px solid ${BDR}`, color:"#ddd", padding:"10px 12px", borderRadius:3, outline:"none", fontSize:18, ...cond, fontWeight:700, boxSizing:"border-box" }} />
            {canRemove && <button onClick={onRemove} style={{ width:40, background:"transparent", border:`1px solid #661111`, color:"#aa4444", borderRadius:3, cursor:"pointer", fontSize:20 }}>×</button>}
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ ...mono, fontSize:13, color:"#666" }}>EVERY</span>
            <button onClick={() => onChange({ cadenceEvery: Math.max(1, template.cadenceEvery - 1) })} style={{ width:34, height:34, background:CARD, border:`1px solid #444`, color:"#bbb", borderRadius:3, cursor:"pointer", ...mono, fontSize:20 }}>−</button>
            <span style={{ ...mono, fontSize:22, color:"#ddd", minWidth:24, textAlign:"center" }}>{template.cadenceEvery}</span>
            <button onClick={() => onChange({ cadenceEvery: template.cadenceEvery + 1 })} style={{ width:34, height:34, background:CARD, border:`1px solid #444`, color:"#bbb", borderRadius:3, cursor:"pointer", ...mono, fontSize:20 }}>+</button>
            <span style={{ ...mono, fontSize:13, color:"#666" }}>{template.cadenceEvery > 1 ? "DAYS" : "DAY"}</span>
          </div>
          {template.cadenceEvery > 1
            ? <div style={{ ...mono, fontSize:12, color:"#8d8d8d", marginTop:6 }}>Active on every {ordinal(template.cadenceEvery)} training day.</div>
            : <div style={{ ...mono, fontSize:12, color:"#8d8d8d", marginTop:6 }}>Active on every training day.</div>}
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

    // WHY: Top-level editor lists independent block-types, each with its own recurrence cadence.
    function BlockPlanEditor({ plan, onChange }) {
      const emitPlan = (next) => onChange(normalizeBlockPlan(next));
      const updateTemplate = (id, patch) => {
        const updated = plan.templates.map((t) => t.id !== id ? t : normalizeTemplate({ ...t, ...patch }));
        emitPlan({ ...plan, templates: updated });
      };
      const addTemplate = () => {
        const t = normalizeTemplate({ id: `t${Date.now()}`, name: "New Block", cadenceEvery: 1 });
        emitPlan({ ...plan, templates: [...plan.templates, t] });
      };
      const removeTemplate = (id) => emitPlan({ ...plan, templates: plan.templates.filter((t) => t.id !== id) });
      const updateRestCap = (patch) => emitPlan({ ...plan, restCap: { ...plan.restCap, ...patch } });

      return (
        <div>
          {plan.templates.map((t) => (
            <TemplateRow key={t.id} template={t}
              onChange={(p) => updateTemplate(t.id, p)}
              onRemove={() => removeTemplate(t.id)}
              canRemove={plan.templates.length > 1} />
          ))}
          <button onClick={addTemplate} style={{ width:"100%", padding:12, background:CARD, border:`1px dashed ${BDR}`, color:"#888", borderRadius:4, cursor:"pointer", fontSize:17, ...cond, marginBottom:4 }}>+ ADD BLOCK TYPE</button>
          <div style={{ ...mono, fontSize:12, color:"#666", marginBottom:4 }}>Each block type appears on its own schedule (e.g. every day, every 2nd day).</div>
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
        : resolveActiveTemplates(normalized.templates, past);
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
        return mkBlock(mkExFromTargets(names, lastTargets), template.name, template.id);
      });
    }
