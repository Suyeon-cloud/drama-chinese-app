import React, { useCallback, useEffect, useState } from "react";
import { AdminLoginButton } from "../auth/AdminLogin";
import { GoogleSignInButton } from "../auth/AuthControls";
import { AppFooter, Logo, MAIN_ID, SkipLink } from "../components/Layout";
import { courseToneFor } from "../../content/courseWeeks";
import { ApiError } from "../lib/api";
import { courseStore } from "../store";
import type { PublicCourse } from "../store/models";
import { LearningFlow } from "../components/LearningFlow";

type PublicState = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ok"; courses: PublicCourse[] };

/**
 * 운영 중(active) 과목 목록: 공개 API(GET /api/public/courses)로 받는다. 로그인 없이 표시 칸만 온다.
 * 불러오지 못하면 오류와 다시 시도를 보여 주고, 정적 목록으로 대신하지 않는다. (실제 운영 과목과 다를 수 있어서)
 */
const PublicCourseList: React.FC = () => {
  const [state, setState] = useState<PublicState>({ kind: "loading" });
  const load = useCallback(() => {
    setState({ kind: "loading" });
    courseStore.publicCourses().then(
      (courses) => setState({ kind: "ok", courses }),
      // 서버 오류 문구 대신 같은 안내를 보여 준다. (연결 끊김·서버 오류 모두)
      (err: unknown) =>
        setState({
          kind: "error",
          message: err instanceof ApiError && err.status === 0 ? "서버에 연결하지 못해 강의 목록을 불러오지 못했어요." : "강의 목록을 불러오지 못했어요.",
        }),
    );
  }, []);
  useEffect(load, [load]);

  if (state.kind === "loading") {
    return (
      <p className="muted journey-status" role="status">
        강의 목록을 불러오는 중이에요…
      </p>
    );
  }
  if (state.kind === "error") {
    return (
      <div className="card journey-status" role="alert">
        <p>{state.message} 잠시 후 다시 시도해 주세요.</p>
        <button className="btn btn-soft btn-sm" onClick={load}>
          다시 시도
        </button>
      </div>
    );
  }
  if (state.courses.length === 0) {
    return <p className="muted journey-status">지금 공개된 강의가 없어요. 곧 새 강의가 열려요.</p>;
  }
  return (
    <ul className="journey">
      {state.courses.map((c) => {
        return (
          <li key={c.id} className={`card journey-card tone-${courseToneFor(c.id)}`}>
            <div className="journey-body">
              <h3 lang={c.drama ? "zh-CN" : undefined}>{c.drama ? `《${c.drama}》` : c.title}</h3>
              {c.drama ? <p className="journey-title">{c.title}</p> : null}
              {c.description ? <p className="journey-desc">{c.description}</p> : null}
              <small className="muted">{c.weekCount}주 과정</small>
            </div>
          </li>
        );
      })}
    </ul>
  );
};

/** 서비스 소개: 브랜드 문구 · 운영 중 과목 목록(공개 API) · 학습 방법. cta: 시작 버튼 (로그인 전에는 Google 로그인) */
export const LandingContent: React.FC<{ cta: React.ReactNode; closing?: React.ReactNode }> = ({ cta, closing }) => (
  <>
    <section className="landing-hero">
      <p className="landing-brand">《追剧学汉语》</p>
      <h1>드라마 속 중국어를, 나의 중국어로</h1>
      <p className="landing-lead">다양한 장면 속 대사와 표현을 따라 자연스러운 중국어를 익혀보세요.</p>
      <div className="landing-cta">{cta}</div>
    </section>

    {/* 학습 과정 인포그래픽: 강의 목록 위에 짧게 */}
    <section className="landing-section" aria-labelledby="steps-title">
      <h2 id="steps-title">이렇게 배워요</h2>
      <LearningFlow labelledBy="steps-title" />
    </section>

    <section className="landing-section" aria-labelledby="journey-title">
      <h2 id="journey-title">다양한 장면에서 만나는 중국어</h2>
      <PublicCourseList />
    </section>

    {closing}
  </>
);

/** 로그인 전 첫 화면: 앱 메뉴 없이 서비스 소개와 Google 로그인만 보여준다. */
export const LandingView: React.FC = () => (
  <div className="landing">
    <SkipLink />
    <header className="landing-nav">
      <Logo compact />
      <div className="landing-nav-actions">
        <AdminLoginButton />
        <GoogleSignInButton />
      </div>
    </header>
    <main className="landing-main" id={MAIN_ID} tabIndex={-1}>
      <LandingContent
        cta={<GoogleSignInButton label="Google로 시작하기" />}
        closing={
          <section className="card landing-closing">
            <h2>첫 장면부터 시작해 보세요</h2>
            <p className="muted">처음 로그인하면 회원 정보를 입력하고, 관리자 승인 후 강의코드로 수강을 시작해요.</p>
            <div className="landing-cta">
              <GoogleSignInButton label="Google로 시작하기" />
            </div>
          </section>
        }
      />
    </main>
    <AppFooter />
  </div>
);
