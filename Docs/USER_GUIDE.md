# User guide

People Manager keeps a card for everyone you want to remember, organised the way you
organise bookmarks. This guide walks through everything the app does.

- [The window](#the-window)
- [Tabs](#tabs)
- [Directories](#directories)
- [People](#people)
- [The person card](#the-person-card)
- [Editing a person](#editing-a-person)
- [Photos](#photos)
- [Notes](#notes)
- [Tags](#tags)
- [Search](#search)
- [Moving things around](#moving-things-around)
- [Deleting](#deleting)
- [Your own fields](#your-own-fields)
- [Spreadsheets (CSV)](#spreadsheets-csv)
- [Settings at a glance](#settings-at-a-glance)
- [Keyboard](#keyboard)

## The window

```
┌───────────────────────────────────────────────────────────────────────────┐
│ People Manager      [ Search by name, nickname or tag ⌘K ]                 ⚙ │
│ [Clients ⋯] Networking  Personal  Vendors   + Tab                           │
│ ┌─────────────┬───────────────────────────────────────────────────────────┐ │
│ │ DIRECTORIES │ Top level › Active clients                                │ │
│ │ ≡ Top level │ Active clients                                            │ │
│ │ ▸ Active… 62│ Paying clients and current engagements                    │ │
│ │   Health…21 │ [card] [card] [card]                        ← people       │ │
│ │ ▸ Prospects │ [card] [card]                                              │ │
│ └─────────────┴───────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────────┘
```

- **Tabs** across the top are your biggest groupings.
- **The sidebar** shows the selected tab's directories as a tree. The first row, **Top
  level**, is the tab itself — people who are not in any directory. The number next to a directory is how many people are
  in it, including everything inside it.
- **The main area** shows where you are (the breadcrumb), the directory's name and one-line
  description, and the people in it as cards. Directories live only in the sidebar.

## Tabs

- **Create:** `+ Tab` next to the tabs.
- **Rename:** double-click the tab, or the `⋯` inside the selected tab (next to its name) →
  *Rename tab*.
- **Reorder:** the tab's `⋯` → *Move left* / *Move right*.
- **Delete:** the tab's `⋯` → *Delete tab…*. A tab must be **empty** first — no directories and no
  people. If it isn't, the app tells you what is still in it (the first five things, then
  “…and N more”).

## Directories

A directory has a **name** and an optional **one-line description** (shown under the name).
Directories can hold people and other directories, as deep as you like.

- **Create:** `+ New directory` at the bottom of the sidebar or the folder button at the top of
  it (top level); *New directory* in the main area (inside the directory you are in); or a
  directory's `⋯` → *New directory inside*.
- **Rename / edit the description:** the directory's `⋯` → *Rename / edit description*.
- **Open and close** a directory in the sidebar with its arrow; the app remembers which are open.
- **Delete:** `⋯` → *Delete directory…* — only when it is empty (same rule and message as tabs).

## People

Each person shows as a card: photo (or coloured initials), **First Last (Nickname)** — the
brackets only appear when there is a nickname — and their one-line description.

- **Add:** the green **Add person here** button adds a person to the place you are looking at
  (the directory, or the tab's top level). Only the **first name** is required.
- **Open:** click the card.
- **Same name, different people:** allowed. Two or three “Mark Jones” are fine — their
  description, photo and where they sit tell them apart (search shows each one's path).

## The person card

On the **left**: the main photo, the other photo slots, and *At a glance* (title, business
category, date met, birthday, where they're from — whatever is filled in).

On the **right**: where they sit, the name and one-line description, the **key facts** as tiles
(the things to remember before you say hello), then the sections:

| Section | What is in it |
| --- | --- |
| **Overview** | How you met, their description, and the latest notes with a box to add one |
| **Contact & links** | Phones, emails and addresses (each with your own label), the business website and description, named links |
| **Notes** | The whole notes log, newest first |
| **Details** | Every standard field, including the empty ones (shown as —) |
| **More** | Your own fields (see [Your own fields](#your-own-fields)) |

The section bar sticks to the top as you scroll. Links and email addresses in any text are
clickable. `⋯` on the card → *Move to…* or *Delete person…*.

## Editing a person

Click **Edit**. Everything on the card is in the form:

- **Name** — first (required), last, nickname; the one-line description.
- **Key facts** — as many as you like.
- **Tags** — see [Tags](#tags).
- **Contact** — `+ Phone`, `+ Email`, `+ Address`, each with a label you choose (“Mobile”,
  “Office”…). Add as many of each as you need. Phone numbers take shape as you type
  (`(512) 555-0148`; digits past the tenth become the extension, `x4444`; `+1` or a `1` set apart
  by a space is the country code); a number for
  another country, starting with its `+` code, is left as you typed it.
- **Links** — a name you choose (“LinkedIn”, “Practice Instagram”…) and the address;
  plus the business website and a line about the business.
- **Work** — title, profession, business category (suggestions from categories you have used).
- **Background** — age range, where they're from, date met, birthday (the year is optional),
  how you met, description.
- **Family** — relationship, kids, pets, family notes.
- **More** — your own fields.

**Save** keeps the changes and shows *Saved — Undo* for a few seconds; Undo puts the old
values back. **Cancel** throws the changes away. Photos and notes are managed on the card
itself, in or out of Edit.

## Photos

Up to **5** per person (changeable in Settings → General).

- **Add:** the `+` slot → pick an image → drag and zoom to frame it → *Save photo*. Photos
  are saved square; the file keeps its original name with spaces turned into underscores.
- The **main photo** (ringed) is the one on their card and in search results. The first photo
  you add becomes the main one.
- **Click the big photo** to view it in a floating window; ‹ › (or the arrow keys) step through the others.
- **Click a small photo** → *View photo*, *Make main photo*, or *Delete photo…*.

Photos are files in `data/images/<person id>/`. They are not part of exports or backups — see
[DATA.md](DATA.md#photos).

## Notes

A dated log — ideal for jotting things down during a meeting.

- Type in *Jot something down…* and press **Enter** (or *Add*) — no need to open Edit.
- Hover a note to **edit** or **delete** it.
- Links in notes are clickable.

## Tags

Free-form words that help search find someone: `golf`, `chamber-lunch`, `referral-source`.

- Added and removed **only in Edit** (type, then Enter or a comma).
- **Never shown on the card** — they are for finding people, not for reading.
- Not case-sensitive: `Golf` and `golf` are the same tag.

## Search

Type in the search box at the top (or press **⌘K** / **Ctrl-K**). The main area turns into a
list of matches **across all tabs**, each with its path (*Clients › Active clients ›
Healthcare*). Click a match to open the card; **Esc** or *Clear search* goes back.

- Searches **first name, last name, nickname and tags**.
- Any part of a word matches: `ark` finds *Mark* and *Park*; `mark jo` finds *Mark Jones*.
- Case and accents don't matter: `tomas` finds *Tomás*.
- When someone is found **only because of a tag**, the result says *matched tag: …* so you
  know why they are there.

## Moving things around

**Drag:** press and **hold** a person card in the main area, or a directory in the sidebar
(about a quarter of a second) — it lifts — then drop it. The place it will land is highlighted.

| Drop it on… | What happens |
| --- | --- |
| another card | the person moves to that position (reorder) |
| a directory in the sidebar | it moves **into** that directory |
| **Top level** at the top of the sidebar | it moves to the tab's top level |
| a tab | it moves to that tab's top level |

**Esc** cancels a drag. A directory moves with **everything inside it**, even to another tab.
A directory can't be moved inside itself.

**Move to…:** in the `⋯` menu of a card, a directory, or the person card — choose a tab, then
where in it.

## Deleting

- **A person:** `⋯` → *Delete person…* (asks first). Their notes and photos go too.
- **A directory or tab:** only when empty — the refusal lists what is left.
- **Bulk or destructive actions** (rebuilding a database, *Replace all* on import, restoring
  a backup, deleting a field together with everyone's values) ask you to **type a word**
  (REBUILD, REPLACE, RESTORE, DELETE) before they run.

## Your own fields

**Settings → People fields** adds fields to every person, shown under **More** on the card:

| Type | Looks like |
| --- | --- |
| Yes / no | — / Yes / No |
| One line of text | a single line |
| A small paragraph | a text box |

You can rename them, reorder them, and switch a one-line field to a paragraph (or back) at any
time. A yes/no field can only change type while nobody has a value in it.

**Removing a field** that nobody uses just deletes it. If people **have** values in it, you
choose:

1. **Clear them one by one** — the window lists everyone with a value; *Clear* removes theirs.
   When the list is empty, delete the field.
2. **Delete from all N…** — the field and every value, after typing DELETE.
3. **Archive instead** — hidden everywhere, values kept; bring it back any time.

## Spreadsheets (CSV)

**Settings → Import & export** has two spreadsheet cards (details and every column in
[DATA.md](DATA.md#spreadsheets-csv)).

**Import people from a CSV**

1. **Download CSV template** (optional) — a file with one column per field, one per field of
   your own, and an example row (it is skipped automatically). Fill it in with Excel, Numbers or
   Google Sheets and save as CSV. Exports from **LinkedIn** (*Connections.csv*), **Google
   Contacts** and **Outlook** work as they are.
2. **Choose a CSV file…** — the app shows how each column was matched (*First Name → First
   name*, *URL → LinkedIn*…). Change any that are wrong; set a column to *don't import* to leave
   it out. **Only First Name is required** — every other column is optional.
3. Pick the **tab**. People land at its top level; tick **Put them in a new directory** to keep
   them together (e.g. *Imported Sep 29, 2026*).
4. Check the preview: how many are ready, rows skipped (no first name, the example row), names
   that already exist (allowed — tick *Skip …* to leave those out), dates that couldn't be read,
   and the first ten people as they will look.
5. **Import N people.** A backup is made first. **Undo this import** removes exactly the people
   it added (and its new directory if it's empty); *Recent imports* keeps the last 20 for undoing
   later.

Anything a CSV can't carry — **photos**, more notes, extra phone numbers or links, and putting
people into directories — is added to each person afterwards, on their card or by dragging them
onto a directory in the sidebar.

**Export people to a CSV** — everyone, or one tab. Same columns as the template plus **Tab** and
**Directory**, so you can open it in Excel, edit it, and import it again. Photos aren't included.

## Settings at a glance

Open with the ⚙ button. Every setting is saved to `config.json` and marked **Applies
immediately** or **Needs restart** (a banner reminds you: `./PEOPLE.sh --restart`).

| Section | What you can do |
| --- | --- |
| General | Port and *Allow other devices on my network* (both need a restart); photos per person; photos folder |
| Security | Turn the login on/off; password file; how long you stay signed in |
| Data source | JSON / SQLite / MySQL; test; build or rebuild the database |
| Import & export | People from and to spreadsheets (CSV template, import with undo, export); the whole data set as JSON (validate, replace or add alongside, export) |
| People fields | Your own fields |
| Appearance | Light, Dark, System, and themes you make yourself |
| Backups | Back up now, restore, download, delete |

Details: [CONFIGURATION.md](CONFIGURATION.md), [DATA.md](DATA.md), [SECURITY.md](SECURITY.md).

## Keyboard

| Key | Does |
| --- | --- |
| ⌘K / Ctrl-K | jump to search |
| Esc | clear the search · close a window · cancel a drag |
| Enter | add a note (in the note box) · add a tag (in the tag box) |
| Space / arrows | pick up and move a focused card or directory (keyboard dragging) |
