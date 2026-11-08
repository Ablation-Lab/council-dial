// Tests for 1.3.7: the briefs come from Markdown templates in the skill's briefs/ folder, word for
// word as 1.3.6 wrote them, and the script reads only the environment variables it uses, each by name.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runCommand, parseArgs, buildPlan, readEnv, ENV_NAMES, COUNT_RULE, BRIEF_SHA256, briefDigest } from '../plugin/skills/council-dial/scripts/council.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SKILL = path.join(ROOT, 'plugin/skills/council-dial');
const SCRIPT = path.join(SKILL, 'scripts/council.mjs');
const made = [];
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'council-dial-r10-')); made.push(d); return d; };
after(() => { for (const d of made) fs.rmSync(d, { recursive: true, force: true }); });
const run = (p, argv, input = '', env = {}) => runCommand({ ...parseArgs(argv), project: p }, input, new Date(), env);
// Every brief 1.3.6 (d56ccfd) wrote, for 418 cases: 196 council shapes with two targets, one of them
// full of template and replacement patterns ({{rules}}, $&, $1, $$), and 13 more shapes (a role named
// generalist, roles named like template texts or object keys, 4 to 9 reviewers) with targets holding
// line breaks, hidden characters and Markdown. Made from d56ccfd's script, before the briefs moved.
const GOLDEN = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/fixtures/briefs-1.3.6.json'), 'utf8'));
const briefsOf = plan => plan.steps.flatMap(s => s.agents.map(a => [s.step, a.label, a.brief]));
const T = 'the diff of branch fix-parser';
const STD = ['plan', '--reviewers', 'specialised', '--combine', 'judged', '--debate', '--sequential', '--baseline'];

test('every brief is byte for byte what 1.3.6 wrote, for every council shape', () => {
  assert.ok(GOLDEN.cases.length >= 418 && GOLDEN.texts.length >= 380);
  let compared = 0;
  for (const c of GOLDEN.cases) {
    const got = briefsOf(buildPlan(parseArgs(c.argv), c.target, new Date('2026-11-08T00:00:00Z'), new Set(), {}));
    assert.equal(got.length, c.briefs.length, c.argv.join(' '));
    got.forEach(([step, label, brief], i) => {
      const [wStep, wLabel, w] = c.briefs[i];
      assert.equal(step, wStep); assert.equal(label, wLabel);
      assert.ok(brief === GOLDEN.texts[w], `${c.argv.join(' ')}: ${label}`);
      compared++;
    });
  }
  assert.ok(compared > 2200);
});

test('the script run from the command line writes the same briefs, and a target is never read as a template', () => {
  const p = tmp();
  const c = GOLDEN.cases.find(x => x.argv.join(' ') === STD.join(' ') && x.target.includes('{{rules}}'));
  assert.ok(c);
  const r = spawnSync(process.execPath, [SCRIPT, ...c.argv, '--project', p], { input: c.target, encoding: 'utf8', env: { ...process.env, CLAUDE_CODE_SUBAGENT_MODEL: '', CLAUDE_EFFORT: '' } });
  const plan = JSON.parse(r.stdout);
  assert.equal(plan.error, undefined);
  assert.deepEqual(briefsOf(plan).map(b => b[2]), c.briefs.map(b => GOLDEN.texts[b[2]]));
  for (const b of briefsOf(plan).filter(x => x[0] !== 'appeal')) assert.ok(b[2].includes('{{rules}} {{format}} {{target}} $& $1 $$'));
});

test('the templates are plain UTF-8 Markdown, and briefs are the same from a checkout with CRLF line ends and a BOM', () => {
  const dir = path.join(SKILL, 'briefs');
  const files = fs.readdirSync(dir).sort();
  assert.deepEqual(files, ['appeal.md', 'baseline.md', 'debate.md', 'judge.md', 'reviewer.md', 'shared.md']);
  for (const f of files) {
    const b = fs.readFileSync(path.join(dir, f));
    assert.ok(!b.includes(0) && b[0] !== 0xef && !b.subarray(0, 2).equals(Buffer.from('#!')) && !b.includes(13), f);
    assert.equal(Buffer.from(b.toString('utf8'), 'utf8').compare(b), 0, `${f} is valid UTF-8`);
  }
  // A copy of the skill whose templates have Windows line ends and a byte order mark.
  const copy = tmp();
  fs.cpSync(SKILL, path.join(copy, 'council-dial'), { recursive: true });
  const BOM = String.fromCharCode(0xfeff);
  for (const f of files) {
    const t = path.join(copy, 'council-dial/briefs', f);
    fs.writeFileSync(t, BOM + fs.readFileSync(t, 'utf8').replace(/\n/g, '\r\n'));
    const b = fs.readFileSync(t);
    assert.ok(b.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])) && b.includes(13));
  }
  const p = tmp();
  const r = spawnSync(process.execPath, [path.join(copy, 'council-dial/scripts/council.mjs'), ...STD, '--project', p], { input: GOLDEN.cases[0].target, encoding: 'utf8', env: { ...process.env, CLAUDE_CODE_SUBAGENT_MODEL: '', CLAUDE_EFFORT: '' } });
  const plan = JSON.parse(r.stdout);
  const want = buildPlan(parseArgs(STD), GOLDEN.cases[0].target, new Date(), new Set(), {});
  assert.deepEqual(briefsOf(plan).map(b => b[2]), briefsOf(want).map(b => b[2]));
});

