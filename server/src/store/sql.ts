/**
 * SQLite and MySQL/MariaDB data sources — one implementation over Knex (a
 * query builder, not an ORM). The schema itself lives in schema/sqlite.sql
 * and schema/mysql.sql and is only ever applied by Build database or the
 * SETUP_*_DB.sh scripts; the app never alters tables on its own.
 */
import fs from "node:fs";
import path from "node:path";
import { knex, type Knex } from "knex";
import type {
  ContactItem, CustomField, DataSourceStatus, Directory, Id, LinkItem, Note, PeopleDocument, Person, PersonFields, PersonSummary, Photo, Tab,
} from "../../../shared/types.js";
import { nameSearchText, PERSON_FIELD_KEYS, fold } from "../../../shared/types.js";
import { ROOT } from "../config.js";
import { now, UserError } from "../util.js";
import type { DirectoryPlacement, PeopleWhere, PersonPlacement, SearchHit, Store } from "./types.js";

export const SCHEMA_VERSION = "1";

export interface MysqlSettings { host: string; port: number; database: string; user: string; password: string }

const snake = (k: string) => k.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
const COL: Record<keyof PersonFields, string> = Object.fromEntries(PERSON_FIELD_KEYS.map((k) => [k, snake(k)])) as Record<keyof PersonFields, string>;
const s = (v: unknown) => (v == null ? "" : String(v));

/** What the search column holds: names, nickname and tags, lower-case, no accents. */
export function searchTextOf(p: Pick<Person, "firstName" | "lastName" | "nickname" | "tags">): string {
  return [nameSearchText(p), ...p.tags.map(fold)].join(" ");
}

function personRow(p: Person): Record<string, unknown> {
  const row: Record<string, unknown> = { id: p.id, tab_id: p.tabId, directory_id: p.directoryId, position: p.position,
    main_photo_id: p.mainPhotoId, search_text: searchTextOf(p), created_at: p.createdAt, updated_at: p.updatedAt };
  for (const k of PERSON_FIELD_KEYS) row[COL[k]] = p[k] ?? "";
  return row;
}

function personFromRow(r: Record<string, unknown>): Omit<Person, "keyFacts" | "contacts" | "links" | "notes" | "photos" | "tags" | "custom"> {
  const out: Record<string, unknown> = { id: r.id, tabId: r.tab_id, directoryId: r.directory_id ?? null, position: Number(r.position),
    mainPhotoId: r.main_photo_id ?? null, createdAt: s(r.created_at), updatedAt: s(r.updated_at) };
  for (const k of PERSON_FIELD_KEYS) out[k] = s(r[COL[k]]);
  return out as ReturnType<typeof personFromRow>;
}

const SUMMARY_COLS = ["p.id", "p.tab_id", "p.directory_id", "p.position", "p.first_name", "p.last_name", "p.nickname", "p.description", "p.main_photo_id", "ph.filename as photo_filename"];
function summaryFromRow(r: Record<string, unknown>): PersonSummary {
  return { id: s(r.id), tabId: s(r.tab_id), directoryId: (r.directory_id as string) ?? null, position: Number(r.position),
    firstName: s(r.first_name), lastName: s(r.last_name), nickname: s(r.nickname), description: s(r.description),
    photo: r.main_photo_id && r.photo_filename ? { id: s(r.main_photo_id), filename: s(r.photo_filename) } : null };
}

/** Parents before children, so the self-referencing foreign key is always satisfied. */
function parentsFirst(dirs: Directory[]): Directory[] {
  const out: Directory[] = []; const done = new Set<Id>(); let rest = [...dirs];
  while (rest.length) {
    const next = rest.filter((d) => !d.parentId || done.has(d.parentId) || !dirs.some((x) => x.id === d.parentId));
    if (!next.length) { out.push(...rest); break; } // a cycle — let the database complain
    for (const d of next) { out.push(d); done.add(d.id); }
    rest = rest.filter((d) => !done.has(d.id));
  }
  return out;
}

