import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "../components/confirm";
import { ApplyBadge, Button, cx, Field, TextInput, Toggle } from "../components/ui";
import { api, errorText } from "../lib/api";
import type { AppState } from "../lib/hooks";
import { applyTheme, currentTokens, THEME_TOKENS, type CustomTheme } from "../lib/theme";
import { Card } from "./SettingsPage";

/** PUT a partial settings object; refresh state; report what needs a restart. */
export function useSaveSettings() {
  const qc = useQueryClient();
  return async (patch: unknown, done = "Saved.") => {
    try {
      const r = await api.put<{ restartRequired: string[] }>("/api/settings", patch);
      await qc.invalidateQueries();
      toast(r.restartRequired.length ? `${done} Restart People Manager to apply it (./PEOPLE.sh --restart).` : done);
      return true;
    } catch (e) { toast.error(errorText(e)); return false; }
  };
}

export function GeneralSection({ state }: { state: AppState }) {
  const save = useSaveSettings();
  const c = state.config;
  const [port, setPort] = useState(String(c.server.port));
  const [network, setNetwork] = useState(c.server.allowNetwork);
  const [maxPhotos, setMaxPhotos] = useState(String(c.photos.maxPerPerson));
  const [photosDir, setPhotosDir] = useState(c.photos.dir);
  useEffect(() => { setPort(String(c.server.port)); setNetwork(c.server.allowNetwork); setMaxPhotos(String(c.photos.maxPerPerson)); setPhotosDir(c.photos.dir); }, [c]);
  return (
    <>
      <h1 className="font-display text-[28px] font-semibold">General</h1>
      <Card title="Server" sub="Where People Manager listens. Both settings take effect after a restart.">
        <div className="grid grid-cols-[200px_1fr] items-start gap-4">
          <Field label="Port" htmlFor="g-port" badge={<ApplyBadge restart />}><TextInput id="g-port" inputMode="numeric" value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, ""))} /></Field>
          <Field label="Allow other devices on my network" badge={<ApplyBadge restart />}
            hint={network ? "Anyone on your network can reach it at this computer's address." : "Only this computer can open People Manager (127.0.0.1)."}>
            <div className="flex h-10 items-center"><Toggle label="Allow other devices on my network" checked={network} onChange={setNetwork} /></div>
          </Field>
        </div>
        {c.server.allowNetwork && state.networkUrls.length > 0 && (
          <div className="rounded-xl bg-surface-2 px-4 py-3 text-[13px]"><div className="mb-1 text-faint">Open it from another device at:</div>{state.networkUrls.map((u) => <div key={u} className="font-mono">{u}</div>)}</div>
        )}
        {network && !c.security.loginEnabled && (
          <div className="flex items-start gap-2 rounded-xl bg-warn-soft px-4 py-3 text-[13px] text-warn"><AlertTriangle size={16} className="mt-0.5 shrink-0" />With network access on and the login off, anyone on your network can open and change your people. Turn the login on in Security if other people use this network.</div>
        )}
        <div><Button variant="primary" onClick={() => save({ server: { port: Number(port), allowNetwork: network } })}>Save</Button></div>
      </Card>
      <Card title="Photos" sub="Photos are files on this computer; the data source only remembers their names.">
        <div className="grid grid-cols-[200px_1fr] items-start gap-4">
          <Field label="Photos per person" htmlFor="g-max" badge={<ApplyBadge />}><TextInput id="g-max" inputMode="numeric" value={maxPhotos} onChange={(e) => setMaxPhotos(e.target.value.replace(/\D/g, ""))} /></Field>
          <Field label="Photos folder" htmlFor="g-dir" badge={<ApplyBadge />} hint={<>Now: <span className="font-mono">{state.photosDir}</span>. Changing it does not move existing photos — copy the folder yourself.</>}>
            <TextInput id="g-dir" className="font-mono text-[13px]" value={photosDir} onChange={(e) => setPhotosDir(e.target.value)} />
          </Field>
        </div>
        <div><Button variant="primary" onClick={() => save({ photos: { maxPerPerson: Number(maxPhotos), dir: photosDir } })}>Save</Button></div>
      </Card>
    </>
  );
}

