# slugify (sample)

A made-up module for trying Council Dial. It has problems planted on purpose.

- `slugify(title, maxLength = 60)`: turns a title into a URL slug, keeping letters in any language, with no leading or trailing hyphens.
- `uniqueSlug(title, used)`: adds `-2`, `-3` and so on when a slug is already used.
- `saveUsed(file, used)` and `loadUsed(file)`: keep the used slugs in `<file>.slugs`. A missing file gives an empty list.