const CHILD_TABLES = ["custom_values", "person_tags", "person_photos", "person_notes", "person_links", "person_contacts", "person_facts"];

export class SqlStore implements Store {
  private db: Knex | null = null;

  private constructor(readonly type: "sqlite" | "mysql", private readonly sqliteFile: string, private readonly mysql: MysqlSettings | null) {}

  static sqlite(file: string): SqlStore { return new SqlStore("sqlite", file, null); }
  static mysql(settings: MysqlSettings): SqlStore { return new SqlStore("mysql", "", settings); }

  // ---------------------------------------------------------------- connection
  private connect(): Knex {
    if (this.db) return this.db;
    if (this.type === "sqlite") {
      if (!fs.existsSync(this.sqliteFile)) throw new UserError(`The database file ${this.sqliteFile} does not exist yet. Use Build database in Settings → Data source (or run ./SETUP_SQLITE_DB.sh).`, 409);
      this.db = knex({ client: "better-sqlite3", useNullAsDefault: true, connection: { filename: this.sqliteFile, options: { fileMustExist: true } } as Knex.Sqlite3ConnectionConfig,
        pool: { afterCreate: (conn: { pragma: (s: string) => void }, done: (e: Error | null, c: unknown) => void) => { conn.pragma("foreign_keys = ON"); conn.pragma("journal_mode = WAL"); done(null, conn); } } });
    } else {
      const m = this.mysql!;
      this.db = knex({ client: "mysql2", connection: { host: m.host, port: m.port, user: m.user, password: m.password, database: m.database, charset: "utf8mb4", connectTimeout: 5000 },
        pool: { min: 0, max: 5 }, acquireConnectionTimeout: 7000 });
    }
    return this.db;
  }

  /** Turn a driver error into a sentence a person can act on. */
  private explain(e: unknown): string {
    const err = e as { code?: string; message?: string; errno?: number };
    const m = this.mysql;
    switch (err.code) {
      case "ECONNREFUSED": return `Nothing is answering at ${m?.host}:${m?.port}. Is MySQL/MariaDB running? (brew services start mariadb)`;
      case "ENOTFOUND": return `The MySQL host “${m?.host}” could not be found.`;
      case "ETIMEDOUT": return `Timed out reaching MySQL at ${m?.host}:${m?.port}.`;
      case "ER_ACCESS_DENIED_ERROR": return `MySQL refused the login for “${m?.user}”. Check the user and password (./SETUP_MYSQL_DB.sh creates them).`;
      case "ER_BAD_DB_ERROR": return `The database “${m?.database}” does not exist yet. Run ./SETUP_MYSQL_DB.sh to create it.`;
      case "ER_DBACCESS_DENIED_ERROR": return `“${m?.user}” is not allowed to use the database “${m?.database}”. Run ./SETUP_MYSQL_DB.sh to grant access.`;
    }
    return (err.message || String(e)).split("\n")[0];
  }

  async open(): Promise<void> { /* connections are made lazily */ }

  async close(): Promise<void> { if (this.db) { const d = this.db; this.db = null; await d.destroy(); } }

  private isMissingTable(e: unknown): boolean {
    const err = e as { code?: string; message?: string };
    return err.code === "ER_NO_SUCH_TABLE" || /no such table/i.test(err.message || "");
  }

