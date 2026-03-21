/**
 * Gravito Eval — Multi-Pass Semantic Matcher
 *
 * Matches AI findings against human findings using three passes:
 * 1. Strict: same category + high keyword similarity (>0.75)
 * 2. Cross-category: high similarity (>0.80) + category equivalence
 * 3. Conceptual merge: cluster related findings, match cluster ↔ single issue
 *
 * Each pass uses greedy one-to-one matching — no double-counting.
 */

import type {
  Finding,
  MatchPair,
  MatchResult,
  MultiPassMatchResult,
  IssueCategory,
} from "../types";

// ─── Category Equivalence Map ─────────────────────────────────────────────

const CATEGORY_EQUIVALENCE: Record<IssueCategory, IssueCategory[]> = {
  trust: ["content", "conversion"],
  content: ["trust", "navigation"],
  navigation: ["conversion"],
  conversion: ["navigation", "trust"],
  visual_hierarchy: ["conversion", "content"],
  compliance: ["trust"],
  performance: ["conversion"],
};

function areCategoriesEquivalent(a: IssueCategory, b: IssueCategory): boolean {
  if (a === b) return true;
  return CATEGORY_EQUIVALENCE[a]?.includes(b) || CATEGORY_EQUIVALENCE[b]?.includes(a) || false;
}

// ─── Keyword Similarity ───────────────────────────────────────────────────

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
}

/**
 * Compute keyword similarity between two findings.
 * Uses a hybrid approach:
 * 1. Jaccard on full text (description + keywords)
 * 2. Keyword-specific overlap (weighted higher)
 * 3. Location similarity bonus
 * Final score = max(jaccard, keywordOverlap) with location bonus
 */
export function keywordSimilarity(a: Finding, b: Finding): number {
  // Full-text Jaccard
  const textA = [a.description, ...(a.keywords || [])].join(" ");
  const textB = [b.description, ...(b.keywords || [])].join(" ");
  const tokensA = tokenize(textA);
  const tokensB = tokenize(textB);

  if (tokensA.size === 0 && tokensB.size === 0) return 1;
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let textIntersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) textIntersection++;
  }
  const textUnion = tokensA.size + tokensB.size - textIntersection;
  const jaccardScore = textUnion === 0 ? 0 : textIntersection / textUnion;

  // Keyword-specific overlap (Dice coefficient — more generous for small sets)
  let keywordScore = 0;
  const kwA = new Set((a.keywords || []).map((k) => k.toLowerCase()));
  const kwB = new Set((b.keywords || []).map((k) => k.toLowerCase()));
  if (kwA.size > 0 && kwB.size > 0) {
    let kwOverlap = 0;
    for (const k of kwA) {
      for (const kb of kwB) {
        // Exact match or substring containment
        if (k === kb || k.includes(kb) || kb.includes(k)) {
          kwOverlap++;
          break;
        }
      }
    }
    keywordScore = (2 * kwOverlap) / (kwA.size + kwB.size);
  }

  // Location bonus
  let locationBonus = 0;
  if (a.location && b.location) {
    const locA = tokenize(a.location);
    const locB = tokenize(b.location);
    let locOverlap = 0;
    for (const t of locA) {
      if (locB.has(t)) locOverlap++;
    }
    const locUnion = locA.size + locB.size - locOverlap;
    if (locUnion > 0 && locOverlap / locUnion > 0.3) {
      locationBonus = 0.1;
    }
  }

  // Hybrid: take the best of Jaccard and keyword overlap, add location bonus
  const baseScore = Math.max(jaccardScore, keywordScore);
  return Math.min(1, baseScore + locationBonus);
}

// ─── Greedy Matcher ───────────────────────────────────────────────────────

interface CandidatePair {
  aiIdx: number;
  humanIdx: number;
  similarity: number;
}

function greedyMatch(
  candidates: CandidatePair[],
  usedAi: Set<number>,
  usedHuman: Set<number>
): CandidatePair[] {
  // Sort by similarity descending
  const sorted = [...candidates].sort((a, b) => b.similarity - a.similarity);
  const matched: CandidatePair[] = [];

  for (const pair of sorted) {
    if (usedAi.has(pair.aiIdx) || usedHuman.has(pair.humanIdx)) continue;
    matched.push(pair);
    usedAi.add(pair.aiIdx);
    usedHuman.add(pair.humanIdx);
  }

  return matched;
}

