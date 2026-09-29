/**
 * The rules of the app, written once over whichever data source is active:
 * where things go and in what order, what may be deleted, how moves work,
 * how search matches, notes, photos and custom fields. Routes call these;
 * stores only read and write.
 */
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type {
  CustomField, CustomFieldType, Directory, Id, Person, PersonFields, PersonSummary, SearchResult, Tab,
} from "../../shared/types.js";
import { displayName, EMPTY_FIELDS, fold, nameSearchText, PERSON_FIELD_KEYS } from "../../shared/types.js";
import type { Config } from "./config.js";
import { createStore, type Store } from "./store/index.js";
import { listSome, newId, now, UserError } from "./util.js";

// ---------------------------------------------------------------- input validation
const str = (max: number) => z.string().max(max, `Keep it under ${max} characters.`).transform((v) => v.trim());
const dateOrEmpty = z.string().trim().refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "Use a full date.");
const birthday = z.string().trim().refine((v) => v === "" || /^(\d{4}-)?\d{2}-\d{2}$/.test(v), "Use a date, or month and day.");

export const personInput = z.object({
  firstName: str(200).refine((v) => v.length > 0, "A person needs at least a first name."),
  lastName: str(200).default(""), nickname: str(200).default(""), description: str(500).default(""),
  title: str(200).default(""), profession: str(200).default(""), businessCategory: str(200).default(""),
  ageRange: str(40).default(""), maritalStatus: str(40).default(""), kids: str(200).default(""), pets: str(200).default(""),
  familyNotes: str(5000).default(""), birthday: birthday.default(""), dateMet: dateOrEmpty.default(""), fromPlace: str(200).default(""),
  howMet: str(10000).default(""), generalDescription: str(10000).default(""), businessWebsite: str(500).default(""), businessDescription: str(5000).default(""),
  keyFacts: z.array(str(500)).max(50).default([]),
  contacts: z.array(z.object({ id: z.string().optional(), kind: z.enum(["phone", "email", "address"]), label: str(100).default(""), value: str(1000) })).max(100).default([]),
  links: z.array(z.object({ id: z.string().optional(), label: str(200).default(""), url: str(2000) })).max(100).default([]),
  tags: z.array(str(100)).max(100).default([]),
  custom: z.record(z.string(), z.string().max(10000)).default({}),
});
export type PersonInput = z.input<typeof personInput>;

function parse<T extends z.ZodType>(schema: T, v: unknown): z.output<T> {
  const r = schema.safeParse(v);
  if (!r.success) { const i = r.error.issues[0]; throw new UserError(i ? `${i.path.join(".") ? i.path.join(".") + ": " : ""}${i.message}` : "That input is not valid."); }
  return r.data;
}

const tagClean = (tags: string[]) => [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))];

/** New order for a sibling list after moving `id` to `index` (clamped). */
export function reorder<T extends { id: Id }>(siblings: T[], moving: T, index: number): T[] {
  const rest = siblings.filter((s) => s.id !== moving.id);
  const i = Math.max(0, Math.min(Number.isFinite(index) ? index : rest.length, rest.length));
  return [...rest.slice(0, i), moving, ...rest.slice(i)];
}

const PHOTO_TYPES: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif" };

export class Service {
  store!: Store;

  constructor(readonly config: Config) {}

  /** (Re)open the data source the config names. */
  async useConfiguredSource(): Promise<void> {
    const old = this.store;
    this.store = createStore(this.config.get().dataSource, (p) => this.config.resolve(p));
    await this.store.open();
    if (old) await old.close().catch(() => {});
  }

  photosDir(): string { return this.config.resolve(this.config.get().photos.dir); }

  // ---------------------------------------------------------------- helpers
  private async tabOrThrow(id: Id): Promise<Tab> {
    const t = (await this.store.listTabs()).find((x) => x.id === id);
    if (!t) throw new UserError("That tab no longer exists.", 404);
    return t;
  }
  private async dirOrThrow(id: Id): Promise<Directory> {
    const d = await this.store.getDirectory(id);
    if (!d) throw new UserError("That directory no longer exists.", 404);
    return d;
  }
  private async personOrThrow(id: Id): Promise<Person> {
    const p = await this.store.getPerson(id);
    if (!p) throw new UserError("That person no longer exists.", 404);
    return p;
  }

