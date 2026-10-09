-- Three more entry accounts for the journal: HungerStation devices (printers), the monthly subscription,
-- and CPC advertising, so a workspace can map them to its own codes. Re-runnable.

ALTER TABLE public.journal_account_settings
  DROP CONSTRAINT IF EXISTS journal_account_settings_account_key_check;

ALTER TABLE public.journal_account_settings
  ADD CONSTRAINT journal_account_settings_account_key_check CHECK (account_key IN (
    'platform_receivable',
    'sales_revenue',
    'output_vat',
    'commission_expense',
    'payment_fee_expense',
    'marketing_expense',
    'compensation_expense',
    'other_platform_fee_expense',
    'device_expense',
    'subscription_expense',
    'advertising_expense',
    'input_vat',
    'settlement_difference'
  ));
