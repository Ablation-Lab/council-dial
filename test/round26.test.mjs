// Round 26: what the three Lite 2.0.0 test councils showed, fixed in Lite 2.1.0 and, where it applies,
// Council Dial 1.7.0: findings in an agent's NOTES: slot, the user's calls on appeal items (with a new
// userSeverity), the (after review) tag, the judge's reason, word for word in later replies, the overview's
// tally of Claude's own verdicts, reading the material early, whole-file read-backs, NOTES: lines in a raw
// run's hand-off report, a case-insensitive instruction-file search, section 2's first lines and `started`.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCommand, parseArgs, checkResults } from '../plugin/skills/council-dial/scripts/council.mjs';
import { liteSkillText, liteSection } from './lite-skill.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const LITE = path.resolve(process.env.COUNCIL_DIAL_LITE_DIR || path.join(ROOT, '..', 'council-dial-lite'));
const FOUND = fs.existsSync(LITE);
const liteTest = (name, fn) => test(`Lite repository: ${name}`, { skip: FOUND ? false : `SKIPPED: no Lite clone at ${LITE}` }, fn);
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const readLite = f => fs.readFileSync(path.join(LITE, f), 'utf8');
const made = [];
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'council-dial-r26-')); made.push(d); return d; };
after(() => { for (const d of made) fs.rmSync(d, { recursive: true, force: true }); });
const NO_MANAGED = tmp();
const run = (p, argv, input = '') => runCommand({ ...parseArgs(argv), project: p, managedSettingsDir: NO_MANAGED }, input, new Date(), {});

// The one Glob both editions give for the instruction files, in any mix of upper and lower case.
const GLOB = '**/{[Cc][Ll][Aa][Uu][Dd][Ee].[Mm][Dd],[Cc][Ll][Aa][Uu][Dd][Ee].[Ll][Oo][Cc][Aa][Ll].[Mm][Dd],[Aa][Gg][Ee][Nn][Tt][Ss].[Mm][Dd],.[Cc][Ll][Aa][Uu][Dd][Ee]/**}';

test('the combined instruction-file pattern matches every name in any case, and nothing else', () => {
  const m = p => path.posix.matchesGlob(p, GLOB);
  for (const p of ['CLAUDE.md', 'run-1/claude.md', 'a/b/Claude.MD', 'CLAUDE.local.md', 'x/claude.LOCAL.md', 'AGENTS.md', 'deep/x/agents.md', '.claude/settings.json', 'r/.CLAUDE/x/y.json']) assert.ok(m(p), p);
  for (const p of ['README.md', 'reports/claude.txt', 'notclaude.md', 'CLAUDE.md.bak', 'agent.md', 'claude/x.md']) assert.ok(!m(p), p);
});

// ---- The full edition.
const res3 = (extra = {}) => ({ findingsPerReviewer: [3, 2, 1], findingsCombined: 5, confirmed: 1, partlyReal: 1, overstated: 1, understated: 1, dismissed: 1, verified: true, severity: { high: 2, med: 1, low: 2 }, wallMinutes: null, notes: '', ...extra });
const item = (x = {}) => ({ finding: 'r/M5: numbering', reviewers: ['MED', 'MED'], judge: 'LOW', view: 'too low', appealSeverity: 'MED', call: 'pending', ...x });
const appeal = (sev) => ({ appeal: { ran: true, reviewed: 1, items: [], severityReviewed: sev.length, severityItems: sev } });

