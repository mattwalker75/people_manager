import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { ArrowLeft, ArrowRight, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import type { Id, Tab } from "../../../shared/types";
import { useActions } from "../lib/actions";
import { NameDialog } from "./dialogs";
import type { DragData } from "./Shell";
import { cx, IconButton, Menu, type MenuItem } from "./ui";

/** One tab. The selected tab carries its own ⋯ menu (rename, move, delete) next to its name. */
function TabItem({ tab, active, onSelect, onRename, menu, dragging }: { tab: Tab; active: boolean; onSelect: () => void; onRename: () => void; menu: (MenuItem | "sep")[]; dragging: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `tab:${tab.id}`, data: { kind: "tab", tabId: tab.id } satisfies DragData });
  return (
    <div ref={setNodeRef}
      className={cx("relative flex h-10 items-center rounded-t-xl transition",
        active ? "bg-surface" : "",
        dragging && !active && "outline-dashed outline-1 outline-line-2",
        isOver && "bg-accent-soft outline-2 outline-accent")}>
      <button type="button" onClick={onSelect} onDoubleClick={onRename} title={active ? "Double-click to rename" : undefined}
        className={cx("h-full text-sm", active ? "pl-[18px] pr-1 font-semibold text-ink" : "px-[18px] text-mute hover:text-ink", isOver && "text-accent-text")}>
        {tab.name}
      </button>
      {active && (
        <span className="pr-1.5">
          <Menu trigger={<IconButton label={`${tab.name} tab options`} size="sm"><MoreHorizontal size={16} /></IconButton>} align="start" items={menu} />
        </span>
      )}
      {isOver && <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 -translate-x-1/2 whitespace-nowrap rounded-lg bg-accent px-2 py-1 text-[11.5px] font-medium text-accent-ink">Move to {tab.name}</span>}
    </div>
  );
}

export function TabsBar({ tabs, selected, onSelect, onNew, dragging }: { tabs: Tab[]; selected: Id | null; onSelect: (id: Id) => void; onNew: () => void; dragging: DragData | null }) {
  const actions = useActions();
  const [renaming, setRenaming] = useState<Tab | null>(null);
  const active = tabs.find((t) => t.id === selected);
  const idx = tabs.findIndex((t) => t.id === selected);
  const shift = (by: number) => { const ids = tabs.map((t) => t.id); const [x] = ids.splice(idx, 1); ids.splice(idx + by, 0, x); actions.reorderTabs(ids); };
  const menu: (MenuItem | "sep")[] = active ? [
    { label: "Rename tab", icon: <Pencil size={14} />, onSelect: () => setRenaming(active) },
    { label: "Move left", icon: <ArrowLeft size={14} />, onSelect: () => shift(-1), disabled: idx <= 0 },
    { label: "Move right", icon: <ArrowRight size={14} />, onSelect: () => shift(1), disabled: idx >= tabs.length - 1 },
    "sep",
    { label: "Delete tab…", icon: <Trash2 size={14} />, danger: true, onSelect: () => actions.deleteTab(active) },
  ] : [];
  return (
    <nav aria-label="Tabs" className="flex shrink-0 items-end gap-1.5 overflow-x-auto px-6">
      {tabs.map((t) => <TabItem key={t.id} tab={t} active={t.id === selected} onSelect={() => onSelect(t.id)} onRename={() => setRenaming(t)} menu={menu} dragging={!!dragging} />)}
      <button type="button" onClick={onNew} className="mb-1 flex h-8 items-center gap-1 rounded-full px-3 text-[13.5px] text-mute hover:bg-surface hover:text-ink"><Plus size={14} />Tab</button>
      <NameDialog open={!!renaming} onClose={() => setRenaming(null)} title="Rename tab" submitLabel="Save" initialName={renaming?.name}
        onSubmit={(name) => actions.renameTab(renaming!, name)} />
    </nav>
  );
}
