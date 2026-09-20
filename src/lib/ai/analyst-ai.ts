import { z } from "zod";

export const analystHistoryMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(1500),
});

export type AnalystHistoryMessage = z.infer<typeof analystHistoryMessageSchema>;

export const analystAiResponseSchema = z.object({
  answerability: z.enum(["grounded", "partial", "not_available"]),
  answer: z.string().min(1).max(2400),
  usedFactIds: z.array(z.string().regex(/^F\d{3}$/)).max(12),
  presentation: z.object({
    type: z.enum([
      "text",
      "branch_table",
      "exception_table",
      "comparison_table",
      "invoice_table",
      "daily_table",
      "breakdown_table",
      "history_table",
    ]),
    title: z.string().max(160),
    factIds: z.array(z.string().regex(/^F\d{3}$/)).max(12),
  }),
  limitations: z.array(z.string().min(1).max(500)).max(5),
  followUpSuggestions: z.array(z.string().min(1).max(250)).max(3),
  confidence: z.enum(["high", "medium", "low"]),
});

export type AnalystAiResponse = z.infer<typeof analystAiResponseSchema>;

export interface AnalystTableColumn {
  key: string;
  label: string;
  align: "text" | "number";
}

export interface AnalystTablePresentation {
  type: "table";
  title: string;
  columns: AnalystTableColumn[];
  rows: Array<Record<string, string>>;
}

export interface AnalystUsedFact {
  id: string;
  kind: string;
  label: string;
  displayValue: string;
}

export interface AnalystChatResult {
  response: AnalystAiResponse;
  factsUsed: AnalystUsedFact[];
  presentation: AnalystTablePresentation | null;
  model: string;
  promptVersion: string;
  scope: {
    platform: "hungerstation" | "keeta" | "jahez";
    start: string | null;
    end: string | null;
    hasPreviousPeriod: boolean;
  };
}
