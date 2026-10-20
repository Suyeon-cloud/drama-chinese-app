import type { RolePlay, Situation } from "./types";

/** 情境片段 상단 필터 태그 (기본 목록). 카드에만 있는 태그는 뒤에 자동으로 추가된다. */
export const SITUATION_FILTER_TAGS = [
  "가족대화",
  "학교생활",
  "친구",
  "장난",
  "갈등",
  "위로",
  "고백",
  "식사",
  "사과",
];

export const situations: Situation[] = [
  {
    id: "s-suannihen",
    episodeId: "yjrzm-ep3",
    expression: "算你狠！",
    pinyin: "Suàn nǐ hěn!",
    meaning: ["그래, 네가 이겼다.", "너 진짜 독하다."],
    situation: "친한 사이에서 장난스럽게 티격태격하는 장면",
    tags: ["가족대화", "장난"],
    sceneTime: 495,
    rolePlayId: "rp-suannihen",
  },
  {
    id: "s-kaoziji",
    episodeId: "yjrzm-ep3",
    expression: "只能靠自己了",
    pinyin: "Zhǐ néng kào zìjǐ le",
    meaning: ["스스로 해낼 수밖에 없지."],
    situation: "누구의 도움도 기대하기 어려워 스스로 해결해야 하는 상황",
    tags: ["현실대화", "조언"],
    sceneTime: 409,
    rolePlayId: "rp-kaoziji",
  },
  {
    id: "s-buhaore",
    episodeId: "yjrzm-ep3",
    expression: "不好惹",
    pinyin: "bù hǎo rě",
    meaning: ["만만하지 않다.", "함부로 건드리기 어렵다."],
    situation: "상대가 만만하지 않다는 인상을 표현하는 상황",
    tags: ["학교생활", "인상"],
    sceneTime: 163,
    rolePlayId: "rp-buhaore",
  },
  {
    id: "s-zuisui",
    episodeId: "yjrzm-ep3",
    expression: "人是好人，就是嘴碎",
    pinyin: "Rén shì hǎorén, jiùshì zuǐ suì",
    meaning: ["사람은 좋은데, 말이 좀 많아."],
    situation: "좋은 사람이지만 말이 많다고 평가하는 상황",
    tags: ["가족대화", "인물평가"],
    sceneTime: 538,
    rolePlayId: "rp-zuisui",
  },
];

export const rolePlays: RolePlay[] = [
  {
    id: "rp-suannihen",
    title: "算你狠！",
    situation: "凌和平이 생활비를 주며 李海潮와 장난스럽게 대화한다.",
    roles: ["李海潮", "凌和平"],
    lines: [
      {
        speaker: "凌和平",
        zh: "我让你吃一个月白菜。",
        pinyin: "Wǒ ràng nǐ chī yí ge yuè báicài.",
        ko: "한 달 내내 배추만 먹게 해 줄 거야.",
        demoFeedback: {
          score: 82,
          summary: "리듬이 자연스러워요!",
          tip: "白菜 báicài의 2성 → 4성 흐름을 조금 더 분명하게 해보세요.",
        },
      },
      {
        speaker: "李海潮",
        zh: "这算你狠，算你狠。",
        pinyin: "Zhè suàn nǐ hěn, suàn nǐ hěn.",
        ko: "그래, 네가 이겼다, 이겼어.",
        demoFeedback: {
          score: 85,
          summary: "표현은 자연스러워요!",
          tip: "狠 hěn의 3성을 조금 더 또렷하게 발음해보세요.",
        },
      },
    ],
  },
  {
    id: "rp-kaoziji",
    title: "只能靠自己了",
    situation: "친구가 고민을 털어놓자, 결국 스스로 해결해야 한다고 말한다.",
    roles: ["친구 A", "친구 B"],
    note: "드라마 대사를 바탕으로 만든 연습용 대화예요.",
    lines: [
      {
        speaker: "친구 A",
        zh: "这件事谁也帮不了我。",
        pinyin: "Zhè jiàn shì shéi yě bāng bu liǎo wǒ.",
        ko: "이 일은 아무도 날 도와줄 수 없어.",
        demoFeedback: { score: 80, summary: "의미 전달이 좋아요!", tip: "帮不了 bāng bu liǎo의 경성 bu를 가볍게 발음해보세요." },
      },
      {
        speaker: "친구 B",
        zh: "那只能靠自己了。",
        pinyin: "Nà zhǐ néng kào zìjǐ le.",
        ko: "그럼 스스로 해낼 수밖에 없지.",
        demoFeedback: { score: 88, summary: "아주 자연스러워요!", tip: "只能 zhǐ néng — 3성 + 2성 연결을 부드럽게 이어보세요." },
      },
    ],
  },
  {
    id: "rp-buhaore",
    title: "不好惹",
    situation: "새 학기 첫날, 새로 온 친구의 첫인상에 대해 이야기한다.",
    roles: ["학생 A", "학생 B"],
    note: "드라마 대사를 바탕으로 만든 연습용 대화예요.",
    lines: [
      {
        speaker: "학생 A",
        zh: "新同学看起来怎么样？",
        pinyin: "Xīn tóngxué kàn qǐlai zěnmeyàng?",
        ko: "새로 온 친구 어때 보여?",
        demoFeedback: { score: 83, summary: "질문 억양이 좋아요!", tip: "怎么样 zěnmeyàng의 마지막 음절을 살짝 올려보세요." },
      },
      {
        speaker: "학생 B",
        zh: "看起来不好惹。",
        pinyin: "Kàn qǐlai bù hǎo rě.",
        ko: "만만해 보이지 않아.",
        demoFeedback: { score: 86, summary: "표현이 자연스러워요!", tip: "惹 rě의 권설음 r을 조금 더 분명하게 내보세요." },
      },
    ],
  },
  {
    id: "rp-zuisui",
    title: "人是好人，就是嘴碎",
    situation: "이웃 어른에 대해 솔직하게 평가하는 가족 대화.",
    roles: ["가족 A", "가족 B"],
    note: "드라마 대사를 바탕으로 만든 연습용 대화예요.",
    lines: [
      {
        speaker: "가족 A",
        zh: "你觉得王阿姨怎么样？",
        pinyin: "Nǐ juéde Wáng āyí zěnmeyàng?",
        ko: "왕 아주머니 어떤 분 같아?",
        demoFeedback: { score: 81, summary: "잘했어요!", tip: "阿姨 āyí — 1성 + 2성을 또렷하게 구분해보세요." },
      },
      {
        speaker: "가족 B",
        zh: "人是好人，就是嘴碎。",
        pinyin: "Rén shì hǎorén, jiùshì zuǐ suì.",
        ko: "사람은 좋은데, 말이 좀 많아.",
        demoFeedback: { score: 84, summary: "뉘앙스가 잘 살아 있어요!", tip: "嘴碎 zuǐ suì — 3성 + 4성 대비를 살려보세요." },
      },
    ],
  },
];
