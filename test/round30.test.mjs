// Round 30: Lite 2.2.3 and Council Dial 1.9.1. SKILL.md trimmed under 4,500 tokens by moving most of "Log every
// deviation" to section 7, and the judge's reason taken from a "Reason:" line first, in both editions, so the
// appeal is never told "no reason" when the judge gave one (found by the 2.2.2 installed-copy run).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { liteSection } from './lite-skill.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const LITE = path.resolve(process.env.COUNCIL_DIAL_LITE_DIR || path.join(ROOT, '..', 'council-dial-lite'));
const FOUND = fs.existsSync(LITE);
const liteTest = (name, fn) => test(`Lite repository: ${name}`, { skip: FOUND ? false : `SKIPPED: no Lite clone at ${LITE}` }, fn);
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const readLite = f => fs.readFileSync(path.join(LITE, f), 'utf8');
const FULL = () => read('plugin/skills/council-dial/SKILL.md');
const rule = t => { const r = t.slice(t.indexOf("- **What counts as the judge's reason.**")); return r.slice(0, r.search(/\n(?=- |\n)/)); };

const SHORT = '- **Log every deviation.** Whenever you do anything differently from this skill, in this file or a step file, add one line saying what and why to the run\'s `deviations` list in `run.json` as soon as you notice (before `run.json` exists, as soon as you write it), with the exact text of anything you added to or changed in a prompt (no secrets, and nothing else quoted from the material or the reports). What the user asked for goes in `userRequests`, and an instruction from outside this skill and the user\'s messages in `outsideInstructions`, so the deviations stay a count of your own slips. The full rule is in section 7, under "Logging deviations": read it before the deviation review, and whenever you\'re unsure what counts.';

