// 나의 학습 sample data. 실제 서버/DB 연결 시 이 모듈을 API 응답으로 교체한다.

export const learningStats = {
  scenesThisWeek: 5,
  rolePlaysDone: 3,
  topTag: "가족대화",
  streakDays: 4,
};

export const recentLearning = [
  {
    episodeId: "yjrzm-ep3",
    label: "《以家人之名》 第3集",
    daysAgo: 0,
    items: ["先下手为强", "不好惹", "算你狠", "操心", "惦记"],
  },
];

export const recentScenes = [
  { expression: "算你狠！", episode: "以家人之名 第3集", time: 495, daysAgo: 0, tone: "pink" },
  { expression: "只能靠自己了", episode: "以家人之名 第3集", time: 409, daysAgo: 0, tone: "sky" },
  { expression: "不好惹", episode: "以家人之名 第3集", time: 163, daysAgo: 0, tone: "lavender" },
  { expression: "人是好人，就是嘴碎", episode: "以家人之名 第3集", time: 538, daysAgo: 1, tone: "mint" },
] as const;

export const savedExpressions = [
  { zh: "算你狠", pinyin: "suàn nǐ hěn", ko: "그래, 네가 이겼다" },
  { zh: "先下手为强", pinyin: "xiān xià shǒu wéi qiáng", ko: "먼저 행동하여 주도권을 잡다" },
  { zh: "掉进蜜罐罐里", pinyin: "diào jìn mì guànguan lǐ", ko: "사랑과 보살핌을 듬뿍 받다" },
  { zh: "嘴碎", pinyin: "zuǐ suì", ko: "말이 많고 참견하는 편이다" },
];

/** lastReviewedDaysAgo ≥ REVIEW_THRESHOLD_DAYS 이면 “복습 추천” badge */
export const REVIEW_THRESHOLD_DAYS = 7;

export const reviewItems = [
  { zh: "只能 + 동사", ko: "~할 수밖에 없다", lastReviewedDaysAgo: 9, time: 409 },
  { zh: "为了 + 목적", ko: "~하기 위해서", lastReviewedDaysAgo: 8, time: 163 },
  { zh: "操心 · 惦记", ko: "비슷한 표현 비교", lastReviewedDaysAgo: 3, time: 604 },
  { zh: "算你狠", ko: "그래, 네가 이겼다", lastReviewedDaysAgo: 1, time: 495 },
];
