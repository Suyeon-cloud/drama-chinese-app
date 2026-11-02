-- Phase B 보완: 이메일 인증이 끝나는 순간 교수자 연결을 다시 시도한다.
--
-- Supabase Auth는 계정을 먼저 만든(INSERT) 뒤 이메일 인증 시각(email_confirmed_at)을 따로 채운다(UPDATE).
-- 그래서 계정 생성 trigger에서는 인증 전이라 미리 등록된 교수자 이메일과 연결되지 않았다.
-- 연결 조건(인증된 이메일, 비어 있는 행만, 계정당 교수자 행 하나)은 기존 link_instructor_account를 그대로 쓴다.

create or replace function public.handle_auth_email_confirmed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform public.link_instructor_account(new.id);
  exception when others then
    -- 연결 실패가 인증 처리를 막지 않게 한다. 빠진 연결은 로그인 후 sync_my_account()가 다시 한다.
    raise warning 'handle_auth_email_confirmed(%): %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_confirmed on auth.users;
create trigger on_auth_user_email_confirmed
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.handle_auth_email_confirmed();

revoke all on function public.handle_auth_email_confirmed() from public, anon, authenticated;
