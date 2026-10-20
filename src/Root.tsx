import "./index.css";
import { Composition, Folder } from "remotion";
import { HelloWorld } from "./HelloWorld";
import { Logo } from "./HelloWorld/Logo";
import { Title } from "./HelloWorld/Title";
import { featuredEpisode, heroChips } from "./content";
import type { MotionCue } from "./content/types";
import { HeroMotion } from "./motion/HeroMotion";
import { ComparisonOverlay } from "./motion/overlays/ComparisonOverlay";
import { ExpressionOverlay } from "./motion/overlays/ExpressionOverlay";
import { FocusOverlay } from "./motion/overlays/FocusOverlay";
import { GrammarOverlay } from "./motion/overlays/GrammarOverlay";
import { MetaphorOverlay } from "./motion/overlays/MetaphorOverlay";
import { SplitOverlay } from "./motion/overlays/SplitOverlay";
import { MOTION_REGISTRY, type MotionPropsMap, type MotionType } from "./motion/registry";
import { FPS, OVERLAY_WIDTH } from "./motion/theme";

// 《追剧学汉语》 learning overlays reuse the same content data as the web app.
const cueProps = <K extends MotionType>(type: K): MotionPropsMap[K] => {
  const cue = featuredEpisode.cues.find(
    (c): c is Extract<MotionCue, { motionType: K }> =>
      c.kind === "motion" && c.motionType === type,
  );
  if (!cue) throw new Error(`No cue for motion type ${type}`);
  return cue.props as MotionPropsMap[K];
};

// Each <Composition> is an entry in the sidebar!

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Folder name="Elements">
        <Composition
          id="Logo"
          component={Logo}
          durationInFrames={150}
          fps={30}
          width={1920}
          height={1080}
          defaultProps={{
            logoColor1: "#91EAE4",
            logoColor2: "#86A8E7",
          }}
        />
        <Composition
          id="Title"
          component={Title}
          durationInFrames={115}
          fps={30}
          width={1920}
          height={1080}
          defaultProps={{
            titleText: "Welcome to Remotion",
            titleColor: "#000000",
          }}
        />
      </Folder>
      <Folder name="ZhuiJuXueHanyu">
        <Composition
          id="HeroMotion"
          component={HeroMotion}
          durationInFrames={240}
          fps={30}
          width={600}
          height={420}
          defaultProps={{ chips: heroChips }}
        />
        <Composition
          id="GrammarOverlay"
          component={GrammarOverlay}
          durationInFrames={14 * FPS}
          fps={FPS}
          width={OVERLAY_WIDTH}
          height={MOTION_REGISTRY.grammar.height}
          defaultProps={cueProps("grammar")}
        />
        <Composition
          id="FocusOverlay"
          component={FocusOverlay}
          durationInFrames={6 * FPS}
          fps={FPS}
          width={OVERLAY_WIDTH}
          height={MOTION_REGISTRY.focus.height}
          defaultProps={cueProps("focus")}
        />
        <Composition
          id="MetaphorOverlay"
          component={MetaphorOverlay}
          durationInFrames={7 * FPS}
          fps={FPS}
          width={OVERLAY_WIDTH}
          height={MOTION_REGISTRY.metaphor.height}
          defaultProps={cueProps("metaphor")}
        />
        <Composition
          id="ExpressionOverlay"
          component={ExpressionOverlay}
          durationInFrames={6 * FPS}
          fps={FPS}
          width={OVERLAY_WIDTH}
          height={MOTION_REGISTRY.expression.height}
          defaultProps={cueProps("expression")}
        />
        <Composition
          id="SplitOverlay"
          component={SplitOverlay}
          durationInFrames={8 * FPS}
          fps={FPS}
          width={OVERLAY_WIDTH}
          height={MOTION_REGISTRY.split.height}
          defaultProps={cueProps("split")}
        />
        <Composition
          id="ComparisonOverlay"
          component={ComparisonOverlay}
          durationInFrames={9 * FPS}
          fps={FPS}
          width={OVERLAY_WIDTH}
          height={MOTION_REGISTRY.comparison.height}
          defaultProps={cueProps("comparison")}
        />
      </Folder>
      <Composition
        // You can take the "id" to render a video:
        // bunx remotion render HelloWorld
        id="HelloWorld"
        component={HelloWorld}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
        // You can override these props for each render:
        // https://www.remotion.dev/docs/parametrized-rendering
        defaultProps={{
          titleText: "Welcome to Remotion",
          titleColor: "#000000",
        }}
      />

    </>
  );
};
