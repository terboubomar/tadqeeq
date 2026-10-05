import { describe, expect, test } from "bun:test";

import { contactMailto } from "./contact";

describe("contactMailto", () => {
  test("fills subject and body from the form", () => {
    const url = contactMailto(
      { topic: "sales", name: " سارة ", company: "مطعم الريف", phone: "0551234567", message: "نريد عرضاً لـ 12 فرعاً" },
      "hello@example.com",
    );
    expect(url.startsWith("mailto:hello@example.com?subject=")).toBe(true);
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.get("subject")).toBe("الباقات وعرض توضيحي · مطعم الريف");
    expect(params.get("body")).toBe("نريد عرضاً لـ 12 فرعاً\n\nالاسم: سارة\nالمنشأة: مطعم الريف\nالجوال: 0551234567");
  });

  test("leaves out empty optional fields", () => {
    const params = new URLSearchParams(contactMailto({ topic: "other", name: "Ali", company: "", phone: "", message: "Hi" }, "a@b.c").split("?")[1]);
    expect(params.get("subject")).toBe("أخرى");
    expect(params.get("body")).toBe("Hi\n\nالاسم: Ali");
  });
});
