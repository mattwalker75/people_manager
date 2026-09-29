# Changelog

All notable changes to People Manager (Keep a Changelog style; dates are when the change was made).

## [Unreleased]

### Added
- 2026-09-29: **Server and data layer.** Data model (tabs → nested directories → people,
  with key facts, labelled phones/emails/addresses, named links, a notes log, up to N photos,
  free-form tags and custom fields). Three interchangeable data sources behind one interface —
  a JSON file, SQLite and MySQL/MariaDB (Knex) — with hand-written schemas in `schema/`.
  Rules: first name is the only required field, duplicate names allowed, tabs and directories
  must be empty to delete (the refusal names the first five items and how many more), moves
  across directories and tabs (a directory carries everything inside it), search on names,
  nickname and tags (case- and accent-insensitive, anywhere in the word, "matched tag" shown),
  custom fields with safe type changes, archive, and the clear-one-by-one / delete-with-values
  flows. Optional login in the my_business_manager style (`.password` bcrypt file, delete it to
  reset), Host and same-origin guards, settings saved to `config.json` with restart-needed
  reporting, JSON validation report + import (replace or add alongside) + export, and manual
  backups (zip without photos or the MySQL password). 57 tests across all three data sources.
