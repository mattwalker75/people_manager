import { describe, expect, it } from "vitest";
import { caretAfterFormat, formatPhone } from "../web/src/lib/phone.js";

describe("phone numbers shaped while typing", () => {
  it("builds the US format as digits arrive", () => {
    const steps = ["5", "51", "512", "5125", "512555", "5125550", "5125550148"].map(formatPhone);
    expect(steps).toEqual(["(5", "(51", "(512", "(512) 5", "(512) 555", "(512) 555-0", "(512) 555-0148"]);
  });
  it("accepts numbers typed with their own punctuation, a leading 1, and extensions", () => {
    expect(formatPhone("512-555-0148")).toBe("(512) 555-0148");
    expect(formatPhone("(512)5550148")).toBe("(512) 555-0148");
    expect(formatPhone("1 512 555 0148")).toBe("+1 (512) 555-0148");
    expect(formatPhone("+1 512 555 0148")).toBe("+1 (512) 555-0148");
    expect(formatPhone("5125550148 x204")).toBe("(512) 555-0148 x204");
    expect(formatPhone("5125550148 ext. 7")).toBe("(512) 555-0148 x7");
  });
  it("leaves other countries and odd input alone", () => {
    expect(formatPhone("+44 20 7946 0958")).toBe("+44 20 7946 0958");
    expect(formatPhone("+52 55 1234 5678")).toBe("+52 55 1234 5678");
    expect(formatPhone("020 7946 0958 44")).toBe("020 7946 0958 44"); // 12 digits: not North American
    expect(formatPhone("")).toBe("");
    expect(formatPhone("abc")).toBe("abc");
  });
  it("keeps the caret after the same digit", () => {
    expect(caretAfterFormat("512555", 3, "(512) 555")).toBe(4);   // after "512"
    expect(caretAfterFormat("5125550148", 10, "(512) 555-0148")).toBe(14);
    expect(caretAfterFormat("", 0, "")).toBe(0);
  });
});
