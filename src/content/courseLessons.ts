// 새 3과목 × 15주 = 45개 강의자료의 기본 데이터 (수연 선생님이 확정한 주차 · 학습 주제 · 원본 영상, 2026-10-29)
//
// - 이 단계에서는 과목 · 주차 · 학습 주제 · 드라마 · 원본 영상 제목 · YouTube 주소만 넣는다.
// - 자막(SRT) · 병음 · 번역 · 핵심 표현 · 어휘 · 문법 · 발음 · 퀴즈 · HSK 수준은 넣지 않는다.
//   각 영상의 실제 SRT를 받은 뒤 그 대사를 근거로 ‘강의자료 만들기’에서 채운다. 그래서 모두 ‘준비 중’이다.
// - 기존 자료(course-legacy)와 영상이 같아도 그 강의자료를 옮기거나 복사하지 않는다. (예: 과목 1의 2주차)
// - title = 학습 주제, source.videoTitle = 원본 영상 제목, video.youtubeUrl = 확정된 주소 그대로

import { COURSE_SEEDS, courseLessonId } from "./courses";
import type { Lesson } from "./types";

const SEED_TIME = "2026-10-29T00:00:00.000Z";

/** [학습 주제, 원본 영상 제목, YouTube 주소] — 배열 순서가 1~15주차 */
type WeekRow = [topic: string, videoTitle: string, youtubeUrl: string];

