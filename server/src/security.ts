/**
 * Two cheap guards that matter even on a home network:
 *
 *  1. Host check — the browser must be talking to this computer by a name it
 *     really has (localhost, 127.0.0.1, and with network access on, this
 *     computer's own addresses and hostname). Stops "DNS rebinding", where a
 *     web page you visit points a name of its own at your computer.
 *  2. Same-origin writes — a change (POST/PUT/PATCH/DELETE) must come from a
 *     page this app served. Stops another web site from submitting forms to
 *     it in the background.
 */
import os from "node:os";
import type { NextFunction, Request, Response } from "express";
import type { Config } from "./config.js";

function localNames(allowNetwork: boolean): Set<string> {
  const names = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
  if (allowNetwork) {
    const host = os.hostname().toLowerCase();
    names.add(host); names.add(host.replace(/\.local$/, "")); names.add(host.endsWith(".local") ? host : `${host}.local`);
    for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) names.add(a.family === "IPv6" ? `[${a.address}]` : a.address);
  }
  return names;
}

const hostOnly = (h: string) => (h.startsWith("[") ? h.slice(0, h.indexOf("]") + 1) : h.split(":")[0]).toLowerCase();

export function hostGuard(config: Config) {
  // the interface list can change (Wi-Fi reconnects) — refresh it now and then
  let names = localNames(config.get().server.allowNetwork); let at = Date.now();
  return (req: Request, res: Response, next: NextFunction) => {
    if (Date.now() - at > 30_000) { names = localNames(config.get().server.allowNetwork); at = Date.now(); }
    const host = hostOnly(String(req.headers.host || ""));
    if (!names.has(host)) { res.status(421).json({ error: "This address is not one this computer answers to." }); return; }
    next();
  };
}

export function sameOriginWrites(req: Request, res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const site = req.headers["sec-fetch-site"];
  if (site && site !== "same-origin" && site !== "none") { res.status(403).json({ error: "Changes must come from the People Manager page itself." }); return; }
  const origin = req.headers.origin;
  if (origin) {
    let o: string; try { o = new URL(origin).host.toLowerCase(); } catch { o = ""; }
    if (o !== String(req.headers.host || "").toLowerCase()) { res.status(403).json({ error: "Changes must come from the People Manager page itself." }); return; }
  }
  next();
}

/** Addresses other devices can use, for the startup message and Settings. */
export function networkUrls(port: number): string[] {
  const out: string[] = [];
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === "IPv4" && !a.internal) out.push(`http://${a.address}:${port}`);
  const host = os.hostname();
  out.push(`http://${host.endsWith(".local") ? host : host + ".local"}:${port}`);
  return out;
}
