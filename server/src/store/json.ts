/**
 * The JSON-file data source: the whole PeopleDocument held in memory and
 * written back atomically after every change. Simple, readable, and fine for
 * a few thousand people. The same format is what Export writes and Import
 * reads, so a JSON data source file is always importable as-is.
 */
import fs from "node:fs";
import type { CustomField, DataSourceStatus, Directory, Id, PeopleDocument, Person, PersonSummary, Tab } from "../../../shared/types.js";
import { fold, nameSearchText } from "../../../shared/types.js";
import { now, UserError, writeAtomic } from "../util.js";
import type { DirectoryPlacement, PeopleWhere, PersonPlacement, SearchHit, Store } from "./types.js";

export function emptyDocument(): PeopleDocument {
  return { format: "people-manager", version: 1, exportedAt: now(), tabs: [], directories: [], people: [], customFields: [] };
}

export function summaryOf(p: Person): PersonSummary {
  const photo = p.photos.find((x) => x.id === p.mainPhotoId) || null;
  return { id: p.id, tabId: p.tabId, directoryId: p.directoryId, position: p.position, firstName: p.firstName, lastName: p.lastName,
    nickname: p.nickname, description: p.description, photo: photo ? { id: photo.id, filename: photo.filename } : null };
}

const byPos = <T extends { position: number }>(a: T, b: T) => a.position - b.position;
const clone = <T>(v: T): T => structuredClone(v);

export class JsonStore implements Store {
  readonly type = "json" as const;
  private doc: PeopleDocument = emptyDocument();
  private loadError: string | null = null;

  constructor(readonly file: string) {}

  async open(): Promise<void> {
    this.loadError = null;
    if (!fs.existsSync(this.file)) { this.doc = emptyDocument(); return; }
    try {
      const d = JSON.parse(fs.readFileSync(this.file, "utf8"));
      if (d?.format !== "people-manager") throw new Error("it is not a People Manager file");
      this.doc = { ...emptyDocument(), ...d };
    } catch (e) {
      this.loadError = `The JSON file ${this.file} could not be read: ${(e as Error).message}.`;
      this.doc = emptyDocument();
    }
  }

  private ensureWritable(): void {
    if (this.loadError) throw new UserError(`${this.loadError} Nothing was changed. Fix or move the file, or pick another one in Settings → Data source.`, 409);
  }
  private persist(): void {
    this.ensureWritable();
    this.doc.exportedAt = now();
    writeAtomic(this.file, JSON.stringify(this.doc, null, 1) + "\n");
  }

  async status(): Promise<DataSourceStatus> {
    if (this.loadError) return { type: "json", ok: false, needsBuild: false, message: this.loadError };
    const counts = { tabs: this.doc.tabs.length, directories: this.doc.directories.length, people: this.doc.people.length };
    const exists = fs.existsSync(this.file);
    return { type: "json", ok: true, needsBuild: false, counts,
      message: exists ? `Using ${this.file}` : `Using ${this.file} (it will be created when you add something)` };
  }
  async hasSchema(): Promise<boolean> { return fs.existsSync(this.file); }
  async build(rebuild: boolean): Promise<void> {
    if (fs.existsSync(this.file) && !rebuild) throw new UserError("That JSON file already exists. Rebuilding would empty it — confirm the rebuild to go ahead.", 409);
    this.loadError = null; this.doc = emptyDocument(); this.persist();
  }
  async close(): Promise<void> {}

  // ---------------------------------------------------------------- tabs
  async listTabs(): Promise<Tab[]> { return clone(this.doc.tabs).sort(byPos); }
  async insertTab(t: Tab) { this.doc.tabs.push(clone(t)); this.persist(); }
  async updateTab(id: Id, patch: Partial<Tab>) { const t = this.doc.tabs.find((x) => x.id === id); if (t) Object.assign(t, patch); this.persist(); }
  async deleteTab(id: Id) { this.doc.tabs = this.doc.tabs.filter((x) => x.id !== id); this.persist(); }

