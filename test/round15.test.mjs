// Tests for 1.5.0, from the three appeal stress-test runs (20261108-b36c Opus, 75d7 Sonnet, 3fe1 Haiku):
// brief version 3 (the judge can raise a severity, with five rulings; the appeal checks severities too;
// running anything is forbidden unless allowed), enforced by a read-only agent; version 2 still runnable
// and compared apart; the effort a seat gets from the settings files, read-only, with the user's file
// opt-in. Every plan here reads only scratch settings folders, never this machine's.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runCommand, parseArgs, VERSION, BRIEF_VERSIONS, BRIEF_SHA256, BRIEF_SHA256_V3, BRIEF_V3_FILES, briefDigest, COUNT_RULE_V3, checkResults, effortSettingsOf, savedEffortOf, expectedEffortOf, seatModelId, defaultEffortOf, READER_AGENT, readLog } from '../plugin/skills/council-dial/scripts/council.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SKILL = path.join(ROOT, 'plugin/skills/council-dial');
const SCRIPT = path.join(SKILL, 'scripts/council.mjs');
const made = [];
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'council-dial-r15-')); made.push(d); return d; };
after(() => { for (const d of made) fs.rmSync(d, { recursive: true, force: true }); });
const NO_MANAGED = tmp();
const run = (p, argv, input = '', env = {}, extra = {}) => runCommand({ ...parseArgs(argv), project: p, managedSettingsDir: NO_MANAGED, ...extra }, input, new Date(), env);
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const T = 'shelfkeep.py, scripts/tidy.sh and README.md';
const STD = ['--reviewers', 'specialised', '--combine', 'judged', '--main-model', 'claude-opus-5-5'];
const plan = (extra = [], env = {}, p = tmp(), o = {}) => run(p, ['plan', ...STD, ...extra], T, env, o);
const write = (dir, rel, obj) => { const f = path.join(dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, typeof obj === 'string' ? obj : JSON.stringify(obj)); return f; };
// Like the script: split on '## ' headings, and take the text block under each, so a heading in the notes with
// no text block of its own (such as 'Version 2 vs version 3') isn't mistaken for one.
const sectionsOf = text => Object.fromEntries(text.replace(/\r\n?/g, '\n').split(/^## /m).slice(1).map(part => {
  const nl = part.indexOf('\n');
  const m = nl < 0 ? null : part.slice(nl + 1).match(/^```text\n([\s\S]*?)\n```$/m);
  return m ? [part.slice(0, nl).trim(), m[1]] : null;
}).filter(Boolean));
const lastResults = p => JSON.parse(fs.readFileSync(path.join(p, 'reviews/review-log.jsonl'), 'utf8').trim().split('\n').pop()).results;

// ---- Brief version 3, and version 2 kept.
test('plan writes brief version 3 by default, takes --brief-version 2, and refuses any other', () => {
  assert.equal(VERSION, 3);
  assert.deepEqual(BRIEF_VERSIONS, [2, 3]);
  assert.equal(plan().version, 3);
  assert.equal(plan(['--brief-version', '2']).version, 2);
  assert.throws(() => parseArgs(['plan', ...STD, '--brief-version', '4']), /--brief-version must be 2 or 3/);
  assert.throws(() => parseArgs(['list', '--brief-version', '2']), /are for estimate and plan only/);
});

test('version 3 templates are briefs/v3/shared.md, judge.md and appeal.md, with their own digest; the rest are version 2\'s', () => {
  assert.deepEqual(BRIEF_V3_FILES, ['shared', 'judge', 'appeal']);
  assert.deepEqual(fs.readdirSync(path.join(SKILL, 'briefs/v3')).sort(), ['appeal.md', 'judge.md', 'shared.md']);
  const texts = { 2: {}, 3: {} };
  for (const n of ['shared', 'reviewer', 'debate', 'judge', 'appeal', 'baseline']) {
    texts[2][n] = sectionsOf(fs.readFileSync(path.join(SKILL, 'briefs', `${n}.md`), 'utf8'));
    texts[3][n] = BRIEF_V3_FILES.includes(n) ? sectionsOf(fs.readFileSync(path.join(SKILL, 'briefs/v3', `${n}.md`), 'utf8')) : texts[2][n];
  }
  assert.equal(briefDigest(texts[2]), BRIEF_SHA256);
  assert.equal(briefDigest(texts[3]), BRIEF_SHA256_V3);
  assert.notEqual(BRIEF_SHA256, BRIEF_SHA256_V3);
  // Version 3 changes only the third rule in shared.md; the format, the target line and the focus texts are version 2's.
  for (const k of ['format', 'what-to-review', 'focus: correctness', 'focus: security and privacy', 'focus: docs and policy accuracy']) assert.equal(texts[3].shared[k], texts[2].shared[k], k);
  const r2 = texts[2].shared.rules.split('\n'), r3 = texts[3].shared.rules.split('\n');
  assert.deepEqual(r3.filter((l, i) => l !== r2[i]), [r3[3]]);
  assert.deepEqual([texts[3].judge.reports, texts[3].judge['reports-after-debate']], [texts[2].judge.reports, texts[2].judge['reports-after-debate']]);
});