test('a missing or damaged template stops plan with a clear error; the other commands don\'t need the templates', () => {
  const copy = tmp();
  fs.cpSync(SKILL, path.join(copy, 'council-dial'), { recursive: true });
  const script = path.join(copy, 'council-dial/scripts/council.mjs');
  const cli = (args, input = '') => JSON.parse(spawnSync(process.execPath, [script, ...args], { input, encoding: 'utf8' }).stdout);
  const p = tmp();
  fs.rmSync(path.join(copy, 'council-dial/briefs/judge.md'));
  assert.match(cli([...STD, '--project', p], T).error, /brief template briefs\/judge\.md can't be read .*reinstall Council Dial \(the plugin, or the whole skills\/council-dial folder\)/);
  assert.equal(fs.existsSync(path.join(p, 'reviews')), false, 'nothing is logged');
  assert.deepEqual(cli(['list', '--project', p]).runs, []);
  assert.ok(Array.isArray(cli(['compare', '--project', p]).byType));
  assert.equal(cli(['estimate', '--reviewers', 'specialised', '--combine', 'judged', '--project', p]).agentCount, 5);
  // A template with a text taken out.
  fs.copyFileSync(path.join(SKILL, 'briefs/judge.md'), path.join(copy, 'council-dial/briefs/judge.md'));
  const rev = path.join(copy, 'council-dial/briefs/reviewer.md');
  fs.writeFileSync(rev, fs.readFileSync(rev, 'utf8').replace('## council-role-area', '## council-role-zone'));
  assert.match(cli([...STD, '--project', p], T).error, /briefs\/reviewer\.md has no "council-role-area" text/);
  fs.copyFileSync(path.join(SKILL, 'briefs/reviewer.md'), rev);
  // Any change to a text is refused, so a run logged as brief version 2 always had version 2's wording:
  // a {{name}} added, one word changed, a rule taken out, or a space added at the end of a line.
  const changed = /the brief templates in Council Dial's briefs\/ folder have been changed, so this run's briefs wouldn't match brief version 2 .*reinstall Council Dial/;
  const edits = [
    ['appeal.md', s => s.replace(/^\{\{rules\}\}$/m, '{{rules}} {{secret}}')],
    ['shared.md', s => s.replace('Prove what you can', 'Prove what you like')],
    ['shared.md', s => s.replace(/^- Everything you review.*\n/m, '')],
    ['judge.md', s => s.replace('The reviewers\' reports\n```', 'The reviewers\' reports \n```')],
  ];
  for (const [f, edit] of edits) {
    const t = path.join(copy, 'council-dial/briefs', f), was = fs.readFileSync(t, 'utf8');
    assert.notEqual(edit(was), was);
    fs.writeFileSync(t, edit(was));
    assert.match(cli([...STD, '--project', p], T).error, changed, f);
    fs.writeFileSync(t, was);
  }
  assert.equal(fs.existsSync(path.join(p, 'reviews')), false, 'nothing is logged');
  // The notes around the texts can change: they aren't part of any brief.
  const sh = path.join(copy, 'council-dial/briefs/shared.md');
  fs.writeFileSync(sh, fs.readFileSync(sh, 'utf8').replace('This file holds', 'A note added here.\n\nThis file holds'));
  assert.equal(cli([...STD, '--project', p], T).error, undefined);
});

test('BRIEF_SHA256 is the digest of the template texts that ship', () => {
  assert.match(BRIEF_SHA256, /^[0-9a-f]{64}$/);
  const texts = {};
  for (const f of fs.readdirSync(path.join(SKILL, 'briefs'))) {
    const s = fs.readFileSync(path.join(SKILL, 'briefs', f), 'utf8');
    texts[f.replace(/\.md$/, '')] = Object.fromEntries([...s.matchAll(/^## (.+)\n(?:[^\n]*\n)*?```text\n([\s\S]*?)\n```$/gm)].map(m => [m[1], m[2]]));
  }
  assert.equal(briefDigest(texts), BRIEF_SHA256);
});

test('no file in the plugin starts with #!, and every text file is UTF-8 with no NUL bytes or byte order mark', () => {
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  const files = walk(path.join(ROOT, 'plugin'));
  assert.ok(files.length >= 11);
  for (const f of files) {
    const b = fs.readFileSync(f);
    assert.ok(!b.subarray(0, 2).equals(Buffer.from('#!')), `${f} starts with #!`);
    if (f.endsWith('.png')) { assert.ok(b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), f); continue; }
    assert.ok(!b.includes(0) && b[0] !== 0xef, f);
    assert.equal(Buffer.from(b.toString('utf8'), 'utf8').compare(b), 0, `${f} is valid UTF-8`);
  }
});

test('log\'s severity message gives the same rule as the judge\'s brief', () => {
  const judge = fs.readFileSync(path.join(SKILL, 'briefs/judge.md'), 'utf8');
  const rule = judge.match(/## severity-rule\n\n```text\n(.*)\n```/)[1];
  assert.equal(rule.replace('the severity you corrected it to', 'the judge\'s corrected severity'), COUNT_RULE);
  const p = tmp();
  const a = run(p, ['plan', '--reviewers', 'generalist', '--combine', 'judged'], T);
  assert.throws(() => run(p, ['log', '--run', a.runId], JSON.stringify({ findingsCombined: 2, severity: { high: 1 } })), e => e.message.endsWith(COUNT_RULE));
});

test('the script reads only CLAUDE_CODE_SUBAGENT_MODEL, CLAUDE_CODE_SUBAGENT_MODEL_FORCE, CLAUDE_EFFORT and CLAUDE_CODE_EFFORT_LEVEL, each by name', () => {
  assert.deepEqual(ENV_NAMES, ['CLAUDE_CODE_SUBAGENT_MODEL', 'CLAUDE_CODE_SUBAGENT_MODEL_FORCE', 'CLAUDE_EFFORT', 'CLAUDE_CODE_EFFORT_LEVEL']);
  assert.deepEqual(Object.keys(readEnv()), ENV_NAMES);
  // In the source, process.env appears only as process.env.<one of the three names>.
  const src = fs.readFileSync(SCRIPT, 'utf8');
  const uses = [...src.matchAll(/process\.env\b(\.[A-Z_]+)?/g)].map(m => m[1]?.slice(1));
  assert.deepEqual(uses.sort(), [...ENV_NAMES].sort());
  // Nor is the environment taken any other way: process['env'], { env } = process, or process copied.
  for (const other of [/process\s*\[/, /\{[^}]*\benv\b[^}]*\}\s*=\s*process\b/, /=\s*process\s*[;,)]/, /globalThis\.process/]) assert.doesNotMatch(src, other);
  // A whole environment passed in is read the same as just the three names.
  const full = { CLAUDE_CODE_SUBAGENT_MODEL: 'haiku', CLAUDE_EFFORT: 'high', GITHUB_TOKEN: 'ghp_not_a_real_token', PATH: '/bin' };
  const p = tmp(), q = tmp();
  const a = run(p, ['plan', '--reviewers', 'generalist', '--combine', 'pooled', '--main-model', 'claude-opus-5-5'], T, full);
  const b = run(q, ['plan', '--reviewers', 'generalist', '--combine', 'pooled', '--main-model', 'claude-opus-5-5'], T, { CLAUDE_CODE_SUBAGENT_MODEL: 'haiku', CLAUDE_EFFORT: 'high' });
  assert.equal(a.label, b.label); assert.equal(a.sessionEffort, 'high'); assert.deepEqual(a.type.models, b.type.models);
  assert.ok(!fs.readFileSync(path.join(p, 'reviews/review-log.jsonl'), 'utf8').includes('ghp_'));
  // From the command line, the variables still reach the plan.
  const r = spawnSync(process.execPath, [SCRIPT, 'plan', '--reviewers', 'generalist', '--combine', 'pooled', '--project', tmp()], { input: T, encoding: 'utf8', env: { ...process.env, CLAUDE_CODE_SUBAGENT_MODEL: 'sonnet', CLAUDE_CODE_SUBAGENT_MODEL_FORCE: '1', CLAUDE_EFFORT: 'medium' } });
  const plan = JSON.parse(r.stdout);
  assert.equal(plan.type.models.env, 'sonnet'); assert.equal(plan.type.models.force, true); assert.equal(plan.sessionEffort, 'medium');
});

test('the docs say where the briefs are and which environment variables the script reads', () => {
  for (const f of ['README.md', 'plugin/README.md']) {
    const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.match(s, /\*\*The briefs are fixed templates\.\*\* Their wording is in Markdown files in the skill's `briefs\/` folder/);
    assert.match(s, /only its own brief templates \(the Markdown files in the skill's `briefs\/` folder, when it plans a run\) and the review log folder/);
    assert.match(s, /four environment variables, each by name/);
    assert.match(s, /it won't plan a run if their texts differ from the ones that version of Council Dial shipped with/);
    assert.doesNotMatch(s, /briefs live in the script/);
  }
  assert.match(fs.readFileSync(path.join(SKILL, 'SKILL.md'), 'utf8'), /fills it in from the templates in the skill's `briefs\/` folder/);
});
