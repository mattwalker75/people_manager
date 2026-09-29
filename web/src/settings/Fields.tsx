/**
 * People fields: your own fields on every person (yes/no, one line of text,
 * a paragraph). Deleting a field that people have filled in offers three ways
 * out: clear it person by person, delete it together with every value, or
 * archive it (hidden, values kept).
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { CustomField, CustomFieldType, PersonSummary } from "../../../shared/types";
import { useConfirm } from "../components/confirm";
import { ApplyBadge, Avatar, Button, cx, Field, IconButton, Modal, NameWithNick, Select, TextInput } from "../components/ui";
import { api, errorText } from "../lib/api";
import { summaryPhoto } from "../lib/format";
import { useFields } from "../lib/hooks";
import { Card } from "./SettingsPage";

const TYPES: [CustomFieldType, string][] = [["boolean", "Yes / no"], ["text", "One line of text"], ["paragraph", "A small paragraph"]];
type Usage = PersonSummary & { value: string; path: string };

function DeleteFlow({ field, usage, onClose, onDone }: { field: CustomField; usage: Usage[]; onClose: () => void; onDone: () => void }) {
  const confirm = useConfirm();
  const qc = useQueryClient();
  const call = async (fn: () => Promise<unknown>, done: string) => { try { await fn(); await qc.invalidateQueries(); toast(done); onDone(); } catch (e) { toast.error(errorText(e)); } };
  const clearOne = async (u: Usage) => {
    try {
      const p = await api.get<Record<string, unknown> & { custom: Record<string, string> }>(`/api/people/${u.id}`);
      const custom = { ...p.custom }; delete custom[field.id];
      await api.put(`/api/people/${u.id}`, { ...p, custom });
      await qc.invalidateQueries({ queryKey: ["fieldUsage", field.id] }); await qc.invalidateQueries();
      toast(`Cleared “${field.name}” for ${u.firstName}.`);
    } catch (e) { toast.error(errorText(e)); }
  };
  const shown = (v: string) => (field.type === "boolean" ? (v === "true" ? "Yes" : "No") : v);
  return (
    <Modal open onOpenChange={(v) => !v && onClose()} title={`“${field.name}” is in use`} description={`${usage.length} ${usage.length === 1 ? "person has" : "people have"} a value in this field. Choose what to do.`} className="w-[min(680px,94vw)]">
      <div className="flex flex-col gap-4 px-6 pb-6 pt-4">
        <div className="max-h-[300px] overflow-auto rounded-2xl border border-line">
          {usage.map((u) => (
            <div key={u.id} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-0">
              <Avatar person={u} src={summaryPhoto(u)} size={34} rounded="rounded-lg" />
              <div className="min-w-0 flex-1"><div className="truncate font-medium"><NameWithNick p={u} /></div><div className="truncate text-[12px] text-faint">{u.path} · {shown(u.value)}</div></div>
              <Button size="sm" onClick={() => clearOne(u)}>Clear</Button>
            </div>
          ))}
          {!usage.length && <div className="px-4 py-6 text-center text-accent-text">Nobody has a value any more — the field can be deleted.</div>}
        </div>
        <div className="grid grid-cols-3 gap-2 text-[12.5px] text-mute">
          <span>Clear them one by one, then delete the empty field.</span>
          <span>Or delete the field and every value, in one go.</span>
          <span>Or archive it: hidden everywhere, values kept.</span>
        </div>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button icon={<Archive size={15} />} onClick={() => call(() => api.patch(`/api/fields/${field.id}`, { archived: true }), `“${field.name}” archived.`)}>Archive instead</Button>
          {usage.length ? (
            <Button variant="danger" icon={<Trash2 size={15} />} onClick={async () => {
              if (!(await confirm({ title: `Delete “${field.name}” and its values?`, message: <>The field and the values of <b>{usage.length}</b> {usage.length === 1 ? "person" : "people"} are deleted for good.</>, confirmLabel: "Delete field and values", danger: true, typeToConfirm: "DELETE" }))) return;
              await call(() => api.del(`/api/fields/${field.id}`, { purge: true, confirm: "DELETE" }), `“${field.name}” deleted with ${usage.length} value(s).`);
            }}>Delete from all {usage.length}…</Button>
          ) : (
            <Button variant="danger" icon={<Trash2 size={15} />} onClick={() => call(() => api.del(`/api/fields/${field.id}`, {}), `“${field.name}” deleted.`)}>Delete field</Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

export function FieldsSection() {
  const fields = useFields();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [name, setName] = useState("");
  const [type, setType] = useState<CustomFieldType>("text");
  const [flow, setFlow] = useState<{ field: CustomField; usage: Usage[] } | null>(null);
  const list = fields.data ?? [];
  const call = async (fn: () => Promise<unknown>, done?: string) => { try { await fn(); await qc.invalidateQueries(); if (done) toast(done); return true; } catch (e) { toast.error(errorText(e)); return false; } };

  const openDelete = async (f: CustomField) => {
    try {
      const usage = await api.get<Usage[]>(`/api/fields/${f.id}/usage`);
      if (!usage.length) {
        if (await confirm({ title: `Delete “${f.name}”?`, message: "Nobody has a value in it.", confirmLabel: "Delete field", danger: true })) await call(() => api.del(`/api/fields/${f.id}`, {}), `“${f.name}” deleted.`);
      } else setFlow({ field: f, usage });
    } catch (e) { toast.error(errorText(e)); }
  };
  const refreshFlow = async () => {
    if (!flow) return;
    const exists = (await api.get<CustomField[]>("/api/fields")).some((f) => f.id === flow.field.id && !f.archived);
    if (!exists) { setFlow(null); return; }
    setFlow({ ...flow, usage: await api.get<Usage[]>(`/api/fields/${flow.field.id}/usage`) });
  };
  const move = (i: number, by: number) => { const ids = list.map((f) => f.id); const [x] = ids.splice(i, 1); ids.splice(i + by, 0, x); call(() => api.post("/api/fields/reorder", { ids })); };

  return (
    <>
      <h1 className="font-display text-[28px] font-semibold">People fields</h1>
      <Card title="Your own fields" sub={<>Added to every person, under <b>More</b> on their card. Changes apply immediately <ApplyBadge />.</>}>
        {list.length ? (
          <div className="overflow-hidden rounded-2xl border border-line">
            {list.map((f, i) => (
              <div key={f.id} className={cx("grid grid-cols-[minmax(0,1fr)_200px_auto] items-center gap-3 border-b border-line px-4 py-2.5 last:border-0", f.archived && "bg-surface-2")}>
                <TextInput aria-label="Field name" defaultValue={f.name} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== f.name) call(() => api.patch(`/api/fields/${f.id}`, { name: v }), "Field renamed."); }} className={cx(f.archived && "text-faint")} />
                <Select aria-label="Field type" value={f.type} onChange={(e) => call(() => api.patch(`/api/fields/${f.id}`, { type: e.target.value }), "Field type changed.")}>
                  {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Select>
                <span className="flex items-center gap-0.5">
                  {f.archived && <span className="mr-1 rounded-full bg-line px-2 py-0.5 text-[11px] text-mute">archived</span>}
                  <IconButton label="Move up" size="sm" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={14} /></IconButton>
                  <IconButton label="Move down" size="sm" disabled={i === list.length - 1} onClick={() => move(i, 1)}><ArrowDown size={14} /></IconButton>
                  <IconButton label={f.archived ? "Bring back" : "Archive"} size="sm" onClick={() => call(() => api.patch(`/api/fields/${f.id}`, { archived: !f.archived }), f.archived ? "Field brought back." : "Field archived.")}>
                    {f.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                  </IconButton>
                  <IconButton label="Delete field" size="sm" className="text-danger" onClick={() => openDelete(f)}><Trash2 size={14} /></IconButton>
                </span>
              </div>
            ))}
          </div>
        ) : <p className="text-[13.5px] text-faint">No fields yet.</p>}
        <p className="text-[12.5px] text-faint">A one-line field and a paragraph can switch type at any time. A yes/no field can change type only while nobody has a value in it.</p>
        <form className="grid grid-cols-[minmax(0,1fr)_200px_auto] items-end gap-3 rounded-2xl bg-surface-2 p-4" onSubmit={async (e) => {
          e.preventDefault(); if (!name.trim()) return;
          if (await call(() => api.post("/api/fields", { name: name.trim(), type }), `Field “${name.trim()}” added.`)) setName("");
        }}>
          <Field label="New field" htmlFor="nf-name"><TextInput id="nf-name" placeholder="e.g. Golf handicap" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Type" htmlFor="nf-type"><Select id="nf-type" value={type} onChange={(e) => setType(e.target.value as CustomFieldType)}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
          <Button type="submit" variant="primary" icon={<Plus size={15} />} disabled={!name.trim()}>Add field</Button>
        </form>
      </Card>
      {flow && <DeleteFlow field={flow.field} usage={flow.usage} onClose={() => setFlow(null)} onDone={refreshFlow} />}
    </>
  );
}