// ─── Pass 1: Strict Match ─────────────────────────────────────────────────

function strictPass(
  aiFindings: Finding[],
  humanFindings: Finding[],
  usedAi: Set<number>,
  usedHuman: Set<number>,
  threshold: number = 0.55
): MatchPair[] {
  const candidates: CandidatePair[] = [];

  for (let i = 0; i < aiFindings.length; i++) {
    if (usedAi.has(i)) continue;
    for (let j = 0; j < humanFindings.length; j++) {
      if (usedHuman.has(j)) continue;
      // Same category required
      if (aiFindings[i].category !== humanFindings[j].category) continue;
      const sim = keywordSimilarity(aiFindings[i], humanFindings[j]);
      if (sim >= threshold) {
        candidates.push({ aiIdx: i, humanIdx: j, similarity: sim });
      }
    }
  }

  const matched = greedyMatch(candidates, usedAi, usedHuman);
  return matched.map((m) => ({
    aiIssue: aiFindings[m.aiIdx],
    humanIssue: humanFindings[m.humanIdx],
    similarity: m.similarity,
    matchType: "strict" as const,
  }));
}

// ─── Pass 2: Cross-Category Match ─────────────────────────────────────────

function crossCategoryPass(
  aiFindings: Finding[],
  humanFindings: Finding[],
  usedAi: Set<number>,
  usedHuman: Set<number>,
  threshold: number = 0.50
): MatchPair[] {
  const candidates: CandidatePair[] = [];

  for (let i = 0; i < aiFindings.length; i++) {
    if (usedAi.has(i)) continue;
    for (let j = 0; j < humanFindings.length; j++) {
      if (usedHuman.has(j)) continue;
      // Must be equivalent categories (not same — that was pass 1)
      if (aiFindings[i].category === humanFindings[j].category) continue;
      if (!areCategoriesEquivalent(aiFindings[i].category, humanFindings[j].category)) continue;
      const sim = keywordSimilarity(aiFindings[i], humanFindings[j]);
      if (sim >= threshold) {
        candidates.push({ aiIdx: i, humanIdx: j, similarity: sim });
      }
    }
  }

  const matched = greedyMatch(candidates, usedAi, usedHuman);
  return matched.map((m) => ({
    aiIssue: aiFindings[m.aiIdx],
    humanIssue: humanFindings[m.humanIdx],
    similarity: m.similarity,
    matchType: "cross_category" as const,
  }));
}

// ─── Pass 3: Conceptual Merge ─────────────────────────────────────────────

interface Cluster {
  findings: { finding: Finding; originalIdx: number }[];
  centroidTokens: Set<string>;
}

function clusterFindings(
  findings: Finding[],
  usedIndices: Set<number>,
  similarityThreshold: number = 0.40
): Cluster[] {
  const clusters: Cluster[] = [];
  const assigned = new Set<number>();

  for (let i = 0; i < findings.length; i++) {
    if (usedIndices.has(i) || assigned.has(i)) continue;

    const cluster: Cluster = {
      findings: [{ finding: findings[i], originalIdx: i }],
      centroidTokens: tokenize(findings[i].description),
    };
    assigned.add(i);

    for (let j = i + 1; j < findings.length; j++) {
      if (usedIndices.has(j) || assigned.has(j)) continue;
      const sim = keywordSimilarity(findings[i], findings[j]);
      if (sim >= similarityThreshold) {
        cluster.findings.push({ finding: findings[j], originalIdx: j });
        // Expand centroid
        for (const t of tokenize(findings[j].description)) {
          cluster.centroidTokens.add(t);
        }
        assigned.add(j);
      }
    }

    if (cluster.findings.length >= 2) {
      clusters.push(cluster);
    }
  }

  return clusters;
}

