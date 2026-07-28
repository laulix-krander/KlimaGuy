-- AP-12-02-06: read-only production metadata validation.
-- Run as one statement in the Supabase SQL Editor. This script changes no data.
with
expected_columns(column_name) as (
  values ('id'), ('project_id'), ('storage_bucket'), ('storage_path'),
    ('original_filename'), ('stored_filename'), ('mime_type'),
    ('file_size_bytes'), ('media_type'), ('category'), ('source'),
    ('upload_status'), ('uploaded_by'), ('created_at'), ('updated_at'),
    ('deleted_at'), ('caption')
),
excluded_columns(column_name) as (
  values ('customer_id'), ('sort_order'), ('processing_status'), ('width'),
    ('height'), ('page_count'), ('checksum'), ('metadata'), ('tenant_id')
),
expected_checks(constraint_name) as (
  values
    ('project_media_storage_bucket_check'), ('project_media_category_check'),
    ('project_media_source_check'), ('project_media_upload_status_check'),
    ('project_media_media_type_check'), ('project_media_mime_type_check'),
    ('project_media_mime_media_type_check'), ('project_media_file_size_positive_check'),
    ('project_media_file_size_limit_check'), ('project_media_original_filename_check'),
    ('project_media_stored_filename_check'), ('project_media_mime_extension_check'),
    ('project_media_storage_path_check'), ('project_media_caption_check')
),
table_info as (
  select c.oid, c.relrowsecurity, c.relacl
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'project_media' and c.relkind = 'r'
),
columns_actual as (
  select a.attname
  from table_info t
  join pg_catalog.pg_attribute a on a.attrelid = t.oid
  where a.attnum > 0 and not a.attisdropped
),
constraints_actual as (
  select con.conname, con.contype, con.confdeltype, pg_catalog.pg_get_constraintdef(con.oid) definition
  from table_info t join pg_catalog.pg_constraint con on con.conrelid = t.oid
),
policies as (
  select policyname, cmd, roles
  from pg_catalog.pg_policies
  where schemaname = 'public' and tablename = 'project_media'
),
storage_policies as (
  select policyname, cmd, roles
  from pg_catalog.pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and policyname like 'project media storage %'
),
rpc as (
  select p.oid, p.prosecdef, p.proconfig, p.proacl
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'soft_delete_project_media'
    and pg_catalog.pg_get_function_identity_arguments(p.oid) = 'target_media_id uuid, target_project_id uuid'
),
checks(check_order, check_name, status, expected, actual, details) as (
  select 1, 'table_exists', case when count(*) = 1 then 'PASS' else 'FAIL' end,
    'public.project_media exists', count(*)::text, 'Expected one ordinary table.' from table_info
  union all
  select 2, 'exact_17_columns', case when count(*) = 17 and count(*) filter (where e.column_name is not null) = 17 then 'PASS' else 'FAIL' end,
    'exact approved 17-column set', string_agg(a.attname, ', ' order by a.attname), 'Compares names as well as the total.'
    from columns_actual a left join expected_columns e on e.column_name = a.attname
  union all
  select 3, 'excluded_columns_absent', case when count(a.attname) = 0 then 'PASS' else 'FAIL' end,
    'no excluded columns', coalesce(string_agg(a.attname, ', '), 'none'), 'Excluded domain fields must remain absent.'
    from excluded_columns e left join columns_actual a on a.attname = e.column_name
  union all
  select 4, 'rls_enabled', case when bool_and(relrowsecurity) then 'PASS' else 'FAIL' end,
    'enabled', coalesce(bool_and(relrowsecurity)::text, 'table missing'), 'Reads pg_class.relrowsecurity.' from table_info
  union all
  select 5, 'primary_key', case when count(*) = 1 then 'PASS' else 'FAIL' end,
    'one primary key', count(*)::text, coalesce(string_agg(conname, ', '), 'none') from constraints_actual where contype = 'p'
  union all
  select 6, 'foreign_keys_restrict', case when count(*) = 2 and bool_and(confdeltype = 'r') then 'PASS' else 'FAIL' end,
    'two FKs with RESTRICT', count(*)::text, coalesce(string_agg(conname || ':' || confdeltype, ', '), 'none') from constraints_actual where contype = 'f'
  union all
  select 7, 'storage_path_unique', case when count(*) = 1 then 'PASS' else 'FAIL' end,
    'named unique constraint', count(*)::text, 'project_media_storage_bucket_path_key' from constraints_actual where contype = 'u' and conname = 'project_media_storage_bucket_path_key' and definition like '%UNIQUE (storage_bucket, storage_path)%'
  union all
  select 8, 'partial_project_list_index', case when count(*) = 1 then 'PASS' else 'FAIL' end,
    'approved partial index', count(*)::text, coalesce(string_agg(indexdef, '; '), 'none') from pg_catalog.pg_indexes where schemaname='public' and tablename='project_media' and indexname='project_media_active_project_created_idx' and indexdef like '%(project_id, created_at DESC, id)%WHERE (deleted_at IS NULL)%'
  union all
  select 9, 'named_check_constraints', case when count(c.conname) = count(e.constraint_name) then 'PASS' else 'FAIL' end,
    count(e.constraint_name)::text || ' named checks', count(c.conname)::text, coalesce(string_agg(e.constraint_name, ', ') filter (where c.conname is null), 'all present')
    from expected_checks e left join constraints_actual c on c.conname=e.constraint_name and c.contype='c'
  union all
  select 10, 'updated_at_trigger', case when count(*)=1 then 'PASS' else 'FAIL' end, 'project_media_updated enabled', count(*)::text, 'Expected non-internal trigger.' from pg_catalog.pg_trigger g join table_info t on t.oid=g.tgrelid where g.tgname='project_media_updated' and not g.tgisinternal and g.tgenabled <> 'D'
  union all
  select 11, 'protected_fields_trigger', case when count(*)=1 then 'PASS' else 'FAIL' end, 'project_media_protected_fields_guard enabled', count(*)::text, 'Expected non-internal trigger.' from pg_catalog.pg_trigger g join table_info t on t.oid=g.tgrelid where g.tgname='project_media_protected_fields_guard' and not g.tgisinternal and g.tgenabled <> 'D'
  union all
  select 12, 'anon_table_privileges', case when count(*)=0 then 'PASS' else 'FAIL' end, 'none', coalesce(string_agg(privilege_type, ', '), 'none'), 'All table-level privileges.' from information_schema.role_table_grants where table_schema='public' and table_name='project_media' and grantee='anon'
  union all
  select 13, 'public_table_privileges', case when count(*)=0 then 'PASS' else 'FAIL' end, 'none', count(*)::text, 'PUBLIC ACL entries.' from table_info t cross join lateral aclexplode(coalesce(t.relacl, acldefault('r', (select relowner from pg_class where oid=t.oid)))) a where a.grantee=0
  union all
  select 14, 'authenticated_table_privileges', case
      when (select coalesce(array_agg(privilege_type order by privilege_type), array[]::text[]) from information_schema.role_table_grants where table_schema='public' and table_name='project_media' and grantee='authenticated') = array['INSERT','SELECT']::text[]
       and (select coalesce(array_agg(column_name order by column_name), array[]::text[]) from information_schema.role_column_grants where table_schema='public' and table_name='project_media' and grantee='authenticated' and privilege_type='UPDATE') = array['caption','category','upload_status']::text[]
      then 'PASS' else 'FAIL' end,
    'table INSERT/SELECT; column UPDATE caption/category/upload_status',
    'table=' || coalesce((select string_agg(privilege_type, ',' order by privilege_type) from information_schema.role_table_grants where table_schema='public' and table_name='project_media' and grantee='authenticated'), 'none') || '; update_columns=' || coalesce((select string_agg(column_name, ',' order by column_name) from information_schema.role_column_grants where table_schema='public' and table_name='project_media' and grantee='authenticated' and privilege_type='UPDATE'), 'none'),
    'Rejects additional table operations or UPDATE columns.'
  union all
  select 15, 'authenticated_no_delete', case when count(*)=0 then 'PASS' else 'FAIL' end, 'no DELETE', count(*)::text, 'Includes table and column grants.' from information_schema.role_table_grants where table_schema='public' and table_name='project_media' and grantee='authenticated' and privilege_type='DELETE'
  union all
  select 16, 'table_select_policies', case when count(*)=2 then 'PASS' else 'FAIL' end, 'admin and reviewer SELECT', coalesce(string_agg(policyname, ', ' order by policyname), 'none'), 'Exact named policies.' from policies where cmd='SELECT' and policyname in ('project media select active admin','project media select active reviewer')
  union all
  select 17, 'table_admin_insert_policy', case when count(*)=1 then 'PASS' else 'FAIL' end, 'named INSERT policy', count(*)::text, 'project media insert active admin' from policies where cmd='INSERT' and policyname='project media insert active admin'
  union all
  select 18, 'table_admin_update_policy', case when count(*)=1 then 'PASS' else 'FAIL' end, 'named UPDATE policy', count(*)::text, 'project media update active admin' from policies where cmd='UPDATE' and policyname='project media update active admin'
  union all
  select 19, 'no_reviewer_mutation_policy', case when count(*)=0 then 'PASS' else 'FAIL' end, 'none', count(*)::text, 'Reviewer policy names with mutation commands.' from policies where policyname ilike '%reviewer%' and cmd in ('INSERT','UPDATE','DELETE')
  union all
  select 20, 'no_table_delete_policy', case when count(*)=0 then 'PASS' else 'FAIL' end, 'none', count(*)::text, 'All project_media DELETE policies.' from policies where cmd='DELETE'
  union all
  select 21, 'bucket_exists', case when count(*)=1 then 'PASS' else 'FAIL' end, 'project-media', count(*)::text, 'storage.buckets row.' from storage.buckets where id='project-media'
  union all
  select 22, 'bucket_private', case when bool_and(not public) then 'PASS' else 'FAIL' end, 'false', coalesce(bool_or(public)::text, 'bucket missing'), 'Bucket public flag.' from storage.buckets where id='project-media'
  union all
  select 23, 'bucket_mime_allowlist', case when allowed_mime_types @> array['image/jpeg','image/png','image/webp','application/pdf']::text[] and allowed_mime_types <@ array['image/jpeg','image/png','image/webp','application/pdf']::text[] then 'PASS' else 'FAIL' end,
    'image/jpeg,image/png,image/webp,application/pdf', array_to_string(allowed_mime_types, ','), 'Exact set comparison.' from storage.buckets where id='project-media'
  union all
  select 24, 'bucket_byte_limit', case when file_size_limit=25000000 then 'PASS' else 'FAIL' end, '25000000', file_size_limit::text, 'Decimal bytes.' from storage.buckets where id='project-media'
  union all
  select 25, 'storage_admin_insert_policy', case when count(*)=1 then 'PASS' else 'FAIL' end, 'named INSERT policy', count(*)::text, 'project media storage insert active admin' from storage_policies where cmd='INSERT' and policyname='project media storage insert active admin'
  union all
  select 26, 'storage_admin_select_policy', case when count(*)=1 then 'PASS' else 'FAIL' end, 'named SELECT policy', count(*)::text, 'project media storage select active admin' from storage_policies where cmd='SELECT' and policyname='project media storage select active admin'
  union all
  select 27, 'storage_reviewer_select_policy', case when count(*)=1 then 'PASS' else 'FAIL' end, 'named SELECT policy', count(*)::text, 'project media storage select active reviewer' from storage_policies where cmd='SELECT' and policyname='project media storage select active reviewer'
  union all
  select 28, 'no_storage_update_policy', case when count(*)=0 then 'PASS' else 'FAIL' end, 'none', count(*)::text, 'Project-media namespaced policies.' from storage_policies where cmd='UPDATE'
  union all
  select 29, 'no_storage_delete_policy', case when count(*)=0 then 'PASS' else 'FAIL' end, 'none', count(*)::text, 'Project-media namespaced policies.' from storage_policies where cmd='DELETE'
  union all
  select 30, 'no_storage_anon_or_public_policy', case when count(*)=0 then 'PASS' else 'FAIL' end, 'none', count(*)::text, 'Checks policy role arrays.' from storage_policies where roles && array['anon','public']::name[]
  union all
  select 31, 'soft_delete_rpc_exists', case when count(*)=1 then 'PASS' else 'FAIL' end, 'uuid, uuid overload', count(*)::text, 'public.soft_delete_project_media.' from rpc
  union all
  select 32, 'soft_delete_rpc_security_definer', case when bool_and(prosecdef) then 'PASS' else 'FAIL' end, 'true', coalesce(bool_and(prosecdef)::text,'function missing'), 'pg_proc.prosecdef.' from rpc
  union all
  select 33, 'soft_delete_rpc_search_path', case when bool_and(proconfig = array['search_path=public, pg_temp']) then 'PASS' else 'FAIL' end, 'public, pg_temp', coalesce(max(array_to_string(proconfig, ',')),'function missing'), 'Fixed function configuration.' from rpc
  union all
  select 34, 'authenticated_rpc_execute', case when bool_and(has_function_privilege('authenticated',oid,'EXECUTE')) then 'PASS' else 'FAIL' end, 'granted', coalesce(bool_and(has_function_privilege('authenticated',oid,'EXECUTE'))::text,'function missing'), 'Effective privilege.' from rpc
  union all
  select 35, 'anon_public_no_rpc_execute', case when bool_and(not has_function_privilege('anon',oid,'EXECUTE')) and count(*) filter (where a.grantee=0)=0 then 'PASS' else 'FAIL' end, 'neither can execute', 'anon='||coalesce(bool_or(has_function_privilege('anon',r.oid,'EXECUTE'))::text,'missing')||', public_acl='||count(*) filter (where a.grantee=0), 'Effective anon and explicit/default PUBLIC ACL.' from rpc r left join lateral aclexplode(coalesce(r.proacl, acldefault('f',(select proowner from pg_proc where oid=r.oid)))) a on true
  union all
  select 36, 'migration_history', 'WARN', 'versions 202607270001..004 recorded', case when to_regclass('supabase_migrations.schema_migrations') is null then 'history relation not exposed' else 'history relation exists' end,
    'Supabase does not guarantee SQL Editor access to a stable migration-history API. Manually confirm all four versions in Dashboard > Database > Migrations.'
)
select check_name, status, expected, coalesce(actual, 'none') actual, details
from checks
order by check_order;
