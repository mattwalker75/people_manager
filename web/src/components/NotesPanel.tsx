/** The notes log: a quick "add a note" box that works without Edit mode, newest first, edit and delete in place. */
import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Note } from "../../../shared/types";
import { api, errorText } from "../lib/api";
import { formatStamp } from "../lib/format";
import { useRefresh, type PersonFull } from "../lib/hooks";
import { useConfirm } from "./confirm";
import { Linkified } from "./PersonView";
import { Button, IconButton, TextArea, TextInput } from "./ui";

export function QuickNote({ personId }: { personId: string }) {
  const refresh = useRefresh();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const add = async () => {
    const body = text.trim(); if (!body) return;
    setBusy(true);
    try { await api.post(`/api/people/${personId}/notes`, { body }); setText(""); await refresh(); toast("Note added."); }
    catch (e) { toast.error(errorText(e)); } finally { setBusy(false); }
  };
  return (
    <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); add(); }}>
      <TextInput value={text} onChange={(e) => setText(e.target.value)} placeholder="Jot something down while you talk… (Enter to add)" aria-label="Add a note" className="rounded-full px-4" />
      <Button type="submit" variant="primary" busy={busy} disabled={!text.trim()}>Add</Button>
    </form>
  );
}

function NoteRow({ personId, n }: { personId: string; n: Note }) {
  const refresh = useRefresh();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(n.body);
  const save = async () => {
    try { await api.patch(`/api/people/${personId}/notes/${n.id}`, { body: text }); setEditing(false); await refresh(); toast("Note saved."); }
    catch (e) { toast.error(errorText(e)); }
  };
  return (
    <li className="group grid grid-cols-[112px_minmax(0,1fr)_64px] gap-3 border-b border-line py-3 last:border-0">
      <span className="pt-0.5 text-[12.5px] text-faint" title={n.updatedAt !== n.createdAt ? `edited ${formatStamp(n.updatedAt)}` : undefined}>{formatStamp(n.createdAt)}</span>
      {editing ? (
        <div className="col-span-2 flex flex-col gap-2">
          <TextArea autoFocus value={text} onChange={(e) => setText(e.target.value)} aria-label="Edit note" />
          <div className="flex justify-end gap-2"><Button size="sm" onClick={() => { setEditing(false); setText(n.body); }}>Cancel</Button><Button size="sm" variant="primary" onClick={save} disabled={!text.trim()}>Save note</Button></div>
        </div>
      ) : (
        <>
          <span className="whitespace-pre-line leading-relaxed"><Linkified text={n.body} /></span>
          <span className="flex justify-end gap-0.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
            <IconButton label="Edit note" size="sm" onClick={() => setEditing(true)}><Pencil size={14} /></IconButton>
            <IconButton label="Delete note" size="sm" className="text-danger" onClick={async () => {
              if (!(await confirm({ title: "Delete this note?", message: n.body.slice(0, 200), confirmLabel: "Delete note", danger: true }))) return;
              try { await api.del(`/api/people/${personId}/notes/${n.id}`); await refresh(); toast("Note deleted."); } catch (e) { toast.error(errorText(e)); }
            }}><Trash2 size={14} /></IconButton>
          </span>
        </>
      )}
    </li>
  );
}

export function NotesList({ person, limit }: { person: PersonFull; limit?: number }) {
  const notes = limit ? person.notes.slice(0, limit) : person.notes;
  if (!notes.length) return <p className="py-2 text-[13.5px] text-faint">No notes yet.</p>;
  return <ul>{notes.map((n) => <NoteRow key={n.id} personId={person.id} n={n} />)}</ul>;
}
