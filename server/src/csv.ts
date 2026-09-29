/**
 * People in and out of spreadsheets.
 *
 *   template()  a CSV with one column per field (and one per custom field) plus an
 *               example row — fill it in with Excel, then import it.
 *   preview()   read a CSV, guess which field each column fills (the template's
 *               headings, LinkedIn's connections export, Google Contacts, Outlook
 *               and common variants are recognised), and report what an import
 *               would do — without saving anything.
 *   import()    add the people to a tab's top level (or a new directory in it),
 *               after an automatic backup; remembered so it can be undone.
 *   exportCsv() everyone (or one tab) with the template's columns plus Tab and
 *               Directory, so an export can be edited and imported again.
 *
 * Only First Name is required. Anything a CSV cannot carry — photos, extra
 * notes, more contact details — is added on the person's card afterwards.
 */
import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import type { CustomField, Id, Person } from "../../shared/types.js";
import { displayName, fold } from "../../shared/types.js";
import type { Backups } from "./backups.js";
import type { Service } from "./service.js";
import { newId, now, UserError, writeAtomic } from "./util.js";

// ---------------------------------------------------------------- the columns

/** Social and web links with their own column (label on the card = the name here). */
export const LINK_COLUMNS = ["LinkedIn", "Facebook", "Instagram", "X", "TikTok", "YouTube", "Website"];

/** A place a CSV column can go. */
export interface Target { key: string; label: string; group: string }

const FIELD_TARGETS: [string, string][] = [
  ["firstName", "First name"], ["lastName", "Last name"], ["nickname", "Nickname"], ["description", "One-line description"],
  ["title", "Title"], ["profession", "Profession"], ["businessCategory", "Business category"], ["company", "Company (goes into the one-line description)"],
  ["birthday", "Birthday"], ["dateMet", "Date met"], ["fromPlace", "Where they are from"], ["howMet", "How we met"], ["generalDescription", "Description"],
  ["ageRange", "Age range"], ["maritalStatus", "Relationship"], ["kids", "Kids"], ["pets", "Pets"], ["familyNotes", "Family notes"],
  ["businessWebsite", "Business website"], ["businessDescription", "Business description"],
];

export function allTargets(fields: CustomField[]): Target[] {
  return [
    { key: "ignore", label: "— don't import —", group: "" },
    ...FIELD_TARGETS.map(([key, label]) => ({ key, label, group: "Person" })),
    ...[["phone:Mobile", "Mobile phone"], ["phone:Work", "Work phone"], ["phone:Home", "Home phone"], ["phone:*", "Phone (labelled from the column)"],
      ["email:Personal", "Personal email"], ["email:Work", "Work email"], ["email:*", "Email (labelled from the column)"],
      ["address:Home", "Home address"], ["address:Work", "Work address"], ["address:*", "Address (labelled from the column)"],
      ["otherPhones", "Other phones (Label: number; …)"], ["otherEmails", "Other emails (Label: address; …)"], ["otherAddresses", "Other addresses (Label: address; …)"]]
      .map(([key, label]) => ({ key, label, group: "Contact" })),
    ...LINK_COLUMNS.map((l) => ({ key: `link:${l}`, label: l === "X" ? "X (Twitter)" : l, group: "Links" })),
    { key: "link:*", label: "Link (named after the column)", group: "Links" },
    { key: "otherLinks", label: "Other links (Name: address; …)", group: "Links" },
    { key: "keyFacts", label: "Key facts (separate with ;)", group: "Lists" },
    { key: "tags", label: "Tags (separate with ;)", group: "Lists" },
    { key: "notes", label: "Notes", group: "Lists" },
    ...fields.filter((f) => !f.archived).map((f) => ({ key: `custom:${f.id}`, label: f.name, group: "Your fields" })),
  ];
}

