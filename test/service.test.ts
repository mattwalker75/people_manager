/**
 * The app's rules, checked through the Service on the JSON and SQLite sources
 * (and MySQL when PM_TEST_MYSQL is set).
 */
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Service } from "../server/src/service.js";
import { mysqlSettings, scratchConfig, scratchDir, tinyPng } from "./helpers.js";

const sources: [string, Record<string, unknown>][] = [["json", { type: "json" }], ["sqlite", { type: "sqlite" }]];
const my = mysqlSettings();
if (my) sources.push(["mysql", { type: "mysql", mysql: my }]);

describe.each(sources)("rules on %s", (_n, ds) => {
  const dir = scratchDir("pm-svc");
  const svc = new Service(scratchConfig(dir, { dataSource: ds }));
  let t1: string, t2: string;
  beforeAll(async () => {
    await svc.useConfiguredSource();
    if (svc.store.type !== "json") await svc.store.build(true);
    t1 = (await svc.createTab("Clients")).id;
    t2 = (await svc.createTab("Networking")).id;
  });
  afterAll(async () => { await svc.store.close(); fs.rmSync(dir, { recursive: true, force: true }); });

  it("needs a first name; everything else is optional; tags are cleaned", async () => {
    await expect(svc.createPerson({ tabId: t1, firstName: "  " })).rejects.toThrow(/first name/);
    const p = await svc.createPerson({ tabId: t1, firstName: " Susan ", lastName: "Park", nickname: "Sue", tags: ["Chamber-Lunch", "dental", "chamber-lunch", " "], keyFacts: ["Prefers texts", ""],
      contacts: [{ kind: "phone", label: "Mobile", value: "(512) 555-0148" }, { kind: "email", label: "Work", value: "" }], birthday: "06-04" });
    expect(p.firstName).toBe("Susan");
    expect(p.tags).toEqual(["chamber-lunch", "dental"]);
    expect(p.keyFacts).toEqual(["Prefers texts"]);
    expect(p.contacts).toHaveLength(1);
    expect(p.path).toBe("Clients");
    await expect(svc.createPerson({ tabId: t1, firstName: "X", birthday: "June 4th" })).rejects.toThrow(/date/i);
  });

  it("allows many people with the same name", async () => {
    await svc.createPerson({ tabId: t1, firstName: "Mark", lastName: "Jones", description: "CFO, Ridgeline" });
    await svc.createPerson({ tabId: t2, firstName: "Mark", lastName: "Jones", nickname: "MJ", description: "Sales engineer" });
    const r = await svc.search("mark jones");
    expect(r.map((x) => x.description).sort()).toEqual(["CFO, Ridgeline", "Sales engineer"]);
    expect(r.map((x) => x.path).sort()).toEqual(["Clients", "Networking"]);
  });

  it("search: anywhere in the name, any case, no accents needed, tags say they matched", async () => {
    await svc.createPerson({ tabId: t2, firstName: "Tomás", lastName: "Álvarez", nickname: "Tom", tags: ["golf", "referral-source"] });
    expect((await svc.search("MARK")).length).toBe(2);
    expect((await svc.search("ark")).map((r) => r.firstName).sort()).toEqual(["Mark", "Mark", "Susan"]);
    expect((await svc.search("tomas")).map((r) => r.lastName)).toEqual(["Álvarez"]);
    const byTag = await svc.search("golf");
    expect(byTag).toHaveLength(1);
    expect(byTag[0].matchedTag).toBe("golf");
    expect((await svc.search("tom"))[0].matchedTag).toBeNull(); // name match wins
    expect(await svc.search("   ")).toEqual([]);
    expect(await svc.search("zzz")).toEqual([]);
  });

  it("a tab or directory must be empty to delete, and says what is inside (first 5, then how many more)", async () => {
    const tab = (await svc.createTab("Busy")).id;
    const d = await svc.createDirectory({ tabId: tab, name: "Inner", description: "one-liner" });
    for (let i = 1; i <= 7; i++) await svc.createPerson({ tabId: tab, firstName: `Person${i}` });
    await svc.createPerson({ tabId: tab, directoryId: d.id, firstName: "Deep" });
    await expect(svc.deleteTab(tab)).rejects.toThrow(/“Busy” is not empty — it still holds 1 directory and 8 people: Inner \(directory\), Person1, Person2, Person3, Person4, …and 3 more\./);
    await expect(svc.deleteDirectory(d.id)).rejects.toThrow(/holds 1 person: Deep/);
    const deep = (await svc.listPeople(tab, d.id))[0];
    await svc.deletePerson(deep.id);
    await svc.deleteDirectory(d.id);
    for (const p of await svc.listPeople(tab, null)) await svc.deletePerson(p.id);
    await svc.deleteTab(tab);
    expect((await svc.listTabs()).map((t) => t.name)).toEqual(["Clients", "Networking"]);
  });

  it("moves people between places and tabs, keeping order tidy", async () => {
    const dir = await svc.createDirectory({ tabId: t1, name: "Prospects" });
    const a = await svc.createPerson({ tabId: t1, directoryId: dir.id, firstName: "A" });
    const b = await svc.createPerson({ tabId: t1, directoryId: dir.id, firstName: "B" });
    const c = await svc.createPerson({ tabId: t1, directoryId: dir.id, firstName: "C" });
    await svc.movePerson(c.id, { tabId: t1, directoryId: dir.id, index: 0 });
    expect((await svc.listPeople(t1, dir.id)).map((p) => [p.firstName, p.position])).toEqual([["C", 0], ["A", 1], ["B", 2]]);
    await svc.movePerson(a.id, { tabId: t2, directoryId: null, index: 0 });
    expect((await svc.listPeople(t1, dir.id)).map((p) => [p.firstName, p.position])).toEqual([["C", 0], ["B", 1]]);
    const moved = await svc.getPerson(a.id);
    expect([moved.tabId, moved.directoryId, moved.position, moved.path]).toEqual([t2, null, 0, "Networking"]);
    await expect(svc.movePerson(b.id, { tabId: t2, directoryId: dir.id })).rejects.toThrow(/another tab/);
  });

  it("moves a directory with everything inside it to another tab; refuses a move into itself", async () => {
    const top = await svc.createDirectory({ tabId: t1, name: "Events" });
    const sub = await svc.createDirectory({ tabId: t1, parentId: top.id, name: "Summit 2026" });
    const p = await svc.createPerson({ tabId: t1, directoryId: sub.id, firstName: "Elena", lastName: "Ruiz" });
    await expect(svc.moveDirectory(top.id, { tabId: t1, parentId: sub.id })).rejects.toThrow(/inside itself/);
    await svc.moveDirectory(top.id, { tabId: t2, parentId: null, index: 0 });
    expect((await svc.store.getDirectory(sub.id))!.tabId).toBe(t2);
    const moved = await svc.getPerson(p.id);
    expect(moved.tabId).toBe(t2);
    expect(moved.path).toBe("Networking › Events › Summit 2026");
    const listing = await svc.listDirectories(t2);
    const t2Top = listing.directories.filter((d) => !d.parentId);
    expect(listing.directories.find((d) => d.id === sub.id)!.peopleCount).toBe(1);
    expect(t2Top[0].id).toBe(top.id);
  });

  it("notes: add (newest first), edit, delete", async () => {
    const p = await svc.createPerson({ tabId: t1, firstName: "Noted" });
    const n1 = await svc.addNote(p.id, "First meeting");
    await new Promise((r) => setTimeout(r, 5));
    const n2 = await svc.addNote(p.id, "Follow up after Oct 10");
    await expect(svc.addNote(p.id, "  ")).rejects.toThrow(/empty/);
    expect((await svc.getPerson(p.id)).notes.map((n) => n.body)).toEqual(["Follow up after Oct 10", "First meeting"]);
    await svc.editNote(p.id, n1.id, "First meeting at the Chamber lunch");
    await svc.deleteNote(p.id, n2.id);
    expect((await svc.getPerson(p.id)).notes.map((n) => n.body)).toEqual(["First meeting at the Chamber lunch"]);
  });

  it("an edit keeps notes, photos and placement", async () => {
    const p = await svc.createPerson({ tabId: t1, firstName: "Keep" });
    await svc.addNote(p.id, "a note");
    await svc.addPhoto(p.id, { buffer: tinyPng(), originalname: "face.png", mimetype: "image/png" });
    const saved = await svc.updatePerson(p.id, { firstName: "Kept", title: "Doctor", tags: ["x"] });
    expect(saved.firstName).toBe("Kept"); expect(saved.notes).toHaveLength(1); expect(saved.photos).toHaveLength(1); expect(saved.tabId).toBe(t1);
  });

  it("photos: original name with underscores, clash numbering, the limit, main photo, deletion", async () => {
    const p = await svc.createPerson({ tabId: t1, firstName: "Pic" });
    const up = (name: string) => svc.addPhoto(p.id, { buffer: tinyPng(), originalname: name, mimetype: "image/png" });
    let r = await up("My Face.png");
    expect(r.photos[0].filename).toBe("My_Face.png");
    expect(r.mainPhotoId).toBe(r.photos[0].id);
    r = await up("My Face.png");
    expect(r.photos[1].filename).toBe("My_Face_1.png");
    await up("c.png"); await up("d.png"); await up("e.png");
    await expect(up("f.png")).rejects.toThrow(/already has 5 photos/);
    await expect(svc.addPhoto(p.id, { buffer: Buffer.from("x"), originalname: "x.txt", mimetype: "text/plain" })).rejects.toThrow();
    r = await svc.setMainPhoto(p.id, r.photos[1].id);
    expect((await svc.listPeople(t1, null)).find((x) => x.id === p.id)!.photo!.filename).toBe("My_Face_1.png");
    r = await svc.deletePhoto(p.id, r.photos[1].id);
    expect(r.mainPhotoId).toBe(r.photos[0].id);
    expect(fs.existsSync(path.join(svc.photosDir(), p.id, "My_Face_1.png"))).toBe(false);
    expect(svc.photoFile(p.id, "../../config.json")).toBeNull();
    await svc.deletePerson(p.id);
    expect(fs.existsSync(path.join(svc.photosDir(), p.id))).toBe(false);
  });

  it("custom fields: create, rename, safe type changes, archive, usage, delete flows", async () => {
    const golf = await svc.createField({ name: "Golf handicap", type: "text" });
    const news = await svc.createField({ name: "Newsletter", type: "boolean" });
    await expect(svc.createField({ name: "golf HANDICAP", type: "text" })).rejects.toThrow(/already a field/);
    const p = await svc.createPerson({ tabId: t1, firstName: "Custom", custom: { [golf.id]: "14", [news.id]: "Yes", nope: "x" } });
    expect(p.custom).toEqual({ [golf.id]: "14", [news.id]: "true" });
    await svc.updateField(golf.id, { name: "Golf index", type: "paragraph" }); // text ↔ paragraph always fine
    await expect(svc.updateField(news.id, { type: "text" })).rejects.toThrow(/yes\/no field can only change type while it is empty/);
    await svc.updateField(news.id, { archived: true });
    expect((await svc.fieldUsage(golf.id)).map((u) => [u.firstName, u.value, u.path])).toEqual([["Custom", "14", "Clients"]]);
    await expect(svc.deleteField(golf.id, false)).rejects.toThrow(/still holds values for 1 person/);
    // clear one by one (by editing the person), then delete is allowed
    await svc.updatePerson(p.id, { firstName: "Custom", custom: { [news.id]: "true" } });
    expect(await svc.deleteField(golf.id, false)).toEqual({ cleared: 0 });
    // or delete together with the values
    expect(await svc.deleteField(news.id, true)).toEqual({ cleared: 1 });
    expect((await svc.getPerson(p.id)).custom).toEqual({});
    expect(await svc.listFields()).toEqual([]);
  });
});
