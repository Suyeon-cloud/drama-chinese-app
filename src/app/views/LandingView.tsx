import React, { useCallback, useEffect, useState } from "react";
import { AdminLoginButton } from "../auth/AdminLogin";
import { GoogleSignInButton } from "../auth/AuthControls";
import { DramaKo } from "../components/DramaKo";
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
            {/* 이미지 대신 작품명 첫 글자를 큰 글씨 워터마크로 (장식용) */}
            <span className="journey-mark" lang="zh-CN" aria-hidden>
              {(c.drama || c.title).slice(0, 1)}
            </span>
            <div className="journey-body">
              <span className="journey-kicker">🎬 드라마 · {c.weekCount}주 과정</span>
              <h3 lang={c.drama ? "zh-CN" : undefined}>
                {c.drama ? `《${c.drama}》` : c.title}
                <DramaKo drama={c.drama} />
              </h3>
              {c.drama ? <p className="journey-title">{c.title}</p> : null}
              {c.description ? <p className="journey-desc">{c.description}</p> : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
};

/** 히어로 오른쪽: 이미지 없이 학습 화면을 글자로 보여 주는 예시 장면 카드 (장식용) */
const HeroSample: React.FC = () => (
  <div className="landing-hero-sample" aria-hidden>
    <div className="sample-scene">
      <span className="sample-tag">🎬 장면 대사</span>
      <p className="sample-zh" lang="zh-CN">
        我们一起追剧学汉语吧！
      </p>
      <p className="sample-py">wǒmen yìqǐ zhuījù xué Hànyǔ ba!</p>
      <p className="sample-ko">우리 함께 드라마로 중국어를 배워요!</p>
    </div>
    <div className="sample-row">
      <div className="sample-chip tone-lavender">
        <span>💬 핵심 표현</span>
        <b lang="zh-CN">一起</b>
        <small>yìqǐ · 함께</small>
      </div>
      <div className="sample-chip tone-mint">
        <span>🎯 퀴즈</span>
        <b>
          ‘<span lang="zh-CN">追剧</span>’의 뜻은?
        </b>
        <small>드라마를 챙겨 보다</small>
      </div>
    </div>
  </div>
);

/**
 * 서비스 소개: 브랜드 문구 · 운영 중 작품(공개 API) · 학습 방법.
 * cta: 시작 버튼 (교수자·관리자 홈). 로그인 전에는 버튼 없이 상단 헤더의 로그인 아이콘만 쓴다.
 */
export const LandingContent: React.FC<{ cta?: React.ReactNode; closing?: React.ReactNode }> = ({ cta, closing }) => (
  <>
    <section className="landing-hero">
      <div className="landing-hero-text">
        <p className="landing-brand">《追剧学汉语》</p>
        <h1>드라마 속 중국어를, 나의 중국어로</h1>
        <p className="landing-lead">다양한 장면 속 대사와 표현을 따라 자연스러운 중국어를 익혀보세요.</p>
        <ul className="landing-points" aria-label="학습 특징">
          <li>🎬 실제 드라마 장면</li>
          <li>💬 대사 속 핵심 표현</li>
          <li>🎯 퀴즈로 바로 복습</li>
        </ul>
        {cta ? <div className="landing-cta">{cta}</div> : null}
      </div>
      <HeroSample />
    </section>

    {/* 작품 중심: 학습 방법보다 먼저 지금 운영 중인 드라마를 보여 준다 */}
    <section className="landing-section" aria-labelledby="journey-title">
      <h2 id="journey-title">🎬 다양한 장면에서 만나는 중국어</h2>
      <PublicCourseList />
    </section>

    <section className="landing-section" aria-labelledby="steps-title">
      <h2 id="steps-title">🌱 이렇게 배워요</h2>
      <LearningFlow labelledBy="steps-title" />
    </section>

    {closing}
  </>
);

/** 로그인 전 첫 화면: 앱 메뉴 없이 서비스 소개와 Google 로그인만 보여준다. */
export const LandingView: React.FC = () => (
  <div className="landing">
    <SkipLink />
    {/* 로그인 버튼은 헤더 오른쪽 위 [관리자 아이콘] [Google 로고] 두 개만 둔다 */}
    <header className="landing-nav">
      <Logo compact />
      <div className="landing-nav-actions">
        <AdminLoginButton />
        <GoogleSignInButton iconOnly />
      </div>
    </header>
    <main className="landing-main" id={MAIN_ID} tabIndex={-1}>
      <LandingContent
        closing={
          <section className="card landing-closing">
            <h2>✨ 첫 장면부터 시작해 보세요</h2>
            <p className="muted">
              오른쪽 위 Google 로고로 로그인한 뒤 회원 정보를 입력하고, 관리자 승인 후 강의코드로 수강을 시작해요.
            </p>
          </section>
        }
      />
    </main>
    <AppFooter />
  </div>
);