/** The template's own columns, in order: [heading, target]. */
function templateColumns(fields: CustomField[]): [string, string][] {
  return [
    ["First Name", "firstName"], ["Last Name", "lastName"], ["Nickname", "nickname"], ["One-line Description", "description"],
    ["Title", "title"], ["Profession", "profession"], ["Business Category", "businessCategory"],
    ["Mobile Phone", "phone:Mobile"], ["Work Phone", "phone:Work"], ["Home Phone", "phone:Home"],
    ["Personal Email", "email:Personal"], ["Work Email", "email:Work"], ["Home Address", "address:Home"], ["Work Address", "address:Work"],
    ...LINK_COLUMNS.map((l): [string, string] => [l, `link:${l}`]),
    ["Business Website", "businessWebsite"], ["Business Description", "businessDescription"],
    ["Birthday", "birthday"], ["Date Met", "dateMet"], ["From", "fromPlace"], ["How We Met", "howMet"], ["Description", "generalDescription"],
    ["Age Range", "ageRange"], ["Relationship", "maritalStatus"], ["Kids", "kids"], ["Pets", "pets"], ["Family Notes", "familyNotes"],
    ["Key Facts", "keyFacts"], ["Tags", "tags"], ["Notes", "notes"],
    ...fields.filter((f) => !f.archived).map((f): [string, string] => [f.name, `custom:${f.id}`]),
  ];
}

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Headings from the template, LinkedIn, Google Contacts, Outlook and common variants → target. */
const ALIASES: Record<string, string> = {
  firstname: "firstName", givenname: "firstName", first: "firstName", fname: "firstName",
  lastname: "lastName", familyname: "lastName", surname: "lastName", last: "lastName", lname: "lastName",
  nickname: "nickname", nick: "nickname", goesby: "nickname",
  onelinedescription: "description", oneliner: "description", headline: "description", summary: "description",
  title: "title", jobtitle: "title", position: "title", organizationtitle: "title", organization1title: "title", role: "title",
  profession: "profession", occupation: "profession",
  businesscategory: "businessCategory", category: "businessCategory", industry: "businessCategory",
  company: "company", companyname: "company", organization: "company", organizationname: "company", organization1name: "company", employer: "company",
  birthday: "birthday", birthdate: "birthday", dateofbirth: "birthday", dob: "birthday",
  datemet: "dateMet", connectedon: "dateMet", met: "dateMet", metdate: "dateMet", datefirstmet: "dateMet",
  from: "fromPlace", wheretheyarefrom: "fromPlace", hometown: "fromPlace", location: "fromPlace", city: "fromPlace",
  howwemet: "howMet", howmet: "howMet", howyoumet: "howMet",
  description: "generalDescription", generaldescription: "generalDescription", physicaldescription: "generalDescription", appearance: "generalDescription",
  agerange: "ageRange", age: "ageRange", relationship: "maritalStatus", maritalstatus: "maritalStatus", kids: "kids", children: "kids", pets: "pets", familynotes: "familyNotes", family: "familyNotes",
  businesswebsite: "businessWebsite", companywebsite: "businessWebsite", businessdescription: "businessDescription", aboutthebusiness: "businessDescription",
  mobilephone: "phone:Mobile", mobile: "phone:Mobile", cellphone: "phone:Mobile", cell: "phone:Mobile", mobilenumber: "phone:Mobile",
  workphone: "phone:Work", businessphone: "phone:Work", officephone: "phone:Work", business2phone: "phone:Work",
  homephone: "phone:Home", home2phone: "phone:Home",
  phone: "phone:*", phonenumber: "phone:*", telephone: "phone:*", primaryphone: "phone:*", otherphone: "phone:*",
  personalemail: "email:Personal", homeemail: "email:Personal",
  workemail: "email:Work", businessemail: "email:Work",
  email: "email:*", emailaddress: "email:*", email1: "email:*", emailaddress1: "email:*", email2address: "email:*", email3address: "email:*",
  homeaddress: "address:Home", workaddress: "address:Work", businessaddress: "address:Work", address: "address:*", mailingaddress: "address:*",
  otherphones: "otherPhones", otheremails: "otherEmails", otheraddresses: "otherAddresses", otherlinks: "otherLinks",
  linkedin: "link:LinkedIn", linkedinurl: "link:LinkedIn", linkedinprofile: "link:LinkedIn", url: "link:LinkedIn",
  facebook: "link:Facebook", facebookurl: "link:Facebook", instagram: "link:Instagram", instagramurl: "link:Instagram",
  x: "link:X", twitter: "link:X", xtwitter: "link:X", tiktok: "link:TikTok", youtube: "link:YouTube",
  website: "link:Website", web: "link:Website", webpage: "link:Website", homepage: "link:Website", personalwebsite: "link:Website", website1value: "link:Website",
  keyfacts: "keyFacts", facts: "keyFacts", highlights: "keyFacts",
  tags: "tags", labels: "tags", groups: "tags", groupmembership: "tags",
  notes: "notes", note: "notes", comments: "notes",
  tab: "ignore", directory: "ignore",
};

