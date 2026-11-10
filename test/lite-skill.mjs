// Lite 2.0.0 split its SKILL.md: the ground rules and an index stay in SKILL.md, and the ten sections
// are in six step files next to it. Tests that pin the skill's wording read it all through this helper,
// in section order; test/round25.test.mjs checks which file holds each section.
import fs from 'node:fs';
import path from 'node:path';

export const LITE_STEP_FILES = {
  'plan.md': [1, 2, 3],
  'run.md': [4],
  'summary-and-check.md': [5, 6],
  'report-and-log.md': [7, 8],
  'comparisons.md': [9],
  'raw.md': [10],
};

const skillDir = lite => path.join(lite, 'skills/council-dial-lite');

// SKILL.md and every step file, joined in section order.
export const liteSkillText = lite =>
  ['SKILL.md', ...Object.keys(LITE_STEP_FILES)].map(f => fs.readFileSync(path.join(skillDir(lite), f), 'utf8')).join('\n');

// One section's text, from its "## <n>. " heading to the next "## " heading or the end of its file.
export const liteSection = (lite, n) => {
  const file = Object.keys(LITE_STEP_FILES).find(f => LITE_STEP_FILES[f].includes(n));
  const text = fs.readFileSync(path.join(skillDir(lite), file), 'utf8');
  const start = text.indexOf(`\n## ${n}. `);
  if (start < 0) throw new Error(`section ${n} isn't in ${file}`);
  const next = text.indexOf('\n## ', start + 1);
  return text.slice(start + 1, next < 0 ? undefined : next + 1);
};
