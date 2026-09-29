/**
 * The optional login, done the same way as my_business_manager:
 *
 *  - Settings → Security turns it on or off (security.loginEnabled).
 *  - Credentials live in ONE file, the password file (default ./.password):
 *    {"loginName": "...", "passwordHash": "$2b$10$..."} with owner-only access.
 *  - No file → the app asks you to create a login name and password, then
 *    writes the file. Forgot the password? Delete the file and reload.
 *    Your people are never touched by that.
 *  - Sessions are signed cookies with a key made fresh at every start, so a
 *    restart signs you out.
 */
import fs from "node:fs";
import bcrypt from "bcryptjs";
import type { Request } from "express";
import type { Config } from "./config.js";
import { UserError, writeAtomic } from "./util.js";

export type AuthState =
  | { status: "disabled" }
  | { status: "not_initialized" }
  | { status: "unauthenticated" }
  | { status: "authenticated"; loginName: string };

interface PasswordFile { loginName: string; passwordHash: string }
export interface SessionData { loginName?: string }

export class Auth {
  constructor(private readonly config: Config) {}

  file(): string { return this.config.resolve(this.config.get().security.passwordFile); }
  enabled(): boolean { return !!this.config.get().security.loginEnabled; }
  initialized(): boolean { return fs.existsSync(this.file()); }

  private read(): PasswordFile {
    let parsed: Partial<PasswordFile>;
    try { parsed = JSON.parse(fs.readFileSync(this.file(), "utf8")); }
    catch { throw new UserError(`The password file ${this.file()} is damaged. Delete it and reload to create a new login.`, 500); }
    if (typeof parsed.loginName !== "string" || typeof parsed.passwordHash !== "string")
      throw new UserError(`The password file ${this.file()} is damaged. Delete it and reload to create a new login.`, 500);
    return parsed as PasswordFile;
  }

  state(req: Request): AuthState {
    if (!this.enabled()) return { status: "disabled" };
    if (!this.initialized()) return { status: "not_initialized" };
    const s = req.session as SessionData | null | undefined;
    if (s?.loginName) {
      // a session from before the password file was replaced is not valid
      try { if (this.read().loginName === s.loginName) return { status: "authenticated", loginName: s.loginName }; } catch {}
    }
    return { status: "unauthenticated" };
  }

  /** May this request use the app? */
  allowed(req: Request): boolean {
    const st = this.state(req);
    return st.status === "disabled" || st.status === "authenticated";
  }

  async setup(loginName: string, password: string): Promise<string> {
    if (this.initialized()) throw new UserError("A login already exists. To start over, delete the password file and reload.", 409);
    const name = String(loginName || "").trim();
    if (!name) throw new UserError("Choose a login name.");
    if (!password || String(password).length < 4) throw new UserError("Choose a password of at least 4 characters.");
    const passwordHash = await bcrypt.hash(String(password), 10);
    writeAtomic(this.file(), JSON.stringify({ loginName: name, passwordHash }, null, 2) + "\n", 0o600);
    try { fs.chmodSync(this.file(), 0o600); } catch {}
    return name;
  }

  async login(loginName: string, password: string): Promise<string> {
    if (!this.initialized()) throw new UserError("No login has been created yet.", 409);
    const f = this.read();
    const ok = String(loginName || "").trim() === f.loginName && (await bcrypt.compare(String(password || ""), f.passwordHash));
    if (!ok) throw new UserError("That login name and password do not match.", 401);
    return f.loginName;
  }
}
