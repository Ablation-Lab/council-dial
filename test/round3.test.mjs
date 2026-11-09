// Tests for the fixes after the first real run on the sample: a neutral sample, no priming in the
// briefs, one way to count severity, compare building review-log.md, and the appeal step.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCommand, parseArgs as parseArgsV3, buildPlan, checkTarget, checkResults, readLog, runsFrom, compare, VERSION } from '../plugin/skills/council-dial/scripts/council.mjs';
// Written for brief version 2, which stays runnable: plan and estimate default to it in this file unless
// a test names a version (brief version 3 is tested in round15).
const parseArgs = argv => parseArgsV3(['plan', 'estimate'].includes(argv[0]) && !argv.includes('--brief-version') ? [...argv, '--brief-version', '2'] : argv);

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const made = [];
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'council-dial-r3-')); made.push(d); return d; };
after(() => { for (const d of made) fs.rmSync(d, { recursive: true, force: true }); });
const run = (p, argv, input = '') => runCommand({ ...parseArgs(argv), project: p }, input);
const jsonl = p => path.join(p, 'reviews', 'review-log.jsonl');
const T = 'the diff of branch fix-parser';
const filesIn = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? filesIn(path.join(d, e.name)) : [path.join(d, e.name)]));

test('the sample is neutral, its answers are kept out of samples/ (so they aren\'t copied with it), and every planted problem is still there', () => {
  const samples = path.join(ROOT, 'samples');
  assert.ok(!filesIn(samples).some(f => /expected-findings/i.test(f)), 'no answers inside samples/');
  for (const f of filesIn(path.join(samples, 'target'))) assert.doesNotThrow(() => checkTarget(fs.readFileSync(f, 'utf8')), f);
  const answers = fs.readFileSync(path.join(ROOT, 'sample-answers', 'expected-findings.md'), 'utf8');
  assert.equal(answers.split('\n').filter(l => /^\| \d \|/.test(l)).length, 9);
  const code = fs.readFileSync(path.join(samples, 'target', 'slugify.mjs'), 'utf8');
  for (const planted of ["s.replace(/[^a-z0-9]+/g, '-')", "s.replace(/^-|-$/, '')", 's = s.slice(0, maxLength)', 'slug = base, n = 1', "fs.writeFileSync(file + '.slugs', used.join('\\n'))", "return fs.readFileSync(file + '.slugs', 'utf8').split('\\n')"])
    assert.ok(code.includes(planted), planted);
  assert.match(fs.readFileSync(path.join(samples, 'target', 'README.md'), 'utf8'), /`file` is the blog name the user typed in/);
  for (const readme of ['README.md', 'plugin/README.md']) {
    const t = fs.readFileSync(path.join(ROOT, readme), 'utf8');
    assert.ok(t.includes('sample-answers/expected-findings.md') && !t.includes('samples/expected-findings.md'), readme);
  }
});

test('a target described as having planted or deliberate problems is refused, and nothing is logged', () => {
  for (const bad of ['the sample with planted bugs', 'slugify.mjs, which has deliberate bugs', 'a module with problems added on purpose', 'code with seeded defects', 'the known issues in parser.mjs', 'intentionally broken code with errors', 'target and its expected findings'])
    assert.throws(() => checkTarget(bad), /planted, deliberate or known problems/, bad);
  for (const ok of [T, 'samples/target: slugify.mjs and its README', 'the deliberate rate-limit retry code in src/retry.mjs', 'a made-up module for trying Council Dial'])
    assert.doesNotThrow(() => checkTarget(ok), ok);
  const p = tmp();
  assert.throws(() => run(p, ['plan', '--reviewers', 'specialised', '--combine', 'judged'], 'Council Dial sample target (made-up module with planted problems)'), /planted/);
  assert.ok(!fs.existsSync(jsonl(p)));
});