test('every version 3 brief says nothing runs unless the user allowed running code, not even scratch checks or shell commands', () => {
  const pl = plan(['--debate', '--baseline']);
  const rule = '- Run nothing unless the user allowed running code, as the lines after this brief say: no code from the material, no scripts or one-off checks of your own (even in a scratch folder), no tests and no shell commands. Read and search the files instead; that is enough. If the user allowed running code, you may run the material\'s code, its tests and checks of your own.';
  for (const a of pl.steps.flatMap(s => s.agents)) {
    assert.ok(a.brief.includes(rule), a.label);
    assert.ok(!a.brief.includes("Don't run code from the material unless your brief says the user allowed it"), a.label);
  }
  // Version 2 briefs keep version 2's rule.
  for (const a of plan(['--brief-version', '2']).steps.flatMap(s => s.agents)) assert.ok(a.brief.includes("- Don't run code from the material unless your brief says the user allowed it; reading it is enough."), a.label);
});

test('the version 3 judge numbers M1, M2, sets severity itself, and has five rulings, each change with severities and a reason', () => {
  const j = plan().steps.find(s => s.step === 'combine').agents[0].brief;
  assert.match(j, /Number the merged findings M1, M2 and so on, and for each one name the reports it came from, with the severity each gave it\./);
  assert.match(j, /decide its severity from the evidence, not from how many reviewers raised it or how they rated it\. Then give it exactly one ruling, comparing your severity with the highest severity a reviewer gave it:/);
  for (const r of ['- REAL: the claim holds, at that severity.', "- PARTLY REAL: part of the claim doesn't hold, but the severity stays the same. Say which part doesn't hold.", '- OVERSTATED: real, but less serious than that: your severity is lower.', '- UNDERSTATED: real, but more serious than that: your severity is higher.', "- NOT REAL: the problem isn't there."]) assert.ok(j.includes(r), r);
  assert.match(j, /For OVERSTATED and UNDERSTATED, give each reviewer's severity, your severity and your reason in one line, and say which part of the claim doesn't hold, if any\./);
  assert.match(j, /Give a final ranked list of every merged finding that isn't NOT REAL: its number, severity, ruling, title, file and line, and a one-line fix\./);
  assert.match(j, /how many are REAL, PARTLY REAL, OVERSTATED, UNDERSTATED and NOT REAL \(these five add up to the merged count\)/);
  assert.ok(j.includes(`where you ${COUNT_RULE_V3.replace('the severity the judge set', 'the severity you set')}, so the three severity counts`));
});

test('the version 3 appeal checks dismissals and severities, in two blocks, and never sees a model or effort', () => {
  const pl = plan(['--seat-model', 'reviewers=sonnet; judge=haiku', '--seat-effort', 'appeal=max']);
  const ap = pl.steps.find(s => s.step === 'appeal');
  assert.match(ap.agents[0].brief, /a <dismissed> block holds the findings it marked NOT REAL, each with the judge's reasons, and a <severity> block holds findings whose severity it set, each with the reviewers' severities, the judge's severity and the judge's reason/);
  for (const v of ['- SEVERITY FAIR: the judge\'s severity holds. Say why in one line.', '- TOO LOW or TOO HIGH: give the severity you would set (HIGH, MED or LOW) and the evidence.']) assert.ok(ap.agents[0].brief.includes(v), v);
  assert.match(ap.agents[0].brief, /and severity findings you checked, and how many are SEVERITY FAIR, TOO LOW, TOO HIGH and UNSURE\. No other text\./);
  assert.match(ap.how, /every OVERSTATED or UNDERSTATED finding, and every other finding kept at LOW/);
  assert.match(ap.how, /Never give it the reviewers' reports, any other brief, the description of what to review, or any model or effort/);
  for (const st of pl.steps) for (const a of st.agents) assert.doesNotMatch(a.brief, /sonnet|haiku|fable|opus|claude-|xhigh/i, a.label);
});

test('version 3 types are named with v3, so estimate and compare never mix them with version 2', () => {
  const p = tmp();
  const a = run(p, ['plan', ...STD], T), b = run(p, ['plan', ...STD, '--brief-version', '2'], T);
  assert.equal(a.label, 'specialised-3/judged+appeal v3 @claude-opus-5-5');
  assert.equal(b.label, 'specialised-3/judged+appeal @claude-opus-5-5');
  assert.equal(run(p, ['estimate', ...STD]).label, a.label);
  assert.equal(run(p, ['estimate', ...STD, '--brief-version', '2']).label, b.label);
  assert.deepEqual(run(p, ['compare']).byType.map(g => g.label).sort(), [b.label, a.label].sort());
  const rows = readLog(path.join(p, 'reviews/review-log.jsonl'));
  assert.deepEqual(rows.map(r => [r.version, r.label]), [[3, a.label], [2, b.label]]);
  // setup's rerun gives --brief-version only for version 2.
  assert.doesNotMatch(run(p, ['setup', '--run', a.runId]).rerun, /--brief-version/);
  assert.match(run(p, ['setup', '--run', b.runId]).rerun, /--brief-version '2'/);
});

test('a missing or changed version 3 template stops plan; version 2 still plans from briefs/ alone', () => {
  const copy = tmp();
  fs.cpSync(SKILL, path.join(copy, 'council-dial'), { recursive: true });
  const cli = (args, input = T) => JSON.parse(spawnSync(process.execPath, [path.join(copy, 'council-dial/scripts/council.mjs'), ...args], { input, encoding: 'utf8' }).stdout);
  const p = tmp();
  fs.rmSync(path.join(copy, 'council-dial/briefs/v3/judge.md'));
  assert.match(cli(['plan', ...STD, '--project', p]).error, /brief template briefs\/v3\/judge\.md can't be read/);
  assert.equal(cli(['plan', ...STD, '--brief-version', '2', '--project', p]).version, 2);
  fs.copyFileSync(path.join(SKILL, 'briefs/v3/judge.md'), path.join(copy, 'council-dial/briefs/v3/judge.md'));
  const sh = path.join(copy, 'council-dial/briefs/v3/shared.md');
  fs.writeFileSync(sh, fs.readFileSync(sh, 'utf8').replace('no tests and no shell commands', 'no tests'));
  assert.match(cli(['plan', ...STD, '--project', tmp()]).error, /wouldn't match brief version 3/);
});

// ---- Running code, enforced with the read-only agent.
test('version 3 agents are the read-only agent unless running code is allowed; version 2 agents stay general-purpose', () => {
  assert.equal(READER_AGENT, 'council-dial:council-reader');
  const def = plan(['--debate', '--baseline']);
  assert.equal(def.runningCode, 'not allowed'); assert.equal(def.toolLimits, true); assert.equal(def.agentType, READER_AGENT);
  assert.ok(def.steps.flatMap(s => s.agents).every(a => a.agentType === READER_AGENT));
  const allowed = plan(['--allow-running-code']);
  assert.equal(allowed.runningCode, 'allowed'); assert.equal(allowed.toolLimits, false);
  assert.ok(allowed.steps.flatMap(s => s.agents).every(a => a.agentType === 'general-purpose'));
  assert.equal(allowed.label, plan().label.replace(' v3', '+running-code v3'), 'running code allowed is marked in the type');
  const v2 = plan(['--brief-version', '2']);
  assert.equal(v2.toolLimits, false);
  assert.ok(v2.steps.flatMap(s => s.agents).every(a => a.agentType === 'general-purpose'));
  // Recorded in the planned row, and in setup's rerun command.
  const p = tmp();
  const pl = run(p, ['plan', ...STD, '--allow-running-code'], T);
  const row = JSON.parse(fs.readFileSync(path.join(p, 'reviews/review-log.jsonl'), 'utf8').trim());
  assert.equal(row.runningCode, 'allowed'); assert.equal(row.toolLimits, false);
  // setup never carries permission to run code over to a rerun; it says the user must give it again.
  const s = run(p, ['setup', '--run', pl.runId]);
  assert.doesNotMatch(s.rerun, /--allow-running-code/);
  assert.ok(s.notes.some(n => /allowed running code/.test(n) && /says again, for this run/.test(n)));
});

test('the plugin ships the read-only agent with only Read, Grep and Glob', () => {
  const f = read('plugin/agents/council-reader.md');
  const front = f.match(/^---\n([\s\S]*?)\n---\n/)[1];
  assert.match(front, /^name: council-reader$/m);
  assert.match(front, /^tools: Read, Grep, Glob$/m);
  assert.doesNotMatch(front, /^(model|effort|permissionMode|hooks|mcpServers|disallowedTools):/m);
  assert.match(front, /^description: .*Don't use it for anything else\.$/m);
  assert.equal(JSON.parse(read('plugin/.claude-plugin/plugin.json')).name + ':council-reader', READER_AGENT);
});

// ---- Results: the new rulings and the severity appeal.
const res3 = (extra = {}) => ({ findingsPerReviewer: [3, 2, 1], findingsCombined: 5, confirmed: 1, partlyReal: 1, overstated: 1, understated: 1, dismissed: 1, verified: true, severity: { high: 2, med: 1, low: 2 }, wallMinutes: null, notes: '', ...extra });
test('version 3 results count PARTLY REAL and UNDERSTATED; version 2 refuses them', () => {
  const r = checkResults(res3(), true, 3);
  assert.equal(r.partlyReal, 1); assert.equal(r.understated, 1);
  assert.throws(() => checkResults(res3({ confirmed: 2, verified: false }), true, 3), /confirmed \+ partlyReal \+ overstated \+ understated \+ dismissed is more than findingsCombined/);
  assert.throws(() => checkResults(res3({ verified: true, confirmed: 0 }), true, 3), /confirmed \+ partlyReal \+ overstated \+ understated \+ dismissed don't add up/);
  assert.throws(() => checkResults(res3({ severity: { high: 1, med: 1, low: 1 } }), true, 3), new RegExp(COUNT_RULE_V3.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.throws(() => checkResults(res3(), true, 2), /brief version 2 has no PARTLY REAL or UNDERSTATED rulings/);
  // Rows from before 1.5.0 read back with both at 0.
  const old = checkResults({ findingsPerReviewer: [1], findingsCombined: 1, confirmed: 1, overstated: 0, dismissed: 0, severity: { high: 1, med: 0, low: 0 } }, false);
  assert.equal(old.partlyReal, 0); assert.equal(old.understated, 0);
});

const item = (x = {}) => ({ finding: 'r/M4: overwrite guard', reviewers: ['LOW'], judge: 'LOW', view: 'too low', appealSeverity: 'HIGH', call: 'pending', ...x });
test('the appeal\'s severity items: every one checked, fair included, with its kind worked out and each verdict checked', () => {
  const ok = checkResults(res3({ appeal: { ran: true, reviewed: 1, items: [], severityReviewed: 3, severityItems: [item(), item({ finding: 'r/M2', reviewers: ['HIGH', 'MED'], judge: 'LOW', view: 'fair', appealSeverity: null, call: 'kept' }), item({ finding: 'r/M7', reviewers: ['MED'], judge: 'HIGH', view: 'too high', appealSeverity: 'MED', call: 'changed' })] } }), true, 3);
  assert.deepEqual(ok.appeal.severityItems.map(x => [x.finding, x.kind, x.view, x.appealSeverity, x.call]), [['r/M4: overwrite guard', 'kept at low', 'too low', 'high', 'pending'], ['r/M2', 'changed', 'fair', null, 'kept'], ['r/M7', 'changed', 'too high', 'med', 'changed']]);
  const bad = (sev, re, n = sev.length) => assert.throws(() => checkResults(res3({ appeal: { ran: true, reviewed: 1, items: [], severityReviewed: n, severityItems: sev } }), true, 3), re);
  bad([item({ reviewers: ['MED'], judge: 'MED', view: 'fair', appealSeverity: null, call: 'kept' })], /isn't a severity finding: the judge kept it at MED/);
  bad([item({ appealSeverity: 'LOW' })], /TOO LOW needs appealSeverity above the judge's LOW/);
  bad([item({ judge: 'HIGH', reviewers: ['MED'], view: 'too high', appealSeverity: 'HIGH' })], /TOO HIGH needs appealSeverity below the judge's HIGH/);
  bad([item({ view: 'fair', appealSeverity: null, call: 'changed' })], /found the severity fair, so call is kept/);
  bad([item({ view: 'maybe' })], /view must be fair, too low, too high, unsure/);
  bad([item()], /one entry per severity finding the appeal checked, fair ones included/, 2);
  assert.throws(() => checkResults({ ...res3({ partlyReal: 0, understated: 0, confirmed: 3 }), appeal: { ran: true, reviewed: 1, items: [], severityReviewed: 1, severityItems: [item()] } }, true, 2), /brief version 2's appeal checks dismissals only/);
});

test('logged severity verdicts are counted by kind in compare and listed in review-log.md', () => {
  const p = tmp();
  const pl = run(p, ['plan', ...STD], T);
  assert.deepEqual(pl.resultsTemplate.appeal, { ran: false, reviewed: 0, items: [], severityReviewed: 0, severityItems: [] });
  assert.ok('partlyReal' in pl.resultsTemplate && 'understated' in pl.resultsTemplate);
  const sev = [item(), item({ finding: 'r/M5', reviewers: ['LOW'], judge: 'LOW', view: 'fair', appealSeverity: null, call: 'kept' }), item({ finding: 'r/M2', reviewers: ['HIGH'], judge: 'MED', view: 'fair', appealSeverity: null, call: 'kept' })];
  run(p, ['log', '--run', pl.runId], JSON.stringify(res3({ appeal: { ran: true, reviewed: 1, items: [], severityReviewed: 3, severityItems: sev } })));
  const g = run(p, ['compare']).byType[0];
  assert.deepEqual(g.appeal.severity, { runs: 1, changedChecked: 1, changedFlagged: 0, lowUnchangedChecked: 2, lowUnchangedFlagged: 1, changedByUser: 0 });
  assert.equal(g.understatedOfKeptPercent, 25);
  const md = fs.readFileSync(path.join(p, 'reviews/review-log.md'), 'utf8');
  assert.match(md, /Appeal on severity: 3 checked \(1 changed severities, 0 flagged; 2 unchanged LOW findings, 1 flagged\): r\/M4: overwrite guard judge LOW, TOO LOW \(HIGH\), pending; r\/M5 judge LOW, FAIR; r\/M2 judge MED, FAIR/);
  assert.match(md, /severity: 0 of 1 changed and 1 of 2 unchanged LOW flagged, 0 changed by you/);
  assert.match(md, /\| 4 \(1, 1 raised\) \|/);
});

// ---- Effort from the settings files.
test('the settings reader: managed files in order, then local, then project, and the user file only when asked', () => {
  const managed = tmp(), proj = tmp(), cfg = tmp();
  write(managed, 'managed-settings.json', { modelSettings: { 'claude-haiku-5-5': { effortLevel: 'high' } } });
  write(managed, 'managed-settings.d/20-b.json', { modelSettings: { 'claude-haiku-5-5': { effortLevel: 'low' } } });
  write(managed, 'managed-settings.d/10-a.json', { modelSettings: { 'claude-haiku-5-5': { effortLevel: 'medium' } } });
  write(proj, '.claude/settings.local.json', { modelSettings: { 'claude-sonnet-5-5': { effortLevel: 'low' } }, env: { SECRET: 'x' } });
  write(proj, '.claude/settings.json', { modelSettings: { 'claude-sonnet-5-5': { effortLevel: 'xhigh' }, 'claude-fable-5-1': { effortLevel: 'medium' } } });
  write(cfg, 'settings.json', { modelSettings: { 'claude-fable-5-1': { effortLevel: 'low' }, 'claude-opus-4-7': { effortLevel: 'low' } } });
  const s = effortSettingsOf(proj, { CLAUDE_CONFIG_DIR: cfg }, { readUser: false, managedDir: managed });
  assert.deepEqual(s.checked, ['managed', 'local', 'project']);
  assert.equal(s.userChecked, false);
  assert.deepEqual(savedEffortOf(s, 'claude-haiku-5-5'), { level: 'low', from: 'managed settings', cap: null, capFrom: null });
  assert.equal(savedEffortOf(s, 'claude-sonnet-5-5').from, 'project local settings (.claude/settings.local.json)');
  assert.equal(savedEffortOf(s, 'claude-fable-5-1').level, 'medium');
  assert.equal(savedEffortOf(s, 'claude-opus-4-7').level, null);
  assert.ok(!JSON.stringify(s).includes('SECRET'), 'nothing but the effort keys is kept');
  const u = effortSettingsOf(proj, { CLAUDE_CONFIG_DIR: cfg }, { readUser: true, managedDir: managed });
  assert.deepEqual(u.checked, ['managed', 'local', 'project', 'user']);
  assert.equal(savedEffortOf(u, 'claude-opus-4-7').from, 'user settings');
  assert.equal(savedEffortOf(u, 'claude-fable-5-1').level, 'medium', 'project settings outrank user settings');
});

test('top-level levels, the user file\'s older rule, caps, aliases and model keys follow the docs', () => {
  const proj = tmp(), cfg = tmp();
  write(cfg, 'settings.json', { effortLevel: 'low' });
  const u = effortSettingsOf(proj, { CLAUDE_CONFIG_DIR: cfg }, { readUser: true, managedDir: NO_MANAGED });
  assert.equal(savedEffortOf(u, 'claude-haiku-5-5').level, null, 'a top-level effortLevel in user settings skips Opus 5.5 and later');
  assert.equal(savedEffortOf(u, 'claude-fable-5-1').level, 'low');
  write(proj, '.claude/settings.local.json', { effortLevel: 'medium', maxEffortLevel: 'high', modelSettings: { 'haiku[1m]': { maxEffortLevel: 'max' }, 'claude-sonnet-5-5-20261001': { effortLevel: 'xhigh' } } });
  const s = effortSettingsOf(proj, {}, { managedDir: NO_MANAGED });
  assert.equal(savedEffortOf(s, 'claude-haiku-5-5').level, 'medium', 'a top-level level in local settings applies to every model');
  assert.equal(savedEffortOf(s, 'claude-haiku-5-5').cap, null, 'max in a model entry exempts it from that file\'s cap');
  assert.deepEqual(savedEffortOf(s, 'claude-sonnet-5-5'), { level: 'xhigh', from: 'project local settings (.claude/settings.local.json)', cap: 'high', capFrom: 'project local settings (.claude/settings.local.json)' });
  // Aliases and the session's own family.
  const models = { main: 'claude-opus-5-5', env: null, force: false };
  assert.equal(seatModelId(models, { model: 'haiku' }), 'claude-haiku-5-5');
  assert.equal(seatModelId(models, { model: 'opus' }), 'claude-opus-5-5');
  assert.equal(seatModelId({ main: 'claude-opus-4-7[1m]' }, { model: 'opus' }), 'claude-opus-4-7');
  assert.equal(seatModelId({ main: null }, { model: null }), null);
  assert.deepEqual(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-1', 'claude-opus-4-7'].map(defaultEffortOf), ['medium', 'medium', 'medium', 'high', 'xhigh']);
  // A level is capped by the lowest cap.
  const e = expectedEffortOf({ model: 'sonnet', effort: null }, models, 'high', null, s);
  assert.deepEqual([e.level, e.cap], ['high', 'capped at high by project local settings (.claude/settings.local.json)']);
});

test('the seat summary gives each seat\'s level and where it comes from, and says when user settings weren\'t checked', () => {
  const proj = tmp(), cfg = tmp();
  write(proj, '.claude/settings.local.json', { modelSettings: { 'claude-haiku-5-5': { effortLevel: 'low' } } });
  write(cfg, 'settings.json', { modelSettings: { 'claude-sonnet-5-5': { effortLevel: 'high' } } });
  const pl = plan(['--seat-model', 'reviewers=sonnet; judge=haiku', '--seat-effort', 'appeal=max'], { CLAUDE_EFFORT: 'xhigh', CLAUDE_CONFIG_DIR: cfg }, proj);
  assert.equal(pl.seatSummary[0], "reviewer: correctness: model sonnet (explicit, --seat-model (reviewers)); effort: default, medium (claude-sonnet-5-5's default; user settings not checked, and a level saved there may apply)");
  assert.equal(pl.seatSummary[3], 'judge: model haiku (explicit, --seat-model (this seat)); effort: default, low (saved for claude-haiku-5-5 in project local settings (.claude/settings.local.json))');
  assert.equal(pl.seatSummary[4], 'appeal: model: default, the session\'s, claude-opus-5-5; effort max (explicit, --seat-effort (this seat))');
  assert.ok(pl.warnings.includes("user settings weren't checked (plan with --read-effort-settings to check them), so a level saved there for claude-sonnet-5-5, claude-haiku-5-5 may apply to reviewer: correctness, reviewer: security and privacy, reviewer: docs and policy accuracy, judge"));
  assert.deepEqual(pl.effortSettings, { checked: ['managed', 'local', 'project'], userChecked: false });
  const withUser = plan(['--seat-model', 'reviewers=sonnet; judge=haiku', '--read-effort-settings'], { CLAUDE_EFFORT: 'xhigh', CLAUDE_CONFIG_DIR: cfg }, proj);
  assert.equal(withUser.seatSummary[0], 'reviewer: correctness: model sonnet (explicit, --seat-model (reviewers)); effort: default, high (saved for claude-sonnet-5-5 in user settings)');
  assert.ok(!withUser.warnings.some(w => /user settings weren't checked/.test(w)));
  // A council all on the session's model needs no settings check, so there's no warning.
  assert.ok(!plan([], { CLAUDE_EFFORT: 'high' }, proj).warnings.some(w => /user settings weren't checked/.test(w)));
  // The planned row records each seat's expected level and source, and whether user settings were read.
  const p = tmp();
  run(p, ['plan', ...STD, '--seat-model', 'judge=haiku', '--read-effort-settings'], T, { CLAUDE_EFFORT: 'high', CLAUDE_CONFIG_DIR: cfg });
  const row = JSON.parse(fs.readFileSync(path.join(p, 'reviews/review-log.jsonl'), 'utf8').trim());
  assert.deepEqual(row.seatEffort.find(x => x.seat === 'judge'), { seat: 'judge', level: 'medium', source: "claude-haiku-5-5's default, with no level saved for it in the settings files read" });
  assert.equal(row.effortSettings.userChecked, true);
});

test('a settings file that isn\'t JSON is reported, not read', () => {
  const proj = tmp();
  write(proj, '.claude/settings.local.json', '{ not json');
  const s = effortSettingsOf(proj, {}, { managedDir: NO_MANAGED });
  assert.deepEqual(s.warnings, ["project local settings (.claude/settings.local.json) couldn't be read as JSON, so its effort settings weren't checked"]);
});

// ---- Docs.
test('SKILL.md: brief versions, the read-only agent and its fallback, the severity block, and the new log fields', () => {
  const s = read('plugin/skills/council-dial/SKILL.md');
  assert.match(s, /`plan` writes brief version 3 unless the user asks for `--brief-version 2`/);
  assert.match(s, /every agent is then the plugin's read-only agent, `council-dial:council-reader`, which has only the Read, Grep and Glob tools, so the rule is enforced and not just written in the briefs\. Only if the user allows running code, pass `--allow-running-code`/);
  assert.match(s, /each with its `agentType` from `steps` as the Agent tool's `subagent_type`/);
  assert.match(s, /If the Agent tool says `council-dial:council-reader` doesn't exist \(the skill was copied without the plugin\), stop and tell the user/);
  assert.match(s, /a `<severity from="judge">` … `<\/severity>` block with every finding the judge ruled OVERSTATED or UNDERSTATED and every other finding it kept at LOW/);
  assert.match(s, /Never put a model or effort in either block\./);
  assert.match(s, /also list every severity verdict it gave, each with the judge's and the appeal's severity; for each one marked TOO LOW, TOO HIGH or UNSURE, show both views and ask the user to call it/);
  assert.match(s, /also `partlyReal` and `understated`, the judge's PARTLY REAL and UNDERSTATED, and then all five add up to it/);
  assert.match(s, /`severityItems`, one for every one of them, fair ones included/);
  assert.match(s, /`plan` reads the user's own settings file only with `--read-effort-settings`; without it, when a seat's effort depends on them, a warning says user settings weren't checked\. Pass that option only if the user asks\./);
});

test('both READMEs explain the tool limits and why they are the default, brief version 3, and the effort settings check', () => {
  for (const f of ['README.md', 'plugin/README.md']) {
    const r = read(f);
    assert.match(r, /every one of them is the plugin's read-only agent, `council-dial:council-reader` \(in `(plugin\/)?agents\/`\), which has only the Read, Grep and Glob tools/, f);
    assert.ok(r.includes(f === 'README.md' ? '(in `plugin/agents/`)' : '(in `agents/`)'), `${f}: the agent's folder from where that README sits`);
    assert.match(r, /a rule in a brief is only an instruction, and in one of our runs a judge ran a "scratch" Python check it read as allowed; a tool limit can't be talked around\. This is the default because/, f);
    assert.match(r, /Claude Code's sub-agents docs give an agent definition's `tools` field as the way to limit a subagent's tools \(the Agent call itself can't\)/, f);
    assert.match(r, /Claude plans with `--allow-running-code`, the agents are ordinary general-purpose subagents/, f);
    assert.match(r, /\*\*The judge can raise a severity, and the appeal checks severities \(brief version 3\)\.\*\*/, f);
    assert.match(r, /Brief version 2 stays selectable with `--brief-version 2`, and its runs are compared apart from version 3's\./, f);
    assert.match(r, /\*\*Saved levels:\*\* a seat with no effort set, on another model than the session's, runs at the level saved for that model in your settings/, f);
    assert.match(r, /Without `--read-effort-settings`, when a seat's effort depends on them, the plan says plainly that user settings weren't checked and that a level saved there may apply\./, f);
    assert.match(r, /five environment variables, each by name: `CLAUDE_CONFIG_DIR`, only to find your user settings folder when you allow reading it/, f);
    assert.doesNotMatch(r, /An appeal on severity downgrades\./, f);
  }
  assert.match(read('README.md'), /\| `plugin\/agents\/` \| `council-reader\.md`, the read-only agent/);
});

// ---- 1.5.1: a standalone "Version 2 vs version 3" section, in both READMEs and the template notes.
test('both READMEs describe every difference between version 2 and version 3, and why runs are compared apart', () => {
  for (const f of ['README.md', 'plugin/README.md']) {
    const r = read(f);
    const sec = r.slice(r.indexOf('## Version 2 vs version 3'), r.indexOf('## Example prompts'));
    assert.ok(sec.length > 2000, f);
    for (const x of [
      'REAL (the claim holds, same severity), PARTLY REAL (part of the claim doesn\'t hold, same severity), OVERSTATED (lower), UNDERSTATED (higher, so a severity can be raised) and NOT REAL',
      'in three runs, one finding, silent data loss, ended LOW, MED and HIGH, each time the highest rating a single reviewer gave it',
      'From the evidence, "not from how many reviewers raised it or how they rated it"',
      '| Numbering | Left to the judge (one used M1, M2; another used letters). | M1, M2 and so on',
      'the log also counts `partlyReal` and `understated`',
      'Also checks every severity the judge changed (up or down) and every other finding it kept at LOW: SEVERITY FAIR, TOO LOW, TOO HIGH or UNSURE',
      'how often it disagrees on unchanged LOW findings is reported separately',
      '"Run nothing unless the user allowed running code": no code from the material, no scripts or one-off checks of its own (even in a scratch folder), no tests and no shell commands',
      'By a tool limit: every agent is the plugin\'s read-only agent, `council-dial:council-reader`, with only the Read, Grep and Glob tools',
      'The read-only agent\'s own definition is its system prompt, in place of the general-purpose one',
      'The same with ` v3` before the models, such as `specialised-3/judged+appeal v3 @sonnet`',
      '**Both versions, from 1.5.0:** the effort settings check isn\'t a brief difference.',
      '**Why runs of the two versions must be compared separately:**',
      'To compare with a run from before 1.5.0, plan with `--brief-version 2`',
    ]) assert.ok(sec.includes(x), `${f}: ${x}`);
  }
});

test('the version 3 template notes describe every difference, and only the notes changed: the digest is the same', () => {
  const notes = fs.readFileSync(path.join(SKILL, 'briefs/v3/shared.md'), 'utf8');
  assert.match(notes, /^## Version 2 vs version 3$/m);
  for (const x of ['**The judge\'s rulings.**', '**Numbering and counts.**', '**The appeal.**', '**Running code.**', '**Enforcement and the system prompt.**', '**The type\'s name**', '**Not a brief difference:**']) assert.ok(notes.includes(x), x);
  // The notes heading has no text block, so it's no template, and version 3's texts and digest are what 1.5.0 shipped.
  assert.ok(!('Version 2 vs version 3' in sectionsOf(notes)));
  assert.equal(BRIEF_SHA256_V3, '2f545f09d9477094e4ead755b5a7a92781a811ff2ef1497f9a20251577b5fec0');
  assert.equal(plan().version, 3);
});