  async status(): Promise<DataSourceStatus> {
    const where = this.type === "sqlite" ? this.sqliteFile : `${this.mysql!.user}@${this.mysql!.host}:${this.mysql!.port}/${this.mysql!.database}`;
    if (this.type === "sqlite" && !fs.existsSync(this.sqliteFile))
      return { type: this.type, ok: false, needsBuild: true, message: `The database file ${this.sqliteFile} does not exist yet. Build database creates it.` };
    try {
      const db = this.connect();
      const row = await db("meta").where({ key: "schema_version" }).first();
      if (!row) return { type: this.type, ok: false, needsBuild: true, message: `${where} has no schema version. Rebuild the database.` };
      if (String(row.value) !== SCHEMA_VERSION)
        return { type: this.type, ok: false, needsBuild: true, message: `${where} was built for schema version ${row.value}; this app needs version ${SCHEMA_VERSION}. Export your data first, then rebuild.` };
      const [t, d, p] = await Promise.all(["tabs", "directories", "people"].map((x) => db(x).count({ n: "*" }).first()));
      return { type: this.type, ok: true, needsBuild: false, message: `Connected to ${where}`,
        counts: { tabs: Number(t?.n ?? 0), directories: Number(d?.n ?? 0), people: Number(p?.n ?? 0) } };
    } catch (e) {
      if (this.isMissingTable(e)) return { type: this.type, ok: false, needsBuild: true, message: `${where} is reachable but has no People Manager tables yet. Build database creates them.` };
      await this.close().catch(() => {});
      return { type: this.type, ok: false, needsBuild: false, message: this.explain(e) };
    }
  }

  async hasSchema(): Promise<boolean> {
    if (this.type === "sqlite") {
      if (!fs.existsSync(this.sqliteFile)) return false;
      const rows = await this.connect().raw("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('meta', 'people', 'tabs')");
      return rows.length > 0;
    }
    try {
      const [rows] = await this.connect().raw("SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = ? AND table_name IN ('meta', 'people', 'tabs')", [this.mysql!.database]);
      return Number(rows[0].n) > 0;
    } catch (e) { throw new UserError(this.explain(e), 409); }
  }

  async build(rebuild: boolean): Promise<void> {
    if ((await this.hasSchema()) && !rebuild)
      throw new UserError("This database already has People Manager tables. Rebuilding erases everything in it — confirm the rebuild to go ahead.", 409);
    const sql = fs.readFileSync(path.join(ROOT, "schema", `${this.type}.sql`), "utf8");
    await this.close();
    if (this.type === "sqlite") {
      fs.mkdirSync(path.dirname(this.sqliteFile), { recursive: true });
      const Database = (await import("better-sqlite3")).default;
      const raw = new Database(this.sqliteFile);
      try { raw.exec(sql); } finally { raw.close(); }
    } else {
      const mysql2 = await import("mysql2/promise");
      const m = this.mysql!;
      let conn;
      try { conn = await mysql2.createConnection({ host: m.host, port: m.port, user: m.user, password: m.password, database: m.database, multipleStatements: true, connectTimeout: 5000 }); }
      catch (e) { throw new UserError(this.explain(e), 409); }
      try { await conn.query(sql); }
      catch (e) { throw new UserError(`Building the tables failed: ${this.explain(e)}. The MySQL user needs CREATE, DROP, ALTER and INDEX on “${m.database}” — ./SETUP_MYSQL_DB.sh grants them.`, 409); }
      finally { await conn.end(); }
    }
  }

  private get q(): Knex { return this.connect(); }

  // ---------------------------------------------------------------- tabs
  async listTabs(): Promise<Tab[]> {
    return (await this.q("tabs").orderBy("position")).map((r: Record<string, unknown>) => ({ id: s(r.id), name: s(r.name), position: Number(r.position) }));
  }
  async insertTab(t: Tab) { await this.q("tabs").insert(t); }
  async updateTab(id: Id, patch: Partial<Tab>) { await this.q("tabs").where({ id }).update(patch); }
  async deleteTab(id: Id) { await this.q("tabs").where({ id }).del(); }

