    // WHY: Keep planning defaults centralized so new users always start with a sane setup.
    function defaultBlockPlan() {
      return {
        anchorDate: null,
        templates: [
          { id: "morning", name: "Morning", everyNDays: 1, repeatCount: 1, pauseDays: 0, exerciseNames: ["Push-ups"] },
          { id: "workout", name: "Workout", everyNDays: 2, repeatCount: 3, pauseDays: 2, exerciseNames: ["Pull-ups"] },
        ],
      };
    }

    // WHY: Normalize partial/legacy plan data so downstream code can stay branch-light.
    function normalizeBlockPlan(raw) {
      const fallback = defaultBlockPlan();
      const src = raw && typeof raw === "object" ? raw : {};
      const templatesSrc = Array.isArray(src.templates) && src.templates.length ? src.templates : fallback.templates;
      const normalizedTemplates = templatesSrc.map(normalizeTemplate).filter(Boolean);
      const anchorDate = typeof src.anchorDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(src.anchorDate)
        ? src.anchorDate
        : todayStr();
      return {
        templates: normalizedTemplates.length ? normalizedTemplates : fallback.templates.map(normalizeTemplate),
        anchorDate,
      };
    }

    // WHY: Enforce minimal template shape so rendering and planning never crash on bad config.
    //      Back-compat: legacy templates used { schedule:"always"|"routine", cadenceEvery, routineDay }.
    //      Map those onto the per-block cadence model { everyNDays, repeatCount, pauseDays }.
    function normalizeTemplate(template) {
      if (!template || typeof template !== "object") return null;
      const exerciseNames = normalizeExerciseNames(template.exerciseNames);
      const weekParity = normalizeWeekParity(template.weekParity || template.week || template.weeks);

      let everyNDays = parseInt(template.everyNDays, 10);
      let repeatCount = parseInt(template.repeatCount, 10);
      let pauseDays = parseInt(template.pauseDays, 10);
      if (!Number.isFinite(everyNDays)) {
        everyNDays = template.schedule === "always" ? 1 : Math.max(1, parseInt(template.cadenceEvery || 1, 10) || 1);
      }
      if (!Number.isFinite(repeatCount)) repeatCount = template.schedule === "always" ? 1 : 3;
      if (!Number.isFinite(pauseDays)) pauseDays = template.schedule === "always" ? 0 : 1;
      everyNDays = Math.max(1, everyNDays);
      repeatCount = Math.max(1, repeatCount);
      pauseDays = Math.max(0, pauseDays);

      return {
        id: String(template.id || `block_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`),
        name: String(template.name || "Block"),
        everyNDays,
        repeatCount,
        pauseDays,
        weekParity,
        exerciseNames,
        exerciseWeights: normalizeExerciseWeights(template.exerciseWeights, exerciseNames),
      };
    }

    function normalizeWeekParity(value) {
      const v = String(value || "all").trim().toLowerCase();
      if (["odd", "uneven", "a"].includes(v)) return "odd";
      if (["even", "b"].includes(v)) return "even";
      return "all";
    }

    // WHY: Weight is an optional per-exercise default; keep only positive numbers for names still present.
    function normalizeExerciseWeights(weights, exerciseNames) {
      const src = weights && typeof weights === "object" ? weights : {};
      const names = normalizeExerciseNames(exerciseNames);
      const out = {};
      names.forEach((name) => {
        const w = Number(src[name]);
        if (Number.isFinite(w) && w > 0) out[name] = w;
      });
      return out;
    }

    function normalizeExerciseNames(names) {
      if (!Array.isArray(names)) return [];
      return names
        .map((name) => String(name || "").trim())
        .filter(Boolean);
    }

    // ─── Per-block cadence scheduling ────────────────────────────────────────────
    // Each block-type recurs on its own cycle: offered every `everyNDays`, `repeatCount`
    // times, then `pauseDays` rest, then repeat. Cycle position counts calendar days from
    // the plan anchor so pauses progress even on days the app wasn't opened.
    function templateCycleLen(t) {
      return Math.max(1, (t.repeatCount * t.everyNDays) + t.pauseDays);
    }
    function dayNumber(dateStr) {
      const ms = new Date(String(dateStr) + "T12:00:00").getTime();
      return Number.isFinite(ms) ? Math.floor(ms / 86400000) : 0;
    }
    function isoWeekNumber(dateStr) {
      const d = new Date(String(dateStr) + "T12:00:00");
      if (!Number.isFinite(d.getTime())) return 1;
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
      const week1 = new Date(d.getFullYear(), 0, 4);
      return 1 + Math.round((((d - week1) / 86400000) - 3 + ((week1.getDay() + 6) % 7)) / 7);
    }
    function isTemplateActiveForWeek(template, dateStr) {
      const parity = normalizeWeekParity(template?.weekParity);
      if (parity === "all") return true;
      const week = isoWeekNumber(dateStr);
      return parity === "odd" ? week % 2 === 1 : week % 2 === 0;
    }
    function isTemplateActiveOnDate(template, dateStr, anchorDate) {
      if (!template) return false;
      if (!isTemplateActiveForWeek(template, dateStr)) return false;
      const cycle = templateCycleLen(template);
      const idx = dayNumber(dateStr) - dayNumber(anchorDate || dateStr);
      const pos = ((idx % cycle) + cycle) % cycle;
      const activeWindow = template.repeatCount * template.everyNDays;
      return pos < activeWindow && pos % template.everyNDays === 0;
    }

    // WHY: Templates offered on a given calendar date, per each block's own cadence.
    function resolveActiveTemplates(templates, dateStr, anchorDate) {
      return (templates || []).filter((t) => isTemplateActiveOnDate(t, dateStr, anchorDate));
    }

    function resolveManualTemplates(templates, templateIds) {
      if (!Array.isArray(templateIds)) return null;
      const ids = new Set(templateIds.map(String));
      return (templates || []).filter((t) => ids.has(String(t.id)));
    }

    function resolveOfferedTemplates(templates, dateStr, anchorDate, templateIds) {
      const manual = resolveManualTemplates(templates, templateIds);
      return manual || resolveActiveTemplates(templates, dateStr, anchorDate);
    }

    // WHY: A day with no block offered by any template is a pure rest/recovery day.
    function isRestDayForPlan(plan, dateStr) {
      const normalized = normalizeBlockPlan(plan);
      return resolveActiveTemplates(normalized.templates, dateStr, normalized.anchorDate).length === 0;
    }

    // ─── Import: structured training setup from an LLM ────────────────────────────
    // Accepts raw text (may contain a ```json fence or surrounding prose) and returns
    // an array of normalized templates. Tolerant: extracts the first JSON object found.
    function parseTrainingSetupImport(text) {
      const raw = String(text || "");
      let jsonStr = null;
      const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
      if (fence) jsonStr = fence[1];
      if (!jsonStr) {
        const start = raw.indexOf("{");
        const end = raw.lastIndexOf("}");
        if (start >= 0 && end > start) jsonStr = raw.slice(start, end + 1);
      }
      if (!jsonStr) throw new Error("No JSON found in text");
      const parsed = JSON.parse(jsonStr);
      const blocks = Array.isArray(parsed) ? parsed
        : Array.isArray(parsed.blocks) ? parsed.blocks
        : Array.isArray(parsed.trainingSetup && parsed.trainingSetup.blocks) ? parsed.trainingSetup.blocks
        : Array.isArray(parsed.templates) ? parsed.templates
        : [];
      return blocks.map((b) => {
        const exercises = Array.isArray(b.exercises) ? b.exercises : [];
        const exerciseNames = exercises.map((ex) => (typeof ex === "string" ? ex : ex && ex.name)).filter(Boolean);
        const exerciseWeights = {};
        exercises.forEach((ex) => {
          if (ex && typeof ex === "object" && ex.name) {
            const w = Number(ex.weight);
            if (Number.isFinite(w) && w > 0) exerciseWeights[String(ex.name).trim()] = w;
          }
        });
        return normalizeTemplate({
          id: `imp${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
          name: b.name || b.label || "Imported Block",
          everyNDays: b.everyNDays != null ? b.everyNDays : (b.every != null ? b.every : 1),
          repeatCount: b.repeatCount != null ? b.repeatCount : (b.repeat != null ? b.repeat : (b.times != null ? b.times : 3)),
          pauseDays: b.pauseDays != null ? b.pauseDays : (b.pause != null ? b.pause : 1),
          weekParity: b.weekParity || b.week || b.weeks,
          exerciseNames,
          exerciseWeights,
        });
      }).filter(Boolean);
    }

    // WHY: Each block-type recurs on its own "every Nth training day" cadence, independent of the others.
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
        const cloned = {
          name: ex?.name || "Pull-ups",
          target: reps[0] || ex?.target || 10,
          reps: [],
          suggestedReps: reps,
          done: false,
        };
        if (typeof ex?.weight === "number" && ex.weight > 0) cloned.weight = ex.weight;
        return cloned;
      });
    }

    // WHY: The suggestion for an exercise must reflect the last time THIS SPECIFIC BLOCK TYPE
    // logged it — never any other block that happens to use the same exercise name. The common
    // case: "Push-ups" bodyweight in a daily block and "Push-ups" with added weight in a training
    // block are the same exercise NAME but a different exercise in practice; a name-only lookup
    // across all history would blueprint one block's numbers (or weight) onto the other's. Scans
    // only blocks matching this template (isBlockForTemplate), newest day and newest block first,
    // and keeps the first (i.e. most recent) instance per exercise name.
    function lastTargetsForTemplate(priorSessions, template, beforeDate) {
      const reps = {};
      const weights = {};
      const pickReps = (ex) => (Array.isArray(ex?.reps) ? ex.reps : []).filter((v) => typeof v === "number" && v > 0);
      [...(priorSessions || [])]
        .filter((s) => !beforeDate || s.date < beforeDate)
        .sort((a, b) => b.date.localeCompare(a.date))
        .forEach((session) => {
          const blocks = [...sessionBlocks(migrateSession(session))].reverse();
          blocks.forEach((block) => {
            if (!isBlockForTemplate(block, template)) return;
            (block.exercises || []).forEach((ex) => {
              if (!ex?.name) return;
              const r = pickReps(ex);
              if (r.length && !(ex.name in reps)) reps[ex.name] = r;
              if (typeof ex.weight === "number" && ex.weight > 0 && !(ex.name in weights)) weights[ex.name] = ex.weight;
            });
          });
        });
      return { reps, weights };
    }

    function buildTemplateExercises({ template, fallbackNames, fallbackSingle, lastTargets, lastMatchingBlock, lastWeights, priorSessions }) {
      const hasConfiguredNames = template?.exerciseNames?.length > 0;
      if (hasConfiguredNames) {
        // Strictly scoped to THIS template's own history — deliberately no fallback to the
        // cross-template lastTargets/lastWeights. A weight fallback in particular must never
        // cross templates: it is exactly how "Push-ups" bodyweight in one block picked up
        // "Push-ups" @10kg from a different block. An exercise never logged under this specific
        // template gets no suggestion at all (empty green tiles, target defaults to 10) rather
        // than borrowing numbers that belong to a different block's meaning of the exercise.
        // template.exerciseWeights (the configured default) still applies via mkExFromTargets.
        const scoped = lastTargetsForTemplate(priorSessions, template);
        return mkExFromTargets(template.exerciseNames, scoped.reps, scoped.weights, template.exerciseWeights || {});
      }
      if ((lastMatchingBlock?.exercises || []).length) {
        return cloneSuggestedExercises(lastMatchingBlock.exercises);
      }
      const names = resolveTemplateExerciseNames({ template, fallbackNames, fallbackSingle });
      return mkExFromTargets(names, lastTargets || {}, lastWeights || {});
    }

    function namesMatchTemplate(block, template) {
      const blockNames = normalizeExerciseNames((block?.exercises || []).map((ex) => ex?.name));
      const templateNames = normalizeExerciseNames(template?.exerciseNames);
      return templateNames.length > 0
        && blockNames.length === templateNames.length
        && templateNames.every((name, idx) => name === blockNames[idx]);
    }

    // WHY: An exact templateId match must always win outright — never merely be tried first among
    // equals. The old single `.find()` predicate OR'd "id matches" with "names match" per template
    // and stopped at the first template satisfying either, in ARRAY order. So when two templates
    // share the same exerciseNames (the same exercise appearing under two block types — the exact
    // case this app now explicitly supports), an earlier template could win via namesMatchTemplate
    // even for a block whose templateId correctly pointed at a later one, silently relabeling it
    // and corrupting which block's history got looked up. Name-based matching is now only a
    // fallback for legacy blocks with no templateId, or one pointing at a template since deleted.
    function labelBlocksFromPlan(blocks, plan) {
      const templates = normalizeBlockPlan(plan).templates;
      return (blocks || []).map((block) => {
        const byId = block?.templateId && templates.find((template) => template.id === block.templateId);
        const match = byId || templates.find((template) => namesMatchTemplate(block, template));
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

    // WHY: Offers exactly the blocks whose per-block cadence is active on `date`. Blocks with real
    // data are never dropped (see isUntouchedBlock); untouched blocks of no-longer-active templates
    // are swapped out for whatever the cadence offers today.
    function syncOfferedBlocksFromPlan({ blocks, plan, priorSessions, date, lastTargets, fallbackNames, replaceGeneric, manualTemplateIds }) {
      const normalized = normalizeBlockPlan(plan);
      const synced = syncPlannedBlocksFromPlan(blocks, normalized, lastTargets);
      const activeTemplates = resolveOfferedTemplates(normalized.templates, date, normalized.anchorDate, manualTemplateIds);
      const activeTemplateIds = new Set(activeTemplates.map((t) => t.id));

      // Drop blocks whose template is not offered today, but only if untouched —
      // an empty block makes way for whatever the cadence offers today.
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

    function TemplateExerciseEditor({ exerciseNames, exerciseWeights, onPick, onRemove, onSetWeight }) {
      const names = normalizeExerciseNames(exerciseNames);
      const weights = exerciseWeights && typeof exerciseWeights === "object" ? exerciseWeights : {};
      const [weightFor, setWeightFor] = useState(null);
      const activeWeight = weightFor != null ? Number(weights[weightFor]) : NaN;

      return (
        <div style={{ marginTop:12, paddingTop:12, borderTop:`1px solid #20303e` }}>
          <div style={{ ...lbl9, fontSize:12, color:"#8eb0c8", marginBottom:8 }}>EXERCISES</div>
          {names.map((name, idx) => {
            const w = Number(weights[name]);
            const hasW = Number.isFinite(w) && w > 0;
            return (
              <div key={idx} style={{ display:"flex", gap:8, alignItems:"center", marginBottom:8 }}>
                <button
                  onClick={() => onPick(idx)}
                  style={{ flex:1, minWidth:0, background:"#1a1a1a", border:`1px solid ${BDR}`, color:"#ddd", padding:"9px 10px", borderRadius:3, cursor:"pointer", fontSize:16, textAlign:"left", boxSizing:"border-box", ...cond, fontWeight:700 }}
                >{name}</button>
                <button onClick={() => setWeightFor(name)} title={hasW ? `${w} kg default weight` : "Set default weight (optional)"} style={{ height:36, flexShrink:0, padding:"0 10px", background: hasW ? "#141a05" : "#151515", border:`1px solid ${hasW ? ACC : "#333"}`, color: hasW ? ACC : "#777", borderRadius:3, cursor:"pointer", ...mono, fontSize:13, fontWeight:700, whiteSpace:"nowrap" }}>{hasW ? `${w}kg` : "+KG"}</button>
                <button onClick={() => onRemove(idx)} title="Remove exercise" style={{ width:36, height:36, background:"transparent", border:`1px solid #661111`, color:"#aa4444", borderRadius:3, cursor:"pointer", fontSize:18, lineHeight:1 }}>×</button>
              </div>
            );
          })}
          <button onClick={() => onPick(null)} style={{ width:"100%", padding:10, background:"#0b1118", border:`1px dashed #2a3a4a`, color:"#8eb0c8", borderRadius:4, cursor:"pointer", fontSize:15, ...cond }}>+ ADD EXERCISE</button>
          {weightFor != null && (
            <DialPad
              initialValue={Number.isFinite(activeWeight) && activeWeight > 0 ? activeWeight : ""}
              label={`${weightFor} — DEFAULT WEIGHT`}
              unit="KG"
              deleteLabel="BODYWEIGHT"
              onConfirm={(v) => { onSetWeight(weightFor, v); setWeightFor(null); }}
              onDelete={() => { onSetWeight(weightFor, 0); setWeightFor(null); }}
              onClose={() => setWeightFor(null)}
            />
          )}
        </div>
      );
    }

    // WHY: Isolated sub-component so each block-type row stays readable. Each block has its own
    // cadence: offered every N days, repeated X times, then a pause of P days (repeat/pause only
    // matter when pause > 0 — with no pause a block simply recurs every N days indefinitely).
    function TemplateRow({ template, onChange, onRemove, canRemove, onPickExercise, onRemoveExercise, onSetExerciseWeight }) {
      const every = template.everyNDays, rep = template.repeatCount, pause = template.pauseDays;
      const Stepper = ({ label, display, onDec, onInc }) => (
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <span style={{ ...mono, fontSize:12, color:"#7797aa", minWidth:58 }}>{label}</span>
          <button onClick={onDec} style={{ width:34, height:34, background:CARD, border:`1px solid #444`, color:"#bbb", borderRadius:3, cursor:"pointer", ...mono, fontSize:20, lineHeight:1 }}>−</button>
          <span style={{ ...mono, fontSize:19, fontWeight:700, color:"#ddd", minWidth:52, textAlign:"center" }}>{display}</span>
          <button onClick={onInc} style={{ width:34, height:34, background:CARD, border:`1px solid #444`, color:"#bbb", borderRadius:3, cursor:"pointer", ...mono, fontSize:20, lineHeight:1 }}>+</button>
        </div>
      );
      const everyTxt = every === 1 ? "every day" : `every ${every} days`;
      const weekTxt = template.weekParity === "odd" ? "odd weeks only" : template.weekParity === "even" ? "even weeks only" : "all weeks";
      const summary = pause === 0
        ? `Offered ${everyTxt}, ${weekTxt}; no pause.`
        : `Offered ${everyTxt}, ${weekTxt}; ${rep}× then ${pause} day${pause === 1 ? "" : "s"} pause.`;
      return (
        <div style={{ background:"#101821", border:`1px solid #2a3a4a`, borderRadius:8, padding:"10px 12px", marginBottom:8 }}>
          <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:10 }}>
            <input value={template.name} onChange={e => onChange({ name: e.target.value })}
              style={{ flex:1, background:"#1a1a1a", border:`1px solid ${BDR}`, color:"#ddd", padding:"10px 12px", borderRadius:3, outline:"none", fontSize:18, ...cond, fontWeight:700, boxSizing:"border-box" }} />
            {canRemove && <button onClick={onRemove} style={{ width:40, background:"transparent", border:`1px solid #661111`, color:"#aa4444", borderRadius:3, cursor:"pointer", fontSize:20 }}>×</button>}
          </div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:"10px 16px" }}>
            <Stepper label="EVERY" display={every === 1 ? "1 day" : `${every} days`}
              onDec={() => onChange({ everyNDays: Math.max(1, every - 1) })}
              onInc={() => onChange({ everyNDays: every + 1 })} />
            <Stepper label="REPEAT" display={`${rep}×`}
              onDec={() => onChange({ repeatCount: Math.max(1, rep - 1) })}
              onInc={() => onChange({ repeatCount: rep + 1 })} />
            <Stepper label="PAUSE" display={pause === 1 ? "1 day" : `${pause} days`}
              onDec={() => onChange({ pauseDays: Math.max(0, pause - 1) })}
              onInc={() => onChange({ pauseDays: pause + 1 })} />
            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              <span style={{ ...mono, fontSize:12, color:"#7797aa", minWidth:58 }}>WEEK</span>
              {[
                ["all", "ALL"],
                ["odd", "ODD"],
                ["even", "EVEN"],
              ].map(([value, label]) => (
                <button key={value} onClick={() => onChange({ weekParity: value })}
                  style={{ height:34, minWidth:46, background: template.weekParity === value ? ACC : CARD, border:`1px solid ${template.weekParity === value ? ACC : "#444"}`, color: template.weekParity === value ? BG : "#bbb", borderRadius:3, cursor:"pointer", ...mono, fontSize:12, fontWeight:700 }}>{label}</button>
              ))}
            </div>
          </div>
          <div style={{ ...mono, fontSize:12, color:"#8d8d8d", marginTop:8 }}>{summary}</div>
          <TemplateExerciseEditor
            exerciseNames={template.exerciseNames}
            exerciseWeights={template.exerciseWeights}
            onPick={(exerciseIdx) => onPickExercise(template.id, exerciseIdx)}
            onRemove={(exerciseIdx) => onRemoveExercise(template.id, exerciseIdx)}
            onSetWeight={(name, kg) => onSetExerciseWeight(template.id, name, kg)}
          />
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
        const t = normalizeTemplate({ id: `t${Date.now()}`, name: "New Block", everyNDays: 2, repeatCount: 3, pauseDays: 2, weekParity: "all" });
        emitPlan({ ...plan, templates: [...plan.templates, t] });
      };
      const removeTemplate = (id) => emitPlan({ ...plan, templates: plan.templates.filter((t) => t.id !== id) });
      const removeTemplateExercise = (templateId, exerciseIdx) => {
        const template = plan.templates.find((t) => t.id === templateId);
        if (!template) return;
        updateTemplate(templateId, {
          exerciseNames: normalizeExerciseNames(template.exerciseNames).filter((_, idx) => idx !== exerciseIdx),
        });
      };
      const setTemplateExerciseWeight = (templateId, name, kg) => {
        const template = plan.templates.find((t) => t.id === templateId);
        if (!template) return;
        const weights = { ...(template.exerciseWeights || {}) };
        const w = Number(kg);
        if (Number.isFinite(w) && w > 0) weights[name] = w; else delete weights[name];
        updateTemplate(templateId, { exerciseWeights: weights });
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
              onRemoveExercise={removeTemplateExercise}
              onSetExerciseWeight={setTemplateExerciseWeight} />
          ))}
          <button onClick={addTemplate} style={{ width:"100%", padding:12, background:CARD, border:`1px dashed ${BDR}`, color:"#888", borderRadius:4, cursor:"pointer", fontSize:17, ...cond, marginBottom:4 }}>+ ADD BLOCK TYPE</button>
          <div style={{ ...mono, fontSize:12, color:"#666", marginBottom:4 }}>Each block runs on its own cadence: every N days, repeated, then a pause.</div>
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
    // Blocks are offered per each template's own cadence on the given calendar date.
    function buildDefaultDayPayload({ date, priorSessions, lastTargets, plan }) {
      const normalized = normalizeBlockPlan(plan);
      const activeTemplates = resolveOfferedTemplates(normalized.templates, date, normalized.anchorDate, null);
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
      const lastWeights = lastWeightsFromSessions(priorSessions || []);
      if (!templates.length) {
        const names = fallbackNames.length ? fallbackNames : ["Pull-ups"];
        return [mkBlock(mkExFromTargets(names, lastTargets, lastWeights), "Training Block")];
      }
      return templates.map((template) => {
        const lastMatchingBlock = findLastMatchingBlock(priorSessions, template);
        const exercises = buildTemplateExercises({
          template,
          fallbackNames,
          fallbackSingle: "Pull-ups",
          lastTargets,
          lastMatchingBlock,
          lastWeights,
          priorSessions,
        });
        return mkBlock(exercises, template.name, template.id);
      });
    }
