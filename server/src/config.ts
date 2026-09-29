/**
 * config.json — every setting the app has. Settings in the UI reads and
 * writes this same file, so editing it by hand and editing it in the app are
 * the same thing. Missing keys fall back to DEFAULTS (a deep merge), unknown
 * keys (including "_comment" notes) are kept, and the file is written
 * atomically with owner-only permissions because it can hold a MySQL
 * password.
 *
 * Paths inside it are relative to the folder config.json lives in.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface CustomTheme {
  id: string;
  name: string;
  dark: boolean;
  tokens: Record<string, string>;
}

export interface AppConfig {
  server: { port: number; allowNetwork: boolean };
  security: { loginEnabled: boolean; passwordFile: string; sessionHours: number };
  dataSource: {
    type: "json" | "sqlite" | "mysql";
    json: { path: string };
    sqlite: { path: string };
    mysql: { host: string; port: number; database: string; user: string; password: string };
  };
  photos: { dir: string; maxPerPerson: number };
  appearance: { theme: string; customThemes: CustomTheme[] };
  backups: { dir: string };
}

export const DEFAULTS: AppConfig = {
  server: { port: 8400, allowNetwork: false },
  security: { loginEnabled: false, passwordFile: "./.password", sessionHours: 12 },
  dataSource: {
    type: "json",
    json: { path: "./data/people.json" },
    sqlite: { path: "./data/people.db" },
    mysql: { host: "localhost", port: 3306, database: "people_manager", user: "pm_app", password: "" },
  },
  photos: { dir: "./data/images", maxPerPerson: 5 },
  appearance: { theme: "light", customThemes: [] },
  backups: { dir: "./data/backups" },
};

/** Settings that only take effect after ./PEOPLE.sh --restart. */
export const RESTART_REQUIRED = ["server.port", "server.allowNetwork"];

export const MASK = "••••••••";

/** The repository folder: the nearest parent holding this app's package.json. */
function findRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    const pkg = path.join(dir, "package.json");
    if (fs.existsSync(pkg)) {
      try { if (JSON.parse(fs.readFileSync(pkg, "utf8")).name === "people-manager") return dir; } catch {}
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}
export const ROOT = findRoot();

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

export function deepMerge<T>(base: T, over: unknown): T {
  if (!isObj(base) || !isObj(over)) return (over === undefined ? base : over) as T;
  const out: Obj = { ...(base as Obj) };
  for (const [k, v] of Object.entries(over)) out[k] = k in out ? deepMerge(out[k], v) : v;
  return out as T;
}

function getPath(o: unknown, dotted: string): unknown {
  return dotted.split(".").reduce<unknown>((a, k) => (isObj(a) ? a[k] : undefined), o);
}

export class Config {
  readonly file: string;
  private data: AppConfig = structuredClone(DEFAULTS);
  /** keys changed since the server started that need a restart */
  private pending = new Set<string>();
  private readonly startedWith: AppConfig;

  constructor(file = process.env.PM_CONFIG || path.join(ROOT, "config.json")) {
    this.file = path.resolve(file);
    this.load();
    this.startedWith = structuredClone(this.data);
  }

  get dir(): string { return path.dirname(this.file); }
  get(): AppConfig { return this.data; }

  /** Resolve a path setting against the config file's folder (~ = home). */
  resolve(p: string): string {
    if (p.startsWith("~")) p = path.join(process.env.HOME || "", p.slice(1));
    return path.resolve(this.dir, p);
  }

  load(): void {
    let raw: unknown = {};
    if (fs.existsSync(this.file)) {
      try { raw = JSON.parse(fs.readFileSync(this.file, "utf8")); }
      catch (e) { throw new Error(`config.json is not valid JSON (${(e as Error).message}). Fix it or delete it to start from the defaults.`); }
    }
    this.data = deepMerge(structuredClone(DEFAULTS), raw);
  }

  save(): void {
    fs.mkdirSync(this.dir, { recursive: true });
    const tmp = this.file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2) + "\n", { mode: 0o600 });
    fs.renameSync(tmp, this.file);
    try { fs.chmodSync(this.file, 0o600); } catch {}
  }

  /**
   * Merge a partial change in and save. A masked MySQL password means
   * "unchanged". Returns which of the changed keys need a restart.
   */
  update(patch: unknown): { restartRequired: string[] } {
    const p = structuredClone(patch) as Obj;
    const mysql = getPath(p, "dataSource.mysql") as Obj | undefined;
    if (mysql && mysql.password === MASK) delete mysql.password;
    this.data = deepMerge(this.data, p);
    this.save();
    for (const k of RESTART_REQUIRED) {
      if (JSON.stringify(getPath(this.data, k)) !== JSON.stringify(getPath(this.startedWith, k))) this.pending.add(k);
      else this.pending.delete(k);
    }
    return { restartRequired: [...this.pending] };
  }

  restartRequired(): string[] { return [...this.pending]; }

  /** The config as the browser sees it: the MySQL password masked. */
  redacted(): AppConfig {
    const c = structuredClone(this.data);
    if (c.dataSource.mysql.password) c.dataSource.mysql.password = MASK;
    return c;
  }

  /** The config as a backup stores it: the MySQL password removed. */
  withoutSecrets(): AppConfig {
    const c = structuredClone(this.data);
    c.dataSource.mysql.password = "";
    return c;
  }
}
