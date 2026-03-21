/**
 * Gravito Eval
 *
 * Measure how closely AI decisions match human judgment —
 * and where they add new signal.
 *
 * @example
 * ```ts
 * import { evaluate } from "gravito-eval";
 *
 * const result = evaluate(aiFindings, humanFindings);
 * console.log(`Recall: ${(result.detection.recall * 100).toFixed(1)}%`);
 * console.log(`Precision: ${(result.detection.precision * 100).toFixed(1)}%`);
 * console.log(`F1: ${(result.detection.f1 * 100).toFixed(1)}%`);
 * ```
 */

// Main entry point
export { evaluate } from "./calibration";
export type { EvalOptions } from "./calibration";

// Matching
export { multiPassMatch, toFlatMatchResult, keywordSimilarity } from "./matching";
export type { MultiPassOptions } from "./matching";

// Metrics
export {
  computeDetectionMetrics,
  computeRankingMetrics,
  computeSeverityMetrics,
  wilsonInterval,
} from "./metrics";

// Adjudication
export {
  computeNovelSignal,
  computeAdjustedPrecision,
  autoAdjudicate,
  batchAutoAdjudicate,
} from "./adjudication";

// Confidence
export { scoreConfidence, scoreFindings } from "./confidence";

// Types
export type {
  Finding,
  MatchPair,
  MatchResult,
  MultiPassMatchResult,
  Adjudication,
  AdjudicationLabel,
  DetectionMetrics,
  RankingMetrics,
  SeverityMetrics,
  NovelSignalMetrics,
  ConfidenceInterval,
  EvalResult,
  ScoredFinding,
  ConfidenceFactors,
  IssueCategory,
  SeverityLevel,
} from "./types";
