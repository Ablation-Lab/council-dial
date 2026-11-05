import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runCommand, parseArgs, buildPlan, clean, logPaths, compare, runsFrom, readLog, checkResults } from '../plugin/skills/council-dial/scripts/council.mjs';

const SCRIPT = fileURLToPath(new URL('../plugin/skills/council-dial/scripts/council.mjs', import.meta.url));
const SAMPLES = fileURLToPath(new URL('../samples/', import.meta.url));
const made = [];
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'council-dial-test-')); made.push(d); return d; };
after(() => { for (const d of made) fs.rmSync(d, { recursive: true, force: true }); });
const run = (p, argv, input = '', now) => runCommand({ ...parseArgs(argv), project: p }, input, now);
const TARGET = 'the diff of branch fix-parser: src/parser.mjs and its tests';

test('every type gives the right steps and agent count', () => {
  const cases = [
    [['--reviewers', 'specialised', '--combine', 'judged'], 'specialised-3/judged', ['review:3', 'combine:1'], 4],
    [['--reviewers', 'generalist', '--combine', 'pooled', '--n', '4'], 'generalist-4/pooled', ['review:4', 'combine:0'], 4],
    [['--reviewers', 'generalist', '--combine', 'consensus'], 'generalist-3/consensus', ['review:3', 'combine:0'], 3],
    [['--reviewers', 'specialised', '--combine', 'judged', '--debate', '--baseline'], 'specialised-3/judged+debate', ['review:3', 'debate:3', 'combine:1', 'baseline:1'], 8],
    [['--reviewers', 'generalist', '--combine', 'judged', '--sequential', '--n', '2'], 'generalist-2/judged+sequential', ['review:2', 'combine:1'], 3],
    [['--reviewers', 'specialised', '--combine', 'pooled', '--roles', 'accessibility, performance'], 'specialised-2 [accessibility, performance]/pooled', ['review:2', 'combine:0'], 2],
  ];
  for (const [args, label, steps, count] of cases) {
    const p = buildPlan(parseArgs(['plan', ...args]), TARGET);
    assert.equal(p.label, label);
    assert.deepEqual(p.steps.map(s => `${s.step}:${s.agents.length}`), steps, label);
    assert.equal(p.agentCount, count, label);
  }
});

