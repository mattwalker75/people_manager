/**
 * CSV people: the template, column recognition (template, LinkedIn, Google,
 * Outlook), dates, preview, import (top level or a new directory, duplicates,
 * backup), undo, and export → import round trips — on JSON and SQLite (and
 * MySQL when PM_TEST_MYSQL is set).
 */
import fs from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Papa from "papaparse";
import { Backups } from "../server/src/backups.js";
import { CsvPeople, EXAMPLE_NOTE, guessTargets, parseDate } from "../server/src/csv.js";
import { Service } from "../server/src/service.js";
import { mysqlSettings, scratchConfig, scratchDir, startServer } from "./helpers.js";

const rows = (csv: string) => Papa.parse<string[]>(csv.replace(/^﻿/, ""), { skipEmptyLines: true }).data;

describe("reading dates", () => {
  it("understands the usual spellings and refuses nonsense", () => {
    expect(parseDate("2026-03-12", false)).toBe("2026-03-12");
    expect(parseDate("3/12/2026", false)).toBe("2026-03-12");
    expect(parseDate("3/12/26", false)).toBe("2026-03-12");
    expect(parseDate("12 Mar 2026", false)).toBe("2026-03-12"); // LinkedIn "Connected On"
    expect(parseDate("March 12, 2026", false)).toBe("2026-03-12");
    expect(parseDate("Sep 4th 2026", false)).toBe("2026-09-04");
    expect(parseDate("--06-04", true)).toBe("06-04"); // Google, no year
    expect(parseDate("June 4", true)).toBe("06-04");
    expect(parseDate("6/4", true)).toBe("06-04");
    expect(parseDate("June 4", false)).toBeNull(); // a date met needs a year
    expect(parseDate("13/45/2026", false)).toBeNull();
    expect(parseDate("someday", true)).toBeNull();
    expect(parseDate("", true)).toBe("");
  });
});

describe("recognising columns", () => {
  it("maps the template, LinkedIn, Google Contacts and Outlook headings", () => {
    expect(guessTargets(["First Name", "Last Name", "URL", "Email Address", "Company", "Position", "Connected On"], []))
      .toEqual(["firstName", "lastName", "link:LinkedIn", "email:*", "company", "title", "dateMet"]);
    expect(guessTargets(["Given Name", "Family Name", "E-mail 1 - Label", "E-mail 1 - Value", "Phone 1 - Type", "Phone 1 - Value", "Organization Name", "Labels", "Birthday"], []))
      .toEqual(["firstName", "lastName", "ignore", "email:*", "ignore", "phone:*", "company", "tags", "birthday"]);
    expect(guessTargets(["First Name", "Mobile Phone", "Business Phone", "E-mail Address", "Job Title", "Web Page", "Notes", "Something Else"], []))
      .toEqual(["firstName", "phone:Mobile", "phone:Work", "email:*", "title", "link:Website", "notes", "ignore"]);
    expect(guessTargets(["first_name", "X", "Twitter", "TikTok", "YouTube", "Instagram", "Facebook", "Golf Handicap"], [{ id: "f1", name: "Golf handicap", type: "text", position: 0, archived: false }]))
      .toEqual(["firstName", "link:X", "link:X", "link:TikTok", "link:YouTube", "link:Instagram", "link:Facebook", "custom:f1"]);
  });
});

const sources: [string, Record<string, unknown>][] = [["json", { type: "json" }], ["sqlite", { type: "sqlite" }]];
const my = mysqlSettings();
if (my) sources.push(["mysql", { type: "mysql", mysql: my }]);