  /** "Clients › Active clients › Healthcare" for a place in the tree. */
  async pathTo(tabId: Id, directoryId: Id | null, cache?: { tabs: Tab[]; dirs: Directory[] }): Promise<string> {
    const tabs = cache?.tabs ?? await this.store.listTabs();
    const dirs = cache?.dirs ?? await this.store.listDirectories();
    const parts: string[] = [];
    let cur = directoryId ? dirs.find((d) => d.id === directoryId) : undefined;
    for (let guard = 0; cur && guard < 200; guard++) { parts.unshift(cur.name); cur = cur.parentId ? dirs.find((d) => d.id === cur!.parentId) : undefined; }
    parts.unshift(tabs.find((t) => t.id === tabId)?.name ?? "?");
    return parts.join(" › ");
  }

  /** Ids of a directory and everything nested under it. */
  private subtree(dirs: Directory[], rootId: Id): Id[] {
    const out = [rootId];
    for (let i = 0; i < out.length; i++) for (const d of dirs) if (d.parentId === out[i]) out.push(d.id);
    return out;
  }

  /** "It still holds 2 directories and 5 people: A, B, C, D, E, …and 2 more." */
  private async contentsMessage(name: string, childDirs: Directory[], people: PersonSummary[], nestedDirs: number, nestedPeople: number): Promise<string> {
    const names = [...childDirs.map((d) => `${d.name} (directory)`), ...people.map((p) => displayName(p))];
    const parts = [nestedDirs ? `${nestedDirs} director${nestedDirs === 1 ? "y" : "ies"}` : "", nestedPeople ? `${nestedPeople} ${nestedPeople === 1 ? "person" : "people"}` : ""].filter(Boolean).join(" and ");
    return `“${name}” is not empty — it still holds ${parts}: ${listSome(names)}. Move or delete them first.`;
  }

  // ---------------------------------------------------------------- tabs
  async listTabs() { return this.store.listTabs(); }

  async createTab(name: string): Promise<Tab> {
    const n = parse(str(200), name ?? "");
    if (!n) throw new UserError("Give the tab a name.");
    const tabs = await this.store.listTabs();
    const t: Tab = { id: newId(), name: n, position: tabs.length };
    await this.store.insertTab(t);
    return t;
  }
  async renameTab(id: Id, name: string): Promise<Tab> {
    const t = await this.tabOrThrow(id);
    const n = parse(str(200), name ?? "");
    if (!n) throw new UserError("A tab needs a name.");
    await this.store.updateTab(id, { name: n });
    return { ...t, name: n };
  }
  async deleteTab(id: Id): Promise<void> {
    const t = await this.tabOrThrow(id);
    const dirs = await this.store.listDirectories(id);
    const peopleCount = await this.store.countPeople({ tabId: id });
    if (dirs.length || peopleCount) {
      const top = await this.store.listPeople({ tabId: id, directoryId: null });
      throw new UserError(await this.contentsMessage(t.name, dirs.filter((d) => !d.parentId), top, dirs.length, peopleCount), 409);
    }
    await this.store.deleteTab(id);
    const rest = await this.store.listTabs();
    for (const [i, x] of rest.entries()) if (x.position !== i) await this.store.updateTab(x.id, { position: i });
  }
  async reorderTabs(ids: Id[]): Promise<Tab[]> {
    const tabs = await this.store.listTabs();
    if (ids.length !== tabs.length || !tabs.every((t) => ids.includes(t.id))) throw new UserError("The tab list changed — reload and try again.", 409);
    for (const [i, id] of ids.entries()) await this.store.updateTab(id, { position: i });
    return this.store.listTabs();
  }

  // ---------------------------------------------------------------- directories
  /** A tab's directories, each with how many people sit directly in it; plus the top level's count. */
  async listDirectories(tabId: Id) {
    await this.tabOrThrow(tabId);
    const [dirs, counts] = await Promise.all([this.store.listDirectories(tabId), this.store.peopleCounts(tabId)]);
    return { directories: dirs.map((d) => ({ ...d, peopleCount: counts[d.id] || 0 })), topLevelPeople: counts[""] || 0 };
  }

