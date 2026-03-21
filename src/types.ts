/**
 * Gravito Eval — Core Types
 *
 * Shared type definitions for the evaluation framework.
 * All modules import from here — no circular dependencies.
 */

// ─── Finding Types ────────────────────────────────────────────────────────

export const ISSUE_CATEGORIES = [
  "conversion",
  "navigation",
  "visual_hierarchy",
  "trust",
  "content",
  "compliance",
  "performance",
] as const;

export type IssueCategory = (typeof ISSUE_CATEGORIES)[number];

export const SEVERITY_LEVELS = ["low", "medium", "high", "critical"] as const;

export type SeverityLevel = (typeof SEVERITY_LEVELS)[number];

/**
 * A normalized finding from either an AI system or a human auditor.
 * This is the universal input format for gravito-eval.
 */
export interface Finding {
  /** Unique identifier */
  id: string;
  /** Human-readable description of the issue */
  description: string;
  /** Issue category */
  category: IssueCategory;
  /** Severity level */
  severity: SeverityLevel;
  /** Where the issue was found (page, component, URL, etc.) */
  location?: string;
  /** Optional keywords for matching */
  keywords?: string[];
}

// ─── Match Types ──────────────────────────────────────────────────────────

export interface MatchPair {
  aiIssue: Finding;
  humanIssue: Finding;
  similarity: number;
  matchType: "strict" | "cross_category" | "conceptual";
}

export interface MatchResult {
  matched: MatchPair[];
  aiOnly: Finding[];
  humanOnly: Finding[];
}

export interface MultiPassMatchResult {
  strictMatches: MatchPair[];
  crossCategoryMatches: MatchPair[];
  conceptualMatches: MatchPair[];
  aiOnly: Finding[];
  humanOnly: Finding[];
  summary: {
    total_ai: number;
    total_human: number;
    strict_matched: number;
    cross_category_matched: number;
    conceptual_matched: number;
    total_matched: number;
    ai_only: number;
    human_only: number;
  };
}

// ─── Adjudication Types ───────────────────────────────────────────────────

export const ADJUDICATION_LABELS = [
  "VALID",
  "INVALID",
  "DUPLICATE",
  "LOW_VALUE",
] as const;

export type AdjudicationLabel = (typeof ADJUDICATION_LABELS)[number];

export interface Adjudication {
  /** ID of the AI-only finding being adjudicated */
  findingId: string;
  /** Verdict */
  label: AdjudicationLabel;
  /** Reasoning */
  reasoning?: string;
}

// ─── Metrics Types ────────────────────────────────────────────────────────

export interface DetectionMetrics {
  recall: number;
  precision: number;
  f1: number;
  matchedCount: number;
  totalAI: number;
  totalHuman: number;
}

export interface RankingMetrics {
  top3Overlap: number;
  top5Overlap: number;
  spearmanCorrelation: number;
}

export interface SeverityMetrics {
  weightedKappa: number;
  meanAbsoluteError: number;
  confusionMatrix: Record<string, Record<string, number>>;
}

export interface NovelSignalMetrics {
  totalAiOnly: number;
  validCount: number;
  invalidCount: number;
  duplicateCount: number;
  lowValueCount: number;
  validatedNovelRate: number;
  systemStrength: "WEAK" | "MODERATE" | "STRONG" | "DIFFERENTIATED";
}

export interface ConfidenceInterval {
  mean: number;
  lowerBound: number;
  upperBound: number;
}

export interface EvalResult {
  detection: DetectionMetrics;
  ranking: RankingMetrics;
  severity: SeverityMetrics;
  novelSignal?: NovelSignalMetrics;
  matchBreakdown: {
    strict: number;
    crossCategory: number;
    conceptual: number;
  };
  /** Individual match pairs for detailed inspection */
  matches: MatchPair[];
  /** Findings only in AI output (novel/unmatched) */
  aiOnly: Finding[];
  /** Findings only in human output (missed by AI) */
  humanOnly: Finding[];
  adjustedPrecision?: number;
  verdict: "PASS" | "PARTIAL" | "FAIL" | "INSUFFICIENT_DATA";
}

// ─── Confidence Types ─────────────────────────────────────────────────────

export interface ConfidenceFactors {
  signal_strength: number;
  cross_signal_support: number;
  pattern_repetition: number;
  rule_determinism: number;
  clarity_of_evidence: number;
}

export interface ScoredFinding extends Finding {
  confidence: number;
  factors: ConfidenceFactors;
  isSubjective: boolean;
  signalCount: number;
}
