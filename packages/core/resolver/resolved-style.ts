import type { Theme } from "../domain/theme.js";

/**
 * ResolvedStyle is a fully materialized theme-like object for a single slide.
 * It mirrors the {@link Theme} shape: theme defaults have been deep-merged with
 * the slide's `styleOverrides`, and the slide's legacy flat `fontSizes` have
 * been folded in as the highest-precedence typography override.
 *
 * Consumers should read style values from this object directly instead of
 * computing their own fallbacks.
 */
export type ResolvedStyle = Theme;
