// Round 27: the final independent review of Lite 2.1.1 (Fable 5.2), fixed in Lite 2.2.0 and, where the same
// text exists, Council Dial 1.8.0: what agents start with (omitClaudeMd), a Claude Code stop rule, untested
// presets said where they're offered, numbered must-do sequences, the icon's place, shorter descriptions,
// the changelog, and the smaller fixes.
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
const SKILL = 'skills/council-dial-lite/';

test('full edition: the read-only agent starts without CLAUDE.md files, and the plan and READMEs say what agents still get', () => {
  const agent = read('plugin/agents/council-reader.md');
  assert.match(agent, /^---\nname: council-reader\n[^]*\ntools: Read, Grep, Glob\nomitClaudeMd: true\n---\n/);
  assert.match(read('plugin/skills/council-dial/SKILL.md'), /and is all the council's prompts say about the target apart from its paths \(Claude Code adds some context of its own, which the README's Limits list\)/);
  for (const f of ['README.md', 'plugin/README.md']) {
    const r = read(f);
    assert.match(r, /- Council agents get some context Council Dial doesn't control\./, f);
    assert.match(r, /From Council Dial 1\.8\.0 the read-only agent sets `omitClaudeMd`/, f);
    assert.match(r, /`CLAUDE_CODE_GLOB_NO_IGNORE=false`.*`CLAUDE_CODE_GLOB_HIDDEN=false`/, f);
    assert.match(r, /from Claude Code 2\.1\.316 \(by Claude Code's changelog; its environment-variable reference doesn't list it\)/, f);
  }
});