/** Google's "Phone 1 - Value" + "Phone 1 - Label" pairs. */
const PAIR = /^(e-?mail|phone|address)\s*(\d+)\s*-\s*(value|formatted)$/i;
const PAIR_LABEL = (kind: string, n: string) => new RegExp(`^${kind.replace("-", "-?")}\\s*${n}\\s*-\\s*(label|type)$`, "i");

export function guessTargets(headers: string[], fields: CustomField[]): string[] {
  const custom = new Map(fields.filter((f) => !f.archived).map((f) => [norm(f.name), `custom:${f.id}`]));
  const labelCols = new Set<number>();
  headers.forEach((h, i) => { const m = h.trim().match(PAIR); if (m) { const j = headers.findIndex((x) => PAIR_LABEL(m[1], m[2]).test(x.trim())); if (j >= 0) labelCols.add(j); } });
  return headers.map((h, i) => {
    if (labelCols.has(i)) return "ignore";
    const m = h.trim().match(PAIR);
    if (m) return `${/mail/i.test(m[1]) ? "email" : m[1].toLowerCase()}:*`;
    const n = norm(h);
    return custom.get(n) ?? ALIASES[n] ?? "ignore";
  });
}

// ---------------------------------------------------------------- reading values
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const pad = (n: number) => String(n).padStart(2, "0");
const okDay = (m: number, d: number) => m >= 1 && m <= 12 && d >= 1 && d <= 31;
const month = (w: string) => MONTHS.indexOf(w.slice(0, 3).toLowerCase()) + 1;
const year4 = (y: string) => (y.length === 2 ? (Number(y) > 40 ? 1900 : 2000) + Number(y) : Number(y));

/** "2026-03-12", "3/12/2026", "12 Mar 2026", "March 12, 2026", "--06-04", "June 4" → "YYYY-MM-DD" or "MM-DD" (null if not a date). */
export function parseDate(raw: string, allowNoYear: boolean): string | null {
  const s = raw.trim().replace(/\s+/g, " ");
  if (!s) return "";
  let m: RegExpMatchArray | null;
  const out = (y: number | null, mo: number, d: number) => (okDay(mo, d) ? (y ? `${y}-${pad(mo)}-${pad(d)}` : allowNoYear ? `${pad(mo)}-${pad(d)}` : null) : null);
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/))) return out(Number(m[1]), Number(m[2]), Number(m[3]));
  if ((m = s.match(/^--(\d{1,2})-(\d{1,2})$/)) || (m = s.match(/^(\d{1,2})-(\d{1,2})$/))) return out(null, Number(m[1]), Number(m[2]));
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/))) return out(year4(m[3]), Number(m[1]), Number(m[2]));
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})$/))) return out(null, Number(m[1]), Number(m[2]));
  if ((m = s.match(/^(\d{1,2}) ([A-Za-z]{3,})\.?,? (\d{4})$/)) && month(m[2])) return out(Number(m[3]), month(m[2]), Number(m[1]));
  if ((m = s.match(/^([A-Za-z]{3,})\.? (\d{1,2})(?:st|nd|rd|th)?(?:,? (\d{4}))?$/)) && month(m[1])) return out(m[3] ? Number(m[3]) : null, month(m[1]), Number(m[2]));
  return null;
}

