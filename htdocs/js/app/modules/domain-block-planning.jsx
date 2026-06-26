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
      const exerciseNames = normalizeExerciseNames(template.exerciseNames);
      return {
        id: String(template.id || `block_${Date.now()}`),
        name: String(template.name || "Block"),
        cadenceEvery,
        exerciseNames,
      };
    }

    function normalizeExerciseNames(names) {
      if (!Array.isArray(names)) return [];
      return names
        .map((name) => String(name || "").trim())
        .filter(Boolean);
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
    function resolveActiveTemplates(templates, priorSessions, opts = {}) {
      const trainIndex = (priorSessions || []).filter((s) => (s?.type || "A") === "A").length;
      return (templates || []).filter((t) => {
        const cadenceEvery = Math.max(1, t.cadenceEvery);
        if (opts.dailyOnly) return cadenceEvery === 1;
        return trainIndex % cadenceEvery === 0;
      });
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

    function syncPlannedBlocksFromPlan(blocks, plan, lastTargets) {
      const templates = normalizeBlockPlan(plan).templates;
      return labelBlocksFromPlan(blocks, plan).filter((block) => {
        if (!block?.templateId || isCompletedBlock(block)) return true;
        return templates.some((template) => template.id === block.templateId);
      }).map((block) => {
        const template = templates.find((t) => block?.templateId && block.templateId === t.id);
        if (!template || isCompletedBlock(block) || !template.exerciseNames?.length) return block;
        const currentNames = normalizeExerciseNames((block.exercises || []).map((ex) => ex?.name));
        const plannedNames = normalizeExerciseNames(template.exerciseNames);
        const sameExercises = currentNames.length === plannedNames.length
          && plannedNames.every((name, idx) => name === currentNames[idx]);
        if (sameExercises) {
          const hasRecordedState = block.startedAt || (block.exercises || []).some((ex) => ex?.done === true);
          if (hasRecordedState) return block;
          return {
            ...block,
            label: template.name,
            exercises: mkExFromTargets(plannedNames, lastTargets || {}),
          };
        }
        return {
          ...block,
          label: template.name,
          exercises: mkExFromTargets(plannedNames, lastTargets || {}),
        };
      });
    }

    function isUnstartedGenericBlock(block) {
      if (!block || block.templateId || block.label || block.startedAt) return false;
      return !(block.exercises || []).some((ex) => ex?.done === true);
    }

    function syncOfferedBlocksFromPlan({ blocks, plan, priorSessions, dayType, lastTargets, fallbackNames, replaceGeneric }) {
      const normalized = normalizeBlockPlan(plan);
      const synced = syncPlannedBlocksFromPlan(blocks, normalized, lastTargets);
      const activeTemplates = resolveActiveTemplates(normalized.templates, priorSessions || [], { dailyOnly: dayType === "B" });
      const presentTemplateIds = new Set(synced.map((block) => block?.templateId).filter(Boolean));
      const missingTemplates = activeTemplates.filter((template) => !presentTemplateIds.has(template.id));
      if (!missingTemplates.length) return synced;

      const hasReplaceableGeneric = replaceGeneric && synced.some(isUnstartedGenericBlock);
      if (!hasReplaceableGeneric && synced.length > 0) return synced;

      const retained = hasReplaceableGeneric
        ? synced.filter((block) => !isUnstartedGenericBlock(block))
        : synced;
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

    // WHY: Isolated sub-component so each block-type row stays readable.
    function TemplateRow({ template, onChange, onRemove, canRemove, onPickExercise, onRemoveExercise }) {
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
        const updated = plan.templates.map((t) => t.id !== id ? t : normalizeTemplate({ ...t, ...patch }));
        emitPlan({ ...plan, templates: updated });
      };
      const addTemplate = () => {
        const t = normalizeTemplate({ id: `t${Date.now()}`, name: "New Block", cadenceEvery: 1 });
        emitPlan({ ...plan, templates: [...plan.templates, t] });
      };
      const removeTemplate = (id) => emitPlan({ ...plan, templates: plan.templates.filter((t) => t.id !== id) });
      const updateRestCap = (patch) => emitPlan({ ...plan, restCap: { ...plan.restCap, ...patch } });
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
          {plan.templates.map((t) => (
            <TemplateRow key={t.id} template={t}
              onChange={(p) => updateTemplate(t.id, p)}
              onRemove={() => removeTemplate(t.id)}
              canRemove={plan.templates.length > 1}
              onPickExercise={(templateId, exerciseIdx) => setExercisePicker({ templateId, exerciseIdx })}
              onRemoveExercise={removeTemplateExercise} />
          ))}
          <button onClick={addTemplate} style={{ width:"100%", padding:12, background:CARD, border:`1px dashed ${BDR}`, color:"#888", borderRadius:4, cursor:"pointer", fontSize:17, ...cond, marginBottom:4 }}>+ ADD BLOCK TYPE</button>
          <div style={{ ...mono, fontSize:12, color:"#666", marginBottom:4 }}>Each block type appears on its own schedule (e.g. every day, every 2nd day).</div>
          <RestCapEditor cap={plan.restCap} onChange={updateRestCap} />
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
    function buildDefaultDayPayload({ date, priorSessions, dayType, lastTargets, plan }) {
      const normalized = normalizeBlockPlan(plan);
      const past = (priorSessions || []).filter((s) => s.date < date);
      const activeTemplates = resolveActiveTemplates(normalized.templates, past, { dailyOnly: dayType === "B" });
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
