// Tests for 1.3.2: notes that aren't text, a read-back role with a comma, the README opening's
// examples, the [1m] example id, the SKILL notes bullet, and the plugin descriptions.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCommand, parseArgs, readLog, runsFrom } from '../plugin/skills/council-dial/scripts/council.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const made = [];
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'council-dial-r9-')); made.push(d); return d; };
after(() => { for (const d of made) fs.rmSync(d, { recursive: true, force: true }); });
const run = (p, argv, input = '') => runCommand({ ...parseArgs(argv), project: p }, input, new Date(), {});
const jsonl = p => path.join(p, 'reviews', 'review-log.jsonl');
const writeLog = (p, rows) => { fs.mkdirSync(path.join(p, 'reviews'), { recursive: true }); fs.writeFileSync(jsonl(p), rows.map(r => JSON.stringify(r)).join('\n') + '\n'); };
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const T = 'the diff of branch fix-parser';
const RECHECK = { fixesMade: 1, fixesFailedRecheck: 0, regressions: 0, newFindings: 0 };

test('notes that aren\'t text are refused when logged, and read back from a log as no notes', () => {
  const p = tmp();
  const a = run(p, ['plan', '--reviewers', 'generalist', '--combine', 'pooled'], T);
  for (const notes of [{ a: 1 }, ['x'], 5, true]) assert.throws(() => run(p, ['log', '--run', a.runId], JSON.stringify({ findingsCombined: 0, notes })), /notes must be a line of text/);
  run(p, ['log', '--run', a.runId], JSON.stringify({ findingsCombined: 0, notes: null }));
  assert.throws(() => run(p, ['update', '--run', a.runId], JSON.stringify({ ...RECHECK, notes: { a: 1 } })), /notes must be a line of text/);
  run(p, ['update', '--run', a.runId], JSON.stringify(RECHECK));
  // A row written by hand with an object for notes is still read, with no notes.
  const q = tmp();
  writeLog(q, [
    { kind: 'planned', runId: '20261108-0001', version: 2, time: '2026-11-08T10:00:00Z', target: 'x', type: { reviewers: 'generalist', n: 3, combine: 'pooled' } },
    { kind: 'results', runId: '20261108-0001', time: '2026-11-08T10:00:00Z', results: { findingsCombined: 1, notes: { a: 1 } } },
    { kind: 'update', runId: '20261108-0001', time: '2026-11-08T10:00:00Z', update: { ...RECHECK, notes: { b: 2 } } },
  ]);
  const [r] = runsFrom(readLog(jsonl(q)));
  assert.equal(r.results.notes, '');
  assert.equal(r.updates[0].notes, '');
  run(q, ['compare']);
  assert.ok(!fs.readFileSync(jsonl(q).replace('.jsonl', '.md'), 'utf8').includes('[object Object]'));
});

test('a read-back role with a comma is dropped, so its row is skipped rather than relabelled', () => {
  const q = tmp();
  const planned = (runId, roles) => ({ kind: 'planned', runId, version: 2, time: '2026-11-08T10:00:00Z', target: 'x', type: { reviewers: 'specialised', n: 2, roles, combine: 'pooled' } });
  writeLog(q, [planned('20261108-0001', ['a, b', 'c']), planned('20261108-0002', ['a', 'c'])]);
  const rows = readLog(jsonl(q));
  assert.equal(rows.skipped, 1);
  assert.deepEqual(runsFrom(rows).map(r => r.runId), ['20261108-0002']);
  assert.throws(() => run(q, ['setup', '--run', '20261108-0001']), /no planned run/);
  assert.match(run(q, ['setup', '--run', '20261108-0002']).rerun, /--roles 'a, c'/);
  assert.equal(run(q, ['list']).skippedLogLines, 1);
});

test('docs: the opening\'s examples stay within one combine method, the quick start doesn\'t promise a first estimate, and the [1m] example matches the docs', () => {
  for (const f of ['README.md', 'plugin/README.md']) {
    const t = read(f);
    assert.match(t, /whether specialised reviewers find more than generalists, or whether a debate round is worth the extra tokens/, f);
    assert.ok(!/whether a judge is worth/.test(t), f);
    assert.match(t, /Once you have logged runs of that type, it also gives a rough token estimate from them; until then it has none, and suggests a smaller trial run first/, f);
    assert.match(t, /claude-opus-4-6\[1m\]/, f);
  }
  const skill = read('plugin/skills/council-dial/SKILL.md');
  for (const t of [read('README.md'), read('plugin/README.md'), skill]) assert.ok(!/claude-opus-5-5\[1m\]/.test(t), 'no Claude 5 id with the [1m] suffix as an example');
  assert.match(skill, /`notes`: one line, no secrets, at most 400 characters; cite a finding with the run id and the number its report gives it, such as `<run id>\/2` for a reviewer's finding 2, or `<run id>\/M<n>` for the judge's finding in a judged run\./);
});

test('the plugin description is the same in plugin.json and the marketplace, and uses the kept wording', () => {
  const a = JSON.parse(read('plugin/.claude-plugin/plugin.json')).description;
  const b = JSON.parse(read('.claude-plugin/marketplace.json')).plugins[0].description;
  assert.equal(a, b);
  assert.match(a, /\(findings, kept and dismissed, fixes that later failed\)/);
  assert.ok(!/confirmed/.test(a));
  assert.match(a, /writes only the review log and the agents' saved reports/);
});
