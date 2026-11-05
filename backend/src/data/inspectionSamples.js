import { getRecords } from './inspectionRecordsStore.js';
import { getMaterial, allRooms } from './roomsStore.js';
import { getAllFloors } from './floorsStore.js';
import { schools, buildings } from './store.js';
import { withDerived } from './airStore.js';
import * as M from './inspectionMeta.js';

// Inspection sample result → the lab page's result class
const CLASS_OF = { 'Asbestos Detected': 'detected', 'No Asbestos Detected': 'none', 'Not Analyzed': 'inconclusive', Pending: 'pending' };

// Lab results can be changed (on the inspection) until its Laboratory Analysis review approves them
// (a follow-up inspection's until it's approved — they're entered from its parent's Lab Results tab)
export const resultsEditable = (r) => (r.parentId ? r.state === 'submitted'
  : !(r.reviewGates && (r.stageReviews ?? []).filter((x) => x.stage === 'lab').at(-1)?.status === 'approved'));

// Samples on submitted/approved inspections (they have gone to the laboratory), with their ACM's place.
// An ACM can have several samples: k is the sample's position (0 = first).
function sentSamples() {
  const rooms = new Map(allRooms().map((r) => [r.id, r]));
  const floors = new Map(getAllFloors().map((f) => [f.id, f]));
  const schoolName = (id) => schools.find((s) => s.id === id)?.name ?? id;
  const buildingName = (id) => buildings.find((b) => b.id === id)?.name ?? id;
  return getRecords()
    .filter((r) => r.state === 'submitted' || r.state === 'approved')
    .flatMap((r) => M.allSamplesOf(r).map((x) => ({ r, ...x })))
    // Only samples that have gone to the lab (the reviewer sends them on approval; older records were sent on submit)
    .filter(({ r, s }) => !r.reviewGates || s.sentToLabAt || s.result !== 'Pending')
    .map(({ r, a, i, k, s }) => ({
      r, a, i, k, s, m: getMaterial(a.materialId), room: rooms.get(a.roomId),
      schoolName: schoolName(a.schoolId), buildingName: buildingName(a.buildingId), floorName: floors.get(a.floorId)?.name ?? '',
    }));
}

// Ids as listed: the first sample of an ACM keeps the original form ("ins-<inspection>-<acm>", "AIR-<inspection>-<acm+1>");
// further samples add their position
export const labSampleId = (rId, i, k) => `ins-${rId}-${i}${k ? `-${k}` : ''}`;
export const airEventId = (rId, i, k) => `AIR-${rId}-${i + 1}${k ? `-${k + 1}` : ''}`;

/**
 * Bulk, dust/surface and soil samples taken during inspections, in the shape of the Lab & Sampling Results
 * list (air samples are listed under Air Monitoring). Newest first; ids are "ins-<inspection>-<n>".
 */
export function inspectionSamples() {
  return sentSamples()
    .filter(({ s }) => M.sampleTypeOf(s) !== M.AIR_SAMPLE)
    .map(({ r, a, i, k, s, m, room, schoolName, buildingName }) => {
      const resultClass = CLASS_OF[s.result] ?? 'pending';
      return {
        id: labSampleId(r.id, i, k), sampleKey: k,
        source: 'inspection',
        sampleType: M.sampleTypeOf(s),
        site: schoolName,
        building: buildingName ?? null,
        sampleNo: s.sampleId || `${r.id}-${i + 1}`,
        description: [m?.name, a.locationDescription].filter(Boolean).join(' – '),
        homogeneousArea: a.homogeneousAreaId || null,
        room: room?.number ?? null,
        roomName: room?.name ?? null,
        result: [M.resultSummary(s), s.resultNotes].filter(Boolean).join(' – '),
        resultClass,
        resultLabel: resultClass === 'pending' ? 'Pending at Lab' : s.result,
        components: [...(s.asbestosTypes ?? []), ...(s.resultNotes ? [s.resultNotes] : [])],
        // The lab measurement and Pass / Fail against the sample type's limit
        measuredValue: s.measuredValue ?? null, measureUnit: s.measureUnit ?? null, limitValue: s.limitValue ?? null, passFail: s.passFail ?? null,
        asbestosTypes: s.asbestosTypes ?? [], resultNotes: s.resultNotes || null, resultUpdatedAt: s.resultUpdatedAt ?? null,
        inspectionId: r.id, resultsEditable: resultsEditable(r), inspectionType: r.type, inspectionState: r.state, inspectorName: r.inspectorName ?? null,
        materialId: a.materialId, materialName: m?.name ?? null,
        laboratory: s.laboratory ?? null, testMethod: s.testMethod ?? null, notes: s.notes || null,
        // The laboratory's analysis details, entered with the result
        labSampleId: s.labSampleId || null, analysisMethod: s.analysisMethod || null, analysisStandard: s.analysisStandard || null,
        analysisDate: s.analysisDate || null, materialLayer: s.materialLayer || null, labReportNo: s.labReportNo || null,
        collectionDate: s.collectionDate || null, sentToLabAt: s.sentToLabAt ?? null, sentToLabBy: s.sentToLabBy?.name ?? null,
        resultRecordedAt: s.resultRecordedAt ?? null, resultRecordedBy: s.resultRecordedBy?.name ?? null,
        reports: (r.attachments ?? []).filter((f) => f.category === 'Laboratory Report' && (f.materialId ?? r.materialId) === a.materialId)
          .map((f) => ({ name: f.name, href: `/inspection-records/records/${r.id}/attachments/${f.id}` })),
        sortKey: s.sentToLabAt || s.collectionDate || r.date || '',
      };
    })
    .sort((x, y) => y.sortKey.localeCompare(x.sortKey));
}

/**
 * Air samples taken during inspections, as Air Monitoring events (read-only there — they're changed on the
 * inspection). The result is the measured value once the lab results are recorded; until then "pending".
 */
export function inspectionAirEvents() {
  return sentSamples()
    .filter(({ s }) => M.sampleTypeOf(s) === M.AIR_SAMPLE)
    .map(({ r, a, i, k, s, m, room, schoolName, buildingName }) => withDerived({
      id: airEventId(r.id, i, k), sampleKey: k,
      sampledAt: s.collectionDate ? `${s.collectionDate}T09:00:00.000Z` : s.sentToLabAt ?? r.date,
      schoolId: a.schoolId, schoolName, buildingId: a.buildingId, buildingName,
      location: room ? `${room.number} – ${room.name}` : a.locationDescription || '',
      type: s.airType || 'Area', method: M.airMethodOf(s.testMethod), durationMin: s.durationMin ?? null,
      result: s.result === 'Not Analyzed' ? null : s.airValue ?? null,
      contractorName: '', inspectorName: r.inspectorName ?? '', project: `Inspection ${r.id}`,
      notes: [s.notes, s.resultNotes].filter(Boolean).join(' · '),
      source: 'inspection', inspectionId: r.id, resultsEditable: resultsEditable(r), sampleId: s.sampleId, materialId: a.materialId, materialName: m?.name ?? null, laboratory: s.laboratory ?? null,
      labSampleId: s.labSampleId || null, analysisMethod: s.analysisMethod || null, analysisStandard: s.analysisStandard || null, analysisDate: s.analysisDate || null, labReportNo: s.labReportNo || null,
      passFail: s.passFail ?? null, reports: (r.attachments ?? []).filter((f) => f.category === 'Laboratory Report' && (f.materialId ?? r.materialId) === a.materialId)
        .map((f) => ({ name: f.name, href: `/inspection-records/records/${r.id}/attachments/${f.id}` })),
      sample: false,
    }));
}
