/**
 * Moving data in and out: validate a JSON file (a report before anything is
 * touched), import it (replace everything, or add alongside what is there),
 * and export the active data source to a JSON file.
 *
 * Photos are never copied into or out of an export — they stay in the photos
 * folder (data/images/<person id>/). Replace keeps person ids, so the folder
 * still matches; "add alongside" gives everything new ids and copies a
 * person's photo folder to the new id when it is there.
 */
import fs from "node:fs";
import path from "node:path";
import type { CustomField, Directory, Id, PeopleDocument, Person, Tab } from "../../shared/types.js";
import { displayName, EMPTY_FIELDS, PERSON_FIELD_KEYS } from "../../shared/types.js";
import type { Service } from "./service.js";
import { newId, now, UserError, writeAtomic } from "./util.js";

export interface ValidationReport {
  ok: boolean;
  file: string;
  counts: { tabs: number; directories: number; people: number; customFields: number; photos: number; notes: number };
  errors: string[];
  warnings: string[];
  /** more messages than listed */
  moreErrors: number;
  moreWarnings: number;
}

const MAX_MESSAGES = 50;
const isStr = (v: unknown): v is string => typeof v === "string";
const str = (v: unknown) => (v == null ? "" : String(v));
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/**
 * Check a parsed document and return a cleaned copy plus a report. Errors are
 * things that would break the data (missing links, duplicate ids, no first
 * name); warnings are things that import but deserve a look (a missing photo
 * file, two people with the same name, a yes/no field holding "maybe").
 */
