// A small made-up module for trying a review council.
// It is sample code; don't use it in real projects.
import fs from 'node:fs';

// Turns a title into a URL slug: "Hello, World!" -> "hello-world".
export function slugify(title, maxLength = 60) {
  let s = title.toLowerCase().trim();
  s = s.replace(/[^a-z0-9]+/g, '-');          // anything else becomes a hyphen
  s = s.replace(/^-|-$/, '');                  // trim hyphens at the ends
  if (s.length > maxLength) s = s.slice(0, maxLength); // keep it short
  return s;
}

// Makes a slug unique among those already used, by adding -2, -3 and so on.
export function uniqueSlug(title, used) {
  let base = slugify(title), slug = base, n = 1;
  while (used.includes(slug)) slug = `${base}-${n++}`; // try the next number
  used.push(slug);
  return slug;
}

// Saves the list of used slugs next to the given file.
export function saveUsed(file, used) {
  fs.writeFileSync(file + '.slugs', used.join('\n')); // one slug per line
}

// Loads the list. The README says a missing file gives an empty list.
export function loadUsed(file) {
  return fs.readFileSync(file + '.slugs', 'utf8').split('\n'); // one slug per line
}
