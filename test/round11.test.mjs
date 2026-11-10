// Tests for Council Dial Lite, the script-free edition, which lives in its own repository,
// Ablation-Lab/council-dial-lite. Those tests read a clone of it: ../council-dial-lite next to this
// repository, or the folder COUNCIL_DIAL_LITE_DIR names. Without the clone they're skipped, loudly;
// with COUNCIL_DIAL_LITE_REQUIRED=1 a missing clone fails instead. The Lite repository itself holds no
// tests or scripts. Checked there: only Markdown, JSON, the licence, plain repo files and the icon;
// brief templates byte-identical to the full edition's; its own name, description and marketplace;
// its SKILL.md rules and README. Checked here: Lite runs are never read as full runs, and this
// repository's docs and marketplace point to the Lite repository.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { runCommand, parseArgs as parseArgsV3, councilType, stepCounts, VERSION, BRIEF_SHA256, BRIEF_SHA256_V3, briefDigest } from '../plugin/skills/council-dial/scripts/council.mjs';
import { liteSkillText } from './lite-skill.mjs';
// Written for brief version 2, which stays runnable: plan and estimate default to it in this file unless
// a test names a version (brief version 3 is tested in round15).
const parseArgs = argv => parseArgsV3(['plan', 'estimate'].includes(argv[0]) && !argv.includes('--brief-version') ? [...argv, '--brief-version', '2'] : argv);

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const LITE = path.resolve(process.env.COUNCIL_DIAL_LITE_DIR || path.join(ROOT, '..', 'council-dial-lite'));
const SKILL = path.join(LITE, 'skills/council-dial-lite');
const FULL_BRIEFS = path.join(ROOT, 'plugin/skills/council-dial/briefs');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const readLite = f => fs.readFileSync(path.join(LITE, f), 'utf8');
const made = [];
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'council-dial-r11-')); made.push(d); return d; };
after(() => { for (const d of made) fs.rmSync(d, { recursive: true, force: true }); });
// Like the script: split on '## ' headings, and take the text block under each, so a heading in the notes with
// no text block of its own (such as 'Version 2 vs version 3') isn't mistaken for one.
const sectionsOf = text => Object.fromEntries(text.replace(/\r\n?/g, '\n').split(/^## /m).slice(1).map(part => {
  const nl = part.indexOf('\n');
  const m = nl < 0 ? null : part.slice(nl + 1).match(/^```text\n([\s\S]*?)\n```$/m);
  return m ? [part.slice(0, nl).trim(), m[1]] : null;
}).filter(Boolean));
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// The Lite clone, found or not. A missing clone is never silent: a warning goes to stderr, every
// Lite test is marked SKIP with the reason, and one test fails when COUNCIL_DIAL_LITE_REQUIRED=1.
// A folder that exists counts as the clone, so a damaged clone fails rather than skips.
const FOUND = fs.existsSync(LITE);
const REQ = (process.env.COUNCIL_DIAL_LITE_REQUIRED ?? '').trim();
const REQUIRED = REQ !== '' && REQ !== '0';
const MISSING = `Council Dial Lite clone not found at ${LITE}: the cross-repository checks (templates byte-identical, no code files, manifests, SKILL.md, README) did NOT run. Clone Ablation-Lab/council-dial-lite next to this repository or set COUNCIL_DIAL_LITE_DIR, and set COUNCIL_DIAL_LITE_REQUIRED=1 to make this a failure.`;
if (!FOUND) process.stderr.write(`\n${'!'.repeat(100)}\n!!! ${REQUIRED ? 'FAILING (COUNCIL_DIAL_LITE_REQUIRED is set)' : 'SKIPPED'}: ${MISSING}\n${'!'.repeat(100)}\n\n`);
// git, when the clone is a git checkout and git is installed; null otherwise.
const git = (...args) => { try { return execFileSync('git', ['-C', LITE, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; } };
test('the Council Dial Lite clone is there to check', { skip: !FOUND && !REQUIRED ? `SKIPPED: ${MISSING}` : false }, () => {
  assert.ok(FOUND, MISSING);
});
const liteTest = (name, a, b) => {
  const [opts, fn] = b ? [a, b] : [{}, a];
  return test(`Lite repository: ${name}`, { skip: FOUND ? (opts.skip ?? false) : `SKIPPED: ${MISSING}` }, fn);
};

// Every file the Lite repository holds or would commit: from git (tracked, plus untracked files
// .gitignore doesn't exclude) when the clone is a git checkout, or every file outside .git otherwise.
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => {
  if (e.name === '.git' && d === LITE) return [];
  const p = path.join(d, e.name);
  assert.ok(!e.isSymbolicLink(), `${p} is a link`);
  return e.isDirectory() ? walk(p) : [p];
});
const liteFiles = () => {
  const listed = git('ls-files', '--cached', '--others', '--exclude-standard', '-z');
  const files = listed == null ? walk(LITE) : listed.split('\0').filter(Boolean).map(f => path.join(LITE, f));
  for (const f of files) assert.ok(!fs.lstatSync(f).isSymbolicLink(), `${f} is a link`);
  return files;
};

liteTest('holds only Markdown, JSON, the licence, plain repository files and the PNG icon: no scripts, code, tests or hooks', () => {
  const files = liteFiles();
  const rel = files.map(f => path.relative(LITE, f).split(path.sep).join('/')).sort();
  assert.deepEqual(rel, [
    '.claude-plugin/icon.png', '.claude-plugin/marketplace.json', '.claude-plugin/plugin.json',
    // Lite 2.0.0 dropped .gitattributes: every blob is LF already (checked below).
    '.gitignore', 'LICENSE', 'README.md',
    // The read-only agent the council's agents run as (a Markdown definition, not code).
    'agents/council-reader.md',
    'skills/council-dial-lite/SKILL.md',
    // Lite 2.0.0: the step files SKILL.md's index names.
    ...['plan', 'run', 'summary-and-check', 'report-and-log', 'comparisons', 'raw'].map(b => `skills/council-dial-lite/${b}.md`),
    ...['appeal', 'baseline', 'debate', 'judge', 'reviewer', 'shared'].map(b => `skills/council-dial-lite/briefs/${b}.md`),
    ...['appeal', 'judge', 'shared'].map(b => `skills/council-dial-lite/briefs/v3/${b}.md`),
    'skills/council-dial-lite/check-brief.md',
    // Lite 1.6.0: the raw run's hand-off template.
    'skills/council-dial-lite/raw-handoff.md',
  ].sort());
  for (const f of files) {
    const b = fs.readFileSync(f);
    assert.ok(b.length < 256 * 1024, `${f} is under 256 KiB`);
    if (f.endsWith('.png')) { assert.ok(b.subarray(0, 8).equals(PNG), f); continue; }
    assert.ok(/\.(md|json)$/.test(f) || ['LICENSE', '.gitignore'].includes(path.basename(f)), `${f} is Markdown, JSON, the licence or a plain repository file`);
    // With no .gitattributes (Lite 2.0.0), a checkout with core.autocrlf=true writes CRLF to the working
    // tree while the blobs stay LF; the blobs are what ships, so in a git checkout `ls-files --eol` below
    // checks them, and the working file is checked for CR only when git isn't there.
    assert.ok(!b.includes(0) && (git('rev-parse', '--git-dir') != null || !b.includes(13)) && b[0] !== 0xef, f);
    const text = b.toString('utf8');
    assert.equal(Buffer.from(text, 'utf8').compare(b), 0, `${f} is valid UTF-8`);
    // No #! line anywhere, no shell code block, and no stale link to the old lite/ folder.
    assert.doesNotMatch(text, /^#!/m, `${f} has a #! line`);
    assert.doesNotMatch(text, /```(bash|sh|zsh|shell|powershell|pwsh|cmd|bat|js|javascript|mjs|node|python|py)\b/i, `${f} has a code block to run`);
    assert.doesNotMatch(text, /council-dial\/(blob|tree)\/[^/\s]+\/lite\b|\]\(\.?\/lite\//, `${f} links to the old lite/ folder`);
  }
  assert.ok(fs.readFileSync(path.join(LITE, 'LICENSE')).equals(fs.readFileSync(path.join(ROOT, 'LICENSE'))));
  assert.ok(fs.readFileSync(path.join(LITE, '.claude-plugin/icon.png')).equals(fs.readFileSync(path.join(ROOT, 'plugin/.claude-plugin/icon.png'))));
  // No .gitattributes (Lite 2.0.0), and every committed text file is stored with LF line endings.
  assert.ok(!fs.existsSync(path.join(LITE, '.gitattributes')), 'Lite has no .gitattributes');
  const eol = git('ls-files', '--eol');
  if (eol != null) for (const line of eol.trim().split('\n')) if (!line.endsWith('.png')) assert.match(line, /^i\/lf /, line);
  for (const sys of ['.DS_Store', 'Thumbs.db', 'desktop.ini']) assert.match(readLite('.gitignore'), new RegExp(`^${sys.replace('.', '\\.')}$`, 'm'));
  // No git hooks set up in the clone: core.hooksPath unset in its own config, and only git's own
  // .sample hooks in its hooks folder (found through git, so a worktree's real git folder is read).
  if (git('rev-parse', '--git-dir') != null) {
    assert.equal((git('config', '--local', '--get', 'core.hooksPath') ?? '').trim(), '');
    const hooks = path.resolve(LITE, git('rev-parse', '--git-path', 'hooks').trim());
    if (fs.existsSync(hooks)) assert.deepEqual(fs.readdirSync(hooks).filter(h => !h.endsWith('.sample')), []);
  }
});

liteTest('when COUNCIL_DIAL_LITE_REQUIRED is set, everything checked is committed in the clone', { skip: !REQUIRED ? 'set COUNCIL_DIAL_LITE_REQUIRED=1 to also check the clone is committed' : false }, () => {
  assert.notEqual(git('rev-parse', '--git-dir'), null, `${LITE} isn't a git checkout`);
  assert.notEqual(git('rev-parse', '--verify', 'HEAD'), null, 'the Lite clone has no commits yet');
  assert.equal(git('status', '--porcelain'), '', `the Lite clone has uncommitted changes:\n${git('status', '--porcelain')}`);
  const tracked = git('ls-files', '-z').split('\0').filter(Boolean).sort();
  const onDisk = liteFiles().map(f => path.relative(LITE, f).split(path.sep).join('/')).sort();
  assert.deepEqual(tracked, onDisk);
});

liteTest('the brief templates, versions 2 and 3, are byte-identical to the full edition\'s, and their texts match each version\'s digest', () => {
  const list = dir => fs.readdirSync(dir, { recursive: true }).map(x => String(x).split(path.sep).join('/')).filter(x => x.endsWith('.md')).sort();
  const names = list(FULL_BRIEFS);
  assert.deepEqual(list(path.join(SKILL, 'briefs')), names);
  assert.deepEqual(names.filter(n => n.startsWith('v3/')), ['v3/appeal.md', 'v3/judge.md', 'v3/shared.md']);
  // Version 2 is briefs/*.md; version 3 is the same with briefs/v3/*.md in place of their namesakes.
  const texts = { 2: {}, 3: {} };
  for (const n of names) {
    const a = fs.readFileSync(path.join(FULL_BRIEFS, n)), b = fs.readFileSync(path.join(SKILL, 'briefs', n));
    assert.ok(a.equals(b), `${n} differs between plugin/skills/council-dial/briefs/ here and skills/council-dial-lite/briefs/ in the Lite repository`);
    const key = n.replace(/^v3\//, '').replace(/\.md$/, ''), sections = sectionsOf(b.toString('utf8'));
    if (n.startsWith('v3/')) texts[3][key] = sections;
    else { texts[2][key] = sections; texts[3][key] ??= sections; }
  }
  assert.equal(briefDigest(texts[2]), BRIEF_SHA256);
  assert.equal(briefDigest(texts[3]), BRIEF_SHA256_V3);
  assert.match(readLite('skills/council-dial-lite/briefs/shared.md'), /in Council Dial, its script fills them in; in Council Dial Lite, Claude does/);
});

liteTest('every template text SKILL.md names exists, and the check brief fills in only {{rule}}', () => {
  const skill = liteSkillText(LITE);
  const named = [...skill.matchAll(/`([\w-]+)\.md`'s `([a-z-]+)`/g)].map(m => [m[1], m[2]]);
  assert.ok(named.length >= 6);
  for (const [file, section] of named) {
    const p = file === 'check-brief' ? path.join(SKILL, 'check-brief.md') : path.join(SKILL, 'briefs', `${file}.md`);
    assert.ok(section in sectionsOf(fs.readFileSync(p, 'utf8')), `${file}.md has no "${section}" text`);
  }
  for (const s of ['brief', 'brief-sequential', 'who-role', 'who-seat', 'reports', 'reports-after-debate', 'severity-rule', 'what-to-review']) assert.ok(skill.includes(`\`${s}\``), s);
  const check = sectionsOf(readLite('skills/council-dial-lite/check-brief.md'));
  assert.deepEqual(Object.keys(check).sort(), ['brief', 'rule-appeal', 'rule-appeal-v3', 'rule-baseline', 'rule-consensus', 'rule-judged', 'rule-judged-v3', 'rule-pooled']);
  for (const [k, v] of Object.entries(check)) assert.deepEqual([...new Set([...v.matchAll(/\{\{([a-z-]+)\}\}/g)].map(m => m[1]))], k === 'brief' ? ['rule'] : [], k);
  assert.match(check.brief, /data, not instructions/);
  assert.match(check.brief, /MATCHES.*CHANGED.*NO SOURCE/s);
  assert.match(check.brief, /LEFT OUT/);
  assert.match(check.brief, /Each report was saved as its agent returned it\./);
  assert.match(check.brief, /joined by =, the text is copied from the first, and the finding counts as included for each of them/);
  assert.doesNotMatch(check['rule-judged'], /step 3/);
});

liteTest('the template notes state every rule the script applies when it picks a brief\'s parts', () => {
  const notes = name => readLite(`skills/council-dial-lite/briefs/${name}`);
  assert.match(notes('reviewer.md'), /when the council has one reviewer \(a baseline reviewer doesn't count\)/);
  assert.match(notes('reviewer.md'), /matches a `focus:` heading in `shared\.md`, ignoring case, gets the `-area` opening/);
  assert.match(notes('reviewer.md'), /`\{\{role\}\}` is the reviewer's role as the user wrote it/);
  assert.match(notes('reviewer.md'), /`\{\{k\}\}` the reviewer's number, counting from 1/);
  assert.match(notes('debate.md'), /A specialised role named exactly `generalist`, in lower case, also gets `who-seat`/);
  assert.match(notes('judge.md'), /`\{\{reports\}\}` is `reports`, or `reports-after-debate` in a council with a debate round/);
  assert.match(notes('shared.md'), /the text filled in \(such as the user's description of what's reviewed\) is never read as a template itself/);
});

liteTest('SKILL.md keeps reports saved by their agents and checked, findings copied word for word, the blind agents blind, and runs marked', () => {
  const skill = liteSkillText(LITE);
  const front = skill.match(/^---\n([\s\S]*?)\n---\n/)[1];
  assert.match(front, /^name: council-dial-lite$/m);
  const desc = front.match(/^description: (.*)$/m)[1];
  assert.match(desc, /^Council Dial Lite runs a review council .* with no script\./);
  // Agent Skills descriptions are at most 1024 characters; check both editions.
  assert.ok(desc.length <= 1024, `Lite's description is ${desc.length} characters`);
  assert.ok(read('plugin/skills/council-dial/SKILL.md').match(/^description: (.*)$/m)[1].length <= 1024);
  // From Lite 1.4.0 the agents only read: no save line, and Claude saves every reply itself, only in the run folder.
  assert.ok(skill.includes("1. The first line: `Reply with your full report and nothing else. Don't write or change any file, and open no file under <Lite folder>.` For the check, the last sentence is instead `Don't write or change any file, and open no file under <Lite folder> apart from those under Brief folder:, Report files:, Count files:, Summary file:, Brief files:, Overview file: and Overview sources: at the end of this message.`"));
  assert.ok(skill.includes("\n2. Its brief, built as section 3 says.\n3. For every agent except the check: the line `The material: <its paths>.`, giving the paths relative to the project root, exactly as the description does"));
  assert.ok(skill.includes("4. For agents that get other agents' reports, those reports; for the appeal, its `<dismissed>` and `<severity>` blocks (below); for the check, its file list (section 6).\n\nNo agent saves anything: you save every reply yourself (below), so the agents need no Write tool, and in brief version 3 they have none."));
  assert.match(skill, /- Save its reply yourself, exactly, with the Write tool, to `<run folder>\/reports\/<agent file>`, and nowhere else: the only files you write are in the run folder\. Set `savedBy` to `main session`/);
  assert.doesNotMatch(skill, /The save line|Last step, before you reply|save it with the Write tool to <run folder>/);
  assert.doesNotMatch(skill, /This is the only save line|then the save line for/);
  assert.match(readLite('skills/council-dial-lite/check-brief.md'), /Don't change or write anything; reply with your report\./);
  assert.doesNotMatch(readLite('skills/council-dial-lite/check-brief.md'), /The only file you may write/);
  assert.match(skill, /with its prompt built as section 4 says for `reports\/check\.txt`: no material lines, and in place of reports, its file list/);
  // What the interactive trials showed SKILL.md needed to say.
  assert.match(skill, /Whenever you compare a saved report with its reply \(below\), whitespace at the very end \(spaces, tabs and line breaks after the last other character\) doesn't count, in the file or the reply, and nor does a line ending's style \(CRLF or LF\); every other difference does/);
  // Lite 1.11.0 dropped the .reply.txt rule for runs before 1.4.0: no current step can reach one.
  assert.doesNotMatch(skill, /\.reply\.txt/);
  assert.match(skill, /Every path you give an agent outside the material line, `<run folder>`, `<Lite folder>`, and the check's file paths and its two folder lines included, is a full absolute path \(the check's brief-file names and template files are relative to those folder lines, section 6\); the material line gives the material's paths relative to the project root \(section 4\)\./);
  assert.match(skill, /a content search such as Grep can skip a git-ignored Lite folder/);
  assert.match(skill, /Set an agent's `started` to `true` in the `run\.json` change you make just before its Agent call \(for agents started together, just before that one message\)\./);
  assert.match(skill, /for each report the check's `\{\{rule\}\}` names, whether or not the summary uses it/);
  assert.match(skill, /The appeal: a verdict on a dismissed finding by that finding's number or label, and a severity verdict by the finding's M number/);
  assert.match(skill, /\(don't read the template files again\)/);
  assert.match(readLite('skills/council-dial-lite/check-brief.md'), /A line right after a heading that only says how many reviewers raised the finding isn't part of the finding\./);
  assert.match(skill, /including any heading, preamble or closing line it added although its brief says "No other text"/);
  assert.match(skill, /Set `savedBy` to `main session`\. Then read the saved file back, in full, before anything uses it, and compare it with the reply, by the rule below, every time, and set `savedMatchesReply` to `true` or `false`\./);
  assert.match(skill, /\*\*Log every deviation\.\*\*/);
  assert.match(skill, /\*\*The deviation review\.\*\* Go through this checklist\. Each item is a deviation that earlier runs made and missed until asked:/);
  assert.match(skill, /Include section 8, which you've just done, in this pass\. Then set `deviationsReviewed` to `true` \(the top-level field, in the council's session\)\./);
  assert.doesNotMatch(skill, /Only then write the report\./);
  assert.match(skill, /before that agent's Agent call \(for agents you start together in one message, before that message; while you build it is fine\), compare the brief with the template texts it came from/);
  assert.match(skill, /Record each comparison in `run\.json`'s `briefChecks` before the Agent call: `\{"file": "<agent file>", "matched": true, "firstBuildDiffered": null, "checkAgent": null\}`/);
  assert.match(skill, /Read the template files the run needs, by name, without listing the folder first/);
  assert.match(skill, /`appeal`: `null` when the type has no appeal .*? When the appeal didn't run \(in version 2, because the judge marked nothing NOT REAL; in version 3, because there was also no severity to check\), it's `\{"ran": false, "reviewed": 0, "items": \[\]\}`/);
  assert.match(skill, /`baseline`: `null` when the type has no baseline\./);
  assert.match(skill, /with a baseline, take the larger of that sum and the baseline's own duration/);
  assert.match(skill, /name the latest 5 of them by planned date and then run id, or all of them if there are fewer; the estimate still uses every run that counts/);
  assert.match(skill, /ends just before the line that begins the next finding in the same list\. The last finding in a list ends just before the first heading or section label after it/);
  assert.match(skill, /Blank lines, code blocks and numbered steps inside a finding are part of it; blank lines at its end aren't\./);
  for (const h of ["## Findings: the judge's final ranked list", '## Findings: every finding', '## Findings: raised by most reviewers', '## Minority findings', '## Appeal: WRONGLY DISMISSED or UNSURE', "## Baseline reviewer's findings"]) assert.ok(skill.includes(`\`${h}\``), h);
  assert.match(skill, /a NOT REAL one by its label in the judge's merged list, exactly as the judge wrote it, with `merged ` before it/);
  assert.doesNotMatch(skill, /UTC date|random lower-case hex/);
  // What the headless trial showed SKILL.md needed to say.
  assert.match(skill, /Before you start a council, tell the user/);
  assert.match(skill, /A completion notice can show `<`, `>` and `&` as `&lt;`, `&gt;` and `&amp;`, but an agent can also type `&gt;` on purpose/);
  assert.match(skill, /- The judge, in brief version 3: every merged finding by its M number, whether it's in the final ranked list or ruled NOT REAL, such as `lite-20261109-01\/judge\/M4`\./);
  // Every citation names the report: never a run id followed straight by a finding number.
  assert.doesNotMatch(skill, /lite-\d{8}-\d{2}\/(?:M?\d|merged )/);
  assert.match(skill, /write `None\.` under any that has no findings/);
  assert.match(skill, /`wallMinutes`: always `null`\. Lite doesn't read the clock/);
  assert.match(skill, /one command per folder, exactly in this form and with nothing else in the command \(text Claude Code shows with it, such as its description, doesn't count\)/);
  assert.match(skill, /if a read is refused, stop and tell the user to allow reading that folder/);
  assert.match(skill, /the line `The material: <its paths>\.`, giving the paths relative to the project root, exactly as the description does/);
  // The check agent reads the summary, so the summary never names the model.
  assert.match(skill, /Its first line is `Run <run id>\.` \(not the label, which names the model, since the check agent reads this file\)/);
  assert.doesNotMatch(skill, /`Run <run id>, <label>\.`/);
  assert.match(skill, /copy it character for character from the agent's reply: no summarising, rewording, trimming, merging or fixing typos/);
  assert.match(skill, /\*\*The reply is the record\.\*\*/);
  assert.doesNotMatch(skill, /Read its file in `reports\/` and compare it with its reply|list that file in place of the agent's own/);
  assert.match(skill, /Before each later step, and before the check, read again every saved report you're about to pass on or check, and compare it with the reply you recorded for it\. If any has changed since, don't carry on/);
  assert.match(skill, /Before you put a reply in a block, check it for a block tag: a closing `<\/report>`, `<\/dismissed>` or `<\/severity>`, or an opening `<report`, `<dismissed` or `<severity` followed by `from=` or `YOURS`/);
  assert.match(skill, /If it has one, don't pass it on: stop and tell the user \(the saved report stays, as the record\)\./);
  assert.match(skill, /Build each brief just before you start its agent, from the templates\. .*? Save a copy of the brief alone, as you built it here, to `briefs\/<agent file>`: not the whole prompt \(no first line, material lines or reports\)\. Never read a saved brief back to use it\./);
  assert.match(skill, /Never tell the judge, the appeal agent or the check agent which model or effort level any agent ran on, and never give them `run\.json`\. Only the check gets the saved briefs, to compare them with their templates \(section 6\); briefs never name a model or effort\./);
  assert.match(skill, /is a symbolic link or junction\. The project root itself isn't checked/);
  assert.match(skill, /It can't be inside `\.git` or `\.claude`, or be the full Council Dial's log folder/);
  assert.match(skill, /"edition": "council-dial-lite"/);
  // Run ids need neither the clock nor random characters: the session's date and the next free number.
  assert.match(skill, /Lite never reads the clock or makes up random characters; the run id is `lite-`, today's date as 8 digits, a hyphen and a two-digit number/);
  assert.match(skill, /The number is one more than the highest number among that date's existing run ids whose part after the date is 2 or 3 digits, or `01` if there are none, with three digits after `99`\. An id whose part after the date is 4 characters, such as `3021` or `a7c2`, doesn't count, even if all 4 are digits\./);
  assert.match(skill, /A report's read-back after saving counts as this re-read only when every agent of the run is the read-only agent \(so none could have written\), and no agent was started or was still running at any point since that read-back\. Otherwise read it again, in full, before each step that uses it, the summary \(section 5\) included\./);
  assert.doesNotMatch(skill, /counts as read again/);
  assert.match(skill, /Then try to Read `<Lite folder>\/lite-<date>-<number>\/run\.json` by its exact path: if it exists, take the next number and try again\./);
  assert.match(skill, /never write to a full Council Dial log or run folder/);
  assert.match(skill, /## 6\. Check the summary/);
  assert.match(skill, /in the top-level `agents` list/);
  assert.doesNotMatch(skill, /results\.agents/);
  const json = JSON.parse(skill.match(/\*\*run\.json\.\*\* Write it with this shape[^\n]*\n\n```json\n([\s\S]*?)\n```/)[1]);
  assert.ok(Array.isArray(json.agents) && !('agents' in (json.results ?? {})));
  assert.equal(json.liteVersion, JSON.parse(readLite('.claude-plugin/plugin.json')).version);
  assert.equal(json.briefVersion, VERSION);
  assert.deepEqual(Object.keys(json.models), ['main', 'requested', 'env', 'force']);
  assert.match(json.runId, /^lite-[0-9]{8}-[0-9]{2,3}$/);
  assert.equal(json.planned, `${json.runId.slice(5, 9)}-${json.runId.slice(9, 11)}-${json.runId.slice(11, 13)}`);
  assert.deepEqual(json.deviations, []);
  // The preset counts are the full edition's agent counts plus the check, and agree with the README.
  const count = argv => Object.values(stepCounts(councilType(parseArgs(['estimate', ...argv]), {}).type)).reduce((a, b) => a + b, 0) + 1;
  const presets = { Standard: count(['--reviewers', 'specialised', '--combine', 'judged']), Quick: count(['--reviewers', 'generalist', '--combine', 'pooled']), Thorough: count(['--reviewers', 'specialised', '--combine', 'judged', '--debate', '--baseline']) };
  for (const [preset, n] of Object.entries(presets)) assert.match(skill, new RegExp(`\\| ${preset} \\| [^|]+ \\| ${n} `));
  assert.match(readLite('README.md'), new RegExp(`Standard \\(${presets.Standard} agents\\), Quick \\(${presets.Quick}\\) and Thorough \\(${presets.Thorough}\\)`));
  const largest = count(['--reviewers', 'specialised', '--roles', 'a, b, c, d, e, f, g, h, i', '--combine', 'judged', '--debate', '--baseline']);
  assert.match(skill, new RegExp(`largest custom council is ${largest} agents with the check`));
  assert.match(readLite('README.md'), new RegExp(`up to ${largest} for the largest council`));
  assert.match(skill, /`lite: specialised-2 \[api, perf\]\/judged\+debate\+appeal v3 @sonnet \(Lite 2\.1\.0\)`/);
  assert.doesNotMatch(skill, /\bnode\b|council\.mjs|```(bash|sh|powershell)/i);
  // The maintainers' note (in the README's Maintainers section from Lite 1.11.0, not a hidden HTML comment
  // in SKILL.md) says where the briefs come from.
  assert.doesNotMatch(skill, /<!--/);
  assert.match(readLite('README.md'), /The `skills\/council-dial-lite\/briefs\/` folder is a copy of `plugin\/skills\/council-dial\/briefs\/` in Ablation-Lab\/council-dial and must stay byte-identical to it/);
});

liteTest('Lite 1.1.2 takes on what the appeal stress-test run showed, where it applies', () => {
  const skill = liteSkillText(LITE);
  // Exclusions go in the description every brief gets.
  assert.match(skill, /If anything next to it is out of scope, such as a folder of sample data, say so in the same line, .*: this line is the only description of the target the briefs get, so an exclusion you only tell the user doesn't reach the agents\./);
  // Nothing added to a prompt; any departure logged with its exact text.
  assert.match(skill, /Add nothing else to any prompt: no notes about the material, no instructions on numbering or format, and never a file path in place of a report\./);
  assert.match(skill, /If you do add or change anything, log it in `deviations` with the exact text and why\./);
  assert.match(skill, /with the exact text of anything you added to or changed in a prompt/);
  // Escaped characters turned back when saving too, and recorded per agent.
  assert.match(skill, /So treat a reply as escaped only if it has at least one `&lt;`, `&gt;` or `&amp;`, and no `<`, no `>` and no `&` that isn't the start of one of those three/);
  assert.match(skill, /Set `replyUnescaped` to `true` and `entitiesReplaced` to how many you turned back, and also save the reply as it came, unchanged, to `reports\/<agent file without \.txt>\.as-received\.txt`/);
  const json = JSON.parse(skill.match(/\*\*run\.json\.\*\* Write it with this shape[^\n]*\n\n```json\n([\s\S]*?)\n```/)[1]);
  assert.ok(Object.hasOwn(json.agents[0], 'replyUnescaped'));
  // Every severity change flagged by Claude, up or down; the judge brief stays the shared one.
  assert.match(skill, /list every one that differs, up or down, including where reviewers disagreed and the judge took one of their ratings: its citation, each reviewer's severity, the judge's, and the judge's reason, quoted, if it gave one/);
  assert.match(skill, /- `severityChanges`: for judged, the list from section 7/);
  // Durations are wall-clock, approvals included.
  assert.match(skill, /`durationMs` is wall-clock time: in Manual mode it includes any time the agent waited for the user to approve a permission prompt, so it isn't pure model time\. Say so whenever you show times or critical paths\./);
  const readme = readLite('README.md');
  assert.match(readme, /wall-clock time, which in Manual mode includes any wait for your approval of a permission prompt, so it isn't pure model time/);
  assert.match(readme, /Anything you want left out, such as a folder of sample data, goes in the one-line description of what's reviewed/);
});

liteTest('Lite 1.2.0 sets a model and an effort per seat with the Agent tool\'s parameters, labels mixed councils by seat, and keeps the blind agents blind', () => {
  const skill = liteSkillText(LITE);
  assert.match(skill, /- \*\*Seats:\*\* every agent sits in a seat: each reviewer \(named by its role, or `reviewer <k>` for generalists\), the judge, the appeal, the baseline reviewer and the check \(not in a raw run\)\. A reviewer's debate turn sits in its reviewer's seat\./);
  assert.match(skill, /For each seat, its own choice wins, then one for all reviewers \(for a reviewer's seat\), then one for every subagent\. Pass the seat's model as the Agent tool's `model` on its agents' calls/);
  assert.match(skill, /Pass it as the Agent tool's `effort` parameter, the per-call route Claude Code supports \(2\.1\.292 or later\); leave it out for a seat with none\./);
  // Lite can't read CLAUDE_CODE_EFFORT_LEVEL (its shell is for the link check only), so it says so and tells the user how to check.
  assert.match(skill, /Whenever any seat has an effort set, tell the user, before you start any agent, that `CLAUDE_CODE_EFFORT_LEVEL`, if it's set in their shell or in a settings file's `env` block, overrides every seat's effort, and that they can check the shell with `\$env:CLAUDE_CODE_EFFORT_LEVEL` in PowerShell or `echo \$CLAUDE_CODE_EFFORT_LEVEL` in bash/);
  assert.match(skill, /- \*\*Blind:\*\* models and effort go only in the Agent tool's parameters, never in a prompt; only `run\.json` records them\./);
  assert.match(skill, /If every seat has the same model and effort: a space, `@` and that, or nothing if it's `inherit` with no effort\. Otherwise: a space, `@\{`, the seats as `<seat>=<model>` joined by `, `, and `\}`\./);
  assert.match(skill, /`lite: specialised-3\/judged\+appeal v3 @\{reviewers=sonnet, judge=haiku, appeal=opus\/max, check=claude-opus-5-5\} \(Lite 2\.1\.0\)`/);
  assert.match(skill, /`lite: generalist-3\/pooled @sonnet\/high \(Lite 1\.2\.0\)`/);
  assert.match(skill, /A run logged before Lite 1\.2\.0 has no `type\.seats`: every seat had the alias the user picked for every subagent \(`models\.requested`\), and no effort\./);
  assert.match(skill, /Then give one line per seat, in this exact wording, the same in every run, raw or not:/);
  assert.match(skill, /`<seat>: model <alias> \(set for this seat\)`, `\(set for all the reviewers\)` or `\(set for every subagent\)`/);
  assert.doesNotMatch(skill, /neither you nor Lite sets it/);
  const json = JSON.parse(skill.match(/\*\*run\.json\.\*\* Write it with this shape[^\n]*\n\n```json\n([\s\S]*?)\n```/)[1]);
  assert.deepEqual(json.type.seats.map(x => x.seat), ['reviewer: correctness', 'reviewer: security and privacy', 'reviewer: docs and policy accuracy', 'judge', 'appeal', 'check']);
  assert.ok(json.type.seats.every(x => x.model === null && x.effort === null));
  assert.ok(Object.hasOwn(json.agents[0], 'model') && Object.hasOwn(json.agents[0], 'effort'));
  assert.match(readLite('README.md'), /such as Sonnet reviewers, a Haiku judge and an Opus appeal at max effort\. Claude passes them only as the Agent tool's parameters, never in a prompt, so the judge and the appeal are never given which model or effort produced a finding/);
  // The check agent's brief, like the shared briefs, never names a model or effort.
  assert.doesNotMatch(readLite('skills/council-dial-lite/check-brief.md'), /sonnet|haiku|opus|fable|effort/i);
});

liteTest('Lite 1.3.0 builds brief version 3 by default, keeps version 2, enforces no running code with a read-only agent, and checks severities', () => {
  const skill = liteSkillText(LITE);
  const agent = readLite('agents/council-reader.md');
  const front = agent.match(/^---\n([\s\S]*?)\n---\n/)[1];
  assert.match(front, /^name: council-reader$/m);
  // From Lite 1.4.0, the same three tools as the full edition's agent: no Write.
  assert.match(front, /^tools: Read, Grep, Glob$/m);
  assert.doesNotMatch(front, /^(model|effort|permissionMode|hooks|mcpServers):/m);
  assert.match(skill, /Lite builds brief version 3 unless the user asks for version 2/);
  assert.match(skill, /every agent is then the plugin's read-only agent, `council-dial-lite:council-reader`, which has only the Read, Grep and Glob tools, so it can't run anything or write any file/);
  assert.match(skill, /with `subagent_type` set to `council-dial-lite:council-reader`, the read-only agent; otherwise as general-purpose agents\. The check is always the read-only agent \(section 1\)\. If the Agent tool says `council-dial-lite:council-reader` doesn't exist/);
  assert.match(skill, /For brief version 3, read `shared\.md`, `judge\.md` and `appeal\.md` from `\$\{CLAUDE_SKILL_DIR\}\/briefs\/v3\/` instead/);
  assert.match(skill, /- Then, for brief version 3, a space and `v3` \(version 2 runs have nothing here\)\./);
  assert.match(skill, /a `<severity from="judge">` … `<\/severity>` block with every finding the judge ruled OVERSTATED or UNDERSTATED and every other finding it kept at LOW/);
  assert.match(skill, /in brief version 3, `partlyReal` and `understated` are its PARTLY REAL and UNDERSTATED, and all five add up to it/);
  assert.match(skill, /In version 3, also `severityReviewed` and `severityItems`, one item for every severity finding it checked, fair ones included/);
  assert.match(skill, /show how often the appeal disagreed on each kind, so the LOW findings with no severity change, the part that costs most, can be judged on their own/);
  assert.match(skill, /Only when at least one seat runs on another model than this session's \(and has no effort set\), Read the project's `\.claude\/settings\.local\.json` and `\.claude\/settings\.json` \(if they exist\) before the run/);
  assert.match(skill, /use only their `modelSettings` and `effortLevel` keys/);
  assert.match(skill, /`## Appeal: WRONGLY DISMISSED, TOO LOW, TOO HIGH or UNSURE` \(version 3\)/);
  const check = sectionsOf(readLite('skills/council-dial-lite/check-brief.md'));
  assert.equal(check['rule-judged-v3'], "every finding in the judge's final ranked list, and no others from the judge's report.");
  assert.equal(check['rule-appeal-v3'], 'Also, in its own section, every finding in the appeal report marked WRONGLY DISMISSED, TOO LOW, TOO HIGH or UNSURE.');
  const json = JSON.parse(skill.match(/\*\*run\.json\.\*\* Write it with this shape[^\n]*\n\n```json\n([\s\S]*?)\n```/)[1]);
  assert.equal(json.briefVersion, 3);
  assert.equal(json.runningCode, 'not allowed');
  const readme = readLite('README.md');
  assert.match(readme, /\*\*Brief version 3 by default\.\*\*/);
  assert.match(readme, /\*\*Nothing runs unless you allow it\.\*\* In brief version 3, each agent is the plugin's read-only agent, `council-dial-lite:council-reader`/);
  assert.match(readme, /Brief version 2 runs always use general-purpose agents, as they did before, so there the rule is only in the briefs\./);
});

liteTest('the manifest names it the lighter edition, links the full one plainly, and matches its own marketplace', () => {
  const lite = JSON.parse(readLite('.claude-plugin/plugin.json'));
  const full = JSON.parse(read('plugin/.claude-plugin/plugin.json'));
  const market = JSON.parse(readLite('.claude-plugin/marketplace.json'));
  // Only metadata: no hooks, MCP or LSP servers, commands, agents or other components declared inline.
  assert.deepEqual(Object.keys(lite).sort(), ['author', 'description', 'displayName', 'documentationUrl', 'homepage', 'icon', 'keywords', 'license', 'name', 'privacyPolicyUrl', 'repository', 'supportUrl', 'version']);
  assert.deepEqual(Object.keys(market).sort(), ['description', 'name', 'owner', 'plugins']);
  assert.equal(market.plugins.length, 1);
  assert.deepEqual(Object.keys(market.plugins[0]).sort(), ['category', 'description', 'name', 'source', 'version']);
  assert.ok(lite.description.length <= 500, `the listing description is ${lite.description.length} characters`);
  assert.equal(lite.name, 'council-dial-lite');
  assert.equal(lite.displayName, 'Council Dial Lite');
  assert.match(lite.version, /^\d+\.\d+\.\d+$/);
  assert.match(lite.description, /^The lighter, script-free edition of Council Dial\./);
  assert.match(lite.description, /for research runs, use the full Council Dial: https:\/\/github\.com\/Ablation-Lab\/council-dial\./);
  assert.doesNotMatch(lite.description, /\/plugin|install|--marketplace/i);
  assert.notEqual(lite.description, full.description);
  assert.equal(lite.license, 'MIT');
  assert.ok(fs.existsSync(path.join(LITE, lite.icon)));
  const R = 'https://github.com/Ablation-Lab/council-dial-lite';
  assert.equal(lite.homepage, R); assert.equal(lite.repository, R);
  assert.equal(lite.documentationUrl, `${R}/blob/main/README.md`);
  assert.equal(lite.supportUrl, `${R}/issues`);
  assert.equal(lite.privacyPolicyUrl, `${R}/blob/main/README.md#privacy`);
  assert.match(readLite('README.md'), /^## Privacy$/m);
  assert.equal(market.name, 'council-dial-lite');
  assert.deepEqual(market.plugins.map(x => [x.name, x.source]), [['council-dial-lite', './']]);
  assert.equal(market.plugins[0].description, lite.description);
  assert.equal(market.plugins[0].version, lite.version);
});

liteTest('README explains the two editions, installs only Lite, and states only what was confirmed', () => {
  const lite = readLite('README.md');
  assert.match(lite, /^## Two editions$/m);
  // A plain link to the full edition and its README, and install steps for Lite only.
  assert.match(lite, /\[Council Dial\]\(https:\/\/github\.com\/Ablation-Lab\/council-dial\)/);
  assert.match(lite, /\| Installed from \| its own repository's marketplace \(see \[its README\]\(https:\/\/github\.com\/Ablation-Lab\/council-dial\)\) \|/);
  assert.doesNotMatch(lite, /Ablation-Lab\/council-dial#install/);
  // What it runs is disclosed: the shell only for the link check, and the material's code only if allowed.
  assert.match(lite, /Claude checks each existing folder below the project root on the way to the Lite folder with your session's shell tool, one folder per command, to check none is a link, and uses the shell for nothing else/);
  assert.match(lite, /If you allow running code, and in every version 2 run, they're ordinary general-purpose subagents with the tools your session allows/);
  assert.doesNotMatch(lite, /They run code from the material only if you say they may/);
  assert.match(lite, /asks you to confirm adding it; then it opens the plugin's page/);
  assert.match(lite, /If you deny a write's prompt, that report isn't saved, and Claude says so\./);
  // The prompts, plainly: the template reads (and the two answers), the saves, and why auto mode shows nothing.
  assert.match(lite, /^## Permission prompts$/m);
  // The option's exact wording, as Claude Code showed it in the Lite 1.1.0 run.
  assert.match(lite, /choose \*\*Yes, allow reading from <Lite's skill folder> during this session\*\*, if you're happy to trust Lite's files\./);
  assert.match(lite, /- choose \*\*Yes\*\* to approve each read on its own\./);
  assert.doesNotMatch(lite, /\*\*allow reading from this folder during this session\*\*/);
  // A three-step Quick start near the top: the save rule, a council prompt, and the read prompt's answer.
  const headings = [...lite.matchAll(/^## (.+)$/gm)].map(m => m[1]);
  assert.deepEqual(headings.slice(0, 3), ['What it is', 'Quick start', 'Two editions']);
  const quick = lite.slice(lite.indexOf('## Quick start'), lite.indexOf('## Two editions'));
  assert.equal(quick.match(/^\d\. /gm).length, 3);
  assert.ok(quick.includes("\n   ```\n   Add the permission rule Edit(/reviews/lite/**) to this project's .claude/settings.local.json, keeping anything already there.\n   ```\n"));
  assert.match(quick, /Claude Code asks you before Claude writes the file/);
  assert.match(quick, /Lite itself never changes your settings\./);
  assert.match(quick, /so it matches only if you started it in the project root/);
  assert.ok(quick.includes("\n   ```\n   Run a standard Council Dial Lite review council on src/app.js and README.md.\n   ```\n"));
  assert.match(quick, /Claude only lists your files to check they exist; it doesn't read them before it writes the reviewers' briefs\./);
  assert.match(quick, /Claude shows the plan .* and asks before starting any agents\. Confirm or change the description, and say yes to start\./);
  assert.match(quick, /in its default \(Manual\) mode/);
  assert.match(quick, /On the first read prompt, choose \*\*Yes, allow reading from <Lite's skill folder> during this session\*\*, which covers every later read of Lite's files in one go, or choose \*\*Yes\*\* to approve each read one at a time\./);
  assert.match(lite, /\*\*Auto mode\*\* decides each step without asking you, so a run in auto mode shows nothing about which steps would ask/);
  assert.match(lite, /Two of the three reviewers replied without saving their reports\. They weren't refused: they never called the Write tool\./);
  assert.match(lite, /A `claude -p` or SDK run never shows the trust dialog, so in a folder you haven't trusted it ignores allow rules from `\.claude\/settings\.json`\./);
  // The trial's results, and what wasn't tested.
  assert.match(lite, /^## Tested$/m);
  assert.match(lite, /The headless session waited for all six background agents and finished the run\./);
  assert.match(lite, /Not tested yet: Lite 1\.1\.0's changes on Sonnet, where the saves were skipped; .*?an installed copy \(rather than `--plugin-dir`\), Cowork and chat\./);
  assert.match(lite, /This run changed both the save line and the model, and the earlier skipped saves were on Sonnet, so it didn't show whether the new save line fixed them\. Lite 1\.4\.0 has since removed the agents' saves altogether\./);
  // A Standard council reads check-brief.md, shared.md, reviewer.md, judge.md and appeal.md, and from
  // Lite 2.0.0 the step files plan.md, run.md, summary-and-check.md and report-and-log.md.
  assert.match(lite, /A Standard council reads 4 step files and 5 template files, and after Claude Code compacts the conversation it reads the step files again, and any templates it still needs\./);
  assert.match(lite, /A session that can't ask, such as `claude -p`, refuses them and the run stops/);
  const skillFront = readLite('skills/council-dial-lite/SKILL.md').match(/^---\n([\s\S]*?)\n---\n/)[1];
  assert.match(skillFront, /^compatibility: .*a shell tool, where the session has one, only to check the Lite folder isn't a link/m);
  const installs = [...lite.matchAll(/(?:\/plugin|claude plugin) (?:install|marketplace add) ([^`\n]+)/g)].map(m => m[1]);
  assert.ok(installs.length >= 4);
  for (const i of installs) assert.match(i, /council-dial-lite/, i);
  assert.doesNotMatch(lite, /--marketplace Ablation-Lab\/council-dial(?!-lite)|@council-dial(?!-lite)\b/);
  assert.match(lite, /\/plugin install council-dial-lite --marketplace Ablation-Lab\/council-dial-lite/);
  assert.match(lite, /https:\/\/github\.com\/Ablation-Lab\/council-dial-lite\/issues/);
  // The permission rule and what's said about it.
  assert.match(lite, /"allow": \["Edit\(\/reviews\/lite\/\*\*\)"\]/);
  const rule = JSON.parse(lite.match(/```json\n([\s\S]*?)\n\s*```/)[1].replace(/^ {2}/gm, ''));
  assert.deepEqual(rule, { permissions: { allow: ['Edit(/reviews/lite/**)'] } });
  assert.match(lite, /Claude Code applies a project's allow rules only after you've accepted the trust dialog for the folder/);
  assert.match(lite, /a path that starts with `\/` is read from the folder you started Claude Code in/);
  assert.match(lite, /The rule lets anything in the session that can write, Claude itself and, if you allowed running code, the general-purpose agents, write anywhere under `reviews\/lite\/`, earlier runs included\. The read-only agents can't write at all\./);
  // Lite 1.4.0: the agents can't write, Claude saves the reports, and dontAsk mode keeps Claude's own writes to the Lite folder.
  assert.match(lite, /^## Why the agents can't write \(Lite 1\.4\.0\)$/m);
  assert.match(lite, /From 1\.4\.0 no agent saves anything: Claude, the main session, saves each agent's reply itself, with its Write tool, and only into the run's folder under `reviews\/lite\/`\./);
  // The tool limit is version 3's only; version 2 agents are general-purpose and still have the Write tool.
  assert.match(lite, /Claude saving every report applies to both brief versions; the tool limit applies to version 3 only\. Version 2 agents are general-purpose, as before: they're told not to write or change any file, but they still have the Write tool\./);
  assert.doesNotMatch(lite, /This applies to both brief versions\./);
  assert.match(lite, /the agents read material that may contain instructions, and an agent that can write can be told to change files, whatever its brief says/);
  assert.match(lite, /\*\*Only the Lite folder, and nothing else \(strictest\):\*\* with the rule above, start Claude Code with `claude --permission-mode dontAsk`\./);
  assert.match(lite, /We tested this in a scratch project: a read and a write under `reviews\/lite\/` went through, and a write to another file was denied\./);
  assert.match(lite, /rules are checked deny first, so an allow rule can't carve an exception out of a deny rule\. An agent definition can't either: its `tools` field limits which tools an agent has, not where they write\./);
  assert.match(lite, /\| Reports \| saved by Claude through the script \| saved by Claude, from each agent's reply; in brief version 3 the agents can't write \|/);
  assert.doesNotMatch(lite, /Each agent saves its own report|saved by each agent itself|Read, Grep, Glob and Write/);
  // The version 2 vs version 3 section, standalone.
  assert.match(lite, /^## Version 2 vs version 3$/m);
  for (const x of ['PARTLY REAL (part of the claim doesn\'t hold, same severity)', 'UNDERSTATED (higher, so a severity can be raised)', 'Also checks every severity the judge changed and every other finding it kept at LOW', '"Run nothing unless the user allowed running code"', 'By a tool limit: every agent is the plugin\'s read-only agent, `council-dial-lite:council-reader`, with only the Read, Grep and Glob tools', 'The read-only agent\'s own definition is its system prompt, in place of the general-purpose one', 'M1, M2 and so on', 'The same with ` v3` before the models.', '**Why runs of the two versions must be compared separately:**']) assert.ok(lite.includes(x), x);
  assert.match(lite, /Claude Code applies it to the whole session, every later agent included/);
  assert.match(lite, /\*\*Allow writes to the Lite folder only \(recommended\):\*\*/);
  assert.match(lite, /each agent's report \(the check's included\) in `reports\/`/);
  assert.match(lite, /Lite asks, but the full edition doesn't/);
  assert.doesNotMatch(lite, /can't run its script or start subagents|councils don't work in plain chat/);
  assert.match(lite, /Anthropic's platform-support page lists plugin agents \(`agents\/\*\.md`\) as ignored in chat, so the read-only agent isn't there\./);
  // The directory shows the README: at least 40 words outside code blocks, and the sign-off last.
  assert.ok(lite.replace(/```[\s\S]*?```/g, '').split(/\s+/).filter(Boolean).length >= 40);
  assert.ok(lite.trimEnd().endsWith('\n\nResearch by Ablation Lab.'));
  assert.equal(lite.split('Research by Ablation Lab.').length, 2);
  for (const [l, prev] of lite.split('\n').map((l, i, a) => [l, a[i - 1]])) if (l.startsWith('#') && prev !== undefined) assert.equal(prev, '', `blank line before ${l}`);
});

test('a Lite run id is never read as one of the full edition\'s runs', () => {
  for (const id of ['lite-20261108-3fa9', 'lite-20261108-01', 'lite-20261108-100']) assert.throws(() => parseArgs(['log', '--run', id]), /--run is the run id from plan/);
  const p = tmp();
  fs.mkdirSync(path.join(p, 'reviews'));
  const row = { kind: 'planned', runId: 'lite-20261108-3fa9', version: 2, time: '2026-11-08T10:00:00.000Z', label: 'lite: generalist-3/pooled', target: 'x', type: { reviewers: 'generalist', n: 3, roles: null, combine: 'pooled', debate: false, sequential: false, baseline: false, appeal: false } };
  fs.writeFileSync(path.join(p, 'reviews/review-log.jsonl'), JSON.stringify(row) + '\n');
  const list = runCommand({ ...parseArgs(['list']), project: p }, '', new Date(), {});
  assert.deepEqual(list.runs, []);
  assert.equal(list.skippedLogLines, 1);
});

test('this repository holds no copy of Lite, lists only the full edition, and points to the Lite repository', () => {
  assert.equal(fs.existsSync(path.join(ROOT, 'lite')), false);
  const market = JSON.parse(read('.claude-plugin/marketplace.json'));
  assert.deepEqual(market.plugins.map(x => [x.name, x.source]), [['council-dial', './plugin']]);
  assert.equal(market.plugins[0].version, JSON.parse(read('plugin/.claude-plugin/plugin.json')).version);
  for (const f of ['README.md', 'plugin/README.md']) {
    const s = read(f);
    assert.match(s, /^## Two editions$/m);
    assert.match(s, /It has its own repository, \[Ablation-Lab\/council-dial-lite\]\(https:\/\/github\.com\/Ablation-Lab\/council-dial-lite\)/);
    assert.match(s, /`\/plugin install council-dial-lite --marketplace Ablation-Lab\/council-dial-lite`/);
    assert.doesNotMatch(s, /council-dial\/(blob|tree)\/[^/\s]+\/lite\b|\]\(\.?\/lite\/|council-dial-lite@council-dial\b|--marketplace Ablation-Lab\/council-dial`, or `council-dial-lite/);
    assert.match(s, /Use Council Dial for runs you'll report as research\./);
    assert.match(s, /\*\*Only Lite is submitted to Anthropic's plugin directory\.\*\* The directory told us: "The directory accepts scripts, programs, and files outside the allowed types only from Verified organizations, and your organization isn't one, so this version is refused\." This edition has a script, so it stays on GitHub and this repository's marketplace and won't be resubmitted\./);
    assert.doesNotMatch(s, /was turned down because of its script|Lite is the edition we submit there instead/);
    assert.doesNotMatch(s, /can't run its script or start subagents|councils don't work in plain chat/, f);
    assert.match(s, /Anthropic's platform-support page lists plugin agents \(`agents\/\*\.md`\) as ignored in chat/, f);
  }
  assert.match(read('README.md'), /set `COUNCIL_DIAL_LITE_REQUIRED=1` to make a missing clone fail instead/);
});