liteTest('SKILL.md: a short deviation rule, last, and the file stays small', () => {
  const s = readLite('skills/council-dial-lite/SKILL.md');
  assert.ok(s.endsWith(SHORT + '\n'), 'the short version is the last rule');
  // Measured at about 4,480 tokens as loaded with a 121-character path (13,056 bytes on disk). Keep it from growing.
  assert.ok(Buffer.byteLength(s) <= 13100, `SKILL.md is ${Buffer.byteLength(s)} bytes; keep it under 4,500 tokens as loaded`);
  assert.doesNotMatch(s, /Two other kinds of difference aren't deviations either/);
  assert.doesNotMatch(s, /with `\(after review\)` after it instead/);
});

liteTest('section 7: the full deviation rule, under "Logging deviations", before the deviation review', () => {
  const s7 = liteSection(LITE, 7);
  const at = s7.indexOf('**Logging deviations.** This is the full form of SKILL.md\'s ground rule "Log every deviation".\nWhenever you do anything differently from this skill, in SKILL.md or a step file (a step skipped,');
  assert.ok(at > 0 && at < s7.indexOf('**The deviation review.**'));
  assert.ok(at > s7.indexOf('4. Write the report.'), 'after the order of the section');
  assert.match(s7, /such as a line addressed to the council in a project file \(SKILL\.md's ground rules\), goes in `outsideInstructions`/);
  assert.match(s7, /One you make after the flag is `true`, such as in a reply after the report, is added the same way with `\(after review\)` after it instead\./);
  assert.match(s7, /Before you report, you review every rule for unlogged deviations \(section 7\)\./);
  // The section's own text is checked by Read, so no line may pass 2,000 characters.
  for (const line of s7.split('\n')) assert.ok(line.length <= 2000, `a ${line.length}-character line in section 7`);
});

// The three tests of the judge's reason, in order, with a case for each. `pick` follows the rule as written: a
// Reason: line first (any case, with or without bold, the first one, not one that's empty or only a severity),
// then the first sentence that names a severity or says the finding is more or less serious and says more than
// the severity, and only then no reason.
const SEV = /\b(HIGH|MED|LOW)\b|\b(lower|higher|more serious|less serious)\b/;
const ONLY_SEV = /^\s*(my severity is\s+)?(HIGH|MED|LOW)\.?\s*$/i;
const pick = (ruling, kind) => {
  const lines = ruling.split('\n');
  const labelled = lines.map(l => l.match(/^\s*(?:-\s*)?(?:\*\*)?reason:(?:\*\*)?\s*(.*)$/i)).filter(Boolean).map(m => m[1].trim());
  const first = labelled.find(x => x && !ONLY_SEV.test(x));
  if (labelled.length && first === labelled[0]) return { test: 1, reason: first };
  // Leave out the list of severities the ruling starts with ("Severities: …" or "Correctness HIGH, …, mine MED.").
  const rest = /^\s*-?\s*severities?:|\b(mine|my severity)\b/i.test(lines[0]) ? lines.slice(1) : lines;
  const sentences = rest.join(' ').split(/(?<=\.)\s+/);
  const s = sentences.find(x => SEV.test(x) && !ONLY_SEV.test(x) && !/^\s*-?\s*(?:\*\*)?reason:/i.test(x));
  if (s) return { test: 2, reason: s.trim() };
  return { test: 3, reason: kind === 'OVERSTATED' || kind === 'UNDERSTATED' ? 'the judge gave no reason line' : 'no reason given' };
};
const CASES = [
  { // Test 1: the 2.2.2 run's M5, a Reason: line with no severity in it, which 2.2.2 logged as no reason.
    ruling: '- Severities: correctness MED, docs MED, security LOW. Mine: HIGH.\n- Reason: target/README.md:7 says "A missing file gives an empty list", so callers will not catch errors. Yet `readFileSync` throws ENOENT on every new blog\'s first load, which breaks the main sign-up path.\n- The `saveUsed(f, [])` then `[""]` part holds.',
    kind: 'UNDERSTATED', test: 1,
    reason: 'target/README.md:7 says "A missing file gives an empty list", so callers will not catch errors. Yet `readFileSync` throws ENOENT on every new blog\'s first load, which breaks the main sign-up path.',
    clause: 'First, a line headed `Reason:`, in any mix of upper and lower case and with or without bold (such as `- Reason:`, `- **Reason:**` or `REASON:`): the reason is the rest of that line after the label, quoted exactly',
  },
  { // Test 1, bold label and two Reason: lines: the first.
    ruling: '- Severities: correctness HIGH. Mine: MED.\n- **REASON:** the result is still a working, unique URL.\n- Reason: a second one.',
    kind: 'OVERSTATED', test: 1, reason: 'the result is still a working, unique URL.',
    clause: 'If the ruling has more than one, use the first.',
  },
  { // Test 2: a Reason: line that only states a severity falls through to the sentence test.
    ruling: 'Correctness HIGH, security MED, mine MED.\nReason: MED.\nSlugs stay unique and nothing is lost, so MED rather than HIGH.',
    kind: 'OVERSTATED', test: 2, reason: 'Slugs stay unique and nothing is lost, so MED rather than HIGH.',
    clause: "A `Reason:` line that's empty or only states a severity, such as `Reason: LOW.`, doesn't count: go on to the second test.\nSecond, if no `Reason:` line counts, leave out the list of severities the ruling starts with",
  },
  { // Test 3: no Reason: line, and no sentence names a severity.
    ruling: 'Correctness MED. Mine: LOW.\nAll four functions are synchronous, so one process can\'t interleave load and save.',
    kind: 'OVERSTATED', test: 3, reason: 'the judge gave no reason line',
    clause: 'Third, if no `Reason:` line and no sentence counts, the reason is "the judge gave no reason line" for OVERSTATED and UNDERSTATED',
  },
  { // Test 3 for any other ruling.
    ruling: 'My severity is LOW.', kind: 'REAL', test: 3, reason: 'no reason given',
    clause: 'and "no reason given" for any other ruling.',
  },
];

liteTest('the judge\'s reason: three tests in order, a case for each, the same in both editions', () => {
  const lite = rule(readLite('skills/council-dial-lite/report-and-log.md')), full = rule(FULL());
  assert.equal(lite.replace("which you note in the judge's `notes`", "which you note in the judge's agent `notes`"), full);
  assert.equal(lite.split('\n').length, 3, 'one line per test');
  for (const line of lite.split('\n')) assert.ok(line.length <= 2000, `a ${line.length}-character line`);
  assert.ok(lite.indexOf('First, a line headed `Reason:`') < lite.indexOf('\nSecond, ') && lite.indexOf('\nSecond, ') < lite.indexOf('\nThird, '));
  for (const c of CASES) {
    assert.ok(lite.includes(c.clause), c.clause);
    assert.deepEqual(pick(c.ruling, c.kind), { test: c.test, reason: c.reason }, c.ruling);
  }
});

liteTest('the appeal\'s severity block takes the reason section 7 defines, in both editions; the brief is unchanged', () => {
  assert.match(liteSection(LITE, 4), /`Judge's reason:` the judge's reason as section 7 defines it, copied exactly inside straight double quotes/);
  assert.match(FULL(), /`Judge's reason:` the judge's reason as section 5 defines it, copied exactly inside straight double quotes/);
  const b = 'briefs/v3/appeal.md';
  assert.equal(readLite('skills/council-dial-lite/' + b), read('plugin/skills/council-dial/' + b));
});

liteTest('README and CHANGELOG: 2.2.3, the measured size, and the 2.2.2 installed run', () => {
  const r = readLite('README.md'), c = readLite('CHANGELOG.md');
  assert.match(r, /SKILL\.md as loaded \(with its paths filled in for an installed copy\) is about 4,480 tokens on both Opus 5\.5 and Sonnet 5\.5, with a 121-character install path/);
  assert.match(r, /pasting the same text into a plain prompt gave 4,454/);
  assert.match(r, /- After a compaction, Claude Code keeps SKILL\.md \(about 4,480 tokens in our measurement/);
  assert.match(r, /one claude\.ai connector's instructions added about 710 tokens to each council agent's context/);
  assert.doesNotMatch(c, /## Planned/);
  assert.ok(c.indexOf('## 2.2.3') < c.indexOf('## 2.2.2'));
  assert.match(c, /Its labels end `\(Lite 2\.2\.3\)`\./);
  assert.match(c, /\*\*The judge's reason\.\*\* In the 2\.2\.2 run the judge wrote each OVERSTATED and UNDERSTATED reason on a line headed "Reason:"/);
  const runs = c.slice(c.indexOf('\n## Test runs\n'), c.indexOf('\n## Why only Lite is submitted\n'));
  assert.ok(runs.indexOf('**Lite 2.2.1, interactive, one judged Standard council from an installed copy**') < runs.indexOf('**Lite 2.2.2, interactive, one judged Standard council from an installed copy**'));
  assert.match(runs, /merged 22 reviewer findings \(9, 6 and 7\) into 15: 7 REAL, 1 PARTLY REAL, 4 OVERSTATED, 1 UNDERSTATED and 2 NOT REAL \(3 HIGH, 2 MED, 10 LOW\)/);
  assert.match(runs, /109,580 in all \(context sizes\); the critical path took 3\.6 minutes/);
});
