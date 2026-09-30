/**
 * The main area for the selected place: where you are (breadcrumb), the
 * directory's name and one-line description, its sub-directories as tiles,
 * and its people as cards — both reorderable by press-and-hold dragging.
 */
import { useMemo, useState } from "react";
import { SortableContext, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FolderInput, FolderPlus, Layers, MoreHorizontal, Pencil, Plus, Trash2, UserRound } from "lucide-react";
import type { Directory, Id, PersonSummary, Tab } from "../../../shared/types";
import { useActions } from "../lib/actions";
import { summaryPhoto } from "../lib/format";
import type { DirectoryWithCount } from "../lib/hooks";
import { MoveDialog, NameDialog } from "./dialogs";
import type { DragData } from "./Shell";
import { Avatar, Button, cx, EmptyState, IconButton, Menu, NameWithNick, Spinner } from "./ui";

function PersonCard({ p, onOpen, onMove, onDelete }: { p: PersonSummary; onOpen: () => void; onMove: () => void; onDelete: () => void }) {
  const s = useSortable({ id: `person:${p.id}`, data: { kind: "person", id: p.id, person: p } satisfies DragData });
  return (
    <div ref={s.setNodeRef} style={{ transform: CSS.Translate.toString(s.transform), transition: s.transition }} {...s.attributes} {...s.listeners}
      className={cx("group relative rounded-2xl border bg-surface transition",
        s.isDragging ? "border-dashed border-line-2 opacity-45" : "border-line hover:border-line-2 hover:shadow-soft")}>
      <button type="button" onClick={onOpen} className="flex w-full items-center gap-3.5 p-4 text-left">
        <Avatar person={p} src={summaryPhoto(p)} size={52} />
        <span className="min-w-0">
          <span className="block font-display text-[18px] font-semibold leading-snug"><NameWithNick p={p} nickClass="font-medium text-faint" /></span>
          <span className="line-clamp-2 text-[13px] leading-snug text-mute">{p.description}</span>
        </span>
      </button>
      <span className="absolute right-2 top-2 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100 has-[[data-state=open]]:opacity-100">
        <Menu trigger={<IconButton label={`Options for ${p.firstName}`} size="sm" className="bg-surface"><MoreHorizontal size={15} /></IconButton>}
          items={[
            { label: "Open card", icon: <UserRound size={14} />, onSelect: onOpen },
            { label: "Move to…", icon: <FolderInput size={14} />, onSelect: onMove },
            "sep",
            { label: "Delete person…", icon: <Trash2 size={14} />, danger: true, onSelect: onDelete },
          ]} />
      </span>
    </div>
  );
}

