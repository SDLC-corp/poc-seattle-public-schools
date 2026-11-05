import { getRecords, updateRecord } from './inspectionRecordsStore.js';
import { getEntries, currentUser } from './auditStore.js';
import { getMaterial } from './roomsStore.js';
import * as M from './inspectionMeta.js';

/**
 * Inspection life cycle: the seven stages of one inspection (for the stepper), the stage history stored on
 * the record (record.stageHistory, for the audit trail) and the timeline of what happened in each stage.
 */

// UI status → stored stage status
export const STAGE_STATUS = { done: 'COMPLETED', current: 'IN_PROGRESS', upcoming: 'PENDING', skipped: 'SKIPPED', notRequired: 'NOT_REQUIRED' };
const STATUS_TEXT = { COMPLETED: 'Completed', IN_PROGRESS: 'Started', PENDING: 'Reopened', SKIPPED: 'Skipped', NOT_REQUIRED: 'Not required' };

const openActions = (r) => (r.actionItems ?? []).some((a) => a.status !== 'Completed');
const passed = (x) => !openActions(x) && !M.acmsOf(x).some((a) => a.risk?.followUpRequired === 'Yes');
const acmIds = (r) => new Set(M.acmsOf(r).map((a) => a.materialId));
const day = (iso) => (iso ? String(iso).slice(0, 10) : null);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Follow-up result for r from later approved inspections covering any of the same ACMs: 'passed' (one found
 * nothing more to do), 'failed' (the latest found open issues → corrective action again), 'reworked' (that
 * rework is done → verify again) or 'none'.
 */
export function followUpOf(r, records = getRecords()) {
  const mine = acmIds(r);
  const all = records
    .filter((x) => x.state === 'approved' && x.id !== r.id && (x.date ?? '') > (r.date ?? '') && M.acmsOf(x).some((a) => mine.has(a.materialId)))
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  if (!all.length) return { status: 'none', rec: null, all };
  const ok = all.find(passed);
  if (ok) return { status: 'passed', rec: ok, all };
  const last = all.at(-1);
  return { status: openActions(last) ? 'failed' : 'reworked', rec: last, all };
}

// Stages a user can set by hand (the earlier ones follow the form: assigned / being filled in / submitted)
export const MANUAL_STAGES = ['lab', 'action', 'followUp', 'closed'];

/**
 * Stages a reviewer confirms before the inspection moves on (Inspection Submitted has its own approval).
 * When a stage's work is done the inspection stays in it — "send for review", then a reviewer approves
 * (next stage) or returns it (stays, rework, send again). Applies to inspections submitted since review
 * gates were introduced (r.reviewGates); older records keep their automatic stages.
 */
export const REVIEW_STAGES = ['lab', 'action', 'followUp'];
export const latestReview = (r, stage) => (r.stageReviews ?? []).filter((x) => x.stage === stage).at(-1) ?? null;

