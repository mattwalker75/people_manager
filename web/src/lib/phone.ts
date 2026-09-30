/**
 * Phone numbers shaped as you type, the North American way:
 *   5125550148      → (512) 555-0148
 *   1 512 555 0148  → +1 (512) 555-0148   (a 1 set apart, or +1, is the country code)
 *   512 555 0148 x204 → (512) 555-0148 x204
 *   11122233334444  → (111) 222-3333 x4444   (digits past the tenth become the extension)
 * A number starting with "+" for another country is left as typed — their
 * groupings differ too much to guess.
 */
export function formatPhone(raw: string): string {
  const s = raw.replace(/\s+/g, " ").trimStart();
  if (!s) return "";
  if (s.startsWith("+") && !/^\+1(?![0-9])/.test(s)) return s; // another country: leave it
  const ext = s.match(/\s*(?:x|ext\.?|extension)\s*(\d+)?\s*$/i);
  const main = ext ? s.slice(0, ext.index) : s;
  const digits = main.replace(/\D/g, "");
  if (!digits && !ext) return s;
  // "+1" or "1 " (a 1 set apart by a space or punctuation) is the country code; a plain run of digits never is
  const plusOne = /^\+1(?![0-9])|^1[\s().-]/.test(main.trim());
  const rest = plusOne ? digits.slice(1) : digits;
  const d = rest.slice(0, 10);
  const extra = rest.slice(10) + (ext?.[1] ?? ""); // anything past the 10th digit becomes the extension
  let out = "";
  if (d.length <= 3) out = d.length ? `(${d}` : "";
  else if (d.length <= 6) out = `(${d.slice(0, 3)}) ${d.slice(3)}`;
  else out = `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  if (plusOne && out) out = `+1 ${out}`;
  if (extra || ext) out += ` x${extra}`;
  return out;
}

/** Where the caret belongs after formatting: after the same number of digits it was after before. */
export function caretAfterFormat(before: string, caret: number, after: string): number {
  const wanted = before.slice(0, caret).replace(/\D/g, "").length;
  if (!wanted) return 0;
  let seen = 0;
  for (let i = 0; i < after.length; i++) { if (/\d/.test(after[i])) { seen++; if (seen === wanted) return i + 1; } }
  return after.length;
}
