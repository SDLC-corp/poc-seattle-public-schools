import { readFileSync } from 'node:fs';

const load = (file) => JSON.parse(readFileSync(new URL(`../../data/${file}`, import.meta.url), 'utf8'));

export const { schools } = load('schools.json');
export const { buildings } = load('buildings.json');

const buildingsBySchool = Map.groupBy(buildings, (b) => b.schoolId);

export const getSchoolBuildings = (schoolId) => buildingsBySchool.get(schoolId) ?? [];
