/**
 * The storage contract. Three implementations — JSON file, SQLite and MySQL —
 * sit behind it; everything above (service.ts, the routes) is written once
 * against this interface. Stores are deliberately dumb: they read and write
 * records. Rules (a tab must be empty to delete, positions, search matching,
 * paths) live in service.ts.
 */
import type {
  CustomField, DataSourceStatus, DataSourceType, Directory, Id, PeopleDocument, Person, PersonSummary, Tab,
} from "../../../shared/types.js";

export interface PeopleWhere {
  tabId?: Id;
  /** undefined = any directory; null = the top level of the tab */
  directoryId?: Id | null;
  ids?: Id[];
}

export interface Placement { id: Id; tabId: Id; position: number }
export interface PersonPlacement extends Placement { directoryId: Id | null }
export interface DirectoryPlacement extends Placement { parentId: Id | null }

export interface SearchHit extends PersonSummary { tags: string[] }

export interface Store {
  readonly type: DataSourceType;
  /** Connect / load. Never throws for "not built yet" — status() says so. */
  open(): Promise<void>;
  status(): Promise<DataSourceStatus>;
  /** True when the target already holds tables (SQL) or data (JSON). */
  hasSchema(): Promise<boolean>;
  /** Create the tables (SQL) or an empty file (JSON). Refuses over existing ones unless rebuild. */
  build(rebuild: boolean): Promise<void>;
  close(): Promise<void>;

  listTabs(): Promise<Tab[]>;
  insertTab(t: Tab): Promise<void>;
  updateTab(id: Id, patch: Partial<Omit<Tab, "id">>): Promise<void>;
  deleteTab(id: Id): Promise<void>;

  listDirectories(tabId?: Id): Promise<Directory[]>;
  getDirectory(id: Id): Promise<Directory | null>;
  insertDirectory(d: Directory): Promise<void>;
  updateDirectory(id: Id, patch: Partial<Omit<Directory, "id">>): Promise<void>;
  deleteDirectory(id: Id): Promise<void>;
  placeDirectories(p: DirectoryPlacement[]): Promise<void>;

  /** Summaries ordered by position. */
  listPeople(where: PeopleWhere): Promise<PersonSummary[]>;
  countPeople(where: PeopleWhere): Promise<number>;
  getPerson(id: Id): Promise<Person | null>;
  insertPerson(p: Person): Promise<void>;
  /** Replace the whole record: fields, facts, contacts, links, notes, photos, tags, custom values. */
  savePerson(p: Person): Promise<void>;
  deletePerson(id: Id): Promise<void>;
  placePeople(p: PersonPlacement[]): Promise<void>;
  /** People whose name, nickname or a tag contains `folded` (already lower-case, accents removed). */
  searchPeople(folded: string, limit: number): Promise<SearchHit[]>;

  listFields(): Promise<CustomField[]>;
  insertField(f: CustomField): Promise<void>;
  updateField(id: Id, patch: Partial<Omit<CustomField, "id">>): Promise<void>;
  deleteField(id: Id): Promise<void>;
  /** Everyone who has a non-empty value in this field. */
  fieldUsage(fieldId: Id): Promise<{ personId: Id; value: string }[]>;
  clearFieldValues(fieldId: Id): Promise<number>;

  exportAll(): Promise<PeopleDocument>;
  /** Wipe everything and load `doc` in one go. */
  replaceAll(doc: PeopleDocument): Promise<void>;
  /** Add everything in `doc` (its ids must not already exist). */
  appendAll(doc: PeopleDocument): Promise<void>;
}

/** The text search looks through for a person: names + nickname + tags, folded. */
export { nameSearchText } from "../../../shared/types.js";
