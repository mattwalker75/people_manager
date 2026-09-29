/**
 * The storage contract, run against every data source: JSON, SQLite, and
 * MySQL/MariaDB when PM_TEST_MYSQL points at a throwaway database.
 */
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Person, PeopleDocument } from "../shared/types.js";
import { EMPTY_FIELDS } from "../shared/types.js";
import { JsonStore } from "../server/src/store/json.js";
import { SqlStore } from "../server/src/store/sql.js";
import type { Store } from "../server/src/store/types.js";
import { mysqlSettings, scratchDir } from "./helpers.js";

const dir = scratchDir("pm-store");
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

const makers: [string, () => Store][] = [
  ["json", () => new JsonStore(path.join(dir, "people.json"))],
  ["sqlite", () => SqlStore.sqlite(path.join(dir, "people.db"))],
];
const my = mysqlSettings();
if (my) makers.push(["mysql", () => SqlStore.mysql(my)]);

function person(over: Partial<Person>): Person {
  const t = "2026-09-29T10:00:00.000Z";
  return { ...EMPTY_FIELDS, id: "p1", tabId: "t1", directoryId: null, position: 0, keyFacts: [], contacts: [], links: [], notes: [], photos: [],
    mainPhotoId: null, tags: [], custom: {}, createdAt: t, updatedAt: t, firstName: "X", ...over };
}