export function SecuritySection({ state }: { state: AppState }) {
  const save = useSaveSettings();
  const confirm = useConfirm();
  const c = state.config.security;
  const [enabled, setEnabled] = useState(c.loginEnabled);
  const [file, setFile] = useState(c.passwordFile);
  const [hours, setHours] = useState(String(c.sessionHours));
  useEffect(() => { setEnabled(c.loginEnabled); setFile(c.passwordFile); setHours(String(c.sessionHours)); }, [c]);
  const submit = async () => {
    if (enabled && !c.loginEnabled && !(await confirm({ title: "Turn the login on?", message: "You will be asked for a login name and password straight away. If no login exists yet, you will create one now.", confirmLabel: "Turn it on" }))) return;
    await save({ security: { loginEnabled: enabled, passwordFile: file, sessionHours: Number(hours) } });
  };
  return (
    <>
      <h1 className="font-display text-[28px] font-semibold">Security</h1>
      <Card title="Login" sub="Off: opening People Manager takes you straight in. On: you sign in first. It works like My Business Manager — one login, kept in a password file.">
        <Field label="Ask for a login" badge={<ApplyBadge />}><div className="flex h-10 items-center"><Toggle label="Ask for a login" checked={enabled} onChange={setEnabled} /></div></Field>
        <div className="grid grid-cols-[1fr_200px] items-start gap-4">
          <Field label="Password file" htmlFor="s-file" badge={<ApplyBadge />} hint={<>Now: <span className="font-mono">{state.passwordFile}</span></>}>
            <TextInput id="s-file" className="font-mono text-[13px]" value={file} onChange={(e) => setFile(e.target.value)} />
          </Field>
          <Field label="Stay signed in for (hours)" htmlFor="s-hours" badge={<ApplyBadge restart />} hint="Applies to new sign-ins after a restart.">
            <TextInput id="s-hours" inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value.replace(/\D/g, ""))} />
          </Field>
        </div>
        <div className="rounded-xl bg-surface-2 px-4 py-3 text-[13px] leading-relaxed text-ink-2">
          <b>Forgot the password?</b> Delete the password file and reload the page — you will be asked to create a new login. Your people are never touched. Restarting People Manager signs everyone out.
        </div>
        <div><Button variant="primary" onClick={submit}>Save</Button></div>
      </Card>
    </>
  );
}

// ---------------------------------------------------------------- appearance
const PRESETS: [string, string, string, string][] = [["light", "Light", "#eef1f0", "#0f766e"], ["dark", "Dark", "#1a201f", "#3cc2b1"], ["system", "System", "#eef1f0", "#1a201f"]];

