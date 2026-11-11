// Round 32: Lite 2.2.4's second commit. The appeal's severity block gives the judge's whole ruling for each finding,
// because judges lay rulings out differently in every run (the 2.2.3 installed-copy run's M6 reason sat on its
// "Severities:" line, so it was logged as no reason line and the appeal was told the same). The severity-changes
// list and severityChanges quote a reason only from a single Reason: line, and otherwise point to the ruling.
// userRequests never holds the task itself. The full edition keeps its three-test rule for now.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { liteSection, liteSkillText } from './lite-skill.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const LITE = path.resolve(process.env.COUNCIL_DIAL_LITE_DIR || path.join(ROOT, '..', 'council-dial-lite'));
const FOUND = fs.existsSync(LITE);
const liteTest = (name, fn) => test(`Lite repository: ${name}`, { skip: FOUND ? false : `SKIPPED: no Lite clone at ${LITE}` }, fn);
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const readLite = f => fs.readFileSync(path.join(LITE, f), 'utf8');

// The judge's ruling as section 4 defines it: the finding's entry in the merged list, from the line that starts it
// to just before the next merged finding or the first heading or section label after the list, with blank lines
// at its end left out.
const rulingOf = (report, m) => {
  const lines = report.split('\n');
  const isStart = l => /^(\*\*)?M\d+[.:]/.test(l);
  const i0 = lines.findIndex(l => new RegExp(`^(\\*\\*)?${m}[.:]`).test(l));
  assert.ok(i0 >= 0, `no entry for ${m}`);
  let i = i0 + 1;
  while (i < lines.length && !isStart(lines[i]) && !/^(#+ |[A-Z][A-Za-z ]+:?$|\*\*[A-Z][^*]*\*\*$)/.test(lines[i])) i++;
  return lines.slice(i0, i).join('\n').replace(/\n+$/, '');
};
// A reason only from exactly one Reason: line with text after the label; otherwise the ruling is pointed to.
const reasonOf = ruling => {
  const labelled = ruling.split('\n').map(l => l.match(/^\s*(?:-\s*)?(?:\*\*)?reason:(?:\*\*)?\s*(.*)$/i)).filter(Boolean);
  return labelled.length === 1 && labelled[0][1].trim() ? labelled[0][1].trim() : "see the judge's ruling";
};

// The 2.2.3 installed-copy run's judge, M5 to M7 (merged list), then the start of its ranked list.
const JUDGE_223 = [
  '**M5. `uniqueSlug` starts numbering at -1, but the README and comment say -2**',
  '- Raised by: correctness #4 (MED), docs #3 (MED).',
  '- My severity: MED.',
  '- Ruling: **REAL**.',
  '',
  '**M6. The `.slugs` read-modify-write is not atomic (race condition, torn writes)**',
  '- Raised by: correctness #6 (MED).',
  '- Evidence: lines 24 and 29 use the synchronous `writeFileSync` and `readFileSync`.',
  '- Severities: correctness MED; mine LOW. The race depends on an assumed caller and deployment that the material does not show.',
  '- Ruling: **OVERSTATED**. The concurrency part only holds under multi-process or async use.',
  '',
  '**M7. The user-typed blog name is used directly as a file path**',
  '- Raised by: security #1 (HIGH).',
  '- Ruling: **PARTLY REAL**.',
  '',
  '## Final ranked list',
  '',
  '| Rank | Finding | Severity |',
].join('\n');
// The 2.2.2 installed-copy run's M5, with its Reason: line.
const RULING_222_M5 = '**M5. A missing file throws**\n- Severities: correctness MED, docs MED, security LOW. Mine: HIGH.\n- Reason: target/README.md:7 says "A missing file gives an empty list", so callers will not catch errors.\n- Ruling: **UNDERSTATED**.';

liteTest('the appeal\'s severity block: the judge\'s whole ruling, fenced, after six one-line labels', () => {
  const s4 = liteSection(LITE, 4);
  assert.match(s4, /Lay out each severity item exactly like this: these seven labels, in this order, each at the start of its own line, with one blank line between items\. Each of the first six is followed by one space and its value, with nothing else on the line; `Judge's ruling:` is alone on its line, and the ruling follows it in a fenced text block\./);
  // The example: a five-backtick fence round it, so the ruling's own four-backtick fence sits inside.
  const ex = s4.slice(s4.indexOf('  `````\n') + 8, s4.indexOf('\n  `````\n', s4.indexOf('  `````\n') + 8)).split('\n').map(l => l.slice(2));
  assert.deepEqual(ex.slice(0, 7).map(l => l.split(':')[0]), ['Finding', 'Title', 'File and line', 'Claim', 'Reviewer severities', "Judge's severity", "Judge's ruling"]);
  assert.equal(ex[6], "Judge's ruling:");
  assert.equal(ex[7], '````text');
  assert.equal(ex.at(-1), '````');
  assert.ok(ex.slice(8, -1).every(l => !l.includes('````')));
  assert.match(s4, /- `Judge's ruling:` the judge's whole ruling for this finding, copied exactly, in a fenced text block whose fence is longer than any run of backticks in it\./);
  assert.match(s4, /The ruling is the finding's entry in the judge's merged list, from the line that starts it \(its number, such as `\*\*M4\. …\*\*` or `M4\.`\) up to just before the line that starts the next merged finding, or the first heading or section label after the list, with blank lines at its end left out/);
  assert.match(s4, /Don't pick a reason out of it, and never say whether it has one: judges lay their rulings out differently in every run, so the appeal reads the ruling itself\./);
  assert.match(s4, /- `Judge's severity:` HIGH, MED or LOW, and nothing else \(the ruling goes under `Judge's ruling:`\)\./);
  assert.doesNotMatch(s4, /Judge's reason:/);
  // The 2.2.3 run's M6: its whole entry, with the reason on its Severities: line, goes to the appeal.
  const m6 = rulingOf(JUDGE_223, 'M6');
  assert.ok(m6.startsWith('**M6. The `.slugs` read-modify-write') && m6.endsWith('only holds under multi-process or async use.'));
  assert.match(m6, /The race depends on an assumed caller and deployment that the material does not show\./);
  assert.equal(m6.split('\n').length, 5);
  // The last entry ends before the heading that follows the list.
  assert.equal(rulingOf(JUDGE_223, 'M7').split('\n').length, 3);
  // The appeal brief is unchanged and byte-identical between editions; its notes still describe the older block.
  assert.equal(readLite('skills/council-dial-lite/briefs/v3/appeal.md'), read('plugin/skills/council-dial/briefs/v3/appeal.md'));
});

const CASES = [
  { name: 'the 2.2.2 run\'s M5: one Reason: line', ruling: RULING_222_M5, want: 'target/README.md:7 says "A missing file gives an empty list", so callers will not catch errors.' },
  { name: 'the 2.2.3 run\'s M6: the reason on the Severities: line, no Reason: line', ruling: rulingOf(JUDGE_223, 'M6'), want: "see the judge's ruling" },
  { name: 'a bold, upper-case label', ruling: '- Severities: correctness HIGH. Mine: MED.\n- **REASON:** the result is still a working, unique URL.', want: 'the result is still a working, unique URL.' },
  { name: 'two Reason: lines, as for a finding split between rulings', ruling: '- Reason: the first part is cosmetic.\n- Reason: the second part is real.', want: "see the judge's ruling" },
  { name: 'an empty Reason: line', ruling: '- Severities: correctness MED; mine LOW.\n- Reason:', want: "see the judge's ruling" },
];

liteTest('the severity-changes list: a reason only from exactly one Reason: line, otherwise the ruling', () => {
  const s7 = liteSection(LITE, 7);
  assert.match(s7, /- \*\*The judge's reason\.\*\* In this list and `severityChanges` \(the appeal's severity block gets the whole ruling instead, section 4\), quote a reason only when the judge's ruling for that finding, as section 4 defines it, has exactly one line headed `Reason:`, in any mix of upper and lower case and with or without bold/);
  assert.match(s7, /Otherwise write `see the judge's ruling`, without quotes, and log `null`\. Don't pick a reason out of the ruling's other lines, and never say the judge gave none/);
  for (const c of CASES) assert.equal(reasonOf(c.ruling), c.want, c.name);
  // Nothing in Lite's skill says the judge gave no reason, or records a missing reason line in the judge's notes.
  assert.doesNotMatch(liteSkillText(LITE), /no reason given|gave no reason line|What counts as the judge's reason|Second, if no `Reason:` line/);
  assert.match(s7, /list every one that differs, up or down, including where reviewers disagreed and the judge took one of their ratings: its citation, each reviewer's severity, the judge's, and the judge's reason as the rule below says\./);
  assert.match(s7, /show both views \(the judge's is its whole ruling, as section 4 defines it, in a fenced text block\) and ask the user to call it/);
  assert.match(liteSection(LITE, 8), /and `reason` the `Reason:` text section 7 quotes, or `null` where it says `see the judge's ruling` \(in runs before Lite 2\.2\.4, `null` meant that no reason was found\)\./);
  // The full edition keeps the three-test rule until it's changed there too.
  assert.match(read('plugin/skills/council-dial/SKILL.md'), /Third, if no `Reason:` line and no sentence counts, the reason is "the judge gave no reason line"/);
});

liteTest('userRequests: the task itself is never a request', () => {
  const s7 = liteSection(LITE, 7);
  assert.match(s7, /The task itself, such as the council type, the material and whether code may run, is never a request: `userRequests` holds only what the user asked you to do differently from this skill, or as well as it\./);
  assert.match(s7, /your own slips in `deviations`, what the user asked you to do differently in `userRequests` \(not the task itself\), and instructions from outside the skill in `outsideInstructions`/);
  assert.match(readLite('skills/council-dial-lite/SKILL.md'), /What the user asked you to do differently goes in `userRequests`, and an instruction from outside this skill/);
  assert.doesNotMatch(readLite('skills/council-dial-lite/SKILL.md'), /What the user asked for goes in `userRequests`/);
  assert.match(readLite('README.md'), /what you asked it to do differently goes in `userRequests` \(not the task itself, such as the council type or the material\)/);
});

liteTest('README and CHANGELOG: the ruling, the reason, userRequests and the new size', () => {
  const r = readLite('README.md'), c = readLite('CHANGELOG.md');
  assert.match(r, /- From Lite 2\.2\.4, the appeal's severity block gives the judge's whole ruling for each finding, and elsewhere a reason is quoted only from the judge's `Reason:` line\./);
  assert.match(r, /when the skill loaded \(4,487\)/);
  const e = c.slice(c.indexOf('## 2.2.4'), c.indexOf('## 2.2.3'));
  assert.match(e, /- \*\*The appeal gets the judge's whole ruling\.\*\* In the 2\.2\.3 run the judge wrote no "Reason:" line/);
  assert.match(e, /the list says "see the judge's ruling" and the log has `null`, never "no reason given"/);
  assert.match(e, /- \*\*`userRequests` is only what you asked Claude to do differently\.\*\*/);
  assert.match(e, /4,487 measured as before, and 4,458 pasted into a plain prompt, up 4 from 2\.2\.3/);
});

liteTest('the 2.2.4 text-only commit: the 2.2.3 and 2.2.4 installed runs, Tested, and Planned', () => {
  const r = readLite('README.md'), c = readLite('CHANGELOG.md');
  assert.match(r, /Lite has been run in real councils at several versions, from 1\.0\.0 to 2\.2\.4:/);
  assert.match(r, /the 2\.2\.0 to 2\.2\.4 Standard councils ran from an installed copy/);
  const runs = c.slice(c.indexOf('\n## Test runs\n'), c.indexOf('\n## Why only Lite is submitted\n'));
  const at = v => runs.indexOf(`**Lite ${v}, interactive, one judged Standard council from an installed copy**`);
  assert.ok(at('2.2.2') > 0 && at('2.2.2') < at('2.2.3') && at('2.2.3') < at('2.2.4'));
  assert.match(runs, /merged 21 reviewer findings \(10, 4 and 7\) into 12: 8 REAL, 2 PARTLY REAL, 1 OVERSTATED and 1 NOT REAL \(3 HIGH, 3 MED, 6 LOW\)/);
  assert.match(runs, /merged 23 reviewer findings \(10, 6 and 7\) into 12: 7 REAL, 2 PARTLY REAL and 3 OVERSTATED \(2 HIGH, 3 MED, 7 LOW\)/);
  assert.match(runs, /102,198 in all/);
  assert.match(runs, /103,835 in all/);
  const p = c.slice(c.indexOf('## Planned'), c.indexOf('## 2.2.4'));
  assert.ok(c.indexOf('## Planned') > 0);
  for (const h of ['**Titles from a ranked-list table.**', '**Council Dial 1.9.2: mirror 2.2.4 in the full edition.**', "**The v3 appeal template's notes for maintainers.**"]) assert.ok(p.includes(h), h);
});