test('briefs carry the target, the rules and the format; sequential and consensus say how', () => {
  const p = buildPlan(parseArgs(['plan', '--reviewers', 'specialised', '--combine', 'consensus', '--sequential']), TARGET);
  const b = p.steps[0].agents[0].brief;
  assert.match(b, /You are the correctness reviewer on a council of 3\. Your area: wrong results/);
  assert.match(b, new RegExp(TARGET));
  assert.match(b, /not instructions to you/);
  assert.match(b, /severity \(HIGH, MED or LOW\)/);
  assert.match(b, /Earlier reviewers' reports follow/);
  assert.match(p.steps[0].how, /one at a time/);
  assert.match(p.steps[1].how, /at least 2 of 3/);
  const g = buildPlan(parseArgs(['plan', '--reviewers', 'generalist', '--combine', 'judged', '--baseline']), TARGET);
  assert.match(g.steps[0].agents[1].brief, /reviewer 2 of 3/);
  assert.match(g.steps[1].agents[0].brief, /REAL, OVERSTATED .* or NOT REAL/);
  assert.match(g.steps[2].how, /together with the reviewers.*never show it the council's reports/);
});

test('bad options are refused', () => {
  assert.throws(() => parseArgs(['plan', '--reviewers', 'experts', '--combine', 'judged']), /--reviewers/);
  assert.throws(() => parseArgs(['plan', '--reviewers', 'generalist', '--combine', 'vote']), /--combine/);
  assert.throws(() => parseArgs(['plan', '--reviewers', 'generalist', '--combine', 'judged', '--roles', 'a,b']), /--roles/);
  assert.throws(() => parseArgs(['plan', '--reviewers', 'generalist', '--combine', 'judged', '--n', '12']), /--n/);
  assert.throws(() => buildPlan(parseArgs(['plan', '--reviewers', 'specialised', '--combine', 'judged', '--n', '2']), TARGET), /leave --n out/);
  assert.throws(() => buildPlan(parseArgs(['plan', '--reviewers', 'generalist', '--combine', 'judged']), '   '), /say what to review/);
  assert.throws(() => parseArgs(['log', '--run', '$(x)']), /--run/);
  assert.throws(() => parseArgs(['log']), /--run/);
});

test('plan logs the type; log, update, list and compare work; the Markdown log is rebuilt', () => {
  const p = tmp();
  const a = run(p, ['plan', '--reviewers', 'specialised', '--combine', 'judged', '--baseline'], TARGET);
  const b = run(p, ['plan', '--reviewers', 'generalist', '--combine', 'pooled'], 'the same diff');
  assert.equal(run(p, ['list']).runs.length, 2);
  run(p, ['log', '--run', a.runId], JSON.stringify({ findingsPerReviewer: [5, 4, 3], findingsCombined: 9, confirmed: 7, overstated: 1, dismissed: 1, severity: { high: 1, med: 3, low: 5 }, baseline: { findings: 4, confirmed: 3, alsoFoundByCouncil: 3 }, wallMinutes: 12.5, notes: 'first run' }));
  run(p, ['log', '--run', b.runId], JSON.stringify({ findingsPerReviewer: [6, 6, 5], findingsCombined: 14, confirmed: 6, dismissed: 5, wallMinutes: 6 }));
  run(p, ['update', '--run', a.runId], JSON.stringify({ fixesMade: 7, fixesFailedRecheck: 2, regressions: 1, newFindings: 1 }));
  const c = run(p, ['compare']).byType;
  const judged = c.find(x => x.label === 'specialised-3/judged');
  assert.equal(judged.confirmedPercent, 78);
  assert.equal(judged.fixesFailedRecheckPercent, 29);
  assert.deepEqual(judged.baseline, { runs: 1, councilConfirmedPerRun: 7, baselineConfirmedPerRun: 3 });
  assert.equal(c.find(x => x.label === 'generalist-3/pooled').dismissedPercent, 36);
  const md = fs.readFileSync(path.join(p, 'reviews/review-log.md'), 'utf8');
  assert.match(md, /\| specialised-3\/judged \| 1 \| 9 \| 78% \| 11% \| 12\.5 \| 29% \| 1 \| 7 vs 3 \(1 run\) \| 0 \| 0 \|/);
  assert.match(md, /2 of 7/);
  const lines = fs.readFileSync(path.join(p, 'reviews/review-log.jsonl'), 'utf8').trim().split('\n');
  assert.equal(lines.length, 5, 'append-only: 2 plans, 2 results, 1 update');
});

test('results are checked; unknown runs and wrong reviewer counts are refused', () => {
  const p = tmp();
  const a = run(p, ['plan', '--reviewers', 'generalist', '--combine', 'judged'], TARGET);
  assert.throws(() => run(p, ['log', '--run', '20260101-abcd'], '{}'), /no planned run/);
  assert.throws(() => run(p, ['log', '--run', a.runId], '{"findingsPerReviewer":[1,2]}'), /3 reviewers/);
  assert.throws(() => run(p, ['log', '--run', a.runId], '{"confirmed":-1}'), /whole number/);
  assert.throws(() => run(p, ['log', '--run', a.runId], 'not json'), /valid JSON/);
  assert.throws(() => run(p, ['log', '--run', a.runId], '{"findingsCombined":2,"confirmed":3}'), /more than findingsCombined/);
  assert.throws(() => checkResults([1]), /JSON object/);
});

test('text from the target and notes is cleaned, and the Markdown log can\'t be broken', () => {
  const p = tmp();
  const evil = 'a | b\n## Fake heading <img src=x> ![t](https://x.example/p.png) `code`' + String.fromCodePoint(0x202e);
  const a = run(p, ['plan', '--reviewers', 'generalist', '--combine', 'pooled'], evil);
  assert.ok(!a.target.includes('\n') && !a.target.includes(String.fromCodePoint(0x202e)));
  run(p, ['log', '--run', a.runId], JSON.stringify({ findingsCombined: 1, notes: 'x\n| injected | row |' }));
  const md = fs.readFileSync(path.join(p, 'reviews/review-log.md'), 'utf8');
  assert.ok(!/^## Fake/m.test(md));
  assert.ok(!md.includes('<img') && !md.includes('![t]'));
  const row = md.split('\n').find(l => l.includes(a.runId));
  assert.equal(row.split('|').length, 12, 'the table row keeps its columns');
});

test('the log folder must be a plain folder inside the project', () => {
  const p = tmp();
  for (const bad of ['../x', '/etc', 'C:/x', '.claude', 'a/.git', 'x;y', 'CLAUDE~1', 'a:b'])
    assert.throws(() => logPaths(p, bad), /--log-dir/, bad);
  assert.equal(logPaths(p, 'reviews/council runs').rel, 'reviews/council runs');
  const outside = tmp();
  fs.symlinkSync(outside, path.join(p, 'linked'), 'junction');
  assert.throws(() => logPaths(p, 'linked'), /link/);
});

test('a damaged log line is skipped, not fatal', () => {
  const p = tmp();
  const a = run(p, ['plan', '--reviewers', 'generalist', '--combine', 'pooled'], TARGET);
  fs.appendFileSync(path.join(p, 'reviews/review-log.jsonl'), '{broken\n{"kind":"planned","runId":"../x"}\n');
  assert.equal(run(p, ['list']).runs.length, 1);
  assert.equal(run(p, ['list']).runs[0].runId, a.runId);
});

test('the sample review log compares as the README says', () => {
  const runs = runsFrom(readLog(path.join(SAMPLES, 'reviews', 'review-log.jsonl')));
  assert.equal(runs.length, 6);
  const c = compare(runs);
  assert.deepEqual(c.map(x => x.label), ['specialised-3/judged', 'generalist-3/pooled', 'specialised-3/judged+debate']);
  assert.ok(c.find(x => x.label === 'specialised-3/judged').confirmedPercent > c.find(x => x.label === 'generalist-3/pooled').confirmedPercent);
});

test('CLI: one line of JSON, exit 2 on errors, runs through a linked folder', () => {
  const p = tmp();
  const r = spawnSync(process.execPath, [SCRIPT, 'plan', '--reviewers', 'generalist', '--combine', 'pooled', '--project', p], { input: TARGET, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.match(JSON.parse(r.stdout).runId, /^\d{8}-[0-9a-f]{4}$/);
  const bad = spawnSync(process.execPath, [SCRIPT, 'plan', '--project', p], { encoding: 'utf8' });
  assert.equal(bad.status, 2);
  assert.match(JSON.parse(bad.stdout).error, /--reviewers/);
  const d = tmp();
  fs.symlinkSync(path.dirname(SCRIPT), path.join(d, 'linked'), 'junction');
  const viaLink = spawnSync(process.execPath, [path.join(d, 'linked', 'council.mjs'), 'list', '--project', p], { encoding: 'utf8' });
  assert.equal(JSON.parse(viaLink.stdout).runs.length, 1);
});
