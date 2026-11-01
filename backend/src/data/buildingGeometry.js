// Shared by scripts/generate-buildings.js and buildingsStore.js (buildings added in the app)
export const MAX_FLOORS = 3;
export const ACM_STATUSES = ['ACM Present', 'Assumed ACM', 'No ACM'];
export const FLOOR_NAMES = ['Ground Floor', 'Second Floor', 'Third Floor'];
// AHERA physical-condition categories for ACM (plus "Not assessed" for assumed material)
export const ACM_CONDITIONS = ['Good', 'Damaged', 'Significantly Damaged', 'Not assessed'];
// EPA treats buildings constructed before 1981 as presumed to contain asbestos
export const PRESUMED_ACM_BEFORE = 1981;

const SQFT_TO_M2 = 0.092903;
const FLOOR_HEIGHT_M = 4;
const M_PER_DEG_LAT = 111320;
export const GAP_M = 12; // spacing between buildings on a campus

// Offset a lat/lng by metres east/north
export function offset({ lat, lng }, eastM, northM) {
  return {
    lat: lat + northM / M_PER_DEG_LAT,
    lng: lng + eastM / (M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180)),
  };
}

// Axis-aligned rectangle (GeoJSON Polygon ring) centred on a point
export function rectangle(center, widthM, depthM) {
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]];
  return corners.map(([x, y]) => {
    const p = offset(center, (x * widthM) / 2, (y * depthM) / 2);
    return [+p.lng.toFixed(7), +p.lat.toFixed(7)];
  });
}

// Footprint: floor area per storey as a ~1.6:1 rectangle, plus extrusion height
export function shape(areaSqFt, floors, isPortable = false) {
  const floorM2 = (areaSqFt * SQFT_TO_M2) / floors;
  const widthM = Math.sqrt(floorM2 * 1.6);
  return {
    heightM: isPortable ? 3.5 : floors * FLOOR_HEIGHT_M + 1,
    widthM: +widthM.toFixed(1),
    depthM: +(floorM2 / widthM).toFixed(1),
  };
}

// Rough room count for a school building (~850 sq ft per room incl. corridors)
export const estimateRooms = (areaSqFt) => Math.max(1, Math.round(areaSqFt / 850));
