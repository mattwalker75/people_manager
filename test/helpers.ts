import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { Config, type AppConfig } from "../server/src/config.js";
import { createApp, type AppHandle } from "../server/src/app.js";
import type { MysqlSettings } from "../server/src/store/sql.js";

export function scratchDir(label = "pm-test"): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${label}-`));
}

/**
 * MySQL tests run only when PM_TEST_MYSQL is set, as host:port:user:password:database —
 * point it at a throwaway database, never a real one: the tests rebuild it.
 */
export function mysqlSettings(): MysqlSettings | null {
  const v = process.env.PM_TEST_MYSQL;
  if (!v) return null;
  const [host, port, user, password, database] = v.split(":");
  return { host, port: Number(port), user, password, database };
}

/** A config.json in a scratch folder, with every path inside that folder. */
export function scratchConfig(dir: string, over: Record<string, unknown> = {}): Config {
  const file = path.join(dir, "config.json");
  const base = {
    server: { port: 0, allowNetwork: false },
    security: { loginEnabled: false, passwordFile: "./.password", sessionHours: 1 },
    dataSource: { type: "json", json: { path: "./data/people.json" }, sqlite: { path: "./data/people.db" } },
    photos: { dir: "./data/images", maxPerPerson: 5 },
    backups: { dir: "./data/backups" },
  };
  const merged = JSON.parse(JSON.stringify(base));
  for (const [k, v] of Object.entries(over)) merged[k] = { ...(merged[k] || {}), ...(v as object) };
  fs.writeFileSync(file, JSON.stringify(merged, null, 2));
  return new Config(file);
}

export interface Running extends AppHandle { base: string; dir: string; close(): Promise<void>; call: Caller }
export type Caller = (method: string, url: string, body?: unknown, headers?: Record<string, string>) => Promise<{ status: number; json: any; headers: Headers }>;

/** Run the real app on a spare port against scratch data. */
export async function startServer(over: Partial<Record<keyof AppConfig, unknown>> = {}): Promise<Running> {
  const dir = scratchDir();
  const config = scratchConfig(dir, over as Record<string, unknown>);
  const handle = await createApp(config, { rateLimit: false });
  const server = await new Promise<import("node:http").Server>((res) => { const s = handle.app.listen(0, "127.0.0.1", () => res(s)); });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = cookieClient(base);
  return { ...handle, base, dir, call, close: async () => { server.close(); await handle.service.store.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

/** A tiny browser: keeps its own cookies, sends JSON. */
export function cookieClient(base: string): Caller {
  let cookie = "";
  return async (method, url, body, headers = {}) => {
    const isBuf = Buffer.isBuffer(body);
    const r = await fetch(base + url, {
      method, headers: { ...(body !== undefined && !isBuf && !(body instanceof FormData) ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}), ...headers },
      body: body === undefined ? undefined : isBuf || body instanceof FormData ? (body as BodyInit) : JSON.stringify(body),
    });
    const set = r.headers.getSetCookie?.() || [];
    if (set.length) {
      const jar = new Map(cookie.split("; ").filter(Boolean).map((c) => [c.split("=")[0], c]));
      for (const c of set) { const kv = c.split(";")[0]; jar.set(kv.split("=")[0], kv); }
      cookie = [...jar.values()].filter((c) => c.slice(c.indexOf("=") + 1) !== "").join("; ");
    }
    const text = await r.text();
    let json: unknown = text; try { json = JSON.parse(text); } catch {}
    return { status: r.status, json, headers: r.headers };
  };
}

/** A small valid PNG (solid colour), for photo uploads. */
export function tinyPng(): Buffer {
  return Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4nGNk+M8ABIwMDAz/GRgYAAANIgH/8m2TSgAAAABJRU5ErkJggg==", "base64");
}
