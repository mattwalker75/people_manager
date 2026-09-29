import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Download, FileJson, Hammer, PlugZap } from "lucide-react";
import { toast } from "sonner";
import type { DataSourceStatus } from "../../../shared/types";
import { useConfirm } from "../components/confirm";
import { ApplyBadge, Button, cx, Field, TextInput } from "../components/ui";
import { api, errorText } from "../lib/api";
import type { AppConfig, AppState } from "../lib/hooks";
import { Card } from "./SettingsPage";
import { useSaveSettings } from "./General";

type DS = AppConfig["dataSource"];
const ENGINES: [DS["type"], string, string][] = [
  ["json", "JSON file", "One readable file. Simplest; fine for a few thousand people."],
  ["sqlite", "SQLite", "A database file on this computer. Fast at any size. Recommended."],
  ["mysql", "MySQL / MariaDB", "A database server — on this computer or elsewhere on your network."],
];

function StatusLine({ st }: { st: DataSourceStatus }) {
  return (
    <div className={cx("flex items-start gap-2.5 rounded-xl px-4 py-3 text-[13.5px]", st.ok ? "bg-accent-softer text-accent-text" : "bg-warn-soft text-warn")}>
      {st.ok ? <CheckCircle2 size={17} className="mt-0.5 shrink-0" /> : <AlertTriangle size={17} className="mt-0.5 shrink-0" />}
      <span className="flex-1">{st.message}{st.ok && st.counts && <span className="text-ink-2"> · {st.counts.people} people in {st.counts.tabs} tabs, {st.counts.directories} directories</span>}</span>
    </div>
  );
}