  async createDirectory(input: { tabId: Id; parentId?: Id | null; name: string; description?: string }): Promise<Directory> {
    await this.tabOrThrow(input.tabId);
    const parentId = input.parentId || null;
    if (parentId) { const p = await this.dirOrThrow(parentId); if (p.tabId !== input.tabId) throw new UserError("That parent directory is in another tab."); }
    const name = parse(str(200), input.name ?? "");
    if (!name) throw new UserError("Give the directory a name.");
    const siblings = (await this.store.listDirectories(input.tabId)).filter((d) => d.parentId === parentId);
    const d: Directory = { id: newId(), tabId: input.tabId, parentId, name, description: parse(str(500), input.description ?? ""), position: siblings.length };
    await this.store.insertDirectory(d);
    return d;
  }
  async updateDirectory(id: Id, patch: { name?: string; description?: string }): Promise<Directory> {
    const d = await this.dirOrThrow(id);
    const next: Partial<Directory> = {};
    if (patch.name !== undefined) { next.name = parse(str(200), patch.name); if (!next.name) throw new UserError("A directory needs a name."); }
    if (patch.description !== undefined) next.description = parse(str(500), patch.description);
    await this.store.updateDirectory(id, next);
    return { ...d, ...next };
  }
  async deleteDirectory(id: Id): Promise<void> {
    const d = await this.dirOrThrow(id);
    const all = await this.store.listDirectories(d.tabId);
    const nested = this.subtree(all, id).slice(1);
    let nestedPeople = 0;
    for (const dirId of [id, ...nested]) nestedPeople += await this.store.countPeople({ directoryId: dirId });
    if (nested.length || nestedPeople) {
      const direct = await this.store.listPeople({ directoryId: id });
      throw new UserError(await this.contentsMessage(d.name, all.filter((x) => x.parentId === id), direct, nested.length, nestedPeople), 409);
    }
    await this.store.deleteDirectory(id);
    const siblings = all.filter((x) => x.parentId === d.parentId && x.id !== id);
    await this.store.placeDirectories(siblings.map((s, i) => ({ id: s.id, tabId: s.tabId, parentId: s.parentId, position: i })));
  }

  /** Move a directory (and everything inside it) to another parent, tab or position. */
  async moveDirectory(id: Id, to: { tabId: Id; parentId: Id | null; index?: number }): Promise<void> {
    const d = await this.dirOrThrow(id);
    await this.tabOrThrow(to.tabId);
    const parentId = to.parentId || null;
    const all = await this.store.listDirectories();
    const inside = this.subtree(all, id);
    if (parentId) {
      const parent = all.find((x) => x.id === parentId);
      if (!parent) throw new UserError("That directory no longer exists.", 404);
      if (parent.tabId !== to.tabId) throw new UserError("That directory is in another tab.");
      if (inside.includes(parentId)) throw new UserError("A directory can't be moved inside itself.");
    }
    const target = all.filter((x) => x.tabId === to.tabId && x.parentId === parentId);
    const order = reorder(target, d, to.index ?? target.length);
    const placements = order.map((x, i) => ({ id: x.id, tabId: to.tabId, parentId: x.id === id ? parentId : x.parentId, position: i }));
    // close the gap it left behind
    if (d.parentId !== parentId || d.tabId !== to.tabId) {
      const old = all.filter((x) => x.tabId === d.tabId && x.parentId === d.parentId && x.id !== id);
      placements.push(...old.map((x, i) => ({ id: x.id, tabId: x.tabId, parentId: x.parentId, position: i })));
    }
    // a move to another tab carries every nested directory and person along
    if (d.tabId !== to.tabId) {
      for (const sub of all.filter((x) => inside.includes(x.id) && x.id !== id)) placements.push({ id: sub.id, tabId: to.tabId, parentId: sub.parentId, position: sub.position });
      const people = await this.store.listPeople({ tabId: d.tabId });
      await this.store.placePeople(people.filter((p) => p.directoryId && inside.includes(p.directoryId)).map((p) => ({ id: p.id, tabId: to.tabId, directoryId: p.directoryId, position: p.position })));
    }
    await this.store.placeDirectories(placements);
  }

  // ---------------------------------------------------------------- people
  async listPeople(tabId: Id, directoryId: Id | null) { return this.store.listPeople({ tabId, directoryId }); }

  async getPerson(id: Id): Promise<Person & { path: string }> {
    const p = await this.personOrThrow(id);
    return { ...p, path: await this.pathTo(p.tabId, p.directoryId) };
  }

  private async cleanCustom(custom: Record<string, string>): Promise<Record<string, string>> {
    const fields = await this.store.listFields();
    const out: Record<string, string> = {};
    for (const [id, raw] of Object.entries(custom)) {
      const f = fields.find((x) => x.id === id); if (!f) continue;
      let v = raw.trim();
      if (f.type === "boolean") { v = /^(true|yes|1)$/i.test(v) ? "true" : /^(false|no|0)$/i.test(v) ? "false" : ""; }
      if (f.type === "text") v = v.replace(/\s*\n\s*/g, " ");
      if (v !== "") out[id] = v;
    }
    return out;
  }

