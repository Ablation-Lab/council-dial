// Round 22: what the Lite 1.9.0 Standard session still raised, fixed in Lite 1.10.1 and, where it applies,
// Council Dial 1.5.8: the check counts the items in a judged run's reviewer and debate reports too; the check's
// own report is read back before anything uses it; steps the skill requires aren't deviations; the full stop
// that ends each part of a ranked-list row is dropped in the severity block; and a harness note such as
// "Shell cwd was reset" isn't a link-check command's output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { liteSkillText } from './lite-skill.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const LITE = path.resolve(process.env.COUNCIL_DIAL_LITE_DIR || path.join(ROOT, '..', 'council-dial-lite'));
const FOUND = fs.existsSync(LITE);
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const readLite = f => fs.readFileSync(path.join(LITE, f), 'utf8');
const liteTest = (name, fn) => test(`Lite repository: ${name}`, { skip: FOUND ? false : `SKIPPED: no Lite clone at ${LITE}` }, fn);
const LITE_SKILL = () => liteSkillText(LITE);
const FULL_STOP = 'In a ranked-list line, `File and line:` is its file locations, the part made of paths and line numbers before `Fix:`, without the brackets round it if it has them and without the full stop after it (`a.mjs:24, :29; README:7.` gives `a.mjs:24, :29; README:7`); `Title:` is the text between the number, severity and ruling and those locations, without the full stop, space or bracket that ends it, and a full stop inside it is kept. For example, from `1. **M4: MED, OVERSTATED.** Mutable seen default skips files. shelfkeep.py:112-122. Fix: …` or from `1. M4, MED, OVERSTATED. Mutable seen default skips files (shelfkeep.py:112-122). Fix: …`, `Title:` is `Mutable seen default skips files` and `File and line:` is `shelfkeep.py:112-122`. In a table, leave out only a full stop that ends a cell.';

liteTest('a judged run\'s reviewer and debate reports go to the check as count files', () => {
  const s = LITE_SKILL();
  assert.ok(s.includes('- for judged, a line `Count files:`, then a line `- <agent file without .txt>: <path>` for each saved reviewer\'s and debate agent\'s report, so the check also checks their count lines (pooled and consensus have every report under `Report files:` already, so leave this out);'));
  assert.ok(s.includes('apart from those under Brief folder:, Report files:, Count files:, Summary file:,'));
  const b = readLite('skills/council-dial-lite/check-brief.md');
  assert.match(b, /4\. For each file under Report files: and Count files:, check every count it gives of items listed in that same report, such as a closing line "Severity findings: 13 checked" against the severity verdicts it gives, or "three problems:" inside a finding against the list that follows it, by counting those items yourself\. A file listed only under Count files: is for this step only\./);
  assert.match(b, /The report files, any count files, the summary file/);
  assert.match(b, /From Lite 1\.10\.1, step 4 also checks the count lines of a judged run's reviewer and debate reports/);
  const r = (readLite('README.md') + '\n' + readLite('CHANGELOG.md'));
  assert.match(r, /from Lite 1\.10\.1 that covers a judged run's reviewer and debate reports too, not only the judge's, the appeal's and the baseline's\./);
  assert.match(r, /a reviewer wrote that something "causes three problems" and listed four/);
  assert.match(r, /Claude logged its required correction of the overview as a deviation\./);
});

liteTest('the check\'s report is read back before its counts or items are used', () => {
  assert.match(LITE_SKILL(), /When it finishes, save its reply to `reports\/check\.txt` and read it back as section 4 says\. Nothing may use it until you've seen that read-back match: record none of its counts, and make no change it calls for \(to `overview\.txt`, `summary\.txt` or anything else\), in the batch that holds the save or the read-back, or any earlier one\. Do those in a later batch\./);
});

test('required steps aren\'t deviations, and ranked-list full stops are dropped, in both editions', () => {
  const full = read('plugin/skills/council-dial/SKILL.md');
  assert.ok(full.includes('A step this file requires isn\'t a departure, even when it changes something written earlier, such as saving a report again when `report` warns that it looks escaped: do it, and don\'t note it. The slip it corrects, if it was yours, is still a departure, such as a first save without `--notice-escaped` when the notice was escaped.'));
  assert.ok(full.includes(FULL_STOP));
  assert.doesNotMatch(full, /without a full stop that only ends a table cell/);
});

liteTest('required steps aren\'t deviations; ranked-list full stops; harness notes aren\'t output', () => {
  const s = LITE_SKILL();
  assert.ok(s.includes('A step this skill requires isn\'t a deviation, even when it changes something you wrote earlier, such as correcting `overview.txt` after an OVERVIEW UNSUPPORTED item (section 6): do it, and don\'t log it. A step that says to log something, such as a BRIEF DIFFERS, still does, and a slip of yours that a step corrects is still a deviation, such as a finding you copied wrongly when the check\'s CHANGED was right.'));
  assert.ok(s.includes(FULL_STOP));
  assert.doesNotMatch(s, /without a full stop that only ends a table cell/);
  assert.ok(s.includes('In either shell, a line in Claude Code\'s own form `Shell cwd was reset to <folder>` isn\'t the command\'s output: leave only that line out when deciding whether the command printed nothing, or only "No such file or directory". Any other text, on its output or its errors, is the command\'s.'));
  const r = (readLite('README.md') + '\n' + readLite('CHANGELOG.md'));
  assert.match(r, /Lite 1\.10\.1 then extends the count check to a judged run's reviewer and debate reports/);
});
