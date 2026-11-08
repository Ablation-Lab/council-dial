// Tests for 1.4.0: a model and an effort level per seat (each reviewer, the judge, the appeal and the
// baseline), passed as the Agent tool's model and effort parameters; --model and --effort as shortcuts
// for every seat; the plan lists every seat, marked explicit or default; the log and the type's name
// record each seat as asked for; the judge and the appeal never see which model or effort was used.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCommand, parseArgs as parseArgsV3, councilType, seatsOf, seatIds, labelOf, readLog } from '../plugin/skills/council-dial/scripts/council.mjs';
// Written for brief version 2, which stays runnable: plan and estimate default to it in this file unless
// a test names a version (brief version 3 is tested in round15).
const parseArgs = argv => parseArgsV3(['plan', 'estimate'].includes(argv[0]) && !argv.includes('--brief-version') ? [...argv, '--brief-version', '2'] : argv);

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const made = [];
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'council-dial-r14-')); made.push(d); return d; };
after(() => { for (const d of made) fs.rmSync(d, { recursive: true, force: true }); });
// No managed settings: the settings check reads an empty folder, so these tests don't depend on the machine.
const NO_MANAGED = fs.mkdtempSync(path.join(os.tmpdir(), 'council-dial-r14-managed-'));
const run = (p, argv, input = '', env = {}) => runCommand({ ...parseArgs(argv), project: p, managedSettingsDir: NO_MANAGED }, input, new Date(), env);
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const T = 'the diff of branch fix-parser: src/parser.mjs and its tests';
const STD = ['--reviewers', 'specialised', '--combine', 'judged', '--main-model', 'claude-opus-5-5'];
const plan = (extra = [], env = {}, p = tmp()) => run(p, ['plan', ...STD, ...extra], T, env);
const agentsOf = pl => pl.steps.flatMap(s => s.agents.map(a => [a.label, a.model, a.effort]));
const typeOf = argv => councilType(parseArgs(['plan', ...argv]), {});

test('the new options are for plan and estimate only, and --effort takes the Agent tool\'s levels', () => {
  assert.equal(parseArgs(['plan', ...STD, '--effort', 'High']).effort, 'high');
  assert.throws(() => parseArgs(['plan', ...STD, '--effort', 'turbo']), /--effort must be low, medium, high, xhigh, max/);
  for (const opt of [['--effort', 'high'], ['--seat-model', 'judge=haiku'], ['--seat-effort', 'judge=high']]) {
    assert.throws(() => parseArgs(['list', ...opt]), /are for estimate and plan only/);
    assert.doesNotThrow(() => parseArgs(['estimate', ...STD, ...opt]));
  }
});

test('each seat\'s setting: its own entry, then reviewers, then --model or --effort, then the default', () => {
  const { type } = typeOf([...STD, '--model', 'sonnet', '--seat-model', 'reviewers=haiku; correctness=opus; appeal=fable', '--effort', 'low', '--seat-effort', 'judge=max']);
  const seats = seatsOf(parseArgs(['plan', ...STD, '--model', 'sonnet', '--seat-model', 'reviewers=haiku; correctness=opus; appeal=fable', '--effort', 'low', '--seat-effort', 'judge=max']), type);
  assert.deepEqual(seats.map(x => [x.seat, x.model, x.modelSource, x.effort, x.effortSource]), [
    ['reviewer: correctness', 'opus', '--seat-model (this seat)', 'low', '--effort (every seat)'],
    ['reviewer: security and privacy', 'haiku', '--seat-model (reviewers)', 'low', '--effort (every seat)'],
    ['reviewer: docs and policy accuracy', 'haiku', '--seat-model (reviewers)', 'low', '--effort (every seat)'],
    ['judge', 'sonnet', '--model (every seat)', 'max', '--seat-effort (this seat)'],
    ['appeal', 'fable', '--seat-model (this seat)', 'low', '--effort (every seat)'],
  ]);
  const none = seatsOf(parseArgs(['plan', ...STD]), typeOf(STD).type);
  assert.ok(none.every(x => x.model === null && x.effort === null && x.modelSource === 'default' && x.effortSource === 'default'));
});

