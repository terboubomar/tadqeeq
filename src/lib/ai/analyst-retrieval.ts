import type {
  AnalystContext,
  AnalystFact,
  AnalystFactKind,
} from "./analyst-context";

const ROUTE_KINDS: Record<string, AnalystFactKind[]> = {
  "/branches": ["branch", "ranking"],
  "/exceptions": ["exception", "evidence"],
  "/recovery": ["exception", "evidence"],
  "/invoice-check": ["invoice_check"],
  "/daily": ["daily"],
  "/breakdown": ["breakdown", "status"],
  "/history": ["history", "comparison"],
  "/ai": ["comparison", "ranking", "exception", "invoice_check"],
};

const DEFAULT_KINDS: AnalystFactKind[] = [
  "period",
  "warning",
  "app",
  "ranking",
  "exception",
  "comparison",
];

const MAX_RETRIEVED_FACTS = 220;

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ـ/g, "")
    .replace(/[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed]/g, "")
    .replace(/[^\p{L}\p{N}\-/]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasAny(haystack: string, values: string[]): boolean {
  return values.some((value) => haystack.includes(normalize(value)));
}

function factSearchText(fact: AnalystFact): string {
  return normalize(
    [
      fact.label,
      fact.displayValue,
      ...Object.values(fact.data).flatMap((value) =>
        Array.isArray(value) ? value.map(String) : [String(value ?? "")],
      ),
    ].join(" "),
  );
}

function requestedDateTokens(question: string): string[] {
  const normalized = question.replace(/[٠-٩]/g, (digit) =>
    String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)),
  );

  return (
    normalized.match(
      /(?:20\d{2}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]20\d{2})/g,
    ) ?? []
  ).map((value) => value.replaceAll("/", "-"));
}

function intentKinds(question: string, currentRoute: string): Set<AnalystFactKind> {
  const q = normalize(question);
  const kinds = new Set<AnalystFactKind>(["period", "warning", "app"]);

  const routeSpecific =
    hasAny(q, ["هذه الصفحة", "هنا", "الشاشة الحالية", "current screen", "this page"]) ||
    q.length < 8;
  if (routeSpecific) {
    for (const kind of ROUTE_KINDS[currentRoute] ?? []) kinds.add(kind);
  }

  if (
    hasAny(q, [
      "فرع",
      "فروع",
      "branch",
      "branches",
      "اعلى فرع",
      "اقل فرع",
      "ترتيب",
      "ranking",
    ])
  ) {
    kinds.add("branch");
    kinds.add("ranking");
  }

  if (
    hasAny(q, [
      "استثناء",
      "استثناءات",
      "exception",
      "exceptions",
      "مراجعه",
      "استرداد",
      "recovery",
      "فرق",
      "فروقات",
      "discrepancy",
    ])
  ) {
    kinds.add("exception");
    kinds.add("evidence");
  }

  if (hasAny(q, ["فاتوره", "invoice", "pdf", "المحتسب", "المنصه"])) {
    kinds.add("invoice_check");
  }

  if (
    hasAny(q, [
      "يوم",
      "يومي",
      "تاريخ",
      "daily",
      "date",
      "اغسطس",
      "سبتمبر",
      "اكتوبر",
      "نوفمبر",
      "ديسمبر",
      "يناير",
      "فبراير",
      "مارس",
      "ابريل",
      "مايو",
      "يونيو",
      "يوليو",
    ]) ||
    requestedDateTokens(question).length > 0
  ) {
    kinds.add("daily");
  }

  if (
    hasAny(q, [
      "مقارنه",
      "مقارنة",
      "فتره سابقه",
      "الفتره السابقه",
      "previous",
      "compare",
      "comparison",
      "تغير",
      "تغيّر",
      "history",
      "سابق",
    ])
  ) {
    kinds.add("comparison");
    kinds.add("history");
  }

  if (
    hasAny(q, [
      "عموله",
      "رسوم",
      "تكلفه",
      "خصم",
      "حملات",
      "تعويض",
      "breakdown",
      "status",
      "حاله الطلب",
      "حالات الطلب",
    ])
  ) {
    kinds.add("breakdown");
    kinds.add("status");
  }

  if (kinds.size === 3) {
    for (const kind of DEFAULT_KINDS) kinds.add(kind);
  }

  return kinds;
}

function currentScreenAppFact(fact: AnalystFact, currentRoute: string): boolean {
  if (fact.kind !== "app") return true;
  const route = String(fact.data["route"] ?? "");
  const currentScreen = fact.data["currentScreen"] === true;
  return currentScreen || route === currentRoute;
}

function filterDailyFacts(
  facts: AnalystFact[],
  question: string,
): AnalystFact[] {
  const tokens = requestedDateTokens(question);
  if (!tokens.length) return facts;

  const normalizedTokens = tokens.map(normalize);
  const exact = facts.filter((fact) => {
    const search = factSearchText(fact);
    return normalizedTokens.some((token) => search.includes(token));
  });

  return exact.length ? exact : facts;
}

function filterNamedBranchFacts(
  facts: AnalystFact[],
  question: string,
): AnalystFact[] {
  const q = normalize(question);
  const named = facts.filter((fact) => {
    if (fact.kind !== "branch") return true;
    const branch = normalize(String(fact.data["branch"] ?? ""));
    return branch.length >= 3 && q.includes(branch);
  });

  const matchedBranchCount = named.filter((fact) => fact.kind === "branch").length;
  return matchedBranchCount ? named : facts;
}

/**
 * Selects a deterministic subset of the server-built fact registry.
 *
 * The complete registry remains authoritative on the server for ID resolution,
 * numeric grounding, and presentation building. This function only reduces the
 * packet sent to the model.
 */
export function selectAnalystFacts(
  context: AnalystContext,
  question: string,
): AnalystFact[] {
  const kinds = intentKinds(question, context.currentRoute);

  let selected = context.facts.filter(
    (fact) => kinds.has(fact.kind) && currentScreenAppFact(fact, context.currentRoute),
  );

  if (kinds.has("daily")) selected = filterDailyFacts(selected, question);
  if (kinds.has("branch")) selected = filterNamedBranchFacts(selected, question);

  // Keep deterministic period context even if a narrow named filter removed
  // everything except one specialized row.
  const requiredPeriodFacts = context.facts.filter((fact) => fact.kind === "period");
  const byId = new Map<string, AnalystFact>();
  for (const fact of [...requiredPeriodFacts, ...selected]) byId.set(fact.id, fact);

  return [...byId.values()].slice(0, MAX_RETRIEVED_FACTS);
}
