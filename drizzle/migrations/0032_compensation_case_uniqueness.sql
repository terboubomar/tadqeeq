-- One compensation case per order and platform in a workspace, and one case per
-- piece of Telegram evidence. The app already checks before inserting; these
-- indexes close the race where two requests (double click, two employees,
-- retried webhook) insert at the same time.
--
-- Additive and safe to re-run. If the table already holds duplicates, the index
-- is NOT created and a NOTICE lists how many; resolve them (merge or delete the
-- extra cases) and re-run this migration. Find them with:
--   SELECT workspace_id, platform, upper(btrim(order_number)) AS order_key, count(*)
--   FROM public.compensation_cases
--   GROUP BY 1, 2, 3 HAVING count(*) > 1;
DO $$
DECLARE
  v_duplicates integer;
BEGIN
  SELECT count(*) INTO v_duplicates
  FROM (
    SELECT 1
    FROM public.compensation_cases
    GROUP BY workspace_id, platform, upper(btrim(order_number))
    HAVING count(*) > 1
  ) d;

  IF v_duplicates = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS compensation_cases_workspace_platform_order_uidx
      ON public.compensation_cases (workspace_id, platform, upper(btrim(order_number)));
  ELSE
    RAISE NOTICE 'compensation_cases has % duplicate order groups; unique index not created', v_duplicates;
  END IF;

  SELECT count(*) INTO v_duplicates
  FROM (
    SELECT 1
    FROM public.compensation_cases
    WHERE evidence_id IS NOT NULL
    GROUP BY workspace_id, evidence_id
    HAVING count(*) > 1
  ) d;

  IF v_duplicates = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS compensation_cases_workspace_evidence_uidx
      ON public.compensation_cases (workspace_id, evidence_id)
      WHERE evidence_id IS NOT NULL;
  ELSE
    RAISE NOTICE 'compensation_cases has % evidence items used by several cases; unique index not created', v_duplicates;
  END IF;
END
$$;
