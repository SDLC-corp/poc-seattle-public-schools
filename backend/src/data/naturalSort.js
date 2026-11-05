// Natural order ("Room 2" before "Room 10", "INS-9" before "INS-10"). One shared collator: localeCompare with options
// creates a new one on every comparison, which made sorting a few thousand rows take seconds.
const collator = new Intl.Collator('en', { numeric: true });
export const naturalCompare = (a, b) => collator.compare(a, b);
