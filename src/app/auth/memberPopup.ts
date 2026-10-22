// 관리자 ‘회원 현황’ 팝업을 어디서든 열 수 있게 하는 작은 신호.
import { useEffect, useState } from "react";

const listeners = new Set<(open: boolean) => void>();

export const openMemberPopup = () => listeners.forEach((l) => l(true));
export const closeMemberPopup = () => listeners.forEach((l) => l(false));

export const useMemberPopupOpen = () => {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    listeners.add(setOpen);
    return () => {
      listeners.delete(setOpen);
    };
  }, []);
  return open;
};
