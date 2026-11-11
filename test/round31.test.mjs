// Round 31: Lite 2.2.4. A read-back counts a difference only in spaces or tabs at the end of a line as a match,
// and records how many lines differed that way, because the Write tool drops them: in the 2.2.3 installed-copy
// run the correctness reviewer's reply had four lines of only spaces, the saved file had them empty, and the
// run stopped although nothing in the report had changed. The full edition saves reports with its script and
// has no read-back comparison, so only Lite changes.
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
const readLite = f => fs.readFileSync(path.join(LITE, f), 'utf8');

// The rule as section 4 writes it: line endings' style and the whitespace at the very end don't count; then the
// files must have the same lines, and two lines may differ only by spaces or tabs at their end, which are counted.
const compare = (saved, reply) => {
  const norm = s => s.replace(/\r\n/g, '\n').replace(/[ \t\r\n]+$/, '');
  const a = norm(saved).split('\n'), b = norm(reply).split('\n');
  if (a.length !== b.length) return { match: false };
  let n = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    if (a[i].replace(/[ \t]+$/, '') !== b[i].replace(/[ \t]+$/, '')) return { match: false };
    n++;
  }
  return { match: true, trailingWhitespaceLines: n };
};
const SP5 = ' '.repeat(5);
// The 2.2.3 run's shape: a nested list whose blank lines hold five spaces in the reply and nothing in the file.
const REPLY = [
  '1. **HIGH: `loadUsed` throws when the file is missing, but the README says it returns an empty list**',
  '   - **Evidence:**',
  "     - `slugify('Привет')`: becomes `''`.", SP5,
  "     - The comment's example happens to work.", SP5,
  '     - Characters that are illegal on Windows are kept.', SP5,
  '   - **Fix:** catch ENOENT.', SP5,
  '2. **LOW: a second finding**',
].join('\n') + '\n';
const SAVED = REPLY.split('\n').map(l => l.replace(/[ \t]+$/, '')).join('\n');
const CASES = [
  { name: 'the 2.2.3 run: four lines of only spaces saved empty', saved: SAVED, reply: REPLY, want: { match: true, trailingWhitespaceLines: 4 },
    clause: 'spaces and tabs at the end of a line, including a line of only spaces or tabs (the Write tool can drop them, and save such a line empty)' },
  { name: 'spaces after text, a tab after text and a line of only a tab', saved: 'A text\nB text\n\nend\n', reply: 'A text   \nB text\t\n\t\nend\n', want: { match: true, trailingWhitespaceLines: 3 },
    clause: '`trailingWhitespaceLines` counts the lines that differ only by spaces or tabs at their end, 0 if none' },
  { name: 'spaces in the file that the reply lacks count the same way', saved: 'a  \nb\n', reply: 'a\nb\n', want: { match: true, trailingWhitespaceLines: 1 },
    clause: 'three kinds of difference don\'t count, in the file or the reply:' },
  { name: 'whitespace at the very end and CRLF line endings are left out of the count', saved: 'a\r\nb\r\n\r\n', reply: 'a\nb   \n  ', want: { match: true, trailingWhitespaceLines: 0 },
    clause: "whitespace at the very end (spaces, tabs and line breaks after the last other character); and a line ending's style (CRLF or LF). Every other difference does" },
  { name: 'spaces lost at the start of a line stop the run', saved: '- x\n', reply: SP5 + '- x\n', want: { match: false },
    clause: 'spaces anywhere else in a line (at its start too)' },
  { name: 'a blank line missing stops the run', saved: 'a\nb\n', reply: 'a\n\nb\n', want: { match: false },
    clause: 'including a blank line missing or added' },
  { name: 'a line of only spaces missing altogether stops the run', saved: 'a\nb\n', reply: 'a\n' + SP5 + '\nb\n', want: { match: false },
    clause: 'including a blank line missing or added' },
  { name: 'spacing inside a line stops the run', saved: 'a b\n', reply: 'a  b\n', want: { match: false },
    clause: 'spaces anywhere else in a line (at its start too)' },
  { name: 'Markdown formatting stops the run', saved: 'x\n', reply: '**x**\n', want: { match: false },
    clause: 'and Markdown formatting.' },
];

