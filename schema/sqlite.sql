-- People Manager — SQLite schema, version 1.
--
-- Loaded by ./SETUP_SQLITE_DB.sh and by Settings → Data source → Build database.
-- The app never changes the schema on its own: it checks meta.schema_version at
-- startup and says so if the database needs building.
--
-- Ids are 12-character strings made by the app (not auto-numbers), so the same
-- record keeps its id when data moves between JSON, SQLite and MySQL.

PRAGMA foreign_keys = ON;

DROP TABLE IF EXISTS custom_values;
DROP TABLE IF EXISTS custom_fields;
DROP TABLE IF EXISTS person_tags;
DROP TABLE IF EXISTS person_photos;
DROP TABLE IF EXISTS person_notes;
DROP TABLE IF EXISTS person_links;
DROP TABLE IF EXISTS person_contacts;
DROP TABLE IF EXISTS person_facts;
DROP TABLE IF EXISTS people;
DROP TABLE IF EXISTS directories;
DROP TABLE IF EXISTS tabs;
DROP TABLE IF EXISTS meta;

CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO meta (key, value) VALUES ('schema_version', '1');

-- The big groupings across the top of the screen.
CREATE TABLE tabs (
  id       TEXT PRIMARY KEY,
  name     TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);

-- Directories nest without limit; parent_id NULL = top level of the tab.
CREATE TABLE directories (
  id          TEXT PRIMARY KEY,
  tab_id      TEXT NOT NULL REFERENCES tabs(id),
  parent_id   TEXT REFERENCES directories(id),
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  position    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX ix_directories_tab ON directories(tab_id, parent_id, position);

-- One row per person. directory_id NULL = top level of the tab.
-- search_text = first + last + nickname + tags, lower-cased without accents.
CREATE TABLE people (
  id                   TEXT PRIMARY KEY,
  tab_id               TEXT NOT NULL REFERENCES tabs(id),
  directory_id         TEXT REFERENCES directories(id),
  position             INTEGER NOT NULL DEFAULT 0,
  first_name           TEXT NOT NULL,
  last_name            TEXT NOT NULL DEFAULT '',
  nickname             TEXT NOT NULL DEFAULT '',
  description          TEXT NOT NULL DEFAULT '',
  title                TEXT NOT NULL DEFAULT '',
  profession           TEXT NOT NULL DEFAULT '',
  business_category    TEXT NOT NULL DEFAULT '',
  age_range            TEXT NOT NULL DEFAULT '',
  marital_status       TEXT NOT NULL DEFAULT '',
  kids                 TEXT NOT NULL DEFAULT '',
  pets                 TEXT NOT NULL DEFAULT '',
  family_notes         TEXT NOT NULL DEFAULT '',
  birthday             TEXT NOT NULL DEFAULT '',
  date_met             TEXT NOT NULL DEFAULT '',
  from_place           TEXT NOT NULL DEFAULT '',
  how_met              TEXT NOT NULL DEFAULT '',
  general_description  TEXT NOT NULL DEFAULT '',
  business_website     TEXT NOT NULL DEFAULT '',
  business_description TEXT NOT NULL DEFAULT '',
  main_photo_id        TEXT,
  search_text          TEXT NOT NULL DEFAULT '',
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL
);
CREATE INDEX ix_people_place ON people(tab_id, directory_id, position);

-- "Key facts" pinned at the top of the card.
CREATE TABLE person_facts (
  id        TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  text      TEXT NOT NULL,
  position  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX ix_facts_person ON person_facts(person_id);

-- Phones, emails and addresses, each with the user's own label.
CREATE TABLE person_contacts (
  id        TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  kind      TEXT NOT NULL CHECK (kind IN ('phone', 'email', 'address')),
  label     TEXT NOT NULL DEFAULT '',
  value     TEXT NOT NULL,
  position  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX ix_contacts_person ON person_contacts(person_id);

-- Social media and other links, each with a name the user chooses.
CREATE TABLE person_links (
  id        TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  label     TEXT NOT NULL DEFAULT '',
  url       TEXT NOT NULL,
  position  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX ix_links_person ON person_links(person_id);

-- The notes log (newest first in the app).
CREATE TABLE person_notes (
  id         TEXT PRIMARY KEY,
  person_id  TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX ix_notes_person ON person_notes(person_id, created_at);

-- Photo files live in <photos dir>/<person id>/<filename>; this is the index.
CREATE TABLE person_photos (
  id         TEXT PRIMARY KEY,
  person_id  TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  filename   TEXT NOT NULL,
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX ix_photos_person ON person_photos(person_id);

-- Free-form tags, stored lower-case.
CREATE TABLE person_tags (
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  tag       TEXT NOT NULL,
  PRIMARY KEY (person_id, tag)
);

-- Fields the user adds in Settings → People fields.
CREATE TABLE custom_fields (
  id       TEXT PRIMARY KEY,
  name     TEXT NOT NULL,
  type     TEXT NOT NULL CHECK (type IN ('boolean', 'text', 'paragraph')),
  position INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE custom_values (
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  field_id  TEXT NOT NULL REFERENCES custom_fields(id) ON DELETE CASCADE,
  value     TEXT NOT NULL,
  PRIMARY KEY (person_id, field_id)
);
CREATE INDEX ix_custom_values_field ON custom_values(field_id);
