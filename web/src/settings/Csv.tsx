/**
 * Spreadsheets: download a CSV template, import people from a CSV (pick the
 * tab, check how the columns were matched, preview, import, undo), and export
 * people to a CSV.
 */
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileSpreadsheet, FolderPlus, Info, RotateCcw, Upload } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "../components/confirm";
import { Button, cx, Field, Select, TextInput } from "../components/ui";
import { api, ApiError, errorText } from "../lib/api";
import { useTabs } from "../lib/hooks";
import { Card } from "./SettingsPage";

interface Target { key: string; label: string; group: string }
interface Column { index: number; header: string; target: string; sample: string }
interface Preview {
  columns: Column[]; targets: Target[]; total: number; ready: number; tab: string;
  skipped: { row: number; reason: string }[];
  duplicates: { row: number; name: string; where: "tab" | "file" }[];
  warnings: { row: number; message: string }[];
  sample: { row: number; name: string; description: string; contacts: number; links: number; tags: string[] }[];
}
interface ImportResult { importId: string; added: number; skipped: number; warnings: number; tab: string; directory: string | null; backup: string; failed: { row: number; reason: string }[] }
interface RecentImport { id: string; at: string; file: string; tab: string; directory: string | null; count: number; undone: boolean }

const today = () => new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function Chip({ tone, children }: { tone: "ok" | "warn" | "bad" | "plain"; children: React.ReactNode }) {
  return <span className={cx("rounded-full px-2.5 py-1 text-[12.5px] font-medium",
    tone === "ok" ? "bg-accent-softer text-accent-text" : tone === "warn" ? "bg-warn-soft text-warn" : tone === "bad" ? "bg-danger-soft text-danger" : "bg-surface-2 text-ink-2")}>{children}</span>;
}

function Listing({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <details className="rounded-xl border border-line px-4 py-2 text-[13px]">
      <summary className="cursor-pointer py-1 font-medium">{title}</summary>
      <ul className="max-h-[180px] overflow-auto pb-1 text-ink-2">{items.slice(0, 200).map((t, i) => <li key={i} className="border-t border-line py-1">{t}</li>)}</ul>
      {items.length > 200 && <div className="py-1 text-faint">…and {items.length - 200} more</div>}
    </details>
  );
}

