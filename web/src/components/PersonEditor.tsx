/**
 * Edit (or create) a person. Only the first name is required. Tags live
 * here and only here — they help search find the person and are never shown
 * on the card. Photos and notes are managed on the card itself.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Tag, Trash2, X } from "lucide-react";
import type { ContactKind, CustomField, PersonFields } from "../../../shared/types";
import { AGE_RANGES, EMPTY_FIELDS, MARITAL_STATUSES, PERSON_FIELD_KEYS } from "../../../shared/types";
import { api } from "../lib/api";
import type { PersonFull } from "../lib/hooks";
import { Button, cx, Field, IconButton, Select, TextArea, TextInput } from "./ui";

export interface Draft extends PersonFields {
  keyFacts: string[];
  contacts: { id?: string; kind: ContactKind; label: string; value: string }[];
  links: { id?: string; label: string; url: string }[];
  tags: string[];
  custom: Record<string, string>;
}

export function draftFrom(p?: PersonFull | null): Draft {
  const base = { ...EMPTY_FIELDS } as Draft;
  if (p) for (const k of PERSON_FIELD_KEYS) base[k] = p[k] ?? "";
  return {
    ...base,
    keyFacts: p ? [...p.keyFacts] : [],
    contacts: p ? p.contacts.map((c) => ({ ...c })) : [],
    links: p ? p.links.map((l) => ({ ...l })) : [],
    tags: p ? [...p.tags] : [],
    custom: p ? { ...p.custom } : {},
  };
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function BirthdayInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const m = value.match(/^(?:(\d{4})-)?(\d{2})-(\d{2})$/);
  const [year, setYear] = useState(m?.[1] ?? "");
  const [month, setMonth] = useState(m?.[2] ?? "");
  const [day, setDay] = useState(m?.[3] ?? "");
  useEffect(() => {
    if (!month || !day) { onChange(""); return; }
    onChange(`${/^\d{4}$/.test(year) ? year + "-" : ""}${month}-${day}`);
  }, [year, month, day]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="grid grid-cols-[1.4fr_0.8fr_1fr] gap-2">
      <Select aria-label="Birthday month" value={month} onChange={(e) => setMonth(e.target.value)}>
        <option value="">Month</option>{MONTHS.map((n, i) => <option key={n} value={String(i + 1).padStart(2, "0")}>{n}</option>)}
      </Select>
      <Select aria-label="Birthday day" value={day} onChange={(e) => setDay(e.target.value)}>
        <option value="">Day</option>{Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, "0")).map((d) => <option key={d} value={d}>{Number(d)}</option>)}
      </Select>
      <TextInput aria-label="Birthday year (optional)" placeholder="Year (optional)" inputMode="numeric" maxLength={4} value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, ""))} />
    </div>
  );
}

function Group({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3.5 rounded-2xl border border-line p-4">
      <div><h3 className="font-display text-[18px] font-semibold">{title}</h3>{hint && <p className="text-[12.5px] text-faint">{hint}</p>}</div>
      {children}
    </section>
  );
}

const CONTACT_HINT: Record<ContactKind, { label: string; value: string }> = {
  phone: { label: "Mobile, Office…", value: "(512) 555-0148" },
  email: { label: "Work, Personal…", value: "name@example.com" },
  address: { label: "Office, Home…", value: "Street\nCity, State ZIP" },
};

export function PersonEditor({ draft, setDraft, fields, error }: { draft: Draft; setDraft: (d: Draft) => void; fields: CustomField[]; error?: string }) {
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft({ ...draft, [k]: v });
  const text = (k: keyof PersonFields, label: string, props: { placeholder?: string; hint?: string; area?: boolean; list?: string } = {}) => (
    <Field label={label} htmlFor={`pe-${k}`} hint={props.hint}>
      {props.area
        ? <TextArea id={`pe-${k}`} value={draft[k]} placeholder={props.placeholder} onChange={(e) => set(k, e.target.value)} />
        : <TextInput id={`pe-${k}`} value={draft[k]} placeholder={props.placeholder} list={props.list} onChange={(e) => set(k, e.target.value)} />}
    </Field>
  );
  const categories = useQuery({ queryKey: ["categories"], queryFn: () => api.get<string[]>("/api/categories") });
  const [tagText, setTagText] = useState("");
  const addTag = () => {
    const parts = tagText.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
    if (parts.length) set("tags", [...new Set([...draft.tags, ...parts])]);
    setTagText("");
  };
  const liveFields = useMemo(() => fields.filter((f) => !f.archived), [fields]);

  return (
    <div className="flex flex-col gap-4">
      {error && <div role="alert" className="rounded-xl bg-danger-soft px-4 py-2.5 text-[13.5px] text-danger">{error}</div>}
      <Group title="Name" hint="Only the first name is required. Several people can share a name — the rest of the card tells them apart.">
        <div className="grid grid-cols-3 gap-3">
          {text("firstName", "First name *")}{text("lastName", "Last name")}{text("nickname", "Nickname", { hint: "Shown in brackets after the name." })}
        </div>
        {text("description", "One-line description", { placeholder: "Owner, Park Family Dental · met at the Chamber lunch", hint: "Shown under the name on their card." })}
      </Group>

      <Group title="Key facts" hint="Pinned at the top of the card — the things to remember before you say hello.">
        {draft.keyFacts.map((f, i) => (
          <div key={i} className="flex gap-2">
            <TextInput aria-label={`Key fact ${i + 1}`} value={f} onChange={(e) => set("keyFacts", draft.keyFacts.map((x, j) => (j === i ? e.target.value : x)))} />
            <IconButton label="Remove key fact" onClick={() => set("keyFacts", draft.keyFacts.filter((_, j) => j !== i))}><Trash2 size={15} /></IconButton>
          </div>
        ))}
        <div><Button size="sm" icon={<Plus size={14} />} onClick={() => set("keyFacts", [...draft.keyFacts, ""])}>Key fact</Button></div>
      </Group>

      <Group title="Tags" hint="Free-form and not case-sensitive. Search finds people by their tags; tags are never shown on the card.">
        <div className="flex flex-wrap items-center gap-2">
          {draft.tags.map((t) => (
            <span key={t} className="flex items-center gap-1 rounded-full bg-accent-soft py-1 pl-3 pr-1 text-[13px] text-accent-text">
              <Tag size={12} />{t}
              <button type="button" aria-label={`Remove tag ${t}`} onClick={() => set("tags", draft.tags.filter((x) => x !== t))} className="rounded-full p-1 hover:bg-accent-softer"><X size={12} /></button>
            </span>
          ))}
          <input aria-label="Add a tag" value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder="type a tag, Enter to add"
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(); } }} onBlur={addTag}
            className="h-8 w-48 rounded-full border border-dashed border-line-2 bg-transparent px-3 text-[13px] placeholder:text-faint focus:border-accent focus:outline-none" />
        </div>
      </Group>

      <Group title="Contact">
        {draft.contacts.map((c, i) => (
          <div key={i} className="grid grid-cols-[120px_160px_minmax(0,1fr)_36px] items-start gap-2">
            <Select aria-label="Kind" value={c.kind} onChange={(e) => set("contacts", draft.contacts.map((x, j) => (j === i ? { ...x, kind: e.target.value as ContactKind } : x)))}>
              <option value="phone">Phone</option><option value="email">Email</option><option value="address">Address</option>
            </Select>
            <TextInput aria-label="Label" placeholder={CONTACT_HINT[c.kind].label} value={c.label} onChange={(e) => set("contacts", draft.contacts.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
            {c.kind === "address"
              ? <TextArea aria-label="Address" className="min-h-[64px]" placeholder={CONTACT_HINT[c.kind].value} value={c.value} onChange={(e) => set("contacts", draft.contacts.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
              : <TextInput aria-label={c.kind === "phone" ? "Phone number" : "Email address"} placeholder={CONTACT_HINT[c.kind].value} value={c.value} onChange={(e) => set("contacts", draft.contacts.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />}
            <IconButton label="Remove" onClick={() => set("contacts", draft.contacts.filter((_, j) => j !== i))}><Trash2 size={15} /></IconButton>
          </div>
        ))}
        <div className="flex gap-2">
          {(["phone", "email", "address"] as ContactKind[]).map((k) => (
            <Button key={k} size="sm" icon={<Plus size={14} />} onClick={() => set("contacts", [...draft.contacts, { kind: k, label: "", value: "" }])}>{k === "phone" ? "Phone" : k === "email" ? "Email" : "Address"}</Button>
          ))}
        </div>
      </Group>

      <Group title="Links" hint="Social media or any other page. Name each link whatever you like.">
        {draft.links.map((l, i) => (
          <div key={i} className="grid grid-cols-[220px_minmax(0,1fr)_36px] gap-2">
            <TextInput aria-label="Link name" placeholder="LinkedIn, Practice Instagram…" value={l.label} onChange={(e) => set("links", draft.links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
            <TextInput aria-label="Link address" placeholder="linkedin.com/in/…" value={l.url} onChange={(e) => set("links", draft.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
            <IconButton label="Remove link" onClick={() => set("links", draft.links.filter((_, j) => j !== i))}><Trash2 size={15} /></IconButton>
          </div>
        ))}
        <div><Button size="sm" icon={<Plus size={14} />} onClick={() => set("links", [...draft.links, { label: "", url: "" }])}>Link</Button></div>
        <div className="grid grid-cols-2 gap-3">
          {text("businessWebsite", "Business website", { placeholder: "parkfamilydental.com" })}
          {text("businessDescription", "About the business", { placeholder: "Family dentistry, 3 dentists" })}
        </div>
      </Group>

      <Group title="Work">
        <div className="grid grid-cols-3 gap-3">
          {text("title", "Title", { placeholder: "Founder, Senior director, Attorney…" })}
          {text("profession", "Profession", { placeholder: "Dentist" })}
          {text("businessCategory", "Business category", { placeholder: "Legal, Finance, Marketing…", list: "pm-categories" })}
        </div>
        <datalist id="pm-categories">{(categories.data ?? []).map((c) => <option key={c} value={c} />)}</datalist>
      </Group>

      <Group title="Background">
        <div className="grid grid-cols-3 gap-3">
          <Field label="Age range" htmlFor="pe-age"><Select id="pe-age" value={draft.ageRange} onChange={(e) => set("ageRange", e.target.value)}><option value="">—</option>{AGE_RANGES.map((a) => <option key={a}>{a}</option>)}</Select></Field>
          {text("fromPlace", "Where they are from", { placeholder: "Portland, Oregon" })}
          <Field label="Date met" htmlFor="pe-met"><TextInput id="pe-met" type="date" value={draft.dateMet} onChange={(e) => set("dateMet", e.target.value)} /></Field>
        </div>
        <Field label="Birthday" hint="The year is optional."><BirthdayInput value={draft.birthday} onChange={(v) => set("birthday", v)} /></Field>
        {text("howMet", "How you met", { area: true, placeholder: "Where, when, who introduced you, what you talked about…" })}
        {text("generalDescription", "Description", { area: true, placeholder: "What they look like, what they are like — anything that helps you place them." })}
      </Group>

      <Group title="Family">
        <div className="grid grid-cols-3 gap-3">
          <Field label="Relationship" htmlFor="pe-marital"><Select id="pe-marital" value={draft.maritalStatus} onChange={(e) => set("maritalStatus", e.target.value)}><option value="">—</option>{MARITAL_STATUSES.map((m) => <option key={m}>{m}</option>)}</Select></Field>
          {text("kids", "Kids", { placeholder: "2 (Mia 18, Owen 14) or None" })}
          {text("pets", "Pets", { placeholder: "Dog — Biscuit" })}
        </div>
        {text("familyNotes", "Family notes", { area: true })}
      </Group>

      {liveFields.length > 0 && (
        <Group title="More" hint="Your own fields, from Settings → People fields.">
          {liveFields.map((f) => (
            <Field key={f.id} label={f.name} htmlFor={`cf-${f.id}`}>
              {f.type === "boolean" ? (
                <div className="flex gap-2" role="radiogroup" aria-label={f.name}>
                  {[["", "—"], ["true", "Yes"], ["false", "No"]].map(([v, l]) => (
                    <button key={v} type="button" role="radio" aria-checked={(draft.custom[f.id] ?? "") === v} onClick={() => set("custom", { ...draft.custom, [f.id]: v })}
                      className={cx("h-9 rounded-full border px-4 text-[13.5px]", (draft.custom[f.id] ?? "") === v ? "border-accent bg-accent text-accent-ink" : "border-line-2 hover:bg-surface-2")}>{l}</button>
                  ))}
                </div>
              ) : f.type === "paragraph"
                ? <TextArea id={`cf-${f.id}`} value={draft.custom[f.id] ?? ""} onChange={(e) => set("custom", { ...draft.custom, [f.id]: e.target.value })} />
                : <TextInput id={`cf-${f.id}`} value={draft.custom[f.id] ?? ""} onChange={(e) => set("custom", { ...draft.custom, [f.id]: e.target.value })} />}
            </Field>
          ))}
        </Group>
      )}
    </div>
  );
}