test('full edition: userSeverity records the severity the user chose, and only when the call is changed', () => {
  const got = (sev, strict = true) => checkResults(res3(appeal(sev)), strict, 3).appeal.severityItems.map(x => [x.call, x.userSeverity]);
  assert.deepEqual(got([item()]), [['pending', null]]);
  assert.deepEqual(got([item({ call: 'changed', userSeverity: 'MED' })]), [['changed', 'med']]);
  // A TOO LOW or TOO HIGH one changed with no userSeverity takes the appeal's.
  assert.deepEqual(got([item({ call: 'changed' })]), [['changed', 'med']]);
  assert.deepEqual(got([item({ call: 'changed', userSeverity: 'HIGH' })]), [['changed', 'high']]);
  const bad = (x, re) => assert.throws(() => checkResults(res3(appeal([item(x)])), true, 3), re);
  bad({ call: 'kept', userSeverity: 'MED' }, /userSeverity is the severity the user changed it to, so it's null unless call is changed/);
  bad({ view: 'unsure', appealSeverity: null, call: 'changed' }, /call is changed, so userSeverity needs the severity the user chose/);
  bad({ call: 'changed', userSeverity: 'LOW' }, /userSeverity is the judge's LOW, so call is kept/);
  bad({ call: 'changed', userSeverity: 'CRITICAL' }, /userSeverity/);
  // A row logged before 1.7.0, read back from the log, isn't refused for lacking it.
  assert.deepEqual(got([item({ view: 'unsure', appealSeverity: null, call: 'changed' })], false), [['changed', null]]);
});

test('full edition: a logged userSeverity is kept, compared and shown in review-log.md', () => {
  const p = tmp();
  const pl = run(p, ['plan', '--reviewers', 'specialised', '--combine', 'judged', '--main-model', 'claude-opus-5-5'], 'src/a.mjs and README.md');
  run(p, ['log', '--run', pl.runId], JSON.stringify(res3(appeal([item({ call: 'changed', userSeverity: 'MED' })]))));
  const row = fs.readFileSync(path.join(p, 'reviews/review-log.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l)).find(r => r.kind === 'results');
  assert.equal(row.results.appeal.severityItems[0].userSeverity, 'med');
  assert.equal(run(p, ['compare']).byType[0].appeal.severity.changedByUser, 1);
  assert.match(fs.readFileSync(path.join(p, 'reviews/review-log.md'), 'utf8'), /r\/M5: numbering judge LOW, TOO LOW \(MED\), changed to MED/);
});

test('full edition SKILL.md: NOTES findings, the user\'s calls, the judge\'s reason, later replies, tags and the search', () => {
  const s = read('plugin/skills/council-dial/SKILL.md');
  assert.ok(s.includes(`One Glob, with the log folder as its path, covers all four: \`${GLOB}\`.`));
  assert.match(s, /in any mix of upper and lower case \(Glob is case-sensitive, and on Windows Claude Code loads a `claude\.md` too\)/);
  assert.match(s, /That includes a finding in its NOTES: slot, the one kind of text there that needs noting, although its prompt says findings go in the report/);
  assert.match(s, /in a section of their own headed `Raised in NOTES, not ruled on` rather than with the others/);
  assert.match(s, /"call": "kept" \| "changed" \| "pending", "userSeverity": null\}`/);
  assert.match(s, /\*\*The user's calls:\*\* give `log` the same results as before \(reuse the input file/);
  assert.match(s, /`notes` never states the user's calls or says one is pending: the appeal items hold them/);
  assert.match(s, /from `My severity is LOW, because the slugs are still unique…` quote `because the slugs are still unique…`/);
  assert.match(s, /The reason is the first sentence left that names a severity \(HIGH, MED or LOW\), or says the severity is lower or higher or the finding more or less serious, and says more than the severity itself/);
  assert.match(s, /A sentence that only states a severity, such as `My severity is LOW.`, doesn't count, and nor does a sentence that names no severity, however much it explains/);
  assert.match(s, /Third, if no `Reason:` line and no sentence counts, the reason is "the judge gave no reason line" for OVERSTATED and UNDERSTATED, which you note in the judge's agent `notes`, and "no reason given" for any other ruling\./);
  assert.match(s, /here or in any later reply to the user \(such as after the user calls an appeal item\), copy it exactly from the saved report: never restate its claim, fix or warnings in your own words; where you don't copy it, cite it\./);
  assert.match(s, /with `\(logged late\)` or, for one made after the report, `\(after review\)` after it; if no call is pending, run `log` again for it then\./);
  assert.match(s, /5\. \*\*Logged late\.\*\* Is there anything you noticed earlier but haven't noted yet\? Note it now, with `\(logged late\)` after it\./);
  assert.match(s, /reuse the input file you wrote for the first `log`; if it's gone, rebuild them from `resultsTemplate` and the run's row in `review-log\.jsonl`, giving each agent's `effort` as you passed it/);
  assert.match(s, /keep the judge's severity, or change it, and to which severity \(for TOO LOW or TOO HIGH, the appeal's unless they name another; for UNSURE, ask\)\./);
  assert.match(s, /put that first in `notes`, which `log` cuts to 200 characters/);
});

test('full edition: the user\'s-calls flow re-logs with only the item changed, and odd read-back values are dropped, not fatal', () => {
  const p = tmp();
  const pl = run(p, ['plan', '--reviewers', 'specialised', '--combine', 'judged', '--main-model', 'claude-opus-5-5'], 'src/a.mjs and README.md');
  // The item exactly as SKILL.md writes it, with "userSeverity": null.
  const first = res3(appeal([item({ userSeverity: null })]));
  run(p, ['log', '--run', pl.runId], JSON.stringify(first));
  const second = run(p, ['log', '--run', pl.runId], JSON.stringify({ ...first, ...appeal([item({ call: 'changed', userSeverity: 'medium' })]) }));
  assert.equal(second.replaced, true);
  const rows = () => fs.readFileSync(path.join(p, 'reviews/review-log.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l)).filter(r => r.kind === 'results');
  const last = rows().at(-1).results;
  assert.equal(last.appeal.severityItems[0].userSeverity, 'med');
  assert.deepEqual(last.severity, first.severity);
  assert.equal(last.confirmed, first.confirmed);
  // TOO HIGH takes the appeal's severity when changed without one.
  assert.equal(checkResults(res3(appeal([item({ reviewers: ['MED'], judge: 'HIGH', view: 'too high', appealSeverity: 'MED', call: 'changed' })])), true, 3).appeal.severityItems[0].userSeverity, 'med');
  assert.throws(() => checkResults(res3(appeal([item({ view: 'fair', appealSeverity: null, call: 'kept', userSeverity: 'MED' })])), true, 3), /null unless call is changed/);
  // Read back from the log (not strict), a userSeverity that doesn't fit is dropped, and the row is kept.
  // (A changed TOO LOW item whose value is dropped then takes the appeal's MED, as on the strict path.)
  for (const [x, want] of [[{ call: 'pending', userSeverity: 'MED' }, null], [{ call: 'changed', userSeverity: 'LOW' }, 'med'], [{ call: 'changed', userSeverity: 'nonsense' }, 'med']]) {
    assert.equal(checkResults(res3(appeal([item(x)])), false, 3).appeal.severityItems[0].userSeverity, want, JSON.stringify(x));
  }
  // A row logged before 1.7.0 (no userSeverity), with a TOO LOW item changed, reads back with the appeal's severity.
  const old = JSON.parse(JSON.stringify(rows().at(-1)));
  delete old.results.appeal.severityItems[0].userSeverity;
  fs.appendFileSync(path.join(p, 'reviews/review-log.jsonl'), JSON.stringify(old) + '\n');
  const g = run(p, ['compare']);
  assert.equal(g.skippedLogLines ?? 0, 0);
  assert.equal(g.byType[0].appeal.severity.changedByUser, 1);
});

test('full edition READMEs: the research intro, the connector limit and the 1.7.0 notes, in step', () => {
  for (const f of ['README.md', 'plugin/README.md']) {
    const r = read(f);
    assert.match(r, /\*\*Why it exists:\*\* Council Dial is part of Ablation Lab's open research into how AI agents behave and how they review each other's work\./, f);
    assert.match(r, /The research is at \[Ablation-Lab\/evolving-review-councils\]\(https:\/\/github\.com\/Ablation-Lab\/evolving-review-councils\)\./, f);
    assert.match(r, /- Connectors you've enabled can reach every council agent\./, f);
    assert.match(r, /Only 2 of the 13 mentioned it in their NOTES:, so agents usually don't report it\. Council Dial can't stop that\./, f);
    for (const k of ['`/mcp`: "You can also run', 'The `disableClaudeAiConnectors` setting: "To turn off', 'The environment variable `ENABLE_CLAUDEAI_MCP_SERVERS`, set to `false`, "which has the same effect for the current shell session"', 'The `deniedMcpServers` setting: "To block individual claude.ai connectors']) assert.ok(r.includes(`  - ${k}`), `${f}: ${k}`);
    assert.match(r, /from Council Dial 1\.7\.0, a severity you change is logged as that item's `userSeverity`/, f);
    assert.match(r, /"Raised in NOTES, not ruled on"/, f);
    assert.ok(r.indexOf('**Why it exists:**') < r.indexOf('## Quick start'), `${f}: the intro is near the top`);
    assert.ok(r.includes("The appeal sees only the judge's own findings (the ones it dismissed and, in brief version 3, the ones in its severity block), never the reviewers' reports") && !r.includes('The appeal sees only the findings it dismissed'), `${f}: the merge limit names the severity block`);
  }
});

// ---- Lite.
liteTest('SKILL.md: word for word in later replies, the case-insensitive search, one search, and the (after review) tag', () => {
  const s = readLite('skills/council-dial-lite/SKILL.md');
  assert.ok(s.length < 16000, `SKILL.md is ${s.length} characters`);
  assert.match(s, /Whenever a finding, or any part of it such as its fix or a warning in it, goes into a block for another agent, the summary, your report or any later reply to the user \(such as after the user calls an appeal item\), copy it character for character/);
  assert.match(s, /Never restate its claim, fix or warnings in your own words; where you don't copy it, cite it\. Your own view of it, such as whether it holds, is fine when it's plainly marked as yours and kept outside the copied text\./);
  assert.ok(s.includes(`One Glob, with the Lite folder as its path, covers all four: \`${GLOB}\`.`));
  assert.match(s, /One search covers the later occasions too, as long as nothing in this session that could write there has run since, apart from your own writes of the run's files: no agent that can write \(section 3\) and no command other than the link check\. Search again after a compaction, or if the user says files there changed\./);
  assert.match(readLite('skills/council-dial-lite/report-and-log.md'), /One you make after the flag is `true`, such as in a reply after the report, is added the same way with `\(after review\)` after it instead\./);
  assert.match(readLite('skills/council-dial-lite/report-and-log.md'), /A step this skill asks for after the report, such as logging the user's call on an appeal item \(section 8\), isn't a deviation\./);
});

liteTest('plan.md: section 2\'s first lines, when started is set, NOTES findings and whole-file read-backs', () => {
  const p1 = liteSection(LITE, 2), p3 = liteSection(LITE, 3);
  assert.match(p1, /Start the plan with a line or two giving the type, the agent count and the estimate, and saying that bigger material costs more, because every reviewer reads all of it\. The rest of the plan, below, follows them, including the Lite folder notice \(section 3\) if this run will create the folder\./);
  assert.doesNotMatch(p1, /estimate in one or two lines/);
  assert.match(p3, /1\. Save its brief to `briefs\/` \(section 3, "Briefs"\)\.\n2\. Make one `run\.json` change that sets its `started` to `true`\. The same change may hold its `briefChecks` entry\.\n3\. Read `run\.json` back, as below\. A search or a re-read of reports that a step asks for may also come here; no other write and no Agent call may\.\n4\. Make its Agent call/);
  assert.match(p3, /\nThat includes a finding in its NOTES: slot, the one kind of text there that needs noting, although its prompt says findings go in the report/);
  assert.match(p3, /Such an item isn't a council finding, even when the judge or the appeal raised it there: it isn't a merged finding the judge ruled on, and no appeal checked it, so it stays out of the summary, every count and your own checks, and section 7 shows it apart\./);
  assert.match(p3, /A read-back, of `run\.json` or of any saved file, is one Read of the whole file with no `offset` or `limit`: a read from a line onwards, of some of its lines, or a search such as Grep isn't one\./);
});

liteTest('sections 5, 7, 8 and 10: early checks, the tally, the judge\'s reason, NOTES findings, the user\'s calls and the raw report', () => {
  const s5 = liteSection(LITE, 5), s7 = liteSection(LITE, 7), s8 = liteSection(LITE, 8), s10 = liteSection(LITE, 10);
  assert.match(s5, /\*\*Your own checks may come first\.\*\* Without a judge, or with a baseline, you may read the material for your own checks \(section 8\) before you write the summary/);
  assert.match(s5, /Without a judge, it may end with their tally, taken from your verdicts \(which section 8 records in `ownChecks`\), in exactly this form: `My own checks: 27 hold, 5 hold in part, 0 don't hold\.` That sentence is the only place your report, and `results\.notes`, may take a tally of your verdicts from\./);
  assert.match(s5, /It can't confirm your verdicts, which aren't in the reports/);
  assert.match(s7, /1\. \*\*Read-backs\.\*\* Did you read `run\.json` back in full, with no `offset` or `limit`/);
  assert.match(s7, /Otherwise write `see the judge's ruling`, without quotes, and log `null`\./);
  assert.match(s7, /An agent whose NOTES: lines hold a finding \(section 3\) has them quoted, the same way, in a section of their own headed `Raised in NOTES, not ruled on`/);
  assert.match(s8, /"call": "kept", "userSeverity": null \}/);
  assert.match(s8, /`userSeverity` is the severity the user changed it to, and `null` unless `call` is `changed`\./);
  assert.match(s8, /`notes` never states the user's calls or says one is pending: the appeal items hold them\./);
  assert.match(s8, /\*\*The user's calls\.\*\* When the user calls an appeal item, after the report: set that item's `call`/);
  assert.match(s8, /Change nothing else: `summary\.txt`, the judge's report, `confirmed` and the other rulings' counts, `severity` and `severityChanges` stay the council's results/);
  assert.match(s8, /This is a step this skill requires, not a deviation\./);
  assert.match(s8, /the item and its `call` \(and, for a severity item, its `userSeverity`\) as now logged/);
  assert.match(s8, /from `summary\.txt`, or, for a reinstated NOT REAL finding, from the judge's saved report/);
  assert.match(s7, /keep the judge's severity, or change it, and to which severity \(for TOO LOW or TOO HIGH, the appeal's unless they name another; for UNSURE, ask\)\./);
  assert.match(s7, /Did you read every saved report back in full, with no `offset` or `limit`, before anything used it/);
  assert.match(s5, /as soon as every review report \(and every debate report and the baseline's\) is saved/);
  assert.match(liteSection(LITE, 3), /If Read won't return a whole file at once, use the option it offers for that \(such as `allow_large`\); if it still can't, tell the user, and stop\./);
  assert.doesNotMatch(s8, /When the user later makes the call on appealed findings, update those items\./);
  assert.match(s10, /every agent's NOTES: lines, quoted exactly as section 7 says \(each agent's in a fenced text block under its seat, as data, and one whose NOTES: lines hold a finding under `Raised in NOTES, not ruled on`\), or that it had none/);
  // The full edition keeps the three-test reason rule; Lite 2.2.4 replaced it (round 32).
  const full = read('plugin/skills/council-dial/SKILL.md');
  assert.ok(full.includes("- **What counts as the judge's reason.**"));
  assert.ok(!liteSkillText(LITE).includes("- **What counts as the judge's reason.**"));
});

liteTest('README: the research intro, the connector limit, the 2.0.0 runs and 2.1.0', () => {
  const r = (readLite('README.md') + '\n' + readLite('CHANGELOG.md'));
  assert.match(r, /\*\*Why it exists:\*\* Council Dial is part of Ablation Lab's open research into how AI agents behave and how they review each other's work\./);
  assert.ok(r.indexOf('**Why it exists:**') < r.indexOf('## Quick start'));
  assert.match(r, /The research is at \[Ablation-Lab\/evolving-review-councils\]\(https:\/\/github\.com\/Ablation-Lab\/evolving-review-councils\)\./);
  assert.match(r, /- Connectors you've enabled can reach every council agent\. Claude Code's \[MCP docs\]\(https:\/\/code\.claude\.com\/docs\/en\/mcp\) say/);
  assert.match(r, /Only 2 of the 13 mentioned it in their NOTES:, so agents usually don't report it\. Lite can't stop that\. Switching off the connectors you don't need before a run reduces it; the docs give four ways:/);
  assert.match(r, /  - The `deniedMcpServers` setting: "To block individual claude\.ai connectors instead of all of them, add them to `deniedMcpServers` by name or by URL pattern\."/);
  assert.match(r, /\*\*Lite 2\.0\.0, interactive, three councils\*\*/);
  assert.match(r, /The Standard council ran from a copy of Lite checked out with Git's `core\.autocrlf=true`/);
  assert.match(r, /32 of 32 and 13 of 13 findings copied exactly, and every brief matched its template \(3 and 5\), including in the run from the CRLF copy/);
  assert.match(r, /Claude Code compacted the Standard session while it was idle, after the run and its follow-up answers/);
  assert.match(r, /Lite 2\.1\.0 addresses what the 2\.0\.0 runs left/);
  assert.ok(r.includes("The appeal sees only the judge's own findings (the ones it dismissed and, in brief version 3, the ones in its severity block), never the reviewers' reports") && !r.includes('The appeal sees only the findings it dismissed'));
  assert.match(r, /Lite 2\.1\.1 corrects one README line, which since brief version 3 had said the appeal sees only the findings the judge dismissed/);
  assert.match(r, /Not tested yet: .*Lite 2\.2\.3's and 2\.2\.4's changes in a complete council run \(the last complete one was a Standard council on an installed copy of 2\.2\.2\); a compaction in the middle of a run;/);
  assert.match(r, /From Lite 2\.1\.0 the search matches the names in any mix of upper and lower case/);
  assert.match(r, /\(such as `\(Lite 2\.2\.4\)`,/);
});

test('the destructive-command example: in both descriptions, within 500 characters, and in all three READMEs', () => {
  const descs = [
    [JSON.parse(read('plugin/.claude-plugin/plugin.json')).description, JSON.parse(read('.claude-plugin/marketplace.json')).plugins[0].description],
  ];
  if (FOUND) descs.push([JSON.parse(readLite('.claude-plugin/plugin.json')).description, JSON.parse(readLite('.claude-plugin/marketplace.json')).plugins[0].description]);
  for (const [a, b] of descs) {
    assert.equal(a, b);
    // Anthropic's Plugins API refuses a plugin.json description over 500 characters.
    assert.ok(a.length <= 500, `the description is ${a.length} characters`);
    assert.match(a, /rm -rf whose target could resolve to the wrong data|rm -rf that could delete the wrong data/);
    assert.match(a, /read-only (agents )?by default/);
  }
  const example = "For example, a council can review code or scripts for destructive commands, such as a recursive delete (`rm -rf`) whose target could resolve to data that shouldn't be deleted, alongside ordinary bugs, security problems and docs that don't match the code. The reviewers only read the material and report what they find (by default they can't run anything), and a council lowers the chance of missing a problem but doesn't guarantee it finds every one.";
  const files = [read('README.md'), read('plugin/README.md')];
  if (FOUND) files.push(readLite('README.md'));
  for (const r of files) {
    assert.ok(r.includes(`You make the final call on what to keep.\n\n${example}`));
    assert.ok(r.indexOf(example) < r.indexOf('## Quick start'));
  }
});
