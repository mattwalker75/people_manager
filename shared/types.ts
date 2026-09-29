/**
 * The data model shared by the server and the browser.
 *
 * Every record has a string id (12 random characters) rather than a
 * database auto-number, so the same ids survive a move between the JSON
 * file, SQLite and MySQL (export → import keeps them), and photo folders
 * (data/images/<personId>/) stay attached to the right person.
 */
export type Id = string;

export interface Tab {
  id: Id;
  name: string;
  position: number;
}

export interface Directory {
  id: Id;
  tabId: Id;
  /** null = sits at the top level of its tab */
  parentId: Id | null;
  name: string;
  description: string;
  position: number;
}

export type ContactKind = "phone" | "email" | "address";

export interface ContactItem {
  id: Id;
  kind: ContactKind;
  /** the user's own label, e.g. "Mobile", "Office" (may be blank) */
  label: string;
  value: string;
}

export interface LinkItem {
  id: Id;
  label: string;
  url: string;
}

export interface Note {
  id: Id;
  body: string;
  createdAt: string; // ISO timestamp
  updatedAt: string;
}

export interface Photo {
  id: Id;
  /** file name inside data/images/<personId>/ */
  filename: string;
  createdAt: string;
}

export type CustomFieldType = "boolean" | "text" | "paragraph";

export interface CustomField {
  id: Id;
  name: string;
  type: CustomFieldType;
  position: number;
  /** archived fields are hidden everywhere but keep their values */
  archived: boolean;
}

/** Every text field a person can have. Only firstName is required. */
export interface PersonFields {
  firstName: string;
  lastName: string;
  nickname: string;
  /** the one-line description shown under the name */
  description: string;
  title: string;
  profession: string;
  businessCategory: string;
  ageRange: string;
  maritalStatus: string;
  kids: string;
  pets: string;
  familyNotes: string;
  /** "" | "MM-DD" (no year) | "YYYY-MM-DD" */
  birthday: string;
  /** "" | "YYYY-MM-DD" */
  dateMet: string;
  fromPlace: string;
  howMet: string;
  generalDescription: string;
  businessWebsite: string;
  businessDescription: string;
}

export interface Person extends PersonFields {
  id: Id;
  tabId: Id;
  /** null = sits at the top level of its tab */
  directoryId: Id | null;
  position: number;
  keyFacts: string[];
  contacts: ContactItem[];
  links: LinkItem[];
  notes: Note[];
  photos: Photo[];
  mainPhotoId: Id | null;
  /** lower-case, free-form; searched but never shown on the card */
  tags: string[];
  /** custom field id → value ("true"/"false" for yes/no fields) */
  custom: Record<Id, string>;
  createdAt: string;
  updatedAt: string;
}

/** What a card in the directory view needs. */
export interface PersonSummary {
  id: Id;
  tabId: Id;
  directoryId: Id | null;
  position: number;
  firstName: string;
  lastName: string;
  nickname: string;
  description: string;
  photo: { id: Id; filename: string } | null;
}

export interface SearchResult extends PersonSummary {
  /** "Clients › Active clients › Healthcare" */
  path: string;
  /** set when the person matched only through a tag */
  matchedTag: string | null;
}

/** The portable format: the JSON data source, exports, imports and backups all use it. */
export interface PeopleDocument {
  format: "people-manager";
  version: 1;
  exportedAt: string;
  tabs: Tab[];
  directories: Directory[];
  people: Person[];
  customFields: CustomField[];
}

export type DataSourceType = "json" | "sqlite" | "mysql";

export interface DataSourceStatus {
  type: DataSourceType;
  ok: boolean;
  /** plain-English state for the Settings page */
  message: string;
  /** true when the source exists but has no tables yet (SQLite/MySQL) */
  needsBuild: boolean;
  counts?: { tabs: number; directories: number; people: number };
}

export const AGE_RANGES = ["Under 20", "20s", "30s", "40s", "50s", "60s", "70s", "80+"];
export const MARITAL_STATUSES = ["Single", "In a relationship", "Engaged", "Married", "Separated", "Divorced", "Widowed"];

export const EMPTY_FIELDS: PersonFields = {
  firstName: "", lastName: "", nickname: "", description: "", title: "", profession: "", businessCategory: "",
  ageRange: "", maritalStatus: "", kids: "", pets: "", familyNotes: "", birthday: "", dateMet: "", fromPlace: "",
  howMet: "", generalDescription: "", businessWebsite: "", businessDescription: "",
};
export const PERSON_FIELD_KEYS = Object.keys(EMPTY_FIELDS) as (keyof PersonFields)[];

/** "Susan Park" — first and last name; the nickname is shown separately in brackets. */
export function fullName(p: { firstName: string; lastName: string }): string {
  return `${p.firstName} ${p.lastName}`.trim();
}

/** "Susan Park (Sue)" — brackets only when there is a nickname. */
export function displayName(p: { firstName: string; lastName: string; nickname: string }): string {
  return p.nickname ? `${fullName(p)} (${p.nickname})` : fullName(p);
}

/** Lower-case and strip accents, so "tomas" finds "Tomás". */
export function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** The text a name search looks through: "susan park sue". */
export function nameSearchText(p: { firstName: string; lastName: string; nickname: string }): string {
  return fold([p.firstName, p.lastName, p.nickname].filter(Boolean).join(" "));
}
