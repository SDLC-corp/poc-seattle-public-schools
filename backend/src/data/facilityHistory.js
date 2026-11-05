import { getRecords as getInspectionRecords } from './inspectionRecordsStore.js';
import { getRecords as getSurveillanceRecords } from './surveillanceStore.js';
import { acmsOf } from './inspectionMeta.js';
import * as OM from './omStore.js';

/**
 * Asbestos records kept for a building or one of its floors: inspections (any of their ACMs), surveillance and O&M
 * work. AHERA records must be kept, so a place with any of these can't be deleted (its ACMs would be orphaned).
 * where: { buildingId } or { floorId }
 */
export function historyAt({ buildingId, floorId }) {
  const at = (x) => (floorId ? x.floorId === floorId : x.buildingId === buildingId);
  const inspections = getInspectionRecords().filter((r) => r.state !== 'draft' && acmsOf(r).some(at)).length;
  const surveillance = getSurveillanceRecords().filter((r) => r.status !== 'draft' && at(r)).length;
  const om = OM.all('activities').filter(at).length;
  const parts = [
    inspections && `${inspections} inspection${inspections === 1 ? '' : 's'}`,
    surveillance && `${surveillance} surveillance record${surveillance === 1 ? '' : 's'}`,
    om && `${om} O&M activit${om === 1 ? 'y' : 'ies'}`,
  ].filter(Boolean);
  return { inspections, surveillance, om, total: inspections + surveillance + om, text: parts.join(', ') };
}