export function MainPane({ tab, dirs, dirId, people, loading, onSelectDir, onOpenPerson, onAddPerson }: {
  tab: Tab; dirs: DirectoryWithCount[]; dirId: Id | null; people?: PersonSummary[]; loading: boolean; onSelectDir: (id: Id | null) => void;
  onOpenPerson: (id: Id) => void; onAddPerson: () => void;
}) {
  const actions = useActions();
  const [dialog, setDialog] = useState<null | "newDir" | "editDir" | "moveDir" | "renameTab" | { movePerson: PersonSummary }>(null);
  const dir = dirs.find((d) => d.id === dirId) ?? null;
  const trail = useMemo(() => { const t: Directory[] = []; let cur = dir; while (cur) { t.unshift(cur); cur = dirs.find((d) => d.id === cur!.parentId) ?? null; } return t; }, [dir, dirs]);
  const subdirs = dirs.filter((d) => d.parentId === dirId).sort((a, b) => a.position - b.position);
  const list = people ?? [];

  return (
    <div className="flex flex-col gap-5 px-8 py-6">
      {/* Where you are inside this tab (the tab itself is already selected above, so it is not repeated). */}
      {trail.length > 0 && (
        <nav aria-label="Where you are" className="flex flex-wrap items-center gap-1.5 text-[13px] text-mute">
          <button type="button" onClick={() => onSelectDir(null)} className="flex items-center gap-1 hover:text-ink"><Layers size={13} />Top level</button>
          {trail.map((d, i) => (
            <span key={d.id} className="flex items-center gap-1.5">›
              <button type="button" onClick={() => onSelectDir(d.id)} className={cx("hover:text-ink", i === trail.length - 1 && "text-ink")}>{d.name}</button>
            </span>
          ))}
        </nav>
      )}

      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[30px] font-semibold leading-tight tracking-tight">{dir ? dir.name : "Top level"}</h1>
          <p className="mt-1 text-mute">{dir ? dir.description || "\u00a0" : "People in this tab who are not in a directory"}</p>
        </div>
        <Button size="sm" variant="primary" icon={<FolderPlus size={15} />} onClick={() => setDialog("newDir")}>New directory</Button>
        <Button size="sm" variant="primary" icon={<Plus size={15} />} onClick={onAddPerson}>Add person here</Button>
        <Menu trigger={<IconButton label="More options" className="border border-line-2"><MoreHorizontal size={16} /></IconButton>}
          items={dir ? [
            { label: "Rename / edit description", icon: <Pencil size={14} />, onSelect: () => setDialog("editDir") },
            { label: "Move directory to…", icon: <FolderInput size={14} />, onSelect: () => setDialog("moveDir") },
            "sep",
            { label: "Delete directory…", icon: <Trash2 size={14} />, danger: true, onSelect: () => actions.deleteDirectory(dir).then((r) => r && onSelectDir(dir.parentId)) },
          ] : [
            { label: "Rename tab", icon: <Pencil size={14} />, onSelect: () => setDialog("renameTab") },
            "sep",
            { label: "Delete tab…", icon: <Trash2 size={14} />, danger: true, onSelect: () => actions.deleteTab(tab) },
          ]} />
      </div>

      <section aria-label="People" className="flex flex-col gap-2.5">
        {loading ? <Spinner /> : list.length ? (
          <SortableContext items={list.map((p) => `person:${p.id}`)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3.5">
              {list.map((p) => <PersonCard key={p.id} p={p} onOpen={() => onOpenPerson(p.id)} onMove={() => setDialog({ movePerson: p })} onDelete={() => actions.deletePerson(p)} />)}
            </div>
          </SortableContext>
        ) : (
          <EmptyState title={`Nobody is in ${dir ? dir.name : "the top level"} yet`}
            action={<><Button variant="primary" icon={<Plus size={15} />} onClick={onAddPerson}>Add a person</Button><Button icon={<FolderPlus size={15} />} onClick={() => setDialog("newDir")}>New directory</Button></>}>
            {subdirs.length
              ? <>It holds {subdirs.length} {subdirs.length === 1 ? "directory" : "directories"} — open {subdirs.length === 1 ? "it" : "them"} in the sidebar on the left. Add a person here, or drag people in from elsewhere.</>
              : <>Add a person here, make a directory, or drag people in: press and hold a card, then drop it on a directory in the sidebar.</>}
          </EmptyState>
        )}
        {list.length > 0 && <p className="text-[12.5px] text-faint">Press and hold a card to move it — drop it between cards to reorder, or on a directory in the sidebar (or on a tab) to move it there.</p>}
      </section>

      <NameDialog open={dialog === "newDir"} onClose={() => setDialog(null)} withDescription submitLabel="Create directory" title={dir ? `New directory inside ${dir.name}` : "New directory at the top level"}
        onSubmit={(name, desc) => actions.createDirectory(tab.id, dirId, name, desc)} />
      <NameDialog open={dialog === "editDir"} onClose={() => setDialog(null)} withDescription submitLabel="Save" title="Rename directory" initialName={dir?.name} initialDescription={dir?.description}
        onSubmit={(name, desc) => actions.updateDirectory(dir!, name, desc)} />
      <NameDialog open={dialog === "renameTab"} onClose={() => setDialog(null)} submitLabel="Save" title="Rename tab" initialName={tab.name} onSubmit={(name) => actions.renameTab(tab, name)} />
      {dialog === "moveDir" && dir && (
        <MoveDialog open onClose={() => setDialog(null)} what={`“${dir.name}”`} currentTabId={tab.id} excludeDir={dir.id}
          onMove={(tabId, target, label) => actions.moveDirectory(dir.id, tabId, target, undefined, `Moved to ${label}.`)} />
      )}
      {dialog && typeof dialog === "object" && (
        <MoveDialog open onClose={() => setDialog(null)} what={`${dialog.movePerson.firstName} ${dialog.movePerson.lastName}`.trim()} currentTabId={tab.id}
          onMove={(tabId, target, label) => actions.movePerson(dialog.movePerson.id, tabId, target, undefined, `Moved to ${label}.`)} />
      )}
    </div>
  );
}