const COURSE_WEEKS: Record<string, WeekRow[]> = {
  /* ───────── 과목 1 《当我飞奔向你》 校园生活汉语 ───────── */
  "course-campus": [
    ["첫 만남과 첫인상", "苏在在雨中邂逅张陆让", "https://youtu.be/d0msPNoywS8"],
    ["친구를 돕고 응원하기", "苏在在被男生欺负，张陆让赢下篮球赛为她出头", "https://www.youtube.com/watch?v=EXUSxAKaLmI"],
    ["함께 가기와 동행 제안하기", "张陆让陪苏在在一起走夜路", "https://www.youtube.com/watch?v=Ca3Hym5ASU0"],
    ["선택과 의견 표현하기", "苏在在竞选灰姑娘角色，张陆让投票给在在却死不承认", "https://youtu.be/1TpuMnIGhE4"],
    ["생일 축하와 감사", "张陆让准备生日礼物，小伙伴们给苏在在生日惊喜", "https://www.youtube.com/watch?v=yhJZPFkK4ls"],
    ["공부와 도움 요청하기", "苏在在主动邀约张陆让补课", "https://youtu.be/WiHQF126-V8"],
    ["호의와 이유 표현하기", "张陆让雨夜专程给苏在在送伞却嘴硬不愿承认", "https://www.youtube.com/watch?v=z50hQlKQVXw"],
    ["상태 묻기와 친구 돌보기", "姜佳照顾生病的顾然", "https://www.youtube.com/watch?v=jMSiaSgsEtY"],
    ["공공장소 곤란 상황 대응", "公交车上偶遇猥琐大叔，张陆让为苏在在出头", "https://youtu.be/AoA-guQvuJ0"],
    ["서운함과 이유 묻기", "苏在在发现张陆让转学没有告诉她", "https://www.youtube.com/watch?v=B8Yd507kL9I"],
    ["재회와 반가움", "“苏在在，回头！”张陆让与苏在在重逢", "https://www.youtube.com/watch?v=i_WSKKHZH2Y"],
    ["두려움과 안심", "苏在在走夜路害怕，张陆让及时出现", "https://www.youtube.com/watch?v=SQc_xiC91mk"],
    ["위로와 마음 표현", "让让轻轻抱抱害怕的在在，苏在在甜蜜告白“我觉得让让更好”", "https://www.youtube.com/watch?v=mu0n09BwhPU"],
    ["솔직한 감정 표현", "苏在在对张陆让直球说“我想要你”", "https://www.youtube.com/watch?v=1qqekOlp_Dk"],
    ["안심시키고 약속하기", "苏在在：“张陆让，你放心，我会对你负责到底的”", "https://www.youtube.com/watch?v=SWbbyNKRHnc"],
  ],
  /* ───────── 과목 2 《机智的上半场》 大学生活汉语 ───────── */
  "course-university": [
    ["새로운 룸메이트와 기숙사 생활", "My roommate is such a spoiled princess", "https://www.youtube.com/watch?v=mR4xiaNeyfs"],
    ["친구들과 협력하고 역할 나누기", "Langlang teams up with Wu Yan", "https://www.youtube.com/watch?v=GVmEncNtcac"],
    ["친구 사이의 생각과 감정 표현하기", "夏朗朗、皇甫议论范轻舟，杨嘉倩不开心", "https://www.youtube.com/watch?v=rOCggaC38L0"],
    ["교내 문제 상황을 설명하고 해명하기", "办公室激情视频传遍网络，嘉倩被老师约谈？！", "https://youtu.be/T82vWnNBA2k"],
    ["문제에 대한 입장과 의견 표현하기", "嘉倩遭受网络暴力还要保护视频主角？！", "https://youtu.be/FinXR50tmHU"],
    ["발표하고 자신의 생각 전달하기", "白富美樊潇雨自信的演讲，气场霸气十足惊艳众人！", "https://youtu.be/sNKLWf15eFU"],
    ["친구와 다투고 잘못 인정하기", "姐妹因为男人吵架！潇雨深刻反思自己的过错", "https://youtu.be/Bj3gXUVaVFk"],
    ["친구와 화해하고 관계 회복하기", "潇雨杨嘉倩重新和好！", "https://youtu.be/mcIzM3NnAo8"],
    ["경제적 독립과 돈 문제 이야기하기", "樊潇雨被后妈打，为赚钱又得罪嘉倩", "https://www.youtube.com/watch?v=NCXrWdP9hjU"],
    ["회의에서 아이디어를 제안하고 의견 나누기", "白富美组织动员会，伙伴们纷纷献计想妙招！", "https://youtu.be/Djg24YNq0WY"],
    ["방문하고 상대를 배려하며 대화하기", "姐妹们一起去看望老人", "https://youtu.be/QPzuRdcc6Z4"],
    ["가족과 갈등을 해결하고 화해하기", "潇雨和爸爸化解矛盾", "https://youtu.be/gcLCGSKsYBc"],
    ["첫 직장생활에서 실수하고 대처하기", "朗朗刚工作就闯祸！但是遇到个高大帅气的师兄", "https://youtu.be/M08ALP64muQ"],
    // 확정 영상은 LB6EERwX9go (이전에 적었던 5zb-V4n-rEI는 잘못된 영상)
    ["성과와 평가에 대해 이야기하기", "朗朗赢得第一，麦老师也在默默关注她", "https://www.youtube.com/watch?v=LB6EERwX9go"],
    ["졸업과 작별, 미래 이야기하기", "It's graduation time! The girls really don't want to be apart", "https://www.youtube.com/watch?v=WMDz4an9Zrc"],
  ],
  /* ───────── 과목 3 《你也有今天》 职场生活汉语 ───────── */
  "course-workplace": [
    ["상사와 처음 만나 직장 관계 파악하기", "打工人社死现场！成瑶以为的陪酒牛郎钱恒竟然是顶头上司 当面对质的尴尬程度不亚于脚趾抠地板", "https://youtu.be/5WiXCsy_cGo"],
    ["전문적인 요청에 대응하고 입장 밝히기", "油腻男试图白嫖成瑶法律建议，钱恒及时现身霸气劝退“她的时间都是我的”", "https://youtu.be/M9AY_hLeLvs"],
    ["사건의 사실관계를 파악하고 상황 설명하기", "富豪装绝症晚期坚持要跟原配离婚，没想到被成瑶撞破小三即将生产", "https://youtu.be/4QoZAc63524"],
    ["업무 행사에서 소통하고 상황 파악하기", "商业活动变相亲？腹黑钱恒：跟成瑶一起也不是不行！", "https://youtu.be/pYhtDs-87NE"],
    ["상사와 업무 관계 조율하기", "毒舌霸总一句话让小助理破防，成瑶故意和钱恒保持距离？", "https://youtu.be/3IodkcrIY2g"],
    ["회의에서 사건을 논의하고 의견 제시하기", "毒舌霸总钱恒开会盯着小助理成瑶发呆，完蛋了这动心的表情！", "https://youtu.be/EI6Qjxfsfm8"],
    ["고객과의 문제 상황에 대응하기", "解气！钱恒暴打色狼客户，霸气牵手成瑶离开", "https://youtu.be/zGxpsAvVxOM"],
    ["직업과 경력에 대해 설명하기", "成瑶爆改精英律师钱恒新人设“大专毕业 工厂打工 刚刚失业” 霸总表示很无语", "https://youtu.be/uHXK1PiXoBg"],
    ["업무상 어려움과 감정 설명하기", "成瑶案件上受委屈，钱恒得知准备豪华大餐霸气安慰", "https://youtu.be/LdVMQIGFSQk"],
    ["새로운 직원과 직장 관계 형성하기", "梁依然入职君恒第一天便频频向钱恒示好 成瑶疯狂吃醋", "https://youtu.be/Uq1YkuTHL3g"],
    ["팀 내 갈등과 의사결정 표현하기", "成瑶委屈退出钱恒团队 谁料这都是梁依然的恶毒计谋", "https://youtu.be/bTlwzX0XYzA"],
    ["부당한 업무 요구와 직장 갈등에 대응하기", "心机女上司联合刁钻客户 趁钱恒不在联手逼成瑶辞职", "https://youtu.be/pKQ6gsAXdW0"],
    ["직장에서 겪은 어려움을 설명하기", "成瑶强颜欢笑装作工作顺利 钱恒看在眼里决心为老婆“复仇”", "https://youtu.be/zzj76T4sMQs"],
    ["해고 상황을 설명하고 문제에 대응하기", "钱恒出差归来发现成瑶被辞退 正面硬刚梁依然为老婆讨回公道", "https://youtu.be/-7iyU8ZRDaU"],
    ["새로운 직장에 입사하고 적응하기", "成瑶入职新律所顾北青发出约会示好，钱恒危机感大爆发！", "https://youtu.be/UmuqP7R7KS0"],
  ],
};

