import { describe, expect, test } from "bun:test";

describe("Telegram compensation evidence workflow", () => {
  test("keeps Telegram webhook secret-protected and stores thumbnails instead of full videos", async () => {
    const source = await Bun.file("src/lib/telegram-webhook.server.ts").text();

    expect(source).toContain("x-telegram-bot-api-secret-token");
    expect(source).toContain("telegram_file_id");
    expect(source).toContain("thumbnail_storage_path");
    expect(source).toContain("thumbnailFileId");
    expect(source).toContain("telegram-evidence-thumbnails");
    expect(source).not.toContain(".upload(path, media.fileId");
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

  test("does not couple Telegram evidence to marketplace audit engines", async () => {
    const route = await Bun.file(
      "src/routes/_authenticated/compensation.tsx",
    ).text();
    const webhook = await Bun.file("src/lib/telegram-webhook.server.ts").text();

    for (const source of [route, webhook]) {
      expect(source).not.toContain('from "@/lib/analysis/hungerstation"');
      expect(source).not.toContain('from "@/lib/analysis/keeta"');
      expect(source).not.toContain('from "@/lib/analysis/jahez"');
    }
  });
});
