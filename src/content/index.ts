import { yijiarenzhimingEp3 } from "./episodes/yijiarenzhiming-ep3";
import type { EpisodeContent } from "./types";

/**
 * 학습 영상 카탈로그. 새 회차는 episodes/ 아래에 데이터 파일을 만들고 여기에 추가하면 된다.
 * (컴포넌트 수정 없이 약 15개 sample까지 확장 가능한 구조)
 */
export const episodes: EpisodeContent[] = [yijiarenzhimingEp3];

export const featuredEpisode = yijiarenzhimingEp3;

export const getEpisode = (id: string | undefined) =>
  episodes.find((e) => e.id === id) ?? featuredEpisode;

/** 홈의 “오늘의 표현” */
export const todayExpression = {
  zh: "算你狠！",
  pinyin: "Suàn nǐ hěn!",
  ko: ["그래, 네가 이겼다.", "너 진짜 독하다."],
  episodeId: featuredEpisode.id,
  sceneTime: 495,
};

/** 홈 Hero 루프 모션에 떠다니는 표현 칩 */
export const heroChips = [
  { zh: "算你狠！", ko: "그래, 네가 이겼다" },
  { zh: "先下手为强", ko: "먼저 주도권을 잡다" },
  { zh: "不好惹", ko: "만만하지 않다" },
  { zh: "操心 · 惦记", ko: "비슷한 표현 비교" },
];

export const youtubeThumbnail = (youtubeId: string) =>
  `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`;

export const formatTime = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
