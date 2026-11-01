// 과목의 대표 일러스트와 학습 맥락 (화면 표시용. 과목 데이터는 src/content/courses.ts)
// 새 과목은 여기에 없어도 된다. 이미지가 없거나 불러오지 못하면 기본 그림을 보여준다.
import React, { useState } from "react";
import { Icon } from "../components/Icon";

export type CourseVisual = { stage: string; image: string; alt: string };

export const COURSE_VISUALS: Record<string, CourseVisual | undefined> = {
  "course-campus": {
    stage: "高中校园",
    image: "/images/courses/campus.webp",
    alt: "고등학교 교정에서 교복을 입은 학생들이 웃으며 이야기하는 일러스트",
  },
  "course-university": {
    stage: "大学校园",
    image: "/images/courses/university.webp",
    alt: "대학 기숙사 방에서 룸메이트들이 함께 이야기하는 일러스트",
  },
  "course-workplace": {
    stage: "职场社会",
    image: "/images/courses/workplace.webp",
    alt: "현대적인 사무실에서 직장인 두 사람이 대화하는 일러스트",
  },
};

/** 과목 대표 이미지. decorative: 옆에 같은 내용의 글이 있어 설명을 읽어 주지 않아도 될 때 */
export const CourseImage: React.FC<{ courseId: string; drama: string; decorative?: boolean }> = ({
  courseId,
  drama,
  decorative,
}) => {
  const visual = COURSE_VISUALS[courseId];
  const [failed, setFailed] = useState(false);
  if (!visual || failed) {
    return (
      <span className="course-fallback" role={decorative ? undefined : "img"} aria-hidden={decorative || undefined} aria-label={decorative ? undefined : `《${drama}》 대표 이미지`}>
        <Icon name="clapper" size={36} />
        <b>《{drama}》</b>
      </span>
    );
  }
  return (
    <img src={visual.image} alt={decorative ? "" : visual.alt} loading="lazy" onError={() => setFailed(true)} />
  );
};
