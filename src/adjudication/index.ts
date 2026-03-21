/**
 * Gravito Eval — Adjudication Engine
 *
 * Evaluates AI-only findings (those not matched to any human finding)
 * to determine whether they represent genuine novel signal or noise.
 *
 * Adjudications can be provided by human reviewers or auto-generated
 * using simple heuristics.
 */

import type {
  Finding,
  Adjudication,
  AdjudicationLabel,
  NovelSignalMetrics,
} from "../types";

// ─── Auto-Adjudication Heuristics ─────────────────────────────────────────

/**
 * Simple heuristic-based auto-adjudication for AI-only findings.
 * This provides a baseline — human adjudication is always preferred.
 */
export function autoAdjudicate(finding: Finding): Adjudication {
  const desc = finding.description.toLowerCase();

  // Short, vague descriptions → LOW_VALUE
  if (desc.length < 30) {
    return {
      findingId: finding.id,
      label: "LOW_VALUE",
      reasoning: "Description too brief to be actionable",
    };
  }

  // Generic/boilerplate patterns → LOW_VALUE
  const genericPatterns = [
    "could be improved",
    "might benefit from",
    "consider adding",
    "may want to",
    "general improvement",
  ];
  if (genericPatterns.some((p) => desc.includes(p))) {
    return {
      findingId: finding.id,
      label: "LOW_VALUE",
      reasoning: "Generic improvement suggestion without specific evidence",
    };
  }

  // High severity with specific evidence → VALID
  if (
    (finding.severity === "high" || finding.severity === "critical") &&
    desc.length > 80
  ) {
    return {
      findingId: finding.id,
      label: "VALID",
      reasoning: "High severity with detailed description suggests genuine issue",
    };
  }

  // Medium severity with reasonable detail → VALID
  if (finding.severity === "medium" && desc.length > 60) {
    return {
      findingId: finding.id,
      label: "VALID",
      reasoning: "Medium severity with sufficient detail",
    };
  }

  // Default: LOW_VALUE for low severity or insufficient detail
  return {
    findingId: finding.id,
    label: "LOW_VALUE",
    reasoning: "Insufficient severity or detail for confident validation",
  };
}

/**
 * Batch auto-adjudicate a list of AI-only findings.
 */
export function batchAutoAdjudicate(findings: Finding[]): Adjudication[] {
  return findings.map(autoAdjudicate);
}

// ─── Novel Signal Computation ─────────────────────────────────────────────

/**
 * Compute novel signal metrics from adjudicated AI-only findings.
 *
 * System strength interpretation:
 * - WEAK: <15% valid → mostly noise
 * - MODERATE: 15-25% valid → some signal
 * - STRONG: 25-40% valid → meaningful additional value
 * - DIFFERENTIATED: >40% valid → system finds things humans miss
 */
export function computeNovelSignal(
  aiOnlyFindings: Finding[],
  adjudications: Adjudication[]
): NovelSignalMetrics {
  const adjMap = new Map<string, AdjudicationLabel>();
  for (const adj of adjudications) {
    adjMap.set(adj.findingId, adj.label);
  }

  let validCount = 0;
  let invalidCount = 0;
  let duplicateCount = 0;
  let lowValueCount = 0;

  for (const finding of aiOnlyFindings) {
    const label = adjMap.get(finding.id);
    if (!label) continue;

    switch (label) {
      case "VALID":
        validCount++;
        break;
      case "INVALID":
        invalidCount++;
        break;
      case "DUPLICATE":
        duplicateCount++;
        break;
      case "LOW_VALUE":
        lowValueCount++;
        break;
    }
  }

  const totalAdjudicated = validCount + invalidCount + duplicateCount + lowValueCount;
  const validatedNovelRate = totalAdjudicated > 0 ? validCount / totalAdjudicated : 0;

  let systemStrength: NovelSignalMetrics["systemStrength"];
  if (validatedNovelRate >= 0.40) {
    systemStrength = "DIFFERENTIATED";
  } else if (validatedNovelRate >= 0.25) {
    systemStrength = "STRONG";
  } else if (validatedNovelRate >= 0.15) {
    systemStrength = "MODERATE";
  } else {
    systemStrength = "WEAK";
  }

  return {
    totalAiOnly: aiOnlyFindings.length,
    validCount,
    invalidCount,
    duplicateCount,
    lowValueCount,
    validatedNovelRate,
    systemStrength,
  };
}

/**
 * Compute adjusted precision that accounts for validated novel signal.
 *
 * adjusted_precision = (matched + validated_novel) / total_ai_findings
 */
export function computeAdjustedPrecision(
  matchedCount: number,
  validNovelCount: number,
  totalAI: number
): number {
  if (totalAI === 0) return 0;
  return (matchedCount + validNovelCount) / totalAI;
}