function conceptualMergePass(
  aiFindings: Finding[],
  humanFindings: Finding[],
  usedAi: Set<number>,
  usedHuman: Set<number>,
  clusterThreshold: number = 0.40,
  matchThreshold: number = 0.35
): MatchPair[] {
  const matches: MatchPair[] = [];

  // Cluster unmatched AI findings
  const aiClusters = clusterFindings(aiFindings, usedAi, clusterThreshold);

  // Try to match each cluster against unmatched human findings
  for (const cluster of aiClusters) {
    let bestHumanIdx = -1;
    let bestSim = 0;

    for (let j = 0; j < humanFindings.length; j++) {
      if (usedHuman.has(j)) continue;

      const humanTokens = tokenize(humanFindings[j].description);
      // Compute overlap between cluster centroid and human finding
      let intersection = 0;
      for (const t of humanTokens) {
        if (cluster.centroidTokens.has(t)) intersection++;
      }
      const union = cluster.centroidTokens.size + humanTokens.size - intersection;
      const sim = union > 0 ? intersection / union : 0;

      if (sim > bestSim && sim >= matchThreshold) {
        bestSim = sim;
        bestHumanIdx = j;
      }
    }

    if (bestHumanIdx >= 0) {
      // Match the highest-severity finding from the cluster
      const bestAi = cluster.findings.reduce((best, curr) => {
        const sevOrder = { low: 1, medium: 2, high: 3, critical: 4 };
        return sevOrder[curr.finding.severity] > sevOrder[best.finding.severity] ? curr : best;
      });

      matches.push({
        aiIssue: bestAi.finding,
        humanIssue: humanFindings[bestHumanIdx],
        similarity: bestSim,
        matchType: "conceptual",
      });

      // Mark all cluster members as used
      for (const member of cluster.findings) {
        usedAi.add(member.originalIdx);
      }
      usedHuman.add(bestHumanIdx);
    }
  }

  return matches;
}

// ─── Main Entry Point ─────────────────────────────────────────────────────

export interface MultiPassOptions {
  strictThreshold?: number;
  crossCategoryThreshold?: number;
  clusterThreshold?: number;
  conceptualMatchThreshold?: number;
}

/**
 * Run multi-pass semantic matching between AI and human findings.
 *
 * Returns detailed results with match breakdown by pass type.
 */
export function multiPassMatch(
  aiFindings: Finding[],
  humanFindings: Finding[],
  options?: MultiPassOptions
): MultiPassMatchResult {
  const usedAi = new Set<number>();
  const usedHuman = new Set<number>();

  // Pass 1: Strict
  const strict = strictPass(
    aiFindings,
    humanFindings,
    usedAi,
    usedHuman,
    options?.strictThreshold ?? 0.55
  );

  // Pass 2: Cross-category
  const crossCategory = crossCategoryPass(
    aiFindings,
    humanFindings,
    usedAi,
    usedHuman,
    options?.crossCategoryThreshold ?? 0.50
  );

  // Pass 3: Conceptual merge
  const conceptual = conceptualMergePass(
    aiFindings,
    humanFindings,
    usedAi,
    usedHuman,
    options?.clusterThreshold ?? 0.40,
    options?.conceptualMatchThreshold ?? 0.35
  );

  // Collect unmatched
  const aiOnly = aiFindings.filter((_, i) => !usedAi.has(i));
  const humanOnly = humanFindings.filter((_, i) => !usedHuman.has(i));

  return {
    strictMatches: strict,
    crossCategoryMatches: crossCategory,
    conceptualMatches: conceptual,
    aiOnly,
    humanOnly,
    summary: {
      total_ai: aiFindings.length,
      total_human: humanFindings.length,
      strict_matched: strict.length,
      cross_category_matched: crossCategory.length,
      conceptual_matched: conceptual.length,
      total_matched: strict.length + crossCategory.length + conceptual.length,
      ai_only: aiOnly.length,
      human_only: humanOnly.length,
    },
  };
}

/**
 * Convert MultiPassMatchResult to a flat MatchResult for simpler consumers.
 */
export function toFlatMatchResult(result: MultiPassMatchResult): MatchResult {
  return {
    matched: [
      ...result.strictMatches,
      ...result.crossCategoryMatches,
      ...result.conceptualMatches,
    ],
    aiOnly: result.aiOnly,
    humanOnly: result.humanOnly,
  };
}
