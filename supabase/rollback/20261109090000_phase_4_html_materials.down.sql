-- Phase 4 되돌리기 (20261109090000_phase_4_html_materials.sql)
--
-- ▶ 자료 보호: HTML 자료 행이 하나라도 있으면 전체를 취소한다. 자료를 지우는 문장은 없다.
--   (HTML 자료를 정리할지는 사람이 정한다 — 필요하면 화면에서 HTML 자료를 먼저 삭제한다)
-- ▶ 하는 일: 4단계 함수 제거, 종류 제약을 3-B 원래 정의로 복원, 빈 html_body 칸 제거
-- ▶ 하지 않는 일: link·file 자료·다른 테이블 변경 없음 (3-B·3-C 함수 본문은 4단계가 바꾸지 않았다)
-- ▶ 재실행: 4단계 객체가 이미 없어도 된다. 파일 전체가 begin … commit 한 트랜잭션이다.

begin;

do $$
declare
  v_has boolean;
begin
  if to_regclass('public.week_materials') is null then
    raise exception '4_ROLLBACK: week_materials가 없어요. (3-B가 적용된 DB인지 확인하세요)';
  end if;
  execute 'lock table public.week_materials in share row exclusive mode';
  execute $q$select exists (select 1 from public.week_materials where kind not in ('link', 'file'))$q$ into v_has;
  if v_has then
    raise exception '4_ROLLBACK: HTML 자료가 남아 있어 되돌리지 않았어요. (먼저 화면에서 HTML 자료를 정리하세요)';
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'week_materials' and column_name = 'html_body') then
    execute 'select exists (select 1 from public.week_materials where html_body is not null)' into v_has;
    if v_has then
      raise exception '4_ROLLBACK: html_body에 내용이 있는 행이 있어 되돌리지 않았어요.';
    end if;
  end if;
end;
$$;

drop function if exists public.week_material_html(text);
drop function if exists public.admin_save_week_material_html(text, text, jsonb, text, text);
drop function if exists public.save_week_material_html(text, text, jsonb, text);
drop function if exists public._save_week_material_html(text, text, jsonb, text, uuid, text, boolean);
drop function if exists public._material_html_ok(text);

-- 3-B 원래 정의로 (html_body 칸을 지우기 전에 그 칸을 쓰는 제약부터)
alter table public.week_materials drop constraint if exists week_materials_kind_fields;
alter table public.week_materials add constraint week_materials_kind_fields check (
  (kind = 'link' and url is not null and storage_path is null and file_name is null and mime_type is null and size_bytes is null)
  or (kind = 'file' and url is null and storage_path is not null and file_name is not null and mime_type is not null and size_bytes is not null)
);
alter table public.week_materials drop constraint if exists week_materials_kind_check;
alter table public.week_materials add constraint week_materials_kind_check check (kind in ('link', 'file'));
alter table public.week_materials drop constraint if exists week_materials_html_body_size;
alter table public.week_materials drop column if exists html_body;

commit;