export function DataSourceSection({ state }: { state: AppState }) {
  const save = useSaveSettings();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [ds, setDs] = useState<DS>(state.config.dataSource);
  const [test, setTest] = useState<DataSourceStatus | null>(null);
  const [busy, setBusy] = useState("");
  useEffect(() => { setDs(state.config.dataSource); setTest(null); }, [state.config.dataSource]);
  const current = state.config.dataSource;
  const dirty = JSON.stringify(ds) !== JSON.stringify(current);
  const set = (patch: Partial<DS>) => { setDs({ ...ds, ...patch }); setTest(null); };
  const setMy = (patch: Partial<DS["mysql"]>) => set({ mysql: { ...ds.mysql, ...patch } });

  const apply = async () => {
    if (ds.type !== current.type && !(await confirm({ title: `Switch to ${ENGINES.find((e) => e[0] === ds.type)![1]}?`,
      message: <>People Manager will read and write the new data source from now on. <b>It starts empty</b> unless it already holds data — your current people stay where they are. To bring them across, use <b>Import &amp; export</b> after switching.</>, confirmLabel: "Switch" }))) return;
    await save({ dataSource: ds }, "Data source saved.");
  };
  const runTest = async () => {
    setBusy("test");
    try { setTest(await api.post<DataSourceStatus>("/api/datasource/test", ds)); } catch (e) { toast.error(errorText(e)); } finally { setBusy(""); }
  };
  const target = current.type === "sqlite" ? <span className="font-mono">{current.sqlite.path}</span> : <>the “{current.mysql.database}” database</>;
  const rebuildOk = () => confirm({ title: "Rebuild the database?", confirmLabel: "Rebuild", danger: true, typeToConfirm: "REBUILD",
    message: <>This <b>erases everything</b> in {target} and creates empty tables. Export or back up first if you want to keep what is there.</> });
  const build = async () => {
    setBusy("build");
    try {
      if (state.dataSource.needsBuild) {
        if (!(await confirm({ title: "Build the database?", message: <>This creates People Manager's tables in {target}. It starts empty.</>, confirmLabel: "Build database" }))) return;
        try { await api.post("/api/datasource/build", {}); }
        catch (e) { if ((e as { status?: number }).status !== 409) throw e; if (!(await rebuildOk())) return; await api.post("/api/datasource/build", { rebuild: true, confirm: "REBUILD" }); }
      } else {
        if (!(await rebuildOk())) return;
        await api.post("/api/datasource/build", { rebuild: true, confirm: "REBUILD" });
      }
      await qc.invalidateQueries(); toast("Database ready.");
    } catch (e) { toast.error(errorText(e)); } finally { setBusy(""); }
  };

  return (
    <>
      <h1 className="font-display text-[28px] font-semibold">Data source</h1>
      <Card title="In use now" sub={<>Where your tabs, directories and people are stored. Photos always stay in <span className="font-mono">{state.photosDir}</span>.</>}>
        <StatusLine st={state.dataSource} />
        {current.type !== "json" && (
          <div className="flex flex-wrap items-center gap-2">
            <Button icon={<Hammer size={15} />} busy={busy === "build"} onClick={build}>{state.dataSource.needsBuild && !state.dataSource.counts ? "Build database" : "Rebuild database…"}</Button>
            <span className="text-[12.5px] text-faint">Prefer the terminal? <span className="font-mono">./SETUP_{current.type === "sqlite" ? "SQLITE" : "MYSQL"}_DB.sh</span> does the same.</span>
          </div>
        )}
      </Card>
      <Card title="Choose a data source" sub={<>Switching applies immediately <ApplyBadge />. A new source starts empty — bring your people across with Import &amp; export.</>}>
        <div className="grid grid-cols-3 gap-3">
          {ENGINES.map(([id, name, desc]) => (
            <button key={id} type="button" onClick={() => set({ type: id })} aria-pressed={ds.type === id}
              className={cx("flex flex-col gap-1 rounded-2xl border-2 p-4 text-left", ds.type === id ? "border-accent bg-accent-softer" : "border-line hover:border-line-2")}>
              <span className="flex items-center gap-2 font-semibold"><span className={cx("h-3.5 w-3.5 rounded-full border-2", ds.type === id ? "border-[4px] border-accent" : "border-line-2")} />{name}{current.type === id && <span className="ml-auto rounded-full bg-accent px-2 py-0.5 text-[10.5px] font-semibold text-accent-ink">in use</span>}</span>
              <span className="text-[12.5px] leading-snug text-mute">{desc}</span>
            </button>
          ))}
        </div>
        {ds.type === "json" && <Field label="JSON file" htmlFor="ds-json" hint="Created when you first add something."><TextInput id="ds-json" className="font-mono text-[13px]" value={ds.json.path} onChange={(e) => set({ json: { path: e.target.value } })} /></Field>}
        {ds.type === "sqlite" && <Field label="Database file" htmlFor="ds-sqlite" hint="A new file needs “Build database” once."><TextInput id="ds-sqlite" className="font-mono text-[13px]" value={ds.sqlite.path} onChange={(e) => set({ sqlite: { path: e.target.value } })} /></Field>}
        {ds.type === "mysql" && (
          <div className="grid grid-cols-[1fr_120px] gap-3">
            <Field label="Host" htmlFor="ds-host"><TextInput id="ds-host" value={ds.mysql.host} onChange={(e) => setMy({ host: e.target.value })} /></Field>
            <Field label="Port" htmlFor="ds-port"><TextInput id="ds-port" inputMode="numeric" value={String(ds.mysql.port)} onChange={(e) => setMy({ port: Number(e.target.value.replace(/\D/g, "")) || 0 })} /></Field>
            <Field label="Database" htmlFor="ds-db"><TextInput id="ds-db" value={ds.mysql.database} onChange={(e) => setMy({ database: e.target.value })} /></Field>
            <span />
            <Field label="User" htmlFor="ds-user"><TextInput id="ds-user" value={ds.mysql.user} onChange={(e) => setMy({ user: e.target.value })} /></Field>
            <span />
            <Field label="Password" htmlFor="ds-pw" hint="Saved in config.json on this computer (owner-only). Shown hidden once saved."><TextInput id="ds-pw" type="password" value={ds.mysql.password} onChange={(e) => setMy({ password: e.target.value })} /></Field>
            <span />
            <p className="col-span-2 text-[12.5px] text-faint"><span className="font-mono">./SETUP_MYSQL_DB.sh</span> creates this database and user and builds the tables in one go.</p>
          </div>
        )}
        {test && <StatusLine st={test} />}
        <div className="flex gap-2">
          <Button icon={<PlugZap size={15} />} busy={busy === "test"} onClick={runTest}>Test these settings</Button>
          <Button variant="primary" disabled={!dirty} onClick={apply}>{ds.type !== current.type ? "Switch data source" : "Save"}</Button>
        </div>
      </Card>
    </>
  );
}

// ---------------------------------------------------------------- import / export
interface Report { ok: boolean; file: string; counts: Record<string, number>; errors: string[]; warnings: string[]; moreErrors: number; moreWarnings: number }

export function ImportExportSection({ state }: { state: AppState }) {
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [file, setFile] = useState(state.config.dataSource.json.path);
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState("");
  const stamp = () => { const d = new Date(), p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; };
  const [out, setOut] = useState(`./data/export-${stamp()}.json`);
  const ds = state.config.dataSource;
  const target = ds.type === "json" ? `the JSON file ${ds.json.path}` : ds.type === "sqlite" ? `the SQLite database ${ds.sqlite.path}` : `the MySQL database “${ds.mysql.database}”`;

  const validate = async () => {
    setBusy("validate"); setReport(null);
    try { setReport(await api.post<Report>("/api/import/validate", { file })); } catch (e) { toast.error(errorText(e)); } finally { setBusy(""); }
  };
  const doImport = async (mode: "replace" | "add") => {
    const people = report?.counts.people ?? 0;
    const ok = await confirm(mode === "replace"
      ? { title: "Replace everything?", message: <>Everything in {target} is <b>deleted</b> and replaced with the {people} people in this file.</>, confirmLabel: "Replace all", danger: true, typeToConfirm: "REPLACE" }
      : { title: "Add alongside?", message: <>The {people} people in this file are added next to what is already in {target}. Tabs with the same name get “(imported)” added.</>, confirmLabel: "Add alongside" });
    if (!ok) return;
    setBusy(mode);
    try {
      const r = await api.post<{ counts: { people: number }; warnings: number }>("/api/import", { file, mode, confirm: mode === "replace" ? "REPLACE" : undefined });
      await qc.invalidateQueries(); toast(`Imported ${r.counts.people} people.${r.warnings ? ` ${r.warnings} warning(s) — see the report.` : ""}`);
    } catch (e) { toast.error(errorText(e)); } finally { setBusy(""); }
  };
  const doExport = async () => {
    setBusy("export");
    try { const r = await api.post<{ file: string; counts: { people: number } }>("/api/export", { file: out }); toast(`Exported ${r.counts.people} people to ${r.file}.`); setOut(`./data/export-${stamp()}.json`); }
    catch (e) { toast.error(errorText(e)); } finally { setBusy(""); }
  };

  return (
    <>
      <h1 className="font-display text-[28px] font-semibold">Import &amp; export</h1>
      <div className="flex items-start gap-2.5 rounded-2xl bg-warn-soft px-4 py-3 text-[13.5px] text-warn">
        <AlertTriangle size={17} className="mt-0.5 shrink-0" />
        <span><b>Photos are not included</b> in imports or exports — they can be gigabytes. They live in <span className="font-mono">{state.photosDir}</span>; copy that folder yourself when you move to another computer.</span>
      </div>
      <Card title="Import a JSON file" sub={<>Into what you use now: {target}. Validate first — nothing changes until you choose Replace all or Add alongside.</>}>
        <div className="flex gap-2">
          <TextInput aria-label="JSON file to import" className="font-mono text-[13px]" value={file} onChange={(e) => { setFile(e.target.value); setReport(null); }} />
          <Button variant="primary" icon={<FileJson size={15} />} busy={busy === "validate"} onClick={validate}>Validate data</Button>
        </div>
        {report && (
          <div className="overflow-hidden rounded-2xl border border-line">
            <div className="flex flex-wrap gap-x-5 gap-y-1 border-b border-line bg-surface-2 px-4 py-3 text-[13.5px]">
              {Object.entries(report.counts).map(([k, v]) => <span key={k}><b>{v}</b> {k.replace(/([A-Z])/g, " $1").toLowerCase()}</span>)}
              <span className="flex-1" />
              <span className={report.errors.length ? "font-semibold text-danger" : "text-accent-text"}>{report.errors.length + report.moreErrors} errors</span>
              <span className="text-warn">{report.warnings.length + report.moreWarnings} warnings</span>
            </div>
            <ul className="max-h-[300px] overflow-auto text-[13px]">
              {report.errors.map((m, i) => <li key={`e${i}`} className="grid grid-cols-[80px_1fr] gap-3 border-b border-line px-4 py-2"><span className="font-semibold text-danger">Error</span><span>{m}</span></li>)}
              {report.moreErrors > 0 && <li className="px-4 py-2 text-faint">…and {report.moreErrors} more errors</li>}
              {report.warnings.map((m, i) => <li key={`w${i}`} className="grid grid-cols-[80px_1fr] gap-3 border-b border-line px-4 py-2"><span className="font-medium text-warn">Warning</span><span>{m}</span></li>)}
              {report.moreWarnings > 0 && <li className="px-4 py-2 text-faint">…and {report.moreWarnings} more warnings</li>}
              {!report.errors.length && !report.warnings.length && <li className="px-4 py-3 text-accent-text">No problems found.</li>}
            </ul>
            <div className="flex items-center gap-2 px-4 py-3">
              <span className="flex-1 text-[13px] text-mute">{report.ok ? (state.dataSource.counts?.people ? `${target} already holds ${state.dataSource.counts.people} people.` : `${target} is empty.`) : "Fix the errors in the file, then validate again."}</span>
              <Button disabled={!report.ok} busy={busy === "add"} onClick={() => doImport("add")}>Add alongside</Button>
              <Button variant="danger-outline" disabled={!report.ok} busy={busy === "replace"} onClick={() => doImport("replace")}>Replace all…</Button>
            </div>
          </div>
        )}
      </Card>
      <Card title="Export to a JSON file" sub="Everything in the data source you use now, in the same format as the JSON data source — so an export can be imported, or used directly as a JSON data source.">
        <div className="flex gap-2">
          <TextInput aria-label="Export to file" className="font-mono text-[13px]" value={out} onChange={(e) => setOut(e.target.value)} />
          <Button variant="primary" busy={busy === "export"} onClick={doExport}>Export</Button>
          <a href="/api/export/download" className="inline-flex h-10 items-center gap-1.5 rounded-full border border-line-2 bg-surface px-4 text-sm font-medium hover:bg-surface-2"><Download size={15} />Download</a>
        </div>
      </Card>
    </>
  );
}