  private async fromInput(input: unknown, base: Person): Promise<Person> {
    const v = parse(personInput, input);
    const fields = {} as PersonFields;
    for (const k of PERSON_FIELD_KEYS) fields[k] = (v[k] as string) ?? "";
    return {
      ...base, ...fields,
      keyFacts: v.keyFacts.filter(Boolean),
      contacts: v.contacts.filter((c) => c.value).map((c) => ({ id: c.id || newId(), kind: c.kind, label: c.label, value: c.value })),
      links: v.links.filter((l) => l.url).map((l) => ({ id: l.id || newId(), label: l.label, url: l.url })),
      tags: tagClean(v.tags),
      custom: await this.cleanCustom(v.custom),
      updatedAt: now(),
    };
  }

  async createPerson(input: unknown & { tabId?: Id; directoryId?: Id | null }): Promise<Person & { path: string }> {
    const tabId = (input as { tabId?: Id }).tabId;
    const directoryId = (input as { directoryId?: Id | null }).directoryId || null;
    if (!tabId) throw new UserError("Choose a tab for the new person.");
    await this.tabOrThrow(tabId);
    if (directoryId) { const d = await this.dirOrThrow(directoryId); if (d.tabId !== tabId) throw new UserError("That directory is in another tab."); }
    const t = now();
    const base: Person = { ...EMPTY_FIELDS, id: newId(), tabId, directoryId, position: await this.store.countPeople({ tabId, directoryId }),
      keyFacts: [], contacts: [], links: [], notes: [], photos: [], mainPhotoId: null, tags: [], custom: {}, createdAt: t, updatedAt: t };
    const p = await this.fromInput(input, base);
    await this.store.insertPerson(p);
    return this.getPerson(p.id);
  }

  /** Save the edit form: everything except placement, notes and photos (they have their own actions). */
  async updatePerson(id: Id, input: unknown): Promise<Person & { path: string }> {
    const cur = await this.personOrThrow(id);
    const next = await this.fromInput(input, cur);
    await this.store.savePerson({ ...next, id: cur.id, tabId: cur.tabId, directoryId: cur.directoryId, position: cur.position, notes: cur.notes, photos: cur.photos, mainPhotoId: cur.mainPhotoId, createdAt: cur.createdAt });
    return this.getPerson(id);
  }

  async deletePerson(id: Id): Promise<void> {
    const p = await this.personOrThrow(id);
    await this.store.deletePerson(id);
    fs.rmSync(path.join(this.photosDir(), id), { recursive: true, force: true });
    const rest = await this.store.listPeople({ tabId: p.tabId, directoryId: p.directoryId });
    await this.store.placePeople(rest.map((x, i) => ({ id: x.id, tabId: x.tabId, directoryId: x.directoryId, position: i })));
  }

  async movePerson(id: Id, to: { tabId: Id; directoryId: Id | null; index?: number }): Promise<void> {
    const p = await this.personOrThrow(id);
    await this.tabOrThrow(to.tabId);
    const directoryId = to.directoryId || null;
    if (directoryId) { const d = await this.dirOrThrow(directoryId); if (d.tabId !== to.tabId) throw new UserError("That directory is in another tab."); }
    const target = await this.store.listPeople({ tabId: to.tabId, directoryId });
    const summary = { id } as PersonSummary;
    const order = reorder(target, summary, to.index ?? target.length);
    const placements = order.map((x, i) => ({ id: x.id, tabId: to.tabId, directoryId, position: i }));
    if (p.tabId !== to.tabId || p.directoryId !== directoryId) {
      const old = (await this.store.listPeople({ tabId: p.tabId, directoryId: p.directoryId })).filter((x) => x.id !== id);
      placements.push(...old.map((x, i) => ({ id: x.id, tabId: x.tabId, directoryId: x.directoryId, position: i })));
    }
    await this.store.placePeople(placements);
  }