  // ---------------------------------------------------------------- directories
  private dirFromRow = (r: Record<string, unknown>): Directory => ({ id: s(r.id), tabId: s(r.tab_id), parentId: (r.parent_id as string) ?? null, name: s(r.name), description: s(r.description), position: Number(r.position) });
  private dirRow = (d: Partial<Directory>) => {
    const o: Record<string, unknown> = {};
    if (d.id !== undefined) o.id = d.id; if (d.tabId !== undefined) o.tab_id = d.tabId; if (d.parentId !== undefined) o.parent_id = d.parentId;
    if (d.name !== undefined) o.name = d.name; if (d.description !== undefined) o.description = d.description; if (d.position !== undefined) o.position = d.position;
    return o;
  };
  async listDirectories(tabId?: Id): Promise<Directory[]> {
    const q = this.q("directories").orderBy("position");
    if (tabId) q.where({ tab_id: tabId });
    return (await q).map(this.dirFromRow);
  }
  async getDirectory(id: Id) { const r = await this.q("directories").where({ id }).first(); return r ? this.dirFromRow(r) : null; }
  async insertDirectory(d: Directory) { await this.q("directories").insert(this.dirRow(d)); }
  async updateDirectory(id: Id, patch: Partial<Directory>) { await this.q("directories").where({ id }).update(this.dirRow(patch)); }
  async deleteDirectory(id: Id) { await this.q("directories").where({ id }).del(); }
  async placeDirectories(list: DirectoryPlacement[]) {
    await this.q.transaction(async (tx) => { for (const u of list) await tx("directories").where({ id: u.id }).update({ tab_id: u.tabId, parent_id: u.parentId, position: u.position }); });
  }

  // ---------------------------------------------------------------- people
  private where(q: Knex.QueryBuilder, w: PeopleWhere, alias = "p") {
    if (w.tabId) q.where(`${alias}.tab_id`, w.tabId);
    if (w.directoryId === null) q.whereNull(`${alias}.directory_id`); else if (w.directoryId !== undefined) q.where(`${alias}.directory_id`, w.directoryId);
    if (w.ids) q.whereIn(`${alias}.id`, w.ids.length ? w.ids : ["-"]);
    return q;
  }
  private summaries() { return this.q({ p: "people" }).leftJoin({ ph: "person_photos" }, "ph.id", "p.main_photo_id").select(SUMMARY_COLS); }
  async listPeople(w: PeopleWhere): Promise<PersonSummary[]> {
    return (await this.where(this.summaries(), w).orderBy([{ column: "p.position" }, { column: "p.first_name" }])).map(summaryFromRow);
  }
  async countPeople(w: PeopleWhere) { const r = await this.where(this.q({ p: "people" }).count({ n: "*" }), w).first(); return Number(r?.n ?? 0); }

  async getPerson(id: Id): Promise<Person | null> {
    const row = await this.q("people").where({ id }).first();
    if (!row) return null;
    const [facts, contacts, links, notes, photos, tags, custom] = await Promise.all([
      this.q("person_facts").where({ person_id: id }).orderBy("position"),
      this.q("person_contacts").where({ person_id: id }).orderBy("position"),
      this.q("person_links").where({ person_id: id }).orderBy("position"),
      this.q("person_notes").where({ person_id: id }).orderBy("created_at", "desc"),
      this.q("person_photos").where({ person_id: id }).orderBy("position"),
      this.q("person_tags").where({ person_id: id }).orderBy("tag"),
      this.q("custom_values").where({ person_id: id }),
    ]);
    return assemble(row, { facts, contacts, links, notes, photos, tags, custom });
  }

  private async writeChildren(tx: Knex.Transaction, p: Person) {
    const pid = p.id;
    const batch = async (table: string, rows: Record<string, unknown>[]) => { if (rows.length) await tx.batchInsert(table, rows, 200); };
    await batch("person_facts", p.keyFacts.map((text, i) => ({ id: `${pid}-f${i}`, person_id: pid, text, position: i })));
    await batch("person_contacts", p.contacts.map((c, i) => ({ id: c.id, person_id: pid, kind: c.kind, label: c.label, value: c.value, position: i })));
    await batch("person_links", p.links.map((l, i) => ({ id: l.id, person_id: pid, label: l.label, url: l.url, position: i })));
    await batch("person_notes", p.notes.map((n) => ({ id: n.id, person_id: pid, body: n.body, created_at: n.createdAt, updated_at: n.updatedAt })));
    await batch("person_photos", p.photos.map((ph, i) => ({ id: ph.id, person_id: pid, filename: ph.filename, position: i, created_at: ph.createdAt })));
    await batch("person_tags", [...new Set(p.tags)].map((tag) => ({ person_id: pid, tag })));
    await batch("custom_values", Object.entries(p.custom).filter(([, v]) => v !== "").map(([field_id, value]) => ({ person_id: pid, field_id, value })));
  }

