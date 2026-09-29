/**
 * The HTTP app end to end: login on/off, the network guards, settings and
 * which ones need a restart, switching data sources, import/export, backups
 * and photo files.
 */
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { cookieClient, startServer, tinyPng, type Running } from "./helpers.js";

let run: Running | null = null;
afterEach(async () => { if (run) await run.close(); run = null; });

function raw(base: string, opts: http.RequestOptions, body?: string): Promise<{ status: number; body: string }> {
  const u = new URL(base);
  return new Promise((res, rej) => {
    const r = http.request({ host: u.hostname, port: u.port, ...opts }, (x) => { let d = ""; x.on("data", (c) => (d += c)); x.on("end", () => res({ status: x.statusCode || 0, body: d })); });
    r.on("error", rej); if (body) r.write(body); r.end();
  });
}

describe("login", () => {
  it("is off by default: the app is open", async () => {
    run = await startServer();
    expect((await run.call("GET", "/api/auth/me")).json).toEqual({ status: "disabled" });
    expect((await run.call("GET", "/api/tabs")).status).toBe(200);
  });

  it("when turned on: create a login, sign in and out, wrong passwords refused, delete the file to reset", async () => {
    run = await startServer();
    const r = run;
    await r.call("PUT", "/api/settings", { security: { loginEnabled: true } });
    expect((await r.call("GET", "/api/auth/me")).json).toEqual({ status: "not_initialized" });
    expect((await r.call("GET", "/api/tabs")).status).toBe(401);
    expect((await r.call("POST", "/api/auth/setup", { loginName: "matt", password: "no" })).json.error).toMatch(/at least 4/);
    const setup = await r.call("POST", "/api/auth/setup", { loginName: "matt", password: "s3cret!" });
    expect(setup.json).toEqual({ status: "authenticated", loginName: "matt" });
    const pw = JSON.parse(fs.readFileSync(path.join(r.dir, ".password"), "utf8"));
    expect(pw.loginName).toBe("matt"); expect(pw.passwordHash).toMatch(/^\$2[aby]\$10\$/);
    expect(fs.statSync(path.join(r.dir, ".password")).mode & 0o777).toBe(0o600);
    expect((await r.call("GET", "/api/tabs")).status).toBe(200);
    expect((await r.call("POST", "/api/auth/setup", { loginName: "x", password: "yyyy" })).status).toBe(409);

    const other = cookieClient(r.base);
    expect((await other("GET", "/api/tabs")).status).toBe(401);
    expect((await other("POST", "/api/auth/login", { loginName: "matt", password: "wrong" })).status).toBe(401);
    expect((await other("POST", "/api/auth/login", { loginName: "matt", password: "s3cret!" })).json.status).toBe("authenticated");
    expect((await other("GET", "/photos/abcdefgh/x.png")).status).toBe(404); // signed in: not a 401
    await other("POST", "/api/auth/logout");
    expect((await other("GET", "/api/tabs")).status).toBe(401);

    fs.rmSync(path.join(r.dir, ".password"));
    expect((await r.call("GET", "/api/auth/me")).json).toEqual({ status: "not_initialized" });
  });
});

describe("network guards", () => {
  it("refuses a foreign Host header and cross-site writes", async () => {
    run = await startServer();
    const u = new URL(run.base);
    expect((await raw(run.base, { path: "/api/health", headers: { host: `evil.example:${u.port}` } })).status).toBe(421);
    expect((await raw(run.base, { path: "/api/health", headers: { host: `localhost:${u.port}` } })).status).toBe(200);
    const body = JSON.stringify({ name: "X" });
    const cross = await raw(run.base, { method: "POST", path: "/api/tabs", headers: { host: u.host, origin: "http://evil.example", "content-type": "application/json", "content-length": String(body.length) } }, body);
    expect(cross.status).toBe(403);
    const same = await raw(run.base, { method: "POST", path: "/api/tabs", headers: { host: u.host, origin: `http://${u.host}`, "content-type": "application/json", "content-length": String(body.length) } }, body);
    expect(same.status).toBe(200);
  });
});

