import { describe, expect, test } from "bun:test";
import * as React from "react";
import { render } from "@react-email/render";

import { TEMPLATES } from "./registry";

describe("report-summary email", () => {
  test("renders the figures, the platforms and the link in RTL Arabic", async () => {
    const template = TEMPLATES["report-summary"]!;
    const html = await render(React.createElement(template.component, template.previewData));
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("ملخص سبتمبر 2026");
    expect(html).toContain("412,300.00 ر.س");
    expect(html).toContain("+0.8</span> نقطة");
    expect(html).toContain("هنقرستيشن");
    expect(html).toContain("https://tadqeeq.app/trends");
    const subject = typeof template.subject === "function" ? template.subject(template.previewData ?? {}) : template.subject;
    expect(subject).toBe("ملخص سبتمبر 2026 · مطاعم المذاق");
  });
});