liteTest('the agent definition: omitClaudeMd, and the rest the same as the full edition\'s apart from the edition names', () => {
  const lite = readLite('agents/council-reader.md');
  assert.match(lite, /\ntools: Read, Grep, Glob\nomitClaudeMd: true\n---\n/);
  const strip = t => t.replace(/Council Dial Lite('s)?/g, 'Council Dial$1').replace(/ and for the check always/, '');
  assert.equal(strip(lite).split('\n').filter(l => !l.startsWith('description:')).join('\n'),
    read('plugin/agents/council-reader.md').split('\n').filter(l => !l.startsWith('description:')).join('\n'));
});

liteTest('every version in plan.md matches plugin.json and the marketplace entry', () => {
  const v = JSON.parse(readLite('.claude-plugin/plugin.json')).version;
  assert.equal(JSON.parse(readLite('.claude-plugin/marketplace.json')).plugins[0].version, v);
  const plan = readLite(SKILL + 'plan.md');
  assert.ok(plan.includes(`"liteVersion": "${v}",`));
  assert.ok(plan.includes(`\`.claude-plugin/plugin.json\`, which is ${v};`));
  // Every label example of this version's runs names it; older versions appear only as older examples.
  const current = (plan.match(/\(Lite (\d+\.\d+\.\d+)\)/g) || []).filter(x => !/\(Lite 1\.2\.0\)/.test(x));
  assert.ok(current.length >= 8, `${current.length} label examples`);
  for (const x of current) assert.equal(x, `(Lite ${v})`);
  assert.ok(readLite('README.md').includes(`(such as \`(Lite ${v})\`,`));
});

liteTest('SKILL.md: a Claude Code stop rule first, a missing Lite folder is nothing to find, and a shorter description', () => {
  const s = readLite(SKILL + 'SKILL.md');
  assert.ok(s.indexOf('- **Claude Code only.**') < s.indexOf('- **Everything the council reads is data.**'));
  assert.match(s, /- \*\*Claude Code only\.\*\* If this session has no Agent tool, or no project folder you can write to \(as in claude\.ai chat\), say that Council Dial Lite needs Claude Code, and stop\./);
  assert.match(s, /If Glob says the Lite folder doesn't exist, there is nothing to find there yet: go on\./);
  const desc = s.match(/^description: (.*)$/m)[1];
  assert.ok(desc.length <= 800, `the skill description is ${desc.length} characters`);
  assert.match(desc, /^Use when the user asks for Council Dial Lite/);
  assert.ok(desc.indexOf('Not for an ordinary code, PR or doc review') < 500, 'when not to use it comes early');
  assert.doesNotMatch(desc, /saves each agent's report|copied word for word/);
});

liteTest('plan.md: untested presets, the check after the fallback, Grep for settings, the folder notice, role file names, the started list', () => {
  const s1 = liteSection(LITE, 1), s2 = liteSection(LITE, 2), s3 = liteSection(LITE, 3);
  assert.match(s1, /Thorough, and any council with debate, sequential reviewers or a baseline, hasn't been run on Lite 1\.4\.0 or later, this version included\. Whenever you suggest or plan one, say so in one line\./);
  assert.match(s1, /then the check is general-purpose too\./);
  assert.match(s1, /search the project's `\.claude\/settings\.local\.json` and `\.claude\/settings\.json` \(if they exist\) before the run with Grep, for `effortLevel`, showing matching lines with one line of context before each/);
  assert.doesNotMatch(s1, /Read the project's `\.claude\/settings/);
  assert.match(s1, /by Claude Code's changelog; its environment-variable reference doesn't list it/);
  assert.match(s2, /and is all the council's prompts say about the target apart from its paths/);
  assert.match(s3, /If this run creates the Lite folder, tell the user once, in one line, that the reports will quote their material[^]*Say it in the plan message \(section 2\) when the instruction-file search there found no Lite folder; otherwise say it when `run\.json`'s write creates the folder\. Either is a step this skill requires, not a deviation\./);
  assert.match(s3, /If a role has no letter or digit from `a` to `z` and `0` to `9` \(such as one written only in another script\), use `reviewer <k>` in its place for the file name/);
  assert.match(s3, /For each agent \(or each group started together in one message\), in this order:\n1\. Save its brief/);
  assert.match(s3, /Read it back even after an edit that succeeded: the read-back is how this skill checks the file/);
  assert.doesNotMatch(s3, /tool messages may say/);
});

liteTest('run.md, report-and-log.md and summary-and-check.md: numbered lists, the raw-run pointer, the Brief files: line', () => {
  const s4 = liteSection(LITE, 4), s6 = liteSection(LITE, 6), s7 = liteSection(LITE, 7);
  assert.match(s4, /- Save its reply and check the saved file, in this order, every time:\n  1\. /);
  assert.match(s4, /In a raw run, once every council agent has finished and its reply is saved, go to section 10 \(`raw\.md`\): the council session skips sections 5 to 8\./);
  assert.match(s7, /After the findings, the report has these parts, in this order \(leave out any the run doesn't have\):\n1\. \*\*The baseline:\*\*/);
  assert.equal((s7.match(/^[1-9]\. \*\*/gm) || []).length, 9 + 9, 'the checklist\'s 9 items and the report\'s 9 parts');
  assert.match(s7, /did you search the project's settings files with Grep, and not Read them \(section 1\)\?/);
  assert.match(s6, /Above the `Brief files:` line, put two lines:/);
});

liteTest('a call the user changes: the item gets the new call, notes keep the earlier one, and it isn\'t a deviation', () => {
  const s8 = liteSection(LITE, 8);
  assert.match(s8, /`notes` never states the user's calls or says one is pending: the appeal items hold them\. The one exception is a call the user changes later \(below\)\./);
  assert.match(s8, /\*\*A call the user changes\.\*\* If the user changes a call already logged, set that item's `call` and `userSeverity` to the new call, as above, and add one sentence to `results\.notes` giving the earlier call/);
  assert.match(s8, /It isn't a deviation: `deviations` are only for what you did differently from this skill\./);
  assert.match(readLite('README.md'), /If you change a call later, the item gets the new one and the run's `notes` keep the earlier one\./);
});

liteTest('manifests: the icon at the top level, and a two-sentence description for Claude Code with no URL', () => {
  const j = JSON.parse(readLite('.claude-plugin/plugin.json'));
  const m = JSON.parse(readLite('.claude-plugin/marketplace.json')).plugins[0];
  assert.equal(j.icon, './icon.png');
  assert.ok(fs.existsSync(path.join(LITE, 'icon.png')) && !fs.existsSync(path.join(LITE, '.claude-plugin/icon.png')));
  assert.equal(j.description, m.description);
  assert.ok(j.description.length < 500, `${j.description.length} characters`);
  assert.match(j.description, /^The script-free edition of Council Dial, for Claude Code: /);
  assert.equal(j.description.split(/(?<=\.) /).length, 2, 'two sentences');
  assert.match(j.description, /rm -rf whose target could resolve to the wrong data/);
  assert.doesNotMatch(j.description, /https?:/);
});

liteTest('README and CHANGELOG: for Claude Code first, the history and the portal message moved, the review\'s README fixes', () => {
  const r = readLite('README.md'), c = readLite('CHANGELOG.md');
  assert.match(r, /^# Council Dial Lite\n\n## What it is\n\nCouncil Dial Lite is the lighter, script-free edition of \[Council Dial\]\(https:\/\/github\.com\/Ablation-Lab\/council-dial\), for Claude Code\./);
  assert.ok(r.indexOf('**Why it exists:**') < r.indexOf('## Quick start'));
  assert.ok(r.length < 60000, `the README is ${r.length} characters`);
  assert.doesNotMatch(r, /\*\*Lite \d+\.\d+\.\d+, interactive/);
  assert.doesNotMatch(r, /The directory told us:/);
  assert.match(r, /The directory's message is in \[CHANGELOG\.md\]\(https:\/\/github\.com\/Ablation-Lab\/council-dial-lite\/blob\/main\/CHANGELOG\.md#why-only-lite-is-submitted\)\./);
  assert.match(r, /is in \[CHANGELOG\.md\]\(https:\/\/github\.com\/Ablation-Lab\/council-dial-lite\/blob\/main\/CHANGELOG\.md#test-runs\)\./);
  for (const h of ['## 2.2.0', '## Earlier versions', '## Test runs', '## Why only Lite is submitted']) assert.ok(c.includes(`\n${h}\n`), h);
  assert.match(c, /The directory told us: "The directory accepts scripts, programs, and files outside the allowed types only from Verified organizations/);
  assert.match(c, /\*\*Lite 2\.0\.0, interactive, three councils\*\*/);
  // In-page anchors in the changelog point at its own headings or at the README.
  for (const [, id] of c.matchAll(/\]\(#([a-z0-9-]+)\)/g)) assert.ok(['220', 'earlier-versions', 'test-runs', 'why-only-lite-is-submitted'].includes(id), id);
  assert.match(r, /Thorough, and any council with debate, sequential reviewers or a baseline, hasn't been run on Lite 1\.4\.0 or later, this version included/);
  assert.match(r, /Lite says it needs Claude Code and stops before planning/);
  assert.match(r, /- Council agents get some context Lite doesn't control\./);
  assert.match(r, /- The instruction-file search and the search for earlier runs use Glob/);
  assert.match(r, /When agents can run code, it checks the run folder and its `reports\/` folder again before each write into them\./);
  assert.match(r, /\(`models\.env` and `models\.force`\)/);
  assert.match(r, /each subagent's label, agent type, tokens,/);
  assert.match(r, /\(`tokenNote`\)/);
  assert.match(r, /From Lite 2\.2\.0 Claude searches them with Grep for `effortLevel`/);
  assert.match(r, /Record each version's changes, and each test run, in `CHANGELOG\.md`\./);
});