export function CsvImportCard() {
  const tabs = useTabs();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const recent = useQuery({ queryKey: ["csvImports"], queryFn: () => api.get<RecentImport[]>("/api/csv/imports") });
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [tabId, setTabId] = useState("");
  const [intoDir, setIntoDir] = useState(false);
  const [dirName, setDirName] = useState(`Imported ${today()}`);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [noFirst, setNoFirst] = useState<{ message: string; headers: string[]; targets: Target[]; guessed: string[] } | null>(null);
  const [skipDup, setSkipDup] = useState(false);
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const tab = tabId || tabs.data?.[0]?.id || "";

  const runPreview = async (text: string, map: Record<string, string>, t = tab) => {
    if (!t) { toast.error("Create a tab first — people are imported into a tab."); return; }
    setBusy("preview"); setResult(null);
    try {
      const p = await api.post<Preview>("/api/csv/preview", { csv: text, tabId: t, mapping: map });
      setPreview(p); setNoFirst(null);
      setMapping(Object.fromEntries(p.columns.map((c) => [String(c.index), c.target])));
    } catch (e) {
      const d = (e as ApiError).details as { headers?: string[]; targets?: Target[]; guessed?: string[] } | undefined;
      if (e instanceof ApiError && e.status === 422 && d?.headers) { setPreview(null); setNoFirst({ message: e.message, headers: d.headers, targets: d.targets!, guessed: d.guessed! }); setMapping(Object.fromEntries(d.guessed!.map((g, i) => [String(i), g]))); }
      else { setPreview(null); setNoFirst(null); toast.error(errorText(e)); }
    } finally { setBusy(""); }
  };
  const choose = async (f: File) => {
    const text = await f.text();
    setFile({ name: f.name, text }); setMapping({}); setSkipDup(false);
    await runPreview(text, {});
  };
  const remap = (index: number, target: string) => { const m = { ...mapping, [String(index)]: target }; setMapping(m); if (file) runPreview(file.text, m); };

  const toImport = preview ? preview.ready - (skipDup ? preview.duplicates.filter((d) => d.where === "tab").length : 0) : 0;
  const tabName = tabs.data?.find((t) => t.id === tab)?.name ?? "";
  const doImport = async () => {
    if (!file || !preview) return;
    const where = intoDir ? `a new directory “${dirName.trim()}” in ${tabName}` : `the top level of ${tabName}`;
    if (!(await confirm({ title: `Import ${toImport} ${toImport === 1 ? "person" : "people"}?`, confirmLabel: "Import",
      message: <>They are added to <b>{where}</b>. A backup is made first, and you can undo the import afterwards.</> }))) return;
    setBusy("import");
    try {
      const r = await api.post<ImportResult>("/api/csv/import", { csv: file.text, tabId: tab, mapping, newDirectory: intoDir ? dirName.trim() : null, skipDuplicates: skipDup, fileName: file.name });
      setResult(r); setPreview(null); setFile(null);
      await qc.invalidateQueries();
      toast(`${r.added} ${r.added === 1 ? "person" : "people"} added to ${r.tab}${r.directory ? ` › ${r.directory}` : ""}.`);
    } catch (e) { toast.error(errorText(e)); } finally { setBusy(""); }
  };
  const undo = async (id: string, count: number) => {
    if (!(await confirm({ title: "Undo this import?", confirmLabel: "Undo import", danger: true,
      message: <>The {count} {count === 1 ? "person" : "people"} it added are deleted (including any notes or photos added to them since). Everyone else is untouched.</> }))) return;
    try {
      const r = await api.post<{ removed: number; directoryRemoved: boolean }>(`/api/csv/imports/${id}/undo`);
      await qc.invalidateQueries(); setResult(null);
      toast(`Import undone — ${r.removed} ${r.removed === 1 ? "person" : "people"} removed${r.directoryRemoved ? ", and its directory" : ""}.`);
    } catch (e) { toast.error(errorText(e)); }
  };

  const columns: Column[] = preview?.columns ?? (noFirst ? noFirst.headers.map((h, i) => ({ index: i, header: h, target: noFirst.guessed[i], sample: "" })) : []);
  const targets = preview?.targets ?? noFirst?.targets ?? [];
  const groups = useMemo(() => { const g = new Map<string, Target[]>(); for (const t of targets) { const k = t.group; g.set(k, [...(g.get(k) ?? []), t]); } return [...g]; }, [targets]);

  return (
    <Card title="Import people from a spreadsheet (CSV)"
      sub={<>Save your spreadsheet as CSV — from Excel, Numbers, Google Sheets, LinkedIn (<i>Settings → Data privacy → Get a copy of your data → Connections</i>), Google Contacts or Outlook — and import it here. <b>Only First Name is required</b>; every other column is optional.</>}>
      <div className="flex flex-wrap gap-2">
        <a href="/api/csv/template" className="inline-flex h-10 items-center gap-1.5 rounded-full border border-line-2 bg-surface px-4 text-sm font-medium hover:bg-surface-2"><FileSpreadsheet size={15} />Download CSV template</a>
        <Button variant="primary" icon={<Upload size={15} />} busy={busy === "preview"} onClick={() => input.current?.click()}>{file ? "Choose another file…" : "Choose a CSV file…"}</Button>
        <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) choose(f); }} />
      </div>
      <p className="-mt-1 text-[12.5px] leading-relaxed text-faint">
        The template has one column per field (and one per field you added in People fields), plus an example row that is skipped automatically. Several key facts, tags or phone numbers in one cell: separate them with <b>;</b>. Dates like 2026-03-12, 3/12/2026 or March 12, 2026 all work; a birthday can leave out the year.
      </p>

      {(preview || noFirst) && file && (
        <div className="flex flex-col gap-4 rounded-2xl border border-line p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="text-[13.5px]"><span className="text-faint">File</span><div className="font-medium">{file.name}</div></div>
            <Field label="Add them to the tab" htmlFor="csv-tab">
              <Select id="csv-tab" value={tab} onChange={(e) => { setTabId(e.target.value); runPreview(file.text, mapping, e.target.value); }} className="min-w-[200px]">
                {tabs.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </Field>
            <label className="flex h-10 items-center gap-2 text-[13.5px]">
              <input type="checkbox" checked={intoDir} onChange={(e) => setIntoDir(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
              <FolderPlus size={15} className="text-faint" />Put them in a new directory
            </label>
            {intoDir && <TextInput aria-label="New directory name" value={dirName} onChange={(e) => setDirName(e.target.value)} className="w-[240px]" />}
          </div>
          {!intoDir && <p className="-mt-2 text-[12.5px] text-faint">They land at the top level of {tabName}; drag them onto directories in the sidebar afterwards.</p>}

          {noFirst && <div role="alert" className="rounded-xl bg-danger-soft px-4 py-2.5 text-[13.5px] text-danger">{noFirst.message}</div>}

          <div>
            <div className="mb-2 text-[12.5px] font-semibold uppercase tracking-[0.06em] text-faint">How the columns are matched — change any that are wrong</div>
            <div className="max-h-[340px] overflow-auto rounded-xl border border-line">
              <table className="w-full text-[13px]">
                <thead className="sticky top-0 bg-surface-2 text-left text-faint"><tr><th className="px-3 py-2 font-medium">Column in your file</th><th className="px-3 py-2 font-medium">Example</th><th className="px-3 py-2 font-medium">Goes to</th></tr></thead>
                <tbody>
                  {columns.map((c) => (
                    <tr key={c.index} className={cx("border-t border-line", mapping[String(c.index)] === "ignore" && "text-faint")}>
                      <td className="px-3 py-1.5 font-medium">{c.header || <i>(no heading)</i>}</td>
                      <td className="max-w-[240px] truncate px-3 py-1.5 text-mute" title={c.sample}>{c.sample}</td>
                      <td className="px-3 py-1.5">
                        <Select aria-label={`Where “${c.header}” goes`} value={mapping[String(c.index)] ?? c.target} onChange={(e) => remap(c.index, e.target.value)} className="h-9 min-w-[230px]">
                          {groups.map(([g, list]) => g ? <optgroup key={g} label={g}>{list.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</optgroup>
                            : list.map((t) => <option key={t.key} value={t.key}>{t.label}</option>))}
                        </Select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {preview && <>
            <div className="flex flex-wrap gap-2">
              <Chip tone="ok">{preview.ready} ready</Chip>
              {preview.skipped.length > 0 && <Chip tone="plain">{preview.skipped.length} skipped</Chip>}
              {preview.duplicates.length > 0 && <Chip tone="warn">{preview.duplicates.length} name{preview.duplicates.length === 1 ? "" : "s"} already there</Chip>}
              {preview.warnings.length > 0 && <Chip tone="warn">{preview.warnings.length} warning{preview.warnings.length === 1 ? "" : "s"}</Chip>}
            </div>
            <Listing title={`Skipped rows (${preview.skipped.length})`} items={preview.skipped.map((s) => `Row ${s.row}: ${s.reason}`)} />
            <Listing title={`Names already there (${preview.duplicates.length}) — allowed, shown so you can check`} items={preview.duplicates.map((d) => `Row ${d.row}: ${d.name} — ${d.where === "tab" ? `already in ${preview.tab}` : "twice in this file"}`)} />
            <Listing title={`Warnings (${preview.warnings.length})`} items={preview.warnings.map((w) => `Row ${w.row}: ${w.message}`)} />
            {preview.duplicates.some((d) => d.where === "tab") && (
              <label className="flex items-center gap-2 text-[13.5px]"><input type="checkbox" checked={skipDup} onChange={(e) => setSkipDup(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
                Skip the {preview.duplicates.filter((d) => d.where === "tab").length} whose name is already in {preview.tab}</label>
            )}
            {preview.sample.length > 0 && (
              <div className="overflow-auto rounded-xl border border-line">
                <table className="w-full text-[13px]">
                  <thead className="bg-surface-2 text-left text-faint"><tr><th className="px-3 py-2 font-medium">Row</th><th className="px-3 py-2 font-medium">Name</th><th className="px-3 py-2 font-medium">One-line description</th><th className="px-3 py-2 font-medium">Contacts</th><th className="px-3 py-2 font-medium">Links</th><th className="px-3 py-2 font-medium">Tags</th></tr></thead>
                  <tbody>{preview.sample.map((s) => (
                    <tr key={s.row} className="border-t border-line"><td className="px-3 py-1.5 text-faint">{s.row}</td><td className="px-3 py-1.5 font-medium">{s.name}</td><td className="max-w-[260px] truncate px-3 py-1.5 text-mute">{s.description}</td>
                      <td className="px-3 py-1.5">{s.contacts || ""}</td><td className="px-3 py-1.5">{s.links || ""}</td><td className="px-3 py-1.5 text-mute">{s.tags.join(", ")}</td></tr>
                  ))}</tbody>
                </table>
                {preview.ready > preview.sample.length && <div className="border-t border-line px-3 py-1.5 text-[12.5px] text-faint">The first {preview.sample.length} of {preview.ready}.</div>}
              </div>
            )}
            <div className="flex items-center gap-3">
              <Button variant="primary" busy={busy === "import"} disabled={toImport < 1} onClick={doImport}>Import {toImport} {toImport === 1 ? "person" : "people"}</Button>
              <Button onClick={() => { setFile(null); setPreview(null); setNoFirst(null); }}>Cancel</Button>
            </div>
          </>}
        </div>
      )}

      {result && (
        <div className="flex flex-col gap-2 rounded-2xl border border-accent-soft bg-accent-softer p-4 text-[13.5px] text-accent-text">
          <div><b>{result.added} {result.added === 1 ? "person" : "people"} added</b> to {result.tab}{result.directory ? ` › ${result.directory}` : " (top level)"}.{result.skipped ? ` ${result.skipped} skipped.` : ""} A backup was made first ({result.backup}).</div>
          {result.failed.length > 0 && <div className="text-danger">{result.failed.map((f) => `Row ${f.row}: ${f.reason}`).join(" · ")}</div>}
          <div><Button size="sm" icon={<RotateCcw size={14} />} onClick={() => undo(result.importId, result.added)}>Undo this import</Button></div>
        </div>
      )}

      <div className="flex items-start gap-2.5 rounded-xl bg-surface-2 px-4 py-3 text-[13px] leading-relaxed text-ink-2">
        <Info size={16} className="mt-0.5 shrink-0 text-faint" />
        <span>Anything a CSV can't carry — <b>photos</b>, more notes, extra phone numbers or links, and placing people in directories — can be added to each person after the import, on their card or by dragging them onto a directory.</span>
      </div>

      {(recent.data ?? []).length > 0 && (
        <details className="text-[13px]">
          <summary className="cursor-pointer font-medium text-ink-2">Recent imports</summary>
          <div className="mt-2 overflow-hidden rounded-xl border border-line">
            {recent.data!.map((r) => (
              <div key={r.id} className="flex items-center gap-3 border-b border-line px-4 py-2 last:border-0">
                <span className="flex-1">{new Date(r.at).toLocaleString()} · <b>{r.count}</b> {r.count === 1 ? "person" : "people"} into {r.tab}{r.directory ? ` › ${r.directory}` : ""}{r.file ? <span className="text-faint"> · {r.file}</span> : null}</span>
                {r.undone ? <span className="text-faint">undone</span> : <Button size="sm" icon={<RotateCcw size={13} />} onClick={() => undo(r.id, r.count)}>Undo</Button>}
              </div>
            ))}
          </div>
        </details>
      )}
    </Card>
  );
}

export function CsvExportCard() {
  const tabs = useTabs();
  const [tabId, setTabId] = useState("");
  return (
    <Card title="Export people to a spreadsheet (CSV)" sub="Opens in Excel, Numbers or Google Sheets. Same columns as the template, plus the tab and directory each person is in — so you can edit an export and import it again.">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Who" htmlFor="csv-export-tab">
          <Select id="csv-export-tab" value={tabId} onChange={(e) => setTabId(e.target.value)} className="min-w-[220px]">
            <option value="">Everyone, all tabs</option>
            {tabs.data?.map((t) => <option key={t.id} value={t.id}>Only the {t.name} tab</option>)}
          </Select>
        </Field>
        <a href={`/api/csv/export${tabId ? `?tabId=${encodeURIComponent(tabId)}` : ""}`} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-accent px-4 text-sm font-medium text-accent-ink hover:brightness-110"><Download size={15} />Download CSV</a>
      </div>
      <p className="text-[12.5px] text-faint">Photos aren't included. Extra phone numbers, emails, addresses and links that don't fit a column go into the “Other …” columns; all notes go into the Notes column, separated by ---.</p>
    </Card>
  );
}
