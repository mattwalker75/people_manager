import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CustomField, DataSourceStatus, Directory, Person, PersonSummary, SearchResult, Tab } from "../../../shared/types";
import { api } from "./api";
import type { CustomTheme } from "./theme";

/** Browser-only preferences (open directories, last tab). Storage can be unavailable — never let that break the app. */
export function useLocal<T>(key: string, initial: T): [T, (v: T | ((old: T) => T)) => void] {
  const k = `pm.${key}`;
  const [v, setV] = useState<T>(() => { try { const s = localStorage.getItem(k); return s == null ? initial : (JSON.parse(s) as T); } catch { return initial; } });
  const set = useCallback((next: T | ((old: T) => T)) => {
    setV((old) => { const val = typeof next === "function" ? (next as (o: T) => T)(old) : next; try { localStorage.setItem(k, JSON.stringify(val)); } catch {} return val; });
  }, [k]);
  return [v, set];
}

export interface AppConfig {
  server: { port: number; allowNetwork: boolean };
  security: { loginEnabled: boolean; passwordFile: string; sessionHours: number };
  dataSource: { type: "json" | "sqlite" | "mysql"; json: { path: string }; sqlite: { path: string }; mysql: { host: string; port: number; database: string; user: string; password: string } };
  photos: { dir: string; maxPerPerson: number };
  appearance: { theme: string; customThemes: CustomTheme[] };
  backups: { dir: string };
}
export type AuthState = { status: "disabled" } | { status: "not_initialized" } | { status: "unauthenticated" } | { status: "authenticated"; loginName: string };
export interface AppState {
  version: string; auth: AuthState; config: AppConfig; restartRequired: string[]; configFile: string; dataSource: DataSourceStatus;
  passwordFile: string; photosDir: string; backupsDir: string; networkUrls: string[];
}
export type DirectoryWithCount = Directory & { peopleCount: number };
export type PersonFull = Person & { path: string };

/** Login state — always answered, even before signing in. */
export const useAuth = () => useQuery({ queryKey: ["auth"], queryFn: () => api.get<AuthState>("/api/auth/me") });
export const useAppState = (enabled = true) => useQuery({ queryKey: ["state"], queryFn: () => api.get<AppState>("/api/state"), enabled });
export const useTabs = (enabled = true) => useQuery({ queryKey: ["tabs"], queryFn: () => api.get<Tab[]>("/api/tabs"), enabled });
export const useDirectories = (tabId: string | null) => useQuery({
  queryKey: ["dirs", tabId], enabled: !!tabId,
  queryFn: () => api.get<{ directories: DirectoryWithCount[]; topLevelPeople: number }>(`/api/tabs/${tabId}/directories`),
});
export const usePeople = (tabId: string | null, directoryId: string | null) => useQuery({
  queryKey: ["people", tabId, directoryId ?? "root"], enabled: !!tabId,
  queryFn: () => api.get<PersonSummary[]>(`/api/people?tabId=${tabId}&directoryId=${directoryId ?? "root"}`),
});
export const usePerson = (id: string | null) => useQuery({ queryKey: ["person", id], enabled: !!id, queryFn: () => api.get<PersonFull>(`/api/people/${id}`) });
export const useSearch = (q: string) => useQuery({ queryKey: ["search", q], enabled: q.trim().length > 0, queryFn: () => api.get<SearchResult[]>(`/api/search?q=${encodeURIComponent(q)}`), placeholderData: (prev) => prev });
export const useFields = () => useQuery({ queryKey: ["fields"], queryFn: () => api.get<CustomField[]>("/api/fields") });

/** After any change: refetch everything that is on screen (it is all local and fast). */
export function useRefresh() {
  const qc = useQueryClient();
  return useCallback(() => qc.invalidateQueries(), [qc]);
}

/** Debounce a fast-changing value (the search box). */
export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}