  // ---------------------------------------------------------------- notes
  async addNote(personId: Id, body: string) {
    const p = await this.personOrThrow(personId);
    const b = parse(str(20000), body ?? "");
    if (!b) throw new UserError("The note is empty.");
    const t = now();
    const note = { id: newId(), body: b, createdAt: t, updatedAt: t };
    await this.store.savePerson({ ...p, notes: [note, ...p.notes], updatedAt: t });
    return note;
  }
  async editNote(personId: Id, noteId: Id, body: string) {
    const p = await this.personOrThrow(personId);
    const b = parse(str(20000), body ?? "");
    if (!b) throw new UserError("A note can't be empty — delete it instead.");
    const n = p.notes.find((x) => x.id === noteId);
    if (!n) throw new UserError("That note no longer exists.", 404);
    Object.assign(n, { body: b, updatedAt: now() });
    await this.store.savePerson(p);
    return n;
  }
  async deleteNote(personId: Id, noteId: Id) {
    const p = await this.personOrThrow(personId);
    if (!p.notes.some((x) => x.id === noteId)) throw new UserError("That note no longer exists.", 404);
    await this.store.savePerson({ ...p, notes: p.notes.filter((x) => x.id !== noteId) });
  }

  // ---------------------------------------------------------------- photos
  /** Keep the original file name, spaces → underscores; add _1, _2 on a clash. */
  static photoName(original: string, mime: string, taken: string[]): string {
    const ext = PHOTO_TYPES[mime] || path.extname(original).toLowerCase() || ".jpg";
    let base = path.basename(original || "photo", path.extname(original || "")).replace(/\s+/g, "_").replace(/[\/\\:\0]/g, "_").replace(/^\.+/, "") || "photo";
    base = base.slice(0, 120);
    let name = base + ext; let i = 1;
    while (taken.includes(name)) name = `${base}_${i++}${ext}`;
    return name;
  }

  async addPhoto(personId: Id, file: { buffer: Buffer; originalname: string; mimetype: string }) {
    const p = await this.personOrThrow(personId);
    const max = this.config.get().photos.maxPerPerson;
    if (p.photos.length >= max) throw new UserError(`${displayName(p)} already has ${max} photos, the most allowed (Settings → General). Delete one first.`, 409);
    if (!PHOTO_TYPES[file.mimetype]) throw new UserError("That is not a JPEG, PNG, WebP or GIF image.");
    const dir = path.join(this.photosDir(), personId);
    fs.mkdirSync(dir, { recursive: true });
    const taken = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
    const filename = Service.photoName(file.originalname, file.mimetype, taken);
    fs.writeFileSync(path.join(dir, filename), file.buffer);
    const photo = { id: newId(), filename, createdAt: now() };
    await this.store.savePerson({ ...p, photos: [...p.photos, photo], mainPhotoId: p.mainPhotoId || photo.id });
    return this.getPerson(personId);
  }
  async deletePhoto(personId: Id, photoId: Id) {
    const p = await this.personOrThrow(personId);
    const ph = p.photos.find((x) => x.id === photoId);
    if (!ph) throw new UserError("That photo no longer exists.", 404);
    fs.rmSync(path.join(this.photosDir(), personId, ph.filename), { force: true });
    const photos = p.photos.filter((x) => x.id !== photoId);
    await this.store.savePerson({ ...p, photos, mainPhotoId: p.mainPhotoId === photoId ? (photos[0]?.id ?? null) : p.mainPhotoId });
    return this.getPerson(personId);
  }
  async setMainPhoto(personId: Id, photoId: Id) {
    const p = await this.personOrThrow(personId);
    if (!p.photos.some((x) => x.id === photoId)) throw new UserError("That photo no longer exists.", 404);
    await this.store.savePerson({ ...p, mainPhotoId: photoId });
    return this.getPerson(personId);
  }
  /** Absolute path of a photo file, or null if the name is unsafe or missing. */
  photoFile(personId: string, filename: string): string | null {
    if (!/^[a-z0-9]{6,32}$/i.test(personId) || filename.includes("/") || filename.includes("\\") || filename.startsWith(".")) return null;
    const f = path.join(this.photosDir(), personId, filename);
    return fs.existsSync(f) ? f : null;
  }

