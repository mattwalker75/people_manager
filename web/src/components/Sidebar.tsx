/** The selected tab's directories as a tree (directories only — people are cards in the main area). */
import { useMemo, useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { ChevronRight, Folder, FolderInput, FolderPlus, Layers, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import type { Directory, Id, Tab } from "../../../shared/types";
import { useActions } from "../lib/actions";
import type { DirectoryWithCount } from "../lib/hooks";
import { MoveDialog, NameDialog } from "./dialogs";
import type { DragData } from "./Shell";
import { cx, IconButton, Menu } from "./ui";

/** People in a directory and everything under it. */
export function totalsFor(dirs: DirectoryWithCount[]): Record<string, number> {
  const out: Record<string, number> = {};
  const kids = new Map<Id | null, DirectoryWithCount[]>();
  for (const d of dirs) { const k = kids.get(d.parentId) || []; k.push(d); kids.set(d.parentId, k); }
  const sum = (d: DirectoryWithCount): number => (out[d.id] = d.peopleCount + (kids.get(d.id) || []).reduce((n, c) => n + sum(c), 0));
  for (const d of kids.get(null) || []) sum(d);
  return out;
}

type Dialog = { kind: "new"; parentId: Id | null } | { kind: "edit"; dir: Directory } | { kind: "move"; dir: Directory } | null;

function Row({ d, depth, hasKids, open, selected, total, onToggle, onSelect, onMenu, dragging }: {
  d: DirectoryWithCount; depth: number; hasKids: boolean; open: boolean; selected: boolean; total: number; onToggle: () => void; onSelect: () => void; onMenu: (x: Dialog | "delete") => void; dragging: DragData | null;
}) {
  const drop = useDroppable({ id: `into:${d.id}`, data: { kind: "into", dirId: d.id } satisfies DragData });
  const drag = useDraggable({ id: `sdir:${d.id}`, data: { kind: "dir", id: d.id, dir: d } satisfies DragData });
  const self = dragging?.kind === "dir" && dragging.id === d.id;
  return (
    <div ref={drop.setNodeRef} className="group relative">
      <div ref={drag.setNodeRef} {...drag.listeners} {...drag.attributes} role="treeitem" aria-selected={selected} aria-expanded={hasKids ? open : undefined}
        className={cx("flex h-[38px] items-center gap-1.5 rounded-xl pr-1.5 text-[13.5px] transition",
          selected ? "bg-accent-soft font-semibold text-accent-text" : "text-ink-2 hover:bg-surface-2",
          drop.isOver && !self && "bg-accent-softer ring-2 ring-accent ring-inset", self && "opacity-40")}
        style={{ paddingLeft: 6 + depth * 18 }}>
        <button type="button" aria-label={open ? `Close ${d.name}` : `Open ${d.name}`} onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className={cx("flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-faint hover:text-ink", !hasKids && "invisible")}>
          <ChevronRight size={14} className={cx("transition", open && "rotate-90")} />
        </button>
        <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-2 text-left" title={d.description || d.name}>
          <Folder size={16} className="shrink-0" /><span className="truncate">{d.name}</span>
        </button>
        {/* The ⋯ button must stay in place while its menu is open (the menu is positioned
            relative to it), so it fades rather than disappearing; the count sits underneath. */}
        <span className="relative h-7 w-7 shrink-0">
          <span className="absolute inset-0 flex items-center justify-end pr-0.5 text-[12px] text-faint transition group-hover:opacity-0 group-has-[[data-state=open]]:opacity-0">{total || ""}</span>
          <span className="absolute inset-0 flex opacity-0 transition group-hover:opacity-100 focus-within:opacity-100 has-[[data-state=open]]:opacity-100">
          <Menu trigger={<IconButton label={`${d.name} options`} size="sm"><MoreHorizontal size={15} /></IconButton>}
            items={[
              { label: "New directory inside", icon: <FolderPlus size={14} />, onSelect: () => onMenu({ kind: "new", parentId: d.id }) },
              { label: "Rename / edit description", icon: <Pencil size={14} />, onSelect: () => onMenu({ kind: "edit", dir: d }) },
              { label: "Move to…", icon: <FolderInput size={14} />, onSelect: () => onMenu({ kind: "move", dir: d }) },
              "sep",
              { label: "Delete directory…", icon: <Trash2 size={14} />, danger: true, onSelect: () => onMenu("delete") },
            ]} />
          </span>
        </span>
      </div>
      {drop.isOver && !self && <div className="pointer-events-none mb-1 text-[11.5px] text-accent-text" style={{ paddingLeft: 36 + depth * 18 }}>Drop to move into {d.name}</div>}
    </div>
  );
}

export function Sidebar({ tab, dirs, topLevelPeople, selected, onSelect, expanded, setExpanded, dragging }: {
  tab: Tab; dirs: DirectoryWithCount[]; topLevelPeople: number; selected: Id | null; onSelect: (id: Id | null) => void;
  expanded: string[]; setExpanded: (f: (e: string[]) => string[]) => void; dragging: DragData | null;
}) {
  const actions = useActions();
  const [dialog, setDialog] = useState<Dialog>(null);
  const totals = useMemo(() => totalsFor(dirs), [dirs]);
  const children = (p: Id | null) => dirs.filter((d) => d.parentId === p).sort((a, b) => a.position - b.position);
  const rootDrop = useDroppable({ id: "into:root", data: { kind: "into", dirId: null } satisfies DragData });
  const toggle = (id: Id) => setExpanded((e) => (e.includes(id) ? e.filter((x) => x !== id) : [...e, id]));

  const tree = (parent: Id | null, depth: number): React.ReactNode => children(parent).map((d) => {
    const kids = children(d.id).length > 0; const open = expanded.includes(d.id);
    return (
      <div key={d.id} role="group">
        <Row d={d} depth={depth} hasKids={kids} open={open} selected={selected === d.id} total={totals[d.id] || 0} dragging={dragging}
          onToggle={() => toggle(d.id)} onSelect={() => onSelect(d.id)}
          onMenu={(x) => (x === "delete" ? actions.deleteDirectory(d).then((r) => { if (r && selected === d.id) onSelect(d.parentId); }) : setDialog(x))} />
        {open && kids && tree(d.id, depth + 1)}
      </div>
    );
  });

  return (
    <aside className="flex w-[272px] shrink-0 flex-col border-r border-line">
      <div className="flex items-center justify-between px-5 pb-2 pt-5">
        <span className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-faint">Directories</span>
        <IconButton label="New directory" size="sm" onClick={() => setDialog({ kind: "new", parentId: null })}><FolderPlus size={16} /></IconButton>
      </div>
      <div role="tree" aria-label={`${tab.name} directories`} className="flex-1 overflow-auto px-3 pb-4">
        <div ref={rootDrop.setNodeRef}>
          <button type="button" onClick={() => onSelect(null)}
            className={cx("flex h-[38px] w-full items-center gap-2 rounded-xl px-3 text-left text-[13.5px] transition",
              selected === null ? "bg-accent-soft font-semibold text-accent-text" : "text-ink-2 hover:bg-surface-2",
              rootDrop.isOver && "bg-accent-softer ring-2 ring-accent ring-inset")}>
            <Layers size={16} /><span className="flex-1 truncate">{tab.name}</span><span className="text-[12px] text-faint">{topLevelPeople || ""}</span>
          </button>
        </div>
        {tree(null, 0)}
        {!dirs.length && <p className="px-3 pt-3 text-[12.5px] leading-relaxed text-faint">No directories yet. Directories group people inside a tab — “Active clients”, “Austin Tech Summit 2026”.</p>}
        <button type="button" onClick={() => setDialog({ kind: "new", parentId: null })} className="mt-3 h-9 w-full rounded-xl border border-dashed border-line-2 text-[13px] text-mute hover:bg-surface-2 hover:text-ink">+ New directory</button>
      </div>

      <NameDialog open={dialog?.kind === "new"} onClose={() => setDialog(null)} withDescription submitLabel="Create directory"
        title={dialog?.kind === "new" && dialog.parentId ? `New directory inside ${dirs.find((d) => d.id === dialog.parentId)?.name}` : `New directory in ${tab.name}`}
        onSubmit={async (name, desc) => {
          const parentId = dialog?.kind === "new" ? dialog.parentId : null;
          const d = await actions.createDirectory(tab.id, parentId, name, desc);
          if (d && parentId) setExpanded((e) => [...new Set([...e, parentId])]);
          return d;
        }} />
      <NameDialog open={dialog?.kind === "edit"} onClose={() => setDialog(null)} withDescription submitLabel="Save" title="Rename directory"
        initialName={dialog?.kind === "edit" ? dialog.dir.name : ""} initialDescription={dialog?.kind === "edit" ? dialog.dir.description : ""}
        onSubmit={(name, desc) => actions.updateDirectory((dialog as { dir: Directory }).dir, name, desc)} />
      {dialog?.kind === "move" && (
        <MoveDialog open onClose={() => setDialog(null)} what={`“${dialog.dir.name}”`} currentTabId={tab.id} excludeDir={dialog.dir.id}
          onMove={(tabId, dirId, label) => actions.moveDirectory(dialog.dir.id, tabId, dirId, undefined, `Moved to ${label}.`)} />
      )}
    </aside>
  );
}
