/**
 * Gravito Eval — Confidence Scoring
 *
 * Scores individual findings on a 0–1 confidence scale based on
 * observable signal factors. Uses generic weights suitable for
 * any AI evaluation domain.
 *
 * Applies nonlinear scaling to spread the distribution across
 * the 0.3–0.95 range (avoiding the common clustering at 0.6–0.7).
 */

import type { Finding, ScoredFinding, ConfidenceFactors } from "../types";

// ─── Signal Analysis ──────────────────────────────────────────────────────

function countSignals(finding: Finding): number {
  let count = 0;
  if (finding.description && finding.description.length > 40) count++;
  if (finding.category) count++;
  if (finding.severity) count++;
  if (finding.location) count++;
  if (finding.keywords && finding.keywords.length > 0) count++;
  return count;
}

function isSubjective(finding: Finding): boolean {
  const subjectivePatterns = [
    "feel",
    "seem",
    "appear",
    "might",
    "could",
    "possibly",
    "arguably",
    "subjective",
    "opinion",
    "aesthetic",
  ];
  const desc = finding.description.toLowerCase();
  return subjectivePatterns.some((p) => desc.includes(p));
}

function hasSpecificEvidence(finding: Finding): boolean {
  const evidencePatterns = [
    "button",
    "link",
    "form",
    "image",
    "text",
    "header",
    "footer",
    "navigation",
    "color",
    "font",
    "size",
    "spacing",
    "contrast",
    "error",
    "missing",
    "broken",
    "incorrect",
    "404",
    "timeout",
    "slow",
    "pixel",
    "mobile",
    "desktop",
    "screen",
  ];
  const desc = finding.description.toLowerCase();
  return evidencePatterns.some((p) => desc.includes(p));
}

function hasPatternRepetition(finding: Finding): boolean {
  // Check if keywords suggest a recurring pattern
  if (finding.keywords && finding.keywords.length >= 3) return true;
  // Check if description mentions multiple instances
  const desc = finding.description.toLowerCase();
  return /\b(multiple|several|many|all|every|each|throughout)\b/.test(desc);
}

// ─── Factor Computation ───────────────────────────────────────────────────

function computeFactors(finding: Finding): ConfidenceFactors {
  const signals = countSignals(finding);
  const maxSignals = 5;

  return {
    signal_strength: Math.min(signals / maxSignals, 1),
    cross_signal_support: hasSpecificEvidence(finding) ? 0.8 : 0.3,
    pattern_repetition: hasPatternRepetition(finding) ? 0.7 : 0.2,
    rule_determinism: isSubjective(finding) ? 0.2 : 0.7,
    clarity_of_evidence: Math.min(finding.description.length / 150, 1),
  };
}

// ─── Confidence Computation ───────────────────────────────────────────────

/**
 * Generic weights for confidence scoring.
 * These are intentionally balanced — not tuned for any specific domain.
 */
const GENERIC_WEIGHTS = {
  signal_strength: 0.20,
  cross_signal_support: 0.25,
  pattern_repetition: 0.15,
  rule_determinism: 0.20,
  clarity_of_evidence: 0.20,
};

function computeRawConfidence(factors: ConfidenceFactors): number {
  let raw = 0;
  for (const [key, weight] of Object.entries(GENERIC_WEIGHTS)) {
    raw += factors[key as keyof ConfidenceFactors] * weight;
  }
  return raw;
}

/**
 * Apply nonlinear scaling to spread the distribution.
 * Uses a sigmoid-like transform to push values away from the center.
 */
function applyNonlinearScaling(raw: number): number {
  // Shift and scale to spread the 0.4-0.7 cluster
  const centered = (raw - 0.5) * 2.5;
  const sigmoid = 1 / (1 + Math.exp(-centered));
  // Map back to 0.15-0.95 range
  return 0.15 + sigmoid * 0.80;
}

/**
 * Apply severity bonus/penalty.
 */
function applySeverityAdjustment(confidence: number, severity: string): number {
  const adjustments: Record<string, number> = {
    critical: 0.10,
    high: 0.05,
    medium: 0.00,
    low: -0.05,
  };
  return Math.max(0, Math.min(1, confidence + (adjustments[severity] ?? 0)));
}

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Score a single finding's confidence level.
 *
 * Returns a value between 0 and 1 where:
 * - 0.0–0.3: Very low confidence (likely noise)
 * - 0.3–0.5: Low confidence (needs review)
 * - 0.5–0.7: Moderate confidence (plausible)
 * - 0.7–0.85: High confidence (likely valid)
 * - 0.85–1.0: Very high confidence (strong evidence)
 */
export function scoreConfidence(finding: Finding): ScoredFinding {
  const factors = computeFactors(finding);
  const raw = computeRawConfidence(factors);
  const scaled = applyNonlinearScaling(raw);
  const final = applySeverityAdjustment(scaled, finding.severity);

  return {
    ...finding,
    confidence: Math.round(final * 1000) / 1000,
    factors,
    isSubjective: isSubjective(finding),
    signalCount: countSignals(finding),
  };
}

/**
 * Score a batch of findings.
 */
export function scoreFindings(findings: Finding[]): ScoredFinding[] {
  return findings.map(scoreConfidence);
}