  // ---------------------------------------------------------------- search
  /** Names, nicknames and tags; case- and accent-insensitive; anywhere in the word. */
  async search(q: string, limit = 100): Promise<SearchResult[]> {
    const folded = fold(String(q || "").trim()).replace(/\s+/g, " ");
    if (!folded) return [];
    const hits = await this.store.searchPeople(folded, limit);
    const cache = { tabs: await this.store.listTabs(), dirs: await this.store.listDirectories() };
    const out: SearchResult[] = [];
    for (const h of hits) {
      const byName = nameSearchText(h).includes(folded);
      const tag = byName ? null : h.tags.find((t) => fold(t).includes(folded)) ?? null;
      if (!byName && !tag) continue; // a phrase that only spans name + tag text
      const { tags: _t, ...summary } = h;
      out.push({ ...summary, path: await this.pathTo(h.tabId, h.directoryId, cache), matchedTag: tag });
    }
    // names that start with the query first, then the rest, alphabetically
    const starts = (r: SearchResult) => (nameSearchText(r).split(" ").some((w) => w.startsWith(folded)) ? 0 : 1);
    return out.sort((a, b) => starts(a) - starts(b) || displayName(a).localeCompare(displayName(b)));
  }

  // ---------------------------------------------------------------- custom fields
  async listFields() { return this.store.listFields(); }

  async createField(input: { name: string; type: CustomFieldType }): Promise<CustomField> {
    const name = parse(str(200), input.name ?? "");
    if (!name) throw new UserError("Give the field a name.");
    const type = parse(z.enum(["boolean", "text", "paragraph"]), input.type);
    const fields = await this.store.listFields();
    if (fields.some((f) => f.name.toLowerCase() === name.toLowerCase())) throw new UserError(`There is already a field called “${name}”.`, 409);
    const f: CustomField = { id: newId(), name, type, position: fields.length, archived: false };
    await this.store.insertField(f);
    return f;
  }

  async updateField(id: Id, patch: { name?: string; type?: CustomFieldType; archived?: boolean }): Promise<CustomField> {
    const fields = await this.store.listFields();
    const f = fields.find((x) => x.id === id);
    if (!f) throw new UserError("That field no longer exists.", 404);
    const next: Partial<CustomField> = {};
    if (patch.name !== undefined) {
      next.name = parse(str(200), patch.name);
      if (!next.name) throw new UserError("A field needs a name.");
      if (fields.some((x) => x.id !== id && x.name.toLowerCase() === next.name!.toLowerCase())) throw new UserError(`There is already a field called “${next.name}”.`, 409);
    }
    if (patch.type !== undefined && patch.type !== f.type) {
      const type = parse(z.enum(["boolean", "text", "paragraph"]), patch.type);
      const textual = (t: CustomFieldType) => t === "text" || t === "paragraph";
      if (!(textual(type) && textual(f.type))) {
        const used = (await this.store.fieldUsage(id)).length;
        if (used) throw new UserError(`“${f.name}” holds values for ${used} ${used === 1 ? "person" : "people"}. A yes/no field can only change type while it is empty — clear its values first.`, 409);
      }
      next.type = type;
    }
    if (patch.archived !== undefined) next.archived = !!patch.archived;
    await this.store.updateField(id, next);
    return { ...f, ...next };
  }

  async reorderFields(ids: Id[]) {
    const fields = await this.store.listFields();
    if (ids.length !== fields.length || !fields.every((f) => ids.includes(f.id))) throw new UserError("The field list changed — reload and try again.", 409);
    for (const [i, id] of ids.entries()) await this.store.updateField(id, { position: i });
    return this.store.listFields();
  }

  /** Who has a value in this field — for the "clear them one by one" list. */
  async fieldUsage(id: Id) {
    const usage = await this.store.fieldUsage(id);
    const people = await this.store.listPeople({ ids: usage.map((u) => u.personId) });
    const cache = { tabs: await this.store.listTabs(), dirs: await this.store.listDirectories() };
    return Promise.all(people.map(async (p) => ({ ...p, value: usage.find((u) => u.personId === p.id)?.value ?? "", path: await this.pathTo(p.tabId, p.directoryId, cache) })));
  }

  /** Delete a field. In use → refused unless `purge`, which deletes its values from everyone first. */
  async deleteField(id: Id, purge: boolean): Promise<{ cleared: number }> {
    const f = (await this.store.listFields()).find((x) => x.id === id);
    if (!f) throw new UserError("That field no longer exists.", 404);
    const used = (await this.store.fieldUsage(id)).length;
    if (used && !purge) throw new UserError(`“${f.name}” still holds values for ${used} ${used === 1 ? "person" : "people"}. Clear them, archive the field, or delete it together with its values.`, 409, { used });
    const cleared = await this.store.clearFieldValues(id);
    await this.store.deleteField(id);
    const rest = await this.store.listFields();
    for (const [i, x] of rest.entries()) if (x.position !== i) await this.store.updateField(x.id, { position: i });
    return { cleared };
  }
}