function applyReviewGates(r, life) {
  if (!r.reviewGates || (r.state !== 'submitted' && r.state !== 'approved')) return { ...life, gate: null };
  // Stages already confirmed say who reviewed them
  const stages = life.stages.map((s) => {
    const rv = (REVIEW_STAGES.includes(s.id) || s.id === 'submitted') && latestReview(r, s.id);
    return rv?.status === 'approved' ? { ...s, reviewedBy: rv.reviewerName, reviewedAt: rv.decidedAt } : s;
  });
  // Samples go to the laboratory once a reviewer has checked the submitted inspection
  const unsent = M.allSamplesOf(r).some(({ s }) => s.result === 'Pending' && !s.sentToLabAt);
  const submittedReview = latestReview(r, 'submitted');
  if (unsent && submittedReview?.status === 'pending') {
    const at = stages.findIndex((s) => s.id === 'submitted');
    return {
      current: 'submitted', gate: 'awaitingReview',
      stages: stages.map((s, i) => {
        if (i === at) return { ...s, status: 'current', stageStatus: STAGE_STATUS.current, detail: 'Waiting for review – samples go to the laboratory once approved', gate: 'awaitingReview' };
        if (i > at && s.status !== 'notRequired') return { ...s, status: 'upcoming', stageStatus: STAGE_STATUS.upcoming };
        return s;
      }),
    };
  }
  // Closed by a reviewer (closure request or follow-up review): nothing more to review
  if (r.closure) return { ...life, stages, gate: null };
  // An approved follow-up request settles the work before it (completed corrective action needs no own review)
  const followUpApproved = (r.stageReviews ?? []).some((x) => x.outcome === 'followUp' && x.status === 'approved');
  for (const stage of REVIEW_STAGES) {
    const at = stages.findIndex((s) => s.id === stage);
    if (stages[at].status !== 'done') continue;
    if (stage === 'action' && followUpApproved) continue;
    const rv = latestReview(r, stage);
    if (rv?.status === 'approved') continue;
    const gate = rv?.status === 'pending' ? 'awaitingReview' : rv?.status === 'returned' ? 'returned' : 'readyForReview';
    const detail = gate === 'awaitingReview' ? `Waiting for review – sent by ${rv.requestedBy?.name ?? 'a user'}`
      : gate === 'returned' ? `Returned by ${rv.reviewerName}: ${rv.comments}` : 'Work done – send for review to continue';
    return {
      current: stage, gate,
      stages: stages.map((s, i) => {
        if (i === at) return { ...s, status: 'current', stageStatus: STAGE_STATUS.current, detail, gate };
        if (i > at && s.status !== 'notRequired') return { ...s, status: 'upcoming', stageStatus: STAGE_STATUS.upcoming };
        // Only the held stage is current (Inspection Submitted keeps its "final review pending" note)
        if (i < at && s.status === 'current') return { ...s, status: 'done', stageStatus: STAGE_STATUS.done };
        return s;
      }),
    };
  }
  return { ...life, stages, gate: null };
}

const gatedLifecycleOf = (r, records) => applyReviewGates(r, autoLifecycleOf(r, records));

// The automatic stage (from the record's facts and stage reviews), ignoring any manual change
export const autoStageOf = (r, records = getRecords()) => gatedLifecycleOf(r, records).current;

// The seven stages with status (done / current / upcoming / skipped / notRequired), date, detail and reason.
// A manual stage (r.stageOverride) applies while the automatic stage is still what it was when it was set.
export function lifecycleOf(r, records = getRecords()) {
  const auto = gatedLifecycleOf(r, records);
  const o = r.stageOverride;
  if (!o || o.basis !== auto.current || o.stage === auto.current) return { ...auto, override: null };
  const at = M.STAGES.findIndex((s) => s.id === o.stage);
  return {
    current: o.stage,
    gate: null,
    override: { stage: o.stage, note: o.note, by: o.by, at: o.at, auto: auto.current },
    stages: auto.stages.map((s, i) => {
      let status;
      if (i === at) status = o.stage === 'closed' ? 'done' : 'current';
      else if (i < at) status = s.status === 'notRequired' ? 'notRequired' : s.status === 'done' ? 'done' : 'skipped';
      else status = s.status === 'notRequired' ? 'notRequired' : 'upcoming';
      const manual = i === at ? { detail: `Set by ${o.by?.name ?? 'a user'}: ${o.note}`, reason: `Set manually: ${o.note}` }
        : status === 'skipped' && s.status !== 'skipped' ? { detail: 'Skipped by a manual stage change', reason: 'Skipped by a manual stage change', link: null } : {};
      return { ...s, status, stageStatus: STAGE_STATUS[status], ...manual };
    }),
  };
}

