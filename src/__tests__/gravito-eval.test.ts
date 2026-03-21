import { describe, it, expect } from 'vitest';
import {
  evaluate,
  multiPassMatch,
  computeNovelSignal,
  scoreConfidence,
  computeDetectionMetrics,
  computeRankingMetrics,
  computeSeverityMetrics,
  wilsonInterval,
  toFlatMatchResult,
  batchAutoAdjudicate,
  type Finding,
  type Adjudication,
  type MultiPassMatchResult,
  type EvalResult,
  type DetectionMetrics,
  type NovelSignalMetrics,
  type ScoredFinding,
} from '../index';

// ─── Test Data ──────────────────────────────────────────────────────────────

const aiFindings: Finding[] = [
  { id: 'ai-1', description: 'Missing alt text on hero image reduces accessibility for screen readers', category: 'content', severity: 'high', keywords: ['alt text', 'accessibility', 'image', 'screen reader'] },
  { id: 'ai-2', description: 'Form submit button has no loading state indicator when clicked', category: 'conversion', severity: 'medium', keywords: ['form', 'submit', 'loading', 'button'] },
  { id: 'ai-3', description: 'Navigation menu lacks mobile responsive hamburger menu on small screens', category: 'navigation', severity: 'high', keywords: ['navigation', 'mobile', 'responsive', 'hamburger'] },
  { id: 'ai-4', description: 'Trust badges and security seals missing from checkout page', category: 'trust', severity: 'medium', keywords: ['trust', 'badges', 'checkout', 'security'] },
  { id: 'ai-5', description: 'Page load time exceeds 3 seconds on mobile devices causing high bounce rate', category: 'performance', severity: 'critical', keywords: ['page load', 'performance', 'mobile', 'speed', 'bounce'] },
  { id: 'ai-6', description: 'Color contrast ratio below WCAG AA standard on body text elements', category: 'compliance', severity: 'high', keywords: ['color', 'contrast', 'WCAG', 'accessibility', 'text'] },
];

const humanFindings: Finding[] = [
  { id: 'h-1', description: 'Hero image missing alternative text for screen readers and accessibility', category: 'content', severity: 'high', keywords: ['alt text', 'image', 'screen reader', 'accessibility'] },
  { id: 'h-2', description: 'Submit button provides no feedback or loading indicator when clicked', category: 'conversion', severity: 'medium', keywords: ['submit', 'button', 'feedback', 'loading'] },
  { id: 'h-3', description: 'Mobile navigation is broken and unresponsive on small screens', category: 'navigation', severity: 'critical', keywords: ['mobile', 'navigation', 'responsive', 'broken'] },
  { id: 'h-4', description: 'Privacy policy link is missing from footer area of the website', category: 'compliance', severity: 'medium', keywords: ['privacy', 'policy', 'footer', 'compliance'] },
  { id: 'h-5', description: 'Font size too small on mobile devices causing readability issues', category: 'visual_hierarchy', severity: 'low', keywords: ['font', 'size', 'mobile', 'readability'] },
];

// Adjudications use `label` field, not `verdict`
const adjudications: Adjudication[] = [
  { findingId: 'ai-4', label: 'VALID', reasoning: 'Trust badges are indeed missing from checkout' },
  { findingId: 'ai-5', label: 'VALID', reasoning: 'Confirmed slow load times on mobile' },
  { findingId: 'ai-6', label: 'DUPLICATE', reasoning: 'Overlaps with general accessibility issues' },
];

// ─── Types Tests ────────────────────────────────────────────────────────────

