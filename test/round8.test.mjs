// Tests for 1.3.1: the notes length limit and its warning, the saved-report header for every combine
// method, the README opening, and the version.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCommand, parseArgs as parseArgsV3, NOTES_MAX, PLUGIN_VERSION } from '../plugin/skills/council-dial/scripts/council.mjs';
// Written for brief version 2, which stays runnable: plan and estimate default to it in this file unless
// a test names a version (brief version 3 is tested in round15).
const parseArgs = argv => parseArgsV3(['plan', 'estimate'].includes(argv[0]) && !argv.includes('--brief-version') ? [...argv, '--brief-version', '2'] : argv);

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const made = [];
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'council-dial-r8-')); made.push(d); return d; };
after(() => { for (const d of made) fs.rmSync(d, { recursive: true, force: true }); });
const run = (p, argv, input = '') => runCommand({ ...parseArgs(argv), project: p }, input, new Date(), {});
const T = 'the diff of branch fix-parser';
const lastRow = p => JSON.parse(fs.readFileSync(path.join(p, 'reviews', 'review-log.jsonl'), 'utf8').trim().split('\n').pop());

test('notes longer than the limit are cut, and log and update say so', () => {
  assert.equal(NOTES_MAX, 400);
  const p = tmp();
  const a = run(p, ['plan', '--reviewers', 'generalist', '--combine', 'pooled'], T);
  const ok = run(p, ['log', '--run', a.runId], JSON.stringify({ findingsCombined: 0, notes: 'x'.repeat(NOTES_MAX) }));
  assert.equal(ok.warning, undefined, 'notes at the limit are kept whole, with no warning');
  assert.equal(lastRow(p).results.notes.length, NOTES_MAX);
  const long = run(p, ['log', '--run', a.runId], JSON.stringify({ findingsCombined: 0, notes: 'y'.repeat(NOTES_MAX + 50) }));
  assert.match(long.warning, /notes were cut to 400 characters \(they had 450\).*log --run .* again with shorter notes/);
  assert.equal(Array.from(lastRow(p).results.notes).length, NOTES_MAX);
  assert.ok(lastRow(p).results.notes.endsWith('…'));
  const u = run(p, ['update', '--run', a.runId], JSON.stringify({ fixesMade: 0, fixesFailedRecheck: 0, regressions: 0, newFindings: 0, notes: 'z'.repeat(NOTES_MAX + 1) }));
  assert.match(u.warning, /notes were cut to 400 characters \(they had 401\).*another update would add a second recheck/);
  assert.equal(run(p, ['update', '--run', a.runId], JSON.stringify({ fixesMade: 0, fixesFailedRecheck: 0, regressions: 0, newFindings: 0, notes: 'short' })).warning, undefined);
});

test('the saved-report header mentions the judge only for judged runs', () => {
  const p = tmp();
  const pooled = run(p, ['plan', '--reviewers', 'generalist', '--combine', 'pooled'], T);
  const saved = fs.readFileSync(path.join(p, run(p, ['report', '--run', pooled.runId, '--agent', 'reviewer 1'], '1. LOW: a typo').file), 'utf8');
  assert.match(saved, new RegExp(`such as ${pooled.runId}/2 for a reviewer's finding 2\.`));
  assert.ok(!/judge/.test(saved), 'no judge in a pooled run\'s header');
  const consensus = run(p, ['plan', '--reviewers', 'generalist', '--combine', 'consensus'], T);
  assert.ok(!/judge/.test(fs.readFileSync(path.join(p, run(p, ['report', '--run', consensus.runId, '--agent', 'reviewer 2'], '1. LOW: a typo').file), 'utf8')));
  const judged = run(p, ['plan', '--reviewers', 'generalist', '--combine', 'judged'], T);
  assert.match(fs.readFileSync(path.join(p, run(p, ['report', '--run', judged.runId, '--agent', 'judge'], 'M1. REAL').file), 'utf8'), /or .*\/M1 for the judge's finding M1\./);
});

test('docs: both READMEs open with a plain-English section and a quick start, and the notes limit is documented', () => {
  for (const f of ['README.md', 'plugin/README.md']) {
    const t = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const heads = t.split('\n').filter(l => l.startsWith('## ')).slice(0, 5);
    assert.deepEqual(heads, ['## What it is', '## Quick start', '## Overview', '## Two editions', '## Install'], f);
    assert.match(t, /It's a research tool\. It doesn't claim that any setup, including the judge and the appeal, works better than another/, f);
    assert.ok(!/(proven|shown) to (work|be) better/.test(t), `${f}: no claim that a setup is better`);
    assert.match(t, /up to 400 characters each; longer notes are cut/, f);
    for (const [, anchor] of t.matchAll(/\]\(#([a-z0-9-]+)\)/g)) {
      const ids = t.split('\n').filter(l => /^#{1,6} /.test(l)).map(l => l.replace(/^#+ /, '').toLowerCase().replace(/[^a-z0-9 -]/g, '').replace(/ /g, '-'));
      assert.ok(ids.includes(anchor), `${f}: the link #${anchor} has a heading`);
    }
  }
  const skill = fs.readFileSync(path.join(ROOT, 'plugin/skills/council-dial/SKILL.md'), 'utf8');
  assert.match(skill, /`notes`: one line, no secrets, at most 400 characters/);
  assert.match(skill, /`update` cuts longer notes and returns a `warning`/);
});

test('the version is 1.5.0 everywhere', () => {
  assert.equal(PLUGIN_VERSION, '1.5.0');
  assert.equal(JSON.parse(fs.readFileSync(path.join(ROOT, 'plugin/.claude-plugin/plugin.json'), 'utf8')).version, '1.5.0');
  assert.equal(JSON.parse(fs.readFileSync(path.join(ROOT, '.claude-plugin/marketplace.json'), 'utf8')).plugins[0].version, '1.5.0');
});
