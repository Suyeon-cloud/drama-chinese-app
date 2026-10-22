import React, { useMemo, useState } from "react";
import { getEpisode } from "../../content";
import { SITUATION_FILTER_TAGS, rolePlays, situations } from "../../content/situations";
import type { RolePlay } from "../../content/types";
import { RolePlayPanel } from "../roleplay/RolePlayPanel";
import { navigate } from "../router";

const ALL = "전체";

/** 상황별 장면 (‘주차·상황별 학습’ 화면의 한 탭) */
export const SituationsSection: React.FC<{ query: string }> = ({ query }) => {
  const [tag, setTag] = useState<string>(ALL);
  const [rolePlay, setRolePlay] = useState<RolePlay | null>(null);

  const tags = useMemo(() => {
    const extra = situations
      .flatMap((s) => s.tags)
      .filter((t, i, arr) => arr.indexOf(t) === i && SITUATION_FILTER_TAGS.indexOf(t) < 0);
    return [ALL, ...SITUATION_FILTER_TAGS, ...extra];
  }, []);

  const filtered = situations.filter((s) => {
    const tagOk = tag === ALL || s.tags.indexOf(tag) >= 0;
    const q = query.toLowerCase();
    const qOk =
      !q ||
      [s.expression, s.pinyin, s.situation, ...s.meaning, ...s.tags]
        .join(" ")
        .toLowerCase()
        .includes(q);
    return tagOk && qOk;
  });

  return (
    <>
      <p className="muted tab-intro">비슷한 상황의 장면을 찾아보고, 역할극으로 직접 말해보세요.</p>

      <div className="tag-bar" role="toolbar" aria-label="상황 태그">
        {tags.map((t) => (
          <button key={t} className={`tag ${tag === t ? "active" : ""}`} onClick={() => setTag(t)}>
            {t === ALL ? t : `#${t}`}
          </button>
        ))}
      </div>

      {query ? (
        <p className="search-note">
          “{query}” 검색 결과 {filtered.length}개{" "}
          <button className="link-btn" onClick={() => navigate("weeks", { tab: "situations" })}>
            검색 지우기
          </button>
        </p>
      ) : null}

      {filtered.length === 0 ? (
        <div className="card empty">
          <span>🎞️</span>
          <p>아직 이 태그의 장면이 없어요. 새로운 드라마 장면이 곧 추가될 예정이에요!</p>
        </div>
      ) : (
        <div className="situation-grid">
          {filtered.map((s) => {
            const ep = getEpisode(s.episodeId);
            const rp = rolePlays.find((r) => r.id === s.rolePlayId);
            return (
              <article key={s.id} className="card situation">
                <div className="situation-top">
                  <span className="pill pill-sky">
                    《{ep.dramaTitle}》 {ep.episode}
                  </span>
                </div>
                <h3 className="situation-zh">{s.expression}</h3>
                <p className="situation-py">{s.pinyin}</p>
                <p className="situation-ko">
                  {s.meaning.map((m) => (
                    <span key={m}>{m}</span>
                  ))}
                </p>
                <div className="situation-ctx">
                  <small>상황</small>
                  <p>{s.situation}</p>
                </div>
                <div className="situation-tags">
                  {s.tags.map((t) => (
                    <button key={t} className={`tag tag-sm ${tag === t ? "active" : ""}`} onClick={() => setTag(t)}>
                      #{t}
                    </button>
                  ))}
                </div>
                <div className="situation-actions">
                  <button
                    className="btn btn-soft btn-sm"
                    onClick={() => navigate("lesson", { ep: s.episodeId, t: s.sceneTime })}
                  >
                    ▶ 장면 다시 보기
                  </button>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => rp && setRolePlay(rp)}
                    disabled={!rp}
                  >
                    🎙 역할극 연습
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {rolePlay ? <RolePlayPanel rolePlay={rolePlay} onClose={() => setRolePlay(null)} /> : null}
    </>
  );
};
