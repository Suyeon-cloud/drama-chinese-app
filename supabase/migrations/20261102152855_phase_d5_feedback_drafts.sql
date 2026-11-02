-- Phase D5: 피드백 초안(feedback_drafts) — 관리자(서버 service-role) 전용 저장소
--
-- - 기존 FeedbackDraft와 같은 칸만 둔다. Gmail 발송 토큰은 브라우저 메모리에서만 쓰고 여기에 저장하지 않는다.
--   (external_message_id는 Gmail이 돌려준 메시지 id — 발송 확인용이며 비밀값이 아니다)
-- - learner_id·lesson_id는 원본 값을 그대로 둔다. (FK를 걸면 회원·학습자료 삭제가 초안 때문에 막히거나 초안이 바뀐다)
-- - RLS를 켜고 policy·grant를 주지 않는다: 학생·교수자·anon은 직접 접근할 수 없고 서버의 service-role만 쓴다.

create table if not exists public.feedback_drafts (
  id text primary key check (id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$'),
  learner_id text not null,
  lesson_id text not null,
  to_email text not null default '',
  subject text not null default '',
  body text not null default '',
  -- draft: 작성 중, approved: 확인 완료, sent: 발송 완료
  status text not null default 'draft' check (status in ('draft', 'approved', 'sent')),
  -- gmail-api: Gmail API 발송, gmail-compose: Gmail 작성 화면 연결
  channel text check (channel is null or channel in ('gmail-api', 'gmail-compose')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  external_message_id text
);

create index if not exists feedback_drafts_updated_idx on public.feedback_drafts (updated_at desc);

alter table public.feedback_drafts enable row level security;
revoke all on table public.feedback_drafts from anon, authenticated;
grant all on table public.feedback_drafts to service_role;
