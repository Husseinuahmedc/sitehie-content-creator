export type ThemeFamily = "dark" | "light" | "cyberpunk";

export type FontFace = {
  family: string;
  path: string;
  weight?: number | string;
  format?: string;
  style?: string;
};

export type TypographyStyle = {
  fontFamily?: string;
  fontSize?: number;
  fontSizeMax?: number;
  fontSizeMin?: number;
  lineHeight?: number;
  fontWeight?: number | string;
  letterSpacing?: number | string;
  textTransform?: string;
};

export type PositionBox = {
  top?: string;
  right?: string;
  bottom?: string;
  left?: string;
  width?: string;
  height?: string;
  center?: boolean;
  centerX?: boolean;
  centerY?: boolean;
};

export type QuoteLayout = {
  textAlign?: string;
  textPosition?: PositionBox;
  highlightMarkerStyle?: string;
  highlightUnderlineThickness?: number;
  highlightUnderlineOffset?: number;
  direction?: string;
  safePadding?: string;
  paragraphSpacing?: number | string;
};

export type CodeLayout = {
  slideNumberPosition?: PositionBox;
  titlePosition?: PositionBox;
  subtitlePosition?: PositionBox;
  codeBlockPosition?: PositionBox;
  explanationPosition?: PositionBox;
  progressBarPosition?: PositionBox;
  footerPosition?: PositionBox;
  codeBlockBorderRadius?: number;
  codeBlockPadding?: string;
  progressBarHeight?: number;
  progressBarWidth?: string;
  slideNumberBorderRadius?: number;
  slideNumberPadding?: string;
  explanationAlign?: string;
  explanationDirection?: string;
  annotationGap?: number;
};

export type CoverLayout = {
  iconSize?: string;
  iconPosition?: PositionBox;
  titlePosition?: PositionBox;
  seriesPosition?: PositionBox;
  hintPosition?: PositionBox;
  badgesPosition?: PositionBox;
  watermarkPosition?: PositionBox;
  iconFrameWidth?: number;
  iconFrameRadius?: number;
  iconFramePadding?: string;
  logoWidth?: string;
  logoHeight?: string;
  logoMaxHeight?: string;
  titleAlign?: string;
  titleDirection?: string;
};

export type OutroLayout = {
  imagePosition?: PositionBox;
  questionPosition?: PositionBox;
  brandPosition?: PositionBox;
  badgesPosition?: PositionBox;
  questionAlign?: string;
  questionDirection?: string;
  brandGap?: number | string;
  ctaRadius?: number;
  ctaPadding?: string;
  ctaShadow?: string;
};

export type ComparisonLayout = {
  slideNumberPosition?: PositionBox;
  titlePosition?: PositionBox;
  panelsPosition?: PositionBox;
  verdictPosition?: PositionBox;
  badgesPosition?: PositionBox;
  gap?: number | string;
  panelRadius?: number;
  panelPadding?: string;
  titleAlign?: string;
  titleDirection?: string;
};

export type StatLayout = {
  slideNumberPosition?: PositionBox;
  valuePosition?: PositionBox;
  labelPosition?: PositionBox;
  subtextPosition?: PositionBox;
  badgesPosition?: PositionBox;
  align?: string;
  direction?: string;
};

export type Layout = {
  quoteSlide?: QuoteLayout;
  codeSlide?: CodeLayout;
  coverSlide?: CoverLayout;
  outroSlide?: OutroLayout;
  comparisonSlide?: ComparisonLayout;
  statSlide?: StatLayout;
};

export type Theme = {
  name: string;
  description?: string;
  /** Theme family stamped onto #slide[data-theme]. Default dark. */
  family?: ThemeFamily;
  colors: Record<string, string>;
  fonts: Record<string, FontFace>;
  typography: Record<string, TypographyStyle>;
  layout: Layout;
  effects?: Record<string, unknown>;
  brand?: { handle?: string; readingTimeSuffix?: string };
  /** Optional palette of allowed hex colors for verification. */
  allowedColors?: string[];
};
