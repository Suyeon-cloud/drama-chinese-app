-- public 스키마 구조 스냅샷 (읽기 전용). SQL Editor에서 실행하고 결과를 CSV로 내려받아 보관한다.
-- 함수 정의·RLS 정책·트리거·제약·인덱스·테이블/함수 권한을 한 표(kind, name, definition)로 모은다. 데이터 행·개인정보는 읽지 않는다.
-- 결과 행이 많으면 SQL Editor 아래 표에서 ‘Export → CSV’로 저장한다.

select 'function' as kind,
       p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as name,
       pg_get_functiondef(p.oid) as definition
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
union all
select 'policy',
       tablename || '.' || policyname,
       format('create policy %I on public.%I as %s for %s to %s using (%s)%s;',
              policyname, tablename, permissive, cmd, array_to_string(roles, ', '), coalesce(qual, 'true'),
              case when with_check is not null then ' with check (' || with_check || ')' else '' end)
  from pg_policies
 where schemaname = 'public'
union all
select 'rls',
       c.relname,
       format('alter table public.%I %s row level security;', c.relname, case when c.relrowsecurity then 'enable' else 'disable' end)
  from pg_class c
 where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
union all
select 'trigger',
       c.relname || '.' || t.tgname,
       pg_get_triggerdef(t.oid) || ';'
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
 where c.relnamespace = 'public'::regnamespace and not t.tgisinternal
union all
select 'constraint',
       c.relname || '.' || con.conname,
       format('alter table public.%I add constraint %I %s;', c.relname, con.conname, pg_get_constraintdef(con.oid))
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
 where c.relnamespace = 'public'::regnamespace
union all
select 'index',
       indexname,
       indexdef || ';'
  from pg_indexes
 where schemaname = 'public'
union all
select 'table_grant',
       table_name || ' → ' || grantee,
       string_agg(privilege_type, ', ' order by privilege_type)
  from information_schema.role_table_grants
 where table_schema = 'public' and grantee in ('anon', 'authenticated', 'service_role')
 group by table_name, grantee
union all
select 'column_grant',
       table_name || ' → ' || grantee,
       string_agg(column_name || ':' || privilege_type, ', ' order by column_name, privilege_type)
  from information_schema.column_privileges
 where table_schema = 'public' and grantee in ('anon', 'authenticated')
 group by table_name, grantee
union all
select 'function_grant',
       p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
       concat_ws(', ',
         case when has_function_privilege('anon', p.oid, 'EXECUTE') then 'anon' end,
         case when has_function_privilege('authenticated', p.oid, 'EXECUTE') then 'authenticated' end,
         case when has_function_privilege('service_role', p.oid, 'EXECUTE') then 'service_role' end)
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
order by kind, name;
