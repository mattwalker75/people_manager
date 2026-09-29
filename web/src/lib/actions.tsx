/**
 * The actions the screens share: create, rename, move and delete tabs,
 * directories and people — each with its confirmation, a toast when it is
 * done, and the server's own words when it refuses (e.g. "is not empty").
 */
import { useCallback } from "react";
import { toast } from "sonner";
import type { Directory, Id, PersonSummary, Tab } from "../../../shared/types";
import { displayName } from "../../../shared/types";
import { useConfirm } from "../components/confirm";
import { api, ApiError, errorText } from "./api";
import { useRefresh } from "./hooks";

export function useActions() {
  const confirm = useConfirm();
  const refresh = useRefresh();

  /** Run a change; refresh the screen; report a refusal in a window (it can be long) or a toast. */
  const run = useCallback(async <T,>(fn: () => Promise<T>, done?: string): Promise<T | undefined> => {
    try {
      const out = await fn();
      await refresh();
      if (done) toast(done);
      return out;
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) await confirm({ title: "That can't be done yet", message: e.message, infoOnly: true });
      else toast.error(errorText(e));
      await refresh();
      return undefined;
    }
  }, [confirm, refresh]);

  return {
    run,
    createTab: (name: string) => run(() => api.post<Tab>("/api/tabs", { name }), `Tab “${name}” created.`),
    renameTab: (t: Tab, name: string) => run(() => api.patch(`/api/tabs/${t.id}`, { name }), "Tab renamed."),
    reorderTabs: (ids: Id[]) => run(() => api.post("/api/tabs/reorder", { ids })),
    deleteTab: async (t: Tab) => {
      if (!(await confirm({ title: `Delete the tab “${t.name}”?`, message: "Only an empty tab can be deleted.", confirmLabel: "Delete tab", danger: true }))) return;
      return run(() => api.del(`/api/tabs/${t.id}`), `Tab “${t.name}” deleted.`);
    },
    createDirectory: (tabId: Id, parentId: Id | null, name: string, description: string) =>
      run(() => api.post<Directory>("/api/directories", { tabId, parentId, name, description }), `Directory “${name}” created.`),
    updateDirectory: (d: Directory, name: string, description: string) => run(() => api.patch(`/api/directories/${d.id}`, { name, description }), "Directory saved."),
    deleteDirectory: async (d: Directory) => {
      if (!(await confirm({ title: `Delete the directory “${d.name}”?`, message: "Only an empty directory can be deleted.", confirmLabel: "Delete directory", danger: true }))) return;
      return run(() => api.del(`/api/directories/${d.id}`), `Directory “${d.name}” deleted.`);
    },
    moveDirectory: (id: Id, tabId: Id, parentId: Id | null, index?: number, label?: string) =>
      run(() => api.post(`/api/directories/${id}/move`, { tabId, parentId, index }), label),
    movePerson: (id: Id, tabId: Id, directoryId: Id | null, index?: number, label?: string) =>
      run(() => api.post(`/api/people/${id}/move`, { tabId, directoryId, index }), label),
    deletePerson: async (p: Pick<PersonSummary, "id" | "firstName" | "lastName" | "nickname">) => {
      if (!(await confirm({ title: `Delete ${displayName(p)}?`, message: "Their card, notes and photos are removed for good. This can't be undone.", confirmLabel: "Delete person", danger: true }))) return false;
      return (await run(() => api.del(`/api/people/${p.id}`), `${displayName(p)} deleted.`)) !== undefined;
    },
  };
}
