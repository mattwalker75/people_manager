/**
 * The person card (layout C with B's section tabs): a photo column with an
 * "at a glance" list on the left; on the right the name, one-liner and key
 * facts, then the section tabs — which stick to the top as you scroll — and
 * the section. View by default; Edit switches the right side to the form.
 * Also used to create a person (it opens straight in the form).
 */
import { useEffect, useRef, useState } from "react";
import { Folder, FolderInput, MoreHorizontal, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type { Id } from "../../../shared/types";
import { useActions } from "../lib/actions";
import { api, errorText } from "../lib/api";
import { formatBirthday, formatDate } from "../lib/format";
import { useFields, usePerson, useRefresh, type AppState, type PersonFull } from "../lib/hooks";
import { MoveDialog } from "./dialogs";
import { NotesList, QuickNote } from "./NotesPanel";
import { draftFrom, PersonEditor, type Draft } from "./PersonEditor";
import { ContactTab, DetailsTab, MoreTab, OverviewTab } from "./PersonView";
import { PhotoPanel } from "./PhotoPanel";
import { Avatar, Button, cx, IconButton, Menu, Modal, NameWithNick, Spinner } from "./ui";

type Section = "overview" | "contact" | "notes" | "details" | "more";

export function PersonDialog({ state, personId, createAt, onClose, onCreated }: {
  state: AppState; personId: Id | null; createAt: { tabId: Id; directoryId: Id | null } | null; onClose: () => void; onCreated: (id: Id) => void;
}) {
  const open = !!personId || !!createAt;
  const q = usePerson(personId);
  const fields = useFields();
  const refresh = useRefresh();
  const actions = useActions();
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [section, setSection] = useState<Section>("overview");
  const [draft, setDraft] = useState<Draft>(draftFrom(null));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [moving, setMoving] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => { if (open) { setSection("overview"); setError(""); } }, [personId, createAt, open]);
  useEffect(() => { if (createAt) { setMode("edit"); setDraft(draftFrom(null)); } else setMode("view"); }, [createAt, personId]);
  useEffect(() => { scroller.current?.scrollTo({ top: 0 }); }, [section, mode]);

  const p = createAt ? null : q.data ?? null;
  const editing = mode === "edit";
  const max = state.config.photos.maxPerPerson;

  const startEdit = () => { if (p) { setDraft(draftFrom(p)); setError(""); setMode("edit"); } };
  const save = async () => {
    if (!draft.firstName.trim()) { setError("A person needs at least a first name."); scroller.current?.scrollTo({ top: 0 }); return; }
    setBusy(true); setError("");
    try {
      if (createAt) {
        const made = await api.post<PersonFull>("/api/people", { ...draft, tabId: createAt.tabId, directoryId: createAt.directoryId });
        await refresh(); toast(`${made.firstName} added.`); onCreated(made.id);
      } else if (p) {
        const before = draftFrom(p);
        await api.put(`/api/people/${p.id}`, draft);
        await refresh(); setMode("view");
        toast(`Saved ${draft.firstName}.`, { action: { label: "Undo", onClick: async () => { try { await api.put(`/api/people/${p.id}`, before); await refresh(); toast("Change undone."); } catch (e) { toast.error(errorText(e)); } } } });
      }
    } catch (e) { setError(errorText(e)); scroller.current?.scrollTo({ top: 0 }); }
    finally { setBusy(false); }
  };
  const cancel = () => { if (createAt) onClose(); else setMode("view"); setError(""); };

  const glance: [string, string][] = p ? ([
    ["Title", p.title], ["Business category", p.businessCategory], ["Met on", p.dateMet ? formatDate(p.dateMet) : ""],
    ["Birthday", p.birthday ? formatBirthday(p.birthday) : ""], ["From", p.fromPlace],
  ] as [string, string][]).filter(([, v]) => v) : [];
  const sections: [Section, string][] = [["overview", "Overview"], ["contact", "Contact & links"], ["notes", p ? `Notes · ${p.notes.length}` : "Notes"], ["details", "Details"], ["more", "More"]];

  return (
    <Modal open={open} onOpenChange={(v) => { if (!v) onClose(); }} title={p ? `${p.firstName} ${p.lastName}` : "New person"} hideTitle
      className="flex h-[min(860px,92vh)] w-[min(1120px,96vw)] overflow-hidden !rounded-[22px]">
      {/* photo column */}
      <aside className="flex w-[300px] shrink-0 flex-col gap-4 overflow-auto border-r border-line bg-surface-2 p-[22px]">
        {p ? <PhotoPanel person={p} max={max} />
          : createAt ? (
            <div className="flex flex-col gap-3">
              <Avatar person={{ firstName: draft.firstName || "?", lastName: draft.lastName }} size={256} rounded="rounded-[18px]" className="!h-auto aspect-square !w-full font-display !text-[72px]" />
              <p className="text-[12.5px] text-mute">Photos can be added once the person is saved.</p>
            </div>
          ) : <Spinner />}
        {glance.length > 0 && !editing && (
          <div className="flex flex-col gap-2.5 border-t border-line pt-4">
            <div className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-faint">At a glance</div>
            {glance.map(([k, v]) => <div key={k} className="flex flex-col"><span className="text-[12px] text-faint">{k}</span><span className="text-[14px]">{v}</span></div>)}
          </div>
        )}
      </aside>

      {/* right side: one scroll area */}
      <div ref={scroller} className="relative min-w-0 flex-1 overflow-auto">
        <div className="flex items-start gap-2.5 px-[30px] pb-4 pt-[26px]">
          <div className="min-w-0 flex-1">
            {p && <div className="mb-1 flex items-center gap-1.5 text-[12.5px] text-mute"><Folder size={13} />{p.path}</div>}
            <h2 className="font-display text-[34px] font-semibold leading-[1.1] tracking-tight">
              {editing ? (createAt ? (draft.firstName ? <NameWithNick p={draft} /> : "New person") : <>Editing <NameWithNick p={draft} /></>) : p ? <NameWithNick p={p} nickClass="font-medium text-faint" /> : "…"}
            </h2>
            {!editing && p?.description && <p className="mt-1.5 text-[15px] text-ink-2">{p.description}</p>}
          </div>
          {!editing && p && <>
            <Button icon={<Pencil size={14} />} onClick={startEdit}>Edit</Button>
            <Menu trigger={<IconButton label="More" className="border border-line-2"><MoreHorizontal size={16} /></IconButton>} items={[
              { label: "Move to…", icon: <FolderInput size={14} />, onSelect: () => setMoving(true) },
              "sep",
              { label: "Delete person…", icon: <Trash2 size={14} />, danger: true, onSelect: async () => { if (await actions.deletePerson(p)) onClose(); } },
            ]} />
          </>}
          <IconButton label="Close" className="border border-line-2" onClick={onClose}><X size={16} /></IconButton>
        </div>

        {editing ? (
          <>
            <div className="px-[30px] pb-28"><PersonEditor draft={draft} setDraft={setDraft} fields={fields.data ?? []} error={error} /></div>
            <div className="sticky bottom-0 flex items-center gap-2 border-t border-line bg-surface/95 px-[30px] py-3.5 backdrop-blur">
              {p && <Button variant="danger-outline" icon={<Trash2 size={14} />} onClick={async () => { if (await actions.deletePerson(p)) onClose(); }}>Delete person…</Button>}
              <div className="flex-1" />
              <Button onClick={cancel}>Cancel</Button>
              <Button variant="primary" busy={busy} onClick={save}>{createAt ? "Add person" : "Save"}</Button>
            </div>
          </>
        ) : p ? (
          <>
            {p.keyFacts.length > 0 && (
              <div className="grid grid-cols-3 gap-3 px-[30px] pb-[18px]">
                {p.keyFacts.map((f, i) => <div key={i} className="rounded-2xl border border-accent-soft bg-accent-softer p-3.5 text-[14px] leading-snug text-accent-text">{f}</div>)}
              </div>
            )}
            <nav aria-label="Card sections" className="sticky top-0 z-10 flex gap-6 border-b border-line bg-surface px-[30px] pt-3">
              {sections.map(([id, label]) => (
                <button key={id} type="button" onClick={() => setSection(id)} aria-current={section === id}
                  className={cx("pb-3 text-[14.5px] transition", section === id ? "font-semibold text-accent-text shadow-[inset_0_-2px_0_var(--accent)]" : "text-mute hover:text-ink")}>{label}</button>
              ))}
            </nav>
            <div className="px-[30px] pb-8 pt-5">
              {section === "overview" && <OverviewTab p={p} onAllNotes={() => setSection("notes")} />}
              {section === "contact" && <ContactTab p={p} />}
              {section === "notes" && <div className="flex flex-col gap-3"><QuickNote personId={p.id} /><div className="rounded-2xl border border-line px-4"><NotesList person={p} /></div><p className="text-[12.5px] text-faint">Newest first. Hover a note to edit or delete it.</p></div>}
              {section === "details" && <DetailsTab p={p} />}
              {section === "more" && <MoreTab p={p} fields={fields.data ?? []} />}
            </div>
          </>
        ) : q.error ? <p className="px-[30px] text-danger">{q.error.message}</p> : <div className="px-[30px]"><Spinner /></div>}
      </div>
      {moving && p && (
        <MoveDialog open onClose={() => setMoving(false)} what={`${p.firstName} ${p.lastName}`.trim()} currentTabId={p.tabId}
          onMove={(tabId, dirId, label) => actions.movePerson(p.id, tabId, dirId, undefined, `Moved to ${label}.`)} />
      )}
    </Modal>
  );
}