const splitList = (v: string) => v.split(/\s*(?:;|:::|\n)\s*/).map((x) => x.replace(/^\*\s*/, "").trim()).filter(Boolean);
/** "Office: 555-0100; Cell: 555-0101" → [{label, value}] */
const splitPairs = (v: string) => splitList(v).map((p) => { const i = p.indexOf(": "); return i > 0 && i < 40 && !/^https?$/i.test(p.slice(0, i)) ? { label: p.slice(0, i).trim(), value: p.slice(i + 2).trim() } : { label: "", value: p }; });
/** A label from a column heading: "Business Phone" → "Business", "Phone" → "". */
const labelFromHeader = (h: string) => h.replace(/\b(e-?mail|phone|number|telephone|tel|address|addresses|value|formatted)\b|\d+|[-_:]/gi, " ").replace(/\s+/g, " ").trim();

interface Draft {
  input: Record<string, unknown> & { firstName: string; lastName: string; contacts: { kind: string; label: string; value: string }[]; links: { label: string; url: string }[]; keyFacts: string[]; tags: string[]; custom: Record<string, string> };
  notes: string[];
  company: string;
  problems: string[];
}

function rowToDraft(row: string[], headers: string[], targets: string[], fields: CustomField[]): Draft {
  const d: Draft = { input: { firstName: "", lastName: "", contacts: [], links: [], keyFacts: [], tags: [], custom: {} }, notes: [], company: "", problems: [] };
  const byId = new Map(fields.map((f) => [f.id, f]));
  targets.forEach((t, i) => {
    const v = (row[i] ?? "").trim();
    if (!v || t === "ignore") return;
    const h = headers[i];
    const [kind, sub] = t.includes(":") ? [t.slice(0, t.indexOf(":")), t.slice(t.indexOf(":") + 1)] : [t, ""];
    if (kind === "phone" || kind === "email" || kind === "address") {
      let label = sub === "*" ? "" : sub;
      if (sub === "*") {
        const m = h.trim().match(PAIR);
        const j = m ? headers.findIndex((x) => PAIR_LABEL(m[1], m[2]).test(x.trim())) : -1;
        label = j >= 0 ? (row[j] ?? "").replace(/^\*\s*/, "").trim() : labelFromHeader(h);
        label = label.charAt(0).toUpperCase() + label.slice(1);
      }
      for (const value of kind === "address" ? [v] : splitList(v)) d.input.contacts.push({ kind, label, value });
    } else if (kind === "link") {
      d.input.links.push({ label: sub === "*" ? h.trim() : sub, url: v });
    } else if (t === "otherPhones" || t === "otherEmails" || t === "otherAddresses") {
      const k = t === "otherPhones" ? "phone" : t === "otherEmails" ? "email" : "address";
      for (const p of splitPairs(v)) d.input.contacts.push({ kind: k, label: p.label, value: p.value });
    } else if (t === "otherLinks") {
      for (const p of splitPairs(v)) d.input.links.push({ label: p.label || "Link", url: p.value });
    } else if (t === "keyFacts") d.input.keyFacts.push(...splitList(v));
    else if (t === "tags") d.input.tags.push(...splitList(v).map((x) => x.toLowerCase()).filter((x) => x !== "mycontacts" && x !== "starred"));
    else if (t === "notes") d.notes.push(...v.split(/\n-{3,}\n/));
    else if (t === "company") d.company = v;
    else if (kind === "custom") {
      const f = byId.get(sub); if (!f) return;
      if (f.type === "boolean") {
        const b = /^(y|yes|true|1|x|✓)$/i.test(v) ? "true" : /^(n|no|false|0)$/i.test(v) ? "false" : null;
        if (b === null) d.problems.push(`“${f.name}” is a yes/no field but says “${v}” — left empty`); else d.input.custom[sub] = b;
      } else d.input.custom[sub] = v;
    } else if (t === "birthday" || t === "dateMet") {
      const date = parseDate(v, t === "birthday");
      if (date === null) d.problems.push(`${t === "birthday" ? "Birthday" : "Date met"} “${v}” isn't a date — left empty`); else d.input[t] = date;
    } else d.input[t] = (d.input[t] ? `${d.input[t]} ` : "") + v;
  });
  if (d.company) {
    if (!d.input.description) d.input.description = [d.input.title, d.company].filter(Boolean).join(", ");
    else if (!String(d.input.description).includes(d.company)) d.input.description = `${d.input.description} · ${d.company}`;
  }
  return d;
}