describe.each(makers)("%s store", (_name, make) => {
  let s: Store;
  beforeAll(async () => {
    s = make(); await s.open();
    // a new SQL source reports that it needs building; JSON works straight away
    const before = await s.status();
    if (s.type !== "json") expect(before.needsBuild || before.ok).toBe(true);
    if (await s.hasSchema()) await expect(s.build(false)).rejects.toThrow(/Rebuild|confirm/i);
    await s.build(true);
    const st = await s.status();
    expect(st.ok).toBe(true);
    expect(st.counts).toEqual({ tabs: 0, directories: 0, people: 0 });
  });
  afterAll(async () => { await s.close(); });

  it("keeps tabs and directories in order and updates them", async () => {
    await s.insertTab({ id: "t1", name: "Clients", position: 0 });
    await s.insertTab({ id: "t2", name: "Personal", position: 1 });
    await s.updateTab("t2", { name: "Friends" });
    expect((await s.listTabs()).map((t) => t.name)).toEqual(["Clients", "Friends"]);
    await s.insertDirectory({ id: "d1", tabId: "t1", parentId: null, name: "Active", description: "Paying", position: 0 });
    await s.insertDirectory({ id: "d2", tabId: "t1", parentId: "d1", name: "Healthcare", description: "", position: 0 });
    await s.updateDirectory("d1", { description: "Paying clients" });
    expect(await s.getDirectory("d1")).toMatchObject({ name: "Active", description: "Paying clients", parentId: null });
    expect((await s.listDirectories("t1")).map((d) => d.id).sort()).toEqual(["d1", "d2"]);
    expect(await s.listDirectories("t2")).toEqual([]);
  });

  it("round-trips a full person record", async () => {
    const p = person({
      id: "susan1", tabId: "t1", directoryId: "d2", firstName: "Susan", lastName: "Park", nickname: "Sue", description: "Owner, Park Family Dental",
      title: "Practice owner", birthday: "06-04", dateMet: "2026-03-12", howMet: "Chamber lunch.\nSecond line.", familyNotes: "Two kids",
      keyFacts: ["Prefers texts", "Daughter starts college"],
      contacts: [{ id: "c1", kind: "phone", label: "Mobile", value: "(512) 555-0148" }, { id: "c2", kind: "address", label: "Office", value: "1200 Main St\nRound Rock" }],
      links: [{ id: "l1", label: "LinkedIn", url: "https://linkedin.example/sp" }],
      notes: [{ id: "n2", body: "Second", createdAt: "2026-09-22T00:00:00.000Z", updatedAt: "2026-09-22T00:00:00.000Z" }, { id: "n1", body: "First", createdAt: "2026-03-12T00:00:00.000Z", updatedAt: "2026-03-12T00:00:00.000Z" }],
      photos: [{ id: "ph1", filename: "Susan_1.jpg", createdAt: "2026-09-01T00:00:00.000Z" }], mainPhotoId: "ph1",
      tags: ["chamber-lunch", "dental"], custom: {},
    });
    await s.insertPerson(p);
    const back = await s.getPerson("susan1");
    expect(back).toEqual(p);
    const sum = await s.listPeople({ tabId: "t1", directoryId: "d2" });
    expect(sum).toEqual([{ id: "susan1", tabId: "t1", directoryId: "d2", position: 0, firstName: "Susan", lastName: "Park", nickname: "Sue", description: "Owner, Park Family Dental", photo: { id: "ph1", filename: "Susan_1.jpg" } }]);
    // save replaces child lists wholesale
    await s.savePerson({ ...p, keyFacts: ["Only one"], contacts: [], tags: ["vip"], notes: p.notes.slice(1) });
    const again = await s.getPerson("susan1");
    expect(again?.keyFacts).toEqual(["Only one"]); expect(again?.contacts).toEqual([]); expect(again?.tags).toEqual(["vip"]); expect(again?.notes.map((n) => n.id)).toEqual(["n1"]);
  });

  it("places, counts and searches people (names, nickname, tags; case and accents folded by the caller)", async () => {
    await s.insertPerson(person({ id: "mark1", tabId: "t1", directoryId: null, position: 0, firstName: "Mark", lastName: "Jones", tags: ["golf"] }));
    await s.insertPerson(person({ id: "mark2", tabId: "t1", directoryId: null, position: 1, firstName: "Mark", lastName: "Jones", nickname: "MJ" }));
    await s.insertPerson(person({ id: "tomas", tabId: "t2", directoryId: null, position: 0, firstName: "Tomás", lastName: "Álvarez" }));
    expect(await s.countPeople({ tabId: "t1" })).toBe(3);
    expect(await s.countPeople({ tabId: "t1", directoryId: null })).toBe(2);
    await s.placePeople([{ id: "mark2", tabId: "t1", directoryId: null, position: 0 }, { id: "mark1", tabId: "t1", directoryId: null, position: 1 }]);
    expect((await s.listPeople({ tabId: "t1", directoryId: null })).map((p) => p.id)).toEqual(["mark2", "mark1"]);
    const ids = async (q: string) => (await s.searchPeople(q, 50)).map((h) => h.id).sort();
    expect(await ids("ark")).toEqual(["mark1", "mark2", "susan1"]); // Mark and P-ark
    expect(await ids("mark jo")).toEqual(["mark1", "mark2"]);
    expect(await ids("mj")).toEqual(["mark2"]);
    expect(await ids("golf")).toEqual(["mark1"]);
    expect(await ids("tomas alv")).toEqual(["tomas"]);
    expect(await ids("50%_")).toEqual([]);
    expect((await s.searchPeople("golf", 5))[0].tags).toEqual(["golf"]);
    const m1 = (await s.getPerson("mark1"))!; await s.savePerson({ ...m1, businessCategory: "Finance" });
    const t1 = (await s.getPerson("tomas"))!; await s.savePerson({ ...t1, businessCategory: "Accounting" });
    expect(await s.distinctCategories()).toEqual(["Accounting", "Finance"]);
  });

  it("custom fields: usage, clearing, deleting", async () => {
    await s.insertField({ id: "f1", name: "Golf handicap", type: "text", position: 0, archived: false });
    await s.insertField({ id: "f2", name: "Newsletter", type: "boolean", position: 1, archived: false });
    await s.updateField("f2", { archived: true });
    expect((await s.listFields()).map((f) => [f.id, f.archived])).toEqual([["f1", false], ["f2", true]]);
    const m = (await s.getPerson("mark1"))!;
    await s.savePerson({ ...m, custom: { f1: "14", f2: "true" } });
    expect(await s.fieldUsage("f1")).toEqual([{ personId: "mark1", value: "14" }]);
    expect(await s.clearFieldValues("f1")).toBe(1);
    expect(await s.fieldUsage("f1")).toEqual([]);
    await s.deleteField("f2");
    expect((await s.getPerson("mark1"))!.custom).toEqual({});
    expect((await s.listFields()).map((f) => f.id)).toEqual(["f1"]);
  });

  it("moves directories between tabs and deletes things", async () => {
    await s.placeDirectories([{ id: "d1", tabId: "t2", parentId: null, position: 0 }]);
    expect((await s.getDirectory("d1"))!.tabId).toBe("t2");
    await s.placeDirectories([{ id: "d1", tabId: "t1", parentId: null, position: 0 }]);
    await s.deletePerson("tomas");
    expect(await s.getPerson("tomas")).toBeNull();
  });

  it("exports everything and loads it back (replace and append)", async () => {
    const doc = await s.exportAll();
    expect(doc.format).toBe("people-manager");
    expect(doc.people.length).toBe(3);
    const susan = doc.people.find((p) => p.id === "susan1")!;
    expect(susan.contacts).toEqual([]);
    await s.replaceAll({ ...doc, people: [], directories: [], tabs: [], customFields: [] });
    expect((await s.status()).counts).toEqual({ tabs: 0, directories: 0, people: 0 });
    await s.replaceAll(doc);
    const again = await s.exportAll();
    const norm = (d: PeopleDocument) => ({ ...d, exportedAt: "", people: [...d.people].sort((a, b) => a.id.localeCompare(b.id)), directories: [...d.directories].sort((a, b) => a.id.localeCompare(b.id)) });
    expect(norm(again)).toEqual(norm(doc));
    // append needs new ids — a child directory listed before its parent must still load
    await s.appendAll({ ...doc, tabs: [{ id: "t9", name: "Extra", position: 5 }], customFields: [],
      directories: [{ id: "c9", tabId: "t9", parentId: "p9", name: "Child", description: "", position: 0 }, { id: "p9", tabId: "t9", parentId: null, name: "Parent", description: "", position: 0 }],
      people: [person({ id: "new1", tabId: "t9", directoryId: "c9", firstName: "Nia" })] });
    expect((await s.status()).counts).toEqual({ tabs: 3, directories: 4, people: 4 });
  });
});

describe("sqlite source that is not built", () => {
  it("says it needs building and does not create a file just by looking", async () => {
    const f = path.join(dir, "nothing-here.db");
    const s = SqlStore.sqlite(f); await s.open();
    const st = await s.status();
    expect(st).toMatchObject({ ok: false, needsBuild: true });
    expect(st.message).toMatch(/does not exist yet/);
    expect(fs.existsSync(f)).toBe(false);
    await s.close();
  });
});

describe("json source with a damaged file", () => {
  it("reports it and refuses to overwrite it", async () => {
    const f = path.join(dir, "broken.json"); fs.writeFileSync(f, "{ not json");
    const s = new JsonStore(f); await s.open();
    expect((await s.status()).ok).toBe(false);
    await expect(s.insertTab({ id: "x", name: "X", position: 0 })).rejects.toThrow(/could not be read/);
    expect(fs.readFileSync(f, "utf8")).toBe("{ not json");
  });
});
