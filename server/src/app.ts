/**
 * The HTTP app: security middleware, the optional login, every /api route,
 * photo files, and the built web UI. `createApp` is used by index.ts and by
 * the tests (which run it on a spare port against scratch data).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import cookieSession from "cookie-session";
import helmet from "helmet";
import multer from "multer";
import { rateLimit } from "express-rate-limit";
import type { DataSourceType } from "../../shared/types.js";
import { Auth, type SessionData } from "./auth.js";
import { Backups } from "./backups.js";
import { Config, ROOT, deepMerge } from "./config.js";
import { CsvPeople } from "./csv.js";
import { hostGuard, networkUrls, sameOriginWrites } from "./security.js";
import { Service } from "./service.js";
import { createStore } from "./store/index.js";
import { exportTo, importFile, readJsonFile, validateDocument } from "./transfer.js";
import { stamp, UserError } from "./util.js";

export const VERSION: string = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version;

type Handler = (req: Request, res: Response) => unknown;
/** Wrap a route so a thrown UserError becomes { error } with its status, and anything else a logged 500. */
const h = (fn: Handler) => async (req: Request, res: Response, next: NextFunction) => {
  try { const out = await fn(req, res); if (!res.headersSent) res.json(out ?? { ok: true }); } catch (e) { next(e); }
};
const param = (req: Request, k: string) => String(req.params[k]);

export interface AppHandle { app: express.Express; service: Service; auth: Auth; backups: Backups; csv: CsvPeople; config: Config }

