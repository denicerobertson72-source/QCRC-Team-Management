-- V1.61: repair the RETURNS TABLE member_id ambiguity in the deployed Advanced Training publish RPC.
do $$
declare v_definition text;
begin
  select pg_get_functiondef('public.publish_advanced_training_held_lineup(uuid,jsonb)'::regprocedure) into v_definition;
  if position('''reconciliation_member_id'', member_id, ''action'', ''update''' in v_definition) = 0 then
    raise exception 'Expected Advanced Training publish member_id expression was not found';
  end if;
  v_definition := replace(
    v_definition,
    '''reconciliation_member_id'', member_id, ''action'', ''update''',
    '''reconciliation_member_id'', members.member_id, ''action'', ''update'''
  );
  execute v_definition;
end;
$$;