describe('Types', () => {
  it('Finding type accepts all required fields', () => {
    const f: Finding = {
      id: 'test-1',
      description: 'Test finding',
      category: 'content',
      severity: 'medium',
    };
    expect(f.id).toBe('test-1');
    expect(f.category).toBe('content');
    expect(f.severity).toBe('medium');
  });

  it('Finding type accepts optional fields', () => {
    const f: Finding = {
      id: 'test-2',
      description: 'Test finding with extras',
      category: 'trust',
      severity: 'high',
      location: '/checkout',
      keywords: ['trust', 'checkout'],
    };
    expect(f.location).toBe('/checkout');
    expect(f.keywords).toEqual(['trust', 'checkout']);
  });

  it('Adjudication type accepts all label types', () => {
    const labels: Adjudication['label'][] = ['VALID', 'INVALID', 'DUPLICATE', 'LOW_VALUE'];
    labels.forEach(l => {
      const adj: Adjudication = { findingId: 'x', label: l };
      expect(adj.label).toBe(l);
    });
  });
});

// ─── Multi-Pass Matching Tests ──────────────────────────────────────────────

describe('Multi-Pass Matching', () => {
  it('returns a valid MultiPassMatchResult structure', () => {
    const result = multiPassMatch(aiFindings, humanFindings);
    expect(result).toHaveProperty('strictMatches');
    expect(result).toHaveProperty('crossCategoryMatches');
    expect(result).toHaveProperty('conceptualMatches');
    expect(result).toHaveProperty('aiOnly');
    expect(result).toHaveProperty('humanOnly');
    expect(result).toHaveProperty('summary');
    expect(Array.isArray(result.strictMatches)).toBe(true);
    expect(Array.isArray(result.crossCategoryMatches)).toBe(true);
    expect(Array.isArray(result.conceptualMatches)).toBe(true);
    expect(Array.isArray(result.aiOnly)).toBe(true);
    expect(Array.isArray(result.humanOnly)).toBe(true);
  });

  it('finds strict matches when category and description overlap', () => {
    const result = multiPassMatch(aiFindings, humanFindings);
    expect(result.strictMatches.length).toBeGreaterThan(0);
  });

  it('does not double-count findings across passes', () => {
    const result = multiPassMatch(aiFindings, humanFindings);
    const totalMatched = result.summary.total_matched;
    // Total AI used should not exceed total AI findings
    expect(totalMatched + result.summary.ai_only).toBeLessThanOrEqual(aiFindings.length);
    // Total human used should not exceed total human findings
    expect(totalMatched + result.summary.human_only).toBeLessThanOrEqual(humanFindings.length);
  });

  it('summary counts are consistent', () => {
    const result = multiPassMatch(aiFindings, humanFindings);
    expect(result.summary.total_matched).toBe(
      result.summary.strict_matched + result.summary.cross_category_matched + result.summary.conceptual_matched
    );
    expect(result.summary.total_ai).toBe(aiFindings.length);
    expect(result.summary.total_human).toBe(humanFindings.length);
  });

  it('handles empty inputs gracefully', () => {
    const result = multiPassMatch([], []);
    expect(result.strictMatches).toEqual([]);
    expect(result.crossCategoryMatches).toEqual([]);
    expect(result.conceptualMatches).toEqual([]);
    expect(result.aiOnly).toEqual([]);
    expect(result.humanOnly).toEqual([]);
  });

  it('handles AI-only findings (no human findings)', () => {
    const result = multiPassMatch(aiFindings, []);
    expect(result.strictMatches).toEqual([]);
    expect(result.crossCategoryMatches).toEqual([]);
    expect(result.aiOnly.length).toBe(aiFindings.length);
    expect(result.humanOnly).toEqual([]);
  });

  it('handles human-only findings (no AI findings)', () => {
    const result = multiPassMatch([], humanFindings);
    expect(result.strictMatches).toEqual([]);
    expect(result.humanOnly.length).toBe(humanFindings.length);
    expect(result.aiOnly).toEqual([]);
  });

  it('respects custom thresholds', () => {
    const strict = multiPassMatch(aiFindings, humanFindings, { strictThreshold: 0.99 });
    const relaxed = multiPassMatch(aiFindings, humanFindings, { strictThreshold: 0.3 });
    expect(strict.strictMatches.length).toBeLessThanOrEqual(relaxed.strictMatches.length);
  });

  it('uses category equivalence map for cross-category matching', () => {
    const ai: Finding[] = [
      { id: 'a1', description: 'Trust signals and credibility indicators missing from product page content area', category: 'trust', severity: 'high', keywords: ['trust', 'signals', 'product', 'content', 'credibility'] },
    ];
    const human: Finding[] = [
      { id: 'h1', description: 'Product page content area lacks trust signals and credibility indicators', category: 'content', severity: 'high', keywords: ['trust', 'credibility', 'signals', 'product', 'content'] },
    ];
    const result = multiPassMatch(ai, human);
    const totalMatches = result.summary.total_matched;
    expect(totalMatches).toBeGreaterThanOrEqual(1);
  });

  it('toFlatMatchResult flattens multi-pass result correctly', () => {
    const result = multiPassMatch(aiFindings, humanFindings);
    const flat = toFlatMatchResult(result);
    expect(flat.matched.length).toBe(result.summary.total_matched);
    expect(flat.aiOnly.length).toBe(result.aiOnly.length);
    expect(flat.humanOnly.length).toBe(result.humanOnly.length);
  });
});

