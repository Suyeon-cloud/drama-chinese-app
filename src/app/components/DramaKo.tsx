import React from "react";
import { dramaKoTitle } from "../../content/dramaTitles";

/** 중국 드라마 제목 옆에 붙이는 한국어 제목. 등록된 제목이 없으면 아무것도 그리지 않는다. */
export const DramaKo: React.FC<{ drama?: string | null }> = ({ drama }) => {
  const ko = dramaKoTitle(drama);
  return ko ? (
    <span className="drama-ko" lang="ko">
      {ko}
    </span>
  ) : null;
};
