/** Live results while typing in the search box: who, their one-liner, where they are, and why they matched. */
import { Folder, Tag } from "lucide-react";
import type { Id } from "../../../shared/types";
import { summaryPhoto } from "../lib/format";
import { useSearch } from "../lib/hooks";
import { Avatar, NameWithNick, Spinner } from "./ui";

export function SearchResults({ q, onOpen, onClear }: { q: string; onOpen: (id: Id) => void; onClear: () => void }) {
  const r = useSearch(q);
  const list = r.data ?? [];
  return (
    <div className="flex flex-col gap-4 px-8 py-6">
      <div className="flex items-baseline justify-between">
        <div className="text-[13.5px] text-mute">
          {r.isLoading ? "Searching…" : <><b className="text-ink">{list.length}</b> {list.length === 1 ? "person" : "people"} for “{q}” across all tabs</>}
        </div>
        <button type="button" onClick={onClear} className="rounded-lg px-2 py-1 text-[13px] text-accent-text hover:bg-surface-2">Clear search (Esc)</button>
      </div>
      {r.isLoading ? <Spinner /> : list.length ? (
        <ul className="overflow-hidden rounded-2xl border border-line">
          {list.map((p) => (
            <li key={p.id} className="border-b border-line last:border-0">
              <button type="button" onClick={() => onOpen(p.id)} className="flex w-full items-center gap-4 px-5 py-3.5 text-left hover:bg-surface-2">
                <Avatar person={p} src={summaryPhoto(p)} size={44} rounded="rounded-xl" />
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-[17px] font-semibold"><NameWithNick p={p} nickClass="font-medium text-faint" /></span>
                  <span className="block truncate text-[13px] text-mute">{p.description}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className="flex items-center gap-1.5 text-[12.5px] text-ink-2"><Folder size={13} className="text-faint" />{p.path}</span>
                  {p.matchedTag && <span className="flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[11.5px] font-medium text-accent-text"><Tag size={11} />matched tag: {p.matchedTag}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-2xl border border-dashed border-line-2 px-6 py-12 text-center text-mute">Nobody matches “{q}”. First names, last names, nicknames and tags are searched.</div>
      )}
    </div>
  );
}