// ---------------------------------------------------------------- parsing a file
export const EXAMPLE_NOTE = "Example row — delete it before importing";

function parseCsv(text: string): { headers: string[]; rows: { cells: string[]; line: number }[] } {
  const clean = String(text || "").replace(/^\uFEFF/, "");
  if (!clean.trim()) throw new UserError("That file is empty.");
  // blank lines are kept while parsing so row numbers match what Excel shows
  const r = Papa.parse<string[]>(clean, { skipEmptyLines: false });
  const data = r.data.map((cells, i) => ({ cells: cells.map((c) => String(c ?? "")), line: i + 1 })).filter((row) => row.cells.some((c) => c.trim()));
  // Some exports (LinkedIn's Connections.csv) put a few lines of notes above the headings:
  // the heading row is the first of the top ten that has a first-name column.
  const firstNameHeads = new Set(Object.entries(ALIASES).filter(([, t]) => t === "firstName").map(([k]) => k));
  const at = Math.max(0, data.slice(0, 10).findIndex((row) => row.cells.some((c) => firstNameHeads.has(norm(c)))));
  if (data.length - at < 2) throw new UserError("That file needs a heading row and at least one person.");
  const headers = data[at].cells.map((h) => h.trim());
  if (!headers.some(Boolean)) throw new UserError("The first row of the file should hold the column headings.");
  return { headers, rows: data.slice(at + 1) };
}

export interface PreviewColumn { index: number; header: string; target: string; sample: string }
export interface PreviewResult {
  columns: PreviewColumn[];
  targets: Target[];
  total: number; ready: number;
  skipped: { row: number; reason: string }[];
  duplicates: { row: number; name: string; where: "tab" | "file" }[];
  warnings: { row: number; message: string }[];
  sample: { row: number; name: string; description: string; contacts: number; links: number; tags: string[] }[];
  tab: string;
}

interface Analysed { preview: PreviewResult; drafts: { row: number; draft: Draft; duplicate: boolean }[] }

export class CsvPeople {
  constructor(private readonly svc: Service, private readonly backups: Backups) {}

