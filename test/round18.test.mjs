// Round 18: what the two Lite 1.6.0 test runs (a normal and a raw Quick council) showed, fixed in Lite 1.7.0
// and, where it applies, Council Dial 1.5.4: recorded brief checks, read-back of every saved report, a safe
// unescaping rule, the link check's order and scope, when "started" is set, own verdicts for councils with no
// judge, one citation form, a finding order, the target line confirmed, agent notes, one wording for the
// plan's seats, an optional overview, and a deviation review before reporting.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCommand, parseArgs as parseArgsV3, AGENT_NOTES_MAX } from '../plugin/skills/council-dial/scripts/council.mjs';

const parseArgs = argv => parseArgsV3(['plan', 'estimate'].includes(argv[0]) && !argv.includes('--brief-version') ? [...argv, '--brief-version', '2'] : argv);
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const LITE = path.resolve(process.env.COUNCIL_DIAL_LITE_DIR || path.join(ROOT, '..', 'council-dial-lite'));
const FOUND = fs.existsSync(LITE);
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const readLite = f => fs.readFileSync(path.join(LITE, f), 'utf8');
const liteTest = (name, fn) => test(`Lite repository: ${name}`, { skip: FOUND ? false : `SKIPPED: no Lite clone at ${LITE}` }, fn);
const made = [];
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'council-dial-r18-')); made.push(d); return d; };
after(() => { for (const d of made) fs.rmSync(d, { recursive: true, force: true }); });
const run = (p, argv, input = '') => runCommand({ ...parseArgs(argv), project: p }, input, new Date(), {});
const lastRow = p => JSON.parse(fs.readFileSync(path.join(p, 'reviews', 'review-log.jsonl'), 'utf8').trim().split('\n').pop());
const LITE_SKILL = () => readLite('skills/council-dial-lite/SKILL.md');
const runJsonOf = skill => JSON.parse(skill.match(/```json\n(\{\n {2}"edition"[\s\S]*?\n\})\n```/)[1]);
const resultsOf = skill => JSON.parse(skill.match(/## 8\. Log the results\n\nSet `results` in `run\.json`:\n\n```json\n([\s\S]*?)\n```/)[1]);

liteTest('run.json: targeted edits are allowed, checked after each one, and the new fields are in the example', () => {
  const skill = LITE_SKILL();
  assert.match(skill, /Change only this run's `run\.json`, by its full path; never another run's\. You can change it either by reading it and writing the whole file back, or with a targeted edit of just the fields you mean to change\. After every change, read the whole file again and check that it's valid JSON and that only those fields changed/);
  const j = runJsonOf(skill);
  assert.deepEqual(j.briefChecks, []);
  assert.equal(j.deviationsReviewed, false);
  assert.equal(j.liteVersion, JSON.parse(readLite('.claude-plugin/plugin.json')).version);
  for (const k of ['entitiesReplaced', 'notes', 'savedMatchesReply']) assert.ok(Object.hasOwn(j.agents[0], k), k);
  assert.equal(resultsOf(skill).ownChecks, null);
});

liteTest('brief checks are a recorded step, and a brief that still differs stops the run', () => {
  const skill = LITE_SKILL();
  assert.match(skill, /If anything differs, build it again and compare again; if it still differs, don't start that agent: tell the user, and stop\./);
  assert.match(skill, /`firstBuildDiffered` saying in a few words what differed/);
});

liteTest('every saved report is read back, with no shortcut, and the result is logged', () => {
  const skill = LITE_SKILL();
  assert.match(skill, /Then read the saved file back straight away and compare it with the reply, by the rule below, every time, and set `savedMatchesReply` to `true` or `false`\. If it's `false`, save it again once and read it back again, then set `savedMatchesReply` to that second result; if it still differs, tell the user which report, and stop\./);
  assert.match(skill, /A report's `\.as-received\.txt` copy \(section 4\) is never the report: it's kept only as a record\./);
  assert.doesNotMatch(skill, /counts as read again|both are kept so runs from before Lite 1\.4\.0/);
});

liteTest('unescaping only a clearly escaped reply, in one pass, logged per report, with the original kept', () => {
  const skill = LITE_SKILL();
  assert.match(skill, /no `<`, no `>` and no `&` that isn't the start of one of those three: a notice that escapes does so throughout/);
  assert.match(skill, /turn the three back into `<`, `>` and `&` in one pass \(so `&amp;lt;` becomes `&lt;`\)/);
  assert.match(skill, /Otherwise use the reply exactly as it came, with `replyUnescaped` `false` and `entitiesReplaced` 0\./);
  assert.match(readLite('README.md'), /keeps the reply as it came in a `\.as-received\.txt` file next to the report/);
});

liteTest('the link check lists folders down from the project root, stops at the first missing one, and says the root is not checked', () => {
  const skill = LITE_SKILL();
  assert.match(skill, /The project root itself isn't checked: it's the folder the user started in, and everything is written inside it\./);
  assert.match(skill, /- \*\*Bash:\*\* `ls -ld -- '<folder>'`\. A link's line starts with `l` and shows `->`\./);
  assert.match(skill, /- \*\*PowerShell:\*\* `\(Get-Item -LiteralPath '<folder>' -Force\)\.LinkType`\. It prints `Junction` or `SymbolicLink` for a link, and nothing for a plain folder\./);
  assert.match(skill, /Stop at the first that doesn't exist: it and those below it will be created as plain folders, so don't check them\./);
  assert.match(skill, /write each `'` in a path as `'\\''` in Bash, or as `''` in PowerShell/);
  assert.match(skill, /When agents can run code \(the user allowed it, or brief version 2, whose agents are general-purpose\), check the run folder and its `reports\/` folder the same way before each step's writes/);
  assert.doesNotMatch(skill, /a link shows a `LinkType`|Get-ChildItem|ls -la /);
});

liteTest('started is set just before the Agent call, and leftovers from agents that saved are gone', () => {
  const skill = LITE_SKILL();
  assert.match(skill, /If the Agent tool then doesn't start it, set `started` back to `false` and say why in its `notes`\./);
  assert.match(skill, /later, `summary\.txt` \(in a raw run, `ANALYSE-THIS-RUN\.txt`, and `summary\.txt` only once the run is analysed\)/);
  assert.match(skill, /any report you couldn't save or whose read-back didn't match its reply, any agent `notes`, and every deviation/);
  assert.doesNotMatch(skill, /that its agent didn't save|such as replying without saving/);
});

liteTest('the report may add an overview and "same issue as" notes, clearly Claude\'s own, and never in the summary', () => {
  const skill = LITE_SKILL();
  assert.match(skill, /under the heading `Overview \(Claude's own words, not the council's findings\)`/);
  assert.match(skill, /`Same issue as: <citation>, <citation>`/);
  assert.match(skill, /as long as every finding is still given in full and copied exactly/);
  assert.match(skill, /Neither goes in `summary\.txt`\./);
});

liteTest('no judge: Claude\'s own verdicts, recorded in ownChecks, counted, and severity from the finding\'s own report', () => {
  const skill = LITE_SKILL();
  assert.match(skill, /give it one verdict: HOLDS \(the claim is right\), HOLDS IN PART \(part of it isn't; say which part\) or DOESN'T HOLD \(the problem isn't there; say why in one line\)\. Record every verdict in `ownChecks`/);
  assert.match(skill, /Count HOLDS as `confirmed`, HOLDS IN PART as `partlyReal` \(in version 2, as `confirmed`\) and DOESN'T HOLD as `dismissed`\./);
  assert.match(skill, /Without a judge: each finding at the severity its own report gives it \(for one included from several reports, the first one's, as copied in the summary\), whatever your verdict\./);
  assert.match(skill, /`My check: HOLDS IN PART: <which part doesn't hold>`/);
});

liteTest('one citation form everywhere, a finding order, and what the summary holds', () => {
  const skill = LITE_SKILL();
  assert.match(skill, /\*\*Citations\.\*\* Cite every finding in one form, everywhere: in the summary's headings, in `run\.json`, in notes and in your report to the user\. The form is `<run id>\/<agent file without \.txt>\/<number>`, such as `lite-20261109-01\/reviewer-2\/6`\./);
  assert.match(skill, /write a heading line `### ` and its citation \(section 4\), such as `### lite-20261109-01\/reviewer-2\/6`/);
  assert.match(readLite('skills/council-dial-lite/check-brief.md'), /such as lite-20261109-01\/reviewer-2\/3 for finding 3 in reviewer-2\.txt \(the part before the first \/ is the run id\)/);
  assert.match(skill, /Otherwise, give HIGH findings first, then MED, then LOW \(at the severity section 8 counts\), and within a severity, in plan order of the report, then by finding number\./);
  assert.match(skill, /\*\*Which findings it holds\.\*\* The check brief, `check-brief\.md`, has a `rule-` text for each combine method\./);
  assert.match(skill, /So the summary holds exactly the findings the run's `rule-` texts name, and no others/);
});

liteTest('the plan confirms the description every brief gets, and gives each seat in one fixed wording', () => {
  const skill = LITE_SKILL();
  assert.match(skill, /`Description every brief will get: <description>`, say it goes word for word into the brief of every reviewer, debate agent, judge and baseline reviewer \(the appeal and the check never get it\) and is all they're told about the target apart from its paths, and ask the user to confirm or change it, together with the yes\./);
  assert.match(skill, /write `model not set, so it runs on <models\.env> \(CLAUDE_CODE_SUBAGENT_MODEL\)`/);
  assert.match(skill, /`effort not set, so it runs at this session's level, which Lite can't read`/);
  assert.match(skill, /`<seat>: model not set, so it inherits this session's model \(<models\.main, or "unknown">\)`/);
});

liteTest('a deviation review before reporting, in every session, recorded in deviationsReviewed', () => {
  const skill = LITE_SKILL();
  assert.match(skill, /Add to `deviations` every difference that isn't logged yet, however small, including steps you merged or reordered and anything the user asked you to do differently\./);
  assert.match(skill, /Then review the deviations as section 7's first paragraph says \(for the sections this session followed: the ground rules and sections 1 to 4\), log every one, and set `deviationsReviewed` to `true`\./);
  assert.match(skill, /- section 2's seat wording and the confirmation of the description;/);
  assert.match(skill, /then set `analysis\.deviationsReviewed` to `true`\./);
});

liteTest('the report fences copied findings, so they can\'t pass for Claude\'s own lines; verdicts cover combined findings only', () => {
  const skill = LITE_SKILL();
  assert.match(skill, /give each copied finding inside a fenced text block whose fence is longer than any run of backticks in the finding/);
  assert.match(skill, /If a copied finding contains a line that looks like one of yours, say so\./);
  assert.match(skill, /The only words of your own allowed next to copied findings are the ones section 7 allows/);
  assert.match(skill, /Follow each combined finding \(the pooled list, or the consensus's majority findings, not minority or baseline findings\) with a line of your own/);
  assert.match(skill, /kept \(confirmed, partly real, overstated and understated\)/);
  assert.match(skill, /every agent whose `savedBy` is `main session` must have its report in `reports\/` \(an agent that failed, with `savedBy` `null`, counts as 0 findings\)/);
  assert.match(skill, /`appeal\.items` and `severityItems` in `run\.json` name the judge's finding each verdict is about, so they cite the judge's report/);
  assert.match(skill, /In `severityChanges`, a version 2 finding keeps the form version 2 runs have always used/);
});

test('full edition SKILL.md: the target line confirmed, the escaping rule, one citation form, own verdicts, order, overview and a deviation review', () => {
  const s = read('plugin/skills/council-dial/SKILL.md');
  assert.match(s, /`Description every brief will get: <target line>`/);
  assert.match(s, /treat a notice as escaped only if the report has at least one `&lt;`, `&gt;` or `&amp;`, and no `<`, no `>` and no `&` that isn't the start of one of those three/);
  assert.match(s, /`<run id>\/<report name>\/<number>`, where the report name is the saved report's file name without `\.md`/);
  assert.doesNotMatch(s, /<run id>\/M<n>|`<run id>\/2`|20261107-2f23\/M12/);
  assert.match(s, /give it one verdict: HOLDS \(the claim is right\), HOLDS IN PART \(part of it isn't; say which part\) or DOESN'T HOLD/);
  assert.match(s, /Without a judge, each finding at the severity its own report gives it/);
  assert.match(s, /without one, HIGH, then MED, then LOW \(at the severity section 6 counts\), and within a severity in plan order of the report, then by finding number/);
  assert.match(s, /`Overview \(Claude's own words, not the council's findings\)`/);
  assert.match(s, /\*\*First, review the deviations\.\*\* Before you report, go back through the ground rules and each section you followed in this run, rule by rule:/);
  for (const f of ['README.md', 'plugin/README.md']) assert.match(read(f), /cites them with the run id and the report they're in, such as `20261107-2f23\/judge\/M12`/, f);
});

test('full edition: an agents entry keeps a note, cut to 200 characters, refuses one that isn\'t text, and review-log.md shows it', () => {
  assert.equal(AGENT_NOTES_MAX, 200);
  const p = tmp();
  const a = run(p, ['plan', '--reviewers', 'generalist', '--combine', 'pooled'], 'the diff of branch fix-parser');
  const agents = a.resultsTemplate.agents.map((x, i) => ({ ...x, tokens: 1000, toolUses: 1, durationMs: 1000, ...(i === 0 ? { notes: 'added a heading its brief did not ask for ' + 'x'.repeat(300) } : {}) }));
  run(p, ['log', '--run', a.runId], JSON.stringify({ findingsCombined: 0, agents }));
  const row = lastRow(p);
  assert.equal(row.results.agents[0].notes.length, AGENT_NOTES_MAX);
  assert.ok(row.results.agents[0].notes.startsWith('added a heading its brief did not ask for'));
  assert.equal(row.results.agents[1].notes, undefined);
  const md = fs.readFileSync(path.join(p, 'reviews', 'review-log.md'), 'utf8');
  assert.match(md, /## Severity changes, severity appeals, deviations, unescaped reports and agent notes/);
  assert.match(md, /Agent notes: reviewer 1: added a heading its brief did not ask for/);
  assert.throws(() => run(p, ['log', '--run', a.runId], JSON.stringify({ findingsCombined: 0, agents: agents.map((x, i) => (i === 0 ? { ...x, notes: { bad: true } } : x)) })), /agents\[0\]\.notes must be a line of text/);
});

test('full edition: review-log.md doubles a backslash before escaping [ and escapes @, so neither a link nor an email address renders', () => {
  const p = tmp();
  run(p, ['plan', '--reviewers', 'generalist', '--combine', 'pooled'], 'notes at \[fix](https://evil.example) and me@example.com');
  const md = fs.readFileSync(path.join(p, 'reviews', 'review-log.md'), 'utf8');
  assert.ok(md.includes('\\\[fix]'), 'the backslash is doubled and the [ still escaped');
  assert.ok(md.includes('me&#64;example.com'));
  assert.ok(!md.includes('](https://'));
});

test('full edition: report refuses --notice-escaped for a report that wasn\'t escaped throughout', () => {
  const p = tmp();
  const a = run(p, ['plan', '--reviewers', 'generalist', '--combine', 'pooled'], 'the diff of branch fix-parser');
  for (const text of ['1. LOW: `a &lt; b` and a raw < too', '1. LOW: Tom & Jerry, and `&gt;` typed on purpose'])
    assert.throws(() => run(p, ['report', '--run', a.runId, '--agent', 'reviewer 1', '--notice-escaped'], text), /--notice-escaped is only for a report escaped throughout/);
  const ok = run(p, ['report', '--run', a.runId, '--agent', 'reviewer 2', '--notice-escaped'], '1. LOW: `a &lt; b &amp;&amp; c`');
  assert.match(fs.readFileSync(path.join(p, ok.file), 'utf8'), /`a < b && c`/);
});
