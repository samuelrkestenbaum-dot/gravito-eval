/**
 * Gravito Eval — Calibration Engine
 *
 * The main entry point for evaluating AI system alignment with human judgment.
 * Combines matching, metrics, adjudication, and confidence scoring into
 * a single, easy-to-use evaluation pipeline.
 */

import type {
  Finding,
  Adjudication,
  EvalResult,
  MultiPassMatchResult,
} from "../types";
import { multiPassMatch, type MultiPassOptions } from "../matching";
import {
  computeDetectionMetrics,
  computeRankingMetrics,
  computeSeverityMetrics,
} from "../metrics";
import {
  computeNovelSignal,
  computeAdjustedPrecision,
  batchAutoAdjudicate,
} from "../adjudication";

// ─── Main Evaluation ──────────────────────────────────────────────────────

export interface EvalOptions {
  /** Custom matching thresholds */
  matching?: MultiPassOptions;
  /** Human adjudications for AI-only findings (if available) */
  adjudications?: Adjudication[];
  /** Auto-adjudicate AI-only findings when no human adjudications provided */
  autoAdjudicate?: boolean;
}

/**
 * Run a full evaluation of AI findings against human findings.
 *
 * This is the primary entry point for gravito-eval.
 *
 * @example
 * ```ts
 * import { evaluate } from "gravito-eval";
 *
 * const result = evaluate(aiFindings, humanFindings);
 * console.log(`Recall: ${(result.detection.recall * 100).toFixed(1)}%`);
 * console.log(`Precision: ${(result.detection.precision * 100).toFixed(1)}%`);
 * ```
 */
export function evaluate(
  aiFindings: Finding[],
  humanFindings: Finding[],
  options?: EvalOptions
): EvalResult {
  // Step 1: Multi-pass matching
  const matchResult = multiPassMatch(aiFindings, humanFindings, options?.matching);

  // Step 2: Detection metrics
  const detection = computeDetectionMetrics(
    matchResult,
    aiFindings.length,
    humanFindings.length
  );

  // Step 3: Ranking metrics
  const ranking = computeRankingMetrics(aiFindings, humanFindings, matchResult);

  // Step 4: Severity agreement
  const severity = computeSeverityMetrics(matchResult);

  // Step 5: Novel signal (optional)
  let novelSignal = undefined;
  let adjustedPrecision = undefined;

  if (matchResult.aiOnly.length > 0) {
    const adjudications =
      options?.adjudications ??
      (options?.autoAdjudicate !== false ? batchAutoAdjudicate(matchResult.aiOnly) : []);

    if (adjudications.length > 0) {
      novelSignal = computeNovelSignal(matchResult.aiOnly, adjudications);
      adjustedPrecision = computeAdjustedPrecision(
        detection.matchedCount,
        novelSignal.validCount,
        detection.totalAI
      );
    }
  }

  // Step 6: Verdict
  const verdict = determineVerdict(detection, matchResult);

  // Flatten all match pairs
  const allMatches = [
    ...matchResult.strictMatches,
    ...matchResult.crossCategoryMatches,
    ...matchResult.conceptualMatches,
  ];

  return {
    detection,
    ranking,
    severity,
    novelSignal,
    matchBreakdown: {
      strict: matchResult.summary.strict_matched,
      crossCategory: matchResult.summary.cross_category_matched,
      conceptual: matchResult.summary.conceptual_matched,
    },
    matches: allMatches,
    aiOnly: matchResult.aiOnly,
    humanOnly: matchResult.humanOnly,
    adjustedPrecision,
    verdict,
  };
}

// ─── Verdict Logic ────────────────────────────────────────────────────────

function determineVerdict(
  detection: { recall: number; precision: number; totalAI: number; totalHuman: number },
  matchResult: MultiPassMatchResult
): EvalResult["verdict"] {
  if (detection.totalAI < 3 || detection.totalHuman < 3) {
    return "INSUFFICIENT_DATA";
  }

  if (detection.recall >= 0.60 && detection.precision >= 0.50) {
    return "PASS";
  }

  if (detection.recall >= 0.40 || detection.precision >= 0.35) {
    return "PARTIAL";
  }

  return "FAIL";
}

// ─── Re-exports ───────────────────────────────────────────────────────────

export { multiPassMatch, toFlatMatchResult } from "../matching";
export type { MultiPassOptions } from "../matching";
export {
  computeDetectionMetrics,
  computeRankingMetrics,
  computeSeverityMetrics,
  wilsonInterval,
} from "../metrics";
export {
  computeNovelSignal,
  computeAdjustedPrecision,
  autoAdjudicate,
  batchAutoAdjudicate,
} from "../adjudication";
export { scoreConfidence, scoreFindings } from "../confidence";
