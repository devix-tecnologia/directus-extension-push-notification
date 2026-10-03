# Task 013 — db-configuration never updates meta of fields that already exist

- Status: pending
- Type: fix
- Assignee: sidartaveloso

## Description

`db-configuration` only creates what is missing: for each field in
`directus-state.json` it calls `fieldsService.readOne` and skips the field when
it already exists. Collection and field **meta** is therefore written exactly
once, on the installation that first created the collection.

Every later correction to meta reaches new installations only. Already
accumulated:

- `languageField` on `user_notification.translations`, fixed from
  `languages_code` to `code` — without it the creation form shows
  `[forbidden] you don't have permission to access field "languages_code" in
collection "language"`;
- the `conditions` that make `icon` and `icon_url` mutually exclusive;
- the note on `icon`, which still claims the file must be publicly accessible.

An upgraded installation keeps the old, and in the first case broken, metadata.

## Tasks

- [ ] Decide the reconciliation policy — overwrite meta always, or only for keys the extension owns
- [ ] Preserve what the admin customised by hand, or state explicitly that it is overwritten
- [ ] Apply to collection meta as well, not only fields
- [ ] Test with an installation created by an older version of the extension

## Notes

- The trade-off is real: overwriting meta on every boot undoes any adjustment the
  admin made in the interface. That is why this was left as a decision rather
  than patched in passing.
