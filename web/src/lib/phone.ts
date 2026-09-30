/**
 * Phone numbers shaped as you type, the North American way:
 *   5125550148      → (512) 555-0148
 *   15125550148     → +1 (512) 555-0148
 *   512 555 0148 x204 → (512) 555-0148 x204
 * A number starting with "+" for another country is left as typed — their
 * groupings differ too much to guess.
 */
export function formatPhone(raw: string): string {
  const s = raw.replace(/\s+/g, " ").trimStart();
  if (!s) return "";
  if (s.startsWith("+") && !/^\+1\b/.test(s) && !/^\+1[ (]/.test(s)) return s; // another country: leave it
  const ext = s.match(/\s*(?:x|ext\.?|extension)\s*(\d+)?\s*$/i);
  const main = ext ? s.slice(0, ext.index) : s;
  const digits = main.replace(/\D/g, "");
  if (!digits) return s;
  if (digits.length > 11 || (digits.length === 11 && digits[0] !== "1")) return s; // not a North American number
  const plusOne = digits.length === 11 || /^\+?1[\s(-]/.test(main);
  const d = digits.length === 11 ? digits.slice(1) : plusOne && digits.length > 10 ? digits.slice(1) : digits;
  let out = "";
  if (d.length <= 3) out = d.length ? `(${d}` : "";
  else if (d.length <= 6) out = `(${d.slice(0, 3)}) ${d.slice(3)}`;
  else out = `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 10)}`;
  if (plusOne && out) out = `+1 ${out}`;
  return out + (ext ? ` x${ext[1] ?? ""}` : "");
}

/** Where the caret belongs after formatting: after the same number of digits it was after before. */
export function caretAfterFormat(before: string, caret: number, after: string): number {
  const wanted = before.slice(0, caret).replace(/\D/g, "").length;
  if (!wanted) return 0;
  let seen = 0;
  for (let i = 0; i < after.length; i++) { if (/\d/.test(after[i])) { seen++; if (seen === wanted) return i + 1; } }
  return after.length;
}
