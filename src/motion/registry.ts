import type React from "react";
import { ComparisonOverlay, type ComparisonOverlayProps } from "./overlays/ComparisonOverlay";
import { ExpressionOverlay, type ExpressionOverlayProps } from "./overlays/ExpressionOverlay";
import { FocusOverlay, type FocusOverlayProps } from "./overlays/FocusOverlay";
import { GrammarOverlay, type GrammarOverlayProps } from "./overlays/GrammarOverlay";
import { MetaphorOverlay, type MetaphorOverlayProps } from "./overlays/MetaphorOverlay";
import { NoteOverlay, type NoteOverlayProps } from "./overlays/NoteOverlay";
import { SplitOverlay, type SplitOverlayProps } from "./overlays/SplitOverlay";

/** motion type → props. 콘텐츠 데이터는 이 타입에 맞춰 props만 작성하면 된다. */
export type MotionPropsMap = {
  grammar: GrammarOverlayProps;
  focus: FocusOverlayProps;
  metaphor: MetaphorOverlayProps;
  expression: ExpressionOverlayProps;
  split: SplitOverlayProps;
  comparison: ComparisonOverlayProps;
  /** 교수자 초안(핵심 표현·어휘·문법) */
  note: NoteOverlayProps;
};

export type MotionType = keyof MotionPropsMap;

type RegistryEntry<K extends MotionType> = {
  component: React.FC<MotionPropsMap[K]>;
  /** composition height (width is always OVERLAY_WIDTH) */
  height: number;
  /** overlay width relative to the video width */
  widthRatio: number;
};

export const MOTION_REGISTRY: { [K in MotionType]: RegistryEntry<K> } = {
  grammar: { component: GrammarOverlay, height: 470, widthRatio: 0.3 },
  focus: { component: FocusOverlay, height: 520, widthRatio: 0.28 },
  metaphor: { component: MetaphorOverlay, height: 400, widthRatio: 0.3 },
  expression: { component: ExpressionOverlay, height: 470, widthRatio: 0.3 },
  split: { component: SplitOverlay, height: 470, widthRatio: 0.36 },
  comparison: { component: ComparisonOverlay, height: 500, widthRatio: 0.36 },
  note: { component: NoteOverlay, height: 420, widthRatio: 0.3 },
};
