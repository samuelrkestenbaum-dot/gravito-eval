# Gravito Eval

**Measure how closely AI decisions match human judgment — and where they add new signal.**

```
npm install gravito-eval
```

```bash
npx gravito-eval run ./examples/basic
```

```
┌─────────────────────────────────────────────┐
│          Gravito Eval Results                │
└─────────────────────────────────────────────┘

  Verdict:  PASS

  Detection
  Recall:     ████████████████░░░░ 80.0%
  Precision:  █████████████░░░░░░░ 66.7%
  F1 Score:   ██████████████░░░░░░ 72.7%

  Match Breakdown
  Strict:         3
  Cross-category: 1
  Conceptual:     0

  Novel Signal
  Validated:  ████████████░░░░░░░░ 50.0%  STRONG
```

---

## What This Does

You have an AI system that produces findings — issues, recommendations, decisions. You also have human experts who reviewed the same inputs. **How aligned are they?**

Gravito Eval answers that question with a single function call:

```ts
import { evaluate } from "gravito-eval";

const result = evaluate(aiFindings, humanFindings);

result.detection.recall     // How much of what humans find does the AI catch?
result.detection.precision  // How much of what the AI finds is actually relevant?
result.detection.f1         // Harmonic mean of recall and precision
result.novelSignal          // What did the AI find that humans missed?
result.verdict              // PASS | PARTIAL | FAIL | INSUFFICIENT_DATA
```

---

## Why This Exists

Most AI evaluation tools measure **accuracy against a fixed ground truth**. But when the task is subjective — auditing a website, reviewing code, assessing risk — there is no single correct answer. Two human experts will disagree on 20-30% of findings.

Gravito Eval measures **alignment** instead of accuracy:

| Traditional Eval | Gravito Eval |
|---|---|
| Binary correct/incorrect | Multi-pass semantic matching |
| Single ground truth | Human baseline comparison |
| Ignores novel signal | Validates AI-only findings |
| One similarity threshold | 3-pass matching (strict → cross-category → conceptual) |

---

## Core Concepts

### Multi-Pass Matching

Not all matches are obvious. The AI might describe the same issue differently, categorize it under a different label, or split one human finding into multiple related observations.

Gravito Eval uses three matching passes:

1. **Strict Match** — Same category + high keyword similarity (>0.75)
2. **Cross-Category Match** — Different category but semantically equivalent (>0.80 similarity + category equivalence map)
3. **Conceptual Merge** — Multiple AI findings cluster around one human finding (concept-level alignment)

Each pass is greedy and one-to-one: once a finding is matched, it cannot be matched again.

### Novel Signal

AI-only findings (those not matched to any human finding) are not automatically "wrong." Some represent genuine issues that humans missed.

Gravito Eval adjudicates these findings:

- **VALID** — Genuine issue the humans missed
- **INVALID** — Incorrect or hallucinated finding
- **DUPLICATE** — Already covered by a matched finding
- **LOW_VALUE** — True but too minor to matter

The **validated novel rate** tells you what percentage of AI-only findings are genuinely valuable:

| Rate | Assessment |
|---|---|
| ≥40% | **DIFFERENTIATED** — AI finds things humans miss |
| 25-40% | **STRONG** — Meaningful additional signal |
| 15-25% | **MODERATE** — Some additional signal |
| <15% | **WEAK** — Mostly noise |

### Confidence Scoring

Each finding gets a confidence score (0-1) based on observable signals:

- Signal strength (how many data points support the finding)
- Cross-signal support (does specific evidence exist?)
- Pattern repetition (does this recur across the input?)
- Rule determinism (objective vs. subjective)
- Clarity of evidence (how detailed is the description?)

Nonlinear scaling spreads the distribution across the full 0.3-0.95 range instead of clustering at 0.6-0.7.

---

## Installation

```bash
npm install gravito-eval
# or
pnpm add gravito-eval
# or
yarn add gravito-eval
```

**Zero dependencies.** Pure TypeScript. Works in Node.js 18+.

---

## Usage

### Programmatic API

```ts
import { evaluate } from "gravito-eval";
import type { Finding } from "gravito-eval";

const aiFindings: Finding[] = [
  {
    id: "ai-1",
    description: "Missing alt text on hero image",
    category: "compliance",
    severity: "high",
    location: "Homepage",
    keywords: ["alt text", "accessibility", "image"],
  },
  // ... more findings
];

const humanFindings: Finding[] = [
  {
    id: "human-1",
    description: "Hero image lacks alt text for screen readers",
    category: "compliance",
    severity: "high",
    location: "Homepage",
    keywords: ["alt text", "accessibility"],
  },
  // ... more findings
];

const result = evaluate(aiFindings, humanFindings);
```

### With Human Adjudications

```ts
import { evaluate } from "gravito-eval";
import type { Adjudication } from "gravito-eval";

const adjudications: Adjudication[] = [
  {
    findingId: "ai-3",
    label: "VALID",
    reasoning: "Genuine issue the expert missed",
  },
  {
    findingId: "ai-4",
    label: "LOW_VALUE",
    reasoning: "True but too minor",
  },
];

const result = evaluate(aiFindings, humanFindings, { adjudications });

result.novelSignal?.validatedNovelRate  // Real human-validated rate
result.adjustedPrecision                // Accounts for valid novel signal
```

