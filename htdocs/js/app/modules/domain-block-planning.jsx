    // WHY: Keep planning defaults centralized so new users always start with a sane setup.
    function defaultBlockPlan() {
      return {
        templates: [
          { id: "morning", name: "Morning", schedule: "always", cadenceEvery: 1, exerciseNames: ["Push-ups"] },
          { id: "workout", name: "Workout", schedule: "routine", routineDay: "A", cadenceEvery: 2, exerciseNames: ["Pull-ups"] },
        ],
        routine: { dayCount: 2, trainDays: 3, restDays: 1 },
        restCap: { enabled: true, maxTrainDays: 3, restDays: 1 },
      };
    }

    // WHY: Normalize partial/legacy plan data so downstream code can stay branch-light.
    function normalizeBlockPlan(raw) {
      const fallback = defaultBlockPlan();
      const src = raw && typeof raw === "object" ? raw : {};
      const templates = Array.isArray(src.templates) && src.templates.length ? src.templates : fallback.templates;
      const routine = normalizeRoutine(src.routine, src.restCap || fallback.restCap);
      const normalizedTemplates = normalizeTemplates(templates, routine);
      const restCap = normalizeRestCap(src.restCap, routine);
      return {
        templates: normalizedTemplates,
        routine,
        restCap,
      };
    }

    // WHY: Enforce minimal template shape so rendering and planning never crash on bad config.
    function normalizeTemplate(template, routine, routineIdx = 0) {
      if (!template || typeof template !== "object") return null;
      const cadenceEvery = Math.max(1, parseInt(template.cadenceEvery || 1, 10) || 1);
      const exerciseNames = normalizeExerciseNames(template.exerciseNames);
      const routineDays = routineDayLabels(routine);
      const legacySchedule = cadenceEvery === 1 ? "always" : "routine";
      const schedule = template.schedule === "always" || template.schedule === "routine"
        ? template.schedule
        : legacySchedule;
      const rawRoutineDay = String(template.routineDay || routineDays[routineIdx % routineDays.length] || "A").toUpperCase();
      return {
        id: String(template.id || `block_${Date.now()}`),
        name: String(template.name || "Block"),
        cadenceEvery,
        schedule,
        routineDay: routineDays.includes(rawRoutineDay) ? rawRoutineDay : routineDays[0],
        exerciseNames,
      };
    }

    function normalizeExerciseNames(names) {
      if (!Array.isArray(names)) return [];
      return names
        .map((name) => String(name || "").trim())
        .filter(Boolean);
    }

    function routineDayLabels(routine) {
      const count = Math.max(1, Math.min(6, parseInt(routine?.dayCount || 2, 10) || 2));
      return Array.from({ length: count }, (_, idx) => String.fromCharCode(65 + idx));
    }

    function normalizeRoutine(raw, restCapRaw) {
      const restCap = restCapRaw && typeof restCapRaw === "object" ? restCapRaw : {};
      const src = raw && typeof raw === "object" ? raw : {};
      return {
        dayCount: Math.max(1, Math.min(6, parseInt(src.dayCount || 2, 10) || 2)),
        trainDays: Math.max(1, parseInt(src.trainDays || restCap.maxTrainDays || 3, 10) || 3),
        restDays: Math.max(1, parseInt(src.restDays || restCap.restDays || 1, 10) || 1),
      };
    }

    // WHY: Block-types are independent; legacy cadence-based blocks are mapped onto routine letters in order.
    function normalizeTemplates(templates, routine) {
      let routineIdx = 0;
      return templates.map((t) => {
        const usesRoutine = t?.schedule === "routine" || (t?.schedule == null && Math.max(1, parseInt(t?.cadenceEvery || 1, 10) || 1) > 1);
        const normalized = normalizeTemplate(t, routine, usesRoutine ? routineIdx : 0);
        if (usesRoutine) routineIdx += 1;
        return normalized;
      }).filter(Boolean);
    }

    // WHY: A global cap guarantees recovery days no matter how many blocks overlap.
    function normalizeRestCap(raw, routine = null) {
      const src = raw && typeof raw === "object" ? raw : {};
      const enabled = src.enabled !== false;
      const maxTrainDays = Math.max(1, parseInt(routine?.trainDays || src.maxTrainDays || 3, 10) || 3);
      const restDays = Math.max(1, parseInt(routine?.restDays || src.restDays || 1, 10) || 1);
      return { enabled, maxTrainDays, restDays };
    }

    // WHY: Each block-type recurs on its own "every Nth training day" cadence, independent of the others.
    //      Cadence counts real training days (any session with actual training logged), so a recovery
    //      day pauses — never desyncs — the count. This is the routine ROTATION, unrelated to recovery.
    function resolveRoutineDay(routine, priorSessions) {
      const days = routineDayLabels(routine);
      const trainIndex = (priorSessions || []).filter((s) => sessionHasTraining(s)).length;
      return days[trainIndex % days.length] || "A";
    }

    // WHY: `dayType` here is purely a routine letter (A/B/C...), never a recovery flag — recovery is
    // a fully independent concept (see shouldForcedRecoveryDay). "always" templates are offered every
    // day regardless of letter; "routine" templates are offered only on their matching letter. There
    // is no "dailyOnly" mode — hiding routine blocks based on the letter was the root conflation bug.
    function resolveActiveTemplates(templates, priorSessions, opts = {}) {
      const activeRoutineDay = opts.dayType || resolveRoutineDay(opts.routine, priorSessions);
      return (templates || []).filter((t) => {
        if (t.schedule === "always") return true;
        return (t.routineDay || "A") === activeRoutineDay;
      });
    }

    // WHY: Check if a forced recovery day is needed (based on rest cap)
    function shouldForcedRecoveryDay({ priorSessions, plan }) {
      if (!plan) return false;
      const normalized = normalizeBlockPlan(plan);
      const cap = normalized.restCap;
      if (!cap.enabled) return false;
      const sorted = [...(priorSessions || [])].sort((a, b) => b.date.localeCompare(a.date));
      let restRun = 0;
      for (const s of sorted) { if (sessionHasTraining(s)) break; restRun += 1; }
      if (restRun > 0 && restRun < cap.restDays) return true;   // still inside the forced rest window
      let trainRun = 0;
      for (const s of sorted) { if (!sessionHasTraining(s)) break; trainRun += 1; }
      if (trainRun >= cap.maxTrainDays) return true;            // hit the cap → force a rest day
      return false;
    }

    // WHY: A day is rest only when the global cap forces it; otherwise it is a training (rotation) day.
    function resolveDayTypeWithPlan({ priorSessions, plan, fallbackType }) {
      if (!plan) return fallbackType || "A";
      const normalized = normalizeBlockPlan(plan);
      const cap = normalized.restCap;
      if (!cap.enabled) return "A";
      const sorted = [...(priorSessions || [])].sort((a, b) => b.date.localeCompare(a.date));
      let restRun = 0;
      for (const s of sorted) { if (sessionHasTraining(s)) break; restRun += 1; }
      if (restRun > 0 && restRun < cap.restDays) return "B";   // still inside the forced rest window
      let trainRun = 0;
      for (const s of sorted) { if (!sessionHasTraining(s)) break; trainRun += 1; }
      if (trainRun >= cap.maxTrainDays) return "B";            // hit the cap → force a rest day
      return "A";
    }

    // WHY: Prefer template-configured exercises but gracefully fall back to history to reduce setup friction.
    function resolveTemplateExerciseNames({ template, fallbackNames, fallbackSingle }) {
      if (template?.exerciseNames?.length) return template.exerciseNames;
      if (fallbackNames?.length) return fallbackNames;
      return [fallbackSingle];
    }

    function isBlockForTemplate(block, template) {
      if (!block || !template) return false;
      if (block.templateId && block.templateId === template.id) return true;
      return String(block.label || "").trim().toLowerCase() === String(template.name || "").trim().toLowerCase();
    }

    function isCompletedBlock(block) {
      if (!block) return false;
      if (block.startedAt) return true;
      const exercises = Array.isArray(block.exercises) ? block.exercises : [];
      return exercises.length > 0 && exercises.every((ex) => ex?.done === true);
    }

    function cloneSuggestedExercises(exercises) {
      return (exercises || []).map((ex) => {
        const reps = (Array.isArray(ex?.reps) ? ex.reps : []).filter((v) => typeof v === "number" && v > 0);
        return {
          name: ex?.name || "Pull-ups",
          target: reps[0] || ex?.target || 10,
          reps: [],
          suggestedReps: reps,
          done: false,
        };
      });
    }

    function buildTemplateExercises({ template, fallbackNames, fallbackSingle, lastTargets, lastMatchingBlock }) {
      const hasConfiguredNames = template?.exerciseNames?.length > 0;
      if (hasConfiguredNames) {
        return mkExFromTargets(template.exerciseNames, lastTargets || {});
      }
      if ((lastMatchingBlock?.exercises || []).length) {
        return cloneSuggestedExercises(lastMatchingBlock.exercises);
      }
      const names = resolveTemplateExerciseNames({ template, fallbackNames, fallbackSingle });
      return mkExFromTargets(names, lastTargets || {});
    }

    function namesMatchTemplate(block, template) {
      const blockNames = normalizeExerciseNames((block?.exercises || []).map((ex) => ex?.name));
      const templateNames = normalizeExerciseNames(template?.exerciseNames);
      return templateNames.length > 0
        && blockNames.length === templateNames.length
        && templateNames.every((name, idx) => name === blockNames[idx]);
    }

    function labelBlocksFromPlan(blocks, plan) {
      const templates = normalizeBlockPlan(plan).templates;
      return (blocks || []).map((block) => {
        const match = templates.find((template) => (
          (block?.templateId && block.templateId === template.id) || namesMatchTemplate(block, template)
        ));
        if (!match) return block;
        return { ...block, label: match.name, templateId: block.templateId || match.id };
      });
    }

    // WHY: Only relabels blocks to match their template; deliberately never rewrites
    // block.exercises based on a name/length mismatch against template.exerciseNames.
    // A block's exercises are user-owned the moment it's created (renamed via the
    // exercise-picker modal, or extended via "+ ADD EXERCISE") — silently rebuilding
    // them from the template whenever they drift from the configured names caused
    // both a real bug where renaming an exercise reverted instantly, and adding an
    // exercise appeared to do nothing (the extra exercise was dropped right back out
    // on the next re-render/reload, since names/length no longer matched the template).
    function syncPlannedBlocksFromPlan(blocks, plan, lastTargets) {
      const templates = normalizeBlockPlan(plan).templates;
      return labelBlocksFromPlan(blocks, plan).filter((block) => {
        if (!block?.templateId || isCompletedBlock(block)) return true;
        return templates.some((template) => template.id === block.templateId);
      });
    }

    function isUnstartedGenericBlock(block) {
      if (!block || block.templateId || block.label || block.startedAt) return false;
      return !(block.exercises || []).some((ex) => ex?.done === true);
    }

    // WHY: A block the user hasn't touched yet (no reps entered, not started/done) is safe to drop
    // when its template is no longer offered for the day type — e.g. switching Day A → Day B should
    // swap out Day A's untouched block for Day B's. A block with any entered data is never dropped,
    // no matter what the current day type says — that data would otherwise silently vanish.
    function isUntouchedBlock(block) {
      if (!block) return true;
      if (block.startedAt) return false;
      return !(block.exercises || []).some((ex) => (ex?.reps || []).some((v) => typeof v === "number" && v > 0) || ex?.done === true);
    }

    // WHY: isRecovery suppresses "routine"-schedule templates (forced rest per the rest cap),
    // independent of which routine letter is active — recovery and routine rotation are orthogonal.
    // Blocks with real data are never dropped regardless (see isUntouchedBlock below).
    function syncOfferedBlocksFromPlan({ blocks, plan, priorSessions, dayType, isRecovery, lastTargets, fallbackNames, replaceGeneric }) {
      const normalized = normalizeBlockPlan(plan);
      const synced = syncPlannedBlocksFromPlan(blocks, normalized, lastTargets);
      const allActiveTemplates = resolveActiveTemplates(normalized.templates, priorSessions || [], { dayType, routine: normalized.routine });
      const activeTemplates = isRecovery ? allActiveTemplates.filter((t) => t.schedule === "always") : allActiveTemplates;
      const activeTemplateIds = new Set(activeTemplates.map((t) => t.id));

      // Drop blocks whose template is no longer offered today, but only if untouched —
      // e.g. an empty "Block 1" (Day A only) makes way for "Block 2" (Day B) on switch.
      const withoutInactiveEmpty = synced.filter((block) => {
        if (!block?.templateId) return true;
        if (activeTemplateIds.has(block.templateId)) return true;
        return !isUntouchedBlock(block);
      });

      const presentTemplateIds = new Set(withoutInactiveEmpty.map((block) => block?.templateId).filter(Boolean));
      const missingTemplates = activeTemplates.filter((template) => !presentTemplateIds.has(template.id));
      if (!missingTemplates.length) return withoutInactiveEmpty;

      const hasReplaceableGeneric = replaceGeneric && withoutInactiveEmpty.some(isUnstartedGenericBlock);
      const retained = hasReplaceableGeneric
        ? withoutInactiveEmpty.filter((block) => !isUnstartedGenericBlock(block))
        : withoutInactiveEmpty;
      return [
        ...retained,
        ...buildTrainingBlocks(missingTemplates, fallbackNames || [], lastTargets || {}, priorSessions || []),
      ];
    }

    function findLastMatchingBlock(priorSessions, template) {
      const sortedPrior = [...(priorSessions || [])].sort((a, b) => b.date.localeCompare(a.date));
      let fallbackMatch = null;
      for (const session of sortedPrior) {
        const blocks = sessionBlocks(migrateSession(session));
        for (let idx = blocks.length - 1; idx >= 0; idx -= 1) {
          const block = blocks[idx];
          if (!isBlockForTemplate(block, template)) continue;
          if (isCompletedBlock(block)) return block;
          if (!fallbackMatch) fallbackMatch = block;
        }
      }
      return fallbackMatch;
    }

    // ─── BlockPlanEditor UI components ──────────────────────────────────────────

    function TemplateExerciseEditor({ exerciseNames, onPick, onRemove }) {
      const names = normalizeExerciseNames(exerciseNames);

      return (
        <div style={{ marginTop:12, paddingTop:12, borderTop:`1px solid #20303e` }}>
          <div style={{ ...lbl9, fontSize:12, color:"#8eb0c8", marginBottom:8 }}>EXERCISES</div>
          {names.map((name, idx) => (
            <div key={idx} style={{ display:"flex", gap:8, alignItems:"center", marginBottom:8 }}>
              <button
                onClick={() => onPick(idx)}
                style={{ flex:1, minWidth:0, background:"#1a1a1a", border:`1px solid ${BDR}`, color:"#ddd", padding:"9px 10px", borderRadius:3, cursor:"pointer", fontSize:16, textAlign:"left", boxSizing:"border-box", ...cond, fontWeight:700 }}
              >{name}</button>
              <button onClick={() => onRemove(idx)} title="Remove exercise" style={{ width:36, height:36, background:"transparent", border:`1px solid #661111`, color:"#aa4444", borderRadius:3, cursor:"pointer", fontSize:18, lineHeight:1 }}>×</button>
            </div>
          ))}
          <button onClick={() => onPick(null)} style={{ width:"100%", padding:10, background:"#0b1118", border:`1px dashed #2a3a4a`, color:"#8eb0c8", borderRadius:4, cursor:"pointer", fontSize:15, ...cond }}>+ ADD EXERCISE</button>
        </div>
      );
    }

    function RoutineEditor({ routine, onChange }) {
      const days = routineDayLabels(routine);
      return (
        <div style={{ background:"#0b141b", border:`1px solid #203546`, borderRadius:8, padding:"12px 12px 10px", marginBottom:12 }}>
          <div style={{ ...lbl9, fontSize:14, color:"#9ed5ff", marginBottom:10 }}>ROUTINE</div>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
            <span style={{ ...mono, fontSize:14, color:"#7797aa", minWidth:118 }}>TRAINING DAYS</span>
            <button onClick={() => onChange({ dayCount: Math.max(1, routine.dayCount - 1) })} style={{ width:42, height:42, background:CARD, border:`1px solid #444`, color:"#bbb", borderRadius:3, cursor:"pointer", ...mono, fontSize:24 }}>−</button>
            <span style={{ ...mono, fontSize:28, fontWeight:700, color:"#ddd", minWidth:34, textAlign:"center" }}>{routine.dayCount}</span>
            <button onClick={() => onChange({ dayCount: Math.min(6, routine.dayCount + 1) })} style={{ width:42, height:42, background:CARD, border:`1px solid #444`, color:"#bbb", borderRadius:3, cursor:"pointer", ...mono, fontSize:24 }}>+</button>
            <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
              {days.map((day) => <span key={day} style={{ ...mono, fontSize:14, color:BG, background:ACC, borderRadius:3, padding:"5px 8px", fontWeight:700 }}>{day}</span>)}
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
            <span style={{ ...mono, fontSize:14, color:"#7797aa", minWidth:118 }}>TRAIN STREAK</span>
            <button onClick={() => onChange({ trainDays: Math.max(1, routine.trainDays - 1) })} style={{ width:42, height:42, background:CARD, border:`1px solid #444`, color:"#bbb", borderRadius:3, cursor:"pointer", ...mono, fontSize:24 }}>−</button>
            <span style={{ ...mono, fontSize:28, fontWeight:700, color:"#ddd", minWidth:34, textAlign:"center" }}>{routine.trainDays}</span>
            <button onClick={() => onChange({ trainDays: routine.trainDays + 1 })} style={{ width:42, height:42, background:CARD, border:`1px solid #444`, color:"#bbb", borderRadius:3, cursor:"pointer", ...mono, fontSize:24 }}>+</button>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ ...mono, fontSize:14, color:"#7797aa", minWidth:118 }}>REST DAYS</span>
            <button onClick={() => onChange({ restDays: Math.max(1, routine.restDays - 1) })} style={{ width:42, height:42, background:CARD, border:`1px solid #444`, color:"#bbb", borderRadius:3, cursor:"pointer", ...mono, fontSize:24 }}>−</button>
            <span style={{ ...mono, fontSize:28, fontWeight:700, color:"#ddd", minWidth:34, textAlign:"center" }}>{routine.restDays}</span>
            <button onClick={() => onChange({ restDays: routine.restDays + 1 })} style={{ width:42, height:42, background:CARD, border:`1px solid #444`, color:"#bbb", borderRadius:3, cursor:"pointer", ...mono, fontSize:24 }}>+</button>
          </div>
        </div>
      );
    }

    // WHY: Isolated sub-component so each block-type row stays readable.
    function TemplateRow({ template, routine, onChange, onRemove, canRemove, onPickExercise, onRemoveExercise }) {
      const routineDays = routineDayLabels(routine);
      return (
        <div
          style={{ background:"#101821", border:`1px solid #2a3a4a`, borderRadius:8, padding:"10px 12px", marginBottom:8 }}
        >
          <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:8 }}>
            <input value={template.name} onChange={e => onChange({ name: e.target.value })}
              style={{ flex:1, background:"#1a1a1a", border:`1px solid ${BDR}`, color:"#ddd", padding:"10px 12px", borderRadius:3, outline:"none", fontSize:18, ...cond, fontWeight:700, boxSizing:"border-box" }} />
            {canRemove && <button onClick={onRemove} style={{ width:40, background:"transparent", border:`1px solid #661111`, color:"#aa4444", borderRadius:3, cursor:"pointer", fontSize:20 }}>×</button>}
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
            <span style={{ ...mono, fontSize:13, color:"#666", marginRight:4 }}>WHEN</span>
            <button
              onClick={() => onChange({ schedule: "always", routineDay: template.routineDay })}
              style={{ padding:"9px 12px", background: template.schedule === "always" ? ACC : CARD, border:`1px solid ${template.schedule === "always" ? ACC : "#444"}`, color: template.schedule === "always" ? BG : "#bbb", borderRadius:3, cursor:"pointer", ...cond, fontSize:15, fontWeight:700 }}
            >ALWAYS</button>
            {routineDays.map((day) => (
              <button
                key={day}
                onClick={() => onChange({ schedule: "routine", routineDay: day })}
                style={{ width:38, height:38, background: template.schedule === "routine" && template.routineDay === day ? ACC : CARD, border:`1px solid ${template.schedule === "routine" && template.routineDay === day ? ACC : "#444"}`, color: template.schedule === "routine" && template.routineDay === day ? BG : "#bbb", borderRadius:3, cursor:"pointer", ...mono, fontSize:16, fontWeight:700 }}
              >{day}</button>
            ))}
          </div>
          <div style={{ ...mono, fontSize:12, color:"#8d8d8d", marginTop:6 }}>
            {template.schedule === "always" ? "Offered every day, including recovery days." : `Offered on routine day ${template.routineDay}.`}
          </div>
          <TemplateExerciseEditor
            exerciseNames={template.exerciseNames}
            onPick={(exerciseIdx) => onPickExercise(template.id, exerciseIdx)}
            onRemove={(exerciseIdx) => onRemoveExercise(template.id, exerciseIdx)}
          />
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
    function BlockPlanEditor({ plan, onChange, recentlyUsed, customExercises, onAddCustom, exerciseImages, onImageUpdate }) {
      const [exercisePicker, setExercisePicker] = useState(null);
      const emitPlan = (next) => onChange(normalizeBlockPlan(next));
      const updateTemplate = (id, patch) => {
        const updated = plan.templates.map((t) => t.id !== id ? t : normalizeTemplate({ ...t, ...patch }, plan.routine));
        emitPlan({ ...plan, templates: updated });
      };
      const addTemplate = () => {
        const t = normalizeTemplate({ id: `t${Date.now()}`, name: "New Block", schedule: "routine", routineDay: routineDayLabels(plan.routine)[0], cadenceEvery: 2 }, plan.routine);
        emitPlan({ ...plan, templates: [...plan.templates, t] });
      };
      const removeTemplate = (id) => emitPlan({ ...plan, templates: plan.templates.filter((t) => t.id !== id) });
      const updateRoutine = (patch) => {
        const routine = normalizeRoutine({ ...plan.routine, ...patch }, plan.restCap);
        const days = routineDayLabels(routine);
        const templates = plan.templates.map((t) => (
          t.schedule === "routine" && !days.includes(t.routineDay)
            ? { ...t, routineDay: days[0] }
            : t
        ));
        emitPlan({
          ...plan,
          routine,
          restCap: { ...plan.restCap, maxTrainDays: routine.trainDays, restDays: routine.restDays },
          templates,
        });
      };
      const removeTemplateExercise = (templateId, exerciseIdx) => {
        const template = plan.templates.find((t) => t.id === templateId);
        if (!template) return;
        updateTemplate(templateId, {
          exerciseNames: normalizeExerciseNames(template.exerciseNames).filter((_, idx) => idx !== exerciseIdx),
        });
      };
      const selectTemplateExercise = (exerciseName) => {
        if (!exercisePicker) return;
        const template = plan.templates.find((t) => t.id === exercisePicker.templateId);
        if (!template) return;
        const names = normalizeExerciseNames(template.exerciseNames);
        const next = exercisePicker.exerciseIdx === null
          ? [...names, exerciseName]
          : names.map((name, idx) => idx === exercisePicker.exerciseIdx ? exerciseName : name);
        updateTemplate(template.id, { exerciseNames: next });
        setExercisePicker(null);
      };

      return (
        <div>
          <RoutineEditor routine={plan.routine} onChange={updateRoutine} />
          {plan.templates.map((t) => (
            <TemplateRow key={t.id} template={t}
              routine={plan.routine}
              onChange={(p) => updateTemplate(t.id, p)}
              onRemove={() => removeTemplate(t.id)}
              canRemove={plan.templates.length > 1}
              onPickExercise={(templateId, exerciseIdx) => setExercisePicker({ templateId, exerciseIdx })}
              onRemoveExercise={removeTemplateExercise} />
          ))}
          <button onClick={addTemplate} style={{ width:"100%", padding:12, background:CARD, border:`1px dashed ${BDR}`, color:"#888", borderRadius:4, cursor:"pointer", fontSize:17, ...cond, marginBottom:4 }}>+ ADD BLOCK TYPE</button>
          <div style={{ ...mono, fontSize:12, color:"#666", marginBottom:4 }}>Routine blocks rotate by letter. Always blocks are offered every day.</div>
          <ExerciseModal
            open={!!exercisePicker}
            onClose={() => setExercisePicker(null)}
            onSelect={selectTemplateExercise}
            recentlyUsed={recentlyUsed || []}
            customExercises={customExercises || []}
            onAddCustom={onAddCustom || (() => {})}
            exerciseImages={exerciseImages || {}}
            onImageUpdate={onImageUpdate || (() => {})}
          />
        </div>
      );
    }

    // WHY: Create full default day payload in one place to keep App initialization focused on state wiring.
    // isRecovery suppresses "routine"-schedule blocks (forced rest per the rest cap) independent of
    // which routine letter is active — recovery and routine rotation are orthogonal concepts.
    function buildDefaultDayPayload({ date, priorSessions, dayType, isRecovery, lastTargets, plan }) {
      const normalized = normalizeBlockPlan(plan);
      const past = (priorSessions || []).filter((s) => s.date < date);
      const allActiveTemplates = resolveActiveTemplates(normalized.templates, past, { dayType, routine: normalized.routine });
      const activeTemplates = isRecovery ? allActiveTemplates.filter((t) => t.schedule === "always") : allActiveTemplates;
      const lastTraining = [...priorSessions].reverse().find((s) => sessionHasTraining(s));
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
        const lastMatchingBlock = findLastMatchingBlock(priorSessions, template);
        const exercises = buildTemplateExercises({
          template,
          fallbackNames,
          fallbackSingle: "Pull-ups",
          lastTargets,
          lastMatchingBlock,
        });
        return mkBlock(exercises, template.name, template.id);
      });
    }