function autoLifecycleOf(r, records) {
  const fu = followUpOf(r, records);
  // Follow-up inspections scheduled from this one's review (children): it waits in Follow-up Verification while
  // one is open; once they're approved it closes through its follow-up review, or goes back to corrective action
  const kids = records.filter((x) => x.parentId === r.id);
  const kidOpen = kids.find((x) => x.state !== 'approved') ?? null;
  let current = M.stageOf(r, fu.status);
  if (kids.length && current === 'submitted') {
    if (kidOpen || fu.status === 'reworked') current = 'followUp';
    else if (fu.status === 'failed') current = 'action';
  }
  const approved = r.state === 'approved';
  const submitted = approved || r.state === 'submitted'; // findings are final
  // Across every ACM the inspection covers
  const samples = M.allSamplesOf(r).map((x) => x.s);
  const labNeeded = samples.length > 0;
  // Pending if any result is pending; skipped only if none was analysed
  const labResult = samples.some((s) => s.result === 'Pending') ? 'Pending'
    : samples.length && samples.every((s) => s.result === 'Not Analyzed') ? 'Not Analyzed' : samples.find((s) => s.result !== 'Not Analyzed')?.result;
  const actions = r.actionItems ?? [];
  const actionsDone = actions.filter((a) => a.status === 'Completed').length;
  const followUpNeeded = kids.length > 0 || M.acmsOf(r).some((a) => a.risk?.followUpRequired === 'Yes');
  const reworking = fu.status === 'failed';

  const info = {
    initiated: r.parentId ? {
      date: day(r.assignment?.assignedAt ?? r.createdAt),
      detail: `Follow-up of inspection ${r.parentId}${r.inspectorName ? ` · ${r.inspectorName}` : ''}`,
      link: `/inspections/records/${r.parentId}`,
    } : {
      date: day(r.assignment?.assignedAt ?? r.createdAt),
      detail: r.assignment?.assignedBy ?`Assigned by ${r.assignment.assignedBy.name}${r.inspectorName ? ` to ${r.inspectorName}` : ''}` : r.inspectorName ? `Inspector: ${r.inspectorName}` : null,
    },
    inProgress: {
      date: r.date ?? null,
      detail: r.state === 'returned' ? 'Returned for changes' : r.inspectorName && r.state !== 'scheduled' ? `Recorded by ${r.inspectorName}` : null,
    },
    submitted: {
      date: day(r.verification?.completionDate),
      detail: approved ? `Approved${r.verification?.reviewerName ? ` by ${r.verification.reviewerName}` : ''}` : r.state === 'submitted' ? 'Final review pending' : null,
    },
    lab: {
      date: labNeeded ? samples.map((s) => s.collectionDate).filter(Boolean).sort()[0] ?? null : null,
      detail: !labNeeded ? null : samples.length === 1 ? `${samples[0].sampleId || 'Sample'} · ${samples[0].result || 'Pending'}${samples[0].passFail ? ` · ${samples[0].passFail}` : ''}`
        : `${samples.length} samples · ${samples.filter((s) => s.result === 'Pending').length || 'no'} pending${samples.some((s) => s.passFail === 'Fail') ? ` · ${samples.filter((s) => s.passFail === 'Fail').length} failed` : ''}`,
      reason: !labNeeded ? 'No sample collected' : labResult === 'Not Analyzed' ? 'Sample not analyzed' : null,
    },
    action: {
      date: null, // action items record a due date, not when they were done
      detail: reworking ? `Follow-up ${fu.rec.id} found open issues – corrective action reopened`
        : actions.length ? `${actionsDone} of ${plural(actions.length, 'action item')} completed` : null,
      link: reworking ? `/inspections/records/${fu.rec.id}` : null,
      reason: !actions.length && !reworking ? 'No corrective action required' : null,
    },
    followUp: kidOpen ? {
      date: kidOpen.date ?? kidOpen.scheduledDate ?? null,
      detail: `Follow-up inspection ${kidOpen.id} ${kidOpen.state === 'scheduled' ? `scheduled for ${kidOpen.scheduledDate}` : 'in progress'}${kidOpen.inspectorName ? ` · ${kidOpen.inspectorName}` : ''}`,
      link: `/inspections/records/${kidOpen.id}`,
      reason: null,
    } : {
      date: fu.status === 'passed' ? fu.rec.date : null,
      detail: !followUpNeeded || !submitted ? null
        : fu.status === 'passed' ? `Verified in inspection ${fu.rec.id}`
          : fu.status === 'reworked' ? `Rework completed (${fu.rec.id}) – verify again`
            : fu.status === 'failed' ? `${fu.rec.id} found open issues`
              : approved ? 'Waiting for a follow-up inspection of this ACM' : 'Required after approval',
      link: fu.rec ? `/inspections/records/${fu.rec.id}` : null,
      reason: !followUpNeeded ? 'No follow-up required' : null,
    },
    closed: {
      date: current === 'closed' ? (fu.status === 'passed' ? fu.rec.date : null) ?? r.verification?.approvalDate ?? r.date ?? null : null,
      detail: current === 'closed' ? 'Approved and closed' : submitted && !labNeeded && !actions.length && !followUpNeeded ? 'Closes on approval' : null,
    },
  };

  let status;
  if (submitted) {
    // After submission each stage's status comes from its own facts (the final review can still be pending
    // while the lab result is in or the corrective work is done)
    status = {
      initiated: 'done',
      inProgress: 'done',
      submitted: current === 'submitted' ? 'current' : 'done',
      lab: !labNeeded ? 'notRequired' : labResult === 'Not Analyzed' ? 'skipped' : labResult === 'Pending' ? 'current' : 'done',
      action: !actions.length && !reworking ? 'notRequired' : current === 'action' ? 'current' : actionsDone < actions.length ? 'upcoming' : 'done',
      followUp: !followUpNeeded ? 'notRequired' : fu.status === 'passed' ? 'done' : current === 'followUp' ? 'current' : 'upcoming',
      closed: current === 'closed' ? 'done' : 'upcoming',
    };
  } else {
    const at = M.STAGES.findIndex((s) => s.id === current);
    status = Object.fromEntries(M.STAGES.map((s, i) => [s.id, i < at ? 'done' : i === at ? 'current' : 'upcoming']));
  }
  return {
    current,
    stages: M.STAGES.map((s) => ({ id: s.id, label: s.label, hint: s.hint, status: status[s.id], stageStatus: STAGE_STATUS[status[s.id]], ...info[s.id] })),
  };
}

