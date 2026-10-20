import { yijiarenzhimingEp3KoSubtitles } from "../subtitles/yijiarenzhiming-ep3.ko";
import type { EpisodeContent } from "../types";

/**
 * 《以家人之名》 第3集 — 학습 콘텐츠.
 * 시간은 모두 원본 YouTube 영상 기준(초)이다.
 * 새 회차를 추가할 때는 이 파일을 복사해 데이터만 바꾸고 content/index.ts에 등록한다.
 */
export const yijiarenzhimingEp3: EpisodeContent = {
  id: "yjrzm-ep3",
  dramaId: "yjrzm",
  dramaTitle: "以家人之名",
  episode: "第3集",
  description: "가족의 일상 속에서 배우는 실생활 중국어와 가족문화",
  video: {
    youtubeUrl: "https://youtu.be/_Ahf8DxMxcs",
    youtubeId: "_Ahf8DxMxcs",
    startTime: 120, // 02:00
    endTime: 626, // 10:26
  },
  cues: [
    {
      id: "c-0246",
      kind: "motion",
      motionType: "grammar",
      learningType: "grammar",
      title: "为了 · 先下手为强 · 不好惹",
      time: 166, // 02:46
      duration: 14,
      position: "top-left",
      dialogue: {
        zh: "为了防止同学欺负我、歧视我，我决定先下手为强，给他们留下一个不好惹的印象。",
        ko: "친구들이 나를 괴롭히고 무시하지 못하도록, 먼저 선수를 쳐서 만만하지 않다는 인상을 남기기로 했다.",
      },
      props: {
        grammar: {
          label: "📖 语法 · 문법",
          sentence: "为了防止同学欺负我、歧视我",
          highlight: "为了",
          pattern: "为了 + 목적",
          meaning: "~하기 위해서",
        },
        expression: {
          label: "💬 核心表达 · 핵심 표현",
          sentence: "我决定先下手为强",
          zh: "先下手为强",
          pinyin: "xiān xià shǒu wéi qiáng",
          ko: "먼저 행동하여 주도권을 잡다",
        },
        badge: {
          zh: "不好惹",
          pinyin: "bù hǎo rě",
          ko: ["만만하지 않다", "함부로 건드리기 어렵다"],
        },
      },
    },
    {
      id: "c-0652",
      kind: "motion",
      motionType: "focus",
      learningType: "grammar",
      title: "只能 + 동사",
      time: 412, // 06:52
      duration: 6,
      position: "top-left",
      dialogue: { zh: "只能靠自己啦。", pinyin: "Zhǐ néng kào zìjǐ la.", ko: "스스로 해낼 수밖에 없지." },
      props: {
        label: "📖 语法 · 只能靠自己",
        options: ["靠父母", "靠朋友", "靠自己"],
        focusIndex: 2,
        pattern: "只能 + 동사",
        meaning: "~할 수밖에 없다",
      },
    },
    {
      id: "c-0714",
      kind: "motion",
      motionType: "metaphor",
      learningType: "metaphor",
      title: "掉进蜜罐罐里",
      time: 434, // 07:14
      duration: 7,
      position: "top-right",
      dialogue: { zh: "这叫掉进蜜罐罐里了。", pinyin: "Zhè jiào diào jìn mì guànguan lǐ le." },
      props: {
        label: "🍯 比喻 · 비유 표현",
        expression: "掉进蜜罐罐里",
        fallingPart: "掉进",
        pinyin: "diào jìn mì guànguan lǐ",
        literal: { label: "直译 · 직역", text: "꿀단지 속에 빠지다" },
        actual: { label: "实际意思 · 실제 의미", text: "좋은 환경에서 사랑과 보살핌을 받다" },
      },
    },
    {
      id: "c-0818",
      kind: "motion",
      motionType: "expression",
      learningType: "pragmatic",
      title: "算你狠！",
      time: 498, // 08:18
      duration: 6,
      position: "top-right",
      dialogue: { zh: "这算你狠，算你狠。", pinyin: "Zhè suàn nǐ hěn, suàn nǐ hěn." },
      props: {
        label: "💬 算你狠！",
        expression: "算你狠！",
        pulseChar: "狠",
        pinyin: "Suàn nǐ hěn!",
        meanings: ["그래, 네가 이겼다.", "너 진짜 독하다."],
        note: { zh: "语境很重要！", ko: "상황에 따라 뉘앙스가 달라져요." },
      },
    },
    {
      id: "c-0901",
      kind: "motion",
      motionType: "split",
      learningType: "expression",
      title: "嘴碎 · 说七说八",
      time: 541, // 09:01
      duration: 8,
      position: "top-left",
      dialogue: { zh: "人是好人，就是嘴碎。老跟孩子说七说八的。" },
      props: {
        label: "💬 表达比较 · 표현 비교",
        dialogue: "人是好人，就是嘴碎。老跟孩子说七说八的。",
        left: {
          zh: "嘴碎",
          pinyin: "zuǐ suì",
          ko: "말이 많고 이것저것 참견하는 편이다",
          usage: "사람의 성향을 평가할 때",
        },
        right: {
          zh: "说七说八",
          pinyin: "shuō qī shuō bā",
          ko: "이것저것 이러쿵저러쿵 말하다",
          usage: "실제로 말하는 행동을 묘사할 때",
        },
        note: "비슷해 보이지만 같은 말은 아니에요. 嘴碎는 ‘성향’, 说七说八는 ‘말하는 모습’에 가까워요.",
      },
    },
    {
      id: "c-0944",
      kind: "culture-lens",
      learningType: "culture",
      title: "🔍 文化镜头 · 가족",
      time: 584, // 09:44
      duration: 20,
      position: "top-right",
      dialogue: { zh: "海潮啊，你看，咱这一大家子多好啊……" },
      cultureId: "family-making",
      hint: "이 장면의 문화적 맥락 살펴보기",
    },
    {
      id: "c-1006",
      kind: "motion",
      motionType: "comparison",
      learningType: "similar",
      title: "操心 · 惦记",
      time: 606, // 10:06
      duration: 9,
      position: "top-left",
      dialogue: { zh: "凌霄不用我操心。我在外头工作，再也不用惦记家里的事了。" },
      props: {
        label: "🔄 相似表达 · 비슷한 표현",
        items: [
          {
            zh: "操心",
            pinyin: "cāoxīn",
            ko: "신경 써서 걱정하다",
            example: "凌霄不用我操心。",
            keyPoint: "신경 써서 걱정함",
          },
          {
            zh: "惦记",
            pinyin: "diànjì",
            ko: "마음에 계속 두고 걱정하거나 생각하다",
            example: "再也不用惦记家里的事了。",
            keyPoint: "마음에 계속 두고 있음",
          },
        ],
      },
    },
  ],
  subtitles: yijiarenzhimingEp3KoSubtitles,
  summary: [
    { zh: "为了 + 목적", pinyin: "wèile", ko: "~하기 위해서", type: "문법" },
    { zh: "先下手为强", pinyin: "xiān xià shǒu wéi qiáng", ko: "먼저 행동하여 주도권을 잡다", type: "핵심 표현" },
    { zh: "不好惹", pinyin: "bù hǎo rě", ko: "만만하지 않다", type: "핵심 표현" },
    { zh: "只能 + 동사", pinyin: "zhǐ néng", ko: "~할 수밖에 없다", type: "문법" },
    { zh: "掉进蜜罐罐里", pinyin: "diào jìn mì guànguan lǐ", ko: "사랑과 보살핌을 듬뿍 받다", type: "비유 표현" },
    { zh: "算你狠", pinyin: "suàn nǐ hěn", ko: "그래, 네가 이겼다", type: "화용 표현" },
    { zh: "嘴碎 · 说七说八", pinyin: "zuǐ suì · shuō qī shuō bā", ko: "말이 많다 · 이러쿵저러쿵 말하다", type: "표현 비교" },
    { zh: "操心 · 惦记", pinyin: "cāoxīn · diànjì", ko: "신경 써서 걱정하다 · 마음에 두다", type: "유사 표현" },
  ],
  quiz: [
    {
      id: "q1",
      question: "不好惹와 가장 가까운 의미는?",
      options: ["쉽게 친해질 수 있다", "함부로 건드리기 어렵다", "쉽게 화를 낸다", "말이 많다"],
      answer: 1,
      explanation:
        "惹(rě)는 ‘건드리다, 성가시게 하다’라는 뜻이에요. 不好惹는 ‘건드리기 쉽지 않다’, 즉 만만하지 않은 사람이라는 의미예요.",
    },
    {
      id: "q2",
      question: "先下手为强을 쓰기에 가장 알맞은 상황은?",
      options: [
        "시험이 끝난 뒤 조용히 결과를 기다릴 때",
        "상대보다 먼저 움직여 주도권을 잡으려고 할 때",
        "친구에게 고마운 마음을 전할 때",
        "실수를 하고 정중하게 사과할 때",
      ],
      answer: 1,
      explanation:
        "先下手为强은 ‘먼저 손을 쓰는 쪽이 유리하다’는 뜻이에요. 장면에서도 괴롭힘을 당하기 전에 먼저 강한 인상을 남기려는 의도로 쓰였어요.",
    },
    {
      id: "q3",
      question: "이 드라마 장면에서 算你狠은 어떤 뉘앙스로 쓰였을까요?",
      options: [
        "상대를 진지하게 비난하며 화를 낸다",
        "친한 사이에서 장난스럽게 ‘그래, 네가 이겼다’며 인정한다",
        "상대가 무서워서 겁을 먹는다",
        "상대에게 공손하게 부탁한다",
      ],
      answer: 1,
      explanation:
        "算你狠은 문자 그대로는 ‘네가 독하다’지만, 이 장면처럼 친한 사이의 티격태격에서는 ‘졌다, 네가 이겼다’는 장난스러운 인정에 가까워요. 语境很重要！",
    },
  ],
};
