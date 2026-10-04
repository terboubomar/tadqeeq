import { describe, expect, test } from "bun:test";

import { dataUrlBytes, sniffFile } from "./file-sniff";

const dataUrl = (type: string, bytes: number[] | string) =>
  `data:${type};base64,${Buffer.from(typeof bytes === "string" ? Buffer.from(bytes) : Uint8Array.from(bytes)).toString("base64")}`;

describe("sniffFile", () => {
  test("recognises PDF, PNG, JPEG and WEBP by their bytes", () => {
    expect(sniffFile(dataUrlBytes(dataUrl("application/pdf", "%PDF-1.7\n..."))!)?.ext).toBe("pdf");
    expect(sniffFile(dataUrlBytes(dataUrl("image/png", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))!)?.mime).toBe("image/png");
    expect(sniffFile(dataUrlBytes(dataUrl("image/jpeg", [0xff, 0xd8, 0xff, 0xe0]))!)?.ext).toBe("jpg");
    expect(sniffFile(Uint8Array.from([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBPVP8 ")]))?.ext).toBe("webp");
  });

  test("refuses HTML and SVG even when labelled as a PDF or image", () => {
    expect(sniffFile(dataUrlBytes(dataUrl("application/pdf", "<html><script>alert(1)</script>"))!)).toBeNull();
    expect(sniffFile(dataUrlBytes(dataUrl("image/png", '<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'))!)).toBeNull();
  });

  test("dataUrlBytes rejects anything that is not a base64 data URL", () => {
    expect(dataUrlBytes("https://evil.com/x.pdf")).toBeNull();
    expect(dataUrlBytes("data:text/html,<b>x</b>")).toBeNull();
  });
});