  // ---------------------------------------------------------------- template & export
  async template(): Promise<string> {
    const fields = await this.svc.store.listFields();
    const cols = templateColumns(fields);
    const example: Record<string, string> = {
      firstName: "Susan", lastName: "Park", nickname: "Sue", description: "Owner, Park Family Dental", title: "Practice owner", profession: "Dentist",
      businessCategory: "Healthcare", "phone:Mobile": "(512) 555-0148", "phone:Work": "(512) 555-0190", "email:Work": "susan@parkfamilydental.example",
      "address:Work": "1200 Main St, Suite 4, Round Rock, TX 78664", "link:LinkedIn": "linkedin.com/in/susan-park-example", "link:Instagram": "instagram.com/parkfamilydental.example",
      businessWebsite: "parkfamilydental.example", businessDescription: "Family dentistry, 3 dentists", birthday: "06-04", dateMet: "2026-03-12",
      fromPlace: "Portland, Oregon", howMet: "Sat next to her at the Chamber lunch", generalDescription: "Tall, short silver hair, tortoiseshell glasses",
      ageRange: "40s", maritalStatus: "Married", kids: "2", pets: "Dog — Biscuit", keyFacts: "Prefers a text over email; Considering a second office",
      tags: "chamber-lunch; dental", notes: EXAMPLE_NOTE,
    };
    return this.toCsv([cols.map(([h]) => h), cols.map(([, t]) => (t.startsWith("custom:") ? "" : example[t] ?? ""))]);
  }

  async exportCsv(tabId?: Id | null): Promise<{ csv: string; count: number }> {
    const st = await this.svc.store.status();
    if (!st.ok) throw new UserError(`The data source is not ready: ${st.message}`, 409);
    const doc = await this.svc.store.exportAll();
    if (tabId && !doc.tabs.some((t) => t.id === tabId)) throw new UserError("That tab no longer exists.", 404);
    const cols = templateColumns(doc.customFields);
    const headers = [...cols.map(([h]) => h), "Other Phones", "Other Emails", "Other Addresses", "Other Links", "Tab", "Directory"];
    const tabs = [...doc.tabs].sort((a, b) => a.position - b.position);
    const dirPath = (id: Id | null): string => { const parts: string[] = []; let cur = doc.directories.find((d) => d.id === id); for (let g = 0; cur && g < 200; g++) { parts.unshift(cur.name); cur = doc.directories.find((d) => d.id === cur!.parentId); } return parts.join(" › "); };
    const rows: string[][] = [headers];
    const people = doc.people.filter((p) => !tabId || p.tabId === tabId)
      .sort((a, b) => tabs.findIndex((t) => t.id === a.tabId) - tabs.findIndex((t) => t.id === b.tabId) || dirPath(a.directoryId).localeCompare(dirPath(b.directoryId)) || a.position - b.position);
    for (const p of people) rows.push(this.personRow(p, cols, tabs.find((t) => t.id === p.tabId)?.name ?? "", dirPath(p.directoryId)));
    return { csv: this.toCsv(rows), count: people.length };
  }

  /** One person → the export's cells. Contacts and links that fit a named column go there; the rest go to Other…. */
  private personRow(p: Person, cols: [string, string][], tab: string, dir: string): string[] {
    const used = new Set<string>();
    const take = (kind: string, labels: RegExp) => { const c = p.contacts.find((x) => x.kind === kind && !used.has(x.id) && labels.test(x.label)); if (c) used.add(c.id); return c?.value ?? ""; };
    const slot: Record<string, string> = {
      "phone:Mobile": take("phone", /^(mobile|cell|iphone)/i), "phone:Work": take("phone", /^(work|office|business)/i), "phone:Home": take("phone", /^home/i),
      "email:Personal": take("email", /^(personal|home|private)/i), "email:Work": take("email", /^(work|office|business)/i),
      "address:Home": take("address", /^home/i), "address:Work": take("address", /^(work|office|business)/i),
    };
    const usedLinks = new Set<string>();
    for (const l of LINK_COLUMNS) {
      const link = p.links.find((x) => !usedLinks.has(x.id) && (x.label.toLowerCase() === l.toLowerCase() || (l === "X" && /^twitter$/i.test(x.label))));
      if (link) { usedLinks.add(link.id); slot[`link:${l}`] = link.url; }
    }
    const other = (kind: string) => p.contacts.filter((c) => c.kind === kind && !used.has(c.id)).map((c) => (c.label ? `${c.label}: ${c.value.replace(/\n/g, ", ")}` : c.value.replace(/\n/g, ", "))).join("; ");
    const cell = (t: string): string => {
      if (t in slot) return slot[t];
      if (t === "keyFacts") return p.keyFacts.join("; ");
      if (t === "tags") return p.tags.join("; ");
      if (t === "notes") return p.notes.map((n) => n.body).join("\n---\n");
      if (t.startsWith("custom:")) { const v = p.custom[t.slice(7)] ?? ""; return v === "true" ? "Yes" : v === "false" ? "No" : v; }
      return String((p as unknown as Record<string, unknown>)[t] ?? "");
    };
    return [...cols.map(([, t]) => cell(t)), other("phone"), other("email"), other("address"),
      p.links.filter((l) => !usedLinks.has(l.id)).map((l) => `${l.label || "Link"}: ${l.url}`).join("; "), tab, dir];
  }

