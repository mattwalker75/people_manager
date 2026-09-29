/**
 * Manual backups (Settings → Backups): a small zip holding
 *   people.json  — everything in the active data source, in the export format
 *   config.json  — your settings, with the MySQL password removed
 *   README.txt   — what is and is not inside
 * Photos are NOT included (they can be gigabytes); copy the photos folder
 * yourself. Restoring replaces all current data with the backup's.
 */
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import type { Service } from "./service.js";
import { validateDocument } from "./transfer.js";
import { stamp, UserError } from "./util.js";

const NAME = /^people-backup-[\w.-]+\.zip$/;

const README = (photos: string) => `People Manager backup
=====================
people.json   every tab, directory, person, note and custom field
config.json   your settings (the MySQL password is removed — type it again after restoring)

NOT included: photos. They live in ${photos}
Copy that folder yourself if you want them backed up too.

To restore: Settings → Backups → Restore. Restoring REPLACES everything in the
current data source with the contents of this backup.
`;

export class Backups {
  constructor(private readonly svc: Service) {}

  dir(): string { return this.svc.config.resolve(this.svc.config.get().backups.dir); }

  async create(): Promise<{ name: string; bytes: number; people: number }> {
    const st = await this.svc.store.status();
    if (!st.ok) throw new UserError(`The data source is not ready, so there is nothing to back up: ${st.message}`, 409);
    const doc = await this.svc.store.exportAll();
    const zip = new JSZip();
    zip.file("people.json", JSON.stringify(doc, null, 1));
    zip.file("config.json", JSON.stringify(this.svc.config.withoutSecrets(), null, 2));
    zip.file("README.txt", README(this.svc.photosDir()));
    const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    fs.mkdirSync(this.dir(), { recursive: true });
    let name = `people-backup-${stamp()}.zip`; let i = 2;
    while (fs.existsSync(path.join(this.dir(), name))) name = `people-backup-${stamp()}-${i++}.zip`;
    fs.writeFileSync(path.join(this.dir(), name), buf);
    return { name, bytes: buf.length, people: doc.people.length };
  }

  list(): { name: string; bytes: number; createdAt: string }[] {
    if (!fs.existsSync(this.dir())) return [];
    return fs.readdirSync(this.dir()).filter((f) => NAME.test(f)).map((f) => {
      const st = fs.statSync(path.join(this.dir(), f));
      return { name: f, bytes: st.size, createdAt: st.mtime.toISOString() };
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  fileFor(name: string): string {
    if (!NAME.test(name)) throw new UserError("That is not a backup file name.");
    const f = path.join(this.dir(), name);
    if (!fs.existsSync(f)) throw new UserError("That backup is not there any more.", 404);
    return f;
  }

  remove(name: string): void { fs.rmSync(this.fileFor(name)); }

  /** Replace all data with a backup's people.json. */
  async restore(buffer: Buffer): Promise<{ people: number; warnings: number }> {
    let zip: JSZip;
    try { zip = await JSZip.loadAsync(buffer); } catch { throw new UserError("That file is not a zip backup."); }
    const entry = zip.file("people.json");
    if (!entry) throw new UserError("That zip is not a People Manager backup (there is no people.json inside).");
    let raw: unknown;
    try { raw = JSON.parse(await entry.async("string")); } catch { throw new UserError("The backup's people.json is damaged."); }
    const { report, doc } = validateDocument(raw, this.svc.photosDir(), "backup");
    if (!report.ok) throw new UserError(`The backup has problems and was not restored: ${report.errors.slice(0, 3).join(" ")}`, 422, report);
    const st = await this.svc.store.status();
    if (!st.ok) throw new UserError(`The data source is not ready: ${st.message}`, 409);
    await this.svc.store.replaceAll(doc);
    return { people: doc.people.length, warnings: report.warnings.length + report.moreWarnings };
  }
}
