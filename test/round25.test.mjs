// Round 25: Lite 2.0.0 splits SKILL.md. The ground rules and an index stay in SKILL.md, short enough that
// a compaction (which keeps the first 5,000 tokens of a skill) keeps all of it, and each section moves,
// word for word, into one of six step files next to it, which Claude reads before each step.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LITE_STEP_FILES, liteSkillText, liteSection } from './lite-skill.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const LITE = path.resolve(process.env.COUNCIL_DIAL_LITE_DIR || path.join(ROOT, '..', 'council-dial-lite'));
const FOUND = fs.existsSync(LITE);
const SKILL = path.join(LITE, 'skills/council-dial-lite');
const readSkill = f => fs.readFileSync(path.join(SKILL, f), 'utf8');
const liteTest = (name, fn) => test(`Lite repository: ${name}`, { skip: FOUND ? false : `SKIPPED: no Lite clone at ${LITE}` }, fn);
const TITLES = {
  1: 'Choose the type', 2: 'Estimate, then ask', 3: 'Make the plan', 4: 'Run the steps', 5: 'Write the summary',
  6: 'Check the summary', 7: 'Report to the user', 8: 'Log the results', 9: 'Rechecks, estimates and comparisons', 10: 'Raw runs',
};

liteTest('SKILL.md holds the ground rules and the index, and no section', () => {
  const s = readSkill('SKILL.md');
  assert.deepEqual(s.match(/^## .*$/gm), ['## Ground rules', '## The steps and their files', '## Ground rules, continued']);
  // The whole of SKILL.md survives a compaction: well under 5,000 tokens (about 20,000 characters).
  assert.ok(s.length < 16000, `SKILL.md is ${s.length} characters`);
  assert.match(s, /^- \*\*Before each step, read its file\.\*\* Before you start a section, Read the file that holds it, in full, by its path above\./m);
  assert.match(s, /after a compaction, Claude Code keeps this file, but none of the step files\. When you need to follow a rule in another section/);
  // Claude Code substitutes every ${CLAUDE_SKILL_DIR} in SKILL.md, so the sentence that explains the
  // placeholder (which the step files keep as written) must not contain it.
  assert.match(s, /In those files, a path that starts with the placeholder CLAUDE_SKILL_DIR \(written with a dollar sign and braces\) starts in that folder/);
  assert.match(s, /^- \*\*If a compaction comes during a run,\*\* it can also drop the template texts and the agents' replies\. Read again, by name, any template you still need, in place of section 3's "don't read the template files again"\./m);
  assert.match(s, /Log the compaction as a deviation, saying at which step it came, and in the deviation review \(section 7\) say which steps came before it/);
  assert.ok(liteSection(LITE, 3).includes("(don't read the template files again)"), 'the rule the compaction bullet overrides is still in section 3');
  assert.match(s, /^- \*\*If a step file is missing, or its read is refused,\*\* stop and tell the user, as the ground rules say for a template/m);
  // The index's table names every step file and the sections it holds, with their titles.
  for (const [file, secs] of Object.entries(LITE_STEP_FILES)) {
    const row = `| ${secs.map(n => `${n}. ${TITLES[n]}`).join('; ')} | \`\${CLAUDE_SKILL_DIR}/${file}\` |`;
    assert.ok(s.includes(row), `index row for ${file}`);
  }
});

liteTest('each step file holds exactly its sections, in order, under a title naming them', () => {
  const seen = [];
  for (const [file, secs] of Object.entries(LITE_STEP_FILES)) {
    const t = readSkill(file);
    assert.doesNotMatch(t, /^---\n/, `${file} has no front matter`);
    assert.match(t, /^# Council Dial Lite: [a-z, ]+\n\n(Sections? [0-9 and to]+) of the Council Dial Lite skill\. The ground rules in SKILL\.md apply here too, and SKILL\.md says which file holds each section\.\n\n## /, file);
    const heads = t.match(/^## .*$/gm);
    assert.deepEqual(heads, secs.map(n => `## ${n}. ${TITLES[n]}`), file);
    seen.push(...secs);
    assert.ok(t.endsWith('\n') && !t.endsWith('\n\n'), `${file} ends with one line break`);
  }
  assert.deepEqual(seen, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

liteTest('no rule is in two files: every long line appears once in the whole skill', () => {
  const lines = liteSkillText(LITE).split('\n').filter(l => l.length > 80);
  const twice = lines.filter((l, i) => lines.indexOf(l) !== i);
  assert.deepEqual(twice, []);
});

liteTest('the raw run\'s routing stays in section 5, section 9 points to sections 1 and 3, no line is too long for Read', () => {
  const routing = 'In the council session of a raw run, skip sections 5 to 8 and go to section 10. (An analyst of a raw run does sections 5, 7 and 8, as section 10 says.)';
  assert.ok(!readSkill('SKILL.md').includes(routing));
  assert.ok(liteSection(LITE, 5).startsWith(`## 5. Write the summary\n\n${routing}\n`));
  assert.match(liteSection(LITE, 9), /group them by the label rebuilt, as section 1 says, from each one's `type`/);
  assert.match(liteSection(LITE, 9), /to its `rechecks`, changing its `run\.json` as section 3 says\./);
  // Older Read tools cut lines over 2,000 characters; the skill's other files are read with Read.
  for (const f of Object.keys(LITE_STEP_FILES)) for (const line of readSkill(f).split('\n')) assert.ok(line.length <= 2000, `${f} has a ${line.length}-character line`);
  assert.match(liteSection(LITE, 3), /Read `\$\{CLAUDE_SKILL_DIR\}\/check-brief\.md` first \(in a raw run, `\$\{CLAUDE_SKILL_DIR\}\/raw-handoff\.md`\), before any file in `briefs\/`\. A read's prompt offers to allow reading the folder that file is in for the session/);
  const s = readSkill('SKILL.md');
  assert.match(s, /Whenever you do anything differently from this skill, in this file or a step file \(a step skipped/);
  assert.match(s, /A step this skill requires isn't a deviation/);
  assert.match(s, /After that, read it only where a step asks you to/);
  assert.doesNotMatch(liteSkillText(LITE), /this file (asks|requires)|differently from this file/);
});

liteTest('the hand-off notes, the README and the version point to the step files', () => {
  const h = readSkill('raw-handoff.md');
  assert.match(h, /the analysis follows the skill's section 10 \(`raw\.md`\), never this file/);
  assert.match(h, /in the order of the agents table in section 3 of the skill, in `plan\.md` \(not the `\.as-received\.txt` copies/);
  assert.doesNotMatch(h, /SKILL\.md section|table in SKILL\.md/);
  const r = fs.readFileSync(path.join(LITE, 'README.md'), 'utf8') + '\n' + fs.readFileSync(path.join(LITE, 'CHANGELOG.md'), 'utf8');
  assert.match(r, /`skills\/council-dial-lite\/SKILL\.md` and its six step files \(`plan\.md`, `run\.md`, `summary-and-check\.md`, `report-and-log\.md`, `comparisons\.md` and `raw\.md`, next to it\) are what Claude follows/);
  assert.match(r, /SKILL\.md as loaded \(with its paths filled in for an installed copy\) is 7,039 tokens on both Opus 5\.5 and Sonnet 5\.5/);
  assert.match(r, /\(section 10 of the skill, in `raw\.md`, then sections 5, 7 and 8\)/);
  assert.match(r, /Lite 2\.0\.0 moves the steps out of SKILL\.md into six files next to it, word for word, apart from a few wording changes the move needed\./);
  assert.doesNotMatch(r, /section 10 of SKILL\.md/);
  const v = JSON.parse(fs.readFileSync(path.join(LITE, '.claude-plugin/plugin.json'), 'utf8')).version;
  assert.equal(v, '2.2.2');
  assert.ok(readSkill('plan.md').includes(`"liteVersion": "${v}",`));
  assert.doesNotMatch(liteSkillText(LITE), /\(Lite (1\.11\.0|2\.0\.0|2\.1\.0|2\.1\.1|2\.1\.2|2\.2\.0|2\.2\.1)\)/);
});
