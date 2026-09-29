import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Archive, Download, RotateCcw, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "../components/confirm";
import { ApplyBadge, Button, Field, IconButton, TextInput } from "../components/ui";
import { api, errorText } from "../lib/api";
import { formatBytes } from "../lib/format";
import type { AppState } from "../lib/hooks";
import { Card } from "./SettingsPage";
import { useSaveSettings } from "./General";

interface BackupRow { name: string; bytes: number; createdAt: string }

export function BackupsSection({ state }: { state: AppState }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const save = useSaveSettings();
  const list = useQuery({ queryKey: ["backups"], queryFn: () => api.get<{ dir: string; backups: BackupRow[] }>("/api/backups") });
  const [dir, setDir] = useState(state.config.backups.dir);
  const [busy, setBusy] = useState("");
  const upload = useRef<HTMLInputElement>(null);

  const restoreWarning = (what: string) => confirm({ title: "Restore this backup?", danger: true, typeToConfirm: "RESTORE", confirmLabel: "Restore",
    message: <>Everything in the data source you use now is <b>replaced</b> with {what}. People added since then are lost. Photos are not touched.</> });
  const run = async (key: string, fn: () => Promise<unknown>, done: (r: never) => string) => {
    setBusy(key);
    try { const r = await fn(); await qc.invalidateQueries(); toast(done(r as never)); } catch (e) { toast.error(errorText(e)); } finally { setBusy(""); }
  };

  return (
    <>
      <h1 className="font-display text-[28px] font-semibold">Backups</h1>
      <div className="flex items-start gap-2.5 rounded-2xl bg-warn-soft px-4 py-3 text-[13.5px] text-warn">
        <AlertTriangle size={17} className="mt-0.5 shrink-0" />
        <span>A backup holds your people, directories, tabs, notes and custom fields, plus your settings <b>without the MySQL password</b>. <b>Photos are not included</b> — copy <span className="font-mono">{state.photosDir}</span> yourself.</span>
      </div>
      <Card title="Back up now" sub={<>Backups are zip files in <span className="font-mono">{list.data?.dir ?? state.backupsDir}</span>. Download one to keep it somewhere else too.</>}>
        <div className="flex gap-2">
          <Button variant="primary" icon={<Archive size={15} />} busy={busy === "create"} onClick={() => run("create", () => api.post("/api/backups"), (r: { name: string; people: number }) => `Backed up ${r.people} people to ${r.name}.`)}>Back up now</Button>
          <Button icon={<Upload size={15} />} busy={busy === "upload"} onClick={() => upload.current?.click()}>Restore from a file…</Button>
          <input ref={upload} type="file" accept=".zip,application/zip" hidden onChange={async (e) => {
            const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
            if (!(await restoreWarning(`the contents of ${f.name}`))) return;
            await run("upload", () => api.post("/api/backups/restore-upload", f, { "x-confirm": "RESTORE" }), (r: { people: number }) => `Restored ${r.people} people.`);
          }} />
        </div>
        <div className="overflow-hidden rounded-2xl border border-line">
          {(list.data?.backups ?? []).map((b) => (
            <div key={b.name} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-0">
              <span className="min-w-0 flex-1"><span className="block truncate font-mono text-[13px]">{b.name}</span><span className="text-[12px] text-faint">{new Date(b.createdAt).toLocaleString()} · {formatBytes(b.bytes)}</span></span>
              <a href={`/api/backups/${encodeURIComponent(b.name)}/download`} aria-label={`Download ${b.name}`} title="Download" className="inline-flex h-8 w-8 items-center justify-center rounded-full text-ink-2 hover:bg-surface-2"><Download size={15} /></a>
              <Button size="sm" icon={<RotateCcw size={14} />} busy={busy === b.name} onClick={async () => {
                if (!(await restoreWarning(`the backup from ${new Date(b.createdAt).toLocaleString()}`))) return;
                await run(b.name, () => api.post(`/api/backups/${encodeURIComponent(b.name)}/restore`, { confirm: "RESTORE" }), (r: { people: number }) => `Restored ${r.people} people.`);
              }}>Restore…</Button>
              <IconButton label={`Delete ${b.name}`} size="sm" className="text-danger" onClick={async () => {
                if (!(await confirm({ title: "Delete this backup?", message: b.name, confirmLabel: "Delete backup", danger: true }))) return;
                await run("del", () => api.del(`/api/backups/${encodeURIComponent(b.name)}`), () => "Backup deleted.");
              }}><Trash2 size={14} /></IconButton>
            </div>
          ))}
          {!list.data?.backups.length && <div className="px-4 py-6 text-center text-[13.5px] text-faint">No backups yet.</div>}
        </div>
      </Card>
      <Card title="Where backups are kept">
        <Field label="Backups folder" htmlFor="b-dir" badge={<ApplyBadge />}><TextInput id="b-dir" className="font-mono text-[13px]" value={dir} onChange={(e) => setDir(e.target.value)} /></Field>
        <div><Button variant="primary" onClick={() => save({ backups: { dir } })}>Save</Button></div>
      </Card>
    </>
  );
}
