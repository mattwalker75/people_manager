import type { PersonSummary } from "../../../shared/types";
export { displayName, fullName } from "../../../shared/types";

export function initials(p: { firstName: string; lastName: string }): string {
  return ((p.firstName[0] || "") + (p.lastName[0] || "")).toUpperCase() || "?";
}

/** A tile colour picked from the name, so a person always gets the same one. */
const TILES: [string, string][] = [
  ["#d5ece8", "#0b4f49"], ["#e3f1d3", "#3f6212"], ["#f7dcea", "#9d174d"], ["#dbe8fb", "#1d4ed8"], ["#fdf0c8", "#854d0e"],
  ["#e8e1ff", "#4c3aa8"], ["#fde2d3", "#9a3412"], ["#d9f2f7", "#0e6177"], ["#ececf0", "#3f3f48"], ["#f3e3d3", "#7a4a1d"],
];
export function tileColors(p: { firstName: string; lastName: string; id?: string }): { bg: string; fg: string } {
  const key = `${p.firstName} ${p.lastName}`;
  let h = 0; for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const [bg, fg] = TILES[h % TILES.length];
  return { bg, fg };
}

export function photoUrl(personId: string, filename: string): string {
  return `/photos/${encodeURIComponent(personId)}/${encodeURIComponent(filename)}`;
}
export const summaryPhoto = (p: PersonSummary) => (p.photo ? photoUrl(p.id, p.photo.filename) : null);

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "June 4" or "June 4, 1981" from "06-04" / "1981-06-04". */
export function formatBirthday(v: string): string {
  const m = v.match(/^(?:(\d{4})-)?(\d{2})-(\d{2})$/);
  if (!m) return v;
  const s = `${MONTHS[Number(m[2]) - 1] ?? m[2]} ${Number(m[3])}`;
  return m[1] ? `${s}, ${m[1]}` : s;
}
/** "March 12, 2026" from "2026-03-12". */
export function formatDate(v: string): string {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}` : v;
}
/** "Sep 22, 2026" from an ISO timestamp. */
export function formatStamp(iso: string): string {
  const d = new Date(iso);
  return isNaN(+d) ? iso : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
export function formatBytes(n: number): string {
  return n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`;
}

/** Split text into plain runs and links, so paragraphs stay plain text with clickable links. */
export function linkParts(text: string): { text: string; href?: string }[] {
  const out: { text: string; href?: string }[] = [];
  const re = /(https?:\/\/[^\s<>"')\]]+|www\.[^\s<>"')\]]+|[\w.+-]+@[\w-]+\.[\w.-]+)/g;
  let last = 0; let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    let url = m[0]; let tail = "";
    const t = url.match(/[.,;:!?]+$/); if (t) { tail = t[0]; url = url.slice(0, -tail.length); }
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    out.push({ text: url, href: url.includes("@") && !url.includes("/") ? `mailto:${url}` : url.startsWith("www.") ? `https://${url}` : url });
    if (tail) out.push({ text: tail });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/** A link a person typed ("linkedin.com/in/x") made clickable. */
export function hrefFor(url: string): string {
  if (/^(https?:|mailto:|tel:)/i.test(url)) return url;
  if (/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(url)) return `mailto:${url}`;
  return `https://${url}`;
}
