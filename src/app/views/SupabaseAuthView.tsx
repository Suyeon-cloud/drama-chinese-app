import React, { useCallback, useEffect, useState } from "react";
import { ProfileFields } from "../auth/MemberGate";
import {
  completeSupabaseProfile,
  loadSupabaseAccount,
  signOutSupabase,
  startSupabaseGoogleSignIn,
  takeSupabaseRedirectError,
  type SupabaseAccount,
} from "../auth/supabaseAuth";
import { isSupabaseConfigured } from "../lib/supabase";
import { EMPTY_PROFILE, type MemberProfileInput } from "../store/models";

const message = (err: unknown) => (err instanceof Error ? err.message : "처리하지 못했어요.");

/** 학생 회원정보 입력 (기존 가입 팝업과 같은 칸) */
const ProfileForm: React.FC<{ account: SupabaseAccount; onDone: () => void }> = ({ account, onDone }) => {
  const p = account.profile;
  const [form, setForm] = useState<MemberProfileInput>({
    ...EMPTY_PROFILE,
    name: p.name,
    university: p.university,
    department: p.department,
    grade: p.grade,
    studentId: p.student_id,
    email: p.contact_email || account.email,
    phone: p.phone,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await completeSupabaseProfile(form);
      onDone();
    } catch (err) {
      setError(message(err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <form onSubmit={(e) => void submit(e)}>
      <h3 className="card-title">회원정보 입력</h3>
      <p className="muted small">입력하면 관리자가 확인한 뒤 승인해요.</p>
      <ProfileFields value={form} onChange={setForm} />
      {error ? <p className="field-error small">{error}</p> : null}
      <div className="row-end">
        <button className="btn btn-primary" type="submit" disabled={saving}>
          {saving ? "저장 중…" : "가입 신청"}
        </button>
      </div>
    </form>
  );
};

/**
 * Supabase Google 로그인 확인 화면 (#/supabase-auth, 개발용).
 * 강의·학습 화면은 아직 기존 로그인(서버 세션)으로 동작하므로, 여기서는 Supabase 계정 상태만 확인한다.
 */
export const SupabaseAuthView: React.FC = () => {
  const [account, setAccount] = useState<SupabaseAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(() => takeSupabaseRedirectError());

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setAccount(await loadSupabaseAccount());
    } catch (err) {
      setError(message(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!isSupabaseConfigured()) {
    return (
      <div className="page">
        <div className="card login-gate">
          <h2>Supabase 로그인 확인</h2>
          <p className="muted">.env.local에 VITE_SUPABASE_URL과 VITE_SUPABASE_ANON_KEY를 넣고 개발 서버를 다시 실행해 주세요.</p>
        </div>
      </div>
    );
  }

  const p = account?.profile;
  return (
    <div className="page">
      <div className="card">
        <h2>Supabase 로그인 확인 (개발용)</h2>
        <p className="muted small">
          학생·교수자의 Google 로그인을 Supabase로 옮기기 전에 확인하는 화면이에요. 강의·학습 화면은 아직 기존 로그인으로 동작해요.
          관리자는 이 로그인을 쓰지 않아요.
        </p>
        {error ? <p className="field-error small">{error}</p> : null}

        {loading ? (
          <p className="muted">확인 중…</p>
        ) : !account || !p ? (
          <div className="row-start">
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                setError(null);
                startSupabaseGoogleSignIn().catch((err) => {
                  setError(message(err));
                  setBusy(false);
                });
              }}
            >
              Google로 로그인 (Supabase)
            </button>
          </div>
        ) : (
          <>
            <dl className="supabase-auth-facts">
              <div>
                <dt>Google 계정</dt>
                <dd>{account.email}</dd>
              </div>
              <div>
                <dt>판정</dt>
                <dd>{account.isInstructor ? "교수자" : "학생"}</dd>
              </div>
              {!account.isInstructor ? (
                <div>
                  <dt>학생 상태</dt>
                  <dd>
                    {!p.profile_completed ? "회원정보 입력 전" : p.status === "approved" ? "승인 완료" : "관리자 승인 대기 중"}
                  </dd>
                </div>
              ) : null}
            </dl>

            {account.isInstructor ? (
              <p>사전 등록된 교수자 계정으로 확인됐어요. 교수자에게는 학생 승인 절차를 적용하지 않아요.</p>
            ) : !p.profile_completed ? (
              <ProfileForm account={account} onDone={() => void reload()} />
            ) : p.status !== "approved" ? (
              <p>
                ⏳ 가입 신청이 접수되었어요. 관리자가 승인하면 이용할 수 있어요. (관리자 승인 기능은 다음 단계에서 Supabase로 옮겨요)
              </p>
            ) : (
              <p>✅ 관리자 승인이 완료된 학생 계정이에요.</p>
            )}

            <div className="row-start">
              <button className="btn btn-soft btn-sm" disabled={loading} onClick={() => void reload()}>
                상태 다시 확인
              </button>
              <button
                className="btn btn-soft btn-sm"
                onClick={() => {
                  void signOutSupabase().then(() => setAccount(null));
                }}
              >
                Supabase 로그아웃
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