  // ---------------------------------------------------------------- directories
  async listDirectories(tabId?: Id): Promise<Directory[]> {
    return clone(this.doc.directories.filter((d) => !tabId || d.tabId === tabId)).sort(byPos);
  }
  async getDirectory(id: Id) { const d = this.doc.directories.find((x) => x.id === id); return d ? clone(d) : null; }
  async insertDirectory(d: Directory) { this.doc.directories.push(clone(d)); this.persist(); }
  async updateDirectory(id: Id, patch: Partial<Directory>) { const d = this.doc.directories.find((x) => x.id === id); if (d) Object.assign(d, patch); this.persist(); }
  async deleteDirectory(id: Id) { this.doc.directories = this.doc.directories.filter((x) => x.id !== id); this.persist(); }
  async placeDirectories(list: DirectoryPlacement[]) {
    for (const u of list) { const d = this.doc.directories.find((x) => x.id === u.id); if (d) Object.assign(d, { tabId: u.tabId, parentId: u.parentId, position: u.position }); }
    this.persist();
  }

  // ---------------------------------------------------------------- people
  private match(where: PeopleWhere) {
    return (p: Person) => (!where.tabId || p.tabId === where.tabId)
      && (where.directoryId === undefined || p.directoryId === where.directoryId)
      && (!where.ids || where.ids.includes(p.id));
  }
  async listPeople(where: PeopleWhere): Promise<PersonSummary[]> {
    return this.doc.people.filter(this.match(where)).sort(byPos).map(summaryOf);
  }
  async countPeople(where: PeopleWhere) { return this.doc.people.filter(this.match(where)).length; }
  async getPerson(id: Id) { const p = this.doc.people.find((x) => x.id === id); return p ? clone(p) : null; }
  async insertPerson(p: Person) { this.doc.people.push(clone(p)); this.persist(); }
  async savePerson(p: Person) {
    const i = this.doc.people.findIndex((x) => x.id === p.id);
    if (i < 0) throw new UserError("That person no longer exists.", 404);
    this.doc.people[i] = clone(p); this.persist();
  }
  async deletePerson(id: Id) { this.doc.people = this.doc.people.filter((x) => x.id !== id); this.persist(); }
  async placePeople(list: PersonPlacement[]) {
    for (const u of list) { const p = this.doc.people.find((x) => x.id === u.id); if (p) Object.assign(p, { tabId: u.tabId, directoryId: u.directoryId, position: u.position }); }
    this.persist();
  }
  async searchPeople(folded: string, limit: number): Promise<SearchHit[]> {
    const out: SearchHit[] = [];
    for (const p of this.doc.people) {
      if (nameSearchText(p).includes(folded) || p.tags.some((t) => fold(t).includes(folded))) out.push({ ...summaryOf(p), tags: [...p.tags] });
      if (out.length >= limit) break;
    }
    return out;
  }

  // ---------------------------------------------------------------- custom fields
  async listFields(): Promise<CustomField[]> { return clone(this.doc.customFields).sort(byPos); }
  async insertField(f: CustomField) { this.doc.customFields.push(clone(f)); this.persist(); }
  async updateField(id: Id, patch: Partial<CustomField>) { const f = this.doc.customFields.find((x) => x.id === id); if (f) Object.assign(f, patch); this.persist(); }
  async deleteField(id: Id) {
    this.doc.customFields = this.doc.customFields.filter((x) => x.id !== id);
    for (const p of this.doc.people) delete p.custom[id];
    this.persist();
  }
  async fieldUsage(fieldId: Id) {
    return this.doc.people.filter((p) => (p.custom[fieldId] ?? "") !== "").map((p) => ({ personId: p.id, value: p.custom[fieldId] }));
  }
  async clearFieldValues(fieldId: Id) {
    let n = 0;
    for (const p of this.doc.people) if (fieldId in p.custom) { if (p.custom[fieldId] !== "") n++; delete p.custom[fieldId]; }
    this.persist();
    return n;
  }

  // ---------------------------------------------------------------- whole document
  async exportAll(): Promise<PeopleDocument> { return { ...clone(this.doc), exportedAt: now() }; }
  async replaceAll(doc: PeopleDocument) { this.loadError = null; this.doc = clone(doc); this.persist(); }
  async appendAll(doc: PeopleDocument) {
    this.doc.tabs.push(...clone(doc.tabs)); this.doc.directories.push(...clone(doc.directories));
    this.doc.people.push(...clone(doc.people)); this.doc.customFields.push(...clone(doc.customFields));
    this.persist();
  }
}
