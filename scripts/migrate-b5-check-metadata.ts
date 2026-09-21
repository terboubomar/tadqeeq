import { createClient } from "@supabase/supabase-js";

import { normalizeCheckMetadata } from "../src/lib/analysis/check-metadata";
import {
  buildPeriodExceptions,
  legacyExceptionId,
} from "../src/lib/exceptions";
import type { StoredPeriod } from "../src/lib/periods";

const supabaseUrl = process.env["SUPABASE_URL"]?.trim();
const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"]?.trim();
const apply = process.argv.includes("--apply");

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY مطلوبان لتشغيل ترحيل B5.",
  );
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

let offset = 0;
const pageSize = 100;
let scanned = 0;
let changed = 0;
let remappedWorkflows = 0;

while (true) {
  const { data, error } = await supabase
    .from("periods")
    .select("*")
    .range(offset, offset + pageSize - 1);

  if (error) throw new Error(error.message);
  if (!data?.length) break;

  for (const raw of data) {
    const period = raw as unknown as StoredPeriod;
    scanned += 1;

    const checks = normalizeCheckMetadata(
      period.platform,
      period.branches ?? [],
      period.invoice?.checks ?? [],
    );

    const unknown = checks.filter((check) =>
      check.code.includes("_LEGACY_UNKNOWN_"),
    );
    if (unknown.length) {
      throw new Error(
        "تعذّر ترحيل فترة " +
          period.id +
          " لأن فيها بنود تحقق قديمة غير معروفة: " +
          unknown.map((check) => check.label).join(" | "),
      );
    }

    const currentWorkflow = period.invoice?.exceptionWorkflow ?? {};
    const nextWorkflow = { ...currentWorkflow };
    const normalizedPeriod: StoredPeriod = {
      ...period,
      invoice: {
        ...period.invoice,
        checks,
        exceptionWorkflow: nextWorkflow,
      },
    };

    const exceptions = buildPeriodExceptions(normalizedPeriod);
    let periodRemapped = 0;

    for (const item of exceptions) {
      const legacyId = legacyExceptionId(
        period.id,
        item.sourceLevel,
        item.category,
        item.label,
        item.branchId,
      );
      const legacyEntry = currentWorkflow[legacyId];
      if (!legacyEntry || nextWorkflow[item.id]) continue;

      nextWorkflow[item.id] = legacyEntry;
      if (legacyId !== item.id) delete nextWorkflow[legacyId];
      periodRemapped += 1;
    }

    const nextInvoice = {
      ...period.invoice,
      checks,
      exceptionWorkflow: nextWorkflow,
    };

    const isChanged =
      JSON.stringify(period.invoice?.checks ?? []) !== JSON.stringify(checks) ||
      JSON.stringify(currentWorkflow) !== JSON.stringify(nextWorkflow);

    if (!isChanged) continue;

    changed += 1;
    remappedWorkflows += periodRemapped;

    if (apply) {
      const { error: updateError } = await supabase
        .from("periods")
        .update({ invoice: nextInvoice as never })
        .eq("id", period.id);
      if (updateError) throw new Error(updateError.message);
    }

    console.log(
      (apply ? "APPLY" : "DRY-RUN") +
        " period=" +
        period.id +
        " checks=" +
        checks.length +
        " workflows_remapped=" +
        periodRemapped,
    );
  }

  if (data.length < pageSize) break;
  offset += pageSize;
}

console.log(
  JSON.stringify(
    {
      mode: apply ? "apply" : "dry-run",
      scanned,
      changed,
      remappedWorkflows,
    },
    null,
    2,
  ),
);

if (!apply && changed > 0) {
  console.log("أعد التشغيل مع --apply بعد مراجعة نتيجة dry-run.");
}
