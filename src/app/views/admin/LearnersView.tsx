import React, { useState } from "react";
import { Avatar } from "../../auth/AuthControls";
import { openMemberPopup } from "../../auth/memberPopup";
import { formatDateTime } from "../../lib/format";
import { useToast } from "../../components/Toast";
import { joinUrl, navigate } from "../../router";
import { useAllProgress, useCurrentCourse, useEnrollments, useLearners } from "../../store/hooks";
import { PageIntro } from "./AdminShared";

/** 학습자 관리: 로그인한 학습자 목록과 주차 학습 요약 */
export const LearnersView: React.FC = () => {
  const learners = useLearners();
  const progress = useAllProgress();
  const course = useCurrentCourse();
  const enrollments = useEnrollments(course?.code ?? null);
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  if (!learners || !progress || !course) return null;

  const link = joinUrl(course.code);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.show("참여 링크를 복사했어요.", "success");
    } catch {
      toast.show("복사하지 못했어요. 링크를 직접 선택해 복사해 주세요.", "error");
    }
  };

  return (
    <div className="page">
      <PageIntro title="학습자 관리" desc="가입한 회원과 학습 요약을 확인해요. 승인·수정·삭제는 ‘회원 현황’에서 해요.">
        <button className="btn btn-primary btn-sm" onClick={openMemberPopup}>
          👥 회원 현황
        </button>
      </PageIntro>

      <section className="card join-link-card">
        <h3 className="card-title">🔗 학생 참여 링크</h3>
        <p className="muted small">
          학생은 이 링크로 들어와 Google 로그인 후 학습자로 수업에 참여해요. · {course.title} · 참여 코드{" "}
          <b>{course.code}</b>
        </p>
        <div className="join-link-row">
          <input className="join-link-input" value={link} readOnly onFocus={(e) => e.currentTarget.select()} aria-label="참여 링크" />
          <button className="btn btn-primary btn-sm" onClick={() => void copy()}>
            {copied ? "복사됨" : "링크 복사"}
          </button>
        </div>
      </section>

      {learners.length === 0 ? (
        <div className="card empty">
          <span>👥</span>
          <p>아직 가입한 회원이 없어요. 학습자가 Google로 로그인하면 여기에 표시돼요.</p>
        </div>
      ) : (
        <section className="card data-table">
          <table>
            <thead>
              <tr>
                <th>학습자</th>
                <th>대학 · 학과</th>
                <th>승인</th>
                <th>수업 참여</th>
                <th>학습 시작 주차</th>
                <th>완료 주차</th>
                <th>가입일</th>
                <th>최종 접속</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {learners.map((l) => {
                const mine = progress.filter((p) => p.userId === l.id);
                const started = new Set(mine.filter((p) => p.startedAt).map((p) => p.week));
                const done = new Set(mine.filter((p) => p.completedAt).map((p) => p.week));
                const joined = enrollments?.find((e) => e.userId === l.id);
                return (
                  <tr key={l.id}>
                    <td>
                      <span className="who">
                        <Avatar name={l.name} color={l.avatarColor} src={l.picture} size={30} />
                        <b>{l.name}</b>
                      </span>
                    </td>
                    <td className="muted">{l.university ? `${l.university} · ${l.department}` : "—"}</td>
                    <td>
                      {l.status === "approved" ? (
                        <span className="pill pill-mint">승인</span>
                      ) : (
                        <span className="pill pill-cream">대기</span>
                      )}
                    </td>
                    <td className="tabular">{joined ? formatDateTime(joined.joinedAt) : "—"}</td>
                    <td>{started.size}개 주차</td>
                    <td>{done.size}개 주차</td>
                    <td className="tabular">{formatDateTime(l.firstSeenAt)}</td>
                    <td className="tabular">{formatDateTime(l.lastSeenAt)}</td>
                    <td>
                      <button className="link-btn" onClick={() => navigate("admin-progress", { learner: l.id })}>
                        학습 현황 ›
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
};
