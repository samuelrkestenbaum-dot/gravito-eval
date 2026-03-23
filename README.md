# Gravito Eval

Scan any website. See what's wrong, what's missing, and what a human reviewer would miss.

```
npx gravito-eval scan https://stripe.com
```

---

## What You Get

```
  Scanning https://stripe.com

  ◐ Fetching page content (2s)
  ◑ Running content analysis (4s)
  ◉ Analysis complete (32s)

  Gravito Eval Results
  ──────────────────────────────────────────────────

  Score:  57/100  🔴 F Grade
  Site:   https://stripe.com
  Title:  Stripe | Financial Infrastructure to Grow Your Revenue

  █████████████████░░░░░░░░░░░░░  57%

  vs Fintech & Financial Services: top 52% (avg: 58)

  Key Issues
  ──────────────────────────────────────────────────

  HIGH  Unsubstantiated Claim
  → "50% of" — no source, no verification
  Fix: Add a verifiable source or rephrase as a qualified statement

  HIGH  Unsubstantiated Claim
  → "100% of" — percentage claim without citation
  Fix: Add a verifiable source or rephrase as a qualified statement

  MEDIUM  Banned Vocabulary
  → "cutting edge" — vague marketing language
  Fix: Replace with specific, measurable language

  ──────────────────────────────────────────────────
  Share: https://gravito.ai/try/report/a1b2c3d4

  Analyzed in 32.0s · Gravito Engine (Live) · 4 issues found
```

Every scan produces a shareable link.

---

## Compare Two Sites

```bash
npx gravito-eval compare stripe.com github.com
```

```
  Gravito Eval — Comparison
  ──────────────────────────────────────────────────

  ✓ stripe.com: 57/100 🔴
  ✓ github.com: 89/100 🟡

  Head-to-Head
  ══════════════════════════════════════════════════

  stripe.com
  █████████████████░░░░░░░░░░░░░  57/100 🔴 F

  github.com
  ██████████████████████████░░░░  89/100 🟡 B

  Winner: github.com (+32 points over stripe.com)

  Key Differences
  ──────────────────────────────────────────────────

  Only stripe.com has:
    HIGH Unsubstantiated Claim
    MEDIUM Banned Vocabulary

  Both sites have:
    ~ Missing Disclaimers
```

Compare your site to a competitor. See who's doing better and why.

---

## Try It

```bash
npx gravito-eval scan https://stripe.com
npx gravito-eval scan https://openai.com
npx gravito-eval scan https://your-site.com
```

No install. No API keys. No setup.

---

## Demo Mode

See a walkthrough with explanations:

```bash
npx gravito-eval demo
```

---

## What This Does

Gravito Eval analyzes a real website and shows:

- What issues a content reviewer would flag
- What additional problems most reviewers miss
- How your site compares to others in your industry

It runs the same engine that powers [Gravito](https://gravito.ai).

---

## Why This Is Different

Most tools tell you **what** is wrong.

Gravito Eval tells you:

- **How aligned** your content is with quality best practices
- **Where it disagrees** with what a human reviewer would flag
- **Whether those disagreements are valuable** — sometimes the AI catches things humans miss

---

## Use Cases

| Use Case | What You Get |
|---|---|
| **Scan your landing page** | Quality score, issues, fixes, industry benchmark |
| **Compare to competitors** | Side-by-side analysis with `compare` command |
| **Evaluate LLM outputs** | Alignment metrics, novel signal detection |
| **Compare prompts** | Run the same content through different prompts, compare scores |
| **QA AI features** | Check if your AI-generated content meets quality standards |

---

## Local Evaluation Mode

Already have findings from your own AI system? Compare them against a human baseline:

```bash
npx gravito-eval run ./my-findings.json
```

Input format:

```json
{
  "aiFindings": [
    {
      "id": "ai-1",
      "description": "Hero section uses unsubstantiated claim",
      "category": "trust",
      "severity": "high"
    }
  ],
  "humanFindings": [
    {
      "id": "human-1",
      "description": "Misleading statistic in hero",
      "category": "trust",
      "severity": "high"
    }
  ]
}
```

Output:

```
  Recall:     75%
  Precision:  50%
  F1:         60%
  Top-3 Agreement: 100%
  Novel Signal:    67% (validated)

  ✓ Strong alignment with human judgment
  ◆ AI found significant issues humans missed
  Verdict: PASS
```

Add `--explain` for detailed match reasoning. Add `--json` for raw output.

---

## How It Works

```
URL → Fetch Content → Content Analysis → Industry Benchmark → Score + Issues + Fixes
                            ↓
                  5 analysis frameworks:
                  • Claim verification
                  • Vocabulary compliance
                  • Disclosure detection
                  • Pattern recognition
                  • Brand consistency
```

The analysis runs server-side on the Gravito engine. No local LLM required.

---

## CLI Reference

```
gravito-eval scan <url>                     Scan a live URL
gravito-eval compare <url1> <url2>          Compare two sites side-by-side
gravito-eval scan <url> --json              Output raw JSON
gravito-eval demo                           See a demo with explanations
gravito-eval run <path>                     Evaluate local findings
gravito-eval run <path> --explain           Show detailed match reasoning
gravito-eval run <path> --json              Output raw JSON
gravito-eval --help                         Show help
gravito-eval --version                      Show version
```

---

## Requirements

- Node.js 18+
- Internet connection (for `scan` and `compare` commands)

---

## Telemetry

Anonymous usage data (timestamp, version, command name) is collected to improve the tool. No findings, file paths, or PII.

Disable: `GRAVITO_TELEMETRY=0 gravito-eval run ./data` or set `DO_NOT_TRACK=1`.

---

## Programmatic API

```typescript
import { evaluate } from "gravito-eval";

const result = evaluate(aiFindings, humanFindings);

result.detection.recall     // How much of what humans find does the AI catch?
result.detection.precision  // How much of what the AI finds is actually relevant?
result.detection.f1         // Harmonic mean
result.novelSignal          // What did the AI find that humans missed?
result.verdict              // PASS | PARTIAL | FAIL | INSUFFICIENT_DATA
```

---

## Continuous Monitoring

Want this running continuously on your site?

[Gravito](https://gravito.ai) provides always-on monitoring, automated alerts, and team dashboards.

---

MIT License
