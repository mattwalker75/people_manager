/**
 * Settings: every key in config.json, grouped. Each card saves only its own
 * keys, and each field says whether it applies immediately or needs a restart.
 */
import type { ReactNode } from "react";
import { ArrowLeft, RotateCw } from "lucide-react";
import { go } from "../App";
import type { AppState } from "../lib/hooks";
import { cx } from "../components/ui";
import { BackupsSection } from "./Backups";
import { DataSourceSection, ImportExportSection } from "./DataSource";
import { FieldsSection } from "./Fields";
import { AppearanceSection, GeneralSection, SecuritySection } from "./General";

const SECTIONS: [string, string, string][] = [
  ["general", "General", "Port, network, photos"],
  ["security", "Security", "Login"],
  ["data", "Data source", "JSON, SQLite, MySQL"],
  ["transfer", "Import & export", "CSV, JSON"],
  ["fields", "People fields", "Your own fields"],
  ["appearance", "Appearance", "Themes"],
  ["backups", "Backups", ""],
];

export function Card({ title, sub, children, className }: { title: string; sub?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("flex flex-col gap-4 rounded-2xl border border-line bg-surface p-6", className)}>
      <div><h2 className="font-display text-[20px] font-semibold">{title}</h2>{sub && <p className="mt-1 text-[13.5px] leading-relaxed text-mute">{sub}</p>}</div>
      {children}
    </section>
  );
}

export function SettingsPage({ state, section }: { state: AppState; section: string }) {
  const active = SECTIONS.some(([id]) => id === section) ? section : "general";
  return (
    <div className="mx-6 mb-6 flex min-h-0 flex-1 overflow-hidden rounded-2xl bg-surface shadow-soft">
      <nav aria-label="Settings sections" className="flex w-[250px] shrink-0 flex-col gap-0.5 border-r border-line bg-surface-2 p-3">
        <button type="button" onClick={() => go("/")} className="mb-3 flex h-9 items-center gap-2 rounded-xl px-3 text-[13.5px] text-ink-2 hover:bg-surface"><ArrowLeft size={15} />Back to people</button>
        {SECTIONS.map(([id, name, hint]) => (
          <button key={id} type="button" onClick={() => go(`/settings/${id}`)} aria-current={id === active}
            className={cx("flex h-11 flex-col items-start justify-center rounded-xl px-3 text-left", id === active ? "bg-accent-soft text-accent-text" : "text-ink-2 hover:bg-surface")}>
            <span className={cx("text-[14px]", id === active && "font-semibold")}>{name}</span>
            {hint && <span className="text-[11.5px] text-faint">{hint}</span>}
          </button>
        ))}
        <div className="mt-auto px-3 pt-4 text-[11.5px] leading-relaxed text-faint">People Manager {state.version}<br />Settings are saved in<br /><span className="break-all font-mono">{state.configFile}</span></div>
      </nav>
      <div className="min-w-0 flex-1 overflow-auto">
        <div className="mx-auto flex max-w-[880px] flex-col gap-5 px-10 py-8">
          {state.restartRequired.length > 0 && (
            <div role="status" className="flex items-center gap-3 rounded-2xl border border-warn/30 bg-warn-soft px-4 py-3 text-[13.5px] text-warn">
              <RotateCw size={17} className="shrink-0" />
              <span className="flex-1"><b>Restart needed</b> for {state.restartRequired.map((k) => ({ "server.port": "the new port", "server.allowNetwork": "the network setting", "security.sessionHours": "the sign-in length" })[k] ?? k).join(" and ")} to take effect. Everything else already applies.</span>
              <span className="rounded-lg border border-warn/30 bg-surface px-2 py-1 font-mono text-[12px]">./PEOPLE.sh --restart</span>
            </div>
          )}
          {active === "general" && <GeneralSection state={state} />}
          {active === "security" && <SecuritySection state={state} />}
          {active === "data" && <DataSourceSection state={state} />}
          {active === "transfer" && <ImportExportSection state={state} />}
          {active === "fields" && <FieldsSection />}
          {active === "appearance" && <AppearanceSection state={state} />}
          {active === "backups" && <BackupsSection state={state} />}
        </div>
      </div>
    </div>
  );
}
