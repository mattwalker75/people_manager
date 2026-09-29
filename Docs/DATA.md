# Your data

- [Data sources](#data-sources)
- [Choosing a data source](#choosing-a-data-source)
- [Switching](#switching)
- [Building a database](#building-a-database)
- [Spreadsheets (CSV)](#spreadsheets-csv)
- [Import and export (JSON)](#import-and-export-json)
- [The validation report](#the-validation-report)
- [Backups](#backups)
- [Photos](#photos)
- [The file format](#the-file-format)

## Data sources

People Manager keeps tabs, directories, people, notes, tags and custom fields in **one** data
source at a time:

| | Best for | Setup |
| --- | --- | --- |
| **JSON file** | getting started; up to a few thousand people; a file you can read | none — created when you add your first tab |
| **SQLite** | any size, on this computer — **recommended** | *Build database* once |
| **MySQL / MariaDB** | a database server, here or elsewhere on your network | `./SETUP_MYSQL_DB.sh`, then *Build database* is already done |

All three hold exactly the same information, and records keep their ids when moved between
them. Photos are never in the data source — see [Photos](#photos).

## Choosing a data source

**Settings → Data source.** The top card shows the source in use and its state (e.g.
*Connected · 300 people in 4 tabs, 18 directories*). Below, pick JSON, SQLite or MySQL, fill
in its settings, and **Test these settings** to check them before switching.

- **SQLite:** the database file (default `data/people.db`).
- **MySQL:** host, port, database, user, password. `./SETUP_MYSQL_DB.sh` creates the database
  and user from these settings — see [SCRIPTS.md](SCRIPTS.md#setup_mysql_dbsh).

## Switching

**Switch data source** applies at once (no restart). The app asks first and reminds you:

> The new source **starts empty** unless it already holds data — your current people stay
> where they are.

To bring people across, switch, then use **Import & export** (below) with the old JSON file —
or export from the old source first if it was SQLite/MySQL.

If the new source is not ready (a SQLite file that doesn't exist yet, a MySQL server that
refuses the login…), the main window says so in plain words and links to Settings.

## Building a database

A new SQLite file or MySQL database needs People Manager's tables once:

- **Settings → Data source → Build database** (SQLite: creates the file; MySQL: the database
  and user must exist — `./SETUP_MYSQL_DB.sh` makes them and builds the tables), or
- `./SETUP_SQLITE_DB.sh` / `./SETUP_MYSQL_DB.sh` from the terminal.

The tables come from the hand-written `schema/sqlite.sql` and `schema/mysql.sql`. The app never
changes tables on its own; at start it checks the schema version and says if the database
needs building.

**Rebuild database…** on a database that already has tables **erases everything in it** and
asks you to type REBUILD.

## Spreadsheets (CSV)

People — not tabs, directories or settings — can come in from and go out to spreadsheets.
**Settings → Import & export**, the two *spreadsheet* cards. (To move *everything*, use the JSON
import and export below.)

### The template

*Download CSV template* gives `people-template.csv`, one column per field — fill in what you
know; **only First Name is required**:

| Columns | Notes |
| --- | --- |
| First Name, Last Name, Nickname, One-line Description, Title, Profession, Business Category | |
| Mobile Phone, Work Phone, Home Phone | labelled Mobile / Work / Home on the card |
| Personal Email, Work Email | |
| Home Address, Work Address | an address may run over several lines in one cell |
| LinkedIn, Facebook, Instagram, X, TikTok, YouTube, Website | each becomes a named link |
| Business Website, Business Description | |
| Birthday, Date Met | `2026-03-12`, `3/12/2026`, `12 Mar 2026`, `March 12, 2026`; a birthday may leave out the year (`06-04`, `June 4`) |
| From, How We Met, Description | |
| Age Range, Relationship, Kids, Pets, Family Notes | |
| Key Facts, Tags | several in one cell, separated by `;` |
| Notes | becomes the first note; several notes separated by a line of `---` |
| *one column per field you added* | yes/no fields accept Yes/No, True/False, Y/N, 1/0 |

The template has one example row (Susan Park) whose Notes say *“Example row — delete it before
importing”*; the import skips that row automatically. Files are saved with a UTF-8 marker so
Excel shows accents correctly.

### Importing

1. Choose the file. The app finds the heading row (even below the notes LinkedIn puts at the top)
   and matches each column. It recognises the template's headings, **LinkedIn**'s
   *Connections.csv* (URL → LinkedIn link, Company + Position → title and one-line description,
   Connected On → Date met), **Google Contacts** (Given/Family Name, *Phone 1 – Label/Value*
   pairs, Labels → tags), **Outlook** (Mobile/Business/Home Phone, E-mail Address, Job Title, Web
   Page…), common variants (`first_name`, `Surname`, `Cell`, `Twitter`…) and the names of your own
   fields. Change any match; *— don't import —* leaves a column out.
   - Also available: *Phone / Email / Address (labelled from the column)* — the heading becomes the
     label (“Business Phone” → Business); *Other phones / emails / addresses / links* — cells like
     `Office: 555-0100; Fax: 555-0199`; *Company* — added to the one-line description.
2. Pick the tab, and optionally *Put them in a new directory*.
3. The preview lists: rows ready; **skipped** rows (no first name; the example row); **names that
   already exist** in that tab or twice in the file — allowed, and *Skip the N whose name is
   already in …* leaves them out; **warnings** (a date that isn't a date, a yes/no field holding
   something else — those cells are left empty); and the first ten people. Row numbers match
   Excel's.
4. Import. **A backup is made first.** New people go to the end of the tab's top level (or into
   the new directory).
5. **Undo this import** — right away, or later from *Recent imports* (the last 20) — deletes
   exactly the people that import added, plus its new directory if nothing else is in it.

What a CSV can't carry — photos, more than the notes in one cell, and where in the tree someone
sits — is added afterwards on their card, or by dragging them onto a directory.

### Exporting

*Export people to a spreadsheet*: everyone, or one tab → `people-<date>.csv` (or
`people-<tab>-<date>.csv`). The columns are the template's, then:

| Column | Holds |
| --- | --- |
| Other Phones / Other Emails / Other Addresses | contacts that didn't fit a named column, as `Label: value; …` |
| Other Links | links other than the named ones, as `Name: address; …` |
| Tab, Directory | where the person sits (`Active clients › Healthcare`) — ignored when importing |

Notes are all in the Notes cell, newest first, separated by `---`. Because the columns are the
template's, **an export can be edited in Excel and imported again** (into any tab). Photos are not
included.

## Import and export (JSON)

**Settings → Import & export**, the JSON cards — for moving *everything* (tabs, directories,
people, custom fields).

**Import** reads a JSON file (default: the JSON data source file) into the source you use now:

1. **Validate data** reads the file and shows a report — nothing changes yet.
2. Choose:
   - **Replace all…** — everything in the current source is deleted and replaced with the file
     (type REPLACE). Ids are kept, so photo folders still match.
   - **Add alongside** — the file's people are added next to yours. Everything gets new ids; a
     tab whose name already exists gets “(imported)” added; custom fields with the same name
     and type are merged; photo folders found in the photos folder are copied to the new ids.

A file with **errors** can't be imported until they are fixed; warnings don't block.

**Export** writes everything in the current source to a JSON file (default
`data/export-<date>-<time>.json`) — or **Download** it through the browser. An export is in
exactly the JSON data source's format, so it can be imported anywhere or used directly as a
JSON data source.

> **Photos are not included** in imports or exports — they can be gigabytes. Copy the photos
> folder yourself.

## The validation report

Counts (tabs, directories, people, custom fields, photos, notes), then:

**Errors** (block the import):
- not a People Manager file, or a newer version
- an id used twice
- a directory or person pointing to a tab or directory that isn't in the file
- a directory in a different tab from its parent, or inside itself (a loop)
- a person with no first name

**Warnings** (import anyway):
- a photo listed for someone whose file isn't in the photos folder
- two or more people with the same name (allowed — shown so you can check)
- a yes/no custom field holding something other than yes/no (left empty)
- a birthday or date met that isn't a date (left empty)
- a value for a custom field that isn't in the file (dropped)
- an unknown custom field type (becomes one line of text)

Up to 50 of each are listed, then “…and N more”.

## Backups

**Settings → Backups → Back up now** writes `people-backup-<date>-<time>.zip` to
`data/backups/` (Settings changes the folder). Inside:

| File | What |
| --- | --- |
| `people.json` | everything in the current data source (the export format) |
| `config.json` | your settings, **with the MySQL password removed** |
| `README.txt` | what is and isn't inside |

**Photos are not included.**

- **Restore…** (from the list) or **Restore from a file…** (a zip from elsewhere) **replaces**
  everything in the current data source with the backup's `people.json` (type RESTORE). The
  backup's settings are not applied — `config.json` is there for reference.
- **Download** keeps a copy somewhere else; **Delete** removes the zip.

## Photos

Photo files live in the photos folder (default `data/images/`), one folder per person named by
their id: `data/images/k3m9x2pq7wza/Susan_Park.jpg`. The data source only remembers the names.

- They are **not** in exports, imports or backups. When moving to another computer, copy the
  folder yourself and put it at the same place (Settings → General shows where).
- *Replace all* keeps ids, so the folders keep matching. *Add alongside* copies folders it finds
  to the new ids.
- Deleting a photo deletes its file; deleting a person deletes their folder.
- The validation report warns about photos listed in a file but missing on disk.

## The file format

The JSON data source, exports and backups all use this format (`version` 1):

```json
{
  "format": "people-manager",
  "version": 1,
  "exportedAt": "2026-09-29T20:15:00.000Z",
  "tabs": [ { "id": "t8f2k…", "name": "Clients", "position": 0 } ],
  "directories": [
    { "id": "d4m…", "tabId": "t8f2k…", "parentId": null, "name": "Active clients",
      "description": "Paying clients", "position": 0 }
  ],
  "customFields": [ { "id": "f9q…", "name": "Golf handicap", "type": "text", "position": 0, "archived": false } ],
  "people": [
    {
      "id": "p3x…", "tabId": "t8f2k…", "directoryId": "d4m…", "position": 0,
      "firstName": "Susan", "lastName": "Park", "nickname": "Sue",
      "description": "Owner, Park Family Dental",
      "title": "Practice owner", "profession": "Dentist", "businessCategory": "Healthcare",
      "ageRange": "40s", "maritalStatus": "Married", "kids": "2", "pets": "Dog — Biscuit", "familyNotes": "",
      "birthday": "06-04", "dateMet": "2026-03-12", "fromPlace": "Portland, Oregon",
      "howMet": "Chamber lunch…", "generalDescription": "Tall, silver hair…",
      "businessWebsite": "parkfamilydental.com", "businessDescription": "Family dentistry",
      "keyFacts": ["Prefers texts"],
      "contacts": [ { "id": "c1…", "kind": "phone", "label": "Mobile", "value": "(512) 555-0148" } ],
      "links": [ { "id": "l1…", "label": "LinkedIn", "url": "linkedin.com/in/…" } ],
      "notes": [ { "id": "n1…", "body": "Follow up after Oct 10", "createdAt": "…", "updatedAt": "…" } ],
      "photos": [ { "id": "ph1…", "filename": "Susan_Park.jpg", "createdAt": "…" } ],
      "mainPhotoId": "ph1…",
      "tags": ["chamber-lunch", "dental"],
      "custom": { "f9q…": "14" },
      "createdAt": "…", "updatedAt": "…"
    }
  ]
}
```

- `parentId` / `directoryId` `null` = the top level of the tab.
- `birthday` is `MM-DD` or `YYYY-MM-DD`; `dateMet` is `YYYY-MM-DD`; both may be `""`.
- `contacts[].kind` is `phone`, `email` or `address`.
- yes/no custom values are `"true"` / `"false"`.
- Notes are newest first.
