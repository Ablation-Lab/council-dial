# slugify (sample)

A made-up module for trying Council Dial. It makes the URL slugs for a small blog host, where each user picks a name for their blog when they sign up.

- `slugify(title, maxLength = 60)`: turns a title into a URL slug, keeping letters in any language, with no leading or trailing hyphens.
- `uniqueSlug(title, used)`: adds `-2`, `-3` and so on when a slug is already used.
- `saveUsed(file, used)` and `loadUsed(file)`: keep the used slugs in `<file>.slugs`, where `file` is the blog name the user typed in at sign-up. A missing file gives an empty list.