  /** Excel-friendly: a byte-order mark so accents show correctly, and Windows line endings. */
  private toCsv(rows: string[][]): string { return "﻿" + Papa.unparse(rows, { newline: "\r\n" }); }

  // ---------------------------------------------------------------- preview & import
  private async analyse(csv: string, tabId: Id, mapping?: Record<string, string> | null): Promise<Analysed> {
    await this.svc.checkPlace(tabId, null);
    const tab = (await this.svc.store.listTabs()).find((t) => t.id === tabId)!;
    const fields = await this.svc.store.listFields();
    const { headers, rows } = parseCsv(csv);
    const targets = allTargets(fields);
    const valid = new Set(targets.map((t) => t.key));
    const guessed = guessTargets(headers, fields);
    const chosen = headers.map((_, i) => { const m = mapping?.[String(i)]; return m && valid.has(m) ? m : guessed[i]; });
    if (!chosen.includes("firstName")) throw new UserError("No column is set to First name — it is the only column an import needs. Pick it in the list below.", 422, { headers, targets, guessed: chosen });

    const existing = new Set((await this.svc.store.listPeople({ tabId })).map((p) => fold(displayName({ ...p, nickname: "" }))));
    const seen = new Map<string, number>();
    const preview: PreviewResult = { columns: headers.map((h, i) => ({ index: i, header: h, target: chosen[i], sample: rows.find((r) => (r.cells[i] ?? "").trim())?.cells[i]?.trim().slice(0, 80) ?? "" })),
      targets, total: rows.length, ready: 0, skipped: [], duplicates: [], warnings: [], sample: [], tab: tab.name };
    const drafts: Analysed["drafts"] = [];
    rows.forEach(({ cells, line }) => {
      const d = rowToDraft(cells, headers, chosen, fields);
      if (d.notes.some((n) => n.trim() === EXAMPLE_NOTE)) { preview.skipped.push({ row: line, reason: "the template's example row" }); return; }
      if (!String(d.input.firstName).trim()) { preview.skipped.push({ row: line, reason: "no first name" }); return; }
      for (const p of d.problems) preview.warnings.push({ row: line, message: p });
      const key = fold(`${d.input.firstName} ${d.input.lastName}`.trim());
      let duplicate = false;
      if (existing.has(key)) { preview.duplicates.push({ row: line, name: `${d.input.firstName} ${d.input.lastName}`.trim(), where: "tab" }); duplicate = true; }
      else if (seen.has(key)) { preview.duplicates.push({ row: line, name: `${d.input.firstName} ${d.input.lastName}`.trim(), where: "file" }); }
      seen.set(key, line);
      drafts.push({ row: line, draft: d, duplicate });
      if (preview.sample.length < 10) preview.sample.push({ row: line, name: displayName({ firstName: String(d.input.firstName), lastName: String(d.input.lastName), nickname: String(d.input.nickname ?? "") }),
        description: String(d.input.description ?? ""), contacts: d.input.contacts.length, links: d.input.links.length, tags: d.input.tags });
    });
    preview.ready = drafts.length;
    return { preview, drafts };
  }

