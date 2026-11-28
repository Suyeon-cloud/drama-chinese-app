// QR 코드 이미지 (qrcode 패키지, MIT). 브라우저에서 바로 만들고 외부 서버로 주소를 보내지 않는다.
// 큰 라이브러리는 필요할 때만 불러온다 (교수자 진행 화면).
import React, { useEffect, useState } from "react";

export const QrCode: React.FC<{ value: string; size?: number; label: string }> = ({ value, size = 200, label }) => {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    setSrc(null);
    setFailed(false);
    import("qrcode")
      .then((m) => m.toDataURL(value, { margin: 1, width: size * 2, errorCorrectionLevel: "M", color: { dark: "#1f3550", light: "#ffffff" } }))
      .then((url) => alive && setSrc(url))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [value, size]);
  if (failed) return <p className="muted small">QR 코드를 만들지 못했어요. 참여 코드를 입력해 주세요.</p>;
  return (
    <span className="qr-code" style={{ width: size, height: size }}>
      {src ? (
        // eslint-disable-next-line @remotion/warn-native-media-tag -- web app UI, not rendered by Remotion
        <img src={src} width={size} height={size} alt={label} />
      ) : (
        <span className="muted small">QR 만드는 중…</span>
      )}
    </span>
  );
};
