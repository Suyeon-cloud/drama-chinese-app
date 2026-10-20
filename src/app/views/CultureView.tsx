import React, { useState } from "react";
import { formatTime, getEpisode } from "../../content";
import { CULTURE_TAGS, cultureTopics } from "../../content/culture";
import { RelationDiagram } from "../learning/CultureLensLayer";
import { navigate } from "../router";

const ALL = "전체";

export const CultureView: React.FC = () => {
  const [tag, setTag] = useState(ALL);
  const topics = cultureTopics.filter((t) => tag === ALL || t.tags.indexOf(tag) >= 0);

  return (
    <div className="page">
      <div className="page-intro">
        <h2>한중문화 탐색</h2>
        <p className="muted">드라마 속 장면이 어떤 문화적 맥락을 재현하는지 함께 읽어봐요.</p>
      </div>

      <div className="tag-bar" role="toolbar" aria-label="문화 태그">
        {[ALL, ...CULTURE_TAGS].map((t) => (
          <button key={t} className={`tag ${tag === t ? "active" : ""}`} onClick={() => setTag(t)}>
            {t === ALL ? t : `#${t}`}
          </button>
        ))}
      </div>

      {topics.length === 0 ? (
        <div className="card empty">
          <span>🧭</span>
          <p>#{tag} 문화 콘텐츠는 준비 중이에요. 곧 새로운 드라마 장면과 함께 추가될 예정이에요!</p>
        </div>
      ) : null}

      {topics.map((topic) => {
        const ep = getEpisode(topic.episodeId);
        return (
          <article key={topic.id} className="culture">
            <section className="card culture-hero">
              <span className="pill pill-mint">
                《{ep.dramaTitle}》 {ep.episode}
              </span>
              <h2>
                {topic.emoji} {topic.title}
              </h2>
              <blockquote>
                <b>{topic.dialogue.zh}</b>
                <small>{topic.dialogue.pinyin}</small>
                <span>{topic.dialogue.ko}</span>
              </blockquote>
            </section>

            <div className="culture-grid">
              <section className="card">
                <h3 className="card-title">
                  <span className="step">1</span> 장면 속 문화 읽기
                </h3>
                {topic.sceneReading.map((p) => (
                  <p key={p} className="body-text">
                    {p}
                  </p>
                ))}
              </section>

              <section className="card">
                <h3 className="card-title">
                  <span className="step">2</span> 작품 속 가족관계
                </h3>
                <RelationDiagram adults={topic.lens.adults} kids={topic.lens.children} />
                <ul className="relation-list">
                  {topic.relations.map((r) => (
                    <li key={r.name}>
                      <b>{r.name}</b>
                      <span>{r.role}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="card culture-compare">
                <h3 className="card-title">
                  <span className="step">3</span> 한중 드라마의 유사한 문화 주제 비교
                </h3>
                <div className="compare-cols">
                  <div className="compare-col cn">
                    <span className="flag">🇨🇳 중국 작품</span>
                    <b>《{topic.comparison.china.work}》</b>
                    <p>{topic.comparison.china.text}</p>
                  </div>
                  <div className="compare-col kr">
                    <span className="flag">🇰🇷 한국 작품</span>
                    <b>{topic.comparison.korea.work ?? "비교 콘텐츠 추후 추가"}</b>
                    <p>{topic.comparison.korea.text}</p>
                  </div>
                </div>
                <p className="guide-note">💡 {topic.comparison.guide}</p>
              </section>

              <section className="card think">
                <h3 className="card-title">
                  <span className="step">4</span> 생각해보기
                </h3>
                <p className="think-q">“{topic.thinkQuestion}”</p>
                <textarea placeholder="나의 생각을 자유롭게 적어보세요. (이 브라우저에서만 임시로 보여요)" rows={3} />
              </section>
            </div>

            <section className="card">
              <h3 className="card-title">
                <span className="step">5</span> 관련 장면
              </h3>
              <div className="related-grid">
                {topic.relatedScenes.map((s) => (
                  <button
                    key={s.title}
                    className="related"
                    onClick={() => navigate("lesson", { ep: topic.episodeId, t: s.time })}
                  >
                    <span className="related-time">▶ {formatTime(s.time)}</span>
                    <b>{s.title}</b>
                    <small>{s.text}</small>
                  </button>
                ))}
              </div>
            </section>
          </article>
        );
      })}
    </div>
  );
};