  async preview(csv: string, tabId: Id, mapping?: Record<string, string> | null): Promise<PreviewResult> {
    return (await this.analyse(csv, tabId, mapping)).preview;
  }

  /** Add the people. Backs up first; returns what it did and an id to undo it. */
  async import(opts: { csv: string; tabId: Id; mapping?: Record<string, string> | null; newDirectory?: string | null; skipDuplicates?: boolean; fileName?: string }) {
    const { preview, drafts } = await this.analyse(opts.csv, opts.tabId, opts.mapping);
    const keep = drafts.filter((d) => !(opts.skipDuplicates && d.duplicate));
    if (!keep.length) throw new UserError("There is nobody to import — every row was skipped.", 422);
    const backup = await this.backups.create();
    let directoryId: Id | null = null;
    const dirName = String(opts.newDirectory || "").trim();
    if (dirName) directoryId = (await this.svc.createDirectory({ tabId: opts.tabId, name: dirName, description: `Imported from ${opts.fileName || "a CSV file"} on ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` })).id;
    const start = await this.svc.store.countPeople({ tabId: opts.tabId, directoryId });
    const people: Person[] = [];
    const failed: { row: number; reason: string }[] = [];
    for (const [i, d] of keep.entries()) {
      try { people.push(await this.svc.buildPerson(d.draft.input, opts.tabId, directoryId, start + people.length, d.draft.notes)); }
      catch (e) { failed.push({ row: d.row, reason: (e as Error).message }); }
      void i;
    }
    await this.svc.addPeople(people);
    const record: ImportRecord = { id: newId(), at: now(), file: opts.fileName || "", tabId: opts.tabId, tab: preview.tab, directoryId, directory: dirName || null,
      people: people.map((p) => p.id), backup: backup.name };
    this.saveRecord(record);
    return { importId: record.id, added: people.length, skipped: preview.skipped.length + (drafts.length - keep.length) + failed.length, failed, warnings: preview.warnings.length,
      tab: preview.tab, directory: dirName || null, directoryId, backup: backup.name };
  }

  // ---------------------------------------------------------------- undo
  private recordsFile(): string { return path.join(this.backups.dir(), "csv-imports.json"); }
  private records(): ImportRecord[] { try { return JSON.parse(fs.readFileSync(this.recordsFile(), "utf8")); } catch { return []; } }
  private saveRecord(r: ImportRecord) { writeAtomic(this.recordsFile(), JSON.stringify([r, ...this.records()].slice(0, 20), null, 1)); }

  recent(): (Omit<ImportRecord, "people"> & { count: number; undone: boolean })[] {
    return this.records().map(({ people, ...r }) => ({ ...r, count: people.length, undone: !!r.undoneAt }));
  }

  /** Remove exactly the people an import added (those still there), and its new directory if it is now empty. */
  async undo(id: string): Promise<{ removed: number; directoryRemoved: boolean }> {
    const all = this.records();
    const r = all.find((x) => x.id === id);
    if (!r) throw new UserError("That import is not in the list any more.", 404);
    if (r.undoneAt) throw new UserError("That import has already been undone.", 409);
    let removed = 0;
    for (const pid of r.people) { if (await this.svc.store.getPerson(pid)) { await this.svc.deletePerson(pid); removed++; } }
    let directoryRemoved = false;
    if (r.directoryId && (await this.svc.store.getDirectory(r.directoryId))) {
      try { await this.svc.deleteDirectory(r.directoryId); directoryRemoved = true; } catch { /* someone was moved in or it got sub-directories — leave it */ }
    }
    r.undoneAt = now();
    writeAtomic(this.recordsFile(), JSON.stringify(all, null, 1));
    return { removed, directoryRemoved };
  }
}

export interface ImportRecord {
  id: string; at: string; file: string; tabId: Id; tab: string; directoryId: Id | null; directory: string | null; people: Id[]; backup: string; undoneAt?: string;
}