  async insertPerson(p: Person) {
    await this.q.transaction(async (tx) => { await tx("people").insert(personRow(p)); await this.writeChildren(tx, p); });
  }
  async savePerson(p: Person) {
    await this.q.transaction(async (tx) => {
      const n = await tx("people").where({ id: p.id }).update(personRow(p));
      if (!n) throw new UserError("That person no longer exists.", 404);
      for (const t of CHILD_TABLES) await tx(t).where({ person_id: p.id }).del();
      await this.writeChildren(tx, p);
    });
  }
  async deletePerson(id: Id) {
    await this.q.transaction(async (tx) => { for (const t of CHILD_TABLES) await tx(t).where({ person_id: id }).del(); await tx("people").where({ id }).del(); });
  }
  async placePeople(list: PersonPlacement[]) {
    await this.q.transaction(async (tx) => { for (const u of list) await tx("people").where({ id: u.id }).update({ tab_id: u.tabId, directory_id: u.directoryId, position: u.position }); });
  }

  async searchPeople(folded: string, limit: number): Promise<SearchHit[]> {
    const pattern = "%" + folded.replace(/[\\%_]/g, (c) => "\\" + c) + "%";
    const rows = await this.summaries().whereRaw("p.search_text LIKE ? ESCAPE ?", [pattern, "\\"]).orderBy([{ column: "p.first_name" }, { column: "p.last_name" }]).limit(limit);
    const ids = rows.map((r: Record<string, unknown>) => s(r.id));
    const tagRows = ids.length ? await this.q("person_tags").whereIn("person_id", ids) : [];
    return rows.map((r: Record<string, unknown>) => ({ ...summaryFromRow(r), tags: tagRows.filter((t: Record<string, unknown>) => t.person_id === r.id).map((t: Record<string, unknown>) => s(t.tag)) }));
  }

  // ---------------------------------------------------------------- custom fields
  async listFields(): Promise<CustomField[]> {
    return (await this.q("custom_fields").orderBy("position")).map((r: Record<string, unknown>) => ({ id: s(r.id), name: s(r.name), type: s(r.type) as CustomField["type"], position: Number(r.position), archived: !!Number(r.archived) }));
  }
  async insertField(f: CustomField) { await this.q("custom_fields").insert({ ...f, archived: f.archived ? 1 : 0 }); }
  async updateField(id: Id, patch: Partial<CustomField>) {
    const o: Record<string, unknown> = { ...patch }; if (patch.archived !== undefined) o.archived = patch.archived ? 1 : 0;
    await this.q("custom_fields").where({ id }).update(o);
  }
  async deleteField(id: Id) {
    await this.q.transaction(async (tx) => { await tx("custom_values").where({ field_id: id }).del(); await tx("custom_fields").where({ id }).del(); });
  }
  async fieldUsage(fieldId: Id) {
    return (await this.q("custom_values").where({ field_id: fieldId }).whereNot({ value: "" })).map((r: Record<string, unknown>) => ({ personId: s(r.person_id), value: s(r.value) }));
  }
  async clearFieldValues(fieldId: Id) {
    const n = await this.q("custom_values").where({ field_id: fieldId }).whereNot({ value: "" }).count({ n: "*" }).first();
    await this.q("custom_values").where({ field_id: fieldId }).del();
    return Number(n?.n ?? 0);
  }