// Who did a stage, for records saved before stage history was kept
function actorOf(r, stageId, fu) {
  const v = r.verification ?? {};
  const name = {
    initiated: r.assignment?.assignedBy?.name ?? r.createdBy?.name,
    inProgress: r.inspectorName, submitted: r.inspectorName, lab: r.inspectorName,
    followUp: fu.rec?.inspectorName, closed: v.reviewerName,
  }[stageId];
  return name ? { id: null, name } : null;
}

// Starting history for a record with none: one entry per stage reached, dated from the record (marked derived)
function seedHistory(r, life, fu) {
  return life.stages
    .filter((s) => s.status !== 'upcoming')
    .map((s) => ({
      stage: s.id, status: s.stageStatus,
      at: s.date ?? day(r.verification?.approvalDate) ?? day(r.date) ?? day(r.createdAt),
      by: s.status === 'notRequired' || s.status === 'skipped' ? null : actorOf(r, s.id, fu),
      reason: s.reason ?? s.detail ?? null,
      derived: true,
    }));
}

/**
 * Brings r.stageHistory up to date: an entry for every stage whose status changed (stamped with `by` and
 * the time), plus a derived starting history if the record has none. Returns the new history, or null if
 * nothing changed.
 */
export function syncStageHistory(r, records, by) {
  const life = lifecycleOf(r, records);
  const fu = followUpOf(r, records);
  // No history yet: start from the automatic stages, so a manual change is then recorded as its own entries
  const seeded = !r.stageHistory?.length;
  const base = seeded ? seedHistory(r, gatedLifecycleOf(r, records), fu) : r.stageHistory;
  const last = new Map();
  for (const h of base) last.set(h.stage, h.status);
  const now = new Date().toISOString();
  const added = [];
  for (const s of life.stages) {
    const have = last.get(s.id) ?? 'PENDING';
    if (s.stageStatus === have) continue;
    added.push({
      stage: s.id, status: s.stageStatus, at: now, by: s.status === 'notRequired' ? null : by,
      reason: s.stageStatus === 'PENDING' ? s.detail ?? 'Reopened' : s.reason ?? s.detail ?? null,
    });
  }
  return added.length || seeded ? [...base, ...added] : null;
}

/**
 * Records the stage changes on every inspection sharing an ACM with the given records (a follow-up
 * inspection also moves the earlier ones), credited to the signed-in user.
 */