export async function createApp(config = new Config(), opts: { rateLimit?: boolean } = {}): Promise<AppHandle> {
  const service = new Service(config);
  await service.useConfiguredSource();
  const auth = new Auth(config);
  const backups = new Backups(service);
  const csv = new CsvPeople(service, backups);
  const app = express();
  app.disable("x-powered-by");
  app.set("etag", false);

  app.use(hostGuard(config));
  app.use(helmet({
    contentSecurityPolicy: { useDefaults: true, directives: {
      "default-src": ["'self'"], "img-src": ["'self'", "data:", "blob:"], "style-src": ["'self'", "'unsafe-inline'"],
      "font-src": ["'self'", "data:"], "connect-src": ["'self'"], "script-src": ["'self'"], "upgrade-insecure-requests": null,
    } },
    strictTransportSecurity: false, // plain http on a home network must keep working
  }));
  app.use("/api/csv", express.json({ limit: "30mb" })); // a spreadsheet of thousands of people
  app.use(express.json({ limit: "5mb" }));
  app.use(cookieSession({ name: "pm_session", keys: [crypto.randomBytes(32).toString("hex")], httpOnly: true, sameSite: "strict",
    maxAge: Math.max(1, config.get().security.sessionHours) * 3600_000 }));
  app.use(sameOriginWrites);

  const limiter = opts.rateLimit === false ? (_r: Request, _s: Response, n: NextFunction) => n()
    : rateLimit({ windowMs: 5 * 60_000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { error: "Too many attempts. Wait five minutes and try again." } });

  // ---------------------------------------------------------------- open routes
  app.get("/api/health", (_req, res) => { res.json({ ok: true, version: VERSION }); });
  app.get("/api/auth/me", h((req) => auth.state(req)));
  app.post("/api/auth/setup", limiter, h(async (req) => {
    if (!auth.enabled()) throw new UserError("The login is turned off — turn it on in Settings → Security first.", 409);
    const name = await auth.setup(req.body?.loginName, req.body?.password);
    (req.session as SessionData).loginName = name;
    return auth.state(req);
  }));
  app.post("/api/auth/login", limiter, h(async (req) => {
    const name = await auth.login(req.body?.loginName, req.body?.password);
    (req.session as SessionData).loginName = name;
    return auth.state(req);
  }));
  app.post("/api/auth/logout", h((req) => { req.session = null; return { ok: true }; }));

  // ---------------------------------------------------------------- everything else needs a login when the login is on
  app.use(["/api", "/photos"], (req, res, next) => {
    if (auth.allowed(req)) return next();
    res.status(401).json({ error: "Sign in first.", auth: auth.state(req) });
  });

  app.get("/api/state", h(async (req) => {
    const c = config.get();
    return { version: VERSION, auth: auth.state(req), config: config.redacted(), restartRequired: config.restartRequired(), configFile: config.file,
      dataSource: await service.store.status(), passwordFile: auth.file(), photosDir: service.photosDir(), backupsDir: backups.dir(),
      networkUrls: c.server.allowNetwork ? networkUrls(c.server.port) : [] };
  }));

  // ---------------------------------------------------------------- tabs
  app.get("/api/tabs", h(() => service.listTabs()));
  app.post("/api/tabs", h((req) => service.createTab(req.body?.name)));
  app.patch("/api/tabs/:id", h((req) => service.renameTab(param(req, "id"), req.body?.name)));
  app.delete("/api/tabs/:id", h(async (req) => { await service.deleteTab(param(req, "id")); }));
  app.post("/api/tabs/reorder", h((req) => service.reorderTabs(req.body?.ids || [])));

  // ---------------------------------------------------------------- directories
  app.get("/api/tabs/:id/directories", h((req) => service.listDirectories(param(req, "id"))));
  app.post("/api/directories", h((req) => service.createDirectory(req.body || {})));
  app.patch("/api/directories/:id", h((req) => service.updateDirectory(param(req, "id"), req.body || {})));
  app.delete("/api/directories/:id", h(async (req) => { await service.deleteDirectory(param(req, "id")); }));
  app.post("/api/directories/:id/move", h(async (req) => { await service.moveDirectory(param(req, "id"), req.body || {}); }));

  // ---------------------------------------------------------------- people
  app.get("/api/people", h((req) => {
    const tabId = String(req.query.tabId || "");
    if (!tabId) throw new UserError("Which tab?");
    const d = String(req.query.directoryId || "");
    return service.listPeople(tabId, d && d !== "root" ? d : null);
  }));
  app.get("/api/people/:id", h((req) => service.getPerson(param(req, "id"))));
  app.post("/api/people", h((req) => service.createPerson(req.body || {})));
  app.put("/api/people/:id", h((req) => service.updatePerson(param(req, "id"), req.body || {})));
  app.delete("/api/people/:id", h(async (req) => { await service.deletePerson(param(req, "id")); }));
  app.post("/api/people/:id/move", h(async (req) => { await service.movePerson(param(req, "id"), req.body || {}); }));
  app.post("/api/people/:id/notes", h((req) => service.addNote(param(req, "id"), req.body?.body)));
  app.patch("/api/people/:id/notes/:noteId", h((req) => service.editNote(param(req, "id"), param(req, "noteId"), req.body?.body)));
  app.delete("/api/people/:id/notes/:noteId", h(async (req) => { await service.deleteNote(param(req, "id"), param(req, "noteId")); }));

  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 1 } });
  app.post("/api/people/:id/photos", upload.single("photo"), h((req) => {
    if (!req.file) throw new UserError("Choose a photo to upload.");
    return service.addPhoto(param(req, "id"), req.file);
  }));
  app.delete("/api/people/:id/photos/:photoId", h((req) => service.deletePhoto(param(req, "id"), param(req, "photoId"))));
  app.post("/api/people/:id/photos/:photoId/main", h((req) => service.setMainPhoto(param(req, "id"), param(req, "photoId"))));
  app.get("/photos/:personId/:filename", (req, res) => {
    const f = service.photoFile(param(req, "personId"), param(req, "filename"));
    if (!f) { res.status(404).end(); return; }
    res.set("cache-control", "private, max-age=3600");
    res.sendFile(f);
  });

  app.get("/api/search", h((req) => service.search(String(req.query.q || ""))));
  app.get("/api/categories", h(() => service.store.distinctCategories()));

  // ---------------------------------------------------------------- custom fields
  app.get("/api/fields", h(() => service.listFields()));
  app.post("/api/fields", h((req) => service.createField(req.body || {})));
  app.post("/api/fields/reorder", h((req) => service.reorderFields(req.body?.ids || [])));
  app.patch("/api/fields/:id", h((req) => service.updateField(param(req, "id"), req.body || {})));
  app.get("/api/fields/:id/usage", h((req) => service.fieldUsage(param(req, "id"))));
  app.delete("/api/fields/:id", h((req) => {
    const purge = !!req.body?.purge;
    if (purge && req.body?.confirm !== "DELETE") throw new UserError("Type DELETE to confirm removing this field and its values.");
    return service.deleteField(param(req, "id"), purge);
  }));

  // ---------------------------------------------------------------- settings
  app.get("/api/settings", h(() => ({ config: config.redacted(), restartRequired: config.restartRequired(), configFile: config.file })));
  app.put("/api/settings", h(async (req) => {
    const patch = settingsPatch(req.body);
    const before = JSON.stringify(config.get().dataSource);
    const r = config.update(patch);
    if (JSON.stringify(config.get().dataSource) !== before) await service.useConfiguredSource();
    return { config: config.redacted(), restartRequired: r.restartRequired, dataSource: await service.store.status() };
  }));

  // ---------------------------------------------------------------- data source
  app.get("/api/datasource", h(() => service.store.status()));
  /** Try a data-source setting without switching to it. */
  app.post("/api/datasource/test", h(async (req) => {
    const ds = deepMerge(structuredClone(config.get().dataSource), settingsPatch({ dataSource: req.body || {} }).dataSource ?? {});
    const store = createStore(ds, (p) => config.resolve(p));
    try { await store.open(); return await store.status(); } finally { await store.close(); }
  }));
  app.post("/api/datasource/build", h(async (req) => {
    const rebuild = !!req.body?.rebuild;
    if (rebuild && req.body?.confirm !== "REBUILD") throw new UserError("Type REBUILD to confirm — rebuilding erases everything in this data source.");
    await service.store.build(rebuild);
    return service.store.status();
  }));

  // ---------------------------------------------------------------- import / export
  const pathArg = (v: unknown, fallback: string) => config.resolve(String(v || "").trim() || fallback);
  app.post("/api/import/validate", h((req) => {
    const file = pathArg(req.body?.file, config.get().dataSource.json.path);
    return validateDocument(readJsonFile(file), service.photosDir(), file).report;
  }));
  app.post("/api/import", h((req) => {
    const mode = req.body?.mode === "add" ? "add" : "replace";
    if (mode === "replace" && req.body?.confirm !== "REPLACE") throw new UserError("Type REPLACE to confirm — this replaces everything in the current data source.");
    return importFile(service, pathArg(req.body?.file, config.get().dataSource.json.path), mode);
  }));
  app.post("/api/export", h((req) => exportTo(service, pathArg(req.body?.file, `./data/export-${stamp()}.json`))));
  app.get("/api/export/download", h(async (_req, res) => {
    const doc = await service.store.exportAll();
    res.set("content-disposition", `attachment; filename="people-export-${stamp()}.json"`);
    res.type("application/json").send(JSON.stringify(doc, null, 1));
  }));

  // ---------------------------------------------------------------- backups
  app.get("/api/backups", h(() => ({ dir: backups.dir(), backups: backups.list() })));
  app.post("/api/backups", h(() => backups.create()));
  app.get("/api/backups/:name/download", (req, res, next) => { try { res.download(backups.fileFor(param(req, "name"))); } catch (e) { next(e); } });
  app.delete("/api/backups/:name", h((req) => { backups.remove(param(req, "name")); }));
  app.post("/api/backups/:name/restore", h((req) => {
    if (req.body?.confirm !== "RESTORE") throw new UserError("Type RESTORE to confirm — restoring replaces all current data.");
    return backups.restore(fs.readFileSync(backups.fileFor(param(req, "name"))));
  }));
  app.post("/api/backups/restore-upload", express.raw({ type: () => true, limit: "200mb" }), h((req) => {
    if (req.headers["x-confirm"] !== "RESTORE") throw new UserError("Type RESTORE to confirm — restoring replaces all current data.");
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw new UserError("Choose a backup file first.");
    return backups.restore(req.body);
  }));

  // ---------------------------------------------------------------- people as CSV (spreadsheets)
  const csvDownload = (res: Response, name: string, body: string) => {
    res.set("content-type", "text/csv; charset=utf-8");
    res.set("content-disposition", `attachment; filename="${name}"`);
    res.send(body);
  };
  app.get("/api/csv/template", h(async (_req, res) => csvDownload(res, "people-template.csv", await csv.template())));
  app.get("/api/csv/export", h(async (req, res) => {
    const tabId = String(req.query.tabId || "") || null;
    const tab = tabId ? (await service.listTabs()).find((t) => t.id === tabId)?.name : null;
    const r = await csv.exportCsv(tabId);
    csvDownload(res, `people-${tab ? tab.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" : ""}${stamp()}.csv`, r.csv);
  }));
  app.post("/api/csv/preview", h((req) => csv.preview(String(req.body?.csv ?? ""), String(req.body?.tabId || ""), req.body?.mapping)));
  app.post("/api/csv/import", h((req) => csv.import({ csv: String(req.body?.csv ?? ""), tabId: String(req.body?.tabId || ""), mapping: req.body?.mapping,
    newDirectory: req.body?.newDirectory || null, skipDuplicates: !!req.body?.skipDuplicates, fileName: String(req.body?.fileName || "").slice(0, 200) })));
  app.get("/api/csv/imports", h(() => csv.recent()));
  app.post("/api/csv/imports/:id/undo", h((req) => csv.undo(param(req, "id"))));

  app.use("/api", (_req, res) => { res.status(404).json({ error: "No such action." }); });

  // ---------------------------------------------------------------- the web UI
  const web = path.join(ROOT, "dist", "web");
  app.use(express.static(web, { index: false, maxAge: "1h", setHeaders: (res, f) => { if (f.endsWith(".html")) res.set("cache-control", "no-cache"); } }));
  app.get(/^\/(?!api\/|photos\/).*/, (_req, res) => {
    const index = path.join(web, "index.html");
    if (fs.existsSync(index)) { res.set("cache-control", "no-cache"); res.sendFile(index); }
    else res.status(503).type("text").send("The web interface is not built yet. Run ./INSTALL_APP.sh (or npm run build).");
  });

  // ---------------------------------------------------------------- errors
  app.use((e: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (e instanceof UserError) { res.status(e.status).json({ error: e.message, details: e.details }); return; }
    const err = e as { type?: string; code?: string; message?: string; status?: number };
    if (err.type === "entity.parse.failed") { res.status(400).json({ error: "The request was not valid JSON." }); return; }
    if (err.code === "LIMIT_FILE_SIZE") { res.status(413).json({ error: "That photo is larger than 20 MB." }); return; }
    console.error("[error]", e);
    res.status(500).json({ error: `Something went wrong: ${err.message || e}` });
  });

  return { app, service, auth, backups, csv, config };
}

