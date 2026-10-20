import { Player } from "@remotion/player";
import React from "react";
import { featuredEpisode, formatTime, heroChips, todayExpression, youtubeThumbnail } from "../../content";
import { learningStats, recentScenes } from "../../content/myLearning";
import { HeroMotion } from "../../motion/HeroMotion";
import { Icon } from "../components/Icon";
import { useGuardedNavigate } from "../auth/LoginPrompt";

const FEATURES = [
  {
    emoji: "🎬",
    title: "드라마로 배우기",
    text: "실제 대사와 함께 어휘·문법·실생활 표현을 익혀요.",
    tone: "sky",
    to: "weeks",
  },
  {
    emoji: "🎭",
    title: "상황으로 연습하기",
    text: "비슷한 상황의 장면을 찾아보고 역할극으로 연습해요.",
    tone: "pink",
    to: "situations",
  },
  {
    emoji: "🔍",
    title: "문화로 이해하기",
    text: "문화 렌즈를 통해 드라마 속 문화적 맥락을 살펴봐요.",
    tone: "mint",
    to: "culture",
  },
] as const;

export const StatTiles: React.FC = () => (
  <div className="stat-tiles">
    <div className="stat-tile sky">
      <span className="stat-icon">🎬</span>
      <span>
        <small>학습한 장면</small>
        <b>{learningStats.scenesThisWeek}개</b>
      </span>
    </div>
    <div className="stat-tile pink">
      <span className="stat-icon">🎙</span>
      <span>
        <small>역할극 완료</small>
        <b>{learningStats.rolePlaysDone}회</b>
      </span>
    </div>
    <div className="stat-tile cream">
      <span className="stat-icon">🏷</span>
      <span>
        <small>가장 많이 연습한 태그</small>
        <b>#{learningStats.topTag}</b>
      </span>
    </div>
    <div className="stat-tile mint">
      <span className="stat-icon">🔥</span>
      <span>
        <small>연속 학습</small>
        <b>{learningStats.streakDays}일째</b>
      </span>
    </div>
  </div>
);

export const HomeView: React.FC = () => {
  // 수업 콘텐츠로 가는 링크는 로그인 전이면 “로그인 후 이용하세요.” 안내
  const go = useGuardedNavigate();
  const ep = featuredEpisode;
  return (
    <div className="home-grid">
      <div className="home-main">
        <section className="hero card">
          <div className="hero-text">
            <h2 className="hero-title">《追剧学汉语》</h2>
            <p className="hero-sub">드라마를 보며 중국어와 문화를 함께 배우다 💙</p>
            <p className="hero-desc">
              중국 드라마 속 실제 표현을 모션그래픽으로 학습하고,
              <br className="br-desktop" />
              장면에 담긴 문화적 맥락까지 탐색해보세요.
            </p>
            <button className="btn btn-primary btn-lg" onClick={() => go("lesson", { ep: ep.id })}>
              ▶ 이어서 학습하기 <Icon name="arrow" size={18} />
            </button>
          </div>
          <div className="hero-motion" aria-hidden>
            <Player
              component={HeroMotion}
              inputProps={{ chips: heroChips }}
              durationInFrames={240}
              compositionWidth={600}
              compositionHeight={420}
              fps={30}
              autoPlay
              loop
              controls={false}
              clickToPlay={false}
              acknowledgeRemotionLicense
              style={{ width: "100%" }}
            />
          </div>
        </section>

        <section className="feature-row">
          {FEATURES.map((f) => (
            <button key={f.title} className={`feature card tone-${f.tone}`} onClick={() => go(f.to)}>
              <span className="feature-icon">{f.emoji}</span>
              <span className="feature-body">
                <b>{f.title}</b>
                <small>{f.text}</small>
              </span>
              <span className="round-arrow">
                <Icon name="arrow" size={16} />
              </span>
            </button>
          ))}
        </section>

        <section className="card">
          <div className="card-head">
            <h3 className="card-title">최근 학습한 장면</h3>
            <button className="more" onClick={() => go("mine")}>
              더보기 ›
            </button>
          </div>
          <div className="recent-scenes">
            {recentScenes.map((s) => (
              <button
                key={s.expression}
                className="scene-tile"
                onClick={() => go("lesson", { ep: ep.id, t: s.time })}
              >
                <span className={`scene-thumb tone-${s.tone}`}>
                  <span className="scene-zh">{s.expression}</span>
                  <span className="scene-play">
                    <Icon name="play" size={22} />
                  </span>
                  <span className="scene-time">{formatTime(s.time)}</span>
                </span>
                <small>{s.episode}</small>
                <b>{s.expression}</b>
              </button>
            ))}
          </div>
        </section>
      </div>

      <div className="home-side">
        <section className="card">
          <div className="card-head">
            <h3 className="card-title">오늘의 드라마</h3>
          </div>
          <div className="drama-thumb">
            {/* eslint-disable-next-line @remotion/warn-native-media-tag -- web app UI, not rendered by Remotion */}
            <img src={youtubeThumbnail(ep.video.youtubeId)} alt={`${ep.dramaTitle} ${ep.episode}`} loading="lazy" />
            <span className="ep-badge">{ep.episode}</span>
          </div>
          <h4 className="drama-name">
            《{ep.dramaTitle}》 {ep.episode}
          </h4>
          <p className="muted">{ep.description}</p>
          <div className="right">
            <button className="btn btn-soft btn-sm" onClick={() => go("lesson", { ep: ep.id })}>
              학습하기 →
            </button>
          </div>
        </section>

        <section className="card today-expr">
          <div className="card-head">
            <h3 className="card-title">오늘의 표현 💙</h3>
          </div>
          <div className="expr-bubble">
            <b>{todayExpression.zh}</b>
            <small>{todayExpression.pinyin}</small>
          </div>
          <p className="expr-ko">
            {todayExpression.ko.map((k) => (
              <span key={k}>{k}</span>
            ))}
          </p>
          <button
            className="btn btn-soft btn-block"
            onClick={() => go("lesson", { ep: todayExpression.episodeId, t: todayExpression.sceneTime })}
          >
            이 표현이 나온 장면 보기 →
          </button>
        </section>

        <section className="card">
          <div className="card-head">
            <h3 className="card-title">학습 통계 (이번 주)</h3>
            <button className="more" onClick={() => go("mine")}>
              더보기 ›
            </button>
          </div>
          <StatTiles />
        </section>
      </div>
    </div>
  );
};