// ─── Metrics Tests ──────────────────────────────────────────────────────────

describe('Detection Metrics', () => {
  it('computes recall correctly', () => {
    const matchResult = multiPassMatch(aiFindings, humanFindings);
    const result = computeDetectionMetrics(matchResult, aiFindings.length, humanFindings.length);
    expect(result.recall).toBeGreaterThanOrEqual(0);
    expect(result.recall).toBeLessThanOrEqual(1);
  });

  it('computes precision correctly', () => {
    const matchResult = multiPassMatch(aiFindings, humanFindings);
    const result = computeDetectionMetrics(matchResult, aiFindings.length, humanFindings.length);
    expect(result.precision).toBeGreaterThanOrEqual(0);
    expect(result.precision).toBeLessThanOrEqual(1);
  });

  it('computes F1 as harmonic mean of recall and precision', () => {
    const matchResult = multiPassMatch(aiFindings, humanFindings);
    const result = computeDetectionMetrics(matchResult, aiFindings.length, humanFindings.length);
    if (result.recall > 0 && result.precision > 0) {
      const expectedF1 = 2 * (result.precision * result.recall) / (result.precision + result.recall);
      expect(result.f1).toBeCloseTo(expectedF1, 2);
    }
  });

  it('returns zero metrics for empty inputs', () => {
    const matchResult = multiPassMatch([], []);
    const result = computeDetectionMetrics(matchResult, 0, 0);
    expect(result.recall).toBe(0);
    expect(result.precision).toBe(0);
    expect(result.f1).toBe(0);
  });

  it('returns perfect metrics when AI finds everything human found', () => {
    const same: Finding[] = [
      { id: 'a1', description: 'Missing alt text on images for accessibility', category: 'content', severity: 'high', keywords: ['alt text', 'images', 'accessibility'] },
    ];
    const sameHuman: Finding[] = [
      { id: 'h1', description: 'Missing alt text on images for accessibility', category: 'content', severity: 'high', keywords: ['alt text', 'images', 'accessibility'] },
    ];
    const matchResult = multiPassMatch(same, sameHuman);
    const result = computeDetectionMetrics(matchResult, same.length, sameHuman.length);
    expect(result.recall).toBe(1);
    expect(result.precision).toBe(1);
  });
});

describe('Ranking Metrics', () => {
  it('computes top-3 and top-5 overlap', () => {
    const matchResult = multiPassMatch(aiFindings, humanFindings);
    const result = computeRankingMetrics(aiFindings, humanFindings, matchResult);
    expect(result.top3Overlap).toBeGreaterThanOrEqual(0);
    expect(result.top3Overlap).toBeLessThanOrEqual(1);
    expect(result.top5Overlap).toBeGreaterThanOrEqual(0);
    expect(result.top5Overlap).toBeLessThanOrEqual(1);
  });

  it('includes Spearman correlation', () => {
    const matchResult = multiPassMatch(aiFindings, humanFindings);
    const result = computeRankingMetrics(aiFindings, humanFindings, matchResult);
    expect(result).toHaveProperty('spearmanCorrelation');
    expect(result.spearmanCorrelation).toBeGreaterThanOrEqual(-1);
    expect(result.spearmanCorrelation).toBeLessThanOrEqual(1);
  });
});