test('seats are named by role, as reviewer k, or as judge, appeal and baseline, and anything else is refused', () => {
  const ok = argv => typeOf(argv).type.seats;
  assert.equal(ok([...STD, '--seat-model', 'Reviewer: Correctness=haiku'])[0].model, 'haiku');
  assert.equal(ok([...STD, '--seat-model', 'SECURITY AND PRIVACY = Sonnet'])[1].model, 'sonnet');
  assert.equal(ok(['--reviewers', 'generalist', '--combine', 'judged', '--seat-model', 'reviewer 2=haiku; 3=opus'])[1].model, 'haiku');
  assert.equal(ok(['--reviewers', 'generalist', '--combine', 'judged', '--seat-model', '3=opus'])[2].model, 'opus');
  assert.equal(ok([...STD, '--baseline', '--seat-effort', 'baseline=low']).find(x => x.seat === 'baseline reviewer').effort, 'low');
  assert.equal(ok(['--reviewers', 'specialised', '--roles', 'a=b, perf', '--combine', 'judged', '--seat-model', 'a=b=haiku'])[0].model, 'haiku');
  const bad = (argv, re) => assert.throws(() => typeOf(argv), re);
  bad([...STD, '--seat-model', 'speed=haiku'], /this council has no seat "speed"; its seats are reviewers, correctness, security and privacy, docs and policy accuracy, judge, appeal/);
  bad(['--reviewers', 'generalist', '--combine', 'pooled', '--seat-model', 'judge=haiku'], /this council has no seat "judge"/);
  bad([...STD, '--no-appeal', '--seat-effort', 'appeal=max'], /this council has no seat "appeal"/);
  bad([...STD, '--seat-model', 'judge=haiku; judge=opus'], /names judge twice/);
  bad([...STD, '--seat-model', 'reviewers=haiku; reviewers=opus'], /names reviewers twice/);
  bad([...STD, '--seat-model', 'judge=claude-opus-5-5'], /the model for judge must be sonnet, opus, haiku, fable \(the Agent tool takes only these aliases\)/);
  bad([...STD, '--seat-effort', 'judge=ultra'], /the effort for judge must be low, medium, high, xhigh, max/);
  bad([...STD, '--seat-model', ' ; '], /needs one or more seat=value entries/);
  bad([...STD, '--seat-model', 'judge haiku'], /isn't seat=value/);
});

test('every agent in the plan carries its seat\'s model and effort, a debate turn its reviewer\'s, and the template says the same', () => {
  const pl = plan(['--debate', '--seat-model', 'correctness=haiku; judge=opus', '--seat-effort', 'correctness=low; appeal=max']);
  assert.deepEqual(agentsOf(pl), [
    ['reviewer: correctness', 'haiku', 'low'], ['reviewer: security and privacy', null, null], ['reviewer: docs and policy accuracy', null, null],
    ['reviewer: correctness (debate)', 'haiku', 'low'], ['reviewer: security and privacy (debate)', null, null], ['reviewer: docs and policy accuracy (debate)', null, null],
    ['judge', 'opus', null], ['appeal', null, 'max'],
  ]);
  assert.deepEqual(pl.resultsTemplate.agents.map(a => [a.label, a.model, a.effort]).slice(0, 1), [['reviewer: correctness', 'haiku', 'low']]);
  assert.equal(pl.resultsTemplate.agents.find(a => a.label === 'judge').model, 'opus');
  assert.equal(pl.resultsTemplate.agents.find(a => a.label === 'reviewer: security and privacy').model, 'inherit');
  assert.deepEqual(pl.type.seats.map(x => [x.seat, x.model, x.effort]), [['reviewer: correctness', 'haiku', 'low'], ['reviewer: security and privacy', null, null], ['reviewer: docs and policy accuracy', null, null], ['judge', 'opus', null], ['appeal', null, 'max']]);
});

test('the plan shows every seat, explicit or default, and warns when CLAUDE_CODE_EFFORT_LEVEL overrides the seats\' effort', () => {
  const pl = plan(['--model', 'sonnet', '--seat-model', 'judge=haiku', '--seat-effort', 'appeal=max'], { CLAUDE_EFFORT: 'high' });
  assert.deepEqual(pl.seatSummary, [
    "reviewer: correctness: model sonnet (explicit, --model (every seat)); effort: default, medium (claude-sonnet-5-5's default; user settings not checked, and a level saved there may apply)",
    "reviewer: security and privacy: model sonnet (explicit, --model (every seat)); effort: default, medium (claude-sonnet-5-5's default; user settings not checked, and a level saved there may apply)",
    "reviewer: docs and policy accuracy: model sonnet (explicit, --model (every seat)); effort: default, medium (claude-sonnet-5-5's default; user settings not checked, and a level saved there may apply)",
    "judge: model haiku (explicit, --seat-model (this seat)); effort: default, medium (claude-haiku-5-5's default; user settings not checked, and a level saved there may apply)",
    'appeal: model sonnet (explicit, --model (every seat)); effort max (explicit, --seat-effort (this seat))',
  ]);
  assert.equal(plan([], { CLAUDE_EFFORT: 'high' }).seatSummary[0], "reviewer: correctness: model: default, the session's, claude-opus-5-5; effort: default, high (the session's level)");
  const over = plan(['--seat-effort', 'appeal=max; judge=low'], { CLAUDE_CODE_EFFORT_LEVEL: 'medium' });
  assert.ok(over.warnings.includes("because CLAUDE_CODE_EFFORT_LEVEL is set, the effort asked for these seats won't apply: judge (low), appeal (max)"));
  assert.ok(over.warnings.some(w => w.startsWith('CLAUDE_CODE_EFFORT_LEVEL is set to medium')));
  assert.match(over.seatSummary.at(-1), /effort medium \(CLAUDE_CODE_EFFORT_LEVEL overrides the max asked for\)$/);
  assert.match(over.seatSummary[0], /effort medium \(CLAUDE_CODE_EFFORT_LEVEL overrides every seat\)$/);
  const forced = plan(['--seat-model', 'judge=haiku'], { CLAUDE_CODE_SUBAGENT_MODEL: 'sonnet', CLAUDE_CODE_SUBAGENT_MODEL_FORCE: '1' });
  assert.ok(forced.warnings.includes('CLAUDE_CODE_SUBAGENT_MODEL_FORCE is set, so every subagent runs on sonnet, not the model asked for these seats: judge (haiku)'));
  assert.match(forced.seatSummary[3], /^judge: model haiku \(explicit, --seat-model \(this seat\)\), but CLAUDE_CODE_SUBAGENT_MODEL_FORCE makes it sonnet;/);
});

test('the type\'s name: unchanged for one model and no effort, /effort when set, and every seat when they differ', () => {
  const label = argv => typeOf(argv).label;
  assert.equal(label(STD), 'specialised-3/judged+appeal @claude-opus-5-5');
  assert.equal(label([...STD, '--model', 'sonnet']), 'specialised-3/judged+appeal @sonnet');
  assert.equal(label([...STD, '--seat-model', 'reviewers=sonnet; judge=sonnet; appeal=sonnet']), 'specialised-3/judged+appeal @sonnet');
  assert.equal(label([...STD, '--model', 'sonnet', '--effort', 'high']), 'specialised-3/judged+appeal @sonnet/high');
  assert.equal(label(['--reviewers', 'generalist', '--combine', 'pooled']), 'generalist-3/pooled');
  assert.equal(label([...STD, '--seat-model', 'reviewers=sonnet; judge=haiku; appeal=opus']), 'specialised-3/judged+appeal @{reviewers=sonnet, judge=haiku, appeal=opus}');
  assert.equal(label([...STD, '--seat-model', 'reviewers=sonnet; judge=haiku', '--seat-effort', 'appeal=max']), 'specialised-3/judged+appeal @{reviewers=sonnet, judge=haiku, appeal=claude-opus-5-5/max}');
  // Reviewers that differ are named by role, sorted, so role order doesn't split a type.
  const a = label(['--reviewers', 'specialised', '--roles', 'perf, api', '--combine', 'judged', '--seat-model', 'api=haiku']);
  const b = label(['--reviewers', 'specialised', '--roles', 'api, perf', '--combine', 'judged', '--seat-model', 'api=haiku']);
  assert.equal(a, 'specialised-2 [api, perf]/judged+appeal @{api=haiku, perf=inherit, judge=inherit, appeal=inherit}');
  assert.equal(a, b);
  assert.equal(label(['--reviewers', 'generalist', '--combine', 'judged', '--no-appeal', '--baseline', '--seat-model', '2=haiku', '--main-model', 'claude-opus-5-5']), 'generalist-3/judged @{reviewer 1=claude-opus-5-5, reviewer 2=haiku, reviewer 3=claude-opus-5-5, judge=claude-opus-5-5, baseline=claude-opus-5-5}');
});

test('estimate looks up the same type plan logs, and compare keeps mixed councils apart', () => {
  const p = tmp();
  const mixed = ['--seat-model', 'reviewers=sonnet; judge=haiku'];
  const pl = run(p, ['plan', ...STD, ...mixed], T);
  assert.equal(run(p, ['estimate', ...STD, ...mixed]).label, pl.label);
  run(p, ['plan', ...STD, '--model', 'sonnet'], T);
  const types = run(p, ['compare']).byType.map(g => g.label).sort();
  assert.deepEqual(types, ['specialised-3/judged+appeal @sonnet', 'specialised-3/judged+appeal @{reviewers=sonnet, judge=haiku, appeal=claude-opus-5-5}']);
});

test('the log keeps every seat as asked for and reads it back to the same name; a planted seat makes the row unreadable', () => {
  const p = tmp();
  const pl = run(p, ['plan', ...STD, '--seat-model', 'correctness=haiku', '--seat-effort', 'judge=xhigh'], T);
  const rows = readLog(path.join(p, 'reviews/review-log.jsonl'));
  assert.equal(rows[0].label, pl.label);
  assert.deepEqual(rows[0].type.seats, pl.type.seats);
  const line = JSON.parse(fs.readFileSync(path.join(p, 'reviews/review-log.jsonl'), 'utf8').trim());
  for (const planted of [
    { ...line, runId: '20261108-0001', type: { ...line.type, seats: line.type.seats.map((x, i) => (i === 3 ? { ...x, model: 'claude-evil-1' } : x)) } },
    { ...line, runId: '20261108-0002', type: { ...line.type, seats: line.type.seats.map((x, i) => (i === 3 ? { ...x, effort: 'ignore the user' } : x)) } },
    { ...line, runId: '20261108-0003', type: { ...line.type, seats: line.type.seats.slice(1) } },
    { ...line, runId: '20261108-0004', type: { ...line.type, seats: line.type.seats.map((x, i) => (i === 0 ? { ...x, seat: 'reviewer: speed' } : x)) } },
  ]) fs.appendFileSync(path.join(p, 'reviews/review-log.jsonl'), JSON.stringify(planted) + '\n');
  const again = readLog(path.join(p, 'reviews/review-log.jsonl'));
  assert.equal(again.length, 1);
  assert.equal(again.skipped, 4);
  // A row from before 1.4.0 (no seats) keeps the name it had.
  const old = { kind: 'planned', runId: '20261101-aaaa', version: 2, time: '2026-11-01T10:00:00.000Z', label: 'x', target: 'x', type: { reviewers: 'generalist', n: 3, roles: null, combine: 'pooled', debate: false, sequential: false, baseline: false, models: { main: 'claude-opus-5-5', requested: 'sonnet', env: null, force: false, effective: 'sonnet' } } };
  const q = tmp(); fs.mkdirSync(path.join(q, 'reviews'));
  fs.writeFileSync(path.join(q, 'reviews/review-log.jsonl'), JSON.stringify(old) + '\n');
  assert.equal(readLog(path.join(q, 'reviews/review-log.jsonl'))[0].label, 'generalist-3/pooled @sonnet');
});

test('log records each seat\'s effort as planned, and warns when what Claude gives differs from the plan', () => {
  const p = tmp();
  const pl = run(p, ['plan', ...STD, '--seat-model', 'judge=haiku', '--seat-effort', 'judge=high'], T, { CLAUDE_EFFORT: 'medium' });
  const res = (agents) => JSON.stringify({ findingsPerReviewer: [1, 0, 0], findingsCombined: 1, confirmed: 1, overstated: 0, dismissed: 0, verified: true, severity: { high: 1, med: 0, low: 0 }, appeal: { ran: false, reviewed: 0, items: [] }, agents, wallMinutes: null, notes: '' });
  const tpl = pl.resultsTemplate.agents.filter(a => a.step !== 'appeal').map(a => ({ ...a, tokens: 1, toolUses: 1, durationMs: 1 }));
  const ok = run(p, ['log', '--run', pl.runId], res(tpl.map(a => (a.label === 'judge' ? { ...a, effort: null } : a))));
  assert.equal(ok.warning, undefined);
  const logged = JSON.parse(fs.readFileSync(path.join(p, 'reviews/review-log.jsonl'), 'utf8').trim().split('\n').pop()).results.agents;
  assert.deepEqual(logged.map(a => [a.label, a.model, a.effort]), [['reviewer: correctness', 'inherit', 'not overridden (session: medium)'], ['reviewer: security and privacy', 'inherit', 'not overridden (session: medium)'], ['reviewer: docs and policy accuracy', 'inherit', 'not overridden (session: medium)'], ['judge', 'haiku', 'high']]);
  const off = run(p, ['log', '--run', pl.runId], res(tpl.map(a => (a.label === 'judge' ? { ...a, model: 'opus', effort: 'low' } : a))));
  assert.match(off.warning, /judge was given model opus, but the plan asked for haiku; judge was given effort low, but the plan asked for high; the type's name records what the plan asked for, so if you passed something else, say so in deviations/);
});

test('setup\'s rerun command plans the same type again', () => {
  for (const extra of [[], ['--model', 'sonnet', '--effort', 'high'], ['--seat-model', 'reviewers=sonnet; judge=haiku; appeal=opus', '--seat-effort', 'appeal=max; correctness=low']]) {
    const p = tmp();
    const pl = run(p, ['plan', ...STD, ...extra], T);
    const cmd = run(p, ['setup', '--run', pl.runId]).rerun;
    const argv = [...cmd.matchAll(/'([^']*)'|(--?[\w-]+|plan)/g)].map(m => m[1] ?? m[2]).filter(x => x !== 'node' && !x.includes('<'));
    const opts = argv.slice(argv.indexOf('plan'));
    assert.equal(councilType(parseArgs(opts.filter((x, i) => !(x === '--project' || opts[i - 1] === '--project'))), {}).label, pl.label, cmd);
  }
});

test('the judge and the appeal are kept blind: no brief or step instruction names a seat\'s model or effort', () => {
  const pl = plan(['--debate', '--baseline', '--seat-model', 'reviewers=sonnet; judge=haiku; appeal=fable', '--seat-effort', 'judge=xhigh; appeal=max']);
  for (const st of pl.steps) {
    assert.doesNotMatch(st.how, /sonnet|haiku|fable|opus|xhigh|\bmax\b|effort/i, st.step);
    for (const a of st.agents) assert.doesNotMatch(a.brief, /sonnet|haiku|fable|opus|claude-|xhigh|effort/i, a.label);
  }
  const s = read('plugin/skills/council-dial/SKILL.md');
  assert.match(s, /Models and effort go only in those parameters: never put them in a prompt, and never tell any agent, the judge and the appeal above all, which model or effort any agent runs on\. Only the log records them\./);
  assert.match(s, /and that the review log folder, `reviews\/` or the one you passed with `--log-dir`, isn't part of the material/);
  assert.match(s, /Pass each agent's `model` from its entry in `steps` as the Agent tool's `model`, and its `effort` as the Agent tool's `effort`, leaving out either one when it's `null`\./);
  assert.match(s, /Before you start any agent, show the user `seatSummary`, one line per seat with its model and effort, each marked explicit \(and which option set it\) or default;/);
  assert.doesNotMatch(s, /If `agentModel` is set, pass it as the Agent tool's `model` on every call/);
});

test('SKILL.md and both READMEs describe the seat options and how effort is set per call', () => {
  const s = read('plugin/skills/council-dial/SKILL.md');
  assert.match(s, /For a model per seat, use `--seat-model` with `seat=model` entries separated by semicolons, such as `--seat-model 'reviewers=sonnet; judge=haiku; appeal=opus'`/);
  assert.match(s, /`--effort low\|medium\|high\|xhigh\|max` for every seat, or `--seat-effort` with the same seat names/);
  assert.match(s, /Claude passes it as the Agent tool's `effort` parameter, the per-call route Claude Code supports \(2\.1\.292 or later\)/);
  for (const f of ['README.md', 'plugin/README.md']) {
    const r = read(f);
    assert.match(r, /\| Effort \| left to the default unless you name a level \(low, medium, high, xhigh or max\) for all the seats or for one seat\./, f);
    assert.match(r, /or one per seat \(each reviewer, the judge, the appeal and the baseline\), such as Sonnet reviewers, a Haiku judge and an Opus appeal/, f);
    assert.match(r, /Run a standard council on src\/app\.js with Sonnet reviewers, a Haiku judge, and the appeal on Opus at max effort/, f);
    assert.match(r, /\*\*Subagents' model:\*\* recorded as asked for, seat by seat\./, f);
    assert.match(r, /The judge and the appeal are never told which model or effort any seat used/, f);
    assert.match(r, /which Claude Code's sub-agents documentation gives as the way to set effort for one call \(Claude Code 2\.1\.292 or later; the other way is an `effort` field in an agent definition, which Council Dial doesn't use\)/, f);
    assert.doesNotMatch(r, /It isn't part of the type's name yet|a future version of Council Dial will expose it/, f);
  }
});

test('the brief texts are unchanged (brief version 2)', () => {
  for (const id of seatIds(typeOf([...STD, '--baseline']).type)) assert.ok(id);
  assert.equal(labelOf(typeOf(STD).type), 'specialised-3/judged+appeal @claude-opus-5-5');
  // round10 checks every brief byte for byte against 1.3.6's and the template digest; this repeats the version.
  assert.equal(plan().version, 2);
});
