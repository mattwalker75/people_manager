/**
 * The main window (the layout Matt chose, "C · Atelier"): tabs across the top,
 * the selected tab's directories in the sidebar, the selected directory's
 * sub-directories and people as cards in the main area, search at the top.
 *
 * Drag and drop (press and hold ~¼ s to pick something up):
 *   person card       → another card (reorder) · a sidebar directory (move into) · a tab (move to its top level)
 *   sidebar directory → another sidebar directory (move into) · the tab's top-level row · a tab
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  closestCenter, DndContext, DragOverlay, KeyboardSensor, PointerSensor, pointerWithin, useSensor, useSensors,
  type CollisionDetection, type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useQueryClient } from "@tanstack/react-query";
import { Folder, LogOut, Plus, Search, Settings, X } from "lucide-react";
import type { Id, PersonSummary } from "../../../shared/types";
import { go, useRoute } from "../App";
import { useActions } from "../lib/actions";
import { api } from "../lib/api";
import { summaryPhoto } from "../lib/format";
import { useDebounced, useDirectories, useLocal, usePeople, useTabs, type AppState, type DirectoryWithCount } from "../lib/hooks";
import { SettingsPage } from "../settings/SettingsPage";
import { NameDialog } from "./dialogs";
import { MainPane } from "./MainPane";
import { PersonDialog } from "./PersonDialog";
import { SearchResults } from "./SearchResults";
import { Sidebar } from "./Sidebar";
import { TabsBar } from "./TabsBar";
import { Avatar, Button, EmptyState, IconButton, Menu, NameWithNick, Spinner } from "./ui";

export type DragData =
  | { kind: "person"; id: Id; person: PersonSummary }
  | { kind: "dir"; id: Id; dir: DirectoryWithCount }
  | { kind: "into"; dirId: Id | null }
  | { kind: "tab"; tabId: Id };

export function Shell({ state }: { state: AppState }) {
  const route = useRoute();
  const actions = useActions();
  const qc = useQueryClient();
  const tabsQ = useTabs(state.dataSource.ok);
  const tabs = tabsQ.data ?? [];
  const [savedTab, setSavedTab] = useLocal<string | null>("tab", null);
  const tabId = tabs.find((t) => t.id === savedTab)?.id ?? tabs[0]?.id ?? null;
  const tab = tabs.find((t) => t.id === tabId) ?? null;
  const dirsQ = useDirectories(tabId);
  const dirs = dirsQ.data?.directories ?? [];
  const [dirByTab, setDirByTab] = useLocal<Record<string, string | null>>("dirByTab", {});
  const dirId = tabId && dirByTab[tabId] && dirs.some((d) => d.id === dirByTab[tabId]) ? dirByTab[tabId]! : null;
  const [expanded, setExpanded] = useLocal<string[]>("expanded", []);
  const peopleQ = usePeople(tabId, dirId);

  const [query, setQuery] = useState("");
  const q = useDebounced(query, 120);
  const searchRef = useRef<HTMLInputElement>(null);
  const [personId, setPersonId] = useState<string | null>(null);
  const [creating, setCreating] = useState<{ tabId: Id; directoryId: Id | null } | null>(null);
  const [newTab, setNewTab] = useState(false);

  const selectDir = (id: Id | null) => {
    if (!tabId) return;
    setDirByTab((m) => ({ ...m, [tabId]: id }));
    // open every ancestor so the selected row is visible in the sidebar
    const up: Id[] = []; let cur = dirs.find((d) => d.id === id);
    while (cur?.parentId) { up.push(cur.parentId); cur = dirs.find((d) => d.id === cur!.parentId); }
    if (up.length) setExpanded((e) => [...new Set([...e, ...up])]);
  };
  const selectTab = (id: Id) => { setSavedTab(id); setQuery(""); };

  // ⌘K / Ctrl-K jumps to search
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); searchRef.current?.focus(); searchRef.current?.select(); } };
    window.addEventListener("keydown", f); return () => window.removeEventListener("keydown", f);
  }, []);

  // ---------------------------------------------------------------- drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const collision: CollisionDetection = (args) => { const p = pointerWithin(args); return p.length ? p : closestCenter(args); };
  const [dragging, setDragging] = useState<DragData | null>(null);
  const onDragStart = (e: DragStartEvent) => setDragging((e.active.data.current as DragData) ?? null);
  const onDragEnd = async (e: DragEndEvent) => {
    setDragging(null);
    const a = e.active.data.current as DragData | undefined; const o = e.over?.data.current as DragData | undefined;
    if (!a || !o || !tabId || e.active.id === e.over?.id) return;
    const tabName = (id: Id) => tabs.find((t) => t.id === id)?.name ?? "that tab";
    const dirName = (id: Id | null) => (id ? dirs.find((d) => d.id === id)?.name ?? "that directory" : `${tab?.name} (top level)`);
    if (a.kind === "person") {
      const p = a.person;
      if (o.kind === "person") {
        const list = peopleQ.data ?? [];
        const to = list.findIndex((x) => x.id === o.id);
        if (to >= 0) {
          // optimistic reorder so the card lands where it was dropped
          const from = list.findIndex((x) => x.id === p.id);
          const next = [...list]; next.splice(from, 1); next.splice(to, 0, p);
          qc.setQueryData(["people", tabId, dirId ?? "root"], next);
          await actions.movePerson(p.id, tabId, dirId, to);
        }
      } else if (o.kind === "into") { if (o.dirId !== p.directoryId) await actions.movePerson(p.id, tabId, o.dirId, undefined, `Moved to ${dirName(o.dirId)}.`); }
      else if (o.kind === "tab" && o.tabId !== p.tabId) await actions.movePerson(p.id, o.tabId, null, undefined, `Moved to ${tabName(o.tabId)}.`);
    } else if (a.kind === "dir") {
      const d = a.dir;
      if (o.kind === "into") { if (o.dirId !== d.id && o.dirId !== d.parentId) await actions.moveDirectory(d.id, tabId, o.dirId, undefined, `Moved into ${dirName(o.dirId)}.`); }
      else if (o.kind === "tab" && o.tabId !== d.tabId) await actions.moveDirectory(d.id, o.tabId, null, undefined, `Moved to ${tabName(o.tabId)}.`);
    }
  };

  const searching = q.trim().length > 0;
  const dsProblem = !state.dataSource.ok;
  const signOut = async () => { await api.post("/api/auth/logout"); await qc.invalidateQueries(); };

  const header = (
    <header className="flex h-16 shrink-0 items-center gap-4 px-6">
      <button type="button" onClick={() => { go("/"); setQuery(""); }} className="flex w-[250px] shrink-0 items-center gap-2.5 text-left">
        <img src="/favicon.svg" alt="" width={28} height={28} className="rounded-lg" />
        <span className="font-display text-[22px] font-semibold tracking-tight">People Manager</span>
      </button>
      {route.view === "people" && !dsProblem ? (
        <label className="relative flex w-full max-w-[560px] items-center">
          <Search size={16} className="pointer-events-none absolute left-4 text-faint" />
          <input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") setQuery(""); }}
            aria-label="Search people" placeholder="Search by name, nickname or tag"
            className="h-10 w-full rounded-full border border-line-2 bg-surface pl-10 pr-20 text-sm placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-soft" />
          {query ? <IconButton label="Clear search" size="sm" className="absolute right-2" onClick={() => setQuery("")}><X size={15} /></IconButton>
            : <kbd className="pointer-events-none absolute right-3 rounded-md border border-line-2 px-1.5 py-0.5 font-mono text-[11px] text-faint">⌘K</kbd>}
        </label>
      ) : <div className="flex-1" />}
      <div className="flex-1" />
      {route.view === "people" && tabId && !dsProblem && (
        <Button variant="primary" icon={<Plus size={16} />} onClick={() => setCreating({ tabId, directoryId: dirId })}>Add person</Button>
      )}
      <IconButton label="Settings" className="border border-line-2 bg-surface" onClick={() => go(route.view === "settings" ? "/" : "/settings/general")}><Settings size={17} /></IconButton>
      {state.auth.status === "authenticated" && (
        <Menu trigger={<button type="button" className="h-9 rounded-full border border-line-2 bg-surface px-3 text-[13px] text-ink-2 hover:bg-surface-2">{state.auth.loginName}</button>}
          items={[{ label: "Sign out", icon: <LogOut size={14} />, onSelect: signOut }]} />
      )}
    </header>
  );

  if (route.view === "settings") return <div className="flex h-full flex-col">{header}<SettingsPage state={state} section={route.section} /></div>;

  let body: React.ReactNode;
  if (dsProblem) {
    body = (
      <div className="m-6 flex flex-1 items-start justify-center pt-16">
        <EmptyState title="The data source isn't ready" action={<Button variant="primary" onClick={() => go("/settings/data")}>Open Settings → Data source</Button>}>
          {state.dataSource.message}
        </EmptyState>
      </div>
    );
  } else if (tabsQ.isLoading) {
    body = <div className="flex flex-1 items-center justify-center"><Spinner /></div>;
  } else if (!tabs.length) {
    body = (
      <div className="m-6 flex flex-1 items-start justify-center pt-16">
        <EmptyState title="Welcome to People Manager" action={<Button variant="primary" icon={<Plus size={16} />} onClick={() => setNewTab(true)}>Create your first tab</Button>}>
          Tabs are the big groupings across the top — for example <b>Clients</b>, <b>Networking</b> and <b>Personal</b>. Inside a tab you make directories, and put people in them.
        </EmptyState>
      </div>
    );
  } else {
    body = (
      <div className="mx-6 mb-6 flex min-h-0 flex-1 rounded-b-2xl rounded-tr-2xl bg-surface shadow-soft">
        <Sidebar tab={tab!} dirs={dirs} topLevelPeople={dirsQ.data?.topLevelPeople ?? 0} selected={dirId} onSelect={(id) => { setQuery(""); selectDir(id); }}
          expanded={expanded} setExpanded={setExpanded} dragging={dragging} />
        <main className="min-w-0 flex-1 overflow-auto">
          {searching ? <SearchResults q={q} onOpen={setPersonId} onClear={() => setQuery("")} />
            : <MainPane tab={tab!} dirs={dirs} dirId={dirId} people={peopleQ.data} loading={peopleQ.isLoading} onSelectDir={selectDir}
                onOpenPerson={setPersonId} onAddPerson={() => setCreating({ tabId: tab!.id, directoryId: dirId })} />}
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {header}
      <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
        {tabs.length > 0 && !dsProblem && <TabsBar tabs={tabs} selected={tabId} onSelect={selectTab} onNew={() => setNewTab(true)} dragging={dragging} />}
        {body}
        <DragOverlay dropAnimation={null}>
          {dragging?.kind === "person" && (
            <div className="flex w-[300px] rotate-[-2deg] items-center gap-3.5 rounded-2xl border-[1.5px] border-accent bg-surface p-4 shadow-lift">
              <Avatar person={dragging.person} src={summaryPhoto(dragging.person)} size={48} />
              <div className="min-w-0"><div className="truncate font-display text-[17px] font-semibold"><NameWithNick p={dragging.person} /></div><div className="truncate text-[12.5px] text-mute">{dragging.person.description}</div></div>
            </div>
          )}
          {dragging?.kind === "dir" && (
            <div className="flex w-[260px] rotate-[-2deg] items-center gap-3 rounded-2xl border-[1.5px] border-accent bg-surface p-3.5 shadow-lift">
              <Folder size={18} className="text-accent" /><span className="truncate font-semibold">{dragging.dir.name}</span>
            </div>
          )}
        </DragOverlay>
      </DndContext>
      {dragging && <div className="pointer-events-none fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-2xl bg-ink px-4 py-2.5 text-[13px] text-bg shadow-lift">
        Moving <b>{dragging.kind === "person" ? `${dragging.person.firstName} ${dragging.person.lastName}`.trim() : dragging.kind === "dir" ? dragging.dir.name : ""}</b> — drop it on a directory in the sidebar{dragging.kind === "person" ? ", a tab, or between cards" : " or a tab"} · Esc cancels
      </div>}
      <PersonDialog state={state} personId={personId} createAt={creating} onClose={() => { setPersonId(null); setCreating(null); }} onCreated={(id) => { setCreating(null); setPersonId(id); }} />
      <NameDialog open={newTab} onClose={() => setNewTab(false)} title="New tab" submitLabel="Create tab"
        onSubmit={async (name) => { const t = await actions.createTab(name); if (t) setSavedTab(t.id); return t; }} />
    </div>
  );
}
