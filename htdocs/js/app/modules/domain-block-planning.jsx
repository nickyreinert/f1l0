    // WHY: Keep planning defaults centralized so new users always start with a sane setup.
    function defaultBlockPlan() {
      return {
        templates: [
          { id: "morning", name: "Morning Routine", slot: "morning", cadenceEvery: 1, exerciseNames: ["Push-ups"] },
          { id: "training", name: "Training", slot: "training", cadenceEvery: 1, exerciseNames: ["Pull-ups"] },
        ],
        restRule: { mode: "everyNthDay", value: 2, anchorDate: "2026-01-01" },
      };
    }

    // WHY: Normalize partial/legacy plan data so downstream code can stay branch-light.
    function normalizeBlockPlan(raw) {
      const fallback = defaultBlockPlan();
      const src = raw && typeof raw === "object" ? raw : {};
      const templates = Array.isArray(src.templates) && src.templates.length ? src.templates : fallback.templates;
      const restRule = src.restRule && typeof src.restRule === "object" ? src.restRule : fallback.restRule;
      return {
        templates: templates.map(normalizeTemplate).filter(Boolean),
        restRule: normalizeRestRule(restRule),
      };
    }

    // WHY: Enforce minimal template shape so rendering and planning never crash on bad config.
    function normalizeTemplate(template) {
      if (!template || typeof template !== "object") return null;
      const slot = template.slot === "morning" ? "morning" : "training";
      const cadenceEvery = Math.max(1, parseInt(template.cadenceEvery || 1, 10) || 1);
      const exerciseNames = Array.isArray(template.exerciseNames) ? template.exerciseNames.filter(Boolean) : [];
      return {
        id: String(template.id || `${slot}_${Date.now()}`),
        name: String(template.name || (slot === "morning" ? "Morning Routine" : "Training")),
        slot,
        cadenceEvery,
        exerciseNames,
      };
    }

    // WHY: Keep rest behavior simple but predictable across all user plans.
    function normalizeRestRule(rule) {
      const mode = rule.mode === "afterNTrainDays" ? "afterNTrainDays" : "everyNthDay";
      const value = Math.max(1, parseInt(rule.value || 2, 10) || 2);
      const anchorDate = typeof rule.anchorDate === "string" ? rule.anchorDate : "2026-01-01";
      return { mode, value, anchorDate };
    }

    // WHY: Convert dates into stable whole-day indexes independent from local clock time.
    function dayDiff(anchorDate, date) {
      const a = new Date(`${anchorDate}T12:00:00`).getTime();
      const b = new Date(`${date}T12:00:00`).getTime();
      return Math.max(0, Math.floor((b - a) / 86400000));
    }

    // WHY: Support "every Nth day" pause cadence for straightforward alternating schedules.
    function isPauseByNthDay(restRule, date) {
      const offset = dayDiff(restRule.anchorDate, date);
      return offset % restRule.value === restRule.value - 1;
    }

    // WHY: Support "pause after N train days" without adding complex weekly rule engines.
    function isPauseAfterTrainRun(restRule, priorSessions) {
      const sorted = [...priorSessions].sort((a, b) => b.date.localeCompare(a.date));
      let trainRun = 0;
      for (const s of sorted) {
        if ((s?.type || "A") === "B") break;
        trainRun += 1;
      }
      return trainRun >= restRule.value;
    }

    // WHY: Keep old behavior as fallback so migration is non-breaking if plan config is missing.
    function resolveDayTypeWithPlan({ date, priorSessions, plan, fallbackType }) {
      if (!plan || !plan.restRule) return fallbackType || "A";
      if (plan.restRule.mode === "afterNTrainDays") {
        return isPauseAfterTrainRun(plan.restRule, priorSessions) ? "B" : "A";
      }
      return isPauseByNthDay(plan.restRule, date) ? "B" : "A";
    }

    // WHY: Cadence per template lets users express alternating focus blocks without many options.
    function isTemplateScheduledToday(template, date, anchorDate) {
      const offset = dayDiff(anchorDate || "2026-01-01", date);
      return offset % template.cadenceEvery === 0;
    }

    // WHY: Build today's template list once so UI and defaults derive from the same schedule source.
    function templatesForDaySlot(plan, slot, date) {
      const anchor = plan?.restRule?.anchorDate || "2026-01-01";
      return (plan?.templates || [])
        .filter((t) => t.slot === slot)
        .filter((t) => isTemplateScheduledToday(t, date, anchor));
    }

    // WHY: Prefer template-configured exercises but gracefully fall back to history to reduce setup friction.
    function resolveTemplateExerciseNames({ template, fallbackNames, fallbackSingle }) {
      if (template?.exerciseNames?.length) return template.exerciseNames;
      if (fallbackNames?.length) return fallbackNames;
      return [fallbackSingle];
    }

    // ─── BlockPlanEditor UI components ──────────────────────────────────────────

    // WHY: Isolated sub-component so each template row stays readable and testable on its own.
    function TemplateRow({ template, onChange, onRemove, canRemove }) {
      const slotBtn = (s) => ({
        flex:1, padding:"6px 0", fontWeight:700, fontSize:11, letterSpacing:1, cursor:"pointer",
        border:`1px solid ${template.slot===s ? ACC : BDR}`, borderRadius:3, ...cond,
        background: template.slot===s ? ACC : "transparent", color: template.slot===s ? BG : "#777",
      });
      return (
        <div style={{ background:"#0d0d0d", border:`1px solid ${BDR}`, borderRadius:6, padding:"12px 14px", marginBottom:10 }}>
          <div style={{ display:"flex", gap:8, marginBottom:8 }}>
            <input value={template.name} onChange={e => onChange({ name: e.target.value })}
              style={{ flex:1, background:"#1a1a1a", border:`1px solid ${BDR}`, color:"#ddd", padding:"8px 10px", borderRadius:3, outline:"none", fontSize:14, ...cond, fontWeight:700, boxSizing:"border-box" }} />
            {canRemove && <button onClick={onRemove} style={{ width:34, background:"transparent", border:`1px solid #661111`, color:"#aa4444", borderRadius:3, cursor:"pointer", fontSize:16 }}>×</button>}
          </div>
          <div style={{ display:"flex", gap:6, marginBottom:8 }}>
            {["morning","training"].map(s => <button key={s} onClick={() => onChange({ slot: s })} style={slotBtn(s)}>{s.toUpperCase()}</button>)}
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ ...mono, fontSize:10, color:"#666" }}>EVERY</span>
            <button onClick={() => onChange({ cadenceEvery: Math.max(1, template.cadenceEvery - 1) })} style={{ width:28, height:28, background:CARD, border:`1px solid #444`, color:"#bbb", borderRadius:3, cursor:"pointer", ...mono }}>−</button>
            <span style={{ ...mono, fontSize:16, color:"#ddd", minWidth:20, textAlign:"center" }}>{template.cadenceEvery}</span>
            <button onClick={() => onChange({ cadenceEvery: template.cadenceEvery + 1 })} style={{ width:28, height:28, background:CARD, border:`1px solid #444`, color:"#bbb", borderRadius:3, cursor:"pointer", ...mono }}>+</button>
            <span style={{ ...mono, fontSize:10, color:"#666" }}>DAYS</span>
          </div>
        </div>
      );
    }

    // WHY: Pause rules stay in one place; mode + N covers alternating and run-length patterns.
    function RestRuleEditor({ rule, onChange }) {
      const modeBtn = (mode, label) => ({
        flex:1, padding:"7px 4px", fontWeight:700, fontSize:10, letterSpacing:0.5, cursor:"pointer",
        border:`1px solid ${rule.mode===mode ? ACC : BDR}`, borderRadius:3, ...cond,
        background: rule.mode===mode ? ACC : "transparent", color: rule.mode===mode ? BG : "#777",
      });
      const desc = rule.mode === "afterNTrainDays"
        ? `Rest after ${rule.value} consecutive training day${rule.value > 1 ? "s" : ""}`
        : `Rest on every ${rule.value}${rule.value===2?"nd":rule.value===3?"rd":"th"} day`;
      return (
        <div style={{ marginTop:16 }}>
          <div style={{ ...lbl9, marginBottom:10 }}>PAUSE RULE</div>
          <div style={{ display:"flex", gap:6, marginBottom:12 }}>
            <button style={modeBtn("everyNthDay","EVERY N DAYS")} onClick={() => onChange({ mode:"everyNthDay" })}>EVERY N DAYS</button>
            <button style={modeBtn("afterNTrainDays","AFTER N TRAIN DAYS")} onClick={() => onChange({ mode:"afterNTrainDays" })}>AFTER N TRAIN DAYS</button>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
            <span style={{ ...mono, fontSize:11, color:"#666" }}>N =</span>
            <button onClick={() => onChange({ value: Math.max(1, rule.value - 1) })} style={{ width:36, height:36, background:CARD, border:`1px solid #444`, color:"#bbb", borderRadius:3, cursor:"pointer", ...mono, fontSize:20 }}>−</button>
            <span style={{ ...mono, fontSize:22, fontWeight:700, color:"#ddd", minWidth:28, textAlign:"center" }}>{rule.value}</span>
            <button onClick={() => onChange({ value: rule.value + 1 })} style={{ width:36, height:36, background:CARD, border:`1px solid #444`, color:"#bbb", borderRadius:3, cursor:"pointer", ...mono, fontSize:20 }}>+</button>
          </div>
          <div style={{ ...mono, fontSize:11, color:"#555" }}>{desc}</div>
        </div>
      );
    }

    // WHY: Top-level block plan editor keeps template list + rest rule co-located so config feels cohesive.
    function BlockPlanEditor({ plan, onChange }) {
      const updateTemplate = (idx, patch) => {
        const updated = plan.templates.map((t, i) => i !== idx ? t : normalizeTemplate({ ...t, ...patch }));
        onChange({ ...plan, templates: updated });
      };
      const addTemplate = () => {
        const t = normalizeTemplate({ id: `t${Date.now()}`, name: "New Block", slot: "training", cadenceEvery: 1 });
        onChange({ ...plan, templates: [...plan.templates, t] });
      };
      const removeTemplate = (idx) => onChange({ ...plan, templates: plan.templates.filter((_, i) => i !== idx) });
      const updateRestRule = (patch) => onChange({ ...plan, restRule: { ...plan.restRule, ...patch } });
      return (
        <div>
          {plan.templates.map((t, idx) => (
            <TemplateRow key={t.id} template={t} onChange={p => updateTemplate(idx, p)}
              onRemove={() => removeTemplate(idx)} canRemove={plan.templates.length > 1} />
          ))}
          <button onClick={addTemplate} style={{ width:"100%", padding:10, background:CARD, border:`1px dashed ${BDR}`, color:"#888", borderRadius:4, cursor:"pointer", fontSize:13, ...cond, marginBottom:4 }}>+ ADD BLOCK</button>
          <RestRuleEditor rule={plan.restRule} onChange={updateRestRule} />
        </div>
      );
    }

    // WHY: Create full default day payload in one place to keep App initialization focused on state wiring.
    function buildDefaultDayPayload({ date, priorSessions, dayType, lastTargets, plan }) {
      const trainingTemplates = dayType === "B" ? [] : templatesForDaySlot(plan, "training", date);
      const morningTemplates = templatesForDaySlot(plan, "morning", date);
      const lastTraining = [...priorSessions].reverse().find((s) => s.type === "A");
      const lastMorn = [...priorSessions].reverse().find((s) => s.mornExercises?.length);
      const lastTrainNames = (lastTraining?.exercises || []).map((e) => e.name);
      const lastMornNames = (lastMorn?.mornExercises || []).map((e) => e.name);

      const trainBlocks = buildTrainingBlocks(trainingTemplates, lastTrainNames, lastTargets);
      const mornExercises = buildMorningExercises(morningTemplates, lastMornNames, lastTargets);
      return { trainBlocks, mornExercises, exercises: flattenBlocks(trainBlocks) };
    }

    // WHY: Keep block instantiation isolated so future template attributes can be added without touching App.
    function buildTrainingBlocks(templates, fallbackNames, lastTargets) {
      if (!templates.length) return [];
      return templates.map((template) => {
        const names = resolveTemplateExerciseNames({ template, fallbackNames, fallbackSingle: "Pull-ups" });
        const exercises = mkExFromTargets(names, lastTargets);
        return mkBlock(exercises, template.name);
      });
    }

    // WHY: Morning defaults stay independent from training templates to support mixed daily routines.
    function buildMorningExercises(templates, fallbackNames, lastTargets) {
      if (!templates.length) {
        const names = fallbackNames.length ? fallbackNames : ["Push-ups"];
        return mkExFromTargets(names, lastTargets);
      }
      const names = resolveTemplateExerciseNames({ template: templates[0], fallbackNames, fallbackSingle: "Push-ups" });
      return mkExFromTargets(names, lastTargets);
    }
