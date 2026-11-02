// 자동 생성 파일 — 직접 고치지 마세요. 웹앱에서 강의자료를 고친 뒤 `npm run export-lessons`로 다시 만듭니다.
// data/db.json의 강의자료 61개 (2026-11-02T08:13:04.185Z)
// 서버 DB에 처음 들어가는 기본 강의자료(SEED_LESSONS)에서 같은 id의 기본값을 이 내용으로 바꾼다.
import type { Lesson } from "./types";

export const SAVED_LESSONS: Lesson[] = [
  {
    "id": "course-campus-w01",
    "courseId": "course-campus",
    "week": 1,
    "title": "첫 만남과 첫인상",
    "description": "등굣길 지각부터 잃어버린 지갑 찾기까지, 이름과 반을 말하고 친구와 함께 문제를 해결하는 학교생활 중국어를 배워요.",
    "direction": "zh-ko",
    "level": "hsk3",
    "status": "published",
    "video": {
      "youtubeUrl": "https://youtu.be/d0msPNoywS8",
      "youtubeId": "d0msPNoywS8",
      "startTime": 3,
      "endTime": 462
    },
    "source": {
      "dramaTitle": "当我飞奔向你",
      "episode": "",
      "videoTitle": "苏在在雨中邂逅张陆让"
    },
    "script": {
      "source": "srt",
      "cues": [
        {
          "start": 7.2,
          "end": 8.759,
          "zh": "下雨了 还不跑起来",
          "ko": "비 오는데 뛰지도 않고",
          "pinyin": "xià yǔ le hái bù pǎo qǐlai"
        },
        {
          "start": 9.16,
          "end": 10.52,
          "zh": "为什么走着淋雨啊",
          "ko": "왜 비를 맞으면서 걸어?",
          "pinyin": "wèishénme zǒuzhe lín yǔ a"
        },
        {
          "start": 10.52,
          "end": 11.439,
          "zh": "笨蛋",
          "ko": "바보",
          "pinyin": "bèndàn"
        },
        {
          "start": 21.719,
          "end": 23.24,
          "zh": "阿姨 给我两瓶可乐",
          "ko": "이모, 콜라 두 병 주세요",
          "pinyin": "āyí gěi wǒ liǎng píng kělè"
        },
        {
          "start": 23.24,
          "end": 24.039,
          "zh": "谢谢",
          "ko": "감사합니다",
          "pinyin": "xièxie"
        },
        {
          "start": 64.48,
          "end": 67.14,
          "zh": "我听说啊新生中有好几个厉害的",
          "ko": "듣자 하니 신입생 중에 대단한 애들이 몇 명 있대",
          "pinyin": "wǒ tīngshuō a xīnshēng zhōng yǒu hǎo jǐ gè lìhai de"
        },
        {
          "start": 67.1,
          "end": 68.5,
          "zh": "也不知道是不是真的",
          "ko": "진짜인지는 모르겠지만",
          "pinyin": "yě bù zhīdào shì bu shì zhēn de"
        },
        {
          "start": 68.5,
          "end": 70.4,
          "zh": "反正我打听出来最有名的两个",
          "ko": "어쨌든 내가 알아낸 제일 유명한 두 명은",
          "pinyin": "fǎnzhèng wǒ dǎting chūlai zuì yǒumíng de liǎng gè"
        },
        {
          "start": 70.4,
          "end": 72.5,
          "zh": "一个叫张陆让",
          "ko": "한 명은 장루랑",
          "pinyin": "yí gè jiào zhāng lùràng"
        },
        {
          "start": 72.5,
          "end": 73.34,
          "zh": "一个叫顾然",
          "ko": "한 명은 구란이야",
          "pinyin": "yí gè jiào gù rán"
        },
        {
          "start": 73.3,
          "end": 75.4,
          "zh": "那他们为什么这么有名啊",
          "ko": "그 애들은 왜 그렇게 유명한데?",
          "pinyin": "nà tāmen wèishénme zhème yǒumíng a"
        },
        {
          "start": 75.4,
          "end": 77.4,
          "zh": "成绩好呗",
          "ko": "성적이 좋겠지",
          "pinyin": "chéngjì hǎo bei"
        },
        {
          "start": 78.5,
          "end": 80.5,
          "zh": "我们学校成绩好的也不少啊",
          "ko": "우리 학교에 성적 좋은 애들은 많잖아",
          "pinyin": "wǒmen xuéxiào chéngjì hǎo de yě bù shǎo a"
        },
        {
          "start": 80.9,
          "end": 82.9,
          "zh": "所以肯定还有别的过人之处",
          "ko": "그러니까 분명 다른 뛰어난 점이 있겠지",
          "pinyin": "suǒyǐ kěndìng hái yǒu bié de guòrén zhī chù"
        },
        {
          "start": 84.4,
          "end": 85.9,
          "zh": "在在快点 我们要迟到了",
          "ko": "짜이짜이, 빨리 와, 우리 지각하겠어",
          "pinyin": "zàizài kuài diǎn wǒmen yào chídào le"
        },
        {
          "start": 87.4,
          "end": 88.5,
          "zh": "别磨蹭了",
          "ko": "꾸물거리지 마",
          "pinyin": "bié móceng le"
        },
        {
          "start": 88.5,
          "end": 88.96,
          "zh": "赶紧说吧",
          "ko": "빨리 말해",
          "pinyin": "gǎnjǐn shuō ba"
        },
        {
          "start": 89,
          "end": 90.1,
          "zh": "叫什么名字",
          "ko": "이름이 뭐야?",
          "pinyin": "jiào shénme míngzi"
        },
        {
          "start": 90.1,
          "end": 91.5,
          "zh": "几班的",
          "ko": "몇 반이야?",
          "pinyin": "jǐ bān de"
        },
        {
          "start": 93,
          "end": 94,
          "zh": "问你们话呢",
          "ko": "묻잖아",
          "pinyin": "wèn nǐmen huà ne"
        },
        {
          "start": 94,
          "end": 96,
          "zh": "苏在在高一九班",
          "ko": "쑤짜이짜이, 1학년 9반이요",
          "pinyin": "sū zàizài gāo yī jiǔ bān"
        },
        {
          "start": 97,
          "end": 99,
          "zh": "姜佳 也是高一九班",
          "ko": "장자, 저도 1학년 9반이요",
          "pinyin": "jiāng jiā yě shì gāo yī jiǔ bān"
        },
        {
          "start": 102.6,
          "end": 103.5,
          "zh": "同学",
          "ko": "거기 학생",
          "pinyin": "tóngxué"
        },
        {
          "start": 104.6,
          "end": 105.7,
          "zh": "过来过来",
          "ko": "이리 와, 이리 와",
          "pinyin": "guòlai guòlai"
        },
        {
          "start": 106.4,
          "end": 107.6,
          "zh": "同学 过来",
          "ko": "학생, 이리 와",
          "pinyin": "tóngxué guòlai"
        },
        {
          "start": 110.4,
          "end": 111.6,
          "zh": "学长 学姐 早",
          "ko": "선배님들, 안녕하세요",
          "pinyin": "xuézhǎng xuéjiě zǎo"
        },
        {
          "start": 112.4,
          "end": 115,
          "zh": "看看几点了 叫什么",
          "ko": "지금 몇 시인지 봐. 이름이 뭐야?",
          "pinyin": "kànkan jǐ diǎn le jiào shénme"
        },
        {
          "start": 116.3,
          "end": 117.3,
          "zh": "学姐",
          "ko": "선배",
          "pinyin": "xuéjiě"
        },
        {
          "start": 117.3,
          "end": 118.3,
          "zh": "不说是吧",
          "ko": "말 안 하겠다 이거지?",
          "pinyin": "bù shuō shì ba"
        },
        {
          "start": 124.5,
          "end": 125.5,
          "zh": "张陆让",
          "ko": "장루랑이요",
          "pinyin": "zhāng lùràng"
        },
        {
          "start": 127,
          "end": 128,
          "zh": "啊 我不是",
          "ko": "네? 전 아닌데요",
          "pinyin": "à wǒ bú shì"
        },
        {
          "start": 128,
          "end": 129,
          "zh": "名字都在这儿写着呢 还不是",
          "ko": "이름이 여기 다 쓰여 있는데 아니긴 뭐가 아니야",
          "pinyin": "míngzi dōu zài zhèr xiězhe ne hái bú shì"
        },
        {
          "start": 129,
          "end": 131.6,
          "zh": "记下来 他叫张陆让",
          "ko": "적어. 얘 이름은 장루랑",
          "pinyin": "jì xiàlai tā jiào zhāng lùràng"
        },
        {
          "start": 131.6,
          "end": 133.6,
          "zh": "哎 张陆让",
          "ko": "어, 장루랑",
          "pinyin": "āi zhāng lùràng"
        },
        {
          "start": 133.6,
          "end": 135.5,
          "zh": "就是贴吧那个",
          "ko": "바로 그 게시판에 나온 애",
          "pinyin": "jiùshì tiēbā nàge"
        },
        {
          "start": 138.6,
          "end": 140,
          "zh": "你跟她们一样都是九班的吗",
          "ko": "너도 쟤들처럼 9반이야?",
          "pinyin": "nǐ gēn tāmen yíyàng dōu shì jiǔ bān de ma"
        },
        {
          "start": 142.3,
          "end": 143.5,
          "zh": "我其实我",
          "ko": "저는 사실, 저는",
          "pinyin": "wǒ qíshí wǒ"
        },
        {
          "start": 144,
          "end": 145.5,
          "zh": "知道了 九班的",
          "ko": "알았어, 9반",
          "pinyin": "zhīdào le jiǔ bān de"
        },
        {
          "start": 149,
          "end": 151.3,
          "zh": "愣着干嘛呀 赶快回班呀",
          "ko": "멍하니 뭐 해? 얼른 교실로 가",
          "pinyin": "lèngzhe gànmá ya gǎnkuài huí bān ya"
        },
        {
          "start": 151.3,
          "end": 153.3,
          "zh": "哦 好",
          "ko": "아, 네",
          "pinyin": "ò hǎo"
        },
        {
          "start": 155.3,
          "end": 157.3,
          "zh": "老师 张陆让还没来呢",
          "ko": "선생님, 장루랑이 아직 안 왔는데요",
          "pinyin": "lǎoshī zhāng lùràng hái méi lái ne"
        },
        {
          "start": 157.7,
          "end": 158.8,
          "zh": "张陆让",
          "ko": "장루랑?",
          "pinyin": "zhāng lùràng"
        },
        {
          "start": 160,
          "end": 161.8,
          "zh": "他是一班的 来咱们班干嘛",
          "ko": "걔는 1반인데 우리 반엔 왜 와?",
          "pinyin": "tā shì yī bān de lái zánmen bān gànmá"
        },
        {
          "start": 162,
          "end": 163.2,
          "zh": "啊 一班",
          "ko": "아, 1반",
          "pinyin": "à yī bān"
        },
        {
          "start": 164.5,
          "end": 165.9,
          "zh": "张陆让到了没有",
          "ko": "장루랑 왔어, 안 왔어?",
          "pinyin": "zhāng lùràng dào le méiyǒu"
        },
        {
          "start": 166.2,
          "end": 167,
          "zh": "来了来了",
          "ko": "왔어요, 왔어요",
          "pinyin": "lái le lái le"
        },
        {
          "start": 168,
          "end": 170,
          "zh": "你是张陆让",
          "ko": "네가 장루랑이야?",
          "pinyin": "nǐ shì zhāng lùràng"
        },
        {
          "start": 173.4,
          "end": 175.1,
          "zh": "啊让 啊让",
          "ko": "아랑, 아랑",
          "pinyin": "ā ràng ā ràng"
        },
        {
          "start": 176.1,
          "end": 177,
          "zh": "王阳",
          "ko": "왕양",
          "pinyin": "wáng yáng"
        },
        {
          "start": 178,
          "end": 179,
          "zh": "韩正",
          "ko": "한정",
          "pinyin": "hán zhèng"
        },
        {
          "start": 180,
          "end": 181,
          "zh": "李茂生",
          "ko": "리마오성",
          "pinyin": "lǐ màoshēng"
        },
        {
          "start": 184,
          "end": 185,
          "zh": "借你的书",
          "ko": "빌려 간 책",
          "pinyin": "jiè nǐ de shū"
        },
        {
          "start": 185,
          "end": 186.2,
          "zh": "给你摆好了",
          "ko": "잘 정리해 놨어",
          "pinyin": "gěi nǐ bǎi hǎo le"
        },
        {
          "id": "cue-mvytv4bi-5xmm9l",
          "start": 190,
          "end": 191,
          "zh": "今天怎么这么晚",
          "ko": "오늘은 왜 이렇게 늦었어?",
          "pinyin": "jīntiān zěnme zhème wǎn"
        },
        {
          "id": "cue-mvytv4bi-5qrdvy",
          "start": 191,
          "end": 194,
          "zh": "迟到了 在学校门口被值日生拦下了",
          "ko": "지각했어. 교문에서 당번한테 붙잡혔어",
          "pinyin": "chídào le zài xuéxiào ménkǒu bèi zhírìshēng lán xià le"
        },
        {
          "id": "cue-mvytv4bi-zra9sa",
          "start": 194,
          "end": 195,
          "zh": "啊",
          "ko": "아?",
          "pinyin": "á"
        },
        {
          "id": "cue-mvytv4bi-jev5e9",
          "start": 195,
          "end": 198,
          "zh": "那 那怎么办",
          "ko": "그럼 어떡해?",
          "pinyin": "nà nà zěnme bàn"
        },
        {
          "id": "cue-mvytv4bi-5rfovg",
          "start": 198,
          "end": 199,
          "zh": "很紧张",
          "ko": "되게 긴장하네",
          "pinyin": "hěn jǐnzhāng"
        },
        {
          "id": "cue-mvytv4bi-s3390t",
          "start": 200,
          "end": 202,
          "zh": "啊 没事啊",
          "ko": "아, 아니야",
          "pinyin": "à méishì a"
        },
        {
          "id": "cue-mvytv4bi-w27d0u",
          "start": 202,
          "end": 204,
          "zh": "这不关心你吗",
          "ko": "걱정돼서 그러지",
          "pinyin": "zhè bú guānxīn nǐ ma"
        },
        {
          "id": "cue-mvytv4bi-fy2ncj",
          "start": 204,
          "end": 205,
          "zh": "主要是我听说",
          "ko": "그게, 내가 듣기로는",
          "pinyin": "zhǔyào shì wǒ tīngshuō"
        },
        {
          "id": "cue-mvytv4bi-0bqwkh",
          "start": 205,
          "end": 207.7,
          "zh": "咱们学校如果迟到的话会被记名字的",
          "ko": "우리 학교는 지각하면 이름 적힌다던데",
          "pinyin": "zánmen xuéxiào rúguǒ chídào dehuà huì bèi jì míngzi de"
        },
        {
          "id": "cue-mvytv4bi-jrshct",
          "start": 207.7,
          "end": 208.7,
          "zh": "没记我",
          "ko": "나 안 적혔어",
          "pinyin": "méi jì wǒ"
        },
        {
          "id": "cue-mvytv4bi-iy5xk5",
          "start": 209,
          "end": 211,
          "zh": "啊 没记你啊",
          "ko": "아, 안 적혔구나",
          "pinyin": "à méi jì nǐ a"
        },
        {
          "id": "cue-mvytv4bi-ejxb9u",
          "start": 213,
          "end": 215.4,
          "zh": "那就好 差点出现两个张陆让",
          "ko": "다행이다. 하마터면 장루랑이 두 명 될 뻔했네",
          "pinyin": "nà jiù hǎo chàdiǎn chūxiàn liǎng gè zhāng lùràng"
        },
        {
          "start": 216,
          "end": 219,
          "zh": "你不觉得你今天对我有点过分地热情吗",
          "ko": "너 오늘 나한테 좀 지나치게 친절한 거 같지 않아?",
          "pinyin": "nǐ bù juéde nǐ jīntiān duì wǒ yǒudiǎn guòfèn de rèqíng ma"
        },
        {
          "start": 220,
          "end": 222,
          "zh": "有吗 还好吧",
          "ko": "그래? 별로 안 그런데",
          "pinyin": "yǒu ma hái hǎo ba"
        },
        {
          "start": 223,
          "end": 225.2,
          "zh": "而且你今天的热情里边",
          "ko": "그리고 오늘 너의 친절 속엔",
          "pinyin": "érqiě nǐ jīntiān de rèqíng lǐbian"
        },
        {
          "start": 226,
          "end": 228,
          "zh": "带着一丝心虚的成分",
          "ko": "왠지 찔리는 구석이 좀 섞여 있어",
          "pinyin": "dàizhe yì sī xīnxū de chéngfèn"
        },
        {
          "start": 231,
          "end": 232.5,
          "zh": "有吗",
          "ko": "그래?",
          "pinyin": "yǒu ma"
        },
        {
          "start": 232.5,
          "end": 234,
          "zh": "主要是吧",
          "ko": "그게 말이야",
          "pinyin": "zhǔyào shì ba"
        },
        {
          "start": 234,
          "end": 236,
          "zh": "我也没有做什么",
          "ko": "나도 딱히",
          "pinyin": "wǒ yě méiyǒu zuò shénme"
        },
        {
          "start": 236,
          "end": 238,
          "zh": "特别对不起你的事",
          "ko": "너한테 크게 미안할 짓을 한 건 아니야",
          "pinyin": "tèbié duìbuqǐ nǐ de shì"
        },
        {
          "start": 240,
          "end": 241,
          "zh": "干嘛去啊",
          "ko": "어디 가?",
          "pinyin": "gànmá qù a"
        },
        {
          "start": 241,
          "end": 242,
          "zh": "广播室",
          "ko": "방송실",
          "pinyin": "guǎngbōshì"
        },
        {
          "start": 242,
          "end": 243.8,
          "zh": "广播室",
          "ko": "방송실",
          "pinyin": "guǎngbōshì"
        },
        {
          "start": 245,
          "end": 246,
          "zh": "苏在在",
          "ko": "쑤짜이짜이",
          "pinyin": "sū zàizài"
        },
        {
          "start": 246,
          "end": 248,
          "zh": "咱班就你的衣服钱还没交",
          "ko": "우리 반에서 너만 옷값 아직 안 냈어",
          "pinyin": "zán bān jiù nǐ de yīfu qián hái méi jiāo"
        },
        {
          "start": 248,
          "end": 250,
          "zh": "啊 好 马上",
          "ko": "아, 응, 바로 낼게",
          "pinyin": "à hǎo mǎshàng"
        },
        {
          "start": 262,
          "end": 263.5,
          "zh": "我钱包呢",
          "ko": "내 지갑 어디 갔지?",
          "pinyin": "wǒ qiánbāo ne"
        },
        {
          "start": 267,
          "end": 268,
          "zh": "捡到个钱包",
          "ko": "지갑을 하나 주웠는데요",
          "pinyin": "jiǎndào ge qiánbāo"
        },
        {
          "start": 268,
          "end": 270,
          "zh": "有什么证件",
          "ko": "신분증 같은 거 있어요?",
          "pinyin": "yǒu shénme zhèngjiàn"
        },
        {
          "start": 271,
          "end": 272,
          "zh": "没有打开看过",
          "ko": "열어 보진 않았어요",
          "pinyin": "méiyǒu dǎkāi kàn guo"
        },
        {
          "start": 272,
          "end": 273.5,
          "zh": "得打开看一下",
          "ko": "열어 봐야겠네요",
          "pinyin": "děi dǎkāi kàn yíxià"
        },
        {
          "start": 273.5,
          "end": 276.5,
          "zh": "里边可能有证明身份的东西",
          "ko": "안에 신분을 확인할 만한 게 있을 수도 있으니까요",
          "pinyin": "lǐbian kěnéng yǒu zhèngmíng shēnfèn de dōngxi"
        },
        {
          "start": 276.5,
          "end": 278,
          "zh": "我就说让你看看吧",
          "ko": "그러니까 열어 보라고 했잖아",
          "pinyin": "wǒ jiù shuō ràng nǐ kànkan ba"
        },
        {
          "start": 278,
          "end": 279,
          "zh": "非不看",
          "ko": "끝까지 안 보더니",
          "pinyin": "fēi bú kàn"
        },
        {
          "start": 285,
          "end": 288.8,
          "zh": "我记得早上明明就放口袋里了",
          "ko": "분명히 아침에 주머니에 넣어 둔 것 같은데",
          "pinyin": "wǒ jìde zǎoshang míngmíng jiù fàng kǒudai lǐ le"
        },
        {
          "start": 288.8,
          "end": 290,
          "zh": "在在 你先别急",
          "ko": "짜이짜이, 일단 진정해",
          "pinyin": "zàizài nǐ xiān bié jí"
        },
        {
          "start": 290,
          "end": 292,
          "zh": "要不我先帮你把钱垫上",
          "ko": "아니면 내가 일단 돈 대신 내 줄게",
          "pinyin": "yàobù wǒ xiān bāng nǐ bǎ qián diàn shang"
        },
        {
          "start": 292,
          "end": 292.5,
          "zh": "然后你再",
          "ko": "그다음에 네가",
          "pinyin": "ránhòu nǐ zài"
        },
        {
          "start": 292.5,
          "end": 294.8,
          "zh": "然后我们可以去广播站播寻物启事",
          "ko": "그다음에 방송실 가서 분실물 방송을 하면 돼",
          "pinyin": "ránhòu wǒmen kěyǐ qù guǎngbōzhàn bō xúnwù qǐshì"
        },
        {
          "start": 295,
          "end": 297,
          "zh": "万一是咱同学捡到了呢",
          "ko": "혹시 우리 학교 애가 주웠을 수도 있잖아",
          "pinyin": "wànyī shì zán tóngxué jiǎndào le ne"
        },
        {
          "start": 297,
          "end": 300,
          "zh": "你学生卡有没有在钱包里呢",
          "ko": "지갑에 학생증 들어 있어?",
          "pinyin": "nǐ xuéshēngkǎ yǒu méiyǒu zài qiánbāo lǐ ne"
        },
        {
          "start": 303,
          "end": 304,
          "zh": "在的",
          "ko": "들어 있어",
          "pinyin": "zài de"
        },
        {
          "start": 305,
          "end": 306.3,
          "zh": "哎呀 那不就简单了",
          "ko": "아이고, 그럼 간단하네",
          "pinyin": "āiyā nà bú jiù jiǎndān le"
        },
        {
          "start": 306.3,
          "end": 308,
          "zh": "学生卡上又有照片又有名字的",
          "ko": "학생증에 사진도 있고 이름도 있으니까",
          "pinyin": "xuéshēngkǎ shang yòu yǒu zhàopiàn yòu yǒu míngzi de"
        },
        {
          "start": 308,
          "end": 310.2,
          "zh": "谁捡到了打开一看就知道是你的呀",
          "ko": "누가 주워서 열어 보면 바로 네 거인 줄 알 거야",
          "pinyin": "shéi jiǎndào le dǎkāi yí kàn jiù zhīdào shì nǐ de ya"
        },
        {
          "start": 310.8,
          "end": 312,
          "zh": "但是",
          "ko": "근데",
          "pinyin": "dànshì"
        },
        {
          "start": 313,
          "end": 315.4,
          "zh": "但是我学生卡",
          "ko": "근데 내 학생증에",
          "pinyin": "dànshì wǒ xuéshēngkǎ"
        },
        {
          "start": 315.4,
          "end": 318,
          "zh": "没写自己的名字",
          "ko": "내 이름을 안 썼어",
          "pinyin": "méi xiě zìjǐ de míngzi"
        },
        {
          "start": 318,
          "end": 320,
          "zh": "那你写的谁的",
          "ko": "그럼 누구 이름을 썼는데?",
          "pinyin": "nà nǐ xiě de shéi de"
        },
        {
          "start": 320,
          "end": 321,
          "zh": "就是",
          "ko": "그게",
          "pinyin": "jiùshì"
        },
        {
          "start": 323.1,
          "end": 324,
          "zh": "就是",
          "ko": "그게",
          "pinyin": "jiùshì"
        },
        {
          "start": 324,
          "end": 327,
          "zh": "现播报 失物招领一条",
          "ko": "분실물 안내 방송을 하겠습니다",
          "pinyin": "xiàn bōbào shīwù zhāolǐng yì tiáo"
        },
        {
          "start": 327.5,
          "end": 329.5,
          "zh": "附中刘亦菲同学",
          "ko": "부속고 유역비 학생",
          "pinyin": "fùzhōng liú yìfēi tóngxué"
        },
        {
          "start": 329.5,
          "end": 331,
          "zh": "附中刘亦菲同学",
          "ko": "부속고 유역비 학생",
          "pinyin": "fùzhōng liú yìfēi tóngxué"
        },
        {
          "start": 332,
          "end": 334,
          "zh": "请速来广播站",
          "ko": "지금 바로 방송실로 와서",
          "pinyin": "qǐng sù lái guǎngbōzhàn"
        },
        {
          "start": 334,
          "end": 336,
          "zh": "领取你遗失的钱包",
          "ko": "잃어버린 지갑을 찾아가세요",
          "pinyin": "lǐngqǔ nǐ yíshī de qiánbāo"
        },
        {
          "start": 336,
          "end": 338,
          "zh": "谁叫附中刘亦菲啊",
          "ko": "누가 부속고 유역비야?",
          "pinyin": "shéi jiào fùzhōng liú yìfēi a"
        },
        {
          "start": 338,
          "end": 340,
          "zh": "我还附中吴彦祖呢",
          "ko": "그럼 난 부속고 오언조다",
          "pinyin": "wǒ hái fùzhōng wú yànzǔ ne"
        },
        {
          "start": 343,
          "end": 344,
          "zh": "附中王祖贤 幸会",
          "ko": "부속고 왕조현이야, 반가워",
          "pinyin": "fùzhōng wáng zǔxián xìnghuì"
        },
        {
          "start": 345,
          "end": 346,
          "zh": "幸会",
          "ko": "반가워",
          "pinyin": "xìnghuì"
        },
        {
          "start": 347.5,
          "end": 349.5,
          "zh": "哎 那个钱包我先不找了",
          "ko": "어, 그 지갑은 일단 안 찾을래",
          "pinyin": "āi nàge qiánbāo wǒ xiān bù zhǎo le"
        },
        {
          "start": 350,
          "end": 351,
          "zh": "哎 今天天气不错",
          "ko": "아, 오늘 날씨 좋다",
          "pinyin": "āi jīntiān tiānqì búcuò"
        },
        {
          "start": 351,
          "end": 352,
          "zh": "我出去透透气",
          "ko": "나 바람 좀 쐬고 올게",
          "pinyin": "wǒ chūqu tòutou qì"
        },
        {
          "start": 353.1,
          "end": 355,
          "zh": "这么着急啊",
          "ko": "왜 이렇게 급해?",
          "pinyin": "zhème zháojí a"
        },
        {
          "start": 355,
          "end": 356.2,
          "zh": "等等",
          "ko": "잠깐만",
          "pinyin": "děngdeng"
        },
        {
          "start": 358,
          "end": 360,
          "zh": "苏在在 附中刘亦菲 是你吧",
          "ko": "쑤짜이짜이, 부속고 유역비가 너지?",
          "pinyin": "sū zàizài fùzhōng liú yìfēi shì nǐ ba"
        },
        {
          "start": 363,
          "end": 365,
          "zh": "嗯 确实是我",
          "ko": "네, 저 맞아요",
          "pinyin": "èn quèshí shì wǒ"
        },
        {
          "start": 366,
          "end": 367,
          "zh": "嗯",
          "ko": "응",
          "pinyin": "èn"
        },
        {
          "start": 371,
          "end": 372,
          "zh": "附中刘亦菲",
          "ko": "부속고 유역비",
          "pinyin": "fùzhōng liú yìfēi"
        },
        {
          "start": 377,
          "end": 380,
          "zh": "看一下钱包有没有少东西吧",
          "ko": "지갑에 없어진 거 있는지 확인해 봐",
          "pinyin": "kàn yíxià qiánbāo yǒu méiyǒu shǎo dōngxi ba"
        },
        {
          "start": 386.5,
          "end": 388,
          "zh": "张陆让 顾然",
          "ko": "장루랑, 구란",
          "pinyin": "zhāng lùràng gù rán"
        },
        {
          "start": 389,
          "end": 392,
          "zh": "所以这个钱包是他们捡的",
          "ko": "그러니까 이 지갑을 그 애들이 주운 거예요?",
          "pinyin": "suǒyǐ zhège qiánbāo shì tāmen jiǎn de"
        },
        {
          "start": 392.12,
          "end": 393.679,
          "zh": "两个男生送过来的",
          "ko": "남학생 두 명이 가져왔어",
          "pinyin": "liǎng gè nánshēng sòng guòlai de"
        },
        {
          "start": 394.039,
          "end": 395.12,
          "zh": "刚走不久",
          "ko": "간 지 얼마 안 됐어",
          "pinyin": "gāng zǒu bù jiǔ"
        },
        {
          "start": 397.039,
          "end": 398.12,
          "zh": "张陆让",
          "ko": "장루랑",
          "pinyin": "zhāng lùràng"
        },
        {
          "start": 398.12,
          "end": 399.679,
          "zh": "不是我们早上遇到的那个",
          "ko": "아침에 우리가 만난 그 애 아니야?",
          "pinyin": "bú shì wǒmen zǎoshang yùdào de nàge"
        },
        {
          "start": 399.679,
          "end": 400,
          "zh": "现在追还来得及",
          "ko": "지금 쫓아가면 아직 늦지 않았어",
          "pinyin": "xiànzài zhuī hái láidejí"
        },
        {
          "start": 400,
          "end": 401,
          "zh": "快啊",
          "ko": "빨리!",
          "pinyin": "kuài a"
        },
        {
          "start": 403,
          "end": 404,
          "zh": "在在快点",
          "ko": "짜이짜이, 빨리",
          "pinyin": "zàizài kuài diǎn"
        },
        {
          "start": 411.639,
          "end": 412.639,
          "zh": "他们在那呢",
          "ko": "저기 있다",
          "pinyin": "tāmen zài nà ne"
        },
        {
          "start": 412.639,
          "end": 413.639,
          "zh": "在在 快点",
          "ko": "짜이짜이, 빨리",
          "pinyin": "zàizài kuài diǎn"
        },
        {
          "start": 416,
          "end": 418,
          "zh": "这呢 张陆让 顾然",
          "ko": "여기 있어, 장루랑, 구란",
          "pinyin": "zhè ne zhāng lùràng gù rán"
        },
        {
          "start": 418,
          "end": 419,
          "zh": "嘿",
          "ko": "저기!",
          "pinyin": "hēi"
        },
        {
          "start": 427,
          "end": 428,
          "zh": "哎哎哎哎",
          "ko": "어어어어",
          "pinyin": "āi āi āi āi"
        },
        {
          "start": 430,
          "end": 433,
          "zh": "干嘛呢 我还没看清楚呢",
          "ko": "뭐 하는 거야, 나 아직 제대로 못 봤는데",
          "pinyin": "gànmá ne wǒ hái méi kàn qīngchu ne"
        },
        {
          "start": 434,
          "end": 435,
          "zh": "顾然",
          "ko": "구란",
          "pinyin": "gù rán"
        },
        {
          "start": 447,
          "end": 450,
          "zh": "是他 他叫顾然",
          "ko": "쟤야, 쟤가 구란이야",
          "pinyin": "shì tā tā jiào gù rán"
        },
        {
          "start": 450,
          "end": 451,
          "zh": "你认识啊",
          "ko": "아는 애야?",
          "pinyin": "nǐ rènshi a"
        },
        {
          "start": 451,
          "end": 454,
          "zh": "我之前在小卖部见过他",
          "ko": "전에 매점에서 본 적 있어",
          "pinyin": "wǒ zhīqián zài xiǎomàibù jiàn guo tā"
        },
        {
          "start": 454,
          "end": 456,
          "zh": "啊",
          "ko": "아",
          "pinyin": "à"
        }
      ],
      "updatedAt": "2026-11-01T12:49:54.104Z",
      "origin": {
        "zh": {
          "provider": "srt",
          "fileName": "당아비분향니_1주차.srt",
          "fetchedAt": "2026-11-01T08:37:21.722Z",
          "edited": true
        },
        "ko": {
          "provider": "ai",
          "fetchedAt": "2026-11-01T12:45:41.697Z"
        }
      }
    },
    "createdAt": "2026-10-29T00:00:00.000Z",
    "updatedAt": "2026-11-02T05:37:56.194Z",
    "captionMask": {
      "enabled": true,
      "top": 78,
      "height": 12,
      "width": 70
    },
    "draft": {
      "expressions": [
        {
          "id": "note-mvxtui1j-gcddka",
          "source": "下雨了 还不跑起来",
          "note": "'비가 오는데 아직도 안 뛰어?'라는 뜻이에요. '还不 + 동사'는 '아직도 ~하지 않니?'라는 뜻으로, 상대가 당연히 해야 할 행동을 하지 않을 때 답답함이나 핀잔을 담아 써요. '跑起来'의 '起来'는 동작이 시작됨을 나타내요.",
          "pinyin": "xià yǔ le hái bù pǎo qǐlai"
        },
        {
          "id": "note-mvxtui1j-22xyrm",
          "source": "看看几点了 叫什么",
          "note": "'지금 몇 시인지 봐. 이름이 뭐야?'라는 뜻이에요. 지각한 학생을 붙잡은 선배가 꾸짖듯 묻는 말이에요. '看看'처럼 동사를 겹쳐 쓰면 '좀 ~해 봐'라는 가벼운 어감이 되고, '叫什么(名字)'는 이름을 묻는 가장 기본적인 표현이에요.",
          "pinyin": "kànkan jǐ diǎn le jiào shénme"
        },
        {
          "id": "note-mvxtui1j-q6ln8c",
          "source": "别磨蹭了",
          "note": "'꾸물거리지 마'라는 뜻이에요. '磨蹭'은 '꾸물대다, 늑장 부리다'라는 뜻이고, '别…了'는 '그만 ~해'라고 지금 하고 있는 행동을 멈추라고 할 때 써요. 지각할까 봐 친구를 재촉하는 장면에 어울리는 표현이에요.",
          "pinyin": "bié móceng le"
        },
        {
          "id": "note-mvxtui1j-0pc7vf",
          "source": "幸会",
          "note": "'만나서 반갑습니다'라는 뜻의 인사말이에요. 처음 만난 사람에게 쓰는 다소 격식 있는 표현인데, 이 장면에서는 서로 연예인 이름을 대며 장난스럽게 주고받아 웃음을 줘요. 일상에서는 '很高兴认识你'를 더 자주 써요.",
          "pinyin": "xìnghuì"
        },
        {
          "id": "note-mvxtui1j-biwmiq",
          "source": "我出去透透气",
          "note": "'나 바람 좀 쐬고 올게'라는 뜻이에요. '透气'는 '숨을 돌리다, 바람을 쐬다'라는 뜻이고, '透透气'처럼 겹쳐 쓰면 '잠깐 좀'이라는 가벼운 느낌이 돼요. 이 장면에서는 창피한 상황을 피하려는 핑계로 쓰였어요.",
          "pinyin": "wǒ chūqu tòutou qì"
        }
      ],
      "grammar": [
        {
          "id": "note-mvxtui1j-7k5m1v",
          "source": "迟到了 在学校门口被值日生拦下了",
          "note": "'A + 被 + B + 동사'는 'A가 B에게 ~당하다'라는 피동문이에요. 여기서는 '(내가) 당번 학생에게 붙잡혔다'라는 뜻이에요. 주로 좋지 않은 일을 당했을 때 많이 써요. 예문: 我的钱包被偷了。(내 지갑을 도둑맞았어요.)",
          "pinyin": "chídào le zài xuéxiào ménkǒu bèi zhírìshēng lán xià le"
        },
        {
          "id": "note-mvxtui1j-28eqjj",
          "source": "得打开看一下",
          "note": "'得(děi)'는 '~해야 한다'라는 뜻으로 구어에서 많이 써요. '동사 + 一下'는 '한번 ~해 보다, 좀 ~하다'라는 뜻으로 말투를 부드럽게 해요. 예문: 我得回家一下。(나 집에 좀 다녀와야 해.)",
          "pinyin": "děi dǎkāi kàn yíxià"
        },
        {
          "id": "note-mvxtui1j-swneb1",
          "source": "你学生卡有没有在钱包里呢",
          "note": "'有没有'처럼 긍정형과 부정형을 이어 붙이면 '~했니, 안 했니?'라는 정반의문문이 돼요. 문장 끝에 '吗'를 붙이지 않는다는 점에 주의하세요. 예문: 你有没有时间？(너 시간 있어, 없어?)",
          "pinyin": "nǐ xuéshēngkǎ yǒu méiyǒu zài qiánbāo lǐ ne"
        },
        {
          "id": "note-mvxtui1j-tv4o37",
          "source": "为什么走着淋雨啊",
          "note": "'동사1 + 着 + 동사2'는 '~한 채로 ~하다'라는 뜻으로, 앞 동작이 뒤 동작의 방식이나 상태를 나타내요. '走着淋雨'는 '걸으면서 비를 맞다'라는 뜻이에요. 예문: 他笑着说。(그는 웃으면서 말했어요.)",
          "pinyin": "wèishénme zǒuzhe lín yǔ a"
        },
        {
          "id": "note-mvxtui1j-tkv7en",
          "source": "学生卡上又有照片又有名字的",
          "note": "'又A又B'는 'A하기도 하고 B하기도 하다'라는 뜻으로, 두 가지 성질이나 상황을 함께 말할 때 써요. 여기서는 '학생증에 사진도 있고 이름도 있다'라는 뜻이에요. 예문: 这家店的菜又便宜又好吃。(이 가게 음식은 싸고 맛있어요.)",
          "pinyin": "xuéshēngkǎ shang yòu yǒu zhàopiàn yòu yǒu míngzi de"
        }
      ],
      "lenses": [
        {
          "id": "lens-mvxtui1j-gq8x9u",
          "title": "'附中刘亦菲' — 스타 이름으로 하는 자기 농담",
          "source": "附中刘亦菲同学",
          "text": "'附中'은 '附属中学'의 줄임말로, 대학교에 딸린 부속 중·고등학교를 말해요. 중국에서는 명문대 부속고가 인기 있는 학교로 꼽혀요. 刘亦菲(유역비)는 아름다움의 상징처럼 여겨지는 배우이고, 吴彦祖(오언조)와 王祖贤(왕조현) 역시 미남·미녀의 대명사로 통하는 스타예요. 중국 젊은이들 사이에서는 '○○의 吴彦祖'처럼 자신이나 친구를 유명 스타에 빗대어 부르는 농담이 흔한데, 진지한 자랑이라기보다 일부러 과장해서 웃음을 주는 말이에요. 그래서 학생증에 '附中刘亦菲'라고 써 둔 사실이 방송으로 퍼지자 쑤짜이짜이가 몹시 민망해하는 거예요."
        }
      ],
      "quiz": [
        {
          "id": "quiz-mvxtui1j-gg3h85",
          "question": "'下雨了 还不跑起来'의 뜻으로 가장 알맞은 것은?",
          "options": [
            "비가 그쳤으니 이제 뛰자.",
            "비가 오는데 아직도 안 뛰어?",
            "비가 오니까 뛰지 마.",
            "비가 오기 전에 뛰어야 해."
          ],
          "answer": 1,
          "explanation": "'下雨了'는 '비가 온다', '还不 + 동사'는 '아직도 ~하지 않니?'라는 핀잔의 뜻이에요. 비를 맞으며 걷는 사람에게 왜 뛰지 않느냐고 하는 말이에요."
        },
        {
          "id": "quiz-mvxtui1j-b26nvz",
          "question": "'在学校门口被值日生拦下了'에서 주인공을 붙잡은 사람은 누구인가요?",
          "options": [
            "담임 선생님",
            "같은 반 친구",
            "매점 아주머니",
            "당번 학생"
          ],
          "answer": 3,
          "explanation": "'被 + B + 동사'는 'B에게 ~당하다'라는 피동문이에요. '值日生'은 당번 학생이므로, 교문에서 당번 학생에게 붙잡혔다는 뜻이에요."
        },
        {
          "id": "quiz-mvxtui1k-n3stnv",
          "question": "'幸会'는 어떤 상황에서 쓰는 말인가요?",
          "options": [
            "처음 만난 사람에게 반갑다고 인사할 때",
            "헤어지면서 작별 인사를 할 때",
            "상대에게 사과할 때",
            "상대에게 고맙다고 할 때"
          ],
          "answer": 0,
          "explanation": "'幸会'는 '만나서 반갑습니다'라는 뜻의 인사말이에요. 이 장면에서는 서로 스타 이름을 대며 장난스럽게 썼어요."
        },
        {
          "id": "quiz-mvxtui1k-2s213o",
          "question": "쑤짜이짜이가 갑자기 '那个钱包我先不找了'라며 지갑 찾기를 그만두려 한 이유는 무엇인가요?",
          "options": [
            "지갑 안에 돈이 없어서",
            "지갑을 이미 찾아서",
            "학생증에 '附中刘亦菲'라고 써 둔 게 방송돼서 민망해서",
            "수업에 늦을까 봐 걱정돼서"
          ],
          "answer": 2,
          "explanation": "학생증에 자기 이름 대신 '附中刘亦菲'라고 적어 두었는데, 그 이름이 방송으로 불리자 창피해서 지갑을 안 찾겠다며 자리를 피하려 한 거예요."
        },
        {
          "id": "quiz-mvxtui1k-f2jv04",
          "question": "'你学生卡有没有在钱包里呢'와 같은 의문문 형식은 무엇인가요?",
          "options": [
            "'吗'를 붙이는 일반 의문문",
            "긍정형과 부정형을 붙인 정반의문문",
            "'还是'를 쓰는 선택의문문",
            "의문사 '什么'를 쓰는 의문문"
          ],
          "answer": 1,
          "explanation": "'有没有'처럼 긍정형 '有'와 부정형 '没有'를 이어 붙인 정반의문문이에요. 이 형식에는 문장 끝에 '吗'를 붙이지 않아요."
        }
      ],
      "level": "",
      "createdAt": "2026-11-01T12:49:38.264Z",
      "updatedAt": "2026-11-01T12:49:38.264Z"
    },
    "dialogues": [
      {
        "id": "dialogue-mvytv4bi-rzhz7y",
        "title": "지각 상황을 묻고 설명하기",
        "situation": "친구가 평소보다 늦게 온 이유를 묻고, 지각 상황과 학교 규칙에 대해 이야기하는 장면이에요.",
        "roles": [
          {
            "id": "role-mvytv4bi-kjrebn",
            "name": "구란"
          },
          {
            "id": "role-mvytv4bi-dj1ulp",
            "name": "장루랑"
          }
        ],
        "lines": [
          {
            "id": "line-mvytv4bi-l53gzb",
            "roleId": "role-mvytv4bi-kjrebn",
            "cueId": "cue-mvytv4bi-5xmm9l",
            "zh": "今天怎么这么晚",
            "pinyin": "jīntiān zěnme zhème wǎn",
            "ko": "오늘은 왜 이렇게 늦었어?",
            "start": 190,
            "end": 191
          },
          {
            "id": "line-mvytv4bi-vs26z2",
            "roleId": "role-mvytv4bi-dj1ulp",
            "cueId": "cue-mvytv4bi-5qrdvy",
            "zh": "迟到了 在学校门口被值日生拦下了",
            "pinyin": "chídào le zài xuéxiào ménkǒu bèi zhírìshēng lán xià le",
            "ko": "지각했어. 교문에서 당번한테 붙잡혔어",
            "start": 191,
            "end": 194
          },
          {
            "id": "line-mvytv4bi-4k0tjx",
            "roleId": "role-mvytv4bi-kjrebn",
            "cueId": "cue-mvytv4bi-zra9sa",
            "zh": "啊",
            "pinyin": "á",
            "ko": "아?",
            "start": 194,
            "end": 195
          },
          {
            "id": "line-mvytv4bi-ejdwaa",
            "roleId": "role-mvytv4bi-kjrebn",
            "cueId": "cue-mvytv4bi-jev5e9",
            "zh": "那 那怎么办",
            "pinyin": "nà nà zěnme bàn",
            "ko": "그럼 어떡해?",
            "start": 195,
            "end": 198
          },
          {
            "id": "line-mvytv4bi-9fc22z",
            "roleId": "role-mvytv4bi-dj1ulp",
            "cueId": "cue-mvytv4bi-5rfovg",
            "zh": "很紧张",
            "pinyin": "hěn jǐnzhāng",
            "ko": "되게 긴장하네",
            "start": 198,
            "end": 199
          },
          {
            "id": "line-mvytv4bi-6dambl",
            "roleId": "role-mvytv4bi-kjrebn",
            "cueId": "cue-mvytv4bi-s3390t",
            "zh": "啊 没事啊",
            "pinyin": "à méishì a",
            "ko": "아, 아니야",
            "start": 200,
            "end": 202
          },
          {
            "id": "line-mvytv4bi-7d5bou",
            "roleId": "role-mvytv4bi-kjrebn",
            "cueId": "cue-mvytv4bi-w27d0u",
            "zh": "这不关心你吗",
            "pinyin": "zhè bú guānxīn nǐ ma",
            "ko": "걱정돼서 그러지",
            "start": 202,
            "end": 204
          },
          {
            "id": "line-mvytv4bi-tbbm45",
            "roleId": "role-mvytv4bi-kjrebn",
            "cueId": "cue-mvytv4bi-fy2ncj",
            "zh": "主要是我听说",
            "pinyin": "zhǔyào shì wǒ tīngshuō",
            "ko": "그게, 내가 듣기로는",
            "start": 204,
            "end": 205
          },
          {
            "id": "line-mvytv4bi-5sq7v5",
            "roleId": "role-mvytv4bi-kjrebn",
            "cueId": "cue-mvytv4bi-0bqwkh",
            "zh": "咱们学校如果迟到的话会被记名字的",
            "pinyin": "zánmen xuéxiào rúguǒ chídào dehuà huì bèi jì míngzi de",
            "ko": "우리 학교는 지각하면 이름 적힌다던데",
            "start": 205,
            "end": 207.7
          },
          {
            "id": "line-mvytv4bi-xy1rug",
            "roleId": "role-mvytv4bi-dj1ulp",
            "cueId": "cue-mvytv4bi-jrshct",
            "zh": "没记我",
            "pinyin": "méi jì wǒ",
            "ko": "나 안 적혔어",
            "start": 207.7,
            "end": 208.7
          },
          {
            "id": "line-mvytv4bi-m8ut8w",
            "roleId": "role-mvytv4bi-kjrebn",
            "cueId": "cue-mvytv4bi-iy5xk5",
            "zh": "啊 没记你啊",
            "pinyin": "à méi jì nǐ a",
            "ko": "아, 안 적혔구나",
            "start": 209,
            "end": 211
          },
          {
            "id": "line-mvytv4bi-ieae95",
            "roleId": "role-mvytv4bi-kjrebn",
            "cueId": "cue-mvytv4bi-ejxb9u",
            "zh": "那就好 差点出现两个张陆让",
            "pinyin": "nà jiù hǎo chàdiǎn chūxiàn liǎng gè zhāng lùràng",
            "ko": "다행이다. 하마터면 장루랑이 두 명 될 뻔했네",
            "start": 213,
            "end": 215.4
          }
        ],
        "status": "published"
      }
    ]
  },
  {
    "id": "course-campus-w02",
    "courseId": "course-campus",
    "week": 2,
    "title": "친구를 돕고 응원하기",
    "description": "",
    "direction": "zh-ko",
    "level": "",
    "status": "draft",
    "video": {
      "youtubeUrl": "https://www.youtube.com/watch?v=EXUSxAKaLmI",
      "youtubeId": "EXUSxAKaLmI",
      "startTime": 0,
      "endTime": 0
    },
    "source": {
      "dramaTitle": "当我飞奔向你",
      "episode": "",
      "videoTitle": "苏在在被男生欺负，张陆让赢下篮球赛为她出头"
    },
    "script": {
      "source": "srt",
      "cues": [],
      "updatedAt": null
    },
    "createdAt": "2026-10-29T00:00:00.000Z",
    "updatedAt": "2026-10-29T00:00:00.000Z"
  },
  {
    "id": "course-campus-w03",
    "courseId": "course-campus",
    "week": 3,
    "title": "함께 가기와 동행 제안하기",
    "description": "",
    "direction": "zh-ko",
    "level": "",
    "status": "draft",
    "video": {
      "youtubeUrl": "https://www.youtube.com/watch?v=Ca3Hym5ASU0",
      "youtubeId": "Ca3Hym5ASU0",
      "startTime": 0,
      "endTime": 0
    },
    "source": {
      "dramaTitle": "当我飞奔向你",
      "episode": "",
      "videoTitle": "张陆让陪苏在在一起走夜路"
    },
    "script": {
      "source": "srt",
      "cues": [],
      "updatedAt": null
    },
    "createdAt": "2026-10-29T00:00:00.000Z",
    "updatedAt": "2026-10-29T00:00:00.000Z"
  },
  {
    "id": "course-campus-w04",
    "courseId": "course-campus",
    "week": 4,
    "title": "선택과 의견 표현하기",
    "description": "",
    "direction": "zh-ko",
    "level": "",
    "status": "draft",
    "video": {
      "youtubeUrl": "https://youtu.be/1TpuMnIGhE4",
      "youtubeId": "1TpuMnIGhE4",
      "startTime": 0,
      "endTime": 0
    },
    "source": {
      "dramaTitle": "当我飞奔向你",
      "episode": "",
      "videoTitle": "苏在在竞选灰姑娘角色，张陆让投票给在在却死不承认"
    },
    "script": {
      "source": "srt",
      "cues": [],
      "updatedAt": null
    },
    "createdAt": "2026-10-29T00:00:00.000Z",
    "updatedAt": "2026-10-29T00:00:00.000Z"
  },
  {
    "id": "course-campus-w05",
    "courseId": "course-campus",
    "week": 5,
    "title": "생일 축하와 감사",
    "description": "",
    "direction": "zh-ko",
    "level": "",
    "status": "draft",
    "video": {
      "youtubeUrl": "https://www.youtube.com/watch?v=yhJZPFkK4ls",
      "youtubeId": "yhJZPFkK4ls",
      "startTime": 0,
      "endTime": 0
    },
    "source": {
      "dramaTitle": "当我飞奔向你",
      "episode": "",
      "videoTitle": "张陆让准备生日礼物，小伙伴们给苏在在生日惊喜"
    },
    "script": {
      "source": "srt",
      "cues": [],
      "updatedAt": null
    },
    "createdAt": "2026-10-29T00:00:00.000Z",
    "updatedAt": "2026-10-29T00:00:00.000Z"
  },
  {
    "id": "course-campus-w06",
    "courseId": "course-campus",
    "week": 6,
    "title": "공부와 도움 요청하기",
    "description": "",
    "direction": "zh-ko",
    "level": "",
    "status": "draft",
    "video": {
      "youtubeUrl": "https://youtu.be/WiHQF126-V8",
      "youtubeId": "WiHQF126-V8",
      "startTime": 0,
      "endTime": 0
    },
    "source": {
      "dramaTitle": "当我飞奔向你",
      "episode": "",
      "videoTitle": "苏在在主动邀约张陆让补课"
    },
    "script": {
      "source": "srt",
      "cues": [],
      "updatedAt": null
    },
    "createdAt": "2026-10-29T00:00:00.000Z",
    "updatedAt": "2026-10-29T00:00:00.000Z"
  },
  {
    "id": "course-campus-w07",
    "courseId": "course-campus",
    "week": 7,
    "title": "호의와 이유 표현하기",
    "description": "",
    "direction": "zh-ko",
    "level": "",
    "status": "draft",
    "video": {
      "youtubeUrl": "https://www.youtube.com/watch?v=z50hQlKQVXw",
      "youtubeId": "z50hQlKQVXw",
      "startTime": 0,
      "endTime": 0
    },
    "source": {
      "dramaTitle": "当我飞奔向你",
      "episode": "",
      "videoTitle": "张陆让雨夜专程给苏在在送伞却嘴硬不愿承认"
    },
    "script": {
      "source": "srt",
      "cues": [],
      "updatedAt": null
    },
    "createdAt": "2026-10-29T00:00:00.000Z",
    "updatedAt": "2026-10-29T00:00:00.000Z"
  },
  {
    "id": "course-campus-w08",
    "courseId": "course-campus",
    "week": 8,
    "title": "상태 묻기와 친구 돌보기",
    "description": "",
    "direction": "zh-ko",
    "level": "",
    "status": "draft",
    "video": {
      "youtubeUrl": "https://www.youtube.com/watch?v=jMSiaSgsEtY",
      "youtubeId": "jMSiaSgsEtY",
      "startTime": 0,
      "endTime": 0
    },
    "source": {
      "dramaTitle": "当我飞奔向你",
      "episode": "",
      "videoTitle": "姜佳照顾生病的顾然"
    },
    "script": {
      "source": "srt",
      "cues": [],
      "updatedAt": null
    },
    "createdAt": "2026-10-29T00:00:00.000Z",
    "updatedAt": "2026-10-29T00:00:00.000Z"
  },
  {
    "id": "course-campus-w09",
    "courseId": "course-campus",
    "week": 9,
    "title": "공공장소 곤란 상황 대응",
    "description": "",
    "direction": "zh-ko",
    "level": "",
    "status": "draft",
    "video": {
      "youtubeUrl": "https://youtu.be/AoA-guQvuJ0",
      "youtubeId": "AoA-guQvuJ0",
      "startTime": 0,
      "endTime": 0
    },
    "source": {
      "dramaTitle": "当我飞奔向你",
      "episode": "",
      "videoTitle": "公交车上偶遇猥琐大叔，张陆让为苏在在出头"
    },
    "script": {
      "source": "srt",
      "cues": [],
      "updatedAt": null
    },
    "createdAt": "2026-10-29T00:00:00.000Z",
    "updatedAt": "2026-10-29T00:00:00.000Z"
  },
  {
    "id": "course-campus-w10",
    "courseId": "course-campus",
    "week": 10,
    "title": "서운함과 이유 묻기",
    "description": "",
    "direction": "zh-ko",
    "level": "",
    "status": "draft",
    "video": {
      "youtubeUrl": "https://www.youtube.com/watch?v=B8Yd507kL9I",
      "youtubeId": "B8Yd507kL9I",
      "startTime": 0,
      "endTime": 0
    },
    "source": {
      "dramaTitle": "当我飞奔向你",
      "episode": "",
      "videoTitle": "苏在在发现张陆让转学没有告诉她"
    },
    "script": {
      "source": "srt",
      "cues": [],
      "updatedAt": null
    },
    "createdAt": "2026-10-29T00:00:00.000Z",
    "updatedAt": "2026-10-29T00:00:00.000Z"
  },
  {
    "id": "course-campus-w11",
    "courseId": "course-campus",
    "week": 11,
    "title": "재회와 반가움",
    "description": "",
    "direction": "zh-ko",
    "level": "",
    "status": "draft",
    "video": {
      "youtubeUrl": "https://www.youtube.com/watch?v=i_WSKKHZH2Y",
      "youtubeId": "i_WSKKHZH2Y",
      "startTime": 0,
      "endTime": 0
    },
    "source": {
      "dramaTitle": "当我飞奔向你",
      "episode": "",
      "videoTitle": "“苏在在，回头！”张陆让与苏在在重逢"
    },
    "script": {
      "source": "srt",
      "cues": [],
      "updatedAt": null
    },
    "createdAt": "2026-10-29T00:00:00.000Z",
    "updatedAt": "2026-10-29T00:00:00.000Z"
  },
  {
    "id": "course-campus-w12",
    "courseId": "course-campus",
    "week": 12,
    "title": "두려움과 안심",
    "description": "",
    "direction": "zh-ko",
    "level": "",
    "status": "draft",
    "video": {
      "youtubeUrl": "https://www.youtube.com/watch?v=SQc_xiC91mk",
      "youtubeId": "SQc_xiC91mk",
      "startTime": 0,
      "endTime": 0
    },
    "source": {
      "dramaTitle": "当我飞奔向你",
      "episode": "",
      "videoTitle": "苏在在走夜路害怕，张陆让及时出现"
    },
    "script": {
      "source": "srt",
      "cues": [],
      "updatedAt": null
    },
    "createdAt": "2026-10-29T00:00:00.000Z",
    "updatedAt": "2026-10-29T00:00:00.000Z"
  },
  {
    "id": "course-campus-w13",
    "courseId": "course-campus",
    "week": 13,
    "title": "위로와 마음 표현",
    "description": "",
    "direction": "zh-ko",
    "level": "",
    "status": "draft",
    "video": {
      "youtubeUrl": "https://www.youtube.com/watch?v=mu0n09BwhPU",
      "youtubeId": "mu0n09BwhPU",
      "startTime": 0,
      "endTime": 0
    },
    "source": {
      "dramaTitle": "当我飞奔向你",
      "episode": "",
      "videoTitle": "让让轻轻抱抱害怕的在在，苏在在甜蜜告白“我觉得让让更好”"
    },
    "script": {
      "source": "srt",
      "cues": [],
      "updatedAt": null
    },
    "createdAt": "2026-10-29T00:00:00.000Z",
    "updatedAt": "2026-10-29T00:00:00.000Z"
  },
  {
    "id": "course-campus-w14",
    "courseId": "course-campus",
    "week": 14,
    "title": "솔직한 감정 표현",
    "description": "",
    "direction": "zh-ko",
    "level": "",
    "status": "draft",
    "video": {
      "youtubeUrl": "https://www.youtube.com/watch?v=1qqekOlp_Dk",
      "youtubeId": "1qqekOlp_Dk",
      "startTime": 0,
      "endTime": 0
    },
    "source": {
      "dramaTitle": "当我飞奔向你",
      "episode": "",
      "videoTitle": "苏在在对张陆让直球说“我想要你”"
    },
    "script": {
      "source": "srt",
      "cues": [],
      "updatedAt": null
    },
    "createdAt": "2026-10-29T00:00:00.000Z",
    "updatedAt": "2026-10-29T00:00:00.000Z"
  },
  {
    "id": "course-campus-w15",
    "courseId": "course-campus",
    "week": 15,
    "title": "안심시키고 약속하기",
    "description": "",
    "direction": "zh-ko",
    "level": "",
    "status": "draft",
    "video": {
      "youtubeUrl": "https://www.youtube.com/watch?v=SWbbyNKRHnc",
      "youtubeId": "SWbbyNKRHnc",
      "startTime": 0,
      "endTime": 0
    },
    "source": {
      "dramaTitle": "当我飞奔向你",
      "episode": "",
      "videoTitle": "苏在在：“张陆让，你放心，我会对你负责到底的”"
    },
    "script": {
      "source": "srt",
      "cues": [],
      "updatedAt": null
    },
    "createdAt": "2026-10-29T00:00:00.000Z",
    "updatedAt": "2026-10-29T00:00:00.000Z"
  },
  {
    "id": "lesson-yjrzm-ep3",
    "week": 1,
    "title": "가족의 일상 속 실생활 표현",
    "direction": "zh-ko",
    "level": "hsk4",
    "status": "ready",
    "description": "가족의 일상 속에서 배우는 실생활 중국어와 가족문화",
    "video": {
      "youtubeUrl": "https://youtu.be/_Ahf8DxMxcs",
      "youtubeId": "_Ahf8DxMxcs",
      "startTime": 120,
      "endTime": 626
    },
    "source": {
      "dramaTitle": "以家人之名",
      "episode": "第3集"
    },
    "script": {
      "source": "bundled",
      "cues": [
        {
          "start": 143.9,
          "end": 145.6,
          "ko": "너 왜 이렇게 입었어?",
          "zh": "你怎么穿成这样啊"
        },
        {
          "start": 148,
          "end": 149.8,
          "ko": "오늘 나 개학 첫날이잖아.",
          "zh": "今天我第一天开学"
        },
        {
          "start": 149.9,
          "end": 151.5,
          "ko": "나 이거 입고 가려고.",
          "zh": "我准备穿着这身去"
        },
        {
          "start": 151.8,
          "end": 154.6,
          "ko": "엄청 세 보여 보이지?",
          "zh": "看起来是不是很厉害"
        },
        {
          "start": 155.8,
          "end": 157.2,
          "ko": "엄청 세 보여.",
          "zh": "太厉害了"
        },
        {
          "start": 157.4,
          "end": 158.5,
          "ko": "바로 그거야.",
          "zh": "这就对了"
        },
        {
          "start": 158.5,
          "end": 160.2,
          "ko": "내가 원한 게 바로 그 효과야.",
          "zh": "要的就是这效果"
        },
        {
          "start": 162.1,
          "end": 163.8,
          "ko": "내가 곰곰이 생각해 봤는데",
          "zh": "我仔细琢磨了一下"
        },
        {
          "start": 163.9,
          "end": 166.1,
          "ko": "나 우리 반에서 성적이 뒤에서 두 번째잖아.",
          "zh": "我在我们班成绩是 倒数第二"
        },
        {
          "start": 166.1,
          "end": 168.9,
          "ko": "친구들이 나를 괴롭히거나 무시하는 걸 막기 위해서",
          "zh": "为了防止同学欺负我 歧视我"
        },
        {
          "start": 168.9,
          "end": 176.3,
          "ko": "내가 먼저 기선을 제압하기로 했어.",
          "zh": "我决定 先下手为强"
        },
        {
          "start": 176.5,
          "end": 179.8,
          "ko": "내가 만만한 애가 아니라는 인상을 남기려고.",
          "zh": "给他们留下一个 不好惹的印象"
        },
        {
          "start": 182.4,
          "end": 185.6,
          "ko": "거꾸로 맸어. 반대야.",
          "zh": "系反了 反了"
        },
        {
          "start": 185.9,
          "end": 186.9,
          "ko": "응.",
          "zh": "嗯"
        },
        {
          "start": 191.9,
          "end": 194.1,
          "ko": "안 중요해. 안 중요해.",
          "zh": "不重要 不重要"
        },
        {
          "start": 194.3,
          "end": 195.4,
          "ko": "리젠젠, 내가 말해두는데",
          "zh": "李尖尖我告诉你"
        },
        {
          "start": 195.5,
          "end": 197.3,
          "ko": "학교에서 누가 너 괴롭히면",
          "zh": "你要是在学校被欺负了"
        },
        {
          "start": 197.4,
          "end": 198.6,
          "ko": "작은 오빠한테 말해.",
          "zh": "跟小哥讲"
        },
        {
          "start": 198.7,
          "end": 200.2,
          "ko": "내가 아주 혼내줄게.",
          "zh": "小哥揍死他"
        },
        {
          "start": 200.3,
          "end": 201.9,
          "ko": "예! 예!",
          "zh": "耶 耶"
        },
        {
          "start": 203.9,
          "end": 205.8,
          "ko": "리 아빠가 방금 젠젠 데리고 사고 치지 말라고 했잖아.",
          "zh": "李爸刚说不准 带李尖尖惹事"
        },
        {
          "start": 205.8,
          "end": 206.8,
          "ko": "못 들었어?",
          "zh": "没听见啊"
        },
        {
          "start": 215.9,
          "end": 216.9,
          "ko": "밥 먹어.",
          "zh": "吃饭"
        },
        {
          "start": 221.1,
          "end": 223.1,
          "ko": "너 그 옷 어디서 났어?",
          "zh": "你这一身衣服哪来的啊"
        },
        {
          "start": 223.2,
          "end": 226.5,
          "ko": "여름방학 동안 돈 모아서 산 거야.",
          "zh": "暑假攒 暑假攒钱买的"
        },
        {
          "start": 228.5,
          "end": 231.3,
          "ko": "너 학교 가는 거야, 아니면 산적 두목 하러 가는 거야?",
          "zh": "你是要上学去啊 还是当座山雕去啊"
        },
        {
          "start": 232,
          "end": 235.9,
          "ko": "가서 갈아입어. 교복으로.",
          "zh": "换了去 换校服"
        },
        {
          "start": 238.1,
          "end": 239.2,
          "ko": "당장.",
          "zh": "马上"
        },
        {
          "start": 252.2,
          "end": 253.4,
          "ko": "만만하지 않지.",
          "zh": "不好惹"
        },
        {
          "start": 262.9,
          "end": 266.6,
          "ko": "오늘 날씨 참 좋네.",
          "zh": "这一天天气真好"
        },
        {
          "start": 266.7,
          "end": 267.7,
          "ko": "젠젠아.",
          "zh": "小尖尖"
        },
        {
          "start": 267.8,
          "end": 269.8,
          "ko": "첸 할머니.",
          "zh": "钱婆婆"
        },
        {
          "start": 270.4,
          "end": 271.5,
          "ko": "개학했구나?",
          "zh": "开学了啊"
        },
        {
          "start": 271.5,
          "end": 271.9,
          "ko": "네.",
          "zh": "嗯"
        },
        {
          "start": 271.9,
          "end": 273.8,
          "ko": "아이고, 공부 열심히 해.",
          "zh": "哎呀 好好学习啊"
        },
        {
          "start": 274,
          "end": 275.5,
          "ko": "링샤오 오빠 본받고",
          "zh": "向你凌霄哥哥学"
        },
        {
          "start": 275.6,
          "end": 276.6,
          "ko": "1등 하도록 노력해야지.",
          "zh": "争取考第一"
        },
        {
          "start": 276.8,
          "end": 277.7,
          "ko": "네.",
          "zh": "好"
        },
        {
          "start": 278.9,
          "end": 280.3,
          "ko": "누가 쯔추야?",
          "zh": "哪个是子秋啊"
        },
        {
          "start": 280.5,
          "end": 281.4,
          "ko": "저요.",
          "zh": "我是"
        },
        {
          "start": 281.6,
          "end": 282.8,
          "ko": "할머니는 누구세요?",
          "zh": "婆婆你是谁啊"
        },
        {
          "start": 283.1,
          "end": 285.9,
          "ko": "아, 이분은 주펑 아주머니의 어머니셔.",
          "zh": "哦 她是哪个 朱鹏婶子的妈妈"
        },
        {
          "start": 285.9,
          "end": 287.1,
          "ko": "산후조리 도와주러 오셨어.",
          "zh": "来伺候月子的"
        },
        {
          "start": 287.3,
          "end": 289.2,
          "ko": "너희는 장 할머니라고 부르면 돼.",
          "zh": "你们要叫她张婆婆"
        },
        {
          "start": 289.3,
          "end": 291,
          "ko": "안녕하세요, 장 할머니. 안녕하세요, 장 할머니.",
          "zh": "张婆婆好 张婆婆好"
        },
        {
          "start": 291.1,
          "end": 292.9,
          "ko": "착하네. 참 착해.",
          "zh": "乖 真好"
        },
        {
          "start": 293.2,
          "end": 295.9,
          "ko": "얘들아, 너희는 엄마가 보고 싶니?",
          "zh": "孩子们 你们都想妈妈吗"
        },
        {
          "start": 306.1,
          "end": 307.5,
          "ko": "내가 말실수했나?",
          "zh": "我说错话了吗"
        },
        {
          "start": 323.3,
          "end": 324.4,
          "ko": "안으로 들어오세요.",
          "zh": "里边请"
        },
        {
          "start": 326.4,
          "end": 327.6,
          "ko": "어머, 하이차오 오빠.",
          "zh": "呦 海潮哥"
        },
        {
          "start": 328.3,
          "end": 329.2,
          "ko": "바쁘시네요.",
          "zh": "忙着呢"
        },
        {
          "start": 329.3,
          "end": 332.8,
          "ko": "아이고, 오기 전에 연락이라도 좀 하지 그랬어.",
          "zh": "哎呦 你说你这 来之前也不 打声招呼呢"
        },
        {
          "start": 333,
          "end": 335.2,
          "ko": "오리 새끼 좀 사려고 시내에 왔다가",
          "zh": "来城里啊 买点鸭苗"
        },
        {
          "start": 335.2,
          "end": 336.8,
          "ko": "오는 길에 너희한테 시골에서 난 것 좀 가져왔어.",
          "zh": "顺利啊 给你们 送点山货"
        },
        {
          "start": 336.9,
          "end": 339.5,
          "ko": "매번 올 때마다 이렇게 챙겨오고, 정말.",
          "zh": "你看你 你说每次来 你都破费 你真是"
        },
        {
          "start": 339.5,
          "end": 340.6,
          "ko": "형님은?",
          "zh": "大哥呢"
        },
        {
          "start": 340.6,
          "end": 341.5,
          "ko": "오리 새끼 사러 갔어.",
          "zh": "买鸭苗去了"
        },
        {
          "start": 341.5,
          "end": 342.2,
          "ko": "그이는 여기 안 올 거야.",
          "zh": "他就不过来了"
        },
        {
          "start": 342.3,
          "end": 343.6,
          "ko": "아. 응.",
          "zh": "奥 嗯"
        },
        {
          "start": 343.6,
          "end": 344.5,
          "ko": "그래, 안에 들어가서 앉아.",
          "zh": "行 里 里面坐"
        },
        {
          "start": 344.5,
          "end": 345,
          "ko": "응.",
          "zh": "哎"
        },
        {
          "start": 345,
          "end": 345.7,
          "ko": "아직 밥 안 먹었지?",
          "zh": "没吃呢吧"
        },
        {
          "start": 345.7,
          "end": 346.5,
          "ko": "국수 한 그릇 해줄게.",
          "zh": "给你煮碗面"
        },
        {
          "start": 346.5,
          "end": 348.3,
          "ko": "먹었어, 먹었어. 번거롭게 하지 마.",
          "zh": "吃过了吃过了 不麻烦"
        },
        {
          "start": 348.3,
          "end": 349.9,
          "ko": "나 잠깐 있다가 갈 거야.",
          "zh": "我呀 坐一会就走了"
        },
        {
          "start": 350.7,
          "end": 353.3,
          "ko": "하이차오 오빠네 시골 친척이에요?",
          "zh": "这是海潮哥的 哪个乡下亲戚啊"
        },
        {
          "start": 353.4,
          "end": 354.6,
          "ko": "쯔추 둘째 이모야.",
          "zh": "子秋他二姨"
        },
        {
          "start": 354.6,
          "end": 355.9,
          "ko": "자주 와.",
          "zh": "经常来的"
        },
        {
          "start": 356.1,
          "end": 358.4,
          "ko": "저 사람도 정말 쯔추 엄마가 어디 갔는지 모르는 거야?",
          "zh": "她真不知道 子秋的妈去哪了"
        },
        {
          "start": 358.7,
          "end": 361.3,
          "ko": "이렇게 오랫동안 아무 소식도 없고?",
          "zh": "这么多年 就一点消息也没有"
        },
        {
          "start": 362,
          "end": 364.4,
          "ko": "쯔추 외할아버지, 외할머니도 모두 돌아가셨고",
          "zh": "子秋他外公外婆都没啦"
        },
        {
          "start": 364.5,
          "end": 366.7,
          "ko": "그 뒤로는 그냥 사라져 버렸어.",
          "zh": "后来啊 就消失了"
        },
        {
          "start": 368.1,
          "end": 370,
          "ko": "그때 돈까지 빌려서 떠났고.",
          "zh": "当时还借了钱走的"
        },
        {
          "start": 370.2,
          "end": 371.8,
          "ko": "자, 물 좀 마셔.",
          "zh": "来 喝点水"
        },
        {
          "start": 372.1,
          "end": 373.6,
          "ko": "그만 챙겨, 하이차오 오빠.",
          "zh": "别忙了海潮哥"
        },
        {
          "start": 375,
          "end": 378,
          "ko": "저기, 쯔추랑 젠젠은 집에 있어?",
          "zh": "那个 子秋和尖尖在家呢"
        },
        {
          "start": 378.6,
          "end": 379.9,
          "ko": "불러서 얼굴 좀 보자.",
          "zh": "叫过来见见吧"
        },
        {
          "start": 380.1,
          "end": 383,
          "ko": "오늘 개학이라 다 학교 갔어.",
          "zh": "今天开学 都上学去了"
        },
        {
          "start": 383.1,
          "end": 386.6,
          "ko": "참, 내 정신 좀 봐.",
          "zh": "今 你看我这脑子"
        },
        {
          "start": 387.2,
          "end": 388.8,
          "ko": "전국이 다 똑같이 개학하는데 말이야.",
          "zh": "这全国统一的"
        },
        {
          "start": 389.9,
          "end": 391.6,
          "ko": "너희 집 류바오는 오늘 학교 안 갔어?",
          "zh": "你们家六宝今儿没上学"
        },
        {
          "start": 392.1,
          "end": 393.4,
          "ko": "중학교 졸업했어.",
          "zh": "初中毕业了"
        },
        {
          "start": 395,
          "end": 397.4,
          "ko": "성적도 별로고 더는 학교 다니기 싫대.",
          "zh": "学习成绩不太好 不想上了"
        },
        {
          "start": 397.8,
          "end": 400.4,
          "ko": "셋째 삼촌 따라서 광저우에 일하러 갔어.",
          "zh": "跟着他三叔啊 去广州打工去了"
        },
        {
          "start": 400.7,
          "end": 405.1,
          "ko": "어머, 그렇게 어린데 벌써 일하러 갔어?",
          "zh": "呦 这么小就去打工啊"
        },
        {
          "start": 405.6,
          "end": 407.8,
          "ko": "안 어려. 벌써 열일곱이야.",
          "zh": "不小啦 都十七岁啦"
        },
        {
          "start": 408.3,
          "end": 411.8,
          "ko": "우리 시골 애들은 도시 애들과는 다르잖아.",
          "zh": "我们乡下孩子啊 不比城里孩子"
        },
        {
          "start": 411.9,
          "end": 415.3,
          "ko": "집안 형편이 안 좋으니 자기 힘으로 살아갈 수밖에 없지.",
          "zh": "这家庭条件不好啊 只能靠自己啦"
        },
        {
          "start": 417.4,
          "end": 420.2,
          "ko": "쯔추도 우리 집에서 키웠다면",
          "zh": "你说这子秋 要是养在我们家"
        },
        {
          "start": 420.2,
          "end": 421.9,
          "ko": "대학생으로 키워내진 못했을 거야.",
          "zh": "也养不出个大学生来"
        },
        {
          "start": 421.9,
          "end": 424.3,
          "ko": "일하러 나가는 길밖에는 없었겠지.",
          "zh": "只有打工 这一条路可以走"
        },
        {
          "start": 427,
          "end": 429,
          "ko": "여기 있다고 네가 말하는 것만큼 좋은 건 아니야.",
          "zh": "在这 也没你说的那么好"
        },
        {
          "start": 430.4,
          "end": 432.1,
          "ko": "난 작은 국숫집 하나 하는 것뿐이고",
          "zh": "我就开个小面馆"
        },
        {
          "start": 432.6,
          "end": 433.9,
          "ko": "애들 굶기지 않는 정도야.",
          "zh": "饿不着孩子"
        },
        {
          "start": 434.6,
          "end": 436.2,
          "ko": "이게 어떻게 겨우 안 굶기는 정도야?",
          "zh": "这还叫饿不着啊"
        },
        {
          "start": 436.7,
          "end": 438.9,
          "ko": "이건 완전히 꿀단지에 빠진 거지.",
          "zh": "这叫掉进蜜罐罐里拉"
        },
        {
          "start": 440.2,
          "end": 441.6,
          "ko": "우리 고향 사람들이 말이야",
          "zh": "你不知道我们老家的人"
        },
        {
          "start": 441.7,
          "end": 443,
          "ko": "내가 이 이야기를 꺼내기만 하면",
          "zh": "一根我提起这事"
        },
        {
          "start": 443.8,
          "end": 445.6,
          "ko": "얼마나 뿌듯한지 몰라.",
          "zh": "我是满心的得意啊"
        },
        {
          "start": 447.8,
          "end": 449.7,
          "ko": "우리 가족이 대체",
          "zh": "也不知道我们这家人这"
        },
        {
          "start": 449.8,
          "end": 452.1,
          "ko": "전생에 무슨 좋은 일을 했길래",
          "zh": "上辈子都做了 什么好事了"
        },
        {
          "start": 452.4,
          "end": 456,
          "ko": "이번 생에 하이차오 오빠처럼 좋은 사람을 만났는지 모르겠어.",
          "zh": "这辈子啊 能遇到海潮哥 这么好的人"
        },
        {
          "start": 456.6,
          "end": 458.1,
          "ko": "무슨 그런 말을 해.",
          "zh": "瞧你说的"
        },
        {
          "start": 459.9,
          "end": 460.9,
          "ko": "어,",
          "zh": "诶"
        },
        {
          "start": 464.8,
          "end": 466,
          "ko": "왔어?",
          "zh": "哎 回来了"
        },
        {
          "start": 466.5,
          "end": 467.9,
          "ko": "수이주위 했지?",
          "zh": "做水煮鱼了吧"
        },
        {
          "start": 468.2,
          "end": 469.2,
          "ko": "냄새가 확 퍼지네.",
          "zh": "这味儿窜的"
        },
        {
          "start": 469.2,
          "end": 470.6,
          "ko": "아래층에서부터 냄새가 나더라.",
          "zh": "我打楼下就闻见了"
        },
        {
          "start": 471.3,
          "end": 473.2,
          "ko": "아이고, 고추 좀 볶았을 뿐인데",
          "zh": "哎呦 我就炝点辣椒"
        },
        {
          "start": 473.3,
          "end": 474.6,
          "ko": "복도 전체에 냄새가 다 퍼졌네.",
          "zh": "这满楼道都这味儿"
        },
        {
          "start": 474.8,
          "end": 476.6,
          "ko": "내 말이, 이 환기구는 이제 손봐야 해.",
          "zh": "我跟你说 这烟道 该改造了"
        },
        {
          "start": 476.8,
          "end": 477.5,
          "ko": "곧 할 거야.",
          "zh": "很快了"
        },
        {
          "start": 477.5,
          "end": 479.7,
          "ko": "옆 단지는 벌써 공사 시작했어.",
          "zh": "隔壁小区 开始改造啦"
        },
        {
          "start": 480.4,
          "end": 481.5,
          "ko": "내가 뭐 도와줄까?",
          "zh": "用不用我打下手啊"
        },
        {
          "start": 481.5,
          "end": 482.2,
          "ko": "아니, 아니. 괜찮아.",
          "zh": "不不不 不用"
        },
        {
          "start": 482.3,
          "end": 483.4,
          "ko": "이제 데치기만 하면 돼.",
          "zh": "就差一个烫了"
        },
        {
          "start": 483.5,
          "end": 484.6,
          "ko": "손대지 마.",
          "zh": "别沾手了"
        },
        {
          "start": 486.6,
          "end": 487.8,
          "ko": "자, 좀 비켜봐.",
          "zh": "来 让一下"
        },
        {
          "start": 491.5,
          "end": 493.3,
          "ko": "이번 달 생활비 여기 있어.",
          "zh": "这个月生活费 搁这"
        },
        {
          "start": 493.4,
          "end": 494.5,
          "ko": "안 세어봐?",
          "zh": "不数数啊"
        },
        {
          "start": 494.7,
          "end": 496,
          "ko": "내가 덜 줬으면 어쩌려고?",
          "zh": "我要少给你呢"
        },
        {
          "start": 496.6,
          "end": 497.9,
          "ko": "안 줘도 괜찮아.",
          "zh": "你不给我都成"
        },
        {
          "start": 498.3,
          "end": 499.8,
          "ko": "내가 한 달 내내 배추만 먹게 해줄게.",
          "zh": "我让你吃一个月白菜"
        },
        {
          "start": 500.1,
          "end": 501.8,
          "ko": "그래, 네가 독하다. 네가 이겼어.",
          "zh": "这算你狠 算你狠"
        },
        {
          "start": 506.2,
          "end": 507.4,
          "ko": "아빠, 우리 왔어!",
          "zh": "爸我们回来了"
        },
        {
          "start": 507.8,
          "end": 508.5,
          "ko": "링 아빠! 링 아빠!",
          "zh": "凌爸 凌爸"
        },
        {
          "start": 508.5,
          "end": 510.6,
          "ko": "고등학생들이 단체로 돌아왔네.",
          "zh": "高中生集体回来了"
        },
        {
          "start": 510.9,
          "end": 512.3,
          "ko": "얼른 손 씻고 밥 먹어.",
          "zh": "赶紧 洗手吃饭"
        },
        {
          "start": 512.9,
          "end": 514.5,
          "ko": "우와, 요리를 이렇게 많이 했어?",
          "zh": "哇塞 做了这么多菜啊"
        },
        {
          "start": 514.5,
          "end": 516.1,
          "ko": "나 배고파 죽겠어.",
          "zh": "都饿死我啦"
        },
        {
          "start": 517.2,
          "end": 520.1,
          "ko": "나 오늘 발표할 중요한 일이 하나 있어.",
          "zh": "我今天有一个 大事要宣布啊"
        },
        {
          "start": 520.1,
          "end": 522.9,
          "ko": "그래, 그 중요한 일은 먹으면서 발표해.",
          "zh": "行 大事 边吃边宣布啊"
        },
        {
          "start": 525.7,
          "end": 527.1,
          "ko": "쯔추야, 내가 말해줄게.",
          "zh": "子秋我跟你说啊"
        },
        {
          "start": 527.2,
          "end": 528.8,
          "ko": "오늘 네 둘째 이모가 왔었어.",
          "zh": "你二姨今儿来啦"
        },
        {
          "start": 528.9,
          "end": 530.5,
          "ko": "야생 오리알도 잔뜩 가져오셨고.",
          "zh": "给你带了好多野鸭蛋"
        },
        {
          "start": 530.9,
          "end": 531.4,
          "ko": "이모는?",
          "zh": "她人呢"
        },
        {
          "start": 531.4,
          "end": 532.1,
          "ko": "가셨어.",
          "zh": "走啦"
        },
        {
          "start": 532.1,
          "end": 534.6,
          "ko": "네가 학교 간 줄 모르셨거든.",
          "zh": "他不知道 你这个 上学啦"
        },
        {
          "start": 535.2,
          "end": 536.3,
          "ko": "사실 안 만난 게 오히려 나아.",
          "zh": "其实见不着她也好"
        },
        {
          "start": 536.4,
          "end": 537.8,
          "ko": "만났어도 무슨 말을 해야 할지 모르겠어.",
          "zh": "不然我不知道说什么"
        },
        {
          "start": 538.3,
          "end": 539.2,
          "ko": "얘도 참.",
          "zh": "你这孩子"
        },
        {
          "start": 539.3,
          "end": 540.8,
          "ko": "이모도 너 걱정돼서 그러시는 거야.",
          "zh": "人家二姨是关心你"
        },
        {
          "start": 541.2,
          "end": 543.8,
          "ko": "허란은 사람은 좋은데 말이 좀 많아.",
          "zh": "贺兰啊 人是好人 就是嘴碎"
        },
        {
          "start": 544.2,
          "end": 546.4,
          "ko": "맨날 애한테 이것저것 참견하면서 말하잖아.",
          "zh": "老跟孩子说七说八的"
        },
        {
          "start": 547.3,
          "end": 549.1,
          "ko": "“쯔추야, 꼭 말 잘 들어야 한다.”",
          "zh": "子秋啊 你一定要听话"
        },
        {
          "start": 549.2,
          "end": 551.3,
          "ko": "“쯔추야, 젠젠이랑 절대 다투면 안 된다.”",
          "zh": "子秋 一定不跟尖尖抢"
        },
        {
          "start": 551.4,
          "end": 554.4,
          "ko": "“쯔추야, 앞으로 꼭 아빠한테 효도해야 한다.”",
          "zh": "子秋啊 今后一定要孝敬你爸"
        },
        {
          "start": 554.5,
          "end": 556.2,
          "ko": "늘 하는 말이라 나도 다 외웠어.",
          "zh": "就这一套 我都会了"
        },
        {
          "start": 561.9,
          "end": 563.4,
          "ko": "너 리젠젠 방에는 왜 들어갔어?",
          "zh": "你去李尖尖房里干吗了"
        },
        {
          "start": 563.9,
          "end": 564.8,
          "ko": "아무것도 아니야.",
          "zh": "没事"
        },
        {
          "start": 565.6,
          "end": 567.3,
          "ko": "젠젠아, 얼른 와.",
          "zh": "小尖 赶紧的"
        },
        {
          "start": 567.4,
          "end": 568.3,
          "ko": "너만 기다리고 있어.",
          "zh": "就等你啦"
        },
        {
          "start": 568.4,
          "end": 569.4,
          "ko": "가요!",
          "zh": "来了"
        },
        {
          "start": 573.7,
          "end": 576.6,
          "ko": "어이구, 아주 신이 났네.",
          "zh": "呦 呦 我这美哒哒的呦"
        },
        {
          "start": 577.2,
          "end": 578.4,
          "ko": "뭐가 그렇게 좋아?",
          "zh": "怎么这么高兴啊"
        },
        {
          "start": 578.8,
          "end": 581.1,
          "ko": "개학 첫날부터 친구가 생겼어.",
          "zh": "这第一天开学 就交到朋友啦"
        },
        {
          "start": 583.7,
          "end": 584.6,
          "ko": "하이차오.",
          "zh": "海潮啊"
        },
        {
          "start": 584.6,
          "end": 587.4,
          "ko": "봐, 우리 대가족이 얼마나 좋아.",
          "zh": "你看 咱这一大家子 多好啊"
        },
        {
          "start": 588.9,
          "end": 593.1,
          "ko": "처음에 나랑 너희 리 아빠가",
          "zh": "想当初啊 我跟你们李爸 决定"
        },
        {
          "start": 593.3,
          "end": 596.6,
          "ko": "우리 둘이 너희 셋을 키우기로 결정했을 때",
          "zh": "由我们二人 把你们仨人 抚养大的时候"
        },
        {
          "start": 596.8,
          "end": 598.5,
          "ko": "동네 사람들은 아무도 잘될 거라고 생각하지 않았어.",
          "zh": "哎呦 街坊邻居 没一个看好的"
        },
        {
          "start": 598.5,
          "end": 600.5,
          "ko": "다 큰 남자 둘이서 어떻게 되겠냐고 했지.",
          "zh": "说你们俩大男人 怎么能成呢"
        },
        {
          "start": 600.5,
          "end": 602.1,
          "ko": "집에는 반드시 여자가 있어야 한다면서.",
          "zh": "家里一定得有个女人"
        },
        {
          "start": 602.5,
          "end": 604.2,
          "ko": "그런데 봐. 지금 얼마나 좋아.",
          "zh": "你看 你看 现在多好"
        },
        {
          "start": 604.3,
          "end": 605.5,
          "ko": "너희도 이렇게 다 컸잖아.",
          "zh": "你们都长大这么大了"
        },
        {
          "start": 605.7,
          "end": 608.1,
          "ko": "봐, 링샤오는 내가 걱정할 필요도 없고",
          "zh": "你看 凌霄不用我操心"
        },
        {
          "start": 608.2,
          "end": 609.3,
          "ko": "내가 밖에서 일할 때도",
          "zh": "我在外头工作"
        },
        {
          "start": 609.4,
          "end": 611.3,
          "ko": "이제 집안일을 계속 마음에 두고 걱정하지 않아도 되고.",
          "zh": "再也不用惦记 家里的事了"
        },
        {
          "start": 611.8,
          "end": 613,
          "ko": "고맙다, 하이차오.",
          "zh": "谢谢你啊 海潮"
        },
        {
          "start": 615.4,
          "end": 618.2,
          "ko": "첸 아주머니도 자꾸 나한테 소개팅을 주선하려고 해.",
          "zh": "这钱阿姨还老给我 张罗介绍对象呢"
        },
        {
          "start": 618.9,
          "end": 620.3,
          "ko": "무슨 연애를 해.",
          "zh": "谈什么对象啊"
        },
        {
          "start": 620.8,
          "end": 622.7,
          "ko": "난 싸우는 건 이제 정말 지긋지긋해.",
          "zh": "我吵架算是超够了"
        },
        {
          "start": 623.5,
          "end": 626,
          "ko": "너한테 마누라 하나 찾아줘서 제대로 잡고 살게 해야겠다.",
          "zh": "得给你找个老婆 好好管管你"
        }
      ],
      "updatedAt": null
    },
    "episodeId": "yjrzm-ep3",
    "createdAt": "2026-10-11T00:00:00.000Z",
    "updatedAt": "2026-10-26T12:20:21.886Z",
    "captionMask": {
      "enabled": true,
      "top": 78.5,
      "height": 14,
      "width": 70
    },
    "courseId": "course-legacy"
  },
  {
    "id": "lesson-week01",
    "week": 1,
    "title": "생일 식탁에 모인 가족",
    "description": "贺子秋 생일날 가족들이 함께 식사하며 李爸가 子秋를 감싸는 장면 · 학습 주제: 가족관계, 친족 호칭, 식사, 혈연을 넘어선 가족",
    "direction": "zh-ko",
    "level": "hsk4",
    "status": "published",
    "video": {
      "youtubeUrl": "https://youtu.be/w8b-Rhl3y5M",
      "youtubeId": "w8b-Rhl3y5M",
      "startTime": 0,
      "endTime": 217
    },
    "source": {
      "dramaTitle": "以家人之名",
      "episode": "학습 클립"
    },
    "script": {
      "source": "srt",
      "cues": [
        {
          "start": 0,
          "end": 1.6400000000000001,
          "zh": "你这说句实话",
          "ko": "솔직히 말해서"
        },
        {
          "start": 2.16,
          "end": 3.68,
          "zh": "要是没有海潮哥呀",
          "ko": "하이차오 오빠가 없었으면"
        },
        {
          "start": 3.68,
          "end": 4.08,
          "zh": "又来了",
          "ko": "또 시작이네"
        },
        {
          "start": 4.08,
          "end": 5.68,
          "zh": "就没有子秋的今天",
          "ko": "오늘의 쯔추도 없었을 거야"
        },
        {
          "start": 6,
          "end": 7.28,
          "zh": "他要以后敢不孝顺",
          "ko": "앞으로 쟤가 효도 안 하기만 해 봐"
        },
        {
          "start": 7.28,
          "end": 8.48,
          "zh": "我第一个打说他腿",
          "ko": "내가 제일 먼저 다리를 분질러 놓을 거야"
        },
        {
          "start": 9.36,
          "end": 9.96,
          "zh": "子秋",
          "ko": "쯔추야"
        },
        {
          "start": 10.12,
          "end": 12.12,
          "zh": "你起来敬你爸一杯酒",
          "ko": "일어나서 아빠한테 술 한 잔 올려"
        },
        {
          "start": 13.12,
          "end": 14.12,
          "zh": "哎呦 你干吗呢",
          "ko": "아이고, 뭐 하는 거야"
        },
        {
          "start": 14.12,
          "end": 15.08,
          "zh": "吃吃",
          "ko": "먹어, 먹어"
        },
        {
          "start": 15.08,
          "end": 15.88,
          "zh": "起来",
          "ko": "일어나"
        },
        {
          "start": 15.88,
          "end": 17.12,
          "zh": "哎呀 你起来敬他一杯",
          "ko": "아이참, 일어나서 한 잔 올리라니까"
        },
        {
          "start": 18.36,
          "end": 19.36,
          "zh": "爸 我敬你一杯",
          "ko": "아빠, 제 잔 받으세요"
        },
        {
          "start": 20.16,
          "end": 21.08,
          "zh": "行行行",
          "ko": "그래, 그래, 그래"
        },
        {
          "start": 22.08,
          "end": 23.8,
          "zh": "你少喝点 太甜",
          "ko": "조금만 마셔, 너무 달아"
        },
        {
          "start": 23.8,
          "end": 24.56,
          "zh": "哎呀 吃菜",
          "ko": "아이고, 반찬 먹어"
        },
        {
          "start": 25,
          "end": 26,
          "zh": "你这孩子你爸你酒",
          "ko": "얘는 참, 아빠 술을"
        },
        {
          "start": 26,
          "end": 28,
          "zh": "都还没到上呢",
          "ko": "아직 따르지도 않았는데"
        },
        {
          "start": 32,
          "end": 34,
          "zh": "我说你别喝了",
          "ko": "그만 마시라니까"
        },
        {
          "start": 36,
          "end": 37,
          "zh": "凌和平",
          "ko": "링허핑"
        },
        {
          "start": 37,
          "end": 38,
          "zh": "嗯",
          "ko": "응"
        },
        {
          "start": 38,
          "end": 39,
          "zh": "下午不许去所里",
          "ko": "오후에 연구소 가지 마"
        },
        {
          "start": 40,
          "end": 41,
          "zh": "留下",
          "ko": "남아"
        },
        {
          "start": 41,
          "end": 42,
          "zh": "陪我喝酒",
          "ko": "나랑 술 마셔"
        },
        {
          "start": 42,
          "end": 43,
          "zh": "我已经请假了",
          "ko": "벌써 휴가 냈어"
        },
        {
          "start": 43,
          "end": 44,
          "zh": "我已经请假了",
          "ko": "벌써 휴가 냈다니까"
        },
        {
          "start": 44,
          "end": 45.56,
          "zh": "我陪你喝",
          "ko": "내가 같이 마셔 줄게"
        },
        {
          "start": 46.4,
          "end": 48,
          "zh": "我白给你做那么多年饭",
          "ko": "내가 그 오랜 세월 밥해 준 게 헛수고는 아니네"
        },
        {
          "start": 48.8,
          "end": 49.44,
          "zh": "别喝啦",
          "ko": "그만 마셔"
        },
        {
          "start": 50.4,
          "end": 51.28,
          "zh": "讨厌",
          "ko": "아이 참"
        },
        {
          "start": 52.04,
          "end": 53.6,
          "zh": "把你爸酒杯拿下来",
          "ko": "아빠 술잔 좀 치워"
        },
        {
          "start": 54,
          "end": 54.5,
          "zh": "快",
          "ko": "빨리"
        },
        {
          "start": 55,
          "end": 55.5,
          "zh": "哎呀",
          "ko": "아이고"
        },
        {
          "start": 63,
          "end": 63.68,
          "zh": "你们俩",
          "ko": "너희 둘"
        },
        {
          "start": 65,
          "end": 66,
          "zh": "是我儿子吗",
          "ko": "내 아들이냐?"
        },
        {
          "start": 67,
          "end": 68,
          "zh": "爸 你是不是喝糊涂了",
          "ko": "아빠, 취해서 정신없으신 거 아니에요?"
        },
        {
          "start": 68,
          "end": 69,
          "zh": "连儿子都认不出来了",
          "ko": "아들도 못 알아보시네"
        },
        {
          "start": 71,
          "end": 72,
          "zh": "不是我儿子",
          "ko": "내 아들이 아니야"
        },
        {
          "start": 77,
          "end": 78,
          "zh": "没血缘关系",
          "ko": "피도 안 섞였고"
        },
        {
          "start": 79,
          "end": 80,
          "zh": "不姓一个姓",
          "ko": "성도 같지 않지만"
        },
        {
          "start": 82,
          "end": 83,
          "zh": "咱们也是一家子",
          "ko": "우리도 한 가족이야"
        },
        {
          "start": 85,
          "end": 86.24,
          "zh": "你也是我儿子",
          "ko": "너도 내 아들이야"
        },
        {
          "start": 87.44,
          "end": 88.44,
          "zh": "是",
          "ko": "그럼요"
        },
        {
          "start": 88.44,
          "end": 90,
          "zh": "都是你亲儿子",
          "ko": "다 친아들이죠"
        },
        {
          "start": 90,
          "end": 91.44,
          "zh": "凌和平",
          "ko": "링허핑"
        },
        {
          "start": 91.84,
          "end": 92.84,
          "zh": "我心里难受",
          "ko": "나 속상해"
        },
        {
          "start": 92.84,
          "end": 94.48,
          "zh": "你知道不知道我难受",
          "ko": "내가 얼마나 속상한지 알아, 몰라?"
        },
        {
          "start": 94.48,
          "end": 95.68,
          "zh": "怎么啦",
          "ko": "왜 그래"
        },
        {
          "start": 98.2,
          "end": 100.44,
          "zh": "我本来觉得老天对我特别好",
          "ko": "난 원래 하늘이 나한테 참 잘해 준다고 생각했어"
        },
        {
          "start": 102.92,
          "end": 104.8,
          "zh": "给了我这么好的孩子",
          "ko": "이렇게 좋은 아이를 줬으니까"
        },
        {
          "start": 107.04,
          "end": 108.52,
          "zh": "我特珍惜啊",
          "ko": "얼마나 아꼈는데"
        },
        {
          "start": 109.04,
          "end": 109.76,
          "zh": "我从这么点",
          "ko": "요만할 때부터"
        },
        {
          "start": 109.76,
          "end": 110.92,
          "zh": "喂养大了",
          "ko": "먹이고 키웠어"
        },
        {
          "start": 111.6,
          "end": 112.96,
          "zh": "我捧在手心上",
          "ko": "손바닥 위에 올려놓고 귀하게"
        },
        {
          "start": 114.2,
          "end": 116.2,
          "zh": "我不舍得打我不舍得骂他",
          "ko": "차마 때리지도 못하고 혼내지도 못했어"
        },
        {
          "start": 118.56,
          "end": 120.4,
          "zh": "可有些人她非得提醒我",
          "ko": "근데 어떤 사람은 굳이 나한테 일깨워 주더라"
        },
        {
          "start": 120.4,
          "end": 122.56,
          "zh": "说我不是亲爹",
          "ko": "내가 친아빠가 아니라고"
        },
        {
          "start": 123.76,
          "end": 125.28,
          "zh": "我不是亲爸 我不是亲人",
          "ko": "친아빠도 아니고 가족도 아니래"
        },
        {
          "start": 125.48,
          "end": 127.28,
          "zh": "那他们亲人在哪啊",
          "ko": "그럼 걔들 친가족은 어디 있는데?"
        },
        {
          "start": 128.88,
          "end": 130.2,
          "zh": "他亲姥姥",
          "ko": "걔 친외할머니는"
        },
        {
          "start": 130.88,
          "end": 132.68,
          "zh": "打他 骂他",
          "ko": "때리고 욕하고"
        },
        {
          "start": 134.12,
          "end": 135.48,
          "zh": "人家 凌霄",
          "ko": "저기 링샤오는"
        },
        {
          "start": 136.28,
          "end": 137.4,
          "zh": "见着亲妈都",
          "ko": "친엄마를 만나고 와서는"
        },
        {
          "start": 138.12,
          "end": 139.72,
          "zh": "都睡不着觉",
          "ko": "잠도 못 자"
        },
        {
          "start": 139.88,
          "end": 140.48,
          "zh": "失眠啊",
          "ko": "불면증이야"
        },
        {
          "start": 140.64,
          "end": 142.36,
          "zh": "一夜一夜的失眠",
          "ko": "매일 밤 잠을 못 자"
        },
        {
          "start": 142.56,
          "end": 144.6,
          "zh": "我看着我就心疼",
          "ko": "보고 있으면 마음이 아파"
        },
        {
          "start": 145.56,
          "end": 147.6,
          "zh": "谁管呢",
          "ko": "누가 신경이나 써?"
        },
        {
          "start": 147.6,
          "end": 149.6,
          "zh": "你们谁看得见呢",
          "ko": "너희 중에 누가 그걸 알아봐?"
        },
        {
          "start": 150.6,
          "end": 153.6,
          "zh": "你看得见吗你",
          "ko": "넌 알아? 너는?"
        },
        {
          "start": 156.6,
          "end": 158.6,
          "zh": "我们家 我们家子秋",
          "ko": "우리 집, 우리 쯔추는"
        },
        {
          "start": 159.6,
          "end": 161.6,
          "zh": "受委屈更多了",
          "ko": "더 많이 서러웠어"
        },
        {
          "start": 161.6,
          "end": 163.6,
          "zh": "谁都能说他两句",
          "ko": "아무나 걔한테 한마디씩 해"
        },
        {
          "start": 163.6,
          "end": 166.6,
          "zh": "说他两句 你要孝顺",
          "ko": "한마디씩 하지, 효도해야 한다"
        },
        {
          "start": 167.08,
          "end": 170.28,
          "zh": "你要 你要知道尊重人",
          "ko": "어른을 공경할 줄 알아야 한다"
        },
        {
          "start": 170.28,
          "end": 173.52,
          "zh": "我们家子秋怎么就 不孝顺啦",
          "ko": "우리 쯔추가 어디가 효도를 안 한다는 거야"
        },
        {
          "start": 175.24,
          "end": 180.16,
          "zh": "在 大半夜的在 在厕所那洗衣服啊",
          "ko": "한밤중에 화장실에서 빨래를 하고"
        },
        {
          "start": 180.16,
          "end": 182.96,
          "zh": "给我拖地给我帮厨",
          "ko": "바닥 닦아 주고 부엌일도 도와주고"
        },
        {
          "start": 182.96,
          "end": 185.24,
          "zh": "他怎么就不孝顺了",
          "ko": "걔가 어디가 불효자야"
        },
        {
          "start": 186.32,
          "end": 188,
          "zh": "你还当着面你打他 你踹他",
          "ko": "그런데도 보는 앞에서 걔를 때리고 발로 차?"
        },
        {
          "start": 188.52,
          "end": 189.72,
          "zh": "你那是打我呢",
          "ko": "그건 나를 때린 거야"
        },
        {
          "start": 189.72,
          "end": 190.8,
          "zh": "你知道不知道",
          "ko": "알아, 몰라?"
        },
        {
          "start": 191.28,
          "end": 192.4,
          "zh": "你要干吗呀你",
          "ko": "왜 이래, 너"
        },
        {
          "start": 193,
          "end": 194.52,
          "zh": "你干吗",
          "ko": "뭐 하는 거야"
        },
        {
          "start": 194.52,
          "end": 195,
          "zh": "爸",
          "ko": "아빠"
        },
        {
          "start": 199.4,
          "end": 200.12,
          "zh": "厕所",
          "ko": "화장실"
        },
        {
          "start": 200.12,
          "end": 201.12,
          "zh": "快快快",
          "ko": "빨리빨리"
        },
        {
          "start": 201.6,
          "end": 202.12,
          "zh": "快",
          "ko": "빨리"
        },
        {
          "start": 202.12,
          "end": 203,
          "zh": "你去倒杯水来",
          "ko": "가서 물 한 잔 떠 와"
        },
        {
          "start": 205,
          "end": 208,
          "zh": "别 别让他蹲地下",
          "ko": "바닥에 쭈그리고 앉게 하지 마"
        },
        {
          "start": 209,
          "end": 210,
          "zh": "来来来",
          "ko": "자, 자, 자"
        }
      ],
      "updatedAt": "2026-10-26T12:11:33.057Z",
      "origin": {
        "zh": {
          "provider": "srt",
          "fileName": "令人舒适：贺子秋生日，李爸借酒对多嘴的二姨指桑骂槐 _ 谭松韵 宋威龙 张新成 _ 以家人之名 Go Ahead.zh.srt",
          "fetchedAt": "2026-10-26T12:06:31.459Z"
        },
        "ko": {
          "provider": "ai",
          "fetchedAt": "2026-10-26T12:09:24.703Z"
        }
      }
    },
    "draft": {
      "expressions": [
        {
          "id": "note-mvp7tir9-cab181",
          "source": "你这说句实话",
          "note": "'说句实话'는 '솔직히 말하자면, 사실대로 말하면'이라는 뜻으로, 본심이나 진심을 털어놓기 전에 쓰는 표현이에요. 생일 식탁에서 고마운 마음을 꺼내며 말을 시작하는 장면이에요. 일상 대화에서 '说实话'로 줄여 쓰기도 해요."
        },
        {
          "id": "note-mvp7tira-3innh2",
          "source": "爸 我敬你一杯",
          "note": "'敬'은 '공경하다'라는 뜻이고, '敬你一杯'는 '당신께 한 잔 올리겠습니다'라는 뜻이에요. 술자리에서 윗사람에게 감사나 존경을 표하며 잔을 권할 때 쓰는 정중한 말투예요. '我敬大家一杯'처럼 여러 사람에게도 쓸 수 있어요."
        },
        {
          "id": "note-mvp7tira-8r7t9d",
          "source": "我已经请假了",
          "note": "'请假'는 '휴가·조퇴·결근 허가를 신청하다'라는 뜻이에요. '已经…了'와 함께 '이미 휴가를 냈다'는 의미가 돼요. 오후에 출근하지 말고 같이 술을 마시자는 말에, 이미 미리 일을 빼 두었다고 대답하는 장면이에요."
        },
        {
          "id": "note-mvp7tira-zdzts5",
          "source": "我看着我就心疼",
          "note": "'心疼'은 '마음이 아프다, 안쓰럽다'라는 뜻으로, 아끼는 사람이 고생하는 모습을 볼 때 쓰는 말이에요. '看着…就…'는 '보고 있으면 곧바로 ~하다'라는 구조예요. 잠 못 이루는 아이를 지켜보는 부모의 감정이 담겨 있어요."
        },
        {
          "id": "note-mvp7tira-7rwm16",
          "source": "爸 你是不是喝糊涂了",
          "note": "'糊涂'는 '정신이 흐리멍덩하다'라는 뜻이고, '喝糊涂了'는 '술을 마셔서 정신이 없어졌다'는 의미예요. '是不是…了'는 '혹시 ~한 거 아니에요?'라고 추측하며 묻는 말투예요. 취한 아버지를 걱정하면서도 살짝 핀잔을 주는 느낌이에요."
        }
      ],
      "grammar": [
        {
          "id": "note-mvp7tirb-zz5n0q",
          "source": "要是没有海潮哥呀",
          "note": "'要是…(就)…'는 '만약 ~라면 ~할 것이다'라는 가정 문형이에요. 이 장면에서는 다음 대사 '就没有子秋的今天'과 이어져 '海潮 형이 없었다면 오늘의 子秋도 없었을 것이다'라는 뜻이 돼요. 예문: 要是明天下雨，我们就不去了。(내일 비가 오면 우리는 안 갈 거예요.)"
        },
        {
          "id": "note-mvp7tirb-clj0fo",
          "source": "我不舍得打我不舍得骂他",
          "note": "'不舍得 + 동사'는 '차마 ~하지 못하다, 아까워서 ~하지 못하다'라는 뜻이에요. '舍不得'와 같은 의미로, 아끼는 마음 때문에 어떤 행동을 못 한다는 뉘앙스예요. 예문: 这件衣服太贵了，我舍不得穿。(이 옷은 너무 비싸서 아까워서 못 입겠어요.)"
        },
        {
          "id": "note-mvp7tirb-l5kk9j",
          "source": "连儿子都认不出来了",
          "note": "'连…都…'는 '~조차도 ~하다'라는 강조 문형이에요. '认不出来'는 가능보어 형태로 '알아보지 못하다'라는 뜻이에요. 합쳐서 '아들조차 못 알아보시네요'라는 의미가 돼요. 예문: 他忙得连饭都没时间吃。(그는 바빠서 밥 먹을 시간조차 없어요.)"
        }
      ],
      "lenses": [
        {
          "id": "lens-mvp7tirb-qgwyrh",
          "title": "중국 가족 식탁의 경주(敬酒) 문화",
          "source": "你起来敬你爸一杯酒",
          "text": "중국에서는 생일이나 명절 같은 가족 모임에서 아랫사람이 자리에서 일어나 윗사람에게 술을 권하는 '敬酒'가 중요한 예절로 여겨져요. 이 장면에서 '일어나서(起来) 아버지께 한 잔 올려라'라고 재촉하는 것도, 일어서는 동작 자체가 존경의 표현이기 때문이에요. 잔을 부딪칠 때는 아랫사람이 자기 잔을 상대 잔보다 낮게 대어 겸손함을 나타내는 경우가 많아요. 한국처럼 고개를 돌려 마시는 관습은 일반적이지 않고, 대신 감사의 말 한마디를 곁들여 마음을 전하는 것이 핵심이에요. 그래서 경주는 단순히 술을 마시는 행위가 아니라, 평소 하기 어려운 감사와 애정을 표현하는 기회가 되기도 해요."
        }
      ],
      "quiz": [
        {
          "id": "quiz-mvp7tirc-vh5qs2",
          "question": "'我已经请假了'의 뜻으로 가장 알맞은 것은?",
          "options": [
            "나는 이미 퇴근했어요.",
            "나는 이미 휴가를 다녀왔어요.",
            "나는 이미 휴가를 냈어요.",
            "나는 이미 일을 그만뒀어요."
          ],
          "answer": 2,
          "explanation": "'请假'는 휴가나 조퇴 허가를 신청하는 것을 뜻해요. '已经…了'와 함께 '이미 휴가를 냈다'는 의미가 되며, 오후에 출근하지 말라는 말에 미리 일을 빼 두었다고 답하는 장면이에요."
        },
        {
          "id": "quiz-mvp7tirc-ldqz2x",
          "question": "'我不舍得打我不舍得骂他'에서 '不舍得'의 의미로 알맞은 것은?",
          "options": [
            "아끼는 마음에 차마 ~하지 못하다",
            "~할 줄 모르다",
            "~할 필요가 없다",
            "~하는 것을 싫어하다"
          ],
          "answer": 0,
          "explanation": "'不舍得(舍不得) + 동사'는 아끼는 마음 때문에 차마 그 행동을 하지 못한다는 뜻이에요. 아이를 너무 아껴서 때리지도 꾸짖지도 못했다는 아버지의 마음이 드러나요."
        },
        {
          "id": "quiz-mvp7tirc-hpmjwo",
          "question": "아버지가 '不是我儿子 / 没血缘关系 / 不姓一个姓'라고 말한 뒤, 이어지는 대사에서 강조하는 생각은 무엇인가요?",
          "options": [
            "피가 섞이지 않았으니 남이나 다름없다.",
            "성이 다르면 가족이 될 수 없다.",
            "아들이 친부모를 찾아가야 한다.",
            "혈연이 아니어도 우리는 한 가족이다."
          ],
          "answer": 3,
          "explanation": "바로 뒤의 대사 '咱们也是一家子'(우리도 한 가족이다)에서 알 수 있듯이, 혈연이나 성씨가 달라도 함께 살아온 사람들이 진짜 가족이라는 드라마의 주제가 담겨 있어요."
        },
        {
          "id": "quiz-mvp7tirc-brq5q4",
          "question": "'谁都能说他两句'에서 '说他两句'의 뜻으로 가장 알맞은 것은?",
          "options": [
            "그에게 두 문장을 가르치다",
            "그에게 한소리하다, 나무라다",
            "그를 칭찬하다",
            "그와 두 번 이야기하다"
          ],
          "answer": 1,
          "explanation": "'说 + 사람 + 两句'는 숫자 그대로 '두 마디'가 아니라 '몇 마디 나무라다, 한소리하다'라는 관용적 표현이에요. 아무나 子秋에게 이래라저래라 훈계한다는 아버지의 속상함이 담겨 있어요."
        }
      ],
      "level": "hsk4",
      "createdAt": "2026-10-26T12:10:51.576Z",
      "updatedAt": "2026-10-26T12:11:23.426Z"
    },
    "createdAt": "2026-10-26T00:00:00.000Z",
    "updatedAt": "2026-10-26T12:11:33.962Z",
    "captionMask": {
      "enabled": true,
      "top": 78,
      "height": 12,
      "width": 70
    },
    "courseId": "course-legacy"
  },
  {
    "id": "lesson-week02",
    "week": 2,
    "title": "친구를 돕고 응원하는 고등학교",
    "description": "학교에서 친구가 곤란한 상황에 처했을 때 서로 도와주고, 농구 경기를 하며 응원하는 장면 · 학습 주제: 중국 고등학교 생활, 또래관계, 교내 스포츠·응원문화",
    "direction": "zh-ko",
    "level": "hsk4",
    "status": "draft",
    "video": {
      "youtubeUrl": "https://youtu.be/EXUSxAKaLmI",
      "youtubeId": "EXUSxAKaLmI",
      "startTime": 2,
      "endTime": 308
    },
    "source": {
      "dramaTitle": "当我飞奔向你",
      "episode": "학습 클립"
    },
    "script": {
      "source": "srt",
      "cues": [
        {
          "start": 5,
          "end": 6,
          "zh": "啊啊"
        },
        {
          "start": 6,
          "end": 8,
          "zh": "好帅呀"
        },
        {
          "start": 15,
          "end": 17,
          "zh": "不好意思 同学"
        },
        {
          "start": 17,
          "end": 18,
          "zh": "能帮我抛过来吗"
        },
        {
          "start": 20,
          "end": 21,
          "zh": "哎"
        },
        {
          "start": 21,
          "end": 22,
          "zh": "一会儿我们去吃冰淇淋吧"
        },
        {
          "start": 22,
          "end": 22.5,
          "zh": "不是"
        },
        {
          "start": 23,
          "end": 24,
          "zh": "她什么人啊"
        },
        {
          "start": 24,
          "end": 26,
          "zh": "不帮忙就算了 怎么还这样啊"
        },
        {
          "start": 26,
          "end": 28,
          "zh": "算了 我们自己去捡吧"
        },
        {
          "start": 33,
          "end": 34,
          "zh": "这是你们的吧"
        },
        {
          "start": 34,
          "end": 36,
          "zh": "踢到我们这故意的"
        },
        {
          "start": 36,
          "end": 37,
          "zh": "什么情况"
        },
        {
          "start": 36,
          "end": 37,
          "zh": "求壮的他了不"
        },
        {
          "start": 37,
          "end": 41,
          "zh": "球撞到他了不至于这么多人来理论吧"
        },
        {
          "start": 41,
          "end": 42,
          "zh": "嗯"
        },
        {
          "start": 42,
          "end": 43,
          "zh": "那是我们的球"
        },
        {
          "start": 54.44,
          "end": 55,
          "zh": "谢谢"
        },
        {
          "start": 57,
          "end": 58.72,
          "zh": "都是高一的吧"
        },
        {
          "start": 59.72,
          "end": 60.64,
          "zh": "会打球吗"
        },
        {
          "start": 61.3,
          "end": 62.78,
          "zh": "不如我 教教你们啊"
        },
        {
          "start": 62.8,
          "end": 64,
          "zh": "不用了我们自己闹着玩呢"
        },
        {
          "start": 70,
          "end": 71,
          "zh": "哎 看那边"
        },
        {
          "start": 71,
          "end": 72,
          "zh": "你们女生打篮球"
        },
        {
          "start": 72,
          "end": 75,
          "zh": "不就是想打得更好嘛"
        },
        {
          "start": 75,
          "end": 76,
          "zh": "现在我们主动教你了"
        },
        {
          "start": 76,
          "end": 77,
          "zh": "还不乐意"
        },
        {
          "start": 77,
          "end": 79,
          "zh": "啊"
        },
        {
          "start": 79,
          "end": 80,
          "zh": "哦"
        },
        {
          "start": 80,
          "end": 81,
          "zh": "端着呢"
        },
        {
          "start": 81,
          "end": 82,
          "zh": "这点小心思呢"
        },
        {
          "start": 83,
          "end": 87.4,
          "zh": "就算是教 也得要水平高一点的来教吧"
        },
        {
          "start": 87.44,
          "end": 88.44,
          "zh": "你们"
        },
        {
          "start": 88.44,
          "end": 89.88,
          "zh": "哼"
        },
        {
          "start": 89.88,
          "end": 90.88,
          "zh": "没必要吧"
        },
        {
          "start": 92.28,
          "end": 93.28,
          "zh": "不是你什么意思啊"
        },
        {
          "start": 93.28,
          "end": 94.72,
          "zh": "意思是让你你闭嘴"
        },
        {
          "start": 102.92,
          "end": 104.8,
          "zh": "欺负女生觉得很光荣是吧"
        },
        {
          "start": 105,
          "end": 107,
          "zh": "关你什么事啊"
        },
        {
          "start": 107,
          "end": 108,
          "zh": "啊"
        },
        {
          "start": 108,
          "end": 109
        },
        {
          "start": 110,
          "end": 111,
          "zh": "打架我们会没兴趣这是球场"
        },
        {
          "start": 111,
          "end": 112,
          "zh": "当时打球啊"
        },
        {
          "start": 113,
          "end": 114,
          "zh": "李医上面"
        },
        {
          "start": 114,
          "end": 116,
          "zh": "我看你们球也挺好的"
        },
        {
          "start": 116,
          "end": 117,
          "zh": "他们正好要恋球"
        },
        {
          "start": 117,
          "end": 118,
          "zh": "如果你们输了的话"
        },
        {
          "start": 118,
          "end": 119,
          "zh": "把球给他们"
        },
        {
          "start": 121,
          "end": 122,
          "zh": "你这一天"
        },
        {
          "start": 122,
          "end": 123,
          "zh": "你这一天"
        },
        {
          "start": 123,
          "end": 124,
          "zh": "我这一天"
        },
        {
          "start": 124,
          "end": 129.92,
          "zh": "我这一天我这一天我这一天我这一天我这一天要恋求如果你们输了的话把球给他们"
        },
        {
          "start": 130.48,
          "end": 131.24,
          "zh": "李亏"
        },
        {
          "start": 132,
          "end": 133.12,
          "zh": "比就比"
        },
        {
          "start": 134.28,
          "end": 135.2,
          "zh": "不过我有个条件"
        },
        {
          "start": 136.24,
          "end": 136.88,
          "zh": "你们要输了"
        },
        {
          "start": 137.76,
          "end": 139,
          "zh": "就乖乖地给我们道个切"
        },
        {
          "start": 140.36,
          "end": 141.16,
          "zh": "我觉得"
        },
        {
          "start": 141.16,
          "end": 141.76,
          "zh": "好"
        },
        {
          "start": 145.12,
          "end": 146.96,
          "zh": "三位三怎么样就三位三 怎么样"
        },
        {
          "start": 148,
          "end": 149.2,
          "zh": "就三位三"
        },
        {
          "start": 152.6,
          "end": 153.72,
          "zh": "出名对比"
        },
        {
          "start": 153.72,
          "end": 155.28,
          "zh": "张农卿就不要太水"
        },
        {
          "start": 155.76,
          "end": 165,
          "zh": "甚至连过然都睡也浪不上我来 来来 来来 来 来来 来 来来 来 来 来"
        },
        {
          "start": 165,
          "end": 166,
          "zh": "来 来 来 来 来 来"
        },
        {
          "start": 166,
          "end": 167,
          "zh": "来 来 来 来 来 来 来"
        },
        {
          "start": 167,
          "end": 168,
          "zh": "来 来 来 来 来 来 来 来"
        },
        {
          "start": 168,
          "end": 169,
          "zh": "来 来 来 来 来 来 来"
        },
        {
          "start": 169,
          "end": 170,
          "zh": "来 来 来 来 来 来 来"
        },
        {
          "start": 170,
          "end": 171,
          "zh": "来 来 来 来 来 来 来 来 来 来"
        },
        {
          "start": 171,
          "end": 172,
          "zh": "来 来 来 来 来 来 来 来 来 来"
        },
        {
          "start": 172,
          "end": 173,
          "zh": "来 来 来 来 来 来 来 来 来"
        },
        {
          "start": 173,
          "end": 174,
          "zh": "来 来 来 来 来 来 来 来 来"
        },
        {
          "start": 174,
          "end": 175,
          "zh": "来 来 来 来 来 来 来"
        },
        {
          "start": 175,
          "end": 176,
          "zh": "来 来 来 来 来 来 来"
        },
        {
          "start": 176,
          "end": 177,
          "zh": "来 来 来 来 来 来 来 来 来"
        },
        {
          "start": 177,
          "end": 178,
          "zh": "来 来 来 来 来 来 来 来"
        },
        {
          "start": 178,
          "end": 179,
          "zh": "来 来 来 来 来 来 来 来 来 来"
        },
        {
          "start": 179,
          "end": 180,
          "zh": "来 来 来 来 来 来 来 来 来 来 来"
        },
        {
          "start": 180,
          "end": 181,
          "zh": "来 来 来 来 来 来 来 来 来 来"
        },
        {
          "start": 181,
          "end": 182,
          "zh": "来 来 来 来 来 来 来 来 来"
        },
        {
          "start": 182,
          "end": 183,
          "zh": "来 来 来 来 来 来 来 来 来 来 来"
        },
        {
          "start": 183,
          "end": 184,
          "zh": "来 来 来 来 来 来 来 来 来 来 来"
        },
        {
          "start": 184,
          "end": 185.44,
          "zh": "来 来 来 来 来 来 来 来 来 来 来 来 来 来 来 来来 来 来 来 来 来 来 来 来 来 来 来 来 你是看到那几个男生气务女的所以才来跟初期的都是一个班的肯定互短了"
        },
        {
          "start": 186.08,
          "end": 188.04,
          "zh": "而且张如让刚刚说好的时候"
        },
        {
          "start": 188.12,
          "end": 189.2,
          "zh": "是看着你说的"
        },
        {
          "start": 189.64,
          "end": 190.8,
          "zh": "没错 我也看见"
        },
        {
          "start": 191.2,
          "end": 191.76,
          "zh": "是吗"
        },
        {
          "start": 192.72,
          "end": 193.68,
          "zh": "我没注意看"
        },
        {
          "start": 194.72,
          "end": 195.72,
          "zh": "都是同学"
        },
        {
          "start": 195.96,
          "end": 196.88,
          "zh": "不想多忙嘛"
        },
        {
          "start": 201.36,
          "end": 202.4,
          "zh": "也不是他们班的"
        },
        {
          "start": 202.56,
          "end": 203.72,
          "zh": "他们记得我成亲"
        },
        {
          "start": 204.12,
          "end": 205,
          "zh": "其实是到天天尝尝张乌绕他们"
        },
        {
          "start": 212,
          "end": 214,
          "zh": "张乌绕的好漂亮"
        },
        {
          "start": 215,
          "end": 217,
          "zh": "张乌绕就是全脑了"
        },
        {
          "start": 226,
          "end": 228,
          "zh": "张乌绕 张乌绕 张乌绕 张乌绕 张乌绕 张乌绕 张乌绕 张乌绕 张乌绕 张乌绕 张乌绕 张乌绕 张乌绕 张乌绕 张乌绕 张乌绕 张乌绕 张乌绕 张乌绕 张乌绕 张乌绕 张乌绕 张乌绕 张乌绕 张乌绕 张乌绕 张乌绕 张乌绕 张乌绕 张乌绕 张乌绕 张乌绕 张乌绕 张乌绕 张乌绕 张乌绕 张乌绕 张乌绕 张乌绕 张乌绕 张乌绕 张乌绕 张乌绕 张乌绕 张乌绕 张乌绕 张乌绕 张乌绕 张乌绕 张乌绕 张乌绕 张乌绕 张乌绕 张乌绕 张乌绕 张乌绕 张乌绕 张乌绕 张乌绕 张乌绕 张乌绕 张乌绕 张乌绕 张乌绕 加油加油加油加油"
        },
        {
          "start": 228,
          "end": 230,
          "zh": "加油"
        },
        {
          "start": 230,
          "end": 232,
          "zh": "加油"
        },
        {
          "start": 232,
          "end": 234,
          "zh": "加油"
        },
        {
          "start": 234,
          "end": 236,
          "zh": "加油"
        },
        {
          "start": 236,
          "end": 238,
          "zh": "加油"
        },
        {
          "start": 238,
          "end": 240,
          "zh": "加油"
        },
        {
          "start": 240,
          "end": 242,
          "zh": "加油"
        },
        {
          "start": 242,
          "end": 244,
          "zh": "加油"
        },
        {
          "start": 244,
          "end": 251.52,
          "zh": "加油加油(我)"
        },
        {
          "start": 252.52,
          "end": 259,
          "zh": "大三"
        },
        {
          "start": 260,
          "end": 262,
          "zh": "(我)(我)"
        },
        {
          "start": 265,
          "end": 266,
          "zh": "不用再打了吧你不要不要"
        },
        {
          "start": 267,
          "end": 270,
          "zh": "不用再打了吧"
        },
        {
          "start": 271,
          "end": 272,
          "zh": "需要你我们走"
        },
        {
          "start": 272,
          "end": 273,
          "zh": "等会"
        },
        {
          "start": 274,
          "end": 276,
          "zh": "是不是忘点什么东西"
        },
        {
          "start": 276,
          "end": 277,
          "zh": "求留下"
        },
        {
          "start": 280,
          "end": 282,
          "zh": "要给求就走快点"
        },
        {
          "start": 282,
          "end": 283,
          "zh": "忙着下课"
        },
        {
          "start": 283,
          "end": 284,
          "zh": "走错了"
        },
        {
          "start": 284,
          "end": 289.36,
          "zh": "旁边那两个"
        },
        {
          "start": 290.2,
          "end": 290.7,
          "zh": "真心"
        },
        {
          "start": 291.68,
          "end": 292.92,
          "zh": "真搞不懂他们怎么想的哥不就往外观"
        },
        {
          "start": 292.92,
          "end": 293.42,
          "zh": "就是"
        },
        {
          "start": 302.36,
          "end": 303.32,
          "zh": "那两个马上"
        },
        {
          "start": 303.8,
          "end": 304.56,
          "zh": "五课"
        },
        {
          "start": 305.52,
          "end": 306.52,
          "zh": "你没要去啊你没要去啊你没要去啊你没要去啊"
        }
      ],
      "updatedAt": "2026-10-26T17:42:58.661Z",
      "origin": {
        "zh": {
          "provider": "srt",
          "fileName": "당아비분향니.srt",
          "fetchedAt": "2026-10-26T17:14:54.195Z",
          "edited": true
        }
      }
    },
    "draft": {
      "expressions": [
        {
          "id": "w2-exp1",
          "source": "加油！",
          "note": "힘내! 화이팅! 경기를 응원할 때 가장 많이 외치는 말",
          "at": null
        },
        {
          "id": "w2-exp2",
          "source": "别怕，有我呢",
          "note": "겁내지 마, 내가 있잖아. 곤란한 친구를 안심시키는 말",
          "at": null
        },
        {
          "id": "w2-exp3",
          "source": "谢谢你帮我",
          "note": "도와줘서 고마워",
          "at": null
        }
      ],
      "grammar": [
        {
          "id": "w2-gram1",
          "source": "帮 + 사람 + 동사",
          "note": "~를 도와 ~하다. 예) 帮我拿一下。(이것 좀 들어 줘)",
          "at": null
        },
        {
          "id": "w2-gram2",
          "source": "동사 + 得 + 평가",
          "note": "정도보어. 예) 你打得真好！(너 정말 잘한다)",
          "at": null
        }
      ],
      "lenses": [
        {
          "id": "w2-lens1",
          "title": "중국 고등학교의 반(班) 문화와 교내 경기",
          "source": "加油！",
          "text": "중국 고등학교는 반 단위 결속이 강하고, 班主任(담임 선생님)이 학생 생활 전반을 챙겨요. 篮球赛(농구 경기)는 반 대항으로 열리는 경우가 많아 반 친구들이 함께 모여 ‘加油！’를 외치며 응원해요.\n高考(대학 입시) 준비로 바쁜 학교생활 속에서 운동회와 교내 경기는 또래 관계가 깊어지는 계기가 돼요.",
          "at": null
        }
      ],
      "quiz": [
        {
          "id": "w2-quiz1",
          "question": "‘你打得真好’에서 ‘得’는 어떤 역할을 할까요?",
          "options": [
            "과거를 나타낸다",
            "부정을 나타낸다",
            "동작의 정도를 평가한다"
          ],
          "answer": 2,
          "explanation": "동사 + 得 + 평가는 동작을 얼마나 잘했는지 말하는 정도보어예요."
        },
        {
          "id": "w2-quiz2",
          "question": "반 대항 경기에서 친구를 응원할 때 외치는 말은?",
          "options": [
            "加油！",
            "再见！",
            "对不起！"
          ],
          "answer": 0,
          "explanation": "加油는 ‘힘내, 화이팅’이라는 응원의 말이에요."
        }
      ],
      "createdAt": "2026-10-26T00:00:00.000Z",
      "updatedAt": "2026-10-26T00:00:00.000Z"
    },
    "createdAt": "2026-10-26T00:00:00.000Z",
    "updatedAt": "2026-10-26T17:42:58.933Z",
    "captionMask": {
      "enabled": true,
      "top": 78,
      "height": 12,
      "width": 70
    },
    "courseId": "course-legacy"
  },
  {
    "id": "lesson-week03",
    "week": 3,
    "title": "장난과 호감을 말하는 일상 대화",
    "description": "친한 사람과 일상적인 대화를 나누며 장난을 치고 자신의 감정과 호감을 자연스럽게 표현하는 장면 · 학습 주제: 중국 청년의 일상 대화, 친밀한 관계에서의 구어체·장난·감정표현",
    "direction": "zh-ko",
    "level": "hsk4",
    "status": "draft",
    "video": {
      "youtubeUrl": "https://youtu.be/HDRFx2rtQ8o",
      "youtubeId": "HDRFx2rtQ8o",
      "startTime": 0,
      "endTime": 0
    },
    "source": {
      "dramaTitle": "偷偷藏不住",
      "episode": "학습 클립"
    },
    "script": {
      "source": "text",
      "cues": [],
      "updatedAt": null
    },
    "draft": {
      "expressions": [
        {
          "id": "w3-exp1",
          "source": "你干嘛呀",
          "note": "뭐 하는 거야~ 친한 사이에서 장난스럽게 핀잔 줄 때",
          "at": null
        },
        {
          "id": "w3-exp2",
          "source": "才不是呢",
          "note": "아니거든! 쑥스러움을 감추며 부정할 때",
          "at": null
        },
        {
          "id": "w3-exp3",
          "source": "我有点儿想你",
          "note": "좀 보고 싶어. 호감을 조심스럽게 드러내는 말",
          "at": null
        }
      ],
      "grammar": [
        {
          "id": "w3-gram1",
          "source": "呀 · 嘛 · 呢",
          "note": "어기조사. 문장 끝에 붙어 말투를 부드럽고 친밀하게 만들어요",
          "at": null
        },
        {
          "id": "w3-gram2",
          "source": "有点儿 + 형용사/감정",
          "note": "약간 ~하다. 주로 아쉬움·불만·감정을 살짝 드러낼 때 써요",
          "at": null
        }
      ],
      "lenses": [
        {
          "id": "w3-lens1",
          "title": "가까운 사이의 말투 — 어기조사와 ‘撒娇’",
          "source": "才不是呢",
          "text": "중국 청년들의 친밀한 대화에는 呀, 嘛, 啦, 呢 같은 어기조사가 자주 붙어 말투가 한결 부드러워져요. 상대에게 귀엽게 조르거나 투정하는 ‘撒娇’도 친구·연인 사이에서 자연스러운 감정 표현이에요.\n한국어의 ‘~잖아’, ‘~거든’ 같은 말끝과 비교하며 장면 속 말투를 들어 보세요.",
          "at": null
        }
      ],
      "quiz": [
        {
          "id": "w3-quiz1",
          "question": "‘才不是呢’는 어떤 뉘앙스일까요?",
          "options": [
            "쑥스러워하며 부정한다",
            "정중하게 사과한다",
            "길을 안내한다"
          ],
          "answer": 0,
          "explanation": "才不是呢는 ‘아니거든!’처럼 감정을 숨기며 부정하는 말이에요."
        },
        {
          "id": "w3-quiz2",
          "question": "‘有点儿’ 뒤에는 주로 어떤 말이 올까요?",
          "options": [
            "장소",
            "약간 아쉽거나 부정적인 감정·상태",
            "숫자"
          ],
          "answer": 1,
          "explanation": "有点儿累, 有点儿想你처럼 감정·상태를 살짝 드러낼 때 써요."
        }
      ],
      "createdAt": "2026-10-26T00:00:00.000Z",
      "updatedAt": "2026-10-26T00:00:00.000Z"
    },
    "createdAt": "2026-10-26T00:00:00.000Z",
    "updatedAt": "2026-10-26T00:00:00.000Z",
    "courseId": "course-legacy"
  },
  {
    "id": "lesson-week04",
    "week": 4,
    "title": "대학 기숙사에서 시작하는 새 생활",
    "description": "대학에 입학한 학생들이 새로운 환경에서 만나 기숙사·학교생활을 시작하며 서로 관계를 형성하는 장면 · 학습 주제: 중국 대학생활, 대학 기숙사 문화, 신입생·룸메이트 관계",
    "direction": "zh-ko",
    "level": "hsk2",
    "status": "draft",
    "video": {
      "youtubeUrl": "https://youtu.be/740asstFkb8",
      "youtubeId": "740asstFkb8",
      "startTime": 0,
      "endTime": 0
    },
    "source": {
      "dramaTitle": "机智的上半场",
      "episode": "학습 클립"
    },
    "script": {
      "source": "text",
      "cues": [],
      "updatedAt": null
    },
    "draft": {
      "expressions": [
        {
          "id": "w4-exp1",
          "source": "你是哪个专业的？",
          "note": "너는 무슨 전공이야? 신입생끼리 처음 묻는 말",
          "at": null
        },
        {
          "id": "w4-exp2",
          "source": "我们是室友",
          "note": "우리는 룸메이트야",
          "at": null
        },
        {
          "id": "w4-exp3",
          "source": "以后多关照",
          "note": "앞으로 잘 부탁해. 새로 만난 사람에게 건네는 인사",
          "at": null
        }
      ],
      "grammar": [
        {
          "id": "w4-gram1",
          "source": "是……的",
          "note": "이미 일어난 일의 때·곳·방식을 강조해요. 예) 你是从哪儿来的？",
          "at": null
        },
        {
          "id": "w4-gram2",
          "source": "一起 + 동사 + 吧",
          "note": "같이 ~하자. 예) 一起去食堂吧。",
          "at": null
        }
      ],
      "lenses": [
        {
          "id": "w4-lens1",
          "title": "중국 대학의 기숙사 생활",
          "source": "我们是室友",
          "text": "중국 대학생 대부분은 캠퍼스 안 宿舍(기숙사)에서 4~6인실로 생활해요. 같은 방 친구 ‘室友’와 졸업할 때까지 함께 지내는 경우가 많아, 나이 순서대로 老大·老二라고 부르기도 해요.\n食堂(학생식당), 입학 초의 军训(신입생 군사훈련)처럼 한국과 다른 신입생 문화도 있어요.",
          "at": null
        }
      ],
      "quiz": [
        {
          "id": "w4-quiz1",
          "question": "‘室友’의 뜻은?",
          "options": [
            "동아리",
            "룸메이트",
            "담임 선생님"
          ],
          "answer": 1,
          "explanation": "室友는 같은 방을 쓰는 친구, 룸메이트예요."
        },
        {
          "id": "w4-quiz2",
          "question": "중국 대학 신입생이 입학 초에 받는 훈련은?",
          "options": [
            "高考",
            "实习",
            "军训"
          ],
          "answer": 2,
          "explanation": "军训은 신입생 군사훈련이에요. 高考는 대학 입시, 实习는 인턴십이에요."
        }
      ],
      "createdAt": "2026-10-26T00:00:00.000Z",
      "updatedAt": "2026-10-26T00:00:00.000Z"
    },
    "createdAt": "2026-10-26T00:00:00.000Z",
    "updatedAt": "2026-10-26T00:00:00.000Z",
    "courseId": "course-legacy"
  },
  {
    "id": "lesson-week05",
    "week": 5,
    "title": "신입 변호사의 첫 회의",
    "description": "신입 변호사 成瑶가 직장 회의에 참여하며 상사·동료들과 업무 상황에서 소통하는 장면 · 학습 주제: 중국 청년의 직장생활, 회사 회의문화, 직장 내 상하관계·업무 의사소통",
    "direction": "zh-ko",
    "level": "hsk4",
    "status": "draft",
    "video": {
      "youtubeUrl": "https://youtu.be/EI6Qjxfsfm8",
      "youtubeId": "EI6Qjxfsfm8",
      "startTime": 0,
      "endTime": 0
    },
    "source": {
      "dramaTitle": "你也有今天",
      "episode": "학습 클립"
    },
    "script": {
      "source": "text",
      "cues": [],
      "updatedAt": null
    },
    "draft": {
      "expressions": [
        {
          "id": "w5-exp1",
          "source": "我补充一点",
          "note": "한 가지 덧붙이겠습니다. 회의에서 의견을 더할 때",
          "at": null
        },
        {
          "id": "w5-exp2",
          "source": "收到",
          "note": "알겠습니다. 업무 지시를 짧게 확인하는 말",
          "at": null
        },
        {
          "id": "w5-exp3",
          "source": "辛苦了",
          "note": "수고하셨습니다",
          "at": null
        }
      ],
      "grammar": [
        {
          "id": "w5-gram1",
          "source": "关于……",
          "note": "~에 관해. 예) 关于这个案子，我有个想法。",
          "at": null
        },
        {
          "id": "w5-gram2",
          "source": "按照……",
          "note": "~에 따라. 예) 按照您的意思修改。",
          "at": null
        }
      ],
      "lenses": [
        {
          "id": "w5-lens1",
          "title": "중국 직장의 회의와 호칭",
          "source": "收到",
          "text": "중국 회사에서는 상사를 성 + 직함(王律师, 张总)으로 불러요. 회의에서 신입은 먼저 묻는 말에 답하고, 의견을 낼 때는 ‘我补充一点’처럼 조심스럽게 꺼내는 경우가 많아요.\n업무 지시에는 ‘收到’, ‘好的’로 짧게 확인하는데, 이 문화는 업무 메신저(微信) 대화까지 이어져요.",
          "at": null
        }
      ],
      "quiz": [
        {
          "id": "w5-quiz1",
          "question": "상사의 업무 지시에 짧게 확인하는 말은?",
          "options": [
            "生日快乐",
            "加油",
            "收到"
          ],
          "answer": 2,
          "explanation": "收到는 ‘(지시를) 받았습니다, 알겠습니다’라는 뜻이에요."
        },
        {
          "id": "w5-quiz2",
          "question": "중국 직장에서 상사를 부르는 일반적인 방식은?",
          "options": [
            "성 + 직함",
            "이름만",
            "哥哥·姐姐"
          ],
          "answer": 0,
          "explanation": "王律师, 张总처럼 성과 직함을 함께 불러요."
        }
      ],
      "createdAt": "2026-10-26T00:00:00.000Z",
      "updatedAt": "2026-10-26T00:00:00.000Z"
    },
    "createdAt": "2026-10-26T00:00:00.000Z",
    "updatedAt": "2026-10-26T00:00:00.000Z",
    "courseId": "course-legacy"
  },
  {
    "id": "lesson-week06",
    "week": 6,
    "title": "웨이보로 공개하는 연애",
    "description": "韩商言이 자신의 감정을 드러내고 웨이보를 통해 연인 관계를 공개적으로 표현하는 장면 · 학습 주제: 중국의 微博·SNS 문화, 온라인 자기표현·소통 방식, 공개연애 문화",
    "direction": "zh-ko",
    "level": "hsk4",
    "status": "draft",
    "video": {
      "youtubeUrl": "https://youtu.be/VKHoF12BjBI",
      "youtubeId": "VKHoF12BjBI",
      "startTime": 0,
      "endTime": 0
    },
    "source": {
      "dramaTitle": "亲爱的，热爱的",
      "episode": "학습 클립"
    },
    "script": {
      "source": "text",
      "cues": [],
      "updatedAt": null
    },
    "draft": {
      "expressions": [
        {
          "id": "w6-exp1",
          "source": "官宣",
          "note": "공식 발표. 연애·결혼 사실을 SNS로 공개할 때 쓰는 유행어",
          "at": null
        },
        {
          "id": "w6-exp2",
          "source": "转发",
          "note": "(게시물을) 공유하다, 리트윗하다",
          "at": null
        },
        {
          "id": "w6-exp3",
          "source": "上热搜",
          "note": "실시간 인기 검색어에 오르다",
          "at": null
        }
      ],
      "grammar": [
        {
          "id": "w6-gram1",
          "source": "把 + 목적어 + 동사",
          "note": "~을 ~하다(처치). 예) 把照片发到微博上。",
          "at": null
        },
        {
          "id": "w6-gram2",
          "source": "被 + 사람 + 동사",
          "note": "~에게 ~당하다(피동). 예) 被大家看到了。",
          "at": null
        }
      ],
      "lenses": [
        {
          "id": "w6-lens1",
          "title": "微博와 ‘官宣’ 문화",
          "source": "官宣",
          "text": "微博(웨이보)는 중국의 대표 SNS로, 연예인과 일반인이 공개적으로 소식을 알리는 공간이에요. 연애나 결혼을 공개할 때 ‘官宣’이라는 말과 함께 사진을 올리는 것이 유행이 되었어요.\n댓글(评论), 转发, 点赞(좋아요), 热搜(실시간 인기 검색)가 여론을 만드는 방식을 한국의 인스타그램 공개 연애와 비교해 보세요.",
          "at": null
        }
      ],
      "quiz": [
        {
          "id": "w6-quiz1",
          "question": "연애 사실을 SNS로 공식 공개하는 것을 뜻하는 말은?",
          "options": [
            "官宣",
            "加班",
            "军训"
          ],
          "answer": 0,
          "explanation": "官宣은 ‘공식 발표’라는 뜻의 유행어예요."
        },
        {
          "id": "w6-quiz2",
          "question": "‘把照片发到微博上’의 뜻은?",
          "options": [
            "웨이보를 탈퇴하다",
            "사진을 웨이보에 올리다",
            "사진을 지우다"
          ],
          "answer": 1,
          "explanation": "把 구문으로 ‘사진을’ 어떻게 처리하는지(웨이보에 올리다) 말해요."
        }
      ],
      "createdAt": "2026-10-26T00:00:00.000Z",
      "updatedAt": "2026-10-26T00:00:00.000Z"
    },
    "createdAt": "2026-10-26T00:00:00.000Z",
    "updatedAt": "2026-10-26T00:00:00.000Z",
    "courseId": "course-legacy"
  },
  {
    "id": "lesson-week07",
    "week": 7,
    "title": "서재를 정리하며 나누는 대화",
    "description": "연인이 집에서 서재를 정리하고 물건을 발견하며 자연스럽게 대화를 나누는 장면 · 학습 주제: 중국 청년의 일상생활, 집안일·물건 정리 관련 어휘, 친밀한 관계에서의 생활 구어체",
    "direction": "zh-ko",
    "level": "hsk4",
    "status": "draft",
    "video": {
      "youtubeUrl": "https://youtu.be/nsN027-e1nI",
      "youtubeId": "nsN027-e1nI",
      "startTime": 0,
      "endTime": 0
    },
    "source": {
      "dramaTitle": "私藏浪漫",
      "episode": "학습 클립"
    },
    "script": {
      "source": "text",
      "cues": [],
      "updatedAt": null
    },
    "draft": {
      "expressions": [
        {
          "id": "w7-exp1",
          "source": "这是什么？",
          "note": "이게 뭐야? 물건을 발견했을 때",
          "at": null
        },
        {
          "id": "w7-exp2",
          "source": "放哪儿？",
          "note": "어디에 둬? 정리하면서 묻는 말",
          "at": null
        },
        {
          "id": "w7-exp3",
          "source": "原来你还留着",
          "note": "알고 보니 아직 갖고 있었구나",
          "at": null
        }
      ],
      "grammar": [
        {
          "id": "w7-gram1",
          "source": "把 + 물건 + 放在 + 장소",
          "note": "물건을 ~에 두다. 예) 把书放在书架上。",
          "at": null
        },
        {
          "id": "w7-gram2",
          "source": "收起来 · 拿出来",
          "note": "방향보어. 정리해 넣다 / 꺼내다",
          "at": null
        }
      ],
      "lenses": [
        {
          "id": "w7-lens1",
          "title": "집안일과 생활 어휘",
          "source": "原来你还留着",
          "text": "收拾(정리하다), 书房(서재), 书架(책장), 箱子(상자), 扔掉(버리다)처럼 정리할 때 쓰는 생활 어휘를 장면에서 찾아보세요. 함께 정리하며 나누는 대화에는 짧은 질문과 감탄이 많아요.\n중국 청년층에서는 집안일을 함께 나누는 ‘分担家务’에 대한 생각도 달라지고 있어요.",
          "at": null
        }
      ],
      "quiz": [
        {
          "id": "w7-quiz1",
          "question": "‘把书放在书架上’의 뜻은?",
          "options": [
            "책을 읽다",
            "책을 책장에 두다",
            "책을 사다"
          ],
          "answer": 1,
          "explanation": "把 + 물건 + 放在 + 장소는 ‘물건을 ~에 두다’예요."
        },
        {
          "id": "w7-quiz2",
          "question": "‘原来’가 나타내는 뉘앙스는?",
          "options": [
            "미래의 계획",
            "명령",
            "몰랐던 사실을 알게 됨"
          ],
          "answer": 2,
          "explanation": "原来는 ‘알고 보니’라는 뜻으로 새로 알게 된 사실을 말해요."
        }
      ],
      "createdAt": "2026-10-26T00:00:00.000Z",
      "updatedAt": "2026-10-26T00:00:00.000Z"
    },
    "createdAt": "2026-10-26T00:00:00.000Z",
    "updatedAt": "2026-10-26T00:00:00.000Z",
    "courseId": "course-legacy"
  },
  {
    "id": "lesson-week08",
    "week": 8,
    "title": "가족을 만나고 청혼하기",
    "description": "靳朝가 연인의 가족을 만나고 반지를 준비해 청혼하며 결혼을 준비하는 장면 · 학습 주제: 중국의 见家长·求婚 문화, 현대 청년의 연애·결혼관, 가족과 결혼의 관계",
    "direction": "zh-ko",
    "level": "hsk5",
    "status": "draft",
    "video": {
      "youtubeUrl": "https://youtu.be/or355SyHlTg",
      "youtubeId": "or355SyHlTg",
      "startTime": 0,
      "endTime": 0
    },
    "source": {
      "dramaTitle": "双轨",
      "episode": "학습 클립"
    },
    "script": {
      "source": "text",
      "cues": [],
      "updatedAt": null
    },
    "draft": {
      "expressions": [
        {
          "id": "w8-exp1",
          "source": "叔叔阿姨好",
          "note": "(연인의 부모님께) 안녕하세요",
          "at": null
        },
        {
          "id": "w8-exp2",
          "source": "嫁给我吧",
          "note": "나와 결혼해 줘. 청혼할 때",
          "at": null
        },
        {
          "id": "w8-exp3",
          "source": "我会对她好的",
          "note": "그녀에게 잘할게요",
          "at": null
        }
      ],
      "grammar": [
        {
          "id": "w8-gram1",
          "source": "会……的",
          "note": "앞으로 꼭 ~할 것이다(의지·약속). 예) 我会照顾好她的。",
          "at": null
        },
        {
          "id": "w8-gram2",
          "source": "一辈子",
          "note": "평생. 예) 我想和你过一辈子。",
          "at": null
        }
      ],
      "lenses": [
        {
          "id": "w8-lens1",
          "title": "‘见家长’와 청혼 문화",
          "source": "叔叔阿姨好",
          "text": "결혼을 생각하는 연인이 상대 부모를 처음 만나는 ‘见家长’은 중요한 관문이에요. 부모님을 ‘叔叔·阿姨’라고 부르고 선물을 준비해 가요.\n결혼을 앞두고 남자 측이 여자 측에 보내는 彩礼(예물·예단금) 관습과, 이에 대한 청년층의 부담과 생각 변화도 함께 이야기해 볼 수 있어요.",
          "at": null
        }
      ],
      "quiz": [
        {
          "id": "w8-quiz1",
          "question": "연인의 부모님을 처음 뵐 때 부르는 호칭은?",
          "options": [
            "哥哥、姐姐",
            "老师",
            "叔叔、阿姨"
          ],
          "answer": 2,
          "explanation": "친구·연인의 부모님은 叔叔(아저씨), 阿姨(아주머니)라고 불러요."
        },
        {
          "id": "w8-quiz2",
          "question": "‘见家长’의 뜻은?",
          "options": [
            "상대 부모님을 만나다",
            "회사 면접을 보다",
            "가족 여행을 가다"
          ],
          "answer": 0,
          "explanation": "见家长은 연인의 부모님께 인사드리러 가는 것이에요."
        }
      ],
      "createdAt": "2026-10-26T00:00:00.000Z",
      "updatedAt": "2026-10-26T00:00:00.000Z"
    },
    "createdAt": "2026-10-26T00:00:00.000Z",
    "updatedAt": "2026-10-26T00:00:00.000Z",
    "courseId": "course-legacy"
  },
  {
    "id": "lesson-week09",
    "week": 9,
    "title": "마을 할머니들과 가까워지기",
    "description": "서울에서 온 혜진이 공진의 할머니들과 교류하며 점차 가까워지는 장면 · 학습 주제: 세대가 다른 상대와 대화할 때 사용하는 중국어 호칭·부탁·권유·배려 표현",
    "direction": "ko-zh",
    "level": "hsk2",
    "status": "draft",
    "video": {
      "youtubeUrl": "https://youtu.be/lG_Y-CiPZd4",
      "youtubeId": "lG_Y-CiPZd4",
      "startTime": 0,
      "endTime": 0
    },
    "source": {
      "dramaTitle": "갯마을 차차차",
      "episode": "학습 클립"
    },
    "script": {
      "source": "text",
      "cues": [],
      "updatedAt": null
    },
    "draft": {
      "expressions": [
        {
          "id": "w9-exp1",
          "source": "할머니, 제가 도와드릴게요",
          "note": "奶奶，我来帮您吧。 ‘您’으로 존중을 나타내요",
          "at": null
        },
        {
          "id": "w9-exp2",
          "source": "식사하셨어요?",
          "note": "您吃饭了吗？ 인사처럼 쓰는 안부",
          "at": null
        },
        {
          "id": "w9-exp3",
          "source": "천천히 하세요",
          "note": "您慢点儿。 어르신을 배려하는 말",
          "at": null
        }
      ],
      "grammar": [
        {
          "id": "w9-gram1",
          "source": "~해 드릴게요",
          "note": "我来 + 동사。 예) 我来拿吧。(제가 들게요)",
          "at": null
        },
        {
          "id": "w9-gram2",
          "source": "~해 주시겠어요?",
          "note": "麻烦您……可以吗？ 공손하게 부탁하는 말",
          "at": null
        }
      ],
      "lenses": [
        {
          "id": "w9-lens1",
          "title": "어르신 호칭과 높임을 중국어로",
          "source": "할머니",
          "text": "한국에서 남의 할머니도 ‘할머니’라고 부르듯, 중국에서도 낯선 어르신을 奶奶·大爷·阿姨라고 불러요.\n중국어에는 한국어 같은 존댓말 어미가 없는 대신 ‘您’, ‘请’, ‘麻烦您’ 같은 말로 높임과 배려를 나타내요. 혜진의 말투가 처음과 나중에 어떻게 달라지는지 살펴보세요.",
          "at": null
        }
      ],
      "quiz": [
        {
          "id": "w9-quiz1",
          "question": "어르신께 존중을 나타내는 2인칭은?",
          "options": [
            "您",
            "你们",
            "他"
          ],
          "answer": 0,
          "explanation": "您은 ‘당신’을 높여 부르는 말이에요."
        },
        {
          "id": "w9-quiz2",
          "question": "‘부탁드려도 될까요?’에 가까운 표현은?",
          "options": [
            "我不知道。",
            "麻烦您……可以吗？",
            "别管我。"
          ],
          "answer": 1,
          "explanation": "麻烦您은 ‘번거롭게 해 드려 죄송하지만’이라는 공손한 부탁이에요."
        }
      ],
      "createdAt": "2026-10-26T00:00:00.000Z",
      "updatedAt": "2026-10-26T00:00:00.000Z"
    },
    "createdAt": "2026-10-26T00:00:00.000Z",
    "updatedAt": "2026-10-26T00:00:00.000Z",
    "courseId": "course-legacy"
  },
  {
    "id": "lesson-week10",
    "week": 10,
    "title": "전학 온 날, 친구와 떡볶이",
    "description": "전학 온 주경이 새 학교에서 친구들과 가까워지고, 방과 후 함께 떡볶이를 먹으며 대화하는 장면 · 학습 주제: 친구와 친해지고 함께 식사할 때 사용하는 자연스러운 중국어 일상 구어체",
    "direction": "ko-zh",
    "level": "hsk2",
    "status": "draft",
    "video": {
      "youtubeUrl": "https://youtu.be/hfImf1EdDkM",
      "youtubeId": "hfImf1EdDkM",
      "startTime": 0,
      "endTime": 0
    },
    "source": {
      "dramaTitle": "여신강림",
      "episode": "학습 클립"
    },
    "script": {
      "source": "text",
      "cues": [],
      "updatedAt": null
    },
    "draft": {
      "expressions": [
        {
          "id": "w10-exp1",
          "source": "같이 떡볶이 먹으러 갈래?",
          "note": "一起去吃辣炒年糕吧？ 떡볶이는 ‘辣炒年糕’",
          "at": null
        },
        {
          "id": "w10-exp2",
          "source": "나 전학 왔어",
          "note": "我是转学过来的。",
          "at": null
        },
        {
          "id": "w10-exp3",
          "source": "완전 맛있어!",
          "note": "太好吃了！ 친구끼리 쓰는 감탄",
          "at": null
        }
      ],
      "grammar": [
        {
          "id": "w10-gram1",
          "source": "~하러 가다",
          "note": "去 + 동사。 예) 去吃饭。(밥 먹으러 가다)",
          "at": null
        },
        {
          "id": "w10-gram2",
          "source": "~할래?",
          "note": "……吧？ / 要不要……？ 가볍게 제안하는 말",
          "at": null
        }
      ],
      "lenses": [
        {
          "id": "w10-lens1",
          "title": "방과 후 분식 문화를 중국어로",
          "source": "떡볶이",
          "text": "한국 학생들이 하교 후 분식집에 들르듯, 중국 학생들에게는 학교 앞 小吃摊(노점)과 奶茶店(밀크티 가게)이 비슷한 역할을 해요.\n떡볶이(辣炒年糕), 김밥(紫菜包饭), 순대(米肠) 같은 음식 이름과, 계산할 때 쓰는 ‘我请客’(내가 쏠게), ‘AA吧’(더치페이하자)도 함께 익혀요.",
          "at": null
        }
      ],
      "quiz": [
        {
          "id": "w10-quiz1",
          "question": "‘내가 쏠게’에 해당하는 표현은?",
          "options": [
            "我加班",
            "我请客",
            "我转学"
          ],
          "answer": 1,
          "explanation": "我请客는 ‘내가 대접할게’라는 뜻이에요."
        },
        {
          "id": "w10-quiz2",
          "question": "떡볶이의 중국어 이름은?",
          "options": [
            "紫菜包饭",
            "饺子",
            "辣炒年糕"
          ],
          "answer": 2,
          "explanation": "辣炒年糕는 ‘맵게 볶은 떡’이라는 뜻이에요. 紫菜包饭은 김밥이에요."
        }
      ],
      "createdAt": "2026-10-26T00:00:00.000Z",
      "updatedAt": "2026-10-26T00:00:00.000Z"
    },
    "createdAt": "2026-10-26T00:00:00.000Z",
    "updatedAt": "2026-10-26T00:00:00.000Z",
    "courseId": "course-legacy"
  },
  {
    "id": "lesson-week11",
    "week": 11,
    "title": "과수원에서 보내는 가족의 하루",
    "description": "퀸즈가 가족이 용두리에서 지내며 과수원에서 과일을 따고, 평소와 다른 농촌의 일상을 경험하는 장면 · 학습 주제: 가족과 함께 생활하며 부탁·권유하고 반응할 때 사용하는 중국어 생활 표현",
    "direction": "ko-zh",
    "level": "hsk4",
    "status": "draft",
    "video": {
      "youtubeUrl": "https://youtu.be/9NhVCC42yvk",
      "youtubeId": "9NhVCC42yvk",
      "startTime": 0,
      "endTime": 0
    },
    "source": {
      "dramaTitle": "눈물의 여왕",
      "episode": "학습 클립"
    },
    "script": {
      "source": "text",
      "cues": [],
      "updatedAt": null
    },
    "draft": {
      "expressions": [
        {
          "id": "w11-exp1",
          "source": "이것 좀 들어 줄래?",
          "note": "帮我拿一下这个，好吗？",
          "at": null
        },
        {
          "id": "w11-exp2",
          "source": "한번 먹어 봐",
          "note": "你尝尝。 동사를 겹쳐 가볍게 권해요",
          "at": null
        },
        {
          "id": "w11-exp3",
          "source": "생각보다 재밌네",
          "note": "比想象中有意思。",
          "at": null
        }
      ],
      "grammar": [
        {
          "id": "w11-gram1",
          "source": "~해 보다",
          "note": "동사 중첩: 尝尝 · 试试 · 看看 — 가볍게 한번 해 보다",
          "at": null
        },
        {
          "id": "w11-gram2",
          "source": "~보다 더 ~하다",
          "note": "A 比 B + 형용사。 예) 这里比首尔安静。",
          "at": null
        }
      ],
      "lenses": [
        {
          "id": "w11-lens1",
          "title": "도시 가족의 농촌 생활",
          "source": "한번 먹어 봐",
          "text": "중국에서도 도시 가족이 농촌을 찾아 摘果子(과일 따기)나 农家乐(농가 체험)를 즐기는 것이 인기예요.\n시골 어르신의 투박하고 정 많은 권유(‘吃吧吃吧！’)와 도시 사람의 조심스러운 반응을 중국어로 어떻게 옮길지 생각해 보세요.",
          "at": null
        }
      ],
      "quiz": [
        {
          "id": "w11-quiz1",
          "question": "‘你尝尝’의 뉘앙스는?",
          "options": [
            "강하게 명령한다",
            "거절한다",
            "가볍게 권유한다"
          ],
          "answer": 2,
          "explanation": "동사 중첩(尝尝)은 ‘한번 ~해 봐’처럼 부드럽게 권하는 말이에요."
        },
        {
          "id": "w11-quiz2",
          "question": "‘생각보다’에 해당하는 표현은?",
          "options": [
            "比想象中",
            "关于",
            "原来"
          ],
          "answer": 0,
          "explanation": "比想象中有意思 = 생각보다 재미있다."
        }
      ],
      "createdAt": "2026-10-26T00:00:00.000Z",
      "updatedAt": "2026-10-26T00:00:00.000Z"
    },
    "createdAt": "2026-10-26T00:00:00.000Z",
    "updatedAt": "2026-10-26T00:00:00.000Z",
    "courseId": "course-legacy"
  },
  {
    "id": "lesson-week12",
    "week": 12,
    "title": "직장 고민을 털어놓는 쌍둥이",
    "description": "직장생활로 힘들어하는 미래가 쌍둥이 동생 미지에게 자신의 상황과 고민을 털어놓고, 두 사람이 서로의 삶을 바꿔 살아보기로 이야기하는 장면 · 학습 주제: 직장 고민을 털어놓고 위로·조언하며 의논할 때 사용하는 중국어 표현",
    "direction": "ko-zh",
    "level": "hsk4",
    "status": "draft",
    "video": {
      "youtubeUrl": "https://youtu.be/-TNPwK65FKI",
      "youtubeId": "-TNPwK65FKI",
      "startTime": 0,
      "endTime": 0
    },
    "source": {
      "dramaTitle": "미지의 서울",
      "episode": "학습 클립"
    },
    "script": {
      "source": "text",
      "cues": [],
      "updatedAt": null
    },
    "draft": {
      "expressions": [
        {
          "id": "w12-exp1",
          "source": "나 요즘 회사 때문에 너무 힘들어",
          "note": "我最近因为工作特别累。",
          "at": null
        },
        {
          "id": "w12-exp2",
          "source": "괜찮아, 내가 있잖아",
          "note": "没事，有我在呢。",
          "at": null
        },
        {
          "id": "w12-exp3",
          "source": "우리 서로 바꿔 살아 볼까?",
          "note": "要不我们换着过一阵子？",
          "at": null
        }
      ],
      "grammar": [
        {
          "id": "w12-gram1",
          "source": "~때문에 ~하다",
          "note": "因为……，所以……。 이유와 결과",
          "at": null
        },
        {
          "id": "w12-gram2",
          "source": "그럼 ~할까?",
          "note": "要不……？ 대안을 제안하는 말",
          "at": null
        }
      ],
      "lenses": [
        {
          "id": "w12-lens1",
          "title": "직장 고민을 말하는 중국 청년의 말",
          "source": "회사 때문에 너무 힘들어",
          "text": "중국 청년들은 ‘内卷’(과도한 경쟁), ‘打工人’(스스로를 낮춰 부르는 직장인) 같은 신조어로 직장 스트레스를 표현해요.\n위로할 때는 ‘别太累了’(너무 무리하지 마), ‘慢慢来’(천천히 해)를 많이 써요. 한국의 ‘번아웃’과 비교해 보세요.",
          "at": null
        }
      ],
      "quiz": [
        {
          "id": "w12-quiz1",
          "question": "‘要不我们换一下？’에서 ‘要不’의 역할은?",
          "options": [
            "대안을 제안한다",
            "과거를 나타낸다",
            "금지한다"
          ],
          "answer": 0,
          "explanation": "要不는 ‘그럼 ~할까?’처럼 대안을 제안해요."
        },
        {
          "id": "w12-quiz2",
          "question": "직장인이 스스로를 낮춰 부르는 유행어는?",
          "options": [
            "官宣",
            "打工人",
            "室友"
          ],
          "answer": 1,
          "explanation": "打工人은 ‘일하는 사람’이라는 뜻의 자조적인 유행어예요."
        }
      ],
      "createdAt": "2026-10-26T00:00:00.000Z",
      "updatedAt": "2026-10-26T00:00:00.000Z"
    },
    "createdAt": "2026-10-26T00:00:00.000Z",
    "updatedAt": "2026-10-26T00:00:00.000Z",
    "courseId": "course-legacy"
  },
  {
    "id": "lesson-week13",
    "week": 13,
    "title": "친구들과 떠난 수학여행",
    "description": "태양고 친구들과 이진이 함께 수학여행을 떠나 장난을 치고 다양한 이야기를 나누는 장면 · 학습 주제: 친구 사이의 제안·재촉·불평·장난·감탄·동의·반응 등 자연스러운 중국어 일상 구어체",
    "direction": "ko-zh",
    "level": "hsk4",
    "status": "draft",
    "video": {
      "youtubeUrl": "https://youtu.be/JGye3BHSHZ4",
      "youtubeId": "JGye3BHSHZ4",
      "startTime": 0,
      "endTime": 0
    },
    "source": {
      "dramaTitle": "스물다섯 스물하나",
      "episode": "학습 클립"
    },
    "script": {
      "source": "text",
      "cues": [],
      "updatedAt": null
    },
    "draft": {
      "expressions": [
        {
          "id": "w13-exp1",
          "source": "빨리 와!",
          "note": "快点儿！ 재촉할 때",
          "at": null
        },
        {
          "id": "w13-exp2",
          "source": "말도 안 돼!",
          "note": "怎么可能！ / 不会吧！ 놀라거나 믿기지 않을 때",
          "at": null
        },
        {
          "id": "w13-exp3",
          "source": "나도 그렇게 생각해",
          "note": "我也这么觉得。 동의할 때",
          "at": null
        }
      ],
      "grammar": [
        {
          "id": "w13-gram1",
          "source": "너무 ~하다!",
          "note": "太……了！ 감탄. 예) 太好玩儿了！",
          "at": null
        },
        {
          "id": "w13-gram2",
          "source": "곧 ~하다",
          "note": "快……了。 예) 快到了。(거의 다 왔어)",
          "at": null
        }
      ],
      "lenses": [
        {
          "id": "w13-lens1",
          "title": "수학여행과 친구 사이의 말",
          "source": "빨리 와!",
          "text": "중국 학교의 단체 나들이는 春游·秋游(봄·가을 소풍), 졸업 즈음에는 毕业旅行(졸업 여행)이라고 해요.\n친구끼리의 재촉·불평·감탄은 짧고 리듬감 있는 구어로 옮겨야 자연스러워요. 1998년 IMF라는 시대 배경은 중국 시청자에게 따로 설명이 필요할 수 있어요.",
          "at": null
        }
      ],
      "quiz": [
        {
          "id": "w13-quiz1",
          "question": "‘말도 안 돼!’에 가까운 표현은?",
          "options": [
            "您慢点儿。",
            "怎么可能！",
            "收到。"
          ],
          "answer": 1,
          "explanation": "怎么可能은 ‘어떻게 그럴 수 있어!’라는 놀람의 표현이에요."
        },
        {
          "id": "w13-quiz2",
          "question": "중국 학교의 봄 소풍을 뜻하는 말은?",
          "options": [
            "军训",
            "热搜",
            "春游"
          ],
          "answer": 2,
          "explanation": "春游는 봄 나들이·소풍이에요."
        }
      ],
      "createdAt": "2026-10-26T00:00:00.000Z",
      "updatedAt": "2026-10-26T00:00:00.000Z"
    },
    "createdAt": "2026-10-26T00:00:00.000Z",
    "updatedAt": "2026-10-26T00:00:00.000Z",
    "courseId": "course-legacy"
  },
  {
    "id": "lesson-week14",
    "week": 14,
    "title": "함께 의논해 문제를 해결하기",
    "description": "삼달의 억울함을 풀고 전시회를 지키기 위해 친구들과 주변 사람들이 함께 방법을 의논하고 역할을 나누어 문제를 해결하는 장면 · 학습 주제: 의견 제안·의견 묻기·역할 분담·도움 요청·격려 등 여러 사람이 함께 문제를 해결할 때 사용하는 중국어 표현",
    "direction": "ko-zh",
    "level": "hsk5",
    "status": "draft",
    "video": {
      "youtubeUrl": "https://youtu.be/LxbKY6OxXBY",
      "youtubeId": "LxbKY6OxXBY",
      "startTime": 0,
      "endTime": 0
    },
    "source": {
      "dramaTitle": "웰컴투 삼달리",
      "episode": "학습 클립"
    },
    "script": {
      "source": "text",
      "cues": [],
      "updatedAt": null
    },
    "draft": {
      "expressions": [
        {
          "id": "w14-exp1",
          "source": "우리 어떻게 하면 좋을까?",
          "note": "我们该怎么办？",
          "at": null
        },
        {
          "id": "w14-exp2",
          "source": "이건 내가 맡을게",
          "note": "这个交给我吧。",
          "at": null
        },
        {
          "id": "w14-exp3",
          "source": "우리 할 수 있어!",
          "note": "我们一定可以的！",
          "at": null
        }
      ],
      "grammar": [
        {
          "id": "w14-gram1",
          "source": "네 생각은 어때?",
          "note": "你觉得呢？ 의견을 묻는 짧은 말",
          "at": null
        },
        {
          "id": "w14-gram2",
          "source": "~는 ~를 맡다",
          "note": "A 负责……，B 负责……。 예) 你负责联系，我负责准备。",
          "at": null
        }
      ],
      "lenses": [
        {
          "id": "w14-lens1",
          "title": "함께 문제를 해결하는 말",
          "source": "이건 내가 맡을게",
          "text": "마을 사람들이 힘을 모으는 장면은 중국어의 ‘齐心协力’(마음과 힘을 모으다), ‘人多力量大’(사람이 많으면 힘도 크다)와 잘 어울려요. 역할을 나눌 때는 ‘分工’이라고 해요.\n제주의 ‘괸당’(친족·이웃 공동체)은 중국어의 ‘乡亲’(고향 사람들)으로 설명해 볼 수 있어요.",
          "at": null
        }
      ],
      "quiz": [
        {
          "id": "w14-quiz1",
          "question": "‘이건 내가 맡을게’에 해당하는 표현은?",
          "options": [
            "我请客。",
            "收到。",
            "这个交给我吧。"
          ],
          "answer": 2,
          "explanation": "交给我는 ‘나에게 맡겨’라는 뜻이에요."
        },
        {
          "id": "w14-quiz2",
          "question": "상대의 의견을 물을 때 쓰는 짧은 말은?",
          "options": [
            "你觉得呢？",
            "生日快乐！",
            "加油！"
          ],
          "answer": 0,
          "explanation": "你觉得呢？는 ‘너는 어떻게 생각해?’예요."
        }
      ],
      "createdAt": "2026-10-26T00:00:00.000Z",
      "updatedAt": "2026-10-26T00:00:00.000Z"
    },
    "createdAt": "2026-10-26T00:00:00.000Z",
    "updatedAt": "2026-10-26T00:00:00.000Z",
    "courseId": "course-legacy"
  },
  {
    "id": "lesson-week15",
    "week": 15,
    "title": "병원에서 보고하고 설명하기",
    "description": "세 명의 1년 차 레지던트가 병원에서 교수·선배·동료 및 환자들과 소통하며 업무를 수행하는 장면 · 학습 주제: 직장에서의 보고·질문·확인·피드백·협력 표현과 환자에게 설명·질문·배려할 때 사용하는 중국어 표현",
    "direction": "ko-zh",
    "level": "hsk5",
    "status": "draft",
    "video": {
      "youtubeUrl": "https://youtu.be/gKl7mDRO0ec",
      "youtubeId": "gKl7mDRO0ec",
      "startTime": 0,
      "endTime": 0
    },
    "source": {
      "dramaTitle": "언젠가는 슬기로울 전공의생활",
      "episode": "학습 클립"
    },
    "script": {
      "source": "text",
      "cues": [],
      "updatedAt": null
    },
    "draft": {
      "expressions": [
        {
          "id": "w15-exp1",
          "source": "교수님, 보고드릴 게 있습니다",
          "note": "教授，我有情况要汇报。",
          "at": null
        },
        {
          "id": "w15-exp2",
          "source": "제가 다시 확인하겠습니다",
          "note": "我再确认一下。",
          "at": null
        },
        {
          "id": "w15-exp3",
          "source": "어디가 불편하세요?",
          "note": "您哪里不舒服？ 환자에게 묻는 말",
          "at": null
        }
      ],
      "grammar": [
        {
          "id": "w15-gram1",
          "source": "동사 + 一下",
          "note": "가볍고 완곡하게 ~하다. 예) 确认一下 · 检查一下",
          "at": null
        },
        {
          "id": "w15-gram2",
          "source": "실례지만 ~",
          "note": "请问……？ 공손하게 질문을 꺼내는 말",
          "at": null
        }
      ],
      "lenses": [
        {
          "id": "w15-lens1",
          "title": "병원의 위계와 소통",
          "source": "보고드릴 게 있습니다",
          "text": "중국 병원에서 레지던트는 住院医师, 지도 교수는 主任이나 教授라고 부르고, 선배 의사는 师兄·师姐라고 부르기도 해요.\n의료진끼리의 보고는 짧고 정확하게, 환자에게는 ‘您’과 쉬운 말로 천천히 설명해요. 같은 내용을 상대에 따라 어떻게 다르게 말하는지 비교해 보세요.",
          "at": null
        }
      ],
      "quiz": [
        {
          "id": "w15-quiz1",
          "question": "‘어디가 불편하세요?’를 중국어로 하면?",
          "options": [
            "您哪里不舒服？",
            "您吃饭了吗？",
            "您慢点儿。"
          ],
          "answer": 0,
          "explanation": "不舒服는 ‘불편하다, 몸이 안 좋다’예요."
        },
        {
          "id": "w15-quiz2",
          "question": "‘确认一下’에서 ‘一下’의 역할은?",
          "options": [
            "부정을 나타낸다",
            "동작을 가볍고 완곡하게 만든다",
            "과거를 나타낸다"
          ],
          "answer": 1,
          "explanation": "동사 + 一下는 ‘잠깐 ~하다’처럼 부드럽게 말해요."
        }
      ],
      "createdAt": "2026-10-26T00:00:00.000Z",
      "updatedAt": "2026-10-26T00:00:00.000Z"
    },
    "createdAt": "2026-10-26T00:00:00.000Z",
    "updatedAt": "2026-10-26T00:00:00.000Z",
    "courseId": "course-legacy"
  },
  {
    "id": "course-university-w01",
    "courseId": "course-university",
    "week": 1,
    "title": "룸메이트와 기숙사 갈등 해결하기",
    "description": "기숙사 전기가 나간 소동을 따라가며, 사과하고 억울함을 말하고 룸메이트와의 갈등을 풀어 가는 기숙사 생활 중국어를 배워요.",
    "direction": "zh-ko",
    "level": "hsk4",
    "status": "published",
    "video": {
      "youtubeUrl": "https://www.youtube.com/watch?v=mR4xiaNeyfs",
      "youtubeId": "mR4xiaNeyfs",
      "startTime": 0,
      "endTime": 232
    },
    "source": {
      "dramaTitle": "机智的上半场",
      "episode": "",
      "videoTitle": "My roommate is such a spoiled princess"
    },
    "script": {
      "source": "srt",
      "cues": [
        {
          "start": 0,
          "end": 1.6,
          "zh": "你们就知道欺负我",
          "ko": "너희는 나 괴롭힐 줄만 알지",
          "pinyin": "nǐmen jiù zhīdào qīfu wǒ"
        },
        {
          "start": 1.6,
          "end": 2.919,
          "zh": "你们去举报我好了",
          "ko": "그냥 나 신고해 버려",
          "pinyin": "nǐmen qù jǔbào wǒ hǎo le"
        },
        {
          "start": 4,
          "end": 5,
          "zh": "皇甫",
          "ko": "황푸",
          "pinyin": "huángfǔ"
        },
        {
          "start": 6.4,
          "end": 6.879,
          "zh": "我告诉你",
          "ko": "내 말 들어",
          "pinyin": "wǒ gàosu nǐ"
        },
        {
          "start": 6.879,
          "end": 7.52,
          "zh": "她就是一个戏精",
          "ko": "쟤 완전 연기쟁이야",
          "pinyin": "tā jiùshì yí gè xìjīng"
        },
        {
          "start": 7.52,
          "end": 8.4,
          "zh": "你让她接着演",
          "ko": "계속 연기하게 놔둬",
          "pinyin": "nǐ ràng tā jiēzhe yǎn"
        },
        {
          "start": 8.4,
          "end": 9.32,
          "zh": "晾她一回",
          "ko": "이번 한 번은 내버려 둬",
          "pinyin": "liàng tā yì huí"
        },
        {
          "start": 12.08,
          "end": 12.8,
          "zh": "皇甫",
          "ko": "황푸",
          "pinyin": "huángfǔ"
        },
        {
          "start": 13.599,
          "end": 14.8,
          "zh": "水我帮你打回来了",
          "ko": "물 떠 왔어",
          "pinyin": "shuǐ wǒ bāng nǐ dǎ huílai le"
        },
        {
          "start": 14.8,
          "end": 15.679,
          "zh": "谢谢",
          "ko": "고마워",
          "pinyin": "xièxie"
        },
        {
          "start": 18.199,
          "end": 19,
          "zh": "要不要喝茶",
          "ko": "차 마실래?",
          "pinyin": "yào bu yào hē chá"
        },
        {
          "start": 20.08,
          "end": 20.8,
          "zh": "我给你倒一杯",
          "ko": "내가 한 잔 따라 줄게",
          "pinyin": "wǒ gěi nǐ dào yì bēi"
        },
        {
          "start": 20.8,
          "end": 22.039,
          "zh": "我不用 我不用 谢谢",
          "ko": "난 괜찮아, 괜찮아, 고마워",
          "pinyin": "wǒ búyòng wǒ búyòng xièxie"
        },
        {
          "start": 24.199,
          "end": 25.08,
          "zh": "怎么又跳闸了",
          "ko": "왜 또 차단기가 내려갔어?",
          "pinyin": "zěnme yòu tiàozhá le"
        },
        {
          "start": 26.56,
          "end": 28.4,
          "zh": "谁在乱用违章电器啊",
          "ko": "누가 금지 전기제품을 함부로 쓰는 거야?",
          "pinyin": "shéi zài luàn yòng wéizhāng diànqì a"
        },
        {
          "start": 29.079,
          "end": 29.839,
          "zh": "怎 怎么办",
          "ko": "어, 어떡해",
          "pinyin": "zěn zěnme bàn"
        },
        {
          "start": 35.439,
          "end": 36.039,
          "zh": "樊潇雨",
          "ko": "판샤오위",
          "pinyin": "fán xiāoyǔ"
        },
        {
          "start": 36.519,
          "end": 37.679,
          "zh": "你又用吹风机啊你",
          "ko": "너 또 드라이기 썼지?",
          "pinyin": "nǐ yòu yòng chuīfēngjī a nǐ"
        },
        {
          "start": 38.079,
          "end": 38.679,
          "zh": "不是 阿姨",
          "ko": "아니에요, 아주머니",
          "pinyin": "bú shì āyí"
        },
        {
          "start": 38.679,
          "end": 40.32,
          "zh": "你怎么一上来就针对我呢",
          "ko": "왜 오자마자 저만 몰아세우세요?",
          "pinyin": "nǐ zěnme yí shànglai jiù zhēnduì wǒ ne"
        },
        {
          "start": 40.32,
          "end": 41.719,
          "zh": "我 我不想针对你",
          "ko": "나, 나도 너 몰아세우고 싶진 않아",
          "pinyin": "wǒ wǒ bù xiǎng zhēnduì nǐ"
        },
        {
          "start": 41.719,
          "end": 42.439,
          "zh": "我想干",
          "ko": "나는 그저",
          "pinyin": "wǒ xiǎng gàn"
        },
        {
          "start": 42.439,
          "end": 43.759,
          "zh": "对不起 对不起 阿姨",
          "ko": "죄송해요, 죄송해요, 아주머니",
          "pinyin": "duìbuqǐ duìbuqǐ āyí"
        },
        {
          "start": 43.759,
          "end": 44.48,
          "zh": "我们知道错了",
          "ko": "저희가 잘못했어요",
          "pinyin": "wǒmen zhīdào cuò le"
        },
        {
          "start": 44.48,
          "end": 45.759,
          "zh": "我们下次一定不会这样",
          "ko": "다음엔 절대 이러지 않을게요",
          "pinyin": "wǒmen xià cì yídìng bú huì zhèyàng"
        },
        {
          "start": 45.759,
          "end": 46.119,
          "zh": "不是",
          "ko": "아니",
          "pinyin": "bú shì"
        },
        {
          "start": 46.119,
          "end": 47.039,
          "zh": "对不起 阿姨 对不起 对不起",
          "ko": "죄송해요, 아주머니, 죄송해요, 죄송해요",
          "pinyin": "duìbuqǐ āyí duìbuqǐ duìbuqǐ"
        },
        {
          "start": 47.039,
          "end": 47.399,
          "zh": "这",
          "ko": "이건",
          "pinyin": "zhè"
        },
        {
          "start": 48.2,
          "end": 48.679,
          "zh": "行",
          "ko": "됐어",
          "pinyin": "xíng"
        },
        {
          "start": 49.079,
          "end": 51.2,
          "zh": "下次啊 别让我抓到你们现行",
          "ko": "다음에 또 현장에서 걸리기만 해 봐",
          "pinyin": "xià cì a bié ràng wǒ zhuādào nǐmen xiànxíng"
        },
        {
          "start": 51.2,
          "end": 51.92,
          "zh": "要不然",
          "ko": "안 그러면",
          "pinyin": "yàobùrán"
        },
        {
          "start": 52.799,
          "end": 53.48,
          "zh": "一个个的",
          "ko": "하나하나 전부",
          "pinyin": "yí gègè de"
        },
        {
          "start": 53.48,
          "end": 54.599,
          "zh": "全部给你们记大过",
          "ko": "다 중징계 줄 거야",
          "pinyin": "quánbù gěi nǐmen jì dàguò"
        },
        {
          "start": 54.599,
          "end": 55.2,
          "zh": "行",
          "ko": "네",
          "pinyin": "xíng"
        },
        {
          "start": 55.2,
          "end": 55.879,
          "zh": "真的对不起",
          "ko": "정말 죄송해요",
          "pinyin": "zhēn de duìbuqǐ"
        },
        {
          "start": 55.879,
          "end": 56.719,
          "zh": "这一天天的",
          "ko": "하루도 조용한 날이 없네",
          "pinyin": "zhè yì tiāntiān de"
        },
        {
          "start": 56.719,
          "end": 57.32,
          "zh": "对不起 阿姨",
          "ko": "죄송해요, 아주머니",
          "pinyin": "duìbuqǐ āyí"
        },
        {
          "start": 57.56,
          "end": 58.079,
          "zh": "阿姨",
          "ko": "아주머니",
          "pinyin": "āyí"
        },
        {
          "start": 58.079,
          "end": 58.96,
          "zh": "我不是",
          "ko": "저 아니라니까요",
          "pinyin": "wǒ bú shì"
        },
        {
          "start": 59.879,
          "end": 60.479,
          "zh": "行了 潇雨",
          "ko": "됐어, 샤오위",
          "pinyin": "xíng le xiāoyǔ"
        },
        {
          "start": 60.479,
          "end": 61,
          "zh": "不是",
          "ko": "아니",
          "pinyin": "bú shì"
        },
        {
          "start": 61.679,
          "end": 62.759,
          "zh": "阿姨 您慢走啊",
          "ko": "아주머니, 살펴 가세요",
          "pinyin": "āyí nín màn zǒu a"
        },
        {
          "start": 69.239,
          "end": 70.239,
          "zh": "有些女同学",
          "ko": "어떤 여학생은",
          "pinyin": "yǒuxiē nǚ tóngxué"
        },
        {
          "start": 70.239,
          "end": 71.319,
          "zh": "自己用违章电器",
          "ko": "자기가 금지 전기제품 써 놓고",
          "pinyin": "zìjǐ yòng wéizhāng diànqì"
        },
        {
          "start": 71.319,
          "end": 72.319,
          "zh": "敢做不敢认",
          "ko": "저지르기만 하고 인정은 못 하네",
          "pinyin": "gǎn zuò bù gǎn rèn"
        },
        {
          "start": 73.799,
          "end": 74.4,
          "zh": "怎么了",
          "ko": "왜 그래",
          "pinyin": "zěnme le"
        },
        {
          "start": 75.159,
          "end": 76.12,
          "zh": "大家都一个宿舍的",
          "ko": "다 같은 기숙사 쓰는 사이인데",
          "pinyin": "dàjiā dōu yí gè sùshè de"
        },
        {
          "start": 76.12,
          "end": 76.879,
          "zh": "少说两句啊",
          "ko": "말 좀 줄여",
          "pinyin": "shǎo shuō liǎng jù a"
        },
        {
          "start": 77.92,
          "end": 78.359,
          "zh": "不是",
          "ko": "아니",
          "pinyin": "bú shì"
        },
        {
          "start": 78.359,
          "end": 79.64,
          "zh": "凭什么我洗个头",
          "ko": "왜 내가 머리 좀 감았다고",
          "pinyin": "píng shénme wǒ xǐ ge tóu"
        },
        {
          "start": 79.64,
          "end": 80.4,
          "zh": "就说我用吹风机",
          "ko": "드라이기를 썼다는 거야?",
          "pinyin": "jiù shuō wǒ yòng chuīfēngjī"
        },
        {
          "start": 80.4,
          "end": 81.319,
          "zh": "这什么逻辑啊",
          "ko": "이게 무슨 논리야?",
          "pinyin": "zhè shénme luóji a"
        },
        {
          "start": 82.799,
          "end": 83.319,
          "zh": "皇甫淑敏",
          "ko": "황푸수민",
          "pinyin": "huángfǔ shūmǐn"
        },
        {
          "start": 83.319,
          "end": 84.079,
          "zh": "我现在给你个机会",
          "ko": "지금 너한테 기회를 줄게",
          "pinyin": "wǒ xiànzài gěi nǐ ge jīhuì"
        },
        {
          "start": 84.079,
          "end": 84.799,
          "zh": "你把你那个什么",
          "ko": "너 그 뭐더라",
          "pinyin": "nǐ bǎ nǐ nàge shénme"
        },
        {
          "start": 84.799,
          "end": 85.68,
          "zh": "养生壶",
          "ko": "건강 포트",
          "pinyin": "yǎngshēnghú"
        },
        {
          "start": 85.68,
          "end": 86.239,
          "zh": "拿出来",
          "ko": "꺼내서",
          "pinyin": "ná chūlai"
        },
        {
          "start": 86.239,
          "end": 87.079,
          "zh": "给阿姨澄清去",
          "ko": "아주머니한테 가서 해명해",
          "pinyin": "gěi āyí chéngqīng qù"
        },
        {
          "start": 87.56,
          "end": 88.92,
          "zh": "干嘛这样",
          "ko": "왜 이래",
          "pinyin": "gànmá zhèyàng"
        },
        {
          "start": 90.28,
          "end": 91.799,
          "zh": "就知道欺负我",
          "ko": "나 괴롭힐 줄만 알고",
          "pinyin": "jiù zhīdào qīfu wǒ"
        },
        {
          "start": 92.92,
          "end": 94,
          "zh": "我欺负",
          "ko": "내가 괴롭힌다고?",
          "pinyin": "wǒ qīfu"
        },
        {
          "start": 94.48,
          "end": 95.159,
          "zh": "潇雨",
          "ko": "샤오위",
          "pinyin": "xiāoyǔ"
        },
        {
          "start": 95.159,
          "end": 95.959,
          "zh": "咱们没有证据",
          "ko": "우리한테 증거도 없잖아",
          "pinyin": "zánmen méiyǒu zhèngjù"
        },
        {
          "start": 95.959,
          "end": 96.959,
          "zh": "也不能妄下定论",
          "ko": "함부로 단정하면 안 돼",
          "pinyin": "yě bù néng wàng xià dìnglùn"
        },
        {
          "start": 96.959,
          "end": 97.4,
          "zh": "对吧",
          "ko": "그렇지?",
          "pinyin": "duì ba"
        },
        {
          "start": 97.84,
          "end": 98.519,
          "zh": "没事啊",
          "ko": "괜찮아",
          "pinyin": "méishì a"
        },
        {
          "start": 100.84,
          "end": 101.439,
          "zh": "你看",
          "ko": "봐",
          "pinyin": "nǐ kàn"
        },
        {
          "start": 101.439,
          "end": 102.359,
          "zh": "朗朗也赞同",
          "ko": "랑랑도 내 말에 동의하잖아",
          "pinyin": "lǎnglǎng yě zàntóng"
        },
        {
          "start": 105.519,
          "end": 106.599,
          "zh": "有一说一",
          "ko": "솔직히 말해서",
          "pinyin": "yǒu yī shuō yī"
        },
        {
          "start": 107.599,
          "end": 108.48,
          "zh": "壶在那里",
          "ko": "포트는 저기 있잖아",
          "pinyin": "hú zài nàlǐ"
        },
        {
          "start": 118.079,
          "end": 119.64,
          "zh": "你们就知道欺负我",
          "ko": "너희는 나 괴롭힐 줄만 알지",
          "pinyin": "nǐmen jiù zhīdào qīfu wǒ"
        },
        {
          "start": 120.519,
          "end": 121.719,
          "zh": "你们去举报我好了",
          "ko": "그냥 나 신고해 버려",
          "pinyin": "nǐmen qù jǔbào wǒ hǎo le"
        },
        {
          "start": 122.799,
          "end": 123.4,
          "zh": "皇甫",
          "ko": "황푸",
          "pinyin": "huángfǔ"
        },
        {
          "start": 124,
          "end": 124.759,
          "zh": "黄浮",
          "ko": "황푸",
          "pinyin": "huáng fú"
        },
        {
          "start": 126.439,
          "end": 127.079,
          "zh": "是不是有病",
          "ko": "쟤 어디 아픈 거 아니야?",
          "pinyin": "shì bu shì yǒu bìng"
        },
        {
          "start": 130.319,
          "end": 130.96,
          "zh": "别管她",
          "ko": "신경 쓰지 마",
          "pinyin": "bié guǎn tā"
        },
        {
          "start": 130.96,
          "end": 131.96,
          "zh": "你就晾着她",
          "ko": "그냥 내버려 둬",
          "pinyin": "nǐ jiù liàngzhe tā"
        },
        {
          "start": 131.96,
          "end": 133.199,
          "zh": "晾一回她这病就好了",
          "ko": "한 번 내버려 두면 저 병도 나을 거야",
          "pinyin": "liàng yì huí tā zhè bìng jiù hǎo le"
        },
        {
          "start": 133.759,
          "end": 135.319,
          "zh": "话虽这么说了",
          "ko": "말은 그렇게 해도",
          "pinyin": "huà suī zhème shuō le"
        },
        {
          "start": 135.319,
          "end": 136.159,
          "zh": "但你们听这",
          "ko": "너희 이거 들어 봐",
          "pinyin": "dàn nǐmen tīng zhè"
        },
        {
          "start": 136.159,
          "end": 137.84,
          "zh": "哭得也太惨了吧",
          "ko": "너무 서럽게 우는 거 아니야?",
          "pinyin": "kū de yě tài cǎn le ba"
        },
        {
          "start": 139,
          "end": 140.84,
          "zh": "不行 不行",
          "ko": "안 돼, 안 돼",
          "pinyin": "bùxíng bùxíng"
        },
        {
          "start": 141.36,
          "end": 142.079,
          "zh": "你别去",
          "ko": "가지 마",
          "pinyin": "nǐ bié qù"
        },
        {
          "start": 142.079,
          "end": 142.599,
          "zh": "你现在去",
          "ko": "지금 가면",
          "pinyin": "nǐ xiànzài qù"
        },
        {
          "start": 142.599,
          "end": 143.199,
          "zh": "不就真的变成",
          "ko": "정말로",
          "pinyin": "bú jiù zhēn de biànchéng"
        },
        {
          "start": 143.199,
          "end": 144.159,
          "zh": "我们在欺负她了吗",
          "ko": "우리가 쟤를 괴롭힌 게 되잖아",
          "pinyin": "wǒmen zài qīfu tā le ma"
        },
        {
          "start": 144.56,
          "end": 144.96,
          "zh": "我告诉你",
          "ko": "내 말 들어",
          "pinyin": "wǒ gàosu nǐ"
        },
        {
          "start": 144.96,
          "end": 145.639,
          "zh": "她就是个戏精",
          "ko": "쟤 완전 연기쟁이야",
          "pinyin": "tā jiùshì ge xìjīng"
        },
        {
          "start": 145.639,
          "end": 146.599,
          "zh": "你让她接着演",
          "ko": "계속 연기하게 놔둬",
          "pinyin": "nǐ ràng tā jiēzhe yǎn"
        },
        {
          "start": 146.599,
          "end": 147.439,
          "zh": "晾她一回",
          "ko": "이번 한 번은 내버려 둬",
          "pinyin": "liàng tā yì huí"
        },
        {
          "start": 149.4,
          "end": 150,
          "zh": "你现在去了",
          "ko": "지금 가면",
          "pinyin": "nǐ xiànzài qù le"
        },
        {
          "start": 150,
          "end": 151.159,
          "zh": "她就真的没完没有了",
          "ko": "쟤 진짜 끝도 없을 거야",
          "pinyin": "tā jiù zhēn de méi wán méiyǒu liǎo"
        },
        {
          "start": 152.359,
          "end": 153,
          "zh": "我也同意",
          "ko": "나도 같은 생각이야",
          "pinyin": "wǒ yě tóngyì"
        },
        {
          "start": 159.919,
          "end": 162,
          "zh": "你怎么又不接我电话呀",
          "ko": "왜 또 내 전화 안 받아?",
          "pinyin": "nǐ zěnme yòu bù jiē wǒ diànhuà ya"
        },
        {
          "start": 163.159,
          "end": 164.319,
          "zh": "这就是我们宿舍",
          "ko": "이게 바로 우리 기숙사",
          "pinyin": "zhè jiùshì wǒmen sùshè"
        },
        {
          "start": 164.319,
          "end": 166.519,
          "zh": "三号床的皇甫淑敏",
          "ko": "3번 침대의 황푸수민이야",
          "pinyin": "sān hào chuáng de huángfǔ shūmǐn"
        },
        {
          "start": 166.519,
          "end": 167.519,
          "zh": "要这个男朋友",
          "ko": "이런 남자친구",
          "pinyin": "yào zhège nánpéngyou"
        },
        {
          "start": 167.519,
          "end": 168.24,
          "zh": "有什么用",
          "ko": "있어서 뭐 해?",
          "pinyin": "yǒu shénme yòng"
        },
        {
          "start": 169.039,
          "end": 170.319,
          "zh": "别人是公主",
          "ko": "다른 사람은 공주인데",
          "pinyin": "biérén shì gōngzhǔ"
        },
        {
          "start": 170.319,
          "end": 172.28,
          "zh": "她是公主病",
          "ko": "쟤는 공주병이야",
          "pinyin": "tā shì gōngzhǔbìng"
        },
        {
          "start": 172.28,
          "end": 173.68,
          "zh": "仗着自己年纪最小",
          "ko": "자기가 제일 어리다는 걸 믿고",
          "pinyin": "zhàngzhe zìjǐ niánjì zuì xiǎo"
        },
        {
          "start": 173.68,
          "end": 175.519,
          "zh": "平日里总不嫌麻烦别人",
          "ko": "평소에 남 귀찮게 하는 걸 아무렇지 않게 여겨",
          "pinyin": "píngrì lǐ zǒng bù xián máfan biérén"
        },
        {
          "start": 177.599,
          "end": 178.4,
          "zh": "腿麻了",
          "ko": "다리 저려",
          "pinyin": "tuǐ má le"
        },
        {
          "start": 178.4,
          "end": 179.519,
          "zh": "我手机落",
          "ko": "내 핸드폰 두고",
          "pinyin": "wǒ shǒujī là"
        },
        {
          "start": 180.12,
          "end": 181,
          "zh": "我帮你拿 我帮你拿",
          "ko": "내가 가져다줄게, 내가 가져다줄게",
          "pinyin": "wǒ bāng nǐ ná wǒ bāng nǐ ná"
        },
        {
          "start": 185.68,
          "end": 187,
          "zh": "最爱你了",
          "ko": "너무 사랑해",
          "pinyin": "zuì ài nǐ le"
        },
        {
          "start": 187.4,
          "end": 189.719,
          "zh": "关键她还神经衰弱",
          "ko": "문제는 신경쇠약까지 있다는 거야",
          "pinyin": "guānjiàn tā hái shénjīng shuāiruò"
        },
        {
          "start": 189.719,
          "end": 191.479,
          "zh": "一犯病 大家都跟着受罪",
          "ko": "한 번 증상이 도지면 다 같이 고생해",
          "pinyin": "yí fànbìng dàjiā dōu gēnzhe shòuzuì"
        },
        {
          "start": 192.079,
          "end": 192.84,
          "zh": "晚上十点",
          "ko": "밤 10시면",
          "pinyin": "wǎnshang shí diǎn"
        },
        {
          "start": 192.84,
          "end": 194.439,
          "zh": "准时上床敷面膜",
          "ko": "칼같이 침대에 누워 마스크팩을 하고",
          "pinyin": "zhǔnshí shàng chuáng fū miànmó"
        },
        {
          "start": 194.439,
          "end": 196.24,
          "zh": "可她爸妈又会在每天",
          "ko": "그런데 쟤 부모님은 또 매일",
          "pinyin": "kě tā bàmā yòu huì zài měitiān"
        },
        {
          "start": 196.24,
          "end": 197.199,
          "zh": "二十二点",
          "ko": "밤 10시",
          "pinyin": "èrshí'èr diǎn"
        },
        {
          "start": 197.199,
          "end": 198,
          "zh": "二十五分",
          "ko": "25분에",
          "pinyin": "èrshíwǔ fēn"
        },
        {
          "start": 198,
          "end": 199.479,
          "zh": "打视频电话给她",
          "ko": "영상통화를 거셔",
          "pinyin": "dǎ shìpín diànhuà gěi tā"
        },
        {
          "start": 199.479,
          "end": 200.159,
          "zh": "这时候",
          "ko": "이때는",
          "pinyin": "zhè shíhou"
        },
        {
          "start": 200.159,
          "end": 201.719,
          "zh": "不管别人睡没睡",
          "ko": "다른 사람이 자든 말든 상관없어",
          "pinyin": "bùguǎn biérén shuì méi shuì"
        },
        {
          "start": 201.719,
          "end": 202.4,
          "zh": "妈",
          "ko": "엄마",
          "pinyin": "mā"
        },
        {
          "start": 202.4,
          "end": 203.56,
          "zh": "她又不睡了",
          "ko": "쟤 또 안 자네",
          "pinyin": "tā yòu bú shuì le"
        },
        {
          "start": 204.639,
          "end": 205.68,
          "zh": "吃了吗",
          "ko": "밥 먹었니?",
          "pinyin": "chī le ma"
        },
        {
          "start": 205.68,
          "end": 206.519,
          "zh": "忙不忙",
          "ko": "바쁘니?",
          "pinyin": "máng bu máng"
        },
        {
          "start": 206.639,
          "end": 207.919,
          "zh": "睡觉了吗",
          "ko": "잤니?",
          "pinyin": "shuìjiào le ma"
        },
        {
          "start": 207.919,
          "end": 208.639,
          "zh": "你们看",
          "ko": "봐 봐",
          "pinyin": "nǐmen kàn"
        },
        {
          "start": 208.639,
          "end": 210.68,
          "zh": "是不是永恒的三大件",
          "ko": "영원한 3종 세트 아니야?",
          "pinyin": "shì bu shì yǒnghéng de sān dà jiàn"
        },
        {
          "start": 210.68,
          "end": 212.639,
          "zh": "她还说我们对她好呢",
          "ko": "그러고도 우리가 자기한테 잘해 준대",
          "pinyin": "tā hái shuō wǒmen duì tā hǎo ne"
        },
        {
          "start": 213.199,
          "end": 214.68,
          "zh": "我妈也说了",
          "ko": "우리 엄마도 그랬어",
          "pinyin": "wǒ mā yě shuō le"
        },
        {
          "start": 214.68,
          "end": 216,
          "zh": "窗户要多开",
          "ko": "창문을 자주 열어야 한다고",
          "pinyin": "chuānghu yào duō kāi"
        },
        {
          "start": 216,
          "end": 216.959,
          "zh": "确实对身体好",
          "ko": "확실히 건강에 좋지",
          "pinyin": "quèshí duì shēntǐ hǎo"
        },
        {
          "start": 216.959,
          "end": 217.799,
          "zh": "你去开",
          "ko": "네가 열어",
          "pinyin": "nǐ qù kāi"
        },
        {
          "start": 217.799,
          "end": 219.4,
          "zh": "我反正开不了",
          "ko": "난 어차피 못 열어",
          "pinyin": "wǒ fǎnzhèng kāi bu liǎo"
        },
        {
          "start": 219.4,
          "end": 220.599,
          "zh": "我也没打开",
          "ko": "나도 못 열었어",
          "pinyin": "wǒ yě méi dǎkāi"
        },
        {
          "start": 220.599,
          "end": 222.719,
          "zh": "我看她也是认真反思过了",
          "ko": "내가 보기엔 쟤도 진지하게 반성한 것 같아",
          "pinyin": "wǒ kàn tā yě shì rènzhēn fǎnsī guo le"
        },
        {
          "start": 222.719,
          "end": 224.319,
          "zh": "差不多就这样得了",
          "ko": "이쯤에서 그만하자",
          "pinyin": "chàbuduō jiù zhèyàng dé le"
        },
        {
          "start": 224.319,
          "end": 225.639,
          "zh": "明天记得给她台阶下",
          "ko": "내일 잊지 말고 쟤 체면 좀 살려 주자",
          "pinyin": "míngtiān jìde gěi tā táijiē xià"
        },
        {
          "start": 225.639,
          "end": 226.319,
          "zh": "怎么样",
          "ko": "어때?",
          "pinyin": "zěnmeyàng"
        }
      ],
      "updatedAt": "2026-11-01T13:46:31.843Z",
      "origin": {
        "zh": {
          "provider": "srt",
          "fileName": "기지적상반장_1주차.srt",
          "fetchedAt": "2026-11-01T13:43:07.400Z"
        },
        "ko": {
          "provider": "ai",
          "fetchedAt": "2026-11-01T13:44:09.485Z"
        }
      }
    },
    "createdAt": "2026-10-29T00:00:00.000Z",
    "updatedAt": "2026-11-01T15:01:50.415Z",
    "draft": {
      "expressions": [
        {
          "id": "note-mvxvvbw1-q3m133",
          "source": "你们就知道欺负我",
          "note": "'너희는 나 괴롭힐 줄만 알지'라는 뜻이에요. '就知道 + 동사'는 '~할 줄만 안다, 맨날 ~만 한다'라는 뜻으로, 상대에 대한 불만이나 서운함을 드러낼 때 써요. '欺负'는 '괴롭히다, 업신여기다'라는 뜻이에요.",
          "pinyin": "nǐmen jiù zhīdào qīfu wǒ"
        },
        {
          "id": "note-mvxvvbw1-sl4zr3",
          "source": "她就是一个戏精",
          "note": "'쟤 완전 연기쟁이야'라는 뜻이에요. '戏精'은 원래 연기를 잘하는 사람을 뜻했지만, 요즘은 별일 아닌 일에도 과장되게 반응하며 연극하듯 구는 사람을 놀리는 신조어로 많이 써요. '就是'는 '바로 ~이다'라고 강하게 단정하는 말투예요.",
          "pinyin": "tā jiùshì yí gè xìjīng"
        },
        {
          "id": "note-mvxvvbw1-8rw867",
          "source": "少说两句啊",
          "note": "'말 좀 줄여, 그만해'라는 뜻이에요. 숫자 그대로 '두 마디 덜 해라'가 아니라, 다툼이 커지지 않도록 상대에게 말을 아끼라고 말릴 때 쓰는 관용 표현이에요. 친구끼리 싸움을 말릴 때 자주 들을 수 있어요.",
          "pinyin": "shǎo shuō liǎng jù a"
        },
        {
          "id": "note-mvxvvbw1-8b9ont",
          "source": "敢做不敢认",
          "note": "'저지를 용기는 있으면서 인정할 용기는 없다'라는 뜻이에요. 잘못을 해 놓고 책임지지 않는 사람을 비꼬을 때 쓰는 표현이에요. '敢'은 '감히 ~하다, ~할 용기가 있다'라는 뜻이에요.",
          "pinyin": "gǎn zuò bù gǎn rèn"
        },
        {
          "id": "note-mvxvvbw1-u1frij",
          "source": "明天记得给她台阶下",
          "note": "'내일 잊지 말고 쟤 체면 좀 살려 주자'라는 뜻이에요. '给…台阶下'는 직역하면 '내려올 계단을 놓아 주다'로, 곤란한 처지의 상대가 체면을 지키며 물러설 수 있게 기회를 만들어 준다는 관용 표현이에요. '记得 + 동사'는 '잊지 말고 ~해'라는 뜻이에요.",
          "pinyin": "míngtiān jìde gěi tā táijiē xià"
        }
      ],
      "grammar": [
        {
          "id": "note-mvxvvbw1-te1s01",
          "source": "你把你那个什么",
          "note": "'把 + 목적어 + 동사 + 기타 성분'은 목적어를 어떻게 처리하는지 강조하는 把자문이에요. 이 장면에서는 뒤 대사와 이어져 '你把你那个养生壶拿出来'(너 그 건강 포트 꺼내 와)라는 문장이 돼요. '那个什么'는 이름이 바로 떠오르지 않을 때 쓰는 '그 뭐더라'예요. 예문: 请把门关上。(문 좀 닫아 주세요.)",
          "pinyin": "nǐ bǎ nǐ nàge shénme"
        },
        {
          "id": "note-mvxvvbw1-qy6xp4",
          "source": "你怎么一上来就针对我呢",
          "note": "'一…就…'는 '~하자마자 곧 ~하다'라는 뜻이에요. '一上来就'는 '오자마자 바로'라는 의미이고, '针对'는 '겨냥하다, 몰아세우다'라는 뜻이에요. 예문: 我一到家就睡觉了。(나는 집에 오자마자 잤어요.)",
          "pinyin": "nǐ zěnme yí shànglai jiù zhēnduì wǒ ne"
        },
        {
          "id": "note-mvxvvbw1-jbtntd",
          "source": "下次啊 别让我抓到你们现行",
          "note": "'别让我 + 동사'는 '내가 ~하게 만들지 마라'라는 뜻으로, 경고할 때 자주 써요. '抓到现行'은 '현장에서 딱 걸리다'라는 뜻이에요. 예문: 别让我再看见你迟到。(다시는 네가 지각하는 걸 보게 하지 마.)",
          "pinyin": "xià cì a bié ràng wǒ zhuādào nǐmen xiànxíng"
        },
        {
          "id": "note-mvxvvbw1-5svws0",
          "source": "准时上床敷面膜",
          "note": "'准时'는 '정시에, 제시간에'라는 뜻의 핵심 어휘예요. '上床'은 '침대에 눕다(잠자리에 들다)', '敷面膜'는 '마스크팩을 하다'라는 뜻이에요. 예문: 他每天准时上班。(그는 매일 정시에 출근해요.)",
          "pinyin": "zhǔnshí shàng chuáng fū miànmó"
        },
        {
          "id": "note-mvxvvbw1-bljtyl",
          "source": "不管别人睡没睡",
          "note": "'不管…(都)…'는 '~든 말든 상관없이'라는 뜻이에요. 뒤에 '睡没睡'처럼 긍정·부정을 나란히 쓰거나 의문사를 함께 쓰는 경우가 많아요. 예문: 不管下不下雨，我都去。(비가 오든 안 오든 나는 갈 거예요.)",
          "pinyin": "bùguǎn biérén shuì méi shuì"
        }
      ],
      "lenses": [
        {
          "id": "lens-mvxvvbw1-g2tsvy",
          "title": "중국 대학 기숙사와 '违章电器'",
          "source": "谁在乱用违章电器啊",
          "text": "중국 대학생은 대부분 학교 기숙사에서 4~6명이 한 방을 쓰며 생활해요. 기숙사마다 관리하는 '宿管阿姨'(사감 아주머니)가 있어서 출입 시간과 안전을 엄격하게 챙겨요. 화재 예방과 전력 부족 때문에 소비 전력이 큰 드라이기, 전기 포트 같은 '违章电器'(금지 전기제품) 사용이 제한되는 곳이 많고, 기준을 넘으면 '跳闸'(차단기가 내려감)가 일어나요. 적발되면 장면에서처럼 '记大过' 같은 징계를 받을 수도 있어서, 몰래 쓰다 들킬까 봐 긴장하는 모습은 중국 대학생들이 크게 공감하는 장면이에요."
        }
      ],
      "quiz": [
        {
          "id": "quiz-mvxvvbw1-asdpr1",
          "question": "'她就是一个戏精'에서 '戏精'의 뜻으로 가장 알맞은 것은?",
          "options": [
            "연극을 좋아하는 사람",
            "연기 전공 학생",
            "별일 아닌 일에도 과장되게 연극하듯 구는 사람",
            "남을 잘 웃기는 사람"
          ],
          "answer": 2,
          "explanation": "'戏精'은 요즘 신조어로, 상황을 과장해 연극하듯 반응하는 사람을 놀리는 말이에요. 우는 황푸수민을 두고 일부러 그러는 것이라며 내버려 두라고 하는 장면이에요."
        },
        {
          "id": "quiz-mvxvvbw1-umzpp5",
          "question": "'怎么又跳闸了'라는 말이 나온 뒤 사감 아주머니가 의심한 차단기가 내려간 원인은 무엇인가요?",
          "options": [
            "누군가 금지 전기제품을 사용해서",
            "비가 많이 와서",
            "전등이 고장 나서",
            "누군가 창문을 열어 둬서"
          ],
          "answer": 0,
          "explanation": "바로 다음 대사 '谁在乱用违章电器啊'에서 알 수 있듯이, 누군가 금지된 전기제품을 함부로 써서 차단기가 내려갔다고 의심한 거예요."
        },
        {
          "id": "quiz-mvxvvbw1-rq61sz",
          "question": "'少说两句啊'의 뜻으로 가장 알맞은 것은?",
          "options": [
            "두 마디만 더 해 봐.",
            "천천히 말해.",
            "크게 말해 봐.",
            "말 좀 줄여, 그만해."
          ],
          "answer": 3,
          "explanation": "'少说两句'는 다툼이 커지지 않도록 말을 아끼라고 말리는 관용 표현이에요. 숫자 '两'은 실제 개수가 아니라 '몇 마디'라는 뜻이에요."
        },
        {
          "id": "quiz-mvxvvbw1-s8eme8",
          "question": "'明天记得给她台阶下'에서 '给她台阶下'는 무슨 뜻인가요?",
          "options": [
            "그녀를 계단 아래까지 데려다주다",
            "그녀가 체면을 지키며 화해할 기회를 만들어 주다",
            "그녀에게 벌을 주다",
            "그녀를 기숙사에서 내보내다"
          ],
          "answer": 1,
          "explanation": "'给…台阶下'는 곤란한 처지의 상대가 체면을 잃지 않고 물러설 수 있게 해 준다는 관용 표현이에요. 룸메이트들이 내일 황푸수민과 자연스럽게 화해하자고 하는 장면이에요."
        },
        {
          "id": "quiz-mvxvvbw1-lm6cr2",
          "question": "'你怎么一上来就针对我呢'에서 '一上来就'의 뜻으로 알맞은 것은?",
          "options": [
            "한 번 올라가서",
            "위층에서부터",
            "오자마자 바로",
            "한 사람만 골라서"
          ],
          "answer": 2,
          "explanation": "'一…就…'는 '~하자마자 곧'이라는 문형이에요. '一上来就针对我'는 '오자마자 바로 나를 몰아세운다'라는 뜻이에요."
        }
      ],
      "level": "",
      "createdAt": "2026-11-01T13:46:16.177Z",
      "updatedAt": "2026-11-01T13:46:16.177Z"
    },
    "captionMask": {
      "enabled": true,
      "top": 78,
      "height": 12,
      "width": 70
    }
  },
  {
    "id": "course-university-w02",
    "courseId": "course-university",
    "week": 2,
    "title": "친구들과 협력하고 역할 나누기",
    "description": "",
    "direction": "zh-ko",
    "level": "",
    "status": "draft",
    "video": {
      "youtubeUrl": "https://www.youtube.com/watch?v=GVmEncNtcac",
      "youtubeId": "GVmEncNtcac",
      "startTime": 0,
      "endTime": 0
    },
    "source": {
      "dramaTitle": "机智的上半场",
      "episode": "",
      "videoTitle": "Langlang teams up with Wu Yan"
    },
    "script": {
      "source": "srt",
      "cues": [],
      "updatedAt": null
    },
    "createdAt": "2026-10-29T00:00:00.000Z",
    "updatedAt": "2026-10-29T00:00:00.000Z"
  },
  {
    "id": "course-university-w03",
    "courseId": "course-university",
    "week": 3,
    "title": "친구 사이의 생각과 감정 표현하기",
    "description": "",
    "direction": "zh-ko",
    "level": "",
    "status": "draft",
    "video": {
      "youtubeUrl": "https://www.youtube.com/watch?v=rOCggaC38L0",
      "youtubeId": "rOCggaC38L0",
      "startTime": 0,
      "endTime": 0
    },
    "source": {
      "dramaTitle": "机智的上半场",
      "episode": "",
      "videoTitle": "夏朗朗、皇甫议论范轻舟，杨嘉倩不开心"
    },
    "script": {
      "source": "srt",
      "cues": [],
      "updatedAt": null
    },
    "createdAt": "2026-10-29T00:00:00.000Z",
    "updatedAt": "2026-10-29T00:00:00.000Z"
  },
  {
    "id": "course-university-w04",
    "courseId": "course-university",
    "week": 4,
    "title": "교내 문제 상황을 설명하고 해명하기",
    "description": "",
    "direction": "zh-ko",
    "level": "",
    "status": "draft",
    "video": {
      "youtubeUrl": "https://youtu.be/T82vWnNBA2k",
      "youtubeId": "T82vWnNBA2k",
      "startTime": 0,
      "endTime": 0
    },
    "source": {
      "dramaTitle": "机智的上半场",
      "episode": "",
      "videoTitle": "办公室激情视频传遍网络，嘉倩被老师约谈？！"
    },
    "script": {
      "source": "srt",
      "cues": [],
      "updatedAt": null
    },
    "createdAt": "2026-10-29T00:00:00.000Z",
    "updatedAt": "2026-10-29T00:00:00.000Z"
  },
  {
    "id": "course-university-w05",
    "courseId": "course-university",
    "week": 5,
    "title": "문제에 대한 입장과 의견 표현하기",
    "description": "",
    "direction": "zh-ko",
    "level": "",
    "status": "draft",
    "video": {
      "youtubeUrl": "https://youtu.be/FinXR50tmHU",
      "youtubeId": "FinXR50tmHU",
      "startTime": 0,
      "endTime": 0
    },
    "source": {
      "dramaTitle": "机智的上半场",
      "episode": "",
      "videoTitle": "嘉倩遭受网络暴力还要保护视频主角？！"
    },
    "script": {
      "source": "srt",
      "cues": [],
      "updatedAt": null
    },
    "createdAt": "2026-10-29T00:00:00.000Z",
    "updatedAt": "2026-10-29T00:00:00.000Z"
  },
  {
    "id": "course-university-w06",
    "courseId": "course-university",
    "week": 6,
    "title": "발표하고 자신의 생각 전달하기",
    "description": "",
    "direction": "zh-ko",
    "level": "",
    "status": "draft",
    "video": {
      "youtubeUrl": "https://youtu.be/sNKLWf15eFU",
      "youtubeId": "sNKLWf15eFU",
      "startTime": 0,
      "endTime": 0
    },
    "source": {
      "dramaTitle": "机智的上半场",
      "episode": "",
      "videoTitle": "白富美樊潇雨自信的演讲，气场霸气十足惊艳众人！"
    },
    "script": {
      "source": "srt",
      "cues": [],
      "updatedAt": null
    },
    "createdAt": "2026-10-29T00:00:00.000Z",
    "updatedAt": "2026-10-29T00:00:00.000Z"
  },
  {
    "id": "course-university-w07",
    "courseId": "course-university",
    "week": 7,
    "title": "친구와 다투고 잘못 인정하기",
    "description": "",
    "direction": "zh-ko",
    "level": "",
    "status": "draft",
    "video": {
      "youtubeUrl": "https://youtu.be/Bj3gXUVaVFk",
      "youtubeId": "Bj3gXUVaVFk",
      "startTime": 0,
      "endTime": 0
    },
    "source": {
      "dramaTitle": "机智的上半场",
      "episode": "",
      "videoTitle": "姐妹因为男人吵架！潇雨深刻反思自己的过错"
    },
    "script": {
      "source": "srt",
      "cues": [],
      "updatedAt": null
    },
    "createdAt": "2026-10-29T00:00:00.000Z",
    "updatedAt": "2026-10-29T00:00:00.000Z"
  },
  {
    "id": "course-university-w08",
    "courseId": "course-university",
    "week": 8,
    "title": "친구와 화해하고 관계 회복하기",
    "description": "",
    "direction": "zh-ko",
    "level": "",
    "status": "draft",
    "video": {
      "youtubeUrl": "https://youtu.be/mcIzM3NnAo8",
      "youtubeId": "mcIzM3NnAo8",
      "startTime": 0,
      "endTime": 0
    },
    "source": {
      "dramaTitle": "机智的上半场",
      "episode": "",
      "videoTitle": "潇雨杨嘉倩重新和好！"
    },
    "script": {
      "source": "srt",
      "cues": [],
      "updatedAt": null
    },
    "createdAt": "2026-10-29T00:00:00.000Z",
    "updatedAt": "2026-10-29T00:00:00.000Z"
  },
  {
    "id": "course-university-w09",
    "courseId": "course-university",
    "week": 9,
    "title": "경제적 독립과 돈 문제 이야기하기",
    "description": "",
    "direction": "zh-ko",
    "level": "",
    "status": "draft",
    "video": {
      "youtubeUrl": "https://www.youtube.com/watch?v=NCXrWdP9hjU",
      "youtubeId": "NCXrWdP9hjU",
      "startTime": 0,
      "endTime": 0
    },
    "source": {
      "dramaTitle": "机智的上半场",
      "episode": "",
      "videoTitle": "樊潇雨被后妈打，为赚钱又得罪嘉倩"
    },
    "script": {
      "source": "srt",
      "cues": [],
      "updatedAt": null
    },
    "createdAt": "2026-10-29T00:00:00.000Z",
    "updatedAt": "2026-10-29T00:00:00.000Z"
  },
  {
    "id": "course-university-w10",
    "courseId": "course-university",
    "week": 10,
    "title": "회의에서 아이디어를 제안하고 의견 나누기",
    "description": "",
    "direction": "zh-ko",
    "level": "",
    "status": "draft",
    "video": {
      "youtubeUrl": "https://youtu.be/Djg24YNq0WY",
      "youtubeId": "Djg24YNq0WY",
      "startTime": 0,
      "endTime": 0
    },
    "source": {
      "dramaTitle": "机智的上半场",
      "episode": "",
      "videoTitle": "白富美组织动员会，伙伴们纷纷献计想妙招！"
    },
    "script": {
      "source": "srt",
      "cues": [],
      "updatedAt": null
    },
    "createdAt": "2026-10-29T00:00:00.000Z",
    "updatedAt": "2026-10-29T00:00:00.000Z"
  },
  {
    "id": "course-university-w11",
    "courseId": "course-university",
    "week": 11,
    "title": "방문하고 상대를 배려하며 대화하기",
    "description": "",
    "direction": "zh-ko",
    "level": "",
    "status": "draft",
    "video": {
      "youtubeUrl": "https://youtu.be/QPzuRdcc6Z4",
      "youtubeId": "QPzuRdcc6Z4",
      "startTime": 0,
      "endTime": 0
    },
    "source": {
      "dramaTitle": "机智的上半场",
      "episode": "",
      "videoTitle": "姐妹们一起去看望老人"
    },
    "script": {
      "source": "srt",
      "cues": [],
      "updatedAt": null
    },
    "createdAt": "2026-10-29T00:00:00.000Z",
    "updatedAt": "2026-10-29T00:00:00.000Z"
  },
  {
    "id": "course-university-w12",
    "courseId": "course-university",
    "week": 12,
    "title": "가족과 갈등을 해결하고 화해하기",
    "description": "",
    "direction": "zh-ko",
    "level": "",
    "status": "draft",
    "video": {
      "youtubeUrl": "https://youtu.be/gcLCGSKsYBc",
      "youtubeId": "gcLCGSKsYBc",
      "startTime": 0,
      "endTime": 0
    },
    "source": {
      "dramaTitle": "机智的上半场",
      "episode": "",
      "videoTitle": "潇雨和爸爸化解矛盾"
    },
    "script": {
      "source": "srt",
      "cues": [],
      "updatedAt": null
    },
    "createdAt": "2026-10-29T00:00:00.000Z",
    "updatedAt": "2026-10-29T00:00:00.000Z"
  },
  {
    "id": "course-university-w13",
    "courseId": "course-university",
    "week": 13,
    "title": "첫 직장생활에서 실수하고 대처하기",
    "description": "",
    "direction": "zh-ko",
    "level": "",
    "status": "draft",
    "video": {
      "youtubeUrl": "https://youtu.be/M08ALP64muQ",
      "youtubeId": "M08ALP64muQ",
      "startTime": 0,
      "endTime": 0
    },
    "source": {
      "dramaTitle": "机智的上半场",
      "episode": "",
      "videoTitle": "朗朗刚工作就闯祸！但是遇到个高大帅气的师兄"
    },
    "script": {
      "source": "srt",
      "cues": [],
      "updatedAt": null
    },
    "createdAt": "2026-10-29T00:00:00.000Z",
    "updatedAt": "2026-10-29T00:00:00.000Z"
  },
  {
    "id": "course-university-w14",
    "courseId": "course-university",
    "week": 14,
    "title": "성과와 평가에 대해 이야기하기",
    "description": "",
    "direction": "zh-ko",
    "level": "",
    "status": "draft",
    "video": {
      "youtubeUrl": "https://www.youtube.com/watch?v=LB6EERwX9go",
      "youtubeId": "LB6EERwX9go",
      "startTime": 0,
      "endTime": 0
    },
    "source": {
      "dramaTitle": "机智的上半场",
      "episode": "",
      "videoTitle": "朗朗赢得第一，麦老师也在默默关注她"
    },
    "script": {
      "source": "srt",
      "cues": [],
      "updatedAt": null
    },
    "createdAt": "2026-10-29T00:00:00.000Z",
    "updatedAt": "2026-10-29T00:00:00.000Z"
  },
  {
    "id": "course-university-w15",
    "courseId": "course-university",
    "week": 15,
    "title": "졸업과 작별, 미래 이야기하기",
    "description": "",
    "direction": "zh-ko",
    "level": "",
    "status": "draft",
    "video": {
      "youtubeUrl": "https://www.youtube.com/watch?v=WMDz4an9Zrc",
      "youtubeId": "WMDz4an9Zrc",
      "startTime": 0,
      "endTime": 0
    },
    "source": {
      "dramaTitle": "机智的上半场",
      "episode": "",
      "videoTitle": "It's graduation time! The girls really don't want to be apart"
    },
    "script": {
      "source": "srt",
      "cues": [],
      "updatedAt": null
    },
    "createdAt": "2026-10-29T00:00:00.000Z",
    "updatedAt": "2026-10-29T00:00:00.000Z"
  },
  {
    "id": "course-workplace-w01",
    "courseId": "course-workplace",
    "week": 1,
    "title": "상사와의 오해를 풀고 직장 관계 파악하기",
    "description": "상사와의 민망한 오해를 따라가며, 사과하고 서로 지켜야 할 선을 확인하는 직장 생활 중국어를 배워요.",
    "direction": "zh-ko",
    "level": "hsk5",
    "status": "published",
    "video": {
      "youtubeUrl": "https://youtu.be/5WiXCsy_cGo",
      "youtubeId": "5WiXCsy_cGo",
      "startTime": 0,
      "endTime": 207
    },
    "source": {
      "dramaTitle": "你也有今天",
      "episode": "",
      "videoTitle": "打工人社死现场！成瑶以为的陪酒牛郎钱恒竟然是顶头上司 当面对质的尴尬程度不亚于脚趾抠地板"
    },
    "script": {
      "source": "srt",
      "cues": [
        {
          "start": 0,
          "end": 1.159,
          "zh": "这个小隔间",
          "ko": "이 작은 칸막이 방은",
          "pinyin": "zhège xiǎo géjiān"
        },
        {
          "start": 1.159,
          "end": 3.7199999999999998,
          "zh": "老板的战利品存放处",
          "ko": "대표님 전리품 보관소야",
          "pinyin": "lǎobǎn de zhànlìpǐn cúnfàngchù"
        },
        {
          "start": 5.32,
          "end": 6.52,
          "zh": "这些都是老板的",
          "ko": "이게 다 대표님 거야",
          "pinyin": "zhèxiē dōu shì lǎobǎn de"
        },
        {
          "start": 8.64,
          "end": 9.72,
          "zh": "这些也是",
          "ko": "이것도 그렇고",
          "pinyin": "zhèxiē yě shì"
        },
        {
          "start": 10.88,
          "end": 12.32,
          "zh": "那大家应该很喜欢老板",
          "ko": "그럼 다들 대표님을 엄청 좋아하겠네요",
          "pinyin": "nà dàjiā yīnggāi hěn xǐhuan lǎobǎn"
        },
        {
          "start": 12.32,
          "end": 13.519,
          "zh": "你们为什么那么说他",
          "ko": "근데 왜 다들 그렇게 대표님 얘기를 해요?",
          "pinyin": "nǐmen wèishénme nàme shuō tā"
        },
        {
          "start": 14.28,
          "end": 15.16,
          "zh": "不要只看这边",
          "ko": "이쪽만 보지 말고",
          "pinyin": "búyào zhǐ kàn zhèbiān"
        },
        {
          "start": 15.519,
          "end": 16.32,
          "zh": "看看这边",
          "ko": "이쪽도 봐 봐",
          "pinyin": "kànkan zhèbiān"
        },
        {
          "start": 22.719,
          "end": 25.199,
          "zh": "这么多恐吓信跟恐吓物件",
          "ko": "이렇게 많은 협박 편지랑 협박 물건들",
          "pinyin": "zhème duō kǒnghè xìn gēn kǒnghè wùjiàn"
        },
        {
          "start": 26.359,
          "end": 27.199,
          "zh": "怪不得钱恒",
          "ko": "어쩐지 첸헝이",
          "pinyin": "guàibude qián héng"
        },
        {
          "start": 27.199,
          "end": 28.8,
          "zh": "总是得不到今天评奖",
          "ko": "매번 상을 못 받더라",
          "pinyin": "zǒngshì dé bu dào jīntiān píngjiǎng"
        },
        {
          "start": 31,
          "end": 33.92,
          "zh": "这要是不被暗杀就不错了",
          "ko": "이 정도면 암살 안 당한 게 다행이지",
          "pinyin": "zhè yàoshi bú bèi ànshā jiù búcuò le"
        },
        {
          "start": 33.92,
          "end": 34.159,
          "zh": "其实网上呢",
          "ko": "사실 인터넷에서도",
          "pinyin": "qíshí wǎngshàng ne"
        },
        {
          "start": 34.439,
          "end": 35.2,
          "zh": "也不是没有讨论过",
          "ko": "논의된 적이 없진 않아",
          "pinyin": "yě bú shì méiyǒu tǎolùn guo"
        },
        {
          "start": 35.2,
          "end": 36,
          "zh": "这种可能性",
          "ko": "이런 가능성에 대해서",
          "pinyin": "zhè zhǒng kěnéngxìng"
        },
        {
          "start": 37.159,
          "end": 38.159,
          "zh": "那老板留着这些",
          "ko": "그럼 대표님이 이걸 남겨 두는 건",
          "pinyin": "nà lǎobǎn liúzhe zhèxiē"
        },
        {
          "start": 38.159,
          "end": 39.56,
          "zh": "是为了要警醒自己吗",
          "ko": "스스로 경각심을 가지려는 거예요?",
          "pinyin": "shì wèile yào jǐngxǐng zìjǐ ma"
        },
        {
          "start": 41.32,
          "end": 42.6,
          "zh": "万一这些人报复",
          "ko": "혹시 이 사람들이 보복하면",
          "pinyin": "wànyī zhèxiē rén bàofù"
        },
        {
          "start": 42.88,
          "end": 44.399,
          "zh": "这些恐吓信就是罪证",
          "ko": "이 협박 편지들이 바로 범죄 증거가 되잖아",
          "pinyin": "zhèxiē kǒnghè xìn jiùshì zuìzhèng"
        },
        {
          "start": 45,
          "end": 46.92,
          "zh": "方便给他们定罪",
          "ko": "그 사람들 죄를 입증하기 편하게",
          "pinyin": "fāngbiàn gěi tāmen dìngzuì"
        },
        {
          "start": 46.92,
          "end": 47.4,
          "zh": "老板",
          "ko": "대표님",
          "pinyin": "lǎobǎn"
        },
        {
          "start": 53.879,
          "end": 54.64,
          "zh": "这么巧",
          "ko": "이런 우연이",
          "pinyin": "zhème qiǎo"
        },
        {
          "start": 55.4,
          "end": 56.12,
          "zh": "认识",
          "ko": "아는 사이예요?",
          "pinyin": "rènshi"
        },
        {
          "start": 56.12,
          "end": 57,
          "zh": "不认识",
          "ko": "모르는 사이예요",
          "pinyin": "bú rènshi"
        },
        {
          "start": 57,
          "end": 57.92,
          "zh": "怎么不认识",
          "ko": "왜 몰라",
          "pinyin": "zěnme bú rènshi"
        },
        {
          "start": 58.6,
          "end": 59.56,
          "zh": "我们还就一房两组的",
          "ko": "우리 둘이 한 집 이중 임대 건으로",
          "pinyin": "wǒmen hái jiù yì fáng liǎng zǔ de"
        },
        {
          "start": 59.56,
          "end": 61.24,
          "zh": "法律问题",
          "ko": "법률 문제를",
          "pinyin": "fǎlǜ wèntí"
        },
        {
          "start": 61.24,
          "end": 62.44,
          "zh": "进行了深入的探讨",
          "ko": "깊이 있게 토론했잖아",
          "pinyin": "jìnxíng le shēnrù de tàntǎo"
        },
        {
          "start": 62.64,
          "end": 63.679,
          "zh": "是不是 成律师",
          "ko": "그렇지, 청 변호사?",
          "pinyin": "shì bu shì chéng lǜshī"
        },
        {
          "start": 68.159,
          "end": 68.6,
          "zh": "包锐",
          "ko": "바오루이",
          "pinyin": "bāo ruì"
        },
        {
          "start": 69.64,
          "end": 70.64,
          "zh": "把这个存档一下",
          "ko": "이거 보관해 둬",
          "pinyin": "bǎ zhège cúndàng yíxià"
        },
        {
          "start": 71,
          "end": 72.879,
          "zh": "这是上次那个家族信托纠纷案",
          "ko": "지난번 그 가족 신탁 분쟁 사건에서",
          "pinyin": "zhè shì shàng cì nàge jiāzú xìntuō jiūfēn àn"
        },
        {
          "start": 72.879,
          "end": 74.32,
          "zh": "对方当事人寄来的恐吓信",
          "ko": "상대 측 당사자가 보낸 협박 편지야",
          "pinyin": "duìfāng dāngshìrén jì lái de kǒnghè xìn"
        },
        {
          "start": 75.04,
          "end": 75.879,
          "zh": "好的 交给我",
          "ko": "네, 저한테 주세요",
          "pinyin": "hǎo de jiāo gěi wǒ"
        },
        {
          "start": 78.56,
          "end": 79.4,
          "zh": "放在最外面",
          "ko": "제일 바깥쪽에 둬",
          "pinyin": "fàng zài zuì wàimiàn"
        },
        {
          "start": 79.76,
          "end": 81,
          "zh": "最近他们刚输了官司",
          "ko": "그쪽이 얼마 전에 소송에서 졌으니까",
          "pinyin": "zuìjìn tāmen gāng shū le guānsi"
        },
        {
          "start": 81,
          "end": 81.76,
          "zh": "可能闹事",
          "ko": "소란을 피울 수도 있어",
          "pinyin": "kěnéng nàoshì"
        },
        {
          "start": 84.159,
          "end": 85.4,
          "zh": "如果这么喜欢蛇的话",
          "ko": "그렇게 뱀을 좋아하면",
          "pinyin": "rúguǒ zhème xǐhuan shé dehuà"
        },
        {
          "start": 85.4,
          "end": 86.48,
          "zh": "明天我送你条真的",
          "ko": "내일 진짜 뱀 한 마리 선물해 줄게",
          "pinyin": "míngtiān wǒ sòng nǐ tiáo zhēn de"
        },
        {
          "start": 87.599,
          "end": 88.439,
          "zh": "你 过来",
          "ko": "너, 이리 와",
          "pinyin": "nǐ guòlai"
        },
        {
          "start": 92.4,
          "end": 93,
          "zh": "完了",
          "ko": "망했다",
          "pinyin": "wán le"
        },
        {
          "start": 97.159,
          "end": 97.799,
          "zh": "我也完了",
          "ko": "나도 망했어",
          "pinyin": "wǒ yě wán le"
        },
        {
          "start": 98.24,
          "end": 100.079,
          "zh": "你玩什么蛇呀",
          "ko": "뱀은 왜 갖고 놀고 그래",
          "pinyin": "nǐ wán shénme shé ya"
        },
        {
          "start": 106.359,
          "end": 107.32,
          "zh": "你有什么想说的吗",
          "ko": "할 말 있어?",
          "pinyin": "nǐ yǒu shénme xiǎng shuō de ma"
        },
        {
          "start": 108.48,
          "end": 109.359,
          "zh": "老板 我狭隘了",
          "ko": "대표님, 제가 속이 좁았어요",
          "pinyin": "lǎobǎn wǒ xiá'ài le"
        },
        {
          "start": 109.359,
          "end": 110.04,
          "zh": "我格局小了",
          "ko": "제 그릇이 작았어요",
          "pinyin": "wǒ géjú xiǎo le"
        },
        {
          "start": 110.04,
          "end": 111.48,
          "zh": "我井底之蛙 我鼠目寸光",
          "ko": "저는 우물 안 개구리에 눈앞만 보는 사람이었어요",
          "pinyin": "wǒ jǐng dǐ zhī wā wǒ shǔ mù cùn guāng"
        },
        {
          "start": 112.12,
          "end": 113.439,
          "zh": "房租跟你平分好不好",
          "ko": "월세는 너랑 반반 나누는 거 어때?",
          "pinyin": "fángzū gēn nǐ píngfēn hǎo bu hǎo"
        },
        {
          "start": 113.439,
          "end": 114.52,
          "zh": "我确实比较困难",
          "ko": "제가 사정이 좀 어렵긴 해요",
          "pinyin": "wǒ quèshí bǐjiào kùnnan"
        },
        {
          "start": 115,
          "end": 115.54,
          "zh": "我不想靠强权",
          "ko": "나는 힘으로 밀어붙여서",
          "pinyin": "wǒ bù xiǎng kào qiángquán"
        },
        {
          "start": 115.54,
          "end": 117.64,
          "zh": "剥夺你好不容易争取来的权利",
          "ko": "네가 어렵게 얻어 낸 권리를 빼앗고 싶진 않아",
          "pinyin": "bōduó nǐ hǎobù róngyì zhēngqǔ lái de quánlì"
        },
        {
          "start": 117.84,
          "end": 118.8,
          "zh": "是不是有点感激我",
          "ko": "좀 고맙지 않아?",
          "pinyin": "shì bu shì yǒudiǎn gǎnjī wǒ"
        },
        {
          "start": 119.119,
          "end": 120.519,
          "zh": "老板 你好好啊",
          "ko": "대표님, 너무 좋으세요",
          "pinyin": "lǎobǎn nǐ hǎo hǎo a"
        },
        {
          "start": 122.84,
          "end": 124.719,
          "zh": "之前真的是我有眼无珠了",
          "ko": "전에는 정말 제가 사람 볼 줄을 몰랐어요",
          "pinyin": "zhīqián zhēn de shì wǒ yǒu yǎn wú zhū le"
        },
        {
          "start": 125.599,
          "end": 126.239,
          "zh": "对不起啊",
          "ko": "죄송해요",
          "pinyin": "duìbuqǐ a"
        },
        {
          "start": 126.56,
          "end": 127.2,
          "zh": "只不过",
          "ko": "다만",
          "pinyin": "zhǐbuguò"
        },
        {
          "start": 127.2,
          "end": 128.52,
          "zh": "作为尊重彼此的前提",
          "ko": "서로를 존중한다는 전제로",
          "pinyin": "zuòwéi zūnzhòng bǐcǐ de qiántí"
        },
        {
          "start": 128.759,
          "end": 130.159,
          "zh": "我希望你能尊重我的习惯",
          "ko": "내 습관을 존중해 줬으면 해",
          "pinyin": "wǒ xīwàng nǐ néng zūnzhòng wǒ de xíguàn"
        },
        {
          "start": 130.439,
          "end": 131.199,
          "zh": "我们互不打扰",
          "ko": "서로 방해하지 말자고",
          "pinyin": "wǒmen hù bù dǎrǎo"
        },
        {
          "start": 131.479,
          "end": 132.079,
          "zh": "当然了",
          "ko": "당연하죠",
          "pinyin": "dāngrán le"
        },
        {
          "start": 132.56,
          "end": 133.4,
          "zh": "老板 你放心吧",
          "ko": "대표님, 걱정 마세요",
          "pinyin": "lǎobǎn nǐ fàngxīn ba"
        },
        {
          "start": 133.599,
          "end": 135.159,
          "zh": "我这个人非常懂事",
          "ko": "저 눈치 엄청 빠른 사람이에요",
          "pinyin": "wǒ zhège rén fēicháng dǒngshì"
        },
        {
          "start": 137.28,
          "end": 138.079,
          "zh": "我的意思是",
          "ko": "내 말은",
          "pinyin": "wǒ de yìsi shì"
        },
        {
          "start": 138.519,
          "end": 139.879,
          "zh": "我们以后工作接触的机会",
          "ko": "앞으로 우리가 일하면서 마주칠 일이",
          "pinyin": "wǒmen yǐhòu gōngzuò jiēchù de jīhuì"
        },
        {
          "start": 139.879,
          "end": 140.439,
          "zh": "非常多",
          "ko": "아주 많을 거라는 거야",
          "pinyin": "fēicháng duō"
        },
        {
          "start": 141.12,
          "end": 142.599,
          "zh": "我希望你能守住自己的底线",
          "ko": "네가 선을 잘 지켰으면 좋겠어",
          "pinyin": "wǒ xīwàng nǐ néng shǒuzhù zìjǐ de dǐxiàn"
        },
        {
          "start": 142.599,
          "end": 143.439,
          "zh": "把持住自己",
          "ko": "자기 자신을 잘 붙잡고",
          "pinyin": "bǎchí zhù zìjǐ"
        },
        {
          "start": 144.12,
          "end": 145.199,
          "zh": "把持住自己",
          "ko": "자기 자신을 붙잡으라고요?",
          "pinyin": "bǎchí zhù zìjǐ"
        },
        {
          "start": 145.479,
          "end": 146.24,
          "zh": "什么意思",
          "ko": "무슨 뜻이에요?",
          "pinyin": "shénme yìsi"
        },
        {
          "start": 147.12,
          "end": 148.759,
          "zh": "我知道我这个人魅力非常大",
          "ko": "나도 내가 매력이 넘친다는 건 알아",
          "pinyin": "wǒ zhīdào wǒ zhège rén mèilì fēicháng dà"
        },
        {
          "start": 148.96,
          "end": 149.96,
          "zh": "但是工作归工作",
          "ko": "하지만 일은 일이야",
          "pinyin": "dànshì gōngzuò guī gōngzuò"
        },
        {
          "start": 149.96,
          "end": 150.92,
          "zh": "尤其是上下级",
          "ko": "특히 상사와 부하 사이에",
          "pinyin": "yóuqí shì shàngxiàjí"
        },
        {
          "start": 151.2,
          "end": 152.36,
          "zh": "如果因为产生一些",
          "ko": "만약 쓸데없는",
          "pinyin": "rúguǒ yīnwèi chǎnshēng yìxiē"
        },
        {
          "start": 152.36,
          "end": 154.04,
          "zh": "有的没的的感情而影响工作",
          "ko": "감정이 생겨서 일에 영향을 준다면",
          "pinyin": "yǒude méide de gǎnqíng ér yǐngxiǎng gōngzuò"
        },
        {
          "start": 154.04,
          "end": 154.92,
          "zh": "这非常不专业",
          "ko": "그건 아주 프로답지 못한 거야",
          "pinyin": "zhè fēicháng bù zhuānyè"
        },
        {
          "start": 155.68,
          "end": 156.4,
          "zh": "在你之前",
          "ko": "너 이전에",
          "pinyin": "zài nǐ zhīqián"
        },
        {
          "start": 156.4,
          "end": 157.16,
          "zh": "十三个助理",
          "ko": "비서 열세 명이",
          "pinyin": "shísān gè zhùlǐ"
        },
        {
          "start": 157.16,
          "end": 158.56,
          "zh": "都是因为这些不专业的行为",
          "ko": "전부 이런 프로답지 못한 행동 때문에",
          "pinyin": "dōu shì yīnwèi zhèxiē bù zhuānyè de xíngwéi"
        },
        {
          "start": 158.56,
          "end": 159.32,
          "zh": "被我开除了",
          "ko": "나한테 해고당했어",
          "pinyin": "bèi wǒ kāichú le"
        },
        {
          "start": 161.36,
          "end": 162.2,
          "zh": "你有什么问题吗",
          "ko": "무슨 문제 있어?",
          "pinyin": "nǐ yǒu shénme wèntí ma"
        },
        {
          "start": 163.36,
          "end": 164.12,
          "zh": "没有问题",
          "ko": "문제없어요",
          "pinyin": "méiyǒu wèntí"
        },
        {
          "start": 168.08,
          "end": 168.8,
          "zh": "对了 老板",
          "ko": "참, 대표님",
          "pinyin": "duì le lǎobǎn"
        },
        {
          "start": 169.12,
          "end": 169.88,
          "zh": "你这么有钱",
          "ko": "그렇게 돈이 많으시면서",
          "pinyin": "nǐ zhème yǒu qián"
        },
        {
          "start": 169.88,
          "end": 170.92,
          "zh": "为什么要住那里呀",
          "ko": "왜 거기 사세요?",
          "pinyin": "wèishénme yào zhù nàlǐ ya"
        },
        {
          "start": 174.439,
          "end": 175.96,
          "zh": "你是在窥探我的隐私吗",
          "ko": "지금 내 사생활을 캐는 거야?",
          "pinyin": "nǐ shì zài kuītàn wǒ de yǐnsī ma"
        },
        {
          "start": 178,
          "end": 179,
          "zh": "我很好奇",
          "ko": "나는 궁금한데",
          "pinyin": "wǒ hěn hàoqí"
        },
        {
          "start": 180,
          "end": 180.5,
          "zh": "你是为什么觉得",
          "ko": "넌 왜",
          "pinyin": "nǐ shì wèishénme juéde"
        },
        {
          "start": 180.5,
          "end": 181.9,
          "zh": "我会从事特殊服务的",
          "ko": "내가 특수 서비스 일을 할 거라고 생각했어?",
          "pinyin": "wǒ huì cóngshì tèshū fúwù de"
        },
        {
          "start": 181.9,
          "end": 182.68,
          "zh": "我瞎了",
          "ko": "제가 눈이 삐었었죠",
          "pinyin": "wǒ xiā le"
        },
        {
          "start": 187,
          "end": 188.08,
          "zh": "就是前两天",
          "ko": "그게 며칠 전에",
          "pinyin": "jiùshì qián liǎng tiān"
        },
        {
          "start": 188.08,
          "end": 190,
          "zh": "在餐厅吃饭的时候",
          "ko": "식당에서 밥 먹을 때",
          "pinyin": "zài cāntīng chīfàn de shíhou"
        },
        {
          "start": 189.76,
          "end": 193.319,
          "zh": "说要给你巨额时薪",
          "ko": "엄청난 시급을 주겠다고 하는",
          "pinyin": "shuō yào gěi nǐ jù'é shíxīn"
        },
        {
          "start": 190,
          "end": 191.76,
          "zh": "看到一个富婆客户",
          "ko": "돈 많은 여자 고객을 봤거든요",
          "pinyin": "kàndào yí gè fùpó kèhù"
        },
        {
          "start": 193.319,
          "end": 195.5,
          "zh": "让你陪她吃饭 陪她逛街",
          "ko": "같이 밥 먹고 같이 쇼핑해 달라고 하면서",
          "pinyin": "ràng nǐ péi tā chīfàn péi tā guàngjiē"
        },
        {
          "start": 195.5,
          "end": 196.5,
          "zh": "离你特别近",
          "ko": "대표님한테 엄청 가까이 붙어 있고",
          "pinyin": "lí nǐ tèbié jìn"
        },
        {
          "start": 196.5,
          "end": 196.7,
          "zh": "还靠",
          "ko": "기대기까지 하고",
          "pinyin": "hái kào"
        },
        {
          "start": 196.7,
          "end": 197.96,
          "zh": "那是我妈",
          "ko": "그건 우리 엄마야",
          "pinyin": "nà shì wǒ mā"
        },
        {
          "start": 203.64,
          "end": 203.919,
          "zh": "真的是偶像剧",
          "ko": "진짜 로맨스 드라마 같네",
          "pinyin": "zhēn de shì ǒuxiàngjù"
        }
      ],
      "updatedAt": "2026-11-01T14:41:45.076Z",
      "origin": {
        "zh": {
          "provider": "srt",
          "fileName": "니야유금천_1주차.srt",
          "fetchedAt": "2026-11-01T14:38:12.337Z"
        },
        "ko": {
          "provider": "ai",
          "fetchedAt": "2026-11-01T14:39:22.322Z"
        }
      }
    },
    "createdAt": "2026-10-29T00:00:00.000Z",
    "updatedAt": "2026-11-01T15:01:50.437Z",
    "draft": {
      "expressions": [
        {
          "id": "note-mvxxt5yj-kh1dc0",
          "source": "怪不得钱恒",
          "note": "'怪不得'는 '어쩐지, 그러니까 ~하구나'라는 뜻으로, 이유를 알고 나서 그동안의 일이 이해될 때 써요. 이 장면에서는 협박 편지가 가득한 걸 보고 '어쩐지 첸헝이 (매번 상을 못 받더라)'라고 말하는 거예요. 같은 뜻으로 '难怪'도 자주 써요.",
          "pinyin": "guàibude qián héng"
        },
        {
          "id": "note-mvxxt5yj-faif1g",
          "source": "我井底之蛙 我鼠目寸光",
          "note": "'저는 우물 안 개구리고, 눈앞만 보는 사람이었어요'라는 뜻이에요. '井底之蛙'는 '우물 안 개구리', '鼠目寸光'은 '쥐의 눈처럼 한 치 앞만 본다', 즉 식견이 좁다는 뜻의 성어예요. 상사에게 자기 잘못을 과장되게 인정하며 비위를 맞추는 코믹한 장면이에요.",
          "pinyin": "wǒ jǐng dǐ zhī wā wǒ shǔ mù cùn guāng"
        },
        {
          "id": "note-mvxxt5yj-wgv229",
          "source": "之前真的是我有眼无珠了",
          "note": "'전에는 정말 제가 사람 볼 줄을 몰랐어요'라는 뜻이에요. '有眼无珠'는 '눈은 있는데 눈동자가 없다', 즉 사람이나 사물의 가치를 알아보는 안목이 없다는 성어예요. 상대를 오해했다가 사과할 때 자주 써요.",
          "pinyin": "zhīqián zhēn de shì wǒ yǒu yǎn wú zhū le"
        },
        {
          "id": "note-mvxxt5yj-tsp2v5",
          "source": "我们互不打扰",
          "note": "'우리 서로 방해하지 말자'라는 뜻이에요. '互'는 '서로'라는 뜻으로 '互相'의 줄임말처럼 쓰이고, '打扰'는 '방해하다, 폐를 끼치다'라는 뜻이에요. 함께 지내지만 서로의 생활에 간섭하지 않겠다는 선을 그을 때 쓰는 표현이에요.",
          "pinyin": "wǒmen hù bù dǎrǎo"
        },
        {
          "id": "note-mvxxt5yj-fsa4je",
          "source": "但是工作归工作",
          "note": "'A归A'는 'A는 A대로', 즉 'A는 A이고 다른 일과는 별개다'라는 뜻이에요. '工作归工作'는 '일은 일이다'라는 의미로, 사적인 감정과 업무를 구분하라고 할 때 써요. 예: 朋友归朋友，钱要还。(친구는 친구고, 돈은 갚아야지.)",
          "pinyin": "dànshì gōngzuò guī gōngzuò"
        }
      ],
      "grammar": [
        {
          "id": "note-mvxxt5yj-zlmxi4",
          "source": "也不是没有讨论过",
          "note": "'不是没有…'는 부정을 두 번 써서 '~한 적이 없는 건 아니다', 즉 '~한 적이 있다'를 완곡하게 말하는 이중부정이에요. '동사 + 过'는 경험을 나타내요. 예문: 我也不是没有想过这个问题。(나도 이 문제를 생각해 본 적이 없는 건 아니야.)",
          "pinyin": "yě bú shì méiyǒu tǎolùn guo"
        },
        {
          "id": "note-mvxxt5yj-81hpgd",
          "source": "万一这些人报复",
          "note": "'万一'는 '만약에, 혹시라도'라는 뜻으로, 일어날 가능성은 낮지만 좋지 않은 상황을 가정할 때 써요. '报复'는 '보복하다'라는 뜻이에요. 예문: 万一下雨了，我们就在家看电影。(혹시 비가 오면 우리 집에서 영화 보자.)",
          "pinyin": "wànyī zhèxiē rén bàofù"
        },
        {
          "id": "note-mvxxt5yj-q5fqe0",
          "source": "如果这么喜欢蛇的话",
          "note": "'如果…的话'는 '만약 ~라면'이라는 가정 문형이에요. 뒤 문장에는 흔히 '就'가 이어져요. 이 장면에서는 '그렇게 뱀을 좋아하면 (내일 진짜 뱀을 선물해 줄게)'라는 뜻이에요. 예문: 如果你有时间的话，我们一起去吧。(시간 있으면 우리 같이 가자.)",
          "pinyin": "rúguǒ zhème xǐhuan shé dehuà"
        },
        {
          "id": "note-mvxxt5yj-zk5hbm",
          "source": "剥夺你好不容易争取来的权利",
          "note": "'好不容易'는 '겨우, 간신히, 어렵게'라는 뜻이에요. 글자에 '不'가 있지만 '容易하지 않게', 즉 '힘들게 해냈다'는 의미라는 점에 주의하세요. '剥夺'는 '빼앗다, 박탈하다'라는 뜻이에요. 예문: 我好不容易才找到这家店。(나 이 가게 겨우 찾았어.)",
          "pinyin": "bōduó nǐ hǎobù róngyì zhēngqǔ lái de quánlì"
        },
        {
          "id": "note-mvxxt5yj-xy8q9t",
          "source": "被我开除了",
          "note": "'被 + 행위자 + 동사'는 '~에게 ~당하다'라는 피동문이에요. '开除'는 '해고하다, 제명하다'라는 뜻이고, '被我开除了'는 '나한테 해고당했다'라는 의미예요. 예문: 他被老师批评了。(그는 선생님께 꾸중을 들었어요.)",
          "pinyin": "bèi wǒ kāichú le"
        }
      ],
      "lenses": [
        {
          "id": "lens-mvxxt5yj-e6xbpj",
          "title": "직장에서 부르는 '老板'",
          "source": "老板",
          "text": "'老板'은 원래 가게나 회사의 주인, 사장을 뜻하는 말이에요. 하지만 요즘 중국 직장에서는 실제 사장이 아니더라도 자신을 직접 이끄는 상사나 팀장을 '老板'이라고 부르는 경우가 많아요. 이 장면처럼 로펌에서도 조수나 신입 변호사가 자신을 지도하는 파트너 변호사를 '老板'이라고 불러요. 한국에서는 '부장님', '팀장님'처럼 직함을 정확히 부르는 문화가 강한 데 비해, 중국의 '老板'은 존중과 친근함이 함께 담긴 비교적 편한 호칭이에요. 대학원생이 지도 교수를 '老板'이라고 부르기도 할 만큼 쓰임이 넓어요."
        }
      ],
      "quiz": [
        {
          "id": "quiz-mvxxt5yj-0xyutu",
          "question": "'怪不得钱恒 总是得不到今天评奖'에서 '怪不得'의 뜻으로 알맞은 것은?",
          "options": [
            "이상하게도",
            "탓할 수 없게도",
            "다행히도",
            "어쩐지"
          ],
          "answer": 3,
          "explanation": "'怪不得'는 이유를 알고 나서 상황이 이해될 때 쓰는 '어쩐지'라는 뜻이에요. 협박 편지가 가득한 걸 보고 첸헝이 상을 못 받는 이유를 납득하는 장면이에요."
        },
        {
          "id": "quiz-mvxxt5yk-9cp3to",
          "question": "'之前真的是我有眼无珠了'에서 '有眼无珠'의 뜻으로 가장 알맞은 것은?",
          "options": [
            "눈이 나빠서 잘 안 보인다",
            "사람이나 사물의 가치를 알아보는 안목이 없다",
            "눈치가 매우 빠르다",
            "보고도 못 본 척한다"
          ],
          "answer": 1,
          "explanation": "'有眼无珠'는 '눈은 있지만 눈동자가 없다'라는 성어로, 상대의 진가를 알아보지 못했다는 뜻이에요. 대표를 오해했던 것을 사과하는 장면에서 쓰였어요."
        },
        {
          "id": "quiz-mvxxt5yk-cexrq1",
          "question": "'但是工作归工作'는 어떤 의미인가요?",
          "options": [
            "일은 일이고, 사적인 감정과는 구분해야 한다",
            "일은 다시 돌려줘야 한다",
            "일을 할수록 일이 늘어난다",
            "일은 모두 같은 일이다"
          ],
          "answer": 0,
          "explanation": "'A归A'는 'A는 A대로 별개다'라는 문형이에요. 대표는 업무와 사적인 감정을 섞지 말라는 뜻으로 이 말을 했어요."
        },
        {
          "id": "quiz-mvxxt5yk-kp0yr5",
          "question": "대표의 말에 따르면 이전 비서 13명이 해고된 이유는 무엇인가요?",
          "options": [
            "업무 실수가 많아서",
            "지각을 자주 해서",
            "업무와 상관없는 감정 때문에 프로답지 못하게 행동해서",
            "월세를 내지 않아서"
          ],
          "answer": 2,
          "explanation": "'都是因为这些不专业的行为 被我开除了'라는 대사에서 알 수 있듯이, 상사에게 쓸데없는 감정을 품고 일에 영향을 준 '프로답지 못한 행동' 때문에 해고되었다고 말해요."
        },
        {
          "id": "quiz-mvxxt5yk-38gj6e",
          "question": "'剥夺你好不容易争取来的权利'에서 '好不容易'의 뜻으로 알맞은 것은?",
          "options": [
            "아주 쉽게",
            "어렵게, 간신히",
            "전혀 쉽지 않아서 포기한",
            "좋지 않게"
          ],
          "answer": 1,
          "explanation": "'好不容易'는 글자에 '不'가 있지만 '어렵게, 간신히 해냈다'라는 뜻이에요. 네가 어렵게 얻어 낸 권리를 빼앗고 싶지 않다는 의미예요."
        }
      ],
      "level": "",
      "createdAt": "2026-11-01T14:40:34.412Z",
      "updatedAt": "2026-11-01T14:40:34.412Z"
    },
    "captionMask": {
      "enabled": true,
      "top": 78,
      "height": 12,
      "width": 70
    }
  },
  {
    "id": "course-workplace-w02",
    "courseId": "course-workplace",
    "week": 2,
    "title": "전문적인 요청에 대응하고 입장 밝히기",
    "description": "",
    "direction": "zh-ko",
    "level": "",
    "status": "draft",
    "video": {
      "youtubeUrl": "https://youtu.be/M9AY_hLeLvs",
      "youtubeId": "M9AY_hLeLvs",
      "startTime": 0,
      "endTime": 0
    },
    "source": {
      "dramaTitle": "你也有今天",
      "episode": "",
      "videoTitle": "油腻男试图白嫖成瑶法律建议，钱恒及时现身霸气劝退“她的时间都是我的”"
    },
    "script": {
      "source": "srt",
      "cues": [],
      "updatedAt": null
    },
    "createdAt": "2026-10-29T00:00:00.000Z",
    "updatedAt": "2026-10-29T00:00:00.000Z"
  },
  {
    "id": "course-workplace-w03",
    "courseId": "course-workplace",
    "week": 3,
    "title": "사건의 사실관계를 파악하고 상황 설명하기",
    "description": "",
    "direction": "zh-ko",
    "level": "",
    "status": "draft",
    "video": {
      "youtubeUrl": "https://youtu.be/4QoZAc63524",
      "youtubeId": "4QoZAc63524",
      "startTime": 0,
      "endTime": 0
    },
    "source": {
      "dramaTitle": "你也有今天",
      "episode": "",
      "videoTitle": "富豪装绝症晚期坚持要跟原配离婚，没想到被成瑶撞破小三即将生产"
    },
    "script": {
      "source": "srt",
      "cues": [],
      "updatedAt": null
    },
    "createdAt": "2026-10-29T00:00:00.000Z",
    "updatedAt": "2026-10-29T00:00:00.000Z"
  },
  {
    "id": "course-workplace-w04",
    "courseId": "course-workplace",
    "week": 4,
    "title": "업무 행사에서 소통하고 상황 파악하기",
    "description": "",
    "direction": "zh-ko",
    "level": "",
    "status": "draft",
    "video": {
      "youtubeUrl": "https://youtu.be/pYhtDs-87NE",
      "youtubeId": "pYhtDs-87NE",
      "startTime": 0,
      "endTime": 0
    },
    "source": {
      "dramaTitle": "你也有今天",
      "episode": "",
      "videoTitle": "商业活动变相亲？腹黑钱恒：跟成瑶一起也不是不行！"
    },
    "script": {
      "source": "srt",
      "cues": [],
      "updatedAt": null
    },
    "createdAt": "2026-10-29T00:00:00.000Z",
    "updatedAt": "2026-10-29T00:00:00.000Z"
  },
  {
    "id": "course-workplace-w05",
    "courseId": "course-workplace",
    "week": 5,
    "title": "상사와 업무 관계 조율하기",
    "description": "",
    "direction": "zh-ko",
    "level": "",
    "status": "draft",
    "video": {
      "youtubeUrl": "https://youtu.be/3IodkcrIY2g",
      "youtubeId": "3IodkcrIY2g",
      "startTime": 0,
      "endTime": 0
    },
    "source": {
      "dramaTitle": "你也有今天",
      "episode": "",
      "videoTitle": "毒舌霸总一句话让小助理破防，成瑶故意和钱恒保持距离？"
    },
    "script": {
      "source": "srt",
      "cues": [],
      "updatedAt": null
    },
    "createdAt": "2026-10-29T00:00:00.000Z",
    "updatedAt": "2026-10-29T00:00:00.000Z"
  },
  {
    "id": "course-workplace-w06",
    "courseId": "course-workplace",
    "week": 6,
    "title": "회의에서 사건을 논의하고 의견 제시하기",
    "description": "",
    "direction": "zh-ko",
    "level": "",
    "status": "draft",
    "video": {
      "youtubeUrl": "https://youtu.be/EI6Qjxfsfm8",
      "youtubeId": "EI6Qjxfsfm8",
      "startTime": 0,
      "endTime": 0
    },
    "source": {
      "dramaTitle": "你也有今天",
      "episode": "",
      "videoTitle": "毒舌霸总钱恒开会盯着小助理成瑶发呆，完蛋了这动心的表情！"
    },
    "script": {
      "source": "srt",
      "cues": [],
      "updatedAt": null
    },
    "createdAt": "2026-10-29T00:00:00.000Z",
    "updatedAt": "2026-10-29T00:00:00.000Z"
  },
  {
    "id": "course-workplace-w07",
    "courseId": "course-workplace",
    "week": 7,
    "title": "고객과의 문제 상황에 대응하기",
    "description": "",
    "direction": "zh-ko",
    "level": "",
    "status": "draft",
    "video": {
      "youtubeUrl": "https://youtu.be/zGxpsAvVxOM",
      "youtubeId": "zGxpsAvVxOM",
      "startTime": 0,
      "endTime": 0
    },
    "source": {
      "dramaTitle": "你也有今天",
      "episode": "",
      "videoTitle": "解气！钱恒暴打色狼客户，霸气牵手成瑶离开"
    },
    "script": {
      "source": "srt",
      "cues": [],
      "updatedAt": null
    },
    "createdAt": "2026-10-29T00:00:00.000Z",
    "updatedAt": "2026-10-29T00:00:00.000Z"
  },
  {
    "id": "course-workplace-w08",
    "courseId": "course-workplace",
    "week": 8,
    "title": "직업과 경력에 대해 설명하기",
    "description": "",
    "direction": "zh-ko",
    "level": "",
    "status": "draft",
    "video": {
      "youtubeUrl": "https://youtu.be/uHXK1PiXoBg",
      "youtubeId": "uHXK1PiXoBg",
      "startTime": 0,
      "endTime": 0
    },
    "source": {
      "dramaTitle": "你也有今天",
      "episode": "",
      "videoTitle": "成瑶爆改精英律师钱恒新人设“大专毕业 工厂打工 刚刚失业” 霸总表示很无语"
    },
    "script": {
      "source": "srt",
      "cues": [],
      "updatedAt": null
    },
    "createdAt": "2026-10-29T00:00:00.000Z",
    "updatedAt": "2026-10-29T00:00:00.000Z"
  },
  {
    "id": "course-workplace-w09",
    "courseId": "course-workplace",
    "week": 9,
    "title": "업무상 어려움과 감정 설명하기",
    "description": "",
    "direction": "zh-ko",
    "level": "",
    "status": "draft",
    "video": {
      "youtubeUrl": "https://youtu.be/LdVMQIGFSQk",
      "youtubeId": "LdVMQIGFSQk",
      "startTime": 0,
      "endTime": 0
    },
    "source": {
      "dramaTitle": "你也有今天",
      "episode": "",
      "videoTitle": "成瑶案件上受委屈，钱恒得知准备豪华大餐霸气安慰"
    },
    "script": {
      "source": "srt",
      "cues": [],
      "updatedAt": null
    },
    "createdAt": "2026-10-29T00:00:00.000Z",
    "updatedAt": "2026-10-29T00:00:00.000Z"
  },
  {
    "id": "course-workplace-w10",
    "courseId": "course-workplace",
    "week": 10,
    "title": "새로운 직원과 직장 관계 형성하기",
    "description": "",
    "direction": "zh-ko",
    "level": "",
    "status": "draft",
    "video": {
      "youtubeUrl": "https://youtu.be/Uq1YkuTHL3g",
      "youtubeId": "Uq1YkuTHL3g",
      "startTime": 0,
      "endTime": 0
    },
    "source": {
      "dramaTitle": "你也有今天",
      "episode": "",
      "videoTitle": "梁依然入职君恒第一天便频频向钱恒示好 成瑶疯狂吃醋"
    },
    "script": {
      "source": "srt",
      "cues": [],
      "updatedAt": null
    },
    "createdAt": "2026-10-29T00:00:00.000Z",
    "updatedAt": "2026-10-29T00:00:00.000Z"
  },
  {
    "id": "course-workplace-w11",
    "courseId": "course-workplace",
    "week": 11,
    "title": "팀 내 갈등과 의사결정 표현하기",
    "description": "",
    "direction": "zh-ko",
    "level": "",
    "status": "draft",
    "video": {
      "youtubeUrl": "https://youtu.be/bTlwzX0XYzA",
      "youtubeId": "bTlwzX0XYzA",
      "startTime": 0,
      "endTime": 0
    },
    "source": {
      "dramaTitle": "你也有今天",
      "episode": "",
      "videoTitle": "成瑶委屈退出钱恒团队 谁料这都是梁依然的恶毒计谋"
    },
    "script": {
      "source": "srt",
      "cues": [],
      "updatedAt": null
    },
    "createdAt": "2026-10-29T00:00:00.000Z",
    "updatedAt": "2026-10-29T00:00:00.000Z"
  },
  {
    "id": "course-workplace-w12",
    "courseId": "course-workplace",
    "week": 12,
    "title": "부당한 업무 요구와 직장 갈등에 대응하기",
    "description": "",
    "direction": "zh-ko",
    "level": "",
    "status": "draft",
    "video": {
      "youtubeUrl": "https://youtu.be/pKQ6gsAXdW0",
      "youtubeId": "pKQ6gsAXdW0",
      "startTime": 0,
      "endTime": 0
    },
    "source": {
      "dramaTitle": "你也有今天",
      "episode": "",
      "videoTitle": "心机女上司联合刁钻客户 趁钱恒不在联手逼成瑶辞职"
    },
    "script": {
      "source": "srt",
      "cues": [],
      "updatedAt": null
    },
    "createdAt": "2026-10-29T00:00:00.000Z",
    "updatedAt": "2026-10-29T00:00:00.000Z"
  },
  {
    "id": "course-workplace-w13",
    "courseId": "course-workplace",
    "week": 13,
    "title": "직장에서 겪은 어려움을 설명하기",
    "description": "",
    "direction": "zh-ko",
    "level": "",
    "status": "draft",
    "video": {
      "youtubeUrl": "https://youtu.be/zzj76T4sMQs",
      "youtubeId": "zzj76T4sMQs",
      "startTime": 0,
      "endTime": 0
    },
    "source": {
      "dramaTitle": "你也有今天",
      "episode": "",
      "videoTitle": "成瑶强颜欢笑装作工作顺利 钱恒看在眼里决心为老婆“复仇”"
    },
    "script": {
      "source": "srt",
      "cues": [],
      "updatedAt": null
    },
    "createdAt": "2026-10-29T00:00:00.000Z",
    "updatedAt": "2026-10-29T00:00:00.000Z"
  },
  {
    "id": "course-workplace-w14",
    "courseId": "course-workplace",
    "week": 14,
    "title": "해고 상황을 설명하고 문제에 대응하기",
    "description": "",
    "direction": "zh-ko",
    "level": "",
    "status": "draft",
    "video": {
      "youtubeUrl": "https://youtu.be/-7iyU8ZRDaU",
      "youtubeId": "-7iyU8ZRDaU",
      "startTime": 0,
      "endTime": 0
    },
    "source": {
      "dramaTitle": "你也有今天",
      "episode": "",
      "videoTitle": "钱恒出差归来发现成瑶被辞退 正面硬刚梁依然为老婆讨回公道"
    },
    "script": {
      "source": "srt",
      "cues": [],
      "updatedAt": null
    },
    "createdAt": "2026-10-29T00:00:00.000Z",
    "updatedAt": "2026-10-29T00:00:00.000Z"
  },
  {
    "id": "course-workplace-w15",
    "courseId": "course-workplace",
    "week": 15,
    "title": "새로운 직장에 입사하고 적응하기",
    "description": "",
    "direction": "zh-ko",
    "level": "",
    "status": "draft",
    "video": {
      "youtubeUrl": "https://youtu.be/UmuqP7R7KS0",
      "youtubeId": "UmuqP7R7KS0",
      "startTime": 0,
      "endTime": 0
    },
    "source": {
      "dramaTitle": "你也有今天",
      "episode": "",
      "videoTitle": "成瑶入职新律所顾北青发出约会示好，钱恒危机感大爆发！"
    },
    "script": {
      "source": "srt",
      "cues": [],
      "updatedAt": null
    },
    "createdAt": "2026-10-29T00:00:00.000Z",
    "updatedAt": "2026-10-29T00:00:00.000Z"
  }
];
