/** Small forms: name (and description) for tabs and directories; "Move to…" with a tree picker. */
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Folder, Layers } from "lucide-react";
import type { Directory, Id, Tab } from "../../../shared/types";
import { api } from "../lib/api";
import { useTabs } from "../lib/hooks";
import { Button, cx, Field, Modal, Spinner, TextInput } from "./ui";

export function NameDialog({ open, onClose, title, submitLabel, initialName = "", initialDescription = "", withDescription, onSubmit }: {
  open: boolean; onClose: () => void; title: string; submitLabel: string; initialName?: string; initialDescription?: string; withDescription?: boolean;
  onSubmit: (name: string, description: string) => Promise<unknown>;
}) {
  const [name, setName] = useState(initialName);
  const [desc, setDesc] = useState(initialDescription);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setName(initialName); setDesc(initialDescription); } }, [open, initialName, initialDescription]);
  return (
    <Modal open={open} onOpenChange={(v) => !v && onClose()} title={title}>
      <form className="flex flex-col gap-4 px-6 pb-6 pt-4" onSubmit={async (e) => {
        e.preventDefault(); if (!name.trim()) return;
        setBusy(true); try { const r = await onSubmit(name.trim(), desc.trim()); if (r !== undefined) onClose(); } finally { setBusy(false); }
      }}>
        <Field label="Name" htmlFor="nd-name"><TextInput id="nd-name" autoFocus value={name} maxLength={200} onChange={(e) => setName(e.target.value)} /></Field>
        {withDescription && (
          <Field label="One-line description (optional)" htmlFor="nd-desc" hint="Shown under the name.">
            <TextInput id="nd-desc" value={desc} maxLength={500} onChange={(e) => setDesc(e.target.value)} />
          </Field>
        )}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" busy={busy} disabled={!name.trim()}>{submitLabel}</Button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Pick a destination: a tab, then optionally a directory in it.
 * `excludeDir` hides a directory and everything inside it (you can't move a directory into itself).
 */
export function MoveDialog({ open, onClose, what, currentTabId, excludeDir, onMove }: {
  open: boolean; onClose: () => void; what: string; currentTabId: Id; excludeDir?: Id; onMove: (tabId: Id, directoryId: Id | null, label: string) => Promise<unknown>;
}) {
  const tabs = useTabs(open);
  const [tabId, setTabId] = useState(currentTabId);
  const [dirs, setDirs] = useState<Directory[] | null>(null);
  const [target, setTarget] = useState<Id | null>(null);
  const [open2, setOpen2] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setTabId(currentTabId); setTarget(null); } }, [open, currentTabId]);
  useEffect(() => {
    if (!open) return; setDirs(null);
    api.get<{ directories: Directory[] }>(`/api/tabs/${tabId}/directories`).then((r) => setDirs(r.directories)).catch(() => setDirs([]));
  }, [open, tabId]);

  const hidden = useMemo(() => {
    const out = new Set<Id>(); if (!excludeDir || !dirs) return out;
    out.add(excludeDir);
    for (let grew = true; grew;) { grew = false; for (const d of dirs) if (d.parentId && out.has(d.parentId) && !out.has(d.id)) { out.add(d.id); grew = true; } }
    return out;
  }, [dirs, excludeDir]);
  const tab = tabs.data?.find((t: Tab) => t.id === tabId);
  const children = (parent: Id | null) => (dirs || []).filter((d) => d.parentId === parent && !hidden.has(d.id)).sort((a, b) => a.position - b.position);
  const label = () => { const d = dirs?.find((x) => x.id === target); return d ? `${tab?.name} › ${d.name}` : `${tab?.name} (top level)`; };

  const row = (d: Directory, depth: number): React.ReactNode => {
    const kids = children(d.id); const isOpen = open2[d.id] ?? true;
    return (
      <div key={d.id}>
        <div className={cx("flex h-9 items-center gap-1.5 rounded-xl pr-2", target === d.id ? "bg-accent-soft text-accent-text font-semibold" : "hover:bg-surface-2")} style={{ paddingLeft: 8 + depth * 18 }}>
          <button type="button" aria-label={isOpen ? "Close" : "Open"} className={cx("flex h-6 w-6 items-center justify-center rounded-md text-faint", !kids.length && "invisible")} onClick={() => setOpen2({ ...open2, [d.id]: !isOpen })}>
            <ChevronRight size={14} className={cx("transition", isOpen && "rotate-90")} />
          </button>
          <button type="button" className="flex flex-1 items-center gap-2 text-left" onClick={() => setTarget(d.id)}><Folder size={15} />{d.name}</button>
        </div>
        {isOpen && kids.map((k) => row(k, depth + 1))}
      </div>
    );
  };

  return (
    <Modal open={open} onOpenChange={(v) => !v && onClose()} title={`Move ${what}`} description="Choose a tab, then where in it." className="w-[min(620px,94vw)]">
      <div className="flex flex-col gap-4 px-6 pb-6 pt-4">
        <div className="flex flex-wrap gap-1.5">
          {tabs.data?.map((t) => (
            <button key={t.id} type="button" onClick={() => { setTabId(t.id); setTarget(null); }}
              className={cx("h-8 rounded-full border px-3 text-[13px]", t.id === tabId ? "border-accent bg-accent text-accent-ink" : "border-line-2 hover:bg-surface-2")}>{t.name}</button>
          ))}
        </div>
        <div className="max-h-[46vh] overflow-auto rounded-2xl border border-line p-1.5">
          <button type="button" onClick={() => setTarget(null)} className={cx("flex h-9 w-full items-center gap-2 rounded-xl px-3 text-left", target === null ? "bg-accent-soft font-semibold text-accent-text" : "hover:bg-surface-2")}>
            <Layers size={15} />{tab?.name} — top level
          </button>
          {dirs === null ? <div className="p-4"><Spinner /></div> : children(null).map((d) => row(d, 0))}
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] text-mute">To: <b className="text-ink">{label()}</b></span>
          <div className="flex gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" busy={busy} onClick={async () => { setBusy(true); try { const r = await onMove(tabId, target, label()); if (r !== undefined) onClose(); } finally { setBusy(false); } }}>Move here</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