liteTest('section 4: spaces or tabs at the end of a line don\'t count, and every other difference still does', () => {
  const s4 = liteSection(LITE, 4);
  for (const c of CASES) {
    assert.ok(s4.includes(c.clause), `${c.name}: ${c.clause}`);
    assert.deepEqual(compare(c.saved, c.reply), c.want, c.name);
  }
  assert.doesNotMatch(s4, /every other difference does, including blank lines, spacing and Markdown formatting anywhere else/);
  // The count is set with savedMatchesReply, from the read-back after saving (or the second one), and left null
  // when nothing was saved.
  assert.match(s4, /  3\. Set `savedMatchesReply` to `true` or `false`, and `trailingWhitespaceLines` to how many of its lines differed from the reply only by spaces or tabs at their end \(by the rule below\)\.\n  4\. If it's `false`, save it again once and read it back again, then set `savedMatchesReply` and `trailingWhitespaceLines` to that second result\. If it still differs, tell the user which report, and stop\./);
  assert.match(s4, /save nothing, leave `savedBy`, `savedMatchesReply` and `trailingWhitespaceLines` `null`, and count it as 0 findings\./);
  // Later re-reads, the check's reply and the raw hand-off compare by the same rule.
  assert.match(s4, /If any has changed since, don't carry on: tell the user which file changed, and stop\. Compare by the rule above\./);
  assert.match(liteSection(LITE, 6), /save its reply to `reports\/check\.txt` and read it back as section 4 says/);
  assert.match(liteSection(LITE, 10), /read every saved report again and compare it with its reply, as section 4 says/);
});

liteTest('run.json: every agent has trailingWhitespaceLines, null until its report is read back', () => {
  const p = readLite('skills/council-dial-lite/plan.md');
  assert.match(p, /"savedMatchesReply": null, "trailingWhitespaceLines": null, "tokens": null,/);
  assert.match(p, /keeps its entry with `started` set to `false` and `savedBy`, `savedMatchesReply`, `trailingWhitespaceLines`, `tokens`, `toolUses` and `durationMs` all `null`\./);
  assert.match(p, /with `trailingWhitespaceLines` the number of its lines that differed from the reply only by spaces or tabs at their end \(runs before Lite 2\.2\.4 don't have it\)\./);
});

liteTest('the report and the raw hand-off name every report whose count isn\'t 0', () => {
  assert.match(liteSection(LITE, 7), /5\. \*\*Saving:\*\* any report you couldn't save or whose read-back didn't match its reply, and any whose `trailingWhitespaceLines` isn't 0, with that number: those lines differed from the reply only by spaces or tabs at their end, which counts as a match \(section 4\)\./);
  assert.match(liteSection(LITE, 10), /any report that wasn't saved or changed after it was saved, and any whose `trailingWhitespaceLines` isn't 0, with that number;/);
});

// The check agent compares saved briefs with their templates character for character (apart from filled-in
// values). Saved briefs go through the Write tool, so no template line may end with a space or tab, in either
// edition. (The summary and the saved reports both go through Write, and findings are compared word for word.)
liteTest('no skill file in either edition ends a line with a space or tab', () => {
  const files = [];
  const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (p.endsWith('.md')) files.push(p); } };
  walk(path.join(LITE, 'skills/council-dial-lite'));
  walk(path.join(ROOT, 'plugin/skills/council-dial'));
  assert.ok(files.length > 15);
  for (const f of files) fs.readFileSync(f, 'utf8').split('\n').forEach((l, i) => assert.doesNotMatch(l, /[ \t]\r?$/, `${f}:${i + 1}`));
});

liteTest('README and CHANGELOG: 2.2.4 and the trailing spaces', () => {
  const r = readLite('README.md'), c = readLite('CHANGELOG.md');
  assert.match(r, /reads every saved report back to compare it with the reply \(spaces or tabs at the end of a line don't count, since the Write tool can drop them, but Claude records how many lines differed that way\)/);
  const tr = r.slice(r.indexOf('\n## Troubleshooting\n'), r.indexOf('\n## Support\n'));
  assert.match(tr, /- \*\*Claude stops because a saved report doesn't match its reply\.\*\* Its read-back differed from the reply twice, by more than spaces or tabs at the end of a line, which don't count from Lite 2\.2\.4/);
  assert.match(tr, /you can tell Claude to go on with the saved copy, which it logs as your request\.\n- \*\*A report or a count looks wrong\.\*\*/);
  assert.ok(c.indexOf('## 2.2.4') > 0 && c.indexOf('## 2.2.4') < c.indexOf('## 2.2.3'));
  const e = c.slice(c.indexOf('## 2.2.4'), c.indexOf('## 2.2.3'));
  assert.match(e, /From the 2\.2\.3 installed-copy test \(`lite-20261111-01`\):/);
  assert.match(e, /In Claude Code 2\.1\.322 the Write tool drops spaces and tabs at the end of every line, not only on lines that hold nothing else\./);
  assert.match(e, /The check agent's comparisons aren't affected/);
  assert.match(e, /Its labels end `\(Lite 2\.2\.4\)`\./);
});