describe.each(sources)("CSV import and export on %s", (_n, ds) => {
  const dir = scratchDir("pm-csv");
  const svc = new Service(scratchConfig(dir, { dataSource: ds }));
  const backups = new Backups(svc);
  const csv = new CsvPeople(svc, backups);
  let tabId: string; let golf: string; let news: string;
  beforeAll(async () => {
    await svc.useConfiguredSource();
    if (svc.store.type !== "json") await svc.store.build(true);
    tabId = (await svc.createTab("Clients")).id;
    golf = (await svc.createField({ name: "Golf handicap", type: "text" })).id;
    news = (await svc.createField({ name: "Newsletter", type: "boolean" })).id;
    await svc.createPerson({ tabId, firstName: "Mark", lastName: "Jones" });
  });
  afterAll(async () => { await svc.store.close(); fs.rmSync(dir, { recursive: true, force: true }); });

  it("makes a template with every field, the custom fields, and an example row that import skips", async () => {
    const t = await csv.template();
    expect(t.startsWith("﻿")).toBe(true);
    const [head, example] = rows(t);
    expect(head.slice(0, 4)).toEqual(["First Name", "Last Name", "Nickname", "One-line Description"]);
    for (const h of ["Mobile Phone", "Work Email", "LinkedIn", "Facebook", "Instagram", "X", "TikTok", "YouTube", "Website", "Birthday", "Key Facts", "Tags", "Notes", "Golf handicap", "Newsletter"]) expect(head).toContain(h);
    expect(example[head.indexOf("Notes")]).toBe(EXAMPLE_NOTE);
    const p = await csv.preview(t, tabId);
    expect(p).toMatchObject({ total: 1, ready: 0, skipped: [{ row: 2, reason: "the template's example row" }] });
  });

  it("previews a LinkedIn export: columns guessed, dates read, duplicates flagged, nothing saved", async () => {
    const file = "First Name,Last Name,URL,Email Address,Company,Position,Connected On\n" +
      "Priya,Natarajan,https://www.linkedin.com/in/priya,priya@lumen.example,Lumen Analytics,Founder & CEO,12 Mar 2026\n" +
      "Mark,Jones,https://www.linkedin.com/in/mjones,,Cobalt Systems,Sales engineer,04 Sep 2026\n" +
      ",NoFirst,,,,,\n" +
      "Elena,Ruiz,,,Brightline,VP Marketing,sometime\n";
    const before = (await svc.store.status()).counts!.people;
    const p = await csv.preview(file, tabId);
    expect(p.columns.map((c) => c.target)).toEqual(["firstName", "lastName", "link:LinkedIn", "email:*", "company", "title", "dateMet"]);
    expect(p).toMatchObject({ total: 4, ready: 3, tab: "Clients" });
    expect(p.skipped).toEqual([{ row: 4, reason: "no first name" }]);
    expect(p.duplicates).toEqual([{ row: 3, name: "Mark Jones", where: "tab" }]);
    expect(p.warnings).toEqual([{ row: 5, message: "Date met “sometime” isn't a date — left empty" }]);
    expect(p.sample[0]).toMatchObject({ name: "Priya Natarajan", description: "Founder & CEO, Lumen Analytics", contacts: 1, links: 1 });
    expect((await svc.store.status()).counts!.people).toBe(before);
    // LinkedIn's real file has notes above the headings
    const real = "Notes:\n\"When exporting your connection data, you may notice that some of the email addresses are missing.\"\n\n" + file;
    const q = await csv.preview(real, tabId);
    expect(q).toMatchObject({ total: 4, ready: 3 });
    expect(q.skipped).toEqual([{ row: 7, reason: "no first name" }]);
  });

  it("imports into the tab's top level after a backup — only a first name is needed — and can be undone", async () => {
    const file = "First Name,Last Name,Mobile Phone,Work Email,LinkedIn,Instagram,Birthday,Date Met,Key Facts,Tags,Notes,Golf handicap,Newsletter,Other Phones\n" +
      "Susan,Park,(512) 555-0148,susan@park.example,linkedin.com/in/sp,instagram.com/sp,06-04,2026-03-12,Prefers texts; Second office,Chamber-Lunch; dental,\"Met at lunch\n---\nFollow up in Oct\",14,Yes,Office: (512) 555-0190\n" +
      "Claire,,,,,,,,,,,,maybe,\n" +
      "Mark,Jones,,,,,,,,,,,,\n";
    const r = await csv.import({ csv: file, tabId, skipDuplicates: true, fileName: "people.csv" });
    expect(r).toMatchObject({ added: 2, skipped: 1, warnings: 1, tab: "Clients", directory: null });
    expect(fs.existsSync(`${backups.dir()}/${r.backup}`)).toBe(true);
    const found = await svc.search("susan park");
    const sue = await svc.getPerson(found[0].id);
    expect(sue.path).toBe("Clients");
    expect(sue.contacts.map((c) => [c.kind, c.label, c.value])).toEqual([["phone", "Mobile", "(512) 555-0148"], ["email", "Work", "susan@park.example"], ["phone", "Office", "(512) 555-0190"]]);
    expect(sue.links.map((l) => [l.label, l.url])).toEqual([["LinkedIn", "linkedin.com/in/sp"], ["Instagram", "instagram.com/sp"]]);
    expect([sue.birthday, sue.dateMet]).toEqual(["06-04", "2026-03-12"]);
    expect(sue.keyFacts).toEqual(["Prefers texts", "Second office"]);
    expect(sue.tags).toEqual(["chamber-lunch", "dental"]);
    expect(sue.notes.map((n) => n.body).sort()).toEqual(["Follow up in Oct", "Met at lunch"]);
    expect(sue.custom).toEqual({ [golf]: "14", [news]: "true" });
    const claire = await svc.getPerson((await svc.search("claire"))[0].id);
    expect([claire.firstName, claire.lastName, claire.custom]).toEqual(["Claire", "", {}]);
    expect((await svc.search("mark jones")).length).toBe(1); // the duplicate was skipped

    expect(csv.recent()[0]).toMatchObject({ id: r.importId, count: 2, undone: false, file: "people.csv" });
    expect(await csv.undo(r.importId)).toEqual({ removed: 2, directoryRemoved: false });
    expect(await svc.search("susan")).toEqual([]);
    expect((await svc.search("mark jones")).length).toBe(1); // untouched
    await expect(csv.undo(r.importId)).rejects.toThrow(/already been undone/);
  });

  it("can put the people into a new directory; undo removes it when it is empty again", async () => {
    const r = await csv.import({ csv: "first,last\nAna,Blake\nOmar,Schmidt\n", tabId, newDirectory: "Imported Sep 29, 2026", fileName: "x.csv" });
    expect(r).toMatchObject({ added: 2, directory: "Imported Sep 29, 2026" });
    const people = await svc.listPeople(tabId, r.directoryId);
    expect(people.map((p) => [p.firstName, p.position])).toEqual([["Ana", 0], ["Omar", 1]]);
    expect((await svc.getPerson(people[0].id)).path).toBe("Clients › Imported Sep 29, 2026");
    expect(await csv.undo(r.importId)).toEqual({ removed: 2, directoryRemoved: true });
  });

  it("uses a corrected column choice, and says so when no column is the first name", async () => {
    const file = "Name,Surname,Cell\nKofi,Mensah,555-0101\n";
    await expect(csv.preview(file, tabId)).rejects.toThrow(/No column is set to First name/);
    const p = await csv.preview(file, tabId, { 0: "firstName", 1: "lastName", 2: "phone:Mobile" });
    expect(p.sample[0]).toMatchObject({ name: "Kofi Mensah", contacts: 1 });
  });

  it("reads Google Contacts label/value pairs and semicolon-separated files with a byte-order mark", async () => {
    const google = "Given Name,Family Name,E-mail 1 - Label,E-mail 1 - Value,Phone 1 - Label,Phone 1 - Value,Labels\nGrace,Adeyemi,* Work,grace@nw.example,Mobile,555-0111,* myContacts ::: investors\n";
    const p = await csv.preview(google, tabId);
    expect(p.sample[0]).toMatchObject({ name: "Grace Adeyemi", contacts: 2, tags: ["investors"] });
    const semi = "﻿First Name;Last Name;Notes\nWei;Chen;\"line one\nline two\"\n";
    const q = await csv.preview(semi, tabId);
    expect(q).toMatchObject({ ready: 1, sample: [{ name: "Wei Chen" }] });
  });

  it("exports to the template's columns plus Tab and Directory, and the export imports back the same", async () => {
    const dirId = (await svc.createDirectory({ tabId, name: "Healthcare" })).id;
    await svc.createPerson({ tabId, directoryId: dirId, firstName: "Tomás", lastName: "Álvarez", nickname: "Tom", description: "CPA",
      contacts: [{ kind: "phone", label: "Mobile", value: "555-0100" }, { kind: "phone", label: "Fax", value: "555-0199" }, { kind: "email", label: "Work", value: "tom@x.example" }, { kind: "address", label: "Work", value: "1 Main St\nAustin" }],
      links: [{ label: "LinkedIn", url: "linkedin.com/in/tom" }, { label: "Twitter", url: "x.com/tom" }, { label: "Blog", url: "tom.example/blog" }],
      keyFacts: ["Referred three clients"], tags: ["golf"], custom: { [golf]: "9", [news]: "false" }, birthday: "1981-06-04" });
    const { csv: out, count } = await csv.exportCsv(tabId);
    expect(count).toBeGreaterThan(1);
    const [head, ...body] = rows(out);
    expect(head.slice(-6)).toEqual(["Other Phones", "Other Emails", "Other Addresses", "Other Links", "Tab", "Directory"]);
    const tom = body.find((r) => r[0] === "Tomás")!;
    const col = (h: string) => tom[head.indexOf(h)];
    expect([col("Mobile Phone"), col("Work Email"), col("Work Address"), col("LinkedIn"), col("X"), col("Other Phones"), col("Other Links"), col("Golf handicap"), col("Newsletter"), col("Tab"), col("Directory")])
      .toEqual(["555-0100", "tom@x.example", "1 Main St\nAustin", "linkedin.com/in/tom", "x.com/tom", "Fax: 555-0199", "Blog: tom.example/blog", "9", "No", "Clients", "Healthcare"]);
    // round trip into a second tab
    const other = (await svc.createTab("Round trip")).id;
    const r = await csv.import({ csv: out, tabId: other });
    expect(r.added).toBe(count);
    const back = await svc.getPerson((await svc.search("tomas")).find((x) => x.tabId === other)!.id);
    expect([back.nickname, back.description, back.birthday, back.keyFacts, back.tags, back.custom]).toEqual(["Tom", "CPA", "1981-06-04", ["Referred three clients"], ["golf"], { [golf]: "9", [news]: "false" }]);
    expect(back.contacts.map((c) => `${c.kind}/${c.label}/${c.value}`).sort()).toEqual(["address/Work/1 Main St\nAustin", "email/Work/tom@x.example", "phone/Fax/555-0199", "phone/Mobile/555-0100"]);
    expect(back.links.map((l) => `${l.label}/${l.url}`).sort()).toEqual(["Blog/tom.example/blog", "LinkedIn/linkedin.com/in/tom", "X/x.com/tom"]);
  });
});