  // ---------------------------------------------------------------- whole document
  async exportAll(): Promise<PeopleDocument> {
    const [tabs, directories, customFields, rows, facts, contacts, links, notes, photos, tags, custom] = await Promise.all([
      this.listTabs(), this.listDirectories(), this.listFields(), this.q("people").orderBy("position"),
      this.q("person_facts").orderBy("position"), this.q("person_contacts").orderBy("position"), this.q("person_links").orderBy("position"),
      this.q("person_notes").orderBy("created_at", "desc"), this.q("person_photos").orderBy("position"), this.q("person_tags").orderBy("tag"), this.q("custom_values"),
    ]);
    const group = (list: Record<string, unknown>[]) => { const m = new Map<string, Record<string, unknown>[]>(); for (const r of list) { const k = s(r.person_id); if (!m.has(k)) m.set(k, []); m.get(k)!.push(r); } return m; };
    const g = { facts: group(facts), contacts: group(contacts), links: group(links), notes: group(notes), photos: group(photos), tags: group(tags), custom: group(custom) };
    const pick = (k: keyof typeof g, id: string) => g[k].get(id) || [];
    const people = rows.map((r: Record<string, unknown>) => { const id = s(r.id); return assemble(r, { facts: pick("facts", id), contacts: pick("contacts", id), links: pick("links", id), notes: pick("notes", id), photos: pick("photos", id), tags: pick("tags", id), custom: pick("custom", id) }); });
    return { format: "people-manager", version: 1, exportedAt: now(), tabs, directories, people, customFields };
  }

  private async load(tx: Knex.Transaction, doc: PeopleDocument) {
    const chunk = async (table: string, rows: Record<string, unknown>[]) => { if (rows.length) await tx.batchInsert(table, rows, 100); };
    await chunk("tabs", doc.tabs.map((t) => ({ id: t.id, name: t.name, position: t.position })));
    for (const d of parentsFirst(doc.directories)) await tx("directories").insert(this.dirRow(d));
    await chunk("custom_fields", doc.customFields.map((f) => ({ id: f.id, name: f.name, type: f.type, position: f.position, archived: f.archived ? 1 : 0 })));
    await chunk("people", doc.people.map(personRow));
    for (const p of doc.people) await this.writeChildren(tx, p);
  }

  async replaceAll(doc: PeopleDocument) {
    await this.q.transaction(async (tx) => {
      for (const t of [...CHILD_TABLES, "people"]) await tx(t).del();
      // children before parents for the directory self-reference
      if (this.type === "mysql") { await tx.raw("SET FOREIGN_KEY_CHECKS = 0"); await tx("directories").del(); await tx.raw("SET FOREIGN_KEY_CHECKS = 1"); }
      else await tx("directories").del();
      await tx("custom_fields").del(); await tx("tabs").del();
      await this.load(tx, doc);
    });
  }
  async appendAll(doc: PeopleDocument) { await this.q.transaction(async (tx) => this.load(tx, doc)); }
}

type Rows = Record<string, unknown>[];
function assemble(row: Record<string, unknown>, c: { facts: Rows; contacts: Rows; links: Rows; notes: Rows; photos: Rows; tags: Rows; custom: Rows }): Person {
  return {
    ...personFromRow(row),
    keyFacts: c.facts.map((r) => s(r.text)),
    contacts: c.contacts.map((r): ContactItem => ({ id: s(r.id), kind: s(r.kind) as ContactItem["kind"], label: s(r.label), value: s(r.value) })),
    links: c.links.map((r): LinkItem => ({ id: s(r.id), label: s(r.label), url: s(r.url) })),
    notes: c.notes.map((r): Note => ({ id: s(r.id), body: s(r.body), createdAt: s(r.created_at), updatedAt: s(r.updated_at) })),
    photos: c.photos.map((r): Photo => ({ id: s(r.id), filename: s(r.filename), createdAt: s(r.created_at) })),
    tags: c.tags.map((r) => s(r.tag)),
    custom: Object.fromEntries(c.custom.map((r) => [s(r.field_id), s(r.value)])),
  };
}