export function validateDocument(raw: unknown, photosDir: string, file = ""): { report: ValidationReport; doc: PeopleDocument } {
  const errors: string[] = []; const warnings: string[] = [];
  const err = (m: string) => errors.push(m); const warn = (m: string) => warnings.push(m);
  const r = obj(raw);
  if (r.format !== "people-manager") err("This is not a People Manager file (its \"format\" is not \"people-manager\").");
  if (r.version !== undefined && r.version !== 1) err(`This file is version ${String(r.version)}; this app reads version 1.`);

  const ids = new Set<string>();
  const unique = (id: unknown, what: string): string => {
    const s = str(id);
    if (!s) { err(`A ${what} has no id.`); return s; }
    if (ids.has(s)) err(`The id “${s}” is used more than once (${what}).`);
    ids.add(s); return s;
  };

  const tabs: Tab[] = arr(r.tabs).map((t, i) => { const o = obj(t); return { id: unique(o.id, "tab"), name: str(o.name).trim() || `Tab ${i + 1}`, position: Number(o.position) || i }; });
  const tabIds = new Set(tabs.map((t) => t.id));

  const directories: Directory[] = arr(r.directories).map((d, i) => {
    const o = obj(d);
    const dir: Directory = { id: unique(o.id, "directory"), tabId: str(o.tabId), parentId: o.parentId ? str(o.parentId) : null, name: str(o.name).trim(), description: str(o.description), position: Number(o.position) || i };
    if (!dir.name) err(`Directory ${dir.id} has no name.`);
    if (!tabIds.has(dir.tabId)) err(`Directory “${dir.name}” points to a tab that is not in the file.`);
    return dir;
  });
  const dirById = new Map(directories.map((d) => [d.id, d]));
  for (const d of directories) {
    if (!d.parentId) continue;
    const parent = dirById.get(d.parentId);
    if (!parent) err(`Directory “${d.name}” is inside a directory that is not in the file.`);
    else if (parent.tabId !== d.tabId) err(`Directory “${d.name}” is in a different tab from its parent “${parent.name}”.`);
    const seen = new Set<string>(); let cur: Directory | undefined = d;
    while (cur?.parentId) { if (seen.has(cur.id)) { err(`Directory “${d.name}” is inside itself (a loop).`); break; } seen.add(cur.id); cur = dirById.get(cur.parentId); }
  }

  const customFields: CustomField[] = arr(r.customFields).map((f, i) => {
    const o = obj(f); const type = ["boolean", "text", "paragraph"].includes(str(o.type)) ? (str(o.type) as CustomField["type"]) : "text";
    if (!["boolean", "text", "paragraph"].includes(str(o.type))) warn(`Custom field “${str(o.name)}” has an unknown type “${str(o.type)}”; it will be a one-line text field.`);
    return { id: unique(o.id, "custom field"), name: str(o.name).trim() || `Field ${i + 1}`, type, position: Number(o.position) || i, archived: !!o.archived };
  });
  const fieldById = new Map(customFields.map((f) => [f.id, f]));

  let photoCount = 0; let noteCount = 0;
  const names = new Map<string, { label: string; n: number }>();
  const people: Person[] = arr(r.people).map((p, i) => {
    const o = obj(p);
    const person = { ...EMPTY_FIELDS } as Person;
    for (const k of PERSON_FIELD_KEYS) (person as unknown as Record<string, string>)[k] = str(o[k]);
    Object.assign(person, {
      id: unique(o.id, "person"), tabId: str(o.tabId), directoryId: o.directoryId ? str(o.directoryId) : null, position: Number(o.position) || i,
      keyFacts: arr(o.keyFacts).filter(isStr),
      contacts: arr(o.contacts).map((c) => { const x = obj(c); const kind = ["phone", "email", "address"].includes(str(x.kind)) ? str(x.kind) : "phone"; return { id: str(x.id) || newId(), kind, label: str(x.label), value: str(x.value) }; }).filter((c) => c.value),
      links: arr(o.links).map((l) => { const x = obj(l); return { id: str(x.id) || newId(), label: str(x.label), url: str(x.url) }; }).filter((l) => l.url),
      notes: arr(o.notes).map((n) => { const x = obj(n); return { id: str(x.id) || newId(), body: str(x.body), createdAt: str(x.createdAt) || now(), updatedAt: str(x.updatedAt) || str(x.createdAt) || now() }; }).filter((n) => n.body),
      photos: arr(o.photos).map((ph) => { const x = obj(ph); return { id: str(x.id) || newId(), filename: str(x.filename), createdAt: str(x.createdAt) || now() }; }).filter((ph) => ph.filename),
      mainPhotoId: o.mainPhotoId ? str(o.mainPhotoId) : null,
      tags: [...new Set(arr(o.tags).filter(isStr).map((t) => t.trim().toLowerCase()).filter(Boolean))],
      custom: {} as Record<string, string>,
      createdAt: str(o.createdAt) || now(), updatedAt: str(o.updatedAt) || now(),
    });
    const who = person.firstName ? displayName(person) : `Person ${person.id}`;
    if (!person.firstName.trim()) err(`${who} has no first name.`);
    if (!tabIds.has(person.tabId)) err(`${who} points to a tab that is not in the file.`);
    if (person.directoryId) {
      const d = dirById.get(person.directoryId);
      if (!d) err(`${who} is in a directory that is not in the file.`);
      else if (d.tabId !== person.tabId) err(`${who} is in directory “${d.name}”, which belongs to another tab.`);
    }
    if (person.birthday && !/^(\d{4}-)?\d{2}-\d{2}$/.test(person.birthday)) { warn(`${who}: birthday “${person.birthday}” is not a date; it will be left empty.`); person.birthday = ""; }
    if (person.dateMet && !/^\d{4}-\d{2}-\d{2}$/.test(person.dateMet)) { warn(`${who}: date met “${person.dateMet}” is not a date; it will be left empty.`); person.dateMet = ""; }
    for (const [fid, v] of Object.entries(obj(o.custom))) {
      const f = fieldById.get(fid);
      if (!f) { warn(`${who} has a value for a custom field that is not in the file; it will be dropped.`); continue; }
      let val = str(v).trim();
      if (f.type === "boolean" && val && !["true", "false"].includes(val)) { warn(`${who}: “${f.name}” is a yes/no field but holds “${val}”; it will be left empty.`); val = ""; }
      if (val) person.custom[fid] = val;
    }
    for (const ph of person.photos) {
      photoCount++;
      if (!fs.existsSync(path.join(photosDir, person.id, ph.filename))) warn(`${who}: photo “${ph.filename}” is not in ${path.join(photosDir, person.id)}. The person imports without it showing until the file is copied there.`);
    }
    if (person.mainPhotoId && !person.photos.some((ph) => ph.id === person.mainPhotoId)) person.mainPhotoId = person.photos[0]?.id ?? null;
    if (!person.mainPhotoId && person.photos.length) person.mainPhotoId = person.photos[0].id;
    noteCount += person.notes.length;
    const label = displayName(person); const key = label.toLowerCase();
    names.set(key, { label, n: (names.get(key)?.n || 0) + 1 });
    return person;
  });
  for (const { label, n } of names.values()) if (n > 1 && label) warn(`${n} people are named “${label}” — that is allowed; check they really are different people.`);

  const report: ValidationReport = {
    ok: errors.length === 0, file,
    counts: { tabs: tabs.length, directories: directories.length, people: people.length, customFields: customFields.length, photos: photoCount, notes: noteCount },
    errors: errors.slice(0, MAX_MESSAGES), warnings: warnings.slice(0, MAX_MESSAGES),
    moreErrors: Math.max(0, errors.length - MAX_MESSAGES), moreWarnings: Math.max(0, warnings.length - MAX_MESSAGES),
  };
  return { report, doc: { format: "people-manager", version: 1, exportedAt: str(r.exportedAt) || now(), tabs, directories, people, customFields } };
}

