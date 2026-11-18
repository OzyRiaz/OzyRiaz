-- Rebrand BD Feast -> FeastQuarter. DATA-ONLY and idempotent: no tables, columns, policies or ids are renamed.
-- Safe to run on an existing database; safe to run twice. (Only text stored in settings rows changes.)
update platform_settings
set membership_benefits = coalesce((
  select array_agg(replace(replace(b, 'BD Feast Plus', 'FeastQuarter Plus'), 'BD Feast', 'FeastQuarter') order by ord)
  from unnest(membership_benefits) with ordinality as t(b, ord)
), '{}')
where id = 'main';
-- Existing orders keep their historic references (BDF-XXXXXX); new orders use FQ-XXXXXX. Both are unique and valid.
