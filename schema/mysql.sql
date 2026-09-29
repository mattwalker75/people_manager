-- People Manager — MySQL / MariaDB schema, version 1.
--
-- Loaded by ./SETUP_MYSQL_DB.sh and by Settings → Data source → Build database,
-- inside the database named in config.json (dataSource.mysql.database).
-- The app never changes the schema on its own: it checks meta.schema_version at
-- startup and says so if the database needs building.
--
-- Ids are 12-character strings made by the app (not auto-numbers), so the same
-- record keeps its id when data moves between JSON, SQLite and MySQL.

SET FOREIGN_KEY_CHECKS = 0;
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
SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE meta (
  `key`   VARCHAR(64) NOT NULL PRIMARY KEY,
  `value` TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO meta (`key`, `value`) VALUES ('schema_version', '1');

-- The big groupings across the top of the screen.
CREATE TABLE tabs (
  id       VARCHAR(32)  NOT NULL PRIMARY KEY,
  name     VARCHAR(200) NOT NULL,
  position INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Directories nest without limit; parent_id NULL = top level of the tab.
CREATE TABLE directories (
  id          VARCHAR(32)  NOT NULL PRIMARY KEY,
  tab_id      VARCHAR(32)  NOT NULL,
  parent_id   VARCHAR(32)  NULL,
  name        VARCHAR(200) NOT NULL,
  description VARCHAR(500) NOT NULL DEFAULT '',
  position    INT NOT NULL DEFAULT 0,
  INDEX ix_directories_tab (tab_id, parent_id, position),
  CONSTRAINT fk_directories_tab FOREIGN KEY (tab_id) REFERENCES tabs(id),
  CONSTRAINT fk_directories_parent FOREIGN KEY (parent_id) REFERENCES directories(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per person. directory_id NULL = top level of the tab.
-- search_text = first + last + nickname + tags, lower-cased without accents.
CREATE TABLE people (
  id                   VARCHAR(32)  NOT NULL PRIMARY KEY,
  tab_id               VARCHAR(32)  NOT NULL,
  directory_id         VARCHAR(32)  NULL,
  position             INT NOT NULL DEFAULT 0,
  first_name           VARCHAR(200) NOT NULL,
  last_name            VARCHAR(200) NOT NULL DEFAULT '',
  nickname             VARCHAR(200) NOT NULL DEFAULT '',
  description          VARCHAR(500) NOT NULL DEFAULT '',
  title                VARCHAR(200) NOT NULL DEFAULT '',
  profession           VARCHAR(200) NOT NULL DEFAULT '',
  business_category    VARCHAR(200) NOT NULL DEFAULT '',
  age_range            VARCHAR(40)  NOT NULL DEFAULT '',
  marital_status       VARCHAR(40)  NOT NULL DEFAULT '',
  kids                 VARCHAR(200) NOT NULL DEFAULT '',
  pets                 VARCHAR(200) NOT NULL DEFAULT '',
  family_notes         TEXT NULL,
  birthday             VARCHAR(10)  NOT NULL DEFAULT '',
  date_met             VARCHAR(10)  NOT NULL DEFAULT '',
  from_place           VARCHAR(200) NOT NULL DEFAULT '',
  how_met              TEXT NULL,
  general_description  TEXT NULL,
  business_website     VARCHAR(500) NOT NULL DEFAULT '',
  business_description TEXT NULL,
  main_photo_id        VARCHAR(32)  NULL,
  search_text          TEXT NULL,
  created_at           VARCHAR(30)  NOT NULL,
  updated_at           VARCHAR(30)  NOT NULL,
  INDEX ix_people_place (tab_id, directory_id, position),
  CONSTRAINT fk_people_tab FOREIGN KEY (tab_id) REFERENCES tabs(id),
  CONSTRAINT fk_people_directory FOREIGN KEY (directory_id) REFERENCES directories(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- "Key facts" pinned at the top of the card.
CREATE TABLE person_facts (
  id        VARCHAR(32) NOT NULL PRIMARY KEY,
  person_id VARCHAR(32) NOT NULL,
  text      TEXT NOT NULL,
  position  INT NOT NULL DEFAULT 0,
  INDEX ix_facts_person (person_id),
  CONSTRAINT fk_facts_person FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Phones, emails and addresses, each with the user's own label.
CREATE TABLE person_contacts (
  id        VARCHAR(32)  NOT NULL PRIMARY KEY,
  person_id VARCHAR(32)  NOT NULL,
  kind      VARCHAR(10)  NOT NULL,
  label     VARCHAR(200) NOT NULL DEFAULT '',
  value     TEXT NOT NULL,
  position  INT NOT NULL DEFAULT 0,
  INDEX ix_contacts_person (person_id),
  CONSTRAINT fk_contacts_person FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Social media and other links, each with a name the user chooses.
CREATE TABLE person_links (
  id        VARCHAR(32)  NOT NULL PRIMARY KEY,
  person_id VARCHAR(32)  NOT NULL,
  label     VARCHAR(200) NOT NULL DEFAULT '',
  url       TEXT NOT NULL,
  position  INT NOT NULL DEFAULT 0,
  INDEX ix_links_person (person_id),
  CONSTRAINT fk_links_person FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The notes log (newest first in the app).
CREATE TABLE person_notes (
  id         VARCHAR(32) NOT NULL PRIMARY KEY,
  person_id  VARCHAR(32) NOT NULL,
  body       TEXT NOT NULL,
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL,
  INDEX ix_notes_person (person_id, created_at),
  CONSTRAINT fk_notes_person FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Photo files live in <photos dir>/<person id>/<filename>; this is the index.
CREATE TABLE person_photos (
  id         VARCHAR(32)  NOT NULL PRIMARY KEY,
  person_id  VARCHAR(32)  NOT NULL,
  filename   VARCHAR(255) NOT NULL,
  position   INT NOT NULL DEFAULT 0,
  created_at VARCHAR(30)  NOT NULL,
  INDEX ix_photos_person (person_id),
  CONSTRAINT fk_photos_person FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Free-form tags, stored lower-case.
CREATE TABLE person_tags (
  person_id VARCHAR(32)  NOT NULL,
  tag       VARCHAR(100) NOT NULL,
  PRIMARY KEY (person_id, tag),
  CONSTRAINT fk_tags_person FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Fields the user adds in Settings → People fields.
CREATE TABLE custom_fields (
  id       VARCHAR(32)  NOT NULL PRIMARY KEY,
  name     VARCHAR(200) NOT NULL,
  type     VARCHAR(10)  NOT NULL,
  position INT NOT NULL DEFAULT 0,
  archived TINYINT(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE custom_values (
  person_id VARCHAR(32) NOT NULL,
  field_id  VARCHAR(32) NOT NULL,
  value     TEXT NOT NULL,
  PRIMARY KEY (person_id, field_id),
  INDEX ix_custom_values_field (field_id),
  CONSTRAINT fk_values_person FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE,
  CONSTRAINT fk_values_field FOREIGN KEY (field_id) REFERENCES custom_fields(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