describe("CSV over HTTP", () => {
  it("downloads the template and an export as CSV files, and imports through the API", async () => {
    const run = await startServer();
    try {
      const tab = (await run.call("POST", "/api/tabs", { name: "Clients" })).json;
      const t = await fetch(`${run.base}/api/csv/template`);
      expect(t.headers.get("content-type")).toMatch(/text\/csv/);
      expect(t.headers.get("content-disposition")).toBe('attachment; filename="people-template.csv"');
      const imp = await run.call("POST", "/api/csv/import", { csv: "First Name\nSam\n", tabId: tab.id, fileName: "a.csv" });
      expect(imp.json).toMatchObject({ added: 1, tab: "Clients" });
      const e = await fetch(`${run.base}/api/csv/export?tabId=${tab.id}`);
      expect(e.headers.get("content-disposition")).toMatch(/attachment; filename="people-clients-\d{8}-\d{6}\.csv"/);
      expect(await e.text()).toContain("Sam");
      expect((await run.call("GET", "/api/csv/imports")).json[0]).toMatchObject({ count: 1, tab: "Clients" });
      expect((await run.call("POST", `/api/csv/imports/${imp.json.importId}/undo`)).json).toEqual({ removed: 1, directoryRemoved: false });
      expect((await run.call("POST", "/api/csv/preview", { csv: "Nope\nx\n", tabId: tab.id })).status).toBe(422);
    } finally { await run.close(); }
  });
});
