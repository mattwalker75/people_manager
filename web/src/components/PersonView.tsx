/** The read-only sections of the person card (Overview · Contact & links · Notes · Details · More). */
import type { ReactNode } from "react";
import { Globe, Link2, Mail, MapPin, Phone } from "lucide-react";
import type { CustomField } from "../../../shared/types";
import { formatBirthday, formatDate, hrefFor, linkParts } from "../lib/format";
import type { PersonFull } from "../lib/hooks";
import { NotesList, QuickNote } from "./NotesPanel";

/** Plain text with any links in it clickable. */
export function Linkified({ text }: { text: string }) {
  return <>{linkParts(text).map((p, i) => p.href ? <a key={i} href={p.href} target="_blank" rel="noopener noreferrer" className="text-accent-text underline decoration-accent/40 underline-offset-2 hover:decoration-accent">{p.text}</a> : <span key={i}>{p.text}</span>)}</>;
}

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5 rounded-2xl border border-line p-4">
      <div className="flex items-center gap-2"><h3 className="flex-1 font-display text-[18px] font-semibold">{title}</h3>{aside}</div>
      {children}
    </section>
  );
}

const Para = ({ text, empty }: { text: string; empty: string }) =>
  text ? <p className="whitespace-pre-line text-[14px] leading-relaxed text-ink-2"><Linkified text={text} /></p> : <p className="text-[13.5px] text-faint">{empty}</p>;

export function OverviewTab({ p, onAllNotes }: { p: PersonFull; onAllNotes: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <Section title="How we met"><Para text={p.howMet} empty="Not written down yet." /></Section>
        <Section title="Description"><Para text={p.generalDescription} empty="Nothing yet — what do they look like, what are they like?" /></Section>
      </div>
      <Section title="Latest notes" aside={p.notes.length > 2 ? <button type="button" onClick={onAllNotes} className="text-[13px] text-accent-text hover:underline">All {p.notes.length} notes →</button> : undefined}>
        <QuickNote personId={p.id} />
        <NotesList person={p} limit={2} />
      </Section>
    </div>
  );
}

export function ContactTab({ p }: { p: PersonFull }) {
  const groups: [string, ReactNode, { label: string; value: ReactNode }[]][] = [
    ["Phone", <Phone size={15} />, p.contacts.filter((c) => c.kind === "phone").map((c) => ({ label: c.label, value: <a href={`tel:${c.value.replace(/[^\d+]/g, "")}`} className="hover:underline">{c.value}</a> }))],
    ["Email", <Mail size={15} />, p.contacts.filter((c) => c.kind === "email").map((c) => ({ label: c.label, value: <a href={`mailto:${c.value}`} className="text-accent-text hover:underline">{c.value}</a> }))],
    ["Address", <MapPin size={15} />, p.contacts.filter((c) => c.kind === "address").map((c) => ({ label: c.label, value: <span className="whitespace-pre-line">{c.value}</span> }))],
    ["Business website", <Globe size={15} />, [
      ...(p.businessWebsite ? [{ label: "Site", value: <a href={hrefFor(p.businessWebsite)} target="_blank" rel="noopener noreferrer" className="text-accent-text hover:underline">{p.businessWebsite}</a> }] : []),
      ...(p.businessDescription ? [{ label: "About", value: <span className="whitespace-pre-line"><Linkified text={p.businessDescription} /></span> }] : []),
    ]],
    ["Links", <Link2 size={15} />, p.links.map((l) => ({ label: l.label, value: <a href={hrefFor(l.url)} target="_blank" rel="noopener noreferrer" className="break-all text-accent-text hover:underline">{l.url}</a> }))],
  ];
  const any = groups.some((g) => g[2].length);
  if (!any) return <p className="py-6 text-center text-mute">No phone numbers, emails, addresses or links yet. Click <b>Edit</b> to add them.</p>;
  return (
    <div className="grid grid-cols-2 gap-4">
      {groups.filter((g) => g[2].length).map(([title, icon, items]) => (
        <Section key={title} title={title} aside={<span className="text-faint">{icon}</span>}>
          {items.map((it, i) => (
            <div key={i} className="grid grid-cols-[110px_minmax(0,1fr)] gap-2.5 text-[14px]"><span className="text-faint">{it.label || "—"}</span><span className="min-w-0 [overflow-wrap:anywhere]">{it.value}</span></div>
          ))}
        </Section>
      ))}
    </div>
  );
}

export function DetailsTab({ p }: { p: PersonFull }) {
  const family = [p.maritalStatus, p.kids && `Kids: ${p.kids}`, p.pets && `Pets: ${p.pets}`].filter(Boolean).join(" · ");
  const rows: [string, ReactNode][] = [
    ["First name", p.firstName], ["Last name", p.lastName], ["Nickname", p.nickname], ["One-line description", p.description],
    ["Title", p.title], ["Profession", p.profession], ["Business category", p.businessCategory], ["Age range", p.ageRange],
    ["Where they are from", p.fromPlace], ["Birthday", p.birthday ? formatBirthday(p.birthday) : ""], ["Date met", p.dateMet ? formatDate(p.dateMet) : ""],
    ["Family", family], ["Family notes", p.familyNotes ? <span className="whitespace-pre-line"><Linkified text={p.familyNotes} /></span> : ""],
  ];
  return (
    <div className="grid grid-cols-2 gap-x-7 gap-y-1 rounded-2xl border border-line p-5">
      {rows.map(([k, v]) => (
        <div key={k} className="flex flex-col gap-0.5 border-b border-line py-2.5">
          <span className="text-[12px] text-faint">{k}</span>
          <span className="text-[14.5px] leading-snug">{v || <span className="text-faint">—</span>}</span>
        </div>
      ))}
    </div>
  );
}

export function MoreTab({ p, fields }: { p: PersonFull; fields: CustomField[] }) {
  const live = fields.filter((f) => !f.archived);
  if (!live.length) return <p className="py-6 text-center text-mute">You have no custom fields yet. Add them in <b>Settings → People fields</b> — for example “Golf handicap” or “Newsletter subscriber”.</p>;
  return (
    <div className="flex flex-col rounded-2xl border border-line px-5 py-2">
      {live.map((f) => {
        const v = p.custom[f.id] ?? "";
        const shown = f.type === "boolean" ? (v === "true" ? "Yes" : v === "false" ? "No" : "") : v;
        return (
          <div key={f.id} className="grid grid-cols-[220px_minmax(0,1fr)] gap-3 border-b border-line py-3 text-[14px] last:border-0">
            <span className="text-faint">{f.name}</span>
            <span className="whitespace-pre-line">{shown ? <Linkified text={shown} /> : <span className="text-faint">—</span>}</span>
          </div>
        );
      })}
    </div>
  );
}