export function AppearanceSection({ state }: { state: AppState }) {
  const save = useSaveSettings();
  const confirm = useConfirm();
  const a = state.config.appearance;
  const [editing, setEditing] = useState<CustomTheme | null>(null);
  useEffect(() => () => applyTheme(a.theme, a.customThemes), [a]); // leaving the page ends any preview
  const pick = (id: string) => save({ appearance: { theme: id } }, "Theme changed.");
  const startNew = () => setEditing({ id: "", name: "", dark: document.documentElement.dataset.theme === "dark", tokens: currentTokens() });
  const preview = (t: CustomTheme) => { setEditing(t); applyTheme("", [], t); };
  const saveTheme = async () => {
    if (!editing) return;
    if (!editing.name.trim()) { toast.error("Give the theme a name."); return; }
    const id = editing.id || `custom-${editing.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${Date.now().toString(36).slice(-4)}`;
    const list = [...a.customThemes.filter((t) => t.id !== id), { ...editing, id, name: editing.name.trim() }];
    if (await save({ appearance: { customThemes: list, theme: id } }, `Theme “${editing.name.trim()}” saved and applied.`)) setEditing(null);
  };
  const remove = async (t: CustomTheme) => {
    if (!(await confirm({ title: `Delete the theme “${t.name}”?`, message: "This only removes the colours; nothing else changes.", confirmLabel: "Delete theme", danger: true }))) return;
    await save({ appearance: { customThemes: a.customThemes.filter((x) => x.id !== t.id), theme: a.theme === t.id ? "light" : a.theme } }, "Theme deleted.");
  };
  const swatch = (bg: string, acc: string) => <span className="h-10 w-full rounded-xl border border-line" style={{ background: `linear-gradient(135deg, ${bg} 58%, ${acc} 58%)` }} />;
  return (
    <>
      <h1 className="font-display text-[28px] font-semibold">Appearance</h1>
      <Card title="Theme" sub={<>Applies immediately. <b>System</b> follows your computer's light or dark setting.</>}>
        <div className="grid grid-cols-4 gap-3">
          {PRESETS.map(([id, name, bg, acc]) => (
            <button key={id} type="button" onClick={() => pick(id)} aria-pressed={a.theme === id}
              className={cx("flex flex-col gap-2 rounded-2xl border-2 p-2.5 text-left text-[13.5px]", a.theme === id ? "border-accent" : "border-line hover:border-line-2")}>
              {swatch(bg, acc)}<span className="flex items-center justify-between font-medium">{name}{a.theme === id && <Check size={15} className="text-accent" />}</span>
            </button>
          ))}
          {a.customThemes.map((t) => (
            <div key={t.id} className={cx("flex flex-col gap-2 rounded-2xl border-2 p-2.5 text-[13.5px]", a.theme === t.id ? "border-accent" : "border-line")}>
              <button type="button" onClick={() => pick(t.id)} aria-pressed={a.theme === t.id}>{swatch(t.tokens.bg, t.tokens.accent)}</button>
              <span className="flex items-center gap-1 font-medium"><span className="flex-1 truncate">{t.name}</span>
                <button type="button" aria-label={`Edit ${t.name}`} onClick={() => preview(t)} className="rounded p-1 text-faint hover:text-ink"><Pencil size={13} /></button>
                <button type="button" aria-label={`Delete ${t.name}`} onClick={() => remove(t)} className="rounded p-1 text-faint hover:text-danger"><Trash2 size={13} /></button>
              </span>
            </div>
          ))}
        </div>
        {!editing && <div><Button icon={<Plus size={15} />} onClick={startNew}>Create your own theme</Button></div>}
      </Card>
      {editing && (
        <Card title={editing.id ? `Edit “${editing.name}”` : "Your own theme"} sub="Starts from the colours on screen now. Changes preview live; Save applies and keeps it.">
          <div className="grid grid-cols-[1fr_auto] items-end gap-4">
            <Field label="Name" htmlFor="th-name"><TextInput id="th-name" value={editing.name} placeholder="e.g. Harbor" onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
            <label className="flex h-10 items-center gap-2 text-[13.5px]"><Toggle label="Dark theme" checked={editing.dark} onChange={(v) => preview({ ...editing, dark: v })} />Dark theme</label>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {THEME_TOKENS.map(([k, label]) => (
              <label key={k} className="flex items-center gap-2.5 rounded-xl border border-line px-3 py-2 text-[13px]">
                <input type="color" value={editing.tokens[k] || "#888888"} onChange={(e) => preview({ ...editing, tokens: { ...editing.tokens, [k]: e.target.value } })} className="h-7 w-9 cursor-pointer rounded border-0 bg-transparent p-0" />
                {label}
              </label>
            ))}
          </div>
          <div className="flex gap-2"><Button variant="primary" onClick={saveTheme}>Save theme</Button><Button onClick={() => { setEditing(null); applyTheme(a.theme, a.customThemes); }}>Cancel</Button></div>
        </Card>
      )}
    </>
  );
}
