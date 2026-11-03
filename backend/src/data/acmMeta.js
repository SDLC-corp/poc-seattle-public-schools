// Option lists for rooms and ACM materials (shared by the generator, validation and /api/acm-materials/meta)
export const ROOM_TYPES = [
  'Classroom', 'Office', 'Conference Room', 'Science Lab', 'Computer Lab', 'Library', 'Cafeteria', 'Kitchen',
  'Gymnasium', 'Restroom', 'Storage', 'Mechanical', 'Nurse', 'Staff Room', 'Corridor', 'Stairs / Lobby', 'IT / Server Room', 'Other',
];
export const ROOM_STATUSES = ['Active', 'Inactive', 'Under Renovation'];

// ACM status of one material; a room's status is the "worst" of its materials
export const MATERIAL_STATUSES = ['ACM Present', 'Assumed ACM', 'No ACM', 'Not Yet Assessed'];
export const ROOM_ACM_RANK = { 'ACM Present': 3, 'Assumed ACM': 2, 'No ACM': 1, 'Not Assessed': 0 };

export const MATERIAL_NAMES = [
  'Ceiling Tile', 'Floor Tile & Mastic', 'Pipe Insulation', 'Boiler Insulation', 'Duct Wrap', 'Acoustic Plaster',
  'Wall Plaster / Joint Compound', 'Transite Panel', 'Window Glazing', 'Fire Door Core', 'Roofing', 'Other',
];
export const MATERIAL_TYPES = [
  'Asbestos Cement (AC)', 'Ceiling Tile', 'Vinyl Floor Tile (VAT)', 'Thermal System Insulation (TSI)',
  'Surfacing Material', 'Joint Compound / Plaster', 'Roofing Material', 'Window Glazing', 'Miscellaneous Material',
];
export const UNITS = ['Sq ft', 'Linear ft', 'Each'];
export const FRIABILITY = ['Friable', 'Non-Friable'];
export const CLASSIFICATIONS = ['Confirmed', 'Assumed', 'Presumed (PACM)', 'Negative'];
// AHERA physical assessment
export const CONDITIONS = ['Good', 'Damaged', 'Significantly Damaged', 'Not Assessed'];
export const RISK_RANKINGS = ['Low', 'Medium', 'High'];
export const SCOPES = ['room', 'floor', 'building'];
export const RELATED_TRACKING = ['Inspection', 'Sample Results', 'Surveillance', 'Response Action', 'Air Monitoring', 'O&M Activity'];
export const ATTACHMENT_TYPES = ['Photo', 'Sample Report', 'Inspection Report', 'Lab Result', 'Floor Plan', 'Other'];

// Files accepted for room photos and material attachments (checked by content, not just extension)
export const ATTACHMENT_FILES = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', pdf: 'application/pdf',
};
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
