import React, { useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { isValidEmail, normalizeEmail } from "../../auth/roles";
import { useToast } from "../../components/Toast";
import { formatDateTime } from "../../lib/format";
import { instructorStore } from "../../store";
import { useInstructors } from "../../store/hooks";
import { PageIntro } from "./AdminShared";

/** 교수자 관리: 교수자 Google 이메일 등록·해제. 등록된 이메일로 로그인하면 교수자 화면이 열린다. */
export const InstructorsView: React.FC = () => {
  const instructors = useInstructors();
  const { user } = useAuth();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (!instructors || !user) return null;

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = normalizeEmail(email);
    if (!isValidEmail(value)) {
      setError("올바른 이메일 주소를 입력해 주세요.");
      return;
    }
    if (instructors.some((i) => i.email === value)) {
      setError("이미 등록된 교수자예요.");
      return;
    }
    await instructorStore.add(value);
    setEmail("");
    setError(null);
    toast.show(`${value}을(를) 교수자로 등록했어요.`, "success");
  };

  return (
    <div className="page">
      <PageIntro
        title="교수자 관리"
        desc="교수자로 등록된 Google 이메일로 로그인하면 교수자 화면이 열려요. 그 외 계정은 학습자로 로그인돼요."
      />

      <section className="card">
        <h3 className="card-title">교수자 추가</h3>
        <form className="instructor-form" onSubmit={(e) => void add(e)}>
          <label className="field">
            <span>Google 이메일</span>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
              placeholder="name@gmail.com"
              autoComplete="off"
            />
          </label>
          <button className="btn btn-primary" type="submit" disabled={!email.trim()}>
            등록
          </button>
        </form>
        {error ? <p className="field-error small">{error}</p> : null}
      </section>

      <section className="card data-table">
        <h3 className="card-title">등록된 교수자</h3>
        {instructors.length === 0 ? (
          <p className="muted">등록된 교수자가 없어요.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>이메일</th>
                <th>등록 방법</th>
                <th>등록한 사람</th>
                <th>등록 시각</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {instructors.map((i) => {
                const self = i.email === user.email;
                return (
                  <tr key={i.email}>
                    <td>
                      <b>{i.email}</b> {self ? <span className="role-tag instructor">나</span> : null}
                    </td>
                    <td>{i.source === "env" ? "초기 설정 (.env)" : "교수자 관리"}</td>
                    <td className="muted">{i.addedBy ?? "—"}</td>
                    <td className="tabular">{formatDateTime(i.addedAt)}</td>
                    <td>
                      {i.source === "env" ? (
                        <span className="muted small">해제 불가</span>
                      ) : self ? (
                        <span className="muted small">본인은 해제할 수 없어요</span>
                      ) : (
                        <button
                          className="link-btn danger"
                          onClick={() =>
                            void instructorStore
                              .remove(i.email)
                              .then(() => toast.show(`${i.email}의 교수자 등록을 해제했어요.`, "info"))
                          }
                        >
                          등록 해제
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p className="muted small legend">
          역할 확인은 화면 접근을 나누기 위한 것으로, 서버 권한 검증은 원격 DB 연결 단계에서 추가돼요.
        </p>
      </section>
    </div>
  );
};
