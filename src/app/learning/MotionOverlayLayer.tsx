import { Player, type PlayerRef } from "@remotion/player";
import React, { useEffect, useRef } from "react";
import type { MotionCue } from "../../content/types";
import { MOTION_REGISTRY } from "../../motion/registry";
import { FPS, OVERLAY_WIDTH } from "../../motion/theme";

const DRIFT_FRAMES = 8;

/**
 * Remotion Player로 학습 모션그래픽을 렌더링하고, YouTube 재생 시간에 맞춰 동기화한다.
 * - 영상이 재생 중이면 Player도 재생하고, 오차가 커지면 다시 맞춘다.
 * - 영상이 멈추면 Player도 같은 프레임에서 멈춘다.
 */
const OverlayPlayer: React.FC<{ cue: MotionCue; time: number; playing: boolean }> = ({
  cue,
  time,
  playing,
}) => {
  const ref = useRef<PlayerRef>(null);
  const entry = MOTION_REGISTRY[cue.motionType];
  const total = Math.max(1, Math.round(cue.duration * FPS));
  const ratio = cue.widthRatio ?? entry.widthRatio;

  useEffect(() => {
    const p = ref.current;
    if (!p) return;
    const target = Math.min(total - 1, Math.max(0, Math.round((time - cue.time) * FPS)));
    if (playing) {
      if (!p.isPlaying()) {
        p.seekTo(target);
        p.play();
      } else if (Math.abs(p.getCurrentFrame() - target) > DRIFT_FRAMES) {
        p.seekTo(target);
      }
    } else {
      if (p.isPlaying()) p.pause();
      if (Math.abs(p.getCurrentFrame() - target) > 1) p.seekTo(target);
    }
  }, [time, playing, cue.time, total]);

  return (
    <div
      className={`overlay-slot ${cue.position}`}
      style={{ "--ratio": ratio, "--wh": OVERLAY_WIDTH / entry.height } as React.CSSProperties}
    >
      <Player
        ref={ref}
        component={entry.component as unknown as React.ComponentType<Record<string, unknown>>}
        inputProps={cue.props as unknown as Record<string, unknown>}
        durationInFrames={total}
        compositionWidth={OVERLAY_WIDTH}
        compositionHeight={entry.height}
        fps={FPS}
        controls={false}
        clickToPlay={false}
        doubleClickToFullscreen={false}
        spaceKeyToPlayOrPause={false}
        acknowledgeRemotionLicense
        style={{ width: "100%" }}
      />
    </div>
  );
};

export const MotionOverlayLayer: React.FC<{
  cues: MotionCue[];
  time: number;
  playing: boolean;
}> = ({ cues, time, playing }) => {
  const active = cues.find((c) => time >= c.time && time < c.time + c.duration);
  if (!active) return null;
  return <OverlayPlayer key={active.id} cue={active} time={time} playing={playing} />;
};
