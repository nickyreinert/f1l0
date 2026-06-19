    // WHY: Keep planning defaults centralized so new users always start with a sane setup.
    function defaultBlockPlan() {
      return {
        templates: [
          { id: "routine", name: "Daily Routine", requiresPause: false, cadenceEvery: 1, exerciseNames: ["Push-ups"] },
          { id: "training", name: "Training Block", requiresPause: true, cadenceEvery: 2, exerciseNames: ["Pull-ups"] },
        ],
        restRule: { mode: "everyNthDay", value: 2, pauseDays: 1, anchorDate: "2026-01-01" },
      };
    }

    // WHY: Normalize partial/legacy plan data so downstream code can stay branch-light.
    function normalizeBlockPlan(raw) {
      const fallback = defaultBlockPlan();
      const src = raw && typeof raw === "object" ? raw : {};
      const templates = Array.isArray(src.templates) && src.templates.length ? src.templates : fallback.templates;
      const restRule = src.restRule && typeof src.restRule === "object" ? src.restRule : fallback.restRule;
      const normalizedTemplates = normalizeTemplates(templates.map(normalizeTemplate).filter(Boolean));
      return {
        templates: normalizedTemplates,
        restRule: normalizeRestRule(restRule, normalizedTemplates),
      };
    }

    // WHY: Enforce minimal template shape so rendering and planning never crash on bad config.
    function normalizeTemplate(template) {
      if (!template || typeof template !== "object") return null;
      const requiresPause = template.requiresPause === true || template.slot === "training";
      const minCadence = requiresPause ? 2 : 1;
      const cadenceEvery = Math.max(minCadence, parseInt(template.cadenceEvery || minCadence, 10) || minCadence);
      const exerciseNames = Array.isArray(template.exerciseNames) ? template.exerciseNames.filter(Boolean) : [];
      return {
        id: String(template.id || `block_${Date.now()}`),
        name: String(template.name || (requiresPause ? "Training Block" : "Daily Routine")),
        requiresPause,
        cadenceEvery,
        exerciseNames,
      };
    }

    // WHY: Training blocks form a loop where one rest gap must exist in each cycle.
    function cycleBaseFromTemplates(templates) {
      const pauseBlocks = (templates || []).filter((t) => t.requiresPause).length;
      return Math.max(2, pauseBlocks + 1);
    }

    // WHY: The tightest pause cadence across pause-required blocks defines maximum safe daily block density.
    function minPauseCadence(templates) {
      const vals = (templates || []).filter((t) => t.requiresPause).map((t) => t.cadenceEvery);
      return vals.length ? Math.min(...vals) : 2;
    }

    // WHY: Keep cadence data deterministic by deriving it from the number of pause blocks.
    function normalizeTemplates(templates) {
      return templates.map((t) => normalizeTemplate(t)).filter(Boolean);
    }

    // WHY: Runtime add-block actions should never exceed what the configured pause loop can safely support.
    function canAddBlockForPlan(plan, currentBlockCount) {
      const normalized = normalizeBlockPlan(plan);
      const pauseBlocks = normalized.templates.filter((t) => t.requiresPause).length;
      const cadenceCap = pauseBlocks > 0 ? Math.max(1, minPauseCadence(normalized.templates)) : 1;
      const cycleBase = cycleBaseFromTemplates(normalized.templates);
      const restValid = normalized.restRule.mode !== "everyNthDay"
        || normalized.restRule.value % cycleBase === 0;
      return restValid && currentBlockCount < cadenceCap;
    }

    // WHY: Keep rest behavior simple but predictable across all user plans.
    function normalizeRestRule(rule, templates) {
      const mode = rule.mode === "afterNTrainDays" ? "afterNTrainDays" : "everyNthDay";
      const cycleBase = cycleBaseFromTemplates(templates || []);
      const cadenceBase = minPauseCadence(templates || []);
      const rawValue = Math.max(1, parseInt(rule.value || 2, 10) || 2);
      const value = mode === "everyNthDay"
        ? Math.ceil(Math.max(cycleBase, cadenceBase, rawValue) / cycleBase) * cycleBase
        : rawValue;
      const pauseDays = Math.max(1, parseInt(rule.pauseDays || 1, 10) || 1);
      const maxPauseDays = mode === "everyNthDay" ? Math.max(1, value - 1) : 30;
      const anchorDate = typeof rule.anchorDate === "string" ? rule.anchorDate : "2026-01-01";
      return { mode, value, pauseDays: Math.min(pauseDays, maxPauseDays), anchorDate };
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
      const cyclePos = offset % restRule.value;
      return cyclePos >= restRule.value - restRule.pauseDays;
    }

    // WHY: Support "pause after N train days" without adding complex weekly rule engines.
    function isPauseAfterTrainRun(restRule, priorSessions) {
      const sorted = [...priorSessions].sort((a, b) => b.date.localeCompare(a.date));
      let restRun = 0;
      for (const s of sorted) {
        if ((s?.type || "A") !== "B") break;
        restRun += 1;
      }
      if (restRun > 0) return restRun < restRule.pauseDays;
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

    // WHY: Per-block cadence should decide whether the block appears on this date.
    function isTemplateScheduledToday(template, date, anchorDate) {
      const offset = dayDiff(anchorDate || "2026-01-01", date);
      return offset % Math.max(1, template.cadenceEvery || 1) === 0;
    }

    // WHY: Prefer template-configured exercises but gracefully fall back to history to reduce setup friction.
    function resolveTemplateExerciseNames({ template, fallbackNames, fallbackSingle }) {
      if (template?.exerciseNames?.length) return template.exerciseNames;
      if (fallbackNames?.length) return fallbackNames;
      return [fallbackSingle];
    }

    // ─── BlockPlanEditor UI components ──────────────────────────────────────────

    // WHY: Isolated sub-component so each template row stays readable and testable on its own.
    function TemplateRow({ template, cycleBase, onChange, onRemove, canRemove }) {
      const cadenceStep = template.requiresPause ? cycleBase : 1;
      const cadenceMin = template.requiresPause ? Math.max(2, cycleBase) : 1;
      return (
        <div style={{ background:"#0d0d0d", border:`1px solid ${BDR}`, borderRadius:6, padding:"12px 14px", marginBottom:10 }}>
          <div style={{ display:"flex", gap:8, marginBottom:8 }}>
            <input value={template.name} onChange={e => onChange({ name: e.target.value })}
              style={{ flex:1, background:"#1a1a1a", border:`1px solid ${BDR}`, color:"#ddd", padding:"10px 12px", borderRadius:3, outline:"none", fontSize:18, ...cond, fontWeight:700, boxSizing:"border-box" }} />
            {canRemove && <button onClick={onRemove} style={{ width:40, background:"transparent", border:`1px solid #661111`, color:"#aa4444", borderRadius:3, cursor:"pointer", fontSize:20 }}>×</button>}
          </div>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, marginBottom:8 }}>
            <span style={{ ...mono, fontSize:13, color:"#666" }}>REQUIRES PAUSE</span>
            <button
              onClick={() => onChange({ requiresPause: !template.requiresPause })}
              style={{
                minWidth:120, padding:"8px 10px", borderRadius:3, cursor:"pointer", ...cond,
                border:`1px solid ${template.requiresPause ? ACC : BDR}`,
                background: template.requiresPause ? ACC : "transparent",
                color: template.requiresPause ? BG : "#777", fontWeight:700, fontSize:14,
              }}
            >
              {template.requiresPause ? "YES" : "NO"}
            </button>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
            <span style={{ ...mono, fontSize:13, color:"#666" }}>EVERY</span>
            <button onClick={() => onChange({ cadenceEvery: Math.max(cadenceMin, template.cadenceEvery - cadenceStep) })} style={{ width:34, height:34, background:CARD, border:`1px solid #444`, color:"#bbb", borderRadius:3, cursor:"pointer", ...mono, fontSize:20 }}>−</button>
            <span style={{ ...mono, fontSize:22, color:"#ddd", minWidth:24, textAlign:"center" }}>{template.cadenceEvery}</span>
            <button onClick={() => onChange({ cadenceEvery: template.cadenceEvery + cadenceStep })} style={{ width:34, height:34, background:CARD, border:`1px solid #444`, color:"#bbb", borderRadius:3, cursor:"pointer", ...mono, fontSize:20 }}>+</button>
            <span style={{ ...mono, fontSize:13, color:"#666" }}>DAYS</span>
          </div>
          {template.requiresPause && <div style={{ ...mono, fontSize:13, color:"#888" }}>Loop cadence: every {cycleBase} day(s)</div>}
          {!template.requiresPause && <div style={{ ...mono, fontSize:13, color:"#666" }}>Runs daily as routine block</div>}
        </div>
      );
    }

    // WHY: Pause rules stay in one place; mode + N covers alternating and run-length patterns.
    function RestRuleEditor({ rule, cycleBase, onChange }) {
      const modeBtn = (mode, label) => ({
        flex:1, padding:"10px 6px", fontWeight:700, fontSize:13, letterSpacing:0.5, cursor:"pointer",
        border:`1px solid ${rule.mode===mode ? ACC : BDR}`, borderRadius:3, ...cond,
        background: rule.mode===mode ? ACC : "transparent", color: rule.mode===mode ? BG : "#777",
      });
      const desc = rule.mode === "afterNTrainDays"
        ? `Pause after ${rule.value} training day(s), then pause ${rule.pauseDays} day(s)`
        : `Pause rhythm must be a multiple of ${cycleBase} (training loop + pause)`;
      const step = rule.mode === "everyNthDay" ? cycleBase : 1;
      return (
        <div style={{ marginTop:16 }}>
          <div style={{ ...lbl9, marginBottom:10, fontSize:14 }}>PAUSE RULE</div>
          <div style={{ display:"flex", gap:6, marginBottom:12 }}>
            <button style={modeBtn("everyNthDay","EVERY N DAYS")} onClick={() => onChange({ mode:"everyNthDay" })}>EVERY N DAYS</button>
            <button style={modeBtn("afterNTrainDays","AFTER N TRAIN DAYS")} onClick={() => onChange({ mode:"afterNTrainDays" })}>AFTER N TRAIN DAYS</button>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
            <span style={{ ...mono, fontSize:15, color:"#666" }}>N =</span>
            <button onClick={() => onChange({ value: Math.max(1, rule.value - step) })} style={{ width:42, height:42, background:CARD, border:`1px solid #444`, color:"#bbb", borderRadius:3, cursor:"pointer", ...mono, fontSize:24 }}>−</button>
            <span style={{ ...mono, fontSize:28, fontWeight:700, color:"#ddd", minWidth:34, textAlign:"center" }}>{rule.value}</span>
            <button onClick={() => onChange({ value: rule.value + step })} style={{ width:42, height:42, background:CARD, border:`1px solid #444`, color:"#bbb", borderRadius:3, cursor:"pointer", ...mono, fontSize:24 }}>+</button>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
            <span style={{ ...mono, fontSize:15, color:"#666" }}>PAUSE DAYS</span>
            <button onClick={() => onChange({ pauseDays: Math.max(1, rule.pauseDays - 1) })} style={{ width:42, height:42, background:CARD, border:`1px solid #444`, color:"#bbb", borderRadius:3, cursor:"pointer", ...mono, fontSize:24 }}>−</button>
            <span style={{ ...mono, fontSize:28, fontWeight:700, color:"#ddd", minWidth:34, textAlign:"center" }}>{rule.pauseDays}</span>
            <button onClick={() => onChange({ pauseDays: rule.pauseDays + 1 })} style={{ width:42, height:42, background:CARD, border:`1px solid #444`, color:"#bbb", borderRadius:3, cursor:"pointer", ...mono, fontSize:24 }}>+</button>
          </div>
          <div style={{ ...mono, fontSize:15, color:"#555" }}>{desc}</div>
        </div>
      );
    }

    // WHY: Top-level block plan editor keeps template list + rest rule co-located so config feels cohesive.
    function BlockPlanEditor({ plan, onChange }) {
      const emitPlan = (next) => onChange(normalizeBlockPlan(next));
      const cycleBase = cycleBaseFromTemplates(plan.templates);
      const updateTemplate = (idx, patch) => {
        const updated = plan.templates.map((t, i) => i !== idx ? t : normalizeTemplate({ ...t, ...patch }));
        emitPlan({ ...plan, templates: updated });
      };
      const addTemplate = () => {
        const t = normalizeTemplate({ id: `t${Date.now()}`, name: "New Block", requiresPause: false, cadenceEvery: 1 });
        emitPlan({ ...plan, templates: [...plan.templates, t] });
      };
      const removeTemplate = (idx) => emitPlan({ ...plan, templates: plan.templates.filter((_, i) => i !== idx) });
      const updateRestRule = (patch) => emitPlan({ ...plan, restRule: { ...plan.restRule, ...patch } });
      return (
        <div>
          {plan.templates.map((t, idx) => (
            <TemplateRow key={t.id} template={t} cycleBase={cycleBase} onChange={p => updateTemplate(idx, p)}
              onRemove={() => removeTemplate(idx)} canRemove={plan.templates.length > 1} />
          ))}
          <button onClick={addTemplate} style={{ width:"100%", padding:12, background:CARD, border:`1px dashed ${BDR}`, color:"#888", borderRadius:4, cursor:"pointer", fontSize:17, ...cond, marginBottom:4 }}>+ ADD BLOCK</button>
          <RestRuleEditor rule={plan.restRule} cycleBase={cycleBase} onChange={updateRestRule} />
        </div>
      );
    }

    // WHY: Create full default day payload in one place to keep App initialization focused on state wiring.
    function buildDefaultDayPayload({ date, priorSessions, dayType, lastTargets, plan }) {
      const templates = normalizeBlockPlan(plan).templates;
      const anchor = plan?.restRule?.anchorDate || "2026-01-01";
      const activeTemplates = templates.filter((t) => isTemplateScheduledToday(t, date, anchor));
      const lastTraining = [...priorSessions].reverse().find((s) => s.type === "A");
      const lastMorn = [...priorSessions].reverse().find((s) => s.mornExercises?.length);
      const lastTrainNames = (lastTraining?.exercises || []).map((e) => e.name);
      const lastMornNames = (lastMorn?.mornExercises || []).map((e) => e.name);

      const trainBlocks = dayType === "B"
        ? []
        : buildTrainingBlocks(activeTemplates, lastTrainNames, lastTargets, priorSessions);
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