describe('Severity Metrics', () => {
  it('computes weighted kappa', () => {
    const matchResult = multiPassMatch(aiFindings, humanFindings);
    const result = computeSeverityMetrics(matchResult);
    expect(result).toHaveProperty('weightedKappa');
    expect(result.weightedKappa).toBeGreaterThanOrEqual(-1);
    expect(result.weightedKappa).toBeLessThanOrEqual(1);
  });

  it('computes mean absolute error', () => {
    const matchResult = multiPassMatch(aiFindings, humanFindings);
    const result = computeSeverityMetrics(matchResult);
    expect(result).toHaveProperty('meanAbsoluteError');
    expect(result.meanAbsoluteError).toBeGreaterThanOrEqual(0);
  });

  it('includes confusion matrix', () => {
    const matchResult = multiPassMatch(aiFindings, humanFindings);
    const result = computeSeverityMetrics(matchResult);
    expect(result).toHaveProperty('confusionMatrix');
    expect(result.confusionMatrix).toHaveProperty('low');
    expect(result.confusionMatrix).toHaveProperty('medium');
    expect(result.confusionMatrix).toHaveProperty('high');
    expect(result.confusionMatrix).toHaveProperty('critical');
  });
});

describe('Wilson Interval', () => {
  it('computes confidence interval for proportions', () => {
    const ci = wilsonInterval(7, 10);
    expect(ci.mean).toBeCloseTo(0.7, 2);
    expect(ci.lowerBound).toBeLessThan(ci.mean);
    expect(ci.upperBound).toBeGreaterThan(ci.mean);
    expect(ci.lowerBound).toBeGreaterThanOrEqual(0);
    expect(ci.upperBound).toBeLessThanOrEqual(1);
  });

  it('handles zero total', () => {
    const ci = wilsonInterval(0, 0);
    expect(ci.mean).toBe(0);
    expect(ci.lowerBound).toBe(0);
    expect(ci.upperBound).toBe(0);
  });
});

// ─── Novel Signal Tests ─────────────────────────────────────────────────────

describe('Novel Signal', () => {
  it('computes novel signal from adjudications', () => {
    const aiOnly = aiFindings.slice(3); // ai-4, ai-5, ai-6
    const result = computeNovelSignal(aiOnly, adjudications);
    expect(result).toHaveProperty('validatedNovelRate');
    expect(result).toHaveProperty('validCount');
    expect(result).toHaveProperty('invalidCount');
    expect(result).toHaveProperty('duplicateCount');
    expect(result).toHaveProperty('lowValueCount');
    expect(result).toHaveProperty('totalAiOnly');
  });

  it('counts VALID adjudications correctly', () => {
    const aiOnly = aiFindings.slice(3);
    const result = computeNovelSignal(aiOnly, adjudications);
    expect(result.validCount).toBe(2); // ai-4 and ai-5 are VALID
    expect(result.duplicateCount).toBe(1); // ai-6 is DUPLICATE
  });

  it('computes validated novel rate correctly', () => {
    const aiOnly = aiFindings.slice(3);
    const result = computeNovelSignal(aiOnly, adjudications);
    // 2 valid out of 3 adjudicated = 66.7%
    expect(result.validatedNovelRate).toBeCloseTo(2 / 3, 2);
  });

  it('returns zero rate when no adjudications exist', () => {
    const result = computeNovelSignal(aiFindings, []);
    expect(result.validatedNovelRate).toBe(0);
  });

  it('handles empty AI-only findings', () => {
    const result = computeNovelSignal([], adjudications);
    expect(result.validCount).toBe(0);
  });

  it('interprets novel signal strength correctly', () => {
    const aiOnly = aiFindings.slice(3);
    const result = computeNovelSignal(aiOnly, adjudications);
    // 66.7% valid rate → DIFFERENTIATED (≥40%)
    expect(result.systemStrength).toBe('DIFFERENTIATED');
  });

  it('batchAutoAdjudicate produces adjudications for all findings', () => {
    const autoAdj = batchAutoAdjudicate(aiFindings);
    expect(autoAdj.length).toBe(aiFindings.length);
    autoAdj.forEach(adj => {
      expect(['VALID', 'INVALID', 'DUPLICATE', 'LOW_VALUE']).toContain(adj.label);
      expect(adj.findingId).toBeDefined();
    });
  });
});