describe("settings", () => {
  it("saves to config.json, masks the MySQL password, and says which changes need a restart", async () => {
    run = await startServer();
    const r = run;
    let s = await r.call("PUT", "/api/settings", { appearance: { theme: "dark" }, photos: { maxPerPerson: 3 } });
    expect(s.json.restartRequired).toEqual([]);
    s = await r.call("PUT", "/api/settings", { server: { port: 8401 } });
    expect(s.json.restartRequired).toEqual(["server.port"]);
    s = await r.call("PUT", "/api/settings", { server: { allowNetwork: true } });
    expect(s.json.restartRequired.sort()).toEqual(["server.allowNetwork", "server.port"]);
    expect((await r.call("PUT", "/api/settings", { server: { port: 80 } })).json.error).toMatch(/1024 to 65535/);
    await r.call("PUT", "/api/settings", { dataSource: { mysql: { password: "hunter2" } } });
    expect((await r.call("GET", "/api/settings")).json.config.dataSource.mysql.password).toBe("••••••••");
    await r.call("PUT", "/api/settings", { dataSource: { mysql: { password: "••••••••", host: "db.local" } } });
    const onDisk = JSON.parse(fs.readFileSync(path.join(r.dir, "config.json"), "utf8"));
    expect(onDisk.dataSource.mysql).toMatchObject({ password: "hunter2", host: "db.local" });
    expect(onDisk.appearance.theme).toBe("dark");
    expect(fs.statSync(path.join(r.dir, "config.json")).mode & 0o777).toBe(0o600);
  });
});

