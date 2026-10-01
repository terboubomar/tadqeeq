import { describe, expect, test } from "bun:test";

describe("Telegram compensation evidence workflow", () => {
  test("keeps the webhook secret-protected and stores only Telegram references, never media", async () => {
    const source = await Bun.file("src/lib/telegram-webhook.server.ts").text();

    expect(source).toContain("x-telegram-bot-api-secret-token");
    expect(source).toContain("telegram_file_id");
    expect(source).toContain("telegram_file_unique_id");
    expect(source).toContain("thumbnail_file_id: media.thumbnailFileId");
    // No copy of a photo, video or thumbnail is written to Supabase Storage.
    expect(source).not.toMatch(/\.storage\s*\.from\(/);
    expect(source).not.toContain(".upload(");
    expect(source).not.toContain("updateBucket");
    expect(source).not.toContain("thumbnail_storage_path");
  });

  test("evidence search and media proxy never read or write Supabase Storage", async () => {
    for (const file of [
      "src/lib/compensation-evidence.server.ts",
      "src/lib/telegram-evidence-media.server.ts",
    ]) {
      const source = await Bun.file(file).text();
      expect({ file, storage: /\.storage\s*\.from\(/.test(source) }).toEqual({ file, storage: false });
      expect(source).not.toContain("createSignedUrl");
      expect(source).not.toContain(".upload(");
    }
  });

  test("previewing or downloading evidence never deletes it from the Telegram group", async () => {
    for (const file of [
      "src/lib/telegram-webhook.server.ts",
      "src/lib/telegram-evidence-media.server.ts",
      "src/lib/compensation-evidence.server.ts",
      "src/components/compensation/evidence-media.ts",
    ]) {
      const source = await Bun.file(file).text();
      expect({ file, deletes: /deleteMessages?\b/.test(source) }).toEqual({ file, deletes: false });
    }
  });

  test("migration keeps evidence write access server-only", async () => {
    const sql = await Bun.file(
      "drizzle/migrations/0021_telegram_compensation_evidence.sql",
    ).text();

    expect(sql).toContain("ALTER TABLE public.telegram_order_evidence ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain(
      "GRANT SELECT\n  ON TABLE public.telegram_order_evidence TO authenticated",
    );
    expect(sql).not.toContain(
      "GRANT SELECT, INSERT\n  ON TABLE public.telegram_order_evidence TO authenticated",
    );
    expect(sql).toContain("GRANT ALL ON TABLE public.telegram_order_evidence TO service_role");
    expect(sql).toContain("telegram_evidence_thumbnails_select_own");
  });


  test("registers Telegram against the public webhook route", async () => {
    const server = await Bun.file(
      "src/lib/compensation-evidence.server.ts",
    ).text();
    const route = await Bun.file(
      "src/routes/api/public/telegram-webhook.ts",
    ).text();

    expect(server).toContain("/api/public/telegram-webhook");
    expect(server).not.toContain('origin + "/api/telegram-webhook"');
    expect(route).toContain('createFileRoute("/api/public/telegram-webhook")');
  });

  test("does not couple Telegram evidence to marketplace audit engines", async () => {
    const routes = await Promise.all(
      [
        "src/routes/compensation.tsx",
        "src/routes/compensation/index.tsx",
        "src/routes/compensation/cases.tsx",
        "src/routes/compensation/evidence.tsx",
        "src/routes/compensation/scanner.tsx",
        "src/routes/compensation/branches.tsx",
      ].map((path) => Bun.file(path).text()),
    );
    const webhook = await Bun.file("src/lib/telegram-webhook.server.ts").text();

    for (const source of [...routes, webhook]) {
      expect(source).not.toContain('from "@/lib/analysis/hungerstation"');
      expect(source).not.toContain('from "@/lib/analysis/keeta"');
      expect(source).not.toContain('from "@/lib/analysis/jahez"');
    }
  });
});