/** Only the settings a person may change, with types coerced. */
function settingsPatch(body: unknown): Partial<ReturnType<Config["get"]>> {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, Record<string, unknown>>;
  const out: Record<string, unknown> = {};
  const num = (v: unknown, min: number, max: number, what: string) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) throw new UserError(`${what} must be a whole number from ${min} to ${max}.`);
    return n;
  };
  const text = (v: unknown, what: string) => { const s = String(v ?? "").trim(); if (!s) throw new UserError(`${what} can't be empty.`); return s; };
  if (b.server) {
    const s: Record<string, unknown> = {};
    if ("port" in b.server) s.port = num(b.server.port, 1024, 65535, "The port");
    if ("allowNetwork" in b.server) s.allowNetwork = !!b.server.allowNetwork;
    out.server = s;
  }
  if (b.security) {
    const s: Record<string, unknown> = {};
    if ("loginEnabled" in b.security) s.loginEnabled = !!b.security.loginEnabled;
    if ("passwordFile" in b.security) s.passwordFile = text(b.security.passwordFile, "The password file");
    if ("sessionHours" in b.security) s.sessionHours = num(b.security.sessionHours, 1, 720, "Session length (hours)");
    out.security = s;
  }
  if (b.dataSource) {
    const d = b.dataSource as Record<string, Record<string, unknown> | string>;
    const s: Record<string, unknown> = {};
    if ("type" in d) { if (!["json", "sqlite", "mysql"].includes(String(d.type))) throw new UserError("Pick JSON, SQLite or MySQL."); s.type = d.type as DataSourceType; }
    if (d.json && typeof d.json === "object" && "path" in d.json) s.json = { path: text(d.json.path, "The JSON file path") };
    if (d.sqlite && typeof d.sqlite === "object" && "path" in d.sqlite) s.sqlite = { path: text(d.sqlite.path, "The SQLite file path") };
    if (d.mysql && typeof d.mysql === "object") {
      const m: Record<string, unknown> = {};
      for (const k of ["host", "database", "user"]) if (k in d.mysql) m[k] = text(d.mysql[k], `MySQL ${k}`);
      if ("port" in d.mysql) m.port = num(d.mysql.port, 1, 65535, "The MySQL port");
      if ("password" in d.mysql) m.password = String(d.mysql.password ?? "");
      s.mysql = m;
    }
    out.dataSource = s;
  }
  if (b.photos) {
    const s: Record<string, unknown> = {};
    if ("dir" in b.photos) s.dir = text(b.photos.dir, "The photos folder");
    if ("maxPerPerson" in b.photos) s.maxPerPerson = num(b.photos.maxPerPerson, 1, 50, "Photos per person");
    out.photos = s;
  }
  if (b.appearance) {
    const s: Record<string, unknown> = {};
    if ("theme" in b.appearance) s.theme = text(b.appearance.theme, "The theme");
    if ("customThemes" in b.appearance) {
      if (!Array.isArray(b.appearance.customThemes)) throw new UserError("Custom themes must be a list.");
      s.customThemes = b.appearance.customThemes;
    }
    out.appearance = s;
  }
  if (b.backups && "dir" in b.backups) out.backups = { dir: text(b.backups.dir, "The backups folder") };
  return out as Partial<ReturnType<Config["get"]>>;
}
