// Every skill and agent file's YAML front matter must parse strictly, as the plugin directory's
// pre-submission checklist asks ("Write valid YAML front matter in each skill, command, and agent file,
// with `description` as a single text value"). Claude Code's own loader is lenient, so
// `claude plugin validate --strict` passed Lite 1.10.1's SKILL.md, whose unquoted `compatibility` value
// held ": " and which strict YAML parsers (js-yaml, PyYAML, yaml) reject.
//
// The repositories have no dependencies, so this is a strict parser for the one form front matter uses
// here: a flat mapping of `key: value` lines. Anything else, such as a list, a nested mapping, a block
// scalar or a continuation line, fails, and so does any plain value YAML 1.2 would read differently
// (": " or " #" inside it, an indicator character at its start, a trailing colon, a tab).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const LITE = path.resolve(process.env.COUNCIL_DIAL_LITE_DIR || path.join(ROOT, '..', 'council-dial-lite'));
const FOUND = fs.existsSync(LITE);

// Returns the mapping, or throws with the reason a strict parser would refuse it.
export function parseFrontMatter(text) {
  const t = text.replace(/^﻿/, '');
  if (!t.startsWith('---\n') && !t.startsWith('---\r\n')) throw new Error('no front matter: the file must start with a --- line');
  const lines = t.split(/\r?\n/);
  const end = lines.indexOf('---', 1);
  if (end < 0) throw new Error('front matter has no closing --- line');
  const out = {};
  for (let i = 1; i < end; i++) {
    const line = lines[i];
    const where = `front matter line ${i + 1}`;
    if (line.trim() === '' || /^\s*#/.test(line)) continue;
    if (/\t/.test(line)) throw new Error(`${where}: a tab`);
    const m = /^([A-Za-z][A-Za-z0-9_-]*):( (.*))?$/.exec(line);
    if (!m) throw new Error(`${where}: not a "key: value" line (lists, nested mappings and continuation lines aren't allowed)`);
    const [, key, , raw = ''] = m;
    if (key in out) throw new Error(`${where}: duplicate key ${key}`);
    const v = raw.replace(/\s+$/, '');
    if (v === '') throw new Error(`${where}: ${key} has no value`);
    out[key] = scalar(v, where);
  }
  return out;
}

function scalar(v, where) {
  if (v.startsWith("'")) {
    if (!/^'(?:[^']|'')*'$/.test(v)) throw new Error(`${where}: an unclosed or broken single-quoted value`);
    return v.slice(1, -1).replace(/''/g, "'");
  }
  if (v.startsWith('"')) {
    if (!/^"(?:[^"\\]|\\.)*"$/.test(v)) throw new Error(`${where}: an unclosed or broken double-quoted value`);
    return JSON.parse(v);
  }
  if (/^[-?:,\[\]{}#&*!|>%@`]/.test(v)) throw new Error(`${where}: a plain value can't start with ${v[0]}`);
  if (v.includes(': ')) throw new Error(`${where}: ": " inside a plain value starts a nested mapping; quote the value or use another character`);
  if (v.includes(' #')) throw new Error(`${where}: " #" inside a plain value starts a comment`);
  if (v.endsWith(':')) throw new Error(`${where}: a plain value can't end with a colon`);
  return v;
}

function frontMatterFiles(root) {
  const files = [];
  const walk = d => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === '.git' || e.name === 'node_modules') continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === 'SKILL.md' || (path.basename(d) === 'agents' && e.name.endsWith('.md')) || (path.basename(d) === 'commands' && e.name.endsWith('.md'))) files.push(p);
    }
  };
  walk(root);
  return files;
}

test('the strict parser refuses what strict YAML parsers refuse', () => {
  assert.throws(() => parseFrontMatter('---\nname: x\ncompatibility: only from the main session: the subagents write nothing.\n---\n'), /": " inside a plain value/);
  assert.throws(() => parseFrontMatter('---\nname: x\ndescription: a # b\n---\n'), /comment/);
  assert.throws(() => parseFrontMatter('---\nname: x\ndescription:\n  - a\n---\n'), /no value|not a "key: value"/);
  assert.throws(() => parseFrontMatter('---\nname: x\ndescription: "a\n---\n'), /double-quoted/);
  assert.throws(() => parseFrontMatter('---\nname: x\nname: y\n---\n'), /duplicate/);
  assert.deepEqual(parseFrontMatter('---\nname: x\ndescription: "a: b"\ntools: Read, Grep, Glob\n---\nbody'), { name: 'x', description: 'a: b', tools: 'Read, Grep, Glob' });
  assert.deepEqual(parseFrontMatter("---\nname: x\ndescription: it's fine; really\n---\n"), { name: 'x', description: "it's fine; really" });
});

function checkAll(root) {
  const files = frontMatterFiles(root);
  assert.ok(files.length >= 2, `found the skill and agent files under ${root}`);
  for (const f of files) {
    const fm = parseFrontMatter(fs.readFileSync(f, 'utf8'));
    assert.equal(typeof fm.name, 'string', `${f}: name`);
    assert.equal(typeof fm.description, 'string', `${f}: description is a single text value`);
    assert.ok(fm.description.length <= 1024, `${f}: description is at most 1,024 characters (${fm.description.length})`);
  }
  return files.length;
}

test('every skill and agent front matter in the full edition parses as strict YAML', () => {
  assert.equal(checkAll(path.join(ROOT, 'plugin')), 2);
});

test('Lite repository: every skill and agent front matter parses as strict YAML', { skip: FOUND ? false : `SKIPPED: no Lite clone at ${LITE}` }, () => {
  assert.equal(checkAll(LITE), 2);
});