export async function syncInspectionStages(...changed) {
  const records = getRecords();
  const me = currentUser();
  const by = { id: me.id, name: me.name };
  const ids = new Set(changed.flatMap((x) => M.acmsOf(x).map((a) => a.materialId)));
  for (const r of records.filter((x) => M.acmsOf(x).some((a) => ids.has(a.materialId)))) {
    const history = syncStageHistory(r, records, by);
    if (history) await updateRecord(r.id, { stageHistory: history });
  }
}

// --- Timeline -------------------------------------------------------------------------------------------

// Already shown from the record, its attachments or the stage history
const AUDIT_COVERED = /^(Submitted|Saved draft|Approved|Returned|Assigned|Stage of|Attached|Sent stage|Reviewed stage|Recorded lab results|Added \d+ O&M)/;
const auditStage = (e) => (/^Action/.test(e.summary) ? 'action' : /^Reassigned/.test(e.summary) ? 'initiated' : 'inProgress');

/**
 * What happened in each stage that was worked on (done / current / skipped / not required), oldest first:
 * stage changes, assignment, findings, sample and lab result, documents, review, action items, follow-up
 * inspections and audited activity — each with who, notes and documents where known.
 */
export function timelineOf(r, records = getRecords()) {
  const life = lifecycleOf(r, records);
  const fu = followUpOf(r, records);
  const ev = Object.fromEntries(M.STAGES.map((s) => [s.id, []]));
  const add = (stage, e) => ev[stage].push({ at: null, by: null, detail: null, notes: null, docs: [], link: null, tone: null, ...e });
  const v = r.verification ?? {};
  const docHref = (f) => `/inspection-records/records/${r.id}/attachments/${f.id}`;

  // Stage changes
  const history = r.stageHistory?.length ? r.stageHistory : seedHistory(r, life, fu);
  for (const h of history) {
    if (h.status === 'PENDING' && !h.reason) continue;
    add(h.stage, {
      kind: 'stage', at: h.at, by: h.by?.name ?? null, title: `Stage ${STATUS_TEXT[h.status].toLowerCase()}`, detail: h.reason,
      stageStatus: h.status, estimated: Boolean(h.derived),
      tone: h.status === 'COMPLETED' ? 'good' : h.status === 'IN_PROGRESS' ? 'info' : h.status === 'PENDING' ? 'warn' : null,
    });
  }

  // Initiated: assignment
  if (r.assignment || r.createdAt) {
    add('initiated', {
      kind: 'event', at: r.assignment?.assignedAt ?? r.createdAt, by: r.assignment?.assignedBy?.name ?? r.createdBy?.name ?? null,
      title: r.inspectorName ? `Assigned to ${r.inspectorName}` : 'Inspection record created',
      detail: [r.type, r.scheduledDate && `scheduled for ${r.scheduledDate}${r.scheduledTime ? ` ${r.scheduledTime}` : ''}`].filter(Boolean).join(' · ') || null,
      notes: r.assignment?.notes || null,
    });
  }

  // Inspection in progress: findings per ACM, photos, a return for changes
  const acms = M.acmsOf(r);
  const several = acms.length > 1;
  const acmName = (a) => getMaterial(a.materialId)?.name ?? a.materialId;
  if (r.state !== 'scheduled' && r.date) {
    if (several) add('inProgress', { kind: 'event', at: r.date, by: r.inspectorName ?? null, title: `Inspection carried out on ${acms.length} ACMs`, notes: r.comments || null });
    for (const acm of acms) {
      const a = acm.assessment ?? {};
      add('inProgress', {
        kind: 'event', at: r.date, by: r.inspectorName ?? null, title: several ? acmName(acm) : 'Inspection carried out',
        detail: [a.currentCondition && `Condition: ${a.currentCondition}`, a.damageType && a.damageType !== 'None' && `Damage: ${a.damageType}`,
          acm.risk?.priority && `Priority: ${acm.risk.priority}`, acm.risk?.recommendedAction].filter(Boolean).join(' · ') || null,
        notes: several ? null : r.comments || null,
      });
    }
  }
  // Checklist answers that came with a note or evidence (evidence files record their ACM; older ones are the first ACM's)
  const evidenceFor = (acm, key) => (r.attachments ?? []).some((f) => f.checklistKey === key && (f.materialId ?? r.materialId) === acm.materialId);
  const checklistNotes = acms.flatMap((acm) => M.CHECKLIST
    .filter((q) => acm.checklistNotes?.[q.key] || evidenceFor(acm, q.key))
    .map((q) => `${several ? `${acmName(acm)}: ` : ''}${q.question} ${acm.checklist?.[q.key] || '—'}${acm.checklistNotes?.[q.key] ? ` – ${acm.checklistNotes[q.key]}` : ''}`));
  if (r.state !== 'scheduled' && checklistNotes.length) {
    add('inProgress', { kind: 'event', at: r.date ?? null, by: r.inspectorName ?? null, title: 'Checklist notes', notes: checklistNotes.join('\n') });
  }
  for (const f of r.attachments ?? []) {
    // Stage documents record their stage; form uploads go by category
    const stage = f.stage && ev[f.stage] ? f.stage : f.category === 'Laboratory Report' ? 'lab' : 'inProgress';
    add(stage, {
      kind: 'doc', at: f.uploadedAt, by: f.uploadedBy?.name ?? null, title: `${f.category} uploaded`, docs: [{ name: f.name, href: docHref(f) }],
      detail: f.checklistKey ? `Checklist${several && f.materialId ? ` (${getMaterial(f.materialId)?.name ?? f.materialId})` : ''}: ${M.CHECKLIST.find((q) => q.key === f.checklistKey)?.question ?? f.checklistKey}` : null,
    });
  }
  if (r.state === 'returned' && v.reviewComments) {
    add('inProgress', { kind: 'event', by: v.reviewerName ?? null, title: 'Returned for changes', notes: v.reviewComments, tone: 'warn' });
  }

  // Submitted: inspector sign-off and the reviewer's decision
  if (v.completionDate && (r.state === 'submitted' || r.state === 'approved')) {
    add('submitted', { kind: 'event', at: r.submittedAt ?? v.completionDate, by: r.inspectorName ?? null, title: 'Submitted for review', detail: 'Inspector signed the record', tone: 'info' });
  }
  if (r.state === 'approved') {
    add('submitted', {
      kind: 'event', at: v.reviewedAt ?? (v.reviewDate || v.approvalDate || null), by: v.reviewerName ?? null, title: 'Reviewed & completed',
      detail: ['Reviewer verified and signed the record', (v.reviewDate || v.approvalDate) && `review date ${v.reviewDate || v.approvalDate}`].filter(Boolean).join(' · '),
      notes: v.reviewComments || null, tone: 'good',
    });
  }

  // Laboratory analysis (every sample of every ACM that needed one)
  for (const { a: acm, s } of M.allSamplesOf(r)) {
    const of = several ? ` (${acmName(acm)})` : '';
    add('lab', {
      kind: 'event', at: s.collectionDate || null, by: r.inspectorName ?? null, title: `Sample ${s.sampleId || ''} collected${of}`.replace('  ', ' '),
      detail: [s.testMethod && `Test: ${s.testMethod}`, s.laboratory && `Lab: ${s.laboratory}`, !s.testMethod && s.sampleLocation && `Location: ${s.sampleLocation}`].filter(Boolean).join(' · ') || null,
      notes: s.notes || null,
    });
    if (s.sentToLabAt) {
      add('lab', {
        kind: 'event', at: s.sentToLabAt, by: s.sentToLabBy?.name ?? null, title: `Sample ${s.sampleId || ''} sent to the laboratory${of}`.replace('  ', ' '),
        detail: [s.laboratory, s.testMethod].filter(Boolean).join(' · ') || null, tone: 'info',
      });
    }
    add('lab', {
      kind: 'event', at: s.resultRecordedAt ?? null, by: s.resultRecordedBy?.name ?? null, notes: s.resultNotes || null,
      title: `Lab result${s.resultUpdatedAt ? ' (updated)' : ''}: ${M.resultSummary(s)}${of}`,
      tone: s.passFail === 'Fail' || s.result === 'Asbestos Detected' || s.result === 'Exceeds Limit' ? 'bad'
        : s.passFail === 'Pass' || s.result === 'No Asbestos Detected' ? 'good' : 'warn',
    });
  }

  // Corrective action: action items (and reopened work from a failed follow-up)
  for (const x of r.actionItems ?? []) {
    add('action', {
      kind: 'action', title: x.omActivityId ? `O&M task ${x.omActivityId} – ${x.action}` : x.action, by: x.assignee ?? x.assignedTo ?? null,
      ...(x.omActivityId ? { link: `/operations/activities/${x.omActivityId}`, linkLabel: 'Open O&M activity' } : {}),
      detail: [x.priority && `${x.priority} priority`, x.dueDate && `due ${x.dueDate}`, x.status].filter(Boolean).join(' · '),
      tone: x.status === 'Completed' ? 'good' : x.dueDate && x.dueDate < day(new Date().toISOString()) ? 'bad' : 'warn',
    });
  }
  if (fu.status === 'failed') {
    const open = fu.rec.actionItems.filter((a) => a.status !== 'Completed');
    add('action', {
      kind: 'event', at: fu.rec.date, by: fu.rec.inspectorName ?? null, title: `Follow-up ${fu.rec.id} found open issues`,
      detail: open.map((a) => a.action).join('; ') || null, link: `/inspections/records/${fu.rec.id}`, tone: 'bad',
    });
  }

  // Follow-up verification: follow-up inspections carried out under this one (children) — scheduled, carried
  // out, their lab results and O&M work, approval — then other later inspections of the same ACMs
  for (const k of records.filter((x) => x.parentId === r.id)) {
    const go = { link: `/inspections/records/${k.id}`, linkLabel: `Open ${k.id}` };
    add('followUp', {
      kind: 'event', at: k.assignment?.assignedAt ?? k.createdAt ?? null, by: k.assignment?.assignedBy?.name ?? null, title: `Follow-up inspection ${k.id} scheduled`,
      detail: [k.inspectorName && `Inspector: ${k.inspectorName}`, k.scheduledDate && `${k.scheduledDate}${k.scheduledTime ? ` ${k.scheduledTime}` : ''}`].filter(Boolean).join(' · ') || null,
      notes: k.assignment?.notes || null, tone: 'info', ...go,
    });
    if (k.state !== 'scheduled' && k.date) {
      for (const a of M.acmsOf(k)) {
        add('followUp', {
          kind: 'event', at: k.date, by: k.inspectorName ?? null, title: `Follow-up carried out${M.acmsOf(k).length > 1 ? ` – ${acmName(a)}` : ''}`,
          detail: [a.assessment?.currentCondition && `Condition: ${a.assessment.currentCondition}`, a.risk?.recommendedAction].filter(Boolean).join(' · ') || null,
          notes: k.comments || null, ...go,
        });
      }
    }
    for (const { s } of M.allSamplesOf(k)) {
      add('followUp', {
        kind: 'event', at: s.resultRecordedAt ?? s.collectionDate ?? null, by: s.resultRecordedBy?.name ?? k.inspectorName ?? null,
        title: `Follow-up sample ${s.sampleId || ''}: ${M.resultSummary(s)}`.replace('  ', ' '), notes: s.resultNotes || null,
        tone: s.passFail === 'Fail' || s.result === 'Asbestos Detected' || s.result === 'Exceeds Limit' ? 'bad' : s.result === 'Pending' ? 'warn' : 'good', ...go,
      });
    }
    for (const x of k.actionItems ?? []) {
      add('followUp', {
        kind: 'action', title: x.omActivityId ? `O&M task ${x.omActivityId} – ${x.action}` : x.action, by: x.assignee ?? x.assignedTo ?? null,
        detail: [`From follow-up ${k.id}`, x.priority && `${x.priority} priority`, x.dueDate && `due ${x.dueDate}`, x.status].filter(Boolean).join(' · '),
        ...(x.omActivityId ? { link: `/operations/activities/${x.omActivityId}`, linkLabel: 'Open O&M activity' } : go),
        tone: x.status === 'Completed' ? 'good' : 'warn',
      });
    }
    if (k.state === 'submitted') add('followUp', { kind: 'event', at: k.verification?.completionDate || null, by: k.inspectorName ?? null, title: `Follow-up ${k.id} submitted – waiting for its review`, tone: 'info', ...go });
    if (k.state === 'approved') {
      add('followUp', {
        kind: 'event', at: k.verification?.approvalDate || null, by: k.verification?.reviewerName ?? null, title: `Follow-up ${k.id} approved`,
        detail: passed(k) ? 'Verified – no further action' : openActions(k) ? 'Issues found – corrective action' : 'Rework completed – needs another verification',
        tone: passed(k) ? 'good' : openActions(k) ? 'bad' : 'warn', ...go,
      });
    }
  }
  if (acms.some((a) => a.risk?.followUpRequired === 'Yes')) {
    for (const x of fu.all.filter((y) => y.parentId !== r.id)) {
      const ok = passed(x);
      add('followUp', {
        kind: 'event', at: x.date, by: x.inspectorName ?? null, title: `Follow-up inspection ${x.id}`,
        detail: ok ? 'Verified – no further action' : openActions(x) ? 'Issues found – corrective action reopened' : 'Rework completed – needs another verification',
        link: `/inspections/records/${x.id}`, tone: ok ? 'good' : openActions(x) ? 'bad' : 'warn',
      });
    }
  }

  // Stage reviews: sent for review, then approved or returned by the reviewer (with comments and files)
  const filesOf = (ids) => (r.attachments ?? []).filter((f) => ids?.includes(f.id)).map((f) => ({ name: f.name, href: docHref(f) }));
  for (const rv of r.stageReviews ?? []) {
    if (!ev[rv.stage]) continue;
    add(rv.stage, { kind: 'event', at: rv.requestedAt, by: rv.requestedBy?.name ?? null, title: 'Sent for review', notes: rv.note || null, docs: filesOf(rv.requestFileIds), tone: 'info' });
    if (rv.status !== 'pending') {
      const tasks = (r.actionItems ?? []).filter((a) => rv.addedTasks?.includes(a.id)).map((a) => a.action);
      add(rv.stage, {
        kind: 'event', at: rv.decidedAt, by: rv.reviewerName ?? null, title: rv.status === 'approved' ? 'Review approved – stage confirmed' : 'Review returned for rework',
        detail: [rv.reviewDate && `Review date ${rv.reviewDate}`, rv.signature && 'Signed', rv.confirmedSamples && `${rv.confirmedSamples.length} sample result(s) confirmed`,
          tasks.length && `Open tasks added: ${tasks.join('; ')}`].filter(Boolean).join(' · ') || null,
        notes: rv.comments || null, docs: filesOf(rv.fileIds), tone: rv.status === 'approved' ? 'good' : 'warn',
      });
    }
  }

  // Audited activity not already covered above (reassignments, action status changes, uploads, draft edits)
  for (const e of getEntries()) {
    if (e.recordId !== r.id || AUDIT_COVERED.test(e.summary ?? '')) continue;
    add(auditStage(e), {
      kind: 'activity', at: e.at, by: e.user?.name ?? null, title: e.summary,
      detail: (e.changes ?? []).map((c) => `${c.field}: ${c.from ? `${c.from} → ` : ''}${c.to ?? ''}`).join(' · ') || null,
    });
  }

  // Only stages that were worked on (or have events, e.g. a follow-up under way); events oldest first (undated ones last)
  const worked = life.stages.filter((s) => s.status !== 'upcoming' || ev[s.id].length);
  return worked.map((s) => ({
    id: s.id, label: s.label, status: s.status, stageStatus: s.stageStatus, reason: s.reason ?? null,
    events: ev[s.id].map((e, i) => ({ ...e, i })).sort((a, b) => (a.at ? 0 : 1) - (b.at ? 0 : 1) || String(a.at ?? '').localeCompare(String(b.at ?? '')) || a.i - b.i)
      .map(({ i, ...e }) => e),
  }));
}
