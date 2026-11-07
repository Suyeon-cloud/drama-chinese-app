-- Phase 3-C 되돌리기 (20261108090000_phase_3c_material_files.sql)
--
-- ▶ 자료 보호: 파일 자료 행, 업로드 기록, 버킷 안의 파일 중 하나라도 있으면 전체를 취소한다. 자료·파일을 지우는 문장은 없다.
--   (파일 자료를 정리할지는 사람이 정한다 — 필요하면 화면에서 파일 자료를 먼저 삭제하고, 고아 정리를 실행한다)
-- ▶ 하는 일: 3-C 함수·week_material_uploads 테이블 제거, 빈 버킷 삭제 시도
-- ▶ 하지 않는 일: week_materials(3-B)·기존 테이블 변경 없음
-- ▶ Storage 버킷: Supabase가 SQL로 storage 테이블을 지우는 것을 막으면(protect_delete) 안내만 남긴다. 그때는 대시보드에서 빈 버킷을 삭제한다.
-- ▶ 재실행: 객체가 이미 없어도 된다. 파일 전체가 begin … commit 한 트랜잭션이다.

begin;

do $$
declare
  v_has boolean;
begin
  if to_regclass('public.week_materials') is not null then
    execute 'lock table public.week_materials in share row exclusive mode';
    execute $q$select exists (select 1 from public.week_materials where kind = 'file')$q$ into v_has;
    if v_has then
      raise exception '3C_ROLLBACK: 파일 자료가 남아 있어 되돌리지 않았어요. (먼저 화면에서 파일 자료를 정리하세요)';
    end if;
  end if;
  if to_regclass('public.week_material_uploads') is not null then
    execute 'lock table public.week_material_uploads in access exclusive mode';
    execute 'select exists (select 1 from public.week_material_uploads)' into v_has;
    if v_has then
      raise exception '3C_ROLLBACK: 업로드 기록이 남아 있어 되돌리지 않았어요. (고아 정리 후 다시 실행하세요)';
    end if;
  end if;
  if exists (select 1 from storage.objects where bucket_id = 'week-materials') then
    raise exception '3C_ROLLBACK: week-materials 버킷에 파일이 남아 있어 되돌리지 않았어요.';
  end if;
end;
$$;

drop function if exists public.week_material_download(text);
drop function if exists public.admin_replace_week_material_file(text, text, text, text, bigint, uuid, text);
drop function if exists public.admin_insert_week_material_file(text, jsonb, text, text, text, bigint, uuid, text);
drop function if exists public._material_file_path_ok(text, text);
drop table if exists public.week_material_uploads;

-- 빈 버킷 삭제 시도 (막히면 안내만 남기고 계속한다)
do $$
begin
  if exists (select 1 from storage.buckets where id = 'week-materials') then
    begin
      delete from storage.buckets where id = 'week-materials';
    exception when others then
      raise notice 'week-materials 버킷은 SQL로 지울 수 없어요(%). 대시보드 Storage에서 빈 버킷을 삭제하세요.', sqlerrm;
    end;
  end if;
end;
$$;

commit;