describe("data sources, import and export", () => {
  it("switches JSON → SQLite, builds it, validates and imports the JSON file, exports it back", async () => {
    run = await startServer();
    const r = run;
    // some data in the JSON source
    const tab = (await r.call("POST", "/api/tabs", { name: "Clients" })).json;
    const dir = (await r.call("POST", "/api/directories", { tabId: tab.id, name: "Active", description: "Paying" })).json;
    const sue = (await r.call("POST", "/api/people", { tabId: tab.id, directoryId: dir.id, firstName: "Susan", lastName: "Park", tags: ["dental"] })).json;
    await r.call("POST", `/api/people/${sue.id}/notes`, { body: "Met at the Chamber lunch" });
    const fd = new FormData(); fd.append("photo", new Blob([tinyPng()], { type: "image/png" }), "Sue Photo.png");
    const withPhoto = (await r.call("POST", `/api/people/${sue.id}/photos`, fd)).json;
    expect(withPhoto.photos[0].filename).toBe("Sue_Photo.png");
    const img = await fetch(`${r.base}/photos/${sue.id}/Sue_Photo.png`);
    expect(img.status).toBe(200); expect(img.headers.get("content-type")).toMatch(/png/);

    // switch to SQLite: it needs building first
    let st = (await r.call("PUT", "/api/settings", { dataSource: { type: "sqlite" } })).json;
    expect(st.restartRequired).toEqual([]);
    expect(st.dataSource).toMatchObject({ type: "sqlite", ok: false, needsBuild: true });
    expect((await r.call("GET", "/api/tabs")).status).toBe(409);
    st = (await r.call("POST", "/api/datasource/build", {})).json;
    expect(st).toMatchObject({ ok: true, counts: { tabs: 0, directories: 0, people: 0 } });
    expect((await r.call("POST", "/api/datasource/build", {})).status).toBe(409);
    expect((await r.call("POST", "/api/datasource/build", { rebuild: true, confirm: "nope" })).status).toBe(400);

    // validate + import the JSON file that was in use
    const rep = (await r.call("POST", "/api/import/validate", {})).json;
    expect(rep).toMatchObject({ ok: true, errors: [], counts: { tabs: 1, directories: 1, people: 1, photos: 1, notes: 1 } });
    expect((await r.call("POST", "/api/import", { mode: "replace" })).json.error).toMatch(/Type REPLACE/);
    expect((await r.call("POST", "/api/import", { mode: "replace", confirm: "REPLACE" })).json).toMatchObject({ mode: "replace", counts: { people: 1 } });
    const found = (await r.call("GET", "/api/search?q=sus")).json;
    expect(found).toHaveLength(1); expect(found[0]).toMatchObject({ id: sue.id, path: "Clients › Active", photo: { filename: "Sue_Photo.png" } });

    // add alongside: fresh ids, tab renamed, photos copied to the new id
    const added = (await r.call("POST", "/api/import", { mode: "add" })).json;
    expect(added.mode).toBe("add");
    const tabs = (await r.call("GET", "/api/tabs")).json.map((t: { name: string }) => t.name);
    expect(tabs).toEqual(["Clients", "Clients (imported)"]);
    const both = (await r.call("GET", "/api/search?q=susan")).json;
    expect(both).toHaveLength(2);
    const copy = both.find((x: { id: string }) => x.id !== sue.id);
    expect(fs.existsSync(path.join(r.dir, "data/images", copy.id, "Sue_Photo.png"))).toBe(true);

    // export
    const ex = (await r.call("POST", "/api/export", { file: "./data/out.json" })).json;
    expect(ex.counts.people).toBe(2);
    const doc = JSON.parse(fs.readFileSync(path.join(r.dir, "data/out.json"), "utf8"));
    expect(doc.format).toBe("people-manager"); expect(doc.people).toHaveLength(2);
    const dl = await fetch(`${r.base}/api/export/download`);
    expect(dl.headers.get("content-disposition")).toMatch(/attachment; filename="people-export-/);
  });

  it("validation lists real problems and blocks the import", async () => {
    run = await startServer();
    const r = run;
    const bad = { format: "people-manager", version: 1, tabs: [{ id: "t1", name: "A", position: 0 }], customFields: [{ id: "f1", name: "Yes?", type: "boolean", position: 0 }],
      directories: [{ id: "d1", tabId: "tX", parentId: null, name: "Orphan", position: 0 }],
      people: [{ id: "p1", tabId: "t1", firstName: "", position: 0 }, { id: "p1", tabId: "t1", firstName: "Dup", position: 1, custom: { f1: "maybe" }, photos: [{ id: "ph", filename: "gone.jpg" }] },
        { id: "p3", tabId: "t1", firstName: "Mark", lastName: "Jones" }, { id: "p4", tabId: "t1", firstName: "Mark", lastName: "Jones", birthday: "someday" }] };
    fs.writeFileSync(path.join(r.dir, "bad.json"), JSON.stringify(bad));
    const rep = (await r.call("POST", "/api/import/validate", { file: "./bad.json" })).json;
    expect(rep.ok).toBe(false);
    expect(rep.errors.join("\n")).toMatch(/Orphan” points to a tab that is not in the file/);
    expect(rep.errors.join("\n")).toMatch(/used more than once/);
    expect(rep.errors.join("\n")).toMatch(/has no first name/);
    expect(rep.warnings.join("\n")).toMatch(/yes\/no field but holds “maybe”/);
    expect(rep.warnings.join("\n")).toMatch(/photo “gone.jpg” is not in/);
    expect(rep.warnings.join("\n")).toMatch(/2 people are named “Mark Jones”/);
    expect(rep.warnings.join("\n")).toMatch(/birthday “someday”/);
    const imp = await r.call("POST", "/api/import", { file: "./bad.json", mode: "add" });
    expect(imp.status).toBe(422);
    expect((await r.call("POST", "/api/import/validate", { file: "./missing.json" })).status).toBe(404);
  });
});

describe("backups", () => {
  it("creates a zip without the MySQL password or photos, lists it, restores (replacing) and deletes it", async () => {
    run = await startServer({ dataSource: { mysql: { password: "top-secret" } } } as never);
    const r = run;
    const tab = (await r.call("POST", "/api/tabs", { name: "Clients" })).json;
    await r.call("POST", "/api/people", { tabId: tab.id, firstName: "Before" });
    const b = (await r.call("POST", "/api/backups")).json;
    expect(b.name).toMatch(/^people-backup-\d{8}-\d{6}\.zip$/); expect(b.people).toBe(1);
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(fs.readFileSync(path.join(r.dir, "data/backups", b.name)));
    expect(Object.keys(zip.files).sort()).toEqual(["README.txt", "config.json", "people.json"]);
    expect(JSON.parse(await zip.file("config.json")!.async("string")).dataSource.mysql.password).toBe("");
    expect(await zip.file("README.txt")!.async("string")).toMatch(/NOT included: photos/);

    await r.call("POST", "/api/people", { tabId: tab.id, firstName: "After" });
    expect((await r.call("GET", "/api/backups")).json.backups.map((x: { name: string }) => x.name)).toEqual([b.name]);
    expect((await r.call("POST", `/api/backups/${b.name}/restore`, {})).status).toBe(400);
    expect((await r.call("POST", `/api/backups/${b.name}/restore`, { confirm: "RESTORE" })).json).toMatchObject({ people: 1 });
    expect((await r.call("GET", "/api/search?q=after")).json).toEqual([]);
    expect((await r.call("GET", "/api/search?q=before")).json).toHaveLength(1);
    // restore from an uploaded file
    const up = await r.call("POST", "/api/backups/restore-upload", fs.readFileSync(path.join(r.dir, "data/backups", b.name)), { "content-type": "application/zip", "x-confirm": "RESTORE" });
    expect(up.json.people).toBe(1);
    expect((await r.call("GET", "/api/backups/..%2Fconfig.json/download")).status).toBe(400);
    await r.call("DELETE", `/api/backups/${b.name}`);
    expect((await r.call("GET", "/api/backups")).json.backups).toEqual([]);
  });
});