test('no brief of any type describes the target as having planted or deliberate problems', () => {
  const types = [['specialised', 'judged', '--debate', '--baseline'], ['generalist', 'pooled', '--sequential'], ['generalist', 'consensus', '--debate'], ['generalist', 'judged', '--n', '1']];
  for (const [rv, cb, ...extra] of types) {
    const plan = buildPlan(parseArgs(['plan', '--reviewers', rv, '--combine', cb, ...extra]), T);
    for (const s of plan.steps) {
      assert.doesNotThrow(() => checkTarget(s.how), `${plan.label} ${s.step} how`);
      for (const a of s.agents) assert.doesNotThrow(() => checkTarget(a.brief), `${plan.label} ${a.label}`);
    }
  }
});

test('severity counts every combined finding once, so it adds up to findingsCombined exactly', () => {
  const judge = buildPlan(parseArgs(['plan', '--reviewers', 'specialised', '--combine', 'judged']), T).steps.find(s => s.step === 'combine').agents[0].brief;
  assert.match(judge, /a NOT REAL one at the highest severity a reviewer gave it/);
  assert.match(judge, /three severity counts also add up to the merged count/);
  assert.match(judge, /For each NOT REAL one, give .* your reasons/);
  assert.throws(() => checkResults({ findingsCombined: 13, confirmed: 10, overstated: 2, dismissed: 1, verified: true, severity: { high: 2, med: 4, low: 6 } }), /add up to 12, not findingsCombined \(13\).*NOT REAL one at the highest severity/);
  assert.equal(checkResults({ findingsCombined: 13, confirmed: 10, overstated: 2, dismissed: 1, verified: true, severity: { high: 2, med: 5, low: 6 } }).severity.med, 5);
  assert.equal(checkResults({ findingsCombined: 4 }).severity.high, 0, 'severity left out is allowed');
});

test('compare builds review-log.md when a copied log has none, and points to it', () => {
  const p = tmp();
  fs.mkdirSync(path.join(p, 'reviews'));
  fs.copyFileSync(path.join(ROOT, 'samples', 'reviews', 'review-log.jsonl'), jsonl(p));
  const c = run(p, ['compare']);
  assert.equal(c.log, 'reviews/review-log.md');
  assert.match(fs.readFileSync(path.join(p, 'reviews', 'review-log.md'), 'utf8'), /\| specialised-3\/judged \| 2 \|/);
  assert.deepEqual(c.byType.map(g => g.label), ['generalist-3/pooled', 'specialised-3/judged', 'specialised-3/judged+baseline', 'specialised-3/judged+debate']);
  const empty = tmp();
  const e = run(empty, ['compare']);
  assert.equal(e.log, undefined, 'no log, no file to point to');
  assert.ok(!fs.existsSync(path.join(empty, 'reviews')), 'compare on a project with no log creates nothing');
});

