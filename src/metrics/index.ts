/**
 * Gravito Eval — Metrics Engine
 *
 * Computes detection, ranking, and severity agreement metrics
 * from matched AI vs human findings.
 */

import type {
  Finding,
  MatchResult,
  MultiPassMatchResult,
  DetectionMetrics,
  RankingMetrics,
  SeverityMetrics,
  SeverityLevel,
  ConfidenceInterval,
} from "../types";
import { toFlatMatchResult } from "../matching";

// ─── Detection Metrics ────────────────────────────────────────────────────

export function computeDetectionMetrics(
  matchResult: MatchResult | MultiPassMatchResult,
  totalAI: number,
  totalHuman: number
): DetectionMetrics {
  const flat = "matched" in matchResult ? matchResult : toFlatMatchResult(matchResult);
  const matchedCount = flat.matched.length;

  const recall = totalHuman > 0 ? matchedCount / totalHuman : 0;
  const precision = totalAI > 0 ? matchedCount / totalAI : 0;
  const f1 = recall + precision > 0 ? (2 * recall * precision) / (recall + precision) : 0;

  return { recall, precision, f1, matchedCount, totalAI, totalHuman };
}

// ─── Ranking Metrics ──────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<SeverityLevel, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function sortBySeverity(findings: Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity]
  );
}

export function computeRankingMetrics(
  aiFindings: Finding[],
  humanFindings: Finding[],
  matchResult: MatchResult | MultiPassMatchResult
): RankingMetrics {
  const flat = "matched" in matchResult ? matchResult : toFlatMatchResult(matchResult);

  const sortedAI = sortBySeverity(aiFindings);
  const sortedHuman = sortBySeverity(humanFindings);

  const humanTop3Ids = new Set(sortedHuman.slice(0, 3).map((f) => f.id));
  const humanTop5Ids = new Set(sortedHuman.slice(0, 5).map((f) => f.id));

  // Build mapping: AI finding ID → matched human finding ID
  const aiToHuman = new Map<string, string>();
  for (const pair of flat.matched) {
    aiToHuman.set(pair.aiIssue.id, pair.humanIssue.id);
  }

  // Top-3 overlap: how many of AI's top 3 match human's top 3
  const aiTop3 = sortedAI.slice(0, 3);
  let top3Overlap = 0;
  for (const ai of aiTop3) {
    const matchedHumanId = aiToHuman.get(ai.id);
    if (matchedHumanId && humanTop3Ids.has(matchedHumanId)) {
      top3Overlap++;
    }
  }

  // Top-5 overlap
  const aiTop5 = sortedAI.slice(0, 5);
  let top5Overlap = 0;
  for (const ai of aiTop5) {
    const matchedHumanId = aiToHuman.get(ai.id);
    if (matchedHumanId && humanTop5Ids.has(matchedHumanId)) {
      top5Overlap++;
    }
  }

  const top3Rate = Math.min(sortedHuman.length, 3) > 0
    ? top3Overlap / Math.min(sortedHuman.length, 3)
    : 0;
  const top5Rate = Math.min(sortedHuman.length, 5) > 0
    ? top5Overlap / Math.min(sortedHuman.length, 5)
    : 0;

  // Spearman correlation on matched pairs
  const spearman = computeSpearmanOnMatched(sortedAI, sortedHuman, flat.matched);

  return {
    top3Overlap: top3Rate,
    top5Overlap: top5Rate,
    spearmanCorrelation: spearman,
  };
}

function computeSpearmanOnMatched(
  sortedAI: Finding[],
  sortedHuman: Finding[],
  matched: { aiIssue: Finding; humanIssue: Finding }[]
): number {
  if (matched.length < 2) return 0;

  const aiRank = new Map<string, number>();
  const humanRank = new Map<string, number>();

  sortedAI.forEach((f, i) => aiRank.set(f.id, i + 1));
  sortedHuman.forEach((f, i) => humanRank.set(f.id, i + 1));

  let sumD2 = 0;
  let n = 0;
  for (const pair of matched) {
    const rAi = aiRank.get(pair.aiIssue.id);
    const rHuman = humanRank.get(pair.humanIssue.id);
    if (rAi !== undefined && rHuman !== undefined) {
      const d = rAi - rHuman;
      sumD2 += d * d;
      n++;
    }
  }

  if (n < 2) return 0;
  return 1 - (6 * sumD2) / (n * (n * n - 1));
}

// ─── Severity Agreement ───────────────────────────────────────────────────

export function computeSeverityMetrics(
  matchResult: MatchResult | MultiPassMatchResult
): SeverityMetrics {
  const flat = "matched" in matchResult ? matchResult : toFlatMatchResult(matchResult);
  const levels: SeverityLevel[] = ["low", "medium", "high", "critical"];

  // Build confusion matrix
  const matrix: Record<string, Record<string, number>> = {};
  for (const l of levels) {
    matrix[l] = {};
    for (const l2 of levels) {
      matrix[l][l2] = 0;
    }
  }

  let totalAbsError = 0;
  for (const pair of flat.matched) {
    matrix[pair.aiIssue.severity][pair.humanIssue.severity]++;
    totalAbsError += Math.abs(
      SEVERITY_ORDER[pair.aiIssue.severity] - SEVERITY_ORDER[pair.humanIssue.severity]
    );
  }

  const n = flat.matched.length;
  const mae = n > 0 ? totalAbsError / n : 0;

  // Weighted Cohen's Kappa
  const kappa = computeWeightedKappa(flat.matched, levels);

  return {
    weightedKappa: kappa,
    meanAbsoluteError: mae,
    confusionMatrix: matrix,
  };
}

function computeWeightedKappa(
  matched: { aiIssue: Finding; humanIssue: Finding }[],
  levels: SeverityLevel[]
): number {
  const n = matched.length;
  if (n === 0) return 0;

  const k = levels.length;
  const observed: number[][] = Array.from({ length: k }, () => Array(k).fill(0));
  const weights: number[][] = Array.from({ length: k }, (_, i) =>
    Array.from({ length: k }, (_, j) => {
      const maxDist = k - 1;
      return maxDist > 0 ? Math.pow(Math.abs(i - j) / maxDist, 2) : 0;
    })
  );

  const levelIdx = new Map(levels.map((l, i) => [l, i]));

  for (const pair of matched) {
    const ai = levelIdx.get(pair.aiIssue.severity) ?? 0;
    const hu = levelIdx.get(pair.humanIssue.severity) ?? 0;
    observed[ai][hu]++;
  }

  // Marginals
  const rowSums = observed.map((row) => row.reduce((a, b) => a + b, 0));
  const colSums = Array(k).fill(0);
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      colSums[j] += observed[i][j];
    }
  }

  let po = 0;
  let pe = 0;
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      po += weights[i][j] * (observed[i][j] / n);
      pe += weights[i][j] * ((rowSums[i] / n) * (colSums[j] / n));
    }
  }

  return pe === 0 ? 1 : 1 - po / pe;
}

// ─── Confidence Intervals ─────────────────────────────────────────────────

/**
 * Wilson score confidence interval for proportions.
 */
export function wilsonInterval(
  successes: number,
  total: number,
  z: number = 1.96
): ConfidenceInterval {
  if (total === 0) return { mean: 0, lowerBound: 0, upperBound: 0 };

  const p = successes / total;
  const z2 = z * z;
  const denominator = 1 + z2 / total;
  const center = p + z2 / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total);

  return {
    mean: p,
    lowerBound: Math.max(0, (center - margin) / denominator),
    upperBound: Math.min(1, (center + margin) / denominator),
  };
}