### CLI

```bash
# Run on a data file
gravito-eval run ./my-data.json

# Run on a directory (looks for data.json or ai-findings.json + human-findings.json)
gravito-eval run ./my-audit/

# JSON output for piping
gravito-eval run ./my-data.json --json
```

### Individual Modules

```ts
// Just matching
import { multiPassMatch } from "gravito-eval";
const matches = multiPassMatch(aiFindings, humanFindings);

// Just metrics
import { computeDetectionMetrics } from "gravito-eval";
const metrics = computeDetectionMetrics(matchResult, totalAI, totalHuman);

// Just confidence
import { scoreFindings } from "gravito-eval";
const scored = scoreFindings(aiFindings);

// Just novel signal
import { computeNovelSignal, batchAutoAdjudicate } from "gravito-eval";
const adjudications = batchAutoAdjudicate(aiOnlyFindings);
const signal = computeNovelSignal(aiOnlyFindings, adjudications);
```

---

## Data Format

### Finding

```ts
interface Finding {
  id: string;                    // Unique identifier
  description: string;           // What the issue is
  category: string;              // Issue category
  severity: "low" | "medium" | "high" | "critical";
  location?: string;             // Where in the system/page
  keywords?: string[];           // Matching hints (optional but improves accuracy)
}
```

### Categories

Built-in category equivalence map for cross-category matching:

| Category | Equivalent To |
|---|---|
| `trust` | content, conversion |
| `content` | trust, navigation |
| `navigation` | conversion |
| `visual_hierarchy` | conversion, content |
| `conversion` | trust |
| `compliance` | trust |
| `performance` | conversion |

Custom categories work too — they just won't benefit from cross-category matching.

### Adjudication

```ts
interface Adjudication {
  findingId: string;             // ID of the AI-only finding
  label: "VALID" | "INVALID" | "DUPLICATE" | "LOW_VALUE";
  reasoning?: string;            // Why this verdict
}
```

---

## Output

The `evaluate()` function returns:

```ts
interface EvalResult {
  detection: {
    recall: number;              // 0-1
    precision: number;           // 0-1
    f1: number;                  // 0-1
    matchedCount: number;
    totalAI: number;
    totalHuman: number;
  };
  ranking: {
    top3Overlap: number;         // 0-1
    top5Overlap: number;         // 0-1
    spearmanCorrelation: number; // -1 to 1
  };
  severity: {
    weightedKappa: number;       // -1 to 1
    meanAbsoluteError: number;   // 0-3
    distribution: Record<string, { ai: number; human: number }>;
  };
  matchBreakdown: {
    strict: number;
    crossCategory: number;
    conceptual: number;
  };
  novelSignal?: {
    totalAiOnly: number;
    validCount: number;
    invalidCount: number;
    duplicateCount: number;
    lowValueCount: number;
    validatedNovelRate: number;
    systemStrength: "WEAK" | "MODERATE" | "STRONG" | "DIFFERENTIATED";
  };
  adjustedPrecision?: number;
  verdict: "PASS" | "PARTIAL" | "FAIL" | "INSUFFICIENT_DATA";
}
```

---

## Examples

Three examples are included:

| Example | Use Case | AI | Human | Adjudications |
|---|---|---|---|---|
| `basic` | Simple website accessibility audit | 6 | 5 | Auto |
| `website-audit` | Full website UX/trust audit | 12 | 8 | 4 human |
| `agent-eval` | AI code review agent evaluation | 8 | 6 | 3 human |

Run any example:

```bash
gravito-eval run ./examples/basic
gravito-eval run ./examples/website-audit
gravito-eval run ./examples/agent-eval
```

---

## Architecture

```
gravito-eval/
├── src/
│   ├── index.ts              # Barrel exports
│   ├── types.ts              # All type definitions
│   ├── calibration/          # Main evaluate() entry point
│   ├── matching/             # 3-pass semantic matcher
│   ├── metrics/              # Detection, ranking, severity metrics
│   ├── adjudication/         # Novel signal validation
│   └── confidence/           # Finding confidence scoring
├── cli/
│   └── index.ts              # CLI entry point
└── examples/
    ├── basic/                # Simplest use case
    ├── website-audit/        # Realistic audit with adjudications
    └── agent-eval/           # AI agent evaluation
```

---

## Use Cases

**Website/UX Auditing** — Compare AI-generated audit findings against expert UX reviews. Measure how much of the expert's assessment the AI captures, and what additional signal it provides.

**Code Review** — Evaluate AI code review agents against human reviewer findings. Track alignment over time as the agent improves.

**Content Moderation** — Compare AI moderation decisions against human moderator labels. Identify where the AI is too aggressive or too lenient.

**Risk Assessment** — Measure alignment between AI risk flags and human analyst assessments. Validate that AI-only flags represent genuine risks.

**Any AI-vs-Human Comparison** — Any domain where an AI system produces findings that can be compared against human expert judgment.

---

## License

MIT

---

Built by [Gravito](https://gravitoai.com). Extracted from the Gravito governance engine.