test('appeal: on by default for judged councils, counted in the agents, off with --no-appeal, recorded in the type', () => {
  const plan = buildPlan(parseArgs(['plan', '--reviewers', 'specialised', '--combine', 'judged']), T);
  assert.equal(plan.type.appeal, true);
  assert.equal(plan.agentCount, 5);
  const step = plan.steps.find(s => s.step === 'appeal');
  assert.match(step.how, /only if it marked any finding NOT REAL/);
  assert.match(step.how, /Never give it the reviewers' reports, any other brief or the description of what to review/);
  assert.match(step.how, /let the user make the call/);
  assert.match(step.agents[0].brief, /WRONGLY DISMISSED.*\n.*FAIRLY DISMISSED.*\n.*UNSURE/);
  assert.match(step.agents[0].brief, /You don't overrule the judge; the user makes the call/);
  assert.ok(!step.agents[0].brief.includes(T));
  assert.deepEqual(plan.resultsTemplate.appeal, { ran: false, reviewed: 0, items: [] });
  const off = buildPlan(parseArgs(['plan', '--reviewers', 'specialised', '--combine', 'judged', '--no-appeal']), T);
  assert.equal(off.type.appeal, false);
  assert.equal(off.resultsTemplate.appeal, null);
  assert.ok(!off.steps.some(s => s.step === 'appeal'));
  for (const cb of ['pooled', 'consensus']) {
    assert.equal(buildPlan(parseArgs(['plan', '--reviewers', 'generalist', '--combine', cb]), T).type.appeal, false);
    assert.throws(() => parseArgs(['plan', '--reviewers', 'generalist', '--combine', cb, '--no-appeal']), /for judged councils/);
  }
  assert.throws(() => parseArgs(['compare', '--no-appeal']), /plan only/);
  const p = tmp();
  const a = run(p, ['plan', '--reviewers', 'specialised', '--combine', 'judged'], T);
  const row = JSON.parse(fs.readFileSync(jsonl(p), 'utf8').trim());
  assert.equal(row.type.appeal, true);
  assert.equal(row.version, 2);
  assert.equal(a.agentCount, 5);
});

test('appeal: each flagged finding and the user\'s call are logged and compared; bad appeal results are refused', () => {
  const p = tmp();
  const on = run(p, ['plan', '--reviewers', 'specialised', '--combine', 'judged'], T);
  const off = run(p, ['plan', '--reviewers', 'specialised', '--combine', 'judged', '--no-appeal'], T);
  const base = { findingsPerReviewer: [10, 5, 8], findingsCombined: 13, confirmed: 10, overstated: 2, dismissed: 1, verified: true, severity: { high: 2, med: 5, low: 6 }, wallMinutes: 4 };
  const appeal = { ran: true, reviewed: 1, items: [{ finding: 'Unchecked .slugs path from the blog name', view: 'wrongly dismissed', call: 'reinstated' }] };
  run(p, ['log', '--run', on.runId], JSON.stringify({ ...base, appeal }));
  assert.throws(() => run(p, ['log', '--run', off.runId], JSON.stringify({ ...base, appeal })), /without the appeal step/);
  run(p, ['log', '--run', off.runId], JSON.stringify(base));
  const bad = [
    [{ ran: false, reviewed: 1, items: [] }, /ran is false/],
    [{ ran: true, reviewed: 0, items: appeal.items }, /more entries than appeal.reviewed/],
    [{ ran: true, reviewed: 2, items: [] }, /more than dismissed/],
    [{ ran: true, reviewed: 1, items: [{ finding: 'x', view: 'real', call: 'pending' }] }, /view must be/],
    [{ ran: true, reviewed: 1, items: [{ finding: 'x', view: 'unsure', call: 'maybe' }] }, /call must be/],
    [{ ran: true, reviewed: 1, items: [{ finding: '  ', view: 'unsure', call: 'pending' }] }, /short title/],
    [[1], /must be an object/],
  ];
  for (const [ap, re] of bad) assert.throws(() => run(p, ['log', '--run', on.runId], JSON.stringify({ ...base, appeal: ap })), re, JSON.stringify(ap));
  const c = run(p, ['compare']).byType;
  assert.deepEqual(c.find(g => g.label === 'specialised-3/judged+appeal').appeal, { runs: 1, dismissedChecked: 1, flagged: 1, reinstated: 1, pending: 0 });
  assert.equal(c.find(g => g.label === 'specialised-3/judged').appeal, null);
  const md = fs.readFileSync(path.join(p, 'reviews', 'review-log.md'), 'utf8');
  assert.match(md, new RegExp(`\\| ${on.runId} \\|.*\\| 1 of 1 flagged, 1 reinstated \\|`));
  assert.match(md, /\| specialised-3\/judged\+appeal \|.*\| 1 of 1, 1 reinstated \|/);
  assert.ok(!md.includes('Unchecked .slugs path'), 'finding titles stay in the .jsonl, not the Markdown');
});

test('appeal: version 1 rows have no appeal, and an appeal flag on a non-judged row is ignored', () => {
  const runs = runsFrom(readLog(path.join(ROOT, 'samples', 'reviews', 'review-log.jsonl')));
  assert.ok(runs.every(r => r.type.appeal === false && r.version === 1));
  const p = tmp();
  fs.mkdirSync(path.join(p, 'reviews'));
  fs.writeFileSync(jsonl(p), JSON.stringify({ kind: 'planned', runId: '20261107-abcd', version: 2, time: '2026-11-07T10:00:00Z', target: 'x', type: { reviewers: 'generalist', n: 3, combine: 'pooled', appeal: true } }) + '\n');
  assert.deepEqual(compare(runsFrom(readLog(jsonl(p)))).map(g => g.label), ['generalist-3/pooled']);
});
