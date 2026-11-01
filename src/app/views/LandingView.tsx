import React from "react";
import { COURSE_SEEDS } from "../../content/courses";
import { AdminLoginButton } from "../auth/AdminLogin";
import { GoogleSignInButton } from "../auth/AuthControls";
import { Logo } from "../components/Layout";
import { COURSE_VISUALS, CourseImage } from "./courseVisuals";

const STEPS = [
  { title: "장면 보기", text: "드라마 장면을 보며 중국어 대사와 병음, 한국어 번역을 함께 확인해요." },
  { title: "표현 익히기", text: "대사에 나온 핵심 표현과 어휘·문법을 하나씩 짚어요." },
  { title: "퀴즈로 확인", text: "배운 내용을 퀴즈로 확인하고 학습 진도를 이어 가요." },
];

/** 서비스 소개: 브랜드 문구 · 과목 목록 · 학습 방법. cta: 시작 버튼 (로그인 전에는 Google 로그인) */
export const LandingContent: React.FC<{ cta: React.ReactNode; closing?: React.ReactNode }> = ({ cta, closing }) => (
  <>
    <section className="landing-hero">
      <p className="landing-brand">《追剧学汉语》</p>
      <h1>드라마 속 중국어를, 나의 중국어로</h1>
      <p className="landing-lead">다양한 장면 속 대사와 표현을 따라 자연스러운 중국어를 익혀보세요.</p>
      <div className="landing-cta">{cta}</div>
    </section>

    <section className="landing-section" aria-labelledby="journey-title">
      <h2 id="journey-title">다양한 장면에서 만나는 중국어</h2>
      <ul className="journey">
        {COURSE_SEEDS.map((c) => {
          const v = COURSE_VISUALS[c.id];
          return (
            <li key={c.id} className="card journey-card">
              <CourseImage courseId={c.id} drama={c.drama} />
              <div className="journey-body">
                {v ? <span className="journey-stage">{v.stage}</span> : null}
                <h3>《{c.drama}》</h3>
                <p className="journey-title">{c.title}</p>
                <p className="journey-desc">{c.description}</p>
                <small className="muted">{c.weekCount}주 과정</small>
              </div>
            </li>
          );
        })}
      </ul>
    </section>

    <section className="landing-section" aria-labelledby="steps-title">
      <h2 id="steps-title">이렇게 배워요</h2>
      <ol className="landing-steps">
        {STEPS.map((s, i) => (
          <li key={s.title}>
            <span className="step" aria-hidden>
              {i + 1}
            </span>
            <div>
              <b>{s.title}</b>
              <p>{s.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>

    {closing}
  </>
);

/** 로그인 전 첫 화면: 앱 메뉴 없이 서비스 소개와 Google 로그인만 보여준다. */
export const LandingView: React.FC = () => (
  <div className="landing">
    <header className="landing-nav">
      <Logo compact />
      <div className="landing-nav-actions">
        <AdminLoginButton />
        <GoogleSignInButton />
      </div>
    </header>
    <main className="landing-main">
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
  </div>
);