export function readJsonFile(file: string): unknown {
  if (!fs.existsSync(file)) throw new UserError(`There is no file at ${file}.`, 404);
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (e) { throw new UserError(`${file} is not valid JSON: ${(e as Error).message}`); }
}

/** Give every record a fresh id (for "add alongside"), keeping all links between them intact. */
function remap(doc: PeopleDocument, existing: { tabs: Tab[]; fields: CustomField[] }, photosDir: string): PeopleDocument {
  const m = new Map<Id, Id>(); const id = (old: Id | null) => (old ? (m.get(old) ?? (m.set(old, newId()), m.get(old)!)) : null);
  const tabNames = new Set(existing.tabs.map((t) => t.name.toLowerCase()));
  const tabs = doc.tabs.map((t, i) => {
    let name = t.name; if (tabNames.has(name.toLowerCase())) name = `${t.name} (imported)`;
    let n = 2; while (tabNames.has(name.toLowerCase())) name = `${t.name} (imported ${n++})`;
    tabNames.add(name.toLowerCase());
    return { ...t, id: id(t.id)!, name, position: existing.tabs.length + i };
  });
  // a custom field with the same name and type is the same field
  const fields: CustomField[] = [];
  for (const f of doc.customFields) {
    const same = existing.fields.find((x) => x.name.toLowerCase() === f.name.toLowerCase() && x.type === f.type);
    if (same) m.set(f.id, same.id); else fields.push({ ...f, id: id(f.id)!, position: existing.fields.length + fields.length });
  }
  const directories = doc.directories.map((d) => ({ ...d, id: id(d.id)!, tabId: id(d.tabId)!, parentId: id(d.parentId) }));
  const people = doc.people.map((p) => {
    const newPid = id(p.id)!;
    const photoMap = new Map(p.photos.map((ph) => [ph.id, newId()]));
    const from = path.join(photosDir, p.id);
    if (p.photos.length && fs.existsSync(from)) fs.cpSync(from, path.join(photosDir, newPid), { recursive: true });
    return {
      ...p, id: newPid, tabId: id(p.tabId)!, directoryId: id(p.directoryId),
      contacts: p.contacts.map((c) => ({ ...c, id: newId() })), links: p.links.map((l) => ({ ...l, id: newId() })),
      notes: p.notes.map((n) => ({ ...n, id: newId() })), photos: p.photos.map((ph) => ({ ...ph, id: photoMap.get(ph.id)! })),
      mainPhotoId: p.mainPhotoId ? photoMap.get(p.mainPhotoId) ?? null : null,
      custom: Object.fromEntries(Object.entries(p.custom).map(([k, v]) => [m.get(k) ?? k, v])),
    };
  });
  return { ...doc, tabs, directories, people, customFields: fields };
}

export async function importFile(svc: Service, file: string, mode: "replace" | "add") {
  const { report, doc } = validateDocument(readJsonFile(file), svc.photosDir(), file);
  if (!report.ok) throw new UserError(`The file has ${report.errors.length + report.moreErrors} problem(s) to fix before it can be imported. Run Validate data to see them.`, 422, report);
  const st = await svc.store.status();
  if (!st.ok) throw new UserError(`The data source is not ready: ${st.message}`, 409);
  if (mode === "replace") await svc.store.replaceAll(doc);
  else await svc.store.appendAll(remap(doc, { tabs: await svc.store.listTabs(), fields: await svc.store.listFields() }, svc.photosDir()));
  return { mode, counts: report.counts, warnings: report.warnings.length + report.moreWarnings };
}

export async function exportTo(svc: Service, file: string) {
  const st = await svc.store.status();
  if (!st.ok) throw new UserError(`The data source is not ready: ${st.message}`, 409);
  const doc = await svc.store.exportAll();
  if (path.resolve(file) === path.resolve(svc.config.resolve(svc.config.get().dataSource.json.path)) && svc.store.type === "json")
    throw new UserError("That is the JSON file you are using right now. Pick a different file name for the export.");
  writeAtomic(file, JSON.stringify(doc, null, 1) + "\n");
  return { file, counts: { tabs: doc.tabs.length, directories: doc.directories.length, people: doc.people.length, customFields: doc.customFields.length } };
}
