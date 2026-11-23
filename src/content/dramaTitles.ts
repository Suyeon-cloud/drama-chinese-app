/**
 * 중국 드라마 원제(강의의 drama 값, 강의자료의 원본 드라마 제목) → 한국어 표시명. 화면 표시용이며 DB에는 저장하지 않는다.
 * 확인된 표시명만 넣는다. 확인되지 않은 제목은 임의로 번역해 넣지 않는다.
 */
export const DRAMA_KO_TITLES: Readonly<Record<string, string>> = {
  偷偷藏不住: "너를 좋아해: 투투장부주",
  当我飞奔向你: "당아비분향니",
  机智的上半场: "기지적상반장",
  你也有今天: "니야유금천",
  以家人之名: "이가인지명",
};

const has = (key: string) => Object.prototype.hasOwnProperty.call(DRAMA_KO_TITLES, key);

/** 앞뒤 공백과 제목 괄호(《》「」 등)를 뺀다. */
const clean = (s: string) => s.normalize("NFKC").replace(/[《》〈〉「」『』“”"]/g, "").trim();

/** 제목 뒤에 붙는 부가 문구의 시작: 공백·괄호·콜론·가운뎃점·대시·구분선 */
const SUFFIX_START = /[\s(（[【:：·・|/,，\-–—]/;

/**
 * 등록된 한국어 표시명. 없으면 undefined.
 * 1) 제목 전체가 등록된 원제와 같을 때, 2) 원제 바로 뒤에 구분 기호로 시작하는 부가 문구가 붙었을 때만 찾는다.
 * 부분 문자열로는 찾지 않는다. (예: "偷偷藏不住之许你"는 "偷偷藏不住"로 보지 않는다)
 */
export const dramaKoTitle = (drama: string | null | undefined): string | undefined => {
  if (!drama) return undefined;
  const title = clean(drama);
  if (has(title)) return DRAMA_KO_TITLES[title];
  const cut = title.search(SUFFIX_START);
  if (cut <= 0) return undefined;
  const head = title.slice(0, cut).trim();
  return has(head) ? DRAMA_KO_TITLES[head] : undefined;
};
