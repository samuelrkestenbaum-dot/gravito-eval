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

Point it at any URL. It scans the page and tells you:

- What a content reviewer would flag
- What most reviewers would miss
- How your site stacks up against others in your industry

Same engine that powers [Gravito](https://gravito.ai).

---

## Why This Is Different

Most tools tell you **what** is wrong.

Gravito Eval also tells you:

- **How your site compares** to others in your industry
- **What a human reviewer would catch** — and what they'd miss
- **Whether the AI's extra findings are useful** — sometimes it catches things humans don't

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
Your URL → Fetch page → Analyze content → Compare to industry → Score + Issues + Fixes
```

Gravito checks your site for:
- Unverified claims ("trusted by 10,000+ teams" with no source)
- Vague marketing language ("cutting edge", "best in class")
- Missing disclosures (AI usage, cookies, data handling)
- Inconsistent messaging across sections
- Issues that human reviewers typically miss

The analysis runs server-side. No local LLM required.

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

## CI/CD Integration

Add content quality checks to your pipeline:

```yaml
# .github/workflows/gravito-eval.yml
name: Content Quality Check
on: [pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Scan site
        run: npx gravito-eval scan https://your-site.com --json > report.json
      - name: Check threshold
        run: |
          SCORE=$(node -e "const r = require('./report.json'); console.log(r.overallScore || 0)")
          if [ "$SCORE" -lt 50 ]; then exit 1; fi
```

Fail PRs that drop your content quality below a threshold.

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

[Gravito](https://gravito.ai) monitors your site automatically and alerts you when new issues appear.

---

MIT License
