// A small made-up module with problems planted on purpose, for trying a review council.
// See ../expected-findings.md for the list. Don't use it in real code.
import fs from 'node:fs';

// Turns a title into a URL slug: "Hello, World!" -> "hello-world".
export function slugify(title, maxLength = 60) {
  let s = title.toLowerCase().trim();
  s = s.replace(/[^a-z0-9]+/g, '-');          // drops every non-ASCII letter: "Café" -> "caf"
  s = s.replace(/^-|-$/, '');                  // only removes one end, and only the first match
  if (s.length > maxLength) s = s.slice(0, maxLength); // can end with "-"
  return s;
}

// Makes a slug unique among those already used, by adding -2, -3 and so on.
export function uniqueSlug(title, used) {
  let base = slugify(title), slug = base, n = 1;
  while (used.includes(slug)) slug = `${base}-${n++}`; // the first duplicate gets "-1", not "-2" as documented
  used.push(slug);
  return slug;
}

// Saves the list of used slugs next to the given file.
export function saveUsed(file, used) {
  fs.writeFileSync(file + '.slugs', used.join('\n')); // not atomic, and the path isn't checked
}

// Loads the list. The README says a missing file gives an empty list.
export function loadUsed(file) {
  return fs.readFileSync(file + '.slugs', 'utf8').split('\n'); // throws if the file is missing
}