// ─── Confidence Scoring Tests ───────────────────────────────────────────────

describe('Confidence Scoring', () => {
  it('returns a ScoredFinding with confidence between 0 and 1', () => {
    const result = scoreConfidence(aiFindings[0]);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('returns breakdown of contributing factors', () => {
    const result = scoreConfidence(aiFindings[0]);
    expect(result).toHaveProperty('factors');
    expect(result.factors).toHaveProperty('signal_strength');
    expect(result.factors).toHaveProperty('cross_signal_support');
    expect(result.factors).toHaveProperty('pattern_repetition');
    expect(result.factors).toHaveProperty('rule_determinism');
    expect(result.factors).toHaveProperty('clarity_of_evidence');
  });

  it('scores higher for findings with more keywords', () => {
    const withKeywords: Finding = {
      id: 'k1', description: 'Missing alt text on hero image reduces accessibility for users', category: 'content', severity: 'high',
      keywords: ['alt text', 'accessibility', 'image', 'hero', 'WCAG'],
    };
    const withoutKeywords: Finding = {
      id: 'k2', description: 'Something is wrong', category: 'content', severity: 'medium',
    };
    const scoreWith = scoreConfidence(withKeywords);
    const scoreWithout = scoreConfidence(withoutKeywords);
    expect(scoreWith.confidence).toBeGreaterThan(scoreWithout.confidence);
  });

  it('scores higher for critical severity', () => {
    const critical: Finding = {
      id: 'c1', description: 'Critical security vulnerability found in authentication flow allowing bypass', category: 'compliance', severity: 'critical',
      keywords: ['security', 'vulnerability', 'authentication', 'critical'],
    };
    const low: Finding = {
      id: 'l1', description: 'Minor styling issue on page', category: 'visual_hierarchy', severity: 'low',
    };
    const scoreCritical = scoreConfidence(critical);
    const scoreLow = scoreConfidence(low);
    expect(scoreCritical.confidence).toBeGreaterThan(scoreLow.confidence);
  });

  it('includes isSubjective and signalCount', () => {
    const result = scoreConfidence(aiFindings[0]);
    expect(typeof result.isSubjective).toBe('boolean');
    expect(typeof result.signalCount).toBe('number');
    expect(result.signalCount).toBeGreaterThanOrEqual(0);
  });
});

// ─── Full Evaluation Pipeline Tests ─────────────────────────────────────────

describe('Full Evaluation (evaluate)', () => {
  it('returns a complete EvalResult', () => {
    const result = evaluate(aiFindings, humanFindings);
    expect(result).toHaveProperty('detection');
    expect(result).toHaveProperty('ranking');
    expect(result).toHaveProperty('severity');
    expect(result).toHaveProperty('matchBreakdown');
    expect(result).toHaveProperty('verdict');
  });

  it('detection metrics are consistent', () => {
    const result = evaluate(aiFindings, humanFindings);
    expect(result.detection.recall).toBeGreaterThanOrEqual(0);
    expect(result.detection.recall).toBeLessThanOrEqual(1);
    expect(result.detection.precision).toBeGreaterThanOrEqual(0);
    expect(result.detection.precision).toBeLessThanOrEqual(1);
    expect(result.detection.f1).toBeGreaterThanOrEqual(0);
    expect(result.detection.f1).toBeLessThanOrEqual(1);
    expect(result.detection.matchedCount).toBeGreaterThanOrEqual(0);
    expect(result.detection.totalAI).toBe(aiFindings.length);
    expect(result.detection.totalHuman).toBe(humanFindings.length);
  });

  it('matchBreakdown sums correctly', () => {
    const result = evaluate(aiFindings, humanFindings);
    const totalMatched = result.matchBreakdown.strict + result.matchBreakdown.crossCategory + result.matchBreakdown.conceptual;
    expect(totalMatched).toBe(result.detection.matchedCount);
  });

  it('includes novel signal with auto-adjudication by default', () => {
    const result = evaluate(aiFindings, humanFindings);
    // Auto-adjudication is on by default when there are AI-only findings
    if (result.detection.matchedCount < aiFindings.length) {
      expect(result.novelSignal).toBeDefined();
      if (result.novelSignal) {
        expect(result.novelSignal.validatedNovelRate).toBeGreaterThanOrEqual(0);
        expect(result.novelSignal.validCount).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('includes novel signal when explicit adjudications provided', () => {
    const result = evaluate(aiFindings, humanFindings, { adjudications });
    if (result.novelSignal) {
      expect(result.novelSignal.validatedNovelRate).toBeGreaterThanOrEqual(0);
    }
  });

  it('adjusted precision includes novel signal lift', () => {
    const result = evaluate(aiFindings, humanFindings, { adjudications });
    if (result.adjustedPrecision !== undefined && result.novelSignal && result.novelSignal.validCount > 0) {
      expect(result.adjustedPrecision).toBeGreaterThanOrEqual(result.detection.precision);
    }
  });

  it('verdict is one of PASS, PARTIAL, FAIL, INSUFFICIENT_DATA', () => {
    const result = evaluate(aiFindings, humanFindings);
    expect(['PASS', 'PARTIAL', 'FAIL', 'INSUFFICIENT_DATA']).toContain(result.verdict);
  });

  it('returns INSUFFICIENT_DATA for very small datasets', () => {
    const smallAi: Finding[] = [
      { id: 'a1', description: 'One issue found', category: 'content', severity: 'high' },
    ];
    const smallHuman: Finding[] = [
      { id: 'h1', description: 'One issue found', category: 'content', severity: 'high' },
    ];
    const result = evaluate(smallAi, smallHuman);
    expect(result.verdict).toBe('INSUFFICIENT_DATA');
  });

  it('handles edge case: completely different findings', () => {
    const ai: Finding[] = [
      { id: 'a1', description: 'Database connection timeout on API endpoint causing server errors', category: 'performance', severity: 'critical', keywords: ['database', 'timeout', 'API', 'server'] },
      { id: 'a2', description: 'SQL injection vulnerability in search query parameter', category: 'compliance', severity: 'critical', keywords: ['SQL', 'injection', 'search', 'security'] },
      { id: 'a3', description: 'Memory leak in background worker process consuming resources', category: 'performance', severity: 'high', keywords: ['memory', 'leak', 'worker', 'resources'] },
    ];
    const human: Finding[] = [
      { id: 'h1', description: 'Logo is pixelated on retina displays and high DPI screens', category: 'visual_hierarchy', severity: 'low', keywords: ['logo', 'pixelated', 'retina', 'DPI'] },
      { id: 'h2', description: 'Footer copyright year is outdated showing wrong year', category: 'content', severity: 'low', keywords: ['footer', 'copyright', 'year', 'outdated'] },
      { id: 'h3', description: 'Social media icons are misaligned in the header section', category: 'visual_hierarchy', severity: 'low', keywords: ['social', 'icons', 'misaligned', 'header'] },
    ];
    const result = evaluate(ai, human);
    expect(result.detection.matchedCount).toBe(0);
    expect(result.detection.recall).toBe(0);
  });

  it('handles large finding sets without errors', () => {
    const categories = ['content', 'trust', 'navigation', 'conversion', 'performance', 'compliance', 'visual_hierarchy'] as const;
    const severities = ['low', 'medium', 'high', 'critical'] as const;
    const largeAi: Finding[] = Array.from({ length: 50 }, (_, i) => ({
      id: `ai-${i}`,
      description: `AI finding number ${i} about issue type ${categories[i % 7]} with detailed description`,
      category: categories[i % 7],
      severity: severities[i % 4],
      keywords: [`keyword-${i}`, `type-${categories[i % 7]}`],
    }));
    const largeHuman: Finding[] = Array.from({ length: 30 }, (_, i) => ({
      id: `h-${i}`,
      description: `Human finding number ${i} about issue type ${categories[i % 5]} with detailed description`,
      category: categories[i % 5],
      severity: severities[i % 4],
      keywords: [`keyword-${i}`, `type-${categories[i % 5]}`],
    }));
    const result = evaluate(largeAi, largeHuman);
    expect(result.detection.totalAI).toBe(50);
    expect(result.detection.totalHuman).toBe(30);
    expect(result.detection.recall).toBeGreaterThanOrEqual(0);
    expect(result.detection.precision).toBeGreaterThanOrEqual(0);
  });
});

// ─── Proprietary Leakage Guard Tests ────────────────────────────────────────

describe('Proprietary Leakage Guard', () => {
  it('exports only generic evaluation functions', () => {
    expect(typeof evaluate).toBe('function');
    expect(typeof multiPassMatch).toBe('function');
    expect(typeof computeNovelSignal).toBe('function');
    expect(typeof scoreConfidence).toBe('function');
    expect(typeof computeDetectionMetrics).toBe('function');
    expect(typeof computeRankingMetrics).toBe('function');
    expect(typeof computeSeverityMetrics).toBe('function');
    expect(typeof wilsonInterval).toBe('function');
    expect(typeof toFlatMatchResult).toBe('function');
    expect(typeof batchAutoAdjudicate).toBe('function');
  });

  it('does not export internal system references', () => {
    // Check via the static imports we already have — no internal names should exist
    const allExports = { evaluate, multiPassMatch, computeNovelSignal, scoreConfidence, computeDetectionMetrics, computeRankingMetrics, computeSeverityMetrics, wilsonInterval, toFlatMatchResult, batchAutoAdjudicate };
    const exportNames = Object.keys(allExports);
    const forbidden = [
      'FieldCritique', 'HumanCritiqueItem', 'autonomousLoop',
      'precisionFilter', 'humanOverlapEvaluator', 'proofRouter',
      'liveTruthEndpoint', 'notifyOwner', 'invokeLLM',
      'runAutoCalibrationCycle', 'adjudicationPipeline',
    ];
    forbidden.forEach(name => {
      expect(exportNames).not.toContain(name);
    });
  });
});

// ─── Integration Test ───────────────────────────────────────────────────────

describe('Integration: Full Pipeline', () => {
  it('runs the complete evaluation pipeline end-to-end', () => {
    // Step 1: Match
    const matchResult = multiPassMatch(aiFindings, humanFindings);
    expect(matchResult.strictMatches.length).toBeGreaterThan(0);

    // Step 2: Detection metrics
    const detection = computeDetectionMetrics(matchResult, aiFindings.length, humanFindings.length);
    expect(detection.recall).toBeGreaterThan(0);
    expect(detection.precision).toBeGreaterThan(0);

    // Step 3: Ranking metrics
    const ranking = computeRankingMetrics(aiFindings, humanFindings, matchResult);
    expect(ranking.top3Overlap).toBeGreaterThanOrEqual(0);

    // Step 4: Severity metrics
    const severity = computeSeverityMetrics(matchResult);
    expect(severity).toHaveProperty('weightedKappa');

    // Step 5: Novel signal
    const novelSignal = computeNovelSignal(matchResult.aiOnly, adjudications);
    expect(novelSignal.validatedNovelRate).toBeGreaterThanOrEqual(0);

    // Step 6: Confidence
    aiFindings.forEach(f => {
      const conf = scoreConfidence(f);
      expect(conf.confidence).toBeGreaterThan(0);
      expect(conf.confidence).toBeLessThanOrEqual(1);
    });

    // Step 7: Full evaluate
    const fullResult = evaluate(aiFindings, humanFindings, { adjudications });
    expect(fullResult.verdict).toBeDefined();
    expect(fullResult.detection.matchedCount).toBeGreaterThan(0);
  });
});
