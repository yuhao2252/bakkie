-- ============================================================================
-- Bakkie — fix the blend-percentage error message
--
-- In RAISE, %% prints a literal percent sign and a single % inserts the next
-- argument. The original format 'total %%%' therefore printed "total %120.00".
-- Passing the value with its unit as one argument avoids the ambiguity.
--
-- Fixed in a new migration because the original has already been applied.
-- ============================================================================

create or replace function check_variety_percentage_total()
returns trigger
language plpgsql
as $$
declare
  total numeric;
  target_coffee uuid;
begin
  -- NEW is unassigned during DELETE, so branch on TG_OP rather than coalesce.
  if tg_op = 'DELETE' then
    target_coffee := old.coffee_id;
  else
    target_coffee := new.coffee_id;
  end if;

  select sum(percentage) into total
    from coffee_varieties
   where coffee_id = target_coffee;

  if total is not null and total > 100 then
    raise exception 'Blend percentages for coffee % add up to %, which exceeds 100%%',
      target_coffee, total || '%';
  end if;

  return null;
end;
$$;
