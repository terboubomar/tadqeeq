import { describe, expect, test } from "bun:test";

import { normalizeContactMobile, validateContact } from "./contact";

const base = { topic: "sales", name: " سارة ", company: " مطعم الريف ", email: " Sara@Example.COM ", mobile: "0551234567", message: " نريد عرضاً " };

describe("validateContact", () => {
  test("cleans a valid message", () => {
    expect(validateContact(base)).toEqual({
      ok: true,
      value: { topic: "sales", name: "سارة", company: "مطعم الريف", email: "sara@example.com", mobile: "+966551234567", message: "نريد عرضاً" },
    });
  });

  test("email and mobile are required", () => {
    expect(validateContact({ ...base, email: "" })).toEqual({ ok: false, error: "اكتب بريداً إلكترونياً صحيحاً." });
    expect(validateContact({ ...base, email: "sara@" })).toMatchObject({ ok: false });
    expect(validateContact({ ...base, mobile: "" })).toEqual({ ok: false, error: "اكتب رقم جوال صحيحاً (05XXXXXXXX)." });
    expect(validateContact({ ...base, mobile: "12345" })).toMatchObject({ ok: false });
  });

  test("company is optional; topic, name and message are not", () => {
    expect(validateContact({ ...base, company: "" })).toMatchObject({ ok: true, value: { company: null } });
    expect(validateContact({ ...base, topic: "spam" })).toMatchObject({ ok: false });
    expect(validateContact({ ...base, name: "  " })).toMatchObject({ ok: false });
    expect(validateContact({ ...base, message: "" })).toMatchObject({ ok: false });
    expect(validateContact({ ...base, message: "x".repeat(2001) })).toMatchObject({ ok: false });
  });
});

describe("normalizeContactMobile", () => {
  test("accepts Saudi formats, Arabic digits and international numbers", () => {
    expect(normalizeContactMobile("٠٥٥١٢٣٤٥٦٧")).toBe("+966551234567");
    expect(normalizeContactMobile("+966 55 123 4567")).toBe("+966551234567");
    expect(normalizeContactMobile("00971501234567")).toBe("+971501234567");
    expect(normalizeContactMobile("+20 100 123 4567")).toBe("+201001234567");
    expect(normalizeContactMobile("0123")).toBeNull();
  });
});