/** youtu.be/{id} 또는 youtube.com/watch?v={id} 에서 영상 id */
const youtubeIdOf = (url: string) => {
  const u = new URL(url);
  return u.hostname === "youtu.be" ? u.pathname.slice(1) : (u.searchParams.get("v") ?? "");
};

/** 새 3과목 강의자료 45개 (학습 콘텐츠 없이 기본 정보만, 모두 ‘준비 중’) */
export const COURSE_LESSONS: Lesson[] = COURSE_SEEDS.flatMap((course) =>
  COURSE_WEEKS[course.id].map(([topic, videoTitle, youtubeUrl], i): Lesson => {
    const week = i + 1;
    return {
      id: courseLessonId(course.id, week),
      courseId: course.id,
      week,
      title: topic,
      description: "",
      // 새 3과목은 모두 중국어 원문 기반
      direction: "zh-ko",
      // HSK 수준은 실제 대사를 확인한 뒤 정한다. (빈 값 = 미지정)
      level: "",
      status: "draft",
      // 영상 전체가 학습 구간 (endTime 0 = 영상 끝까지)
      video: { youtubeUrl, youtubeId: youtubeIdOf(youtubeUrl), startTime: 0, endTime: 0 },
      source: { dramaTitle: course.drama, episode: "", videoTitle },
      script: { source: "srt", cues: [], updatedAt: null },
      createdAt: SEED_TIME,
      updatedAt: SEED_TIME,
    };
  }),
);
