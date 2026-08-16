# Pricing

Why the plans are what they are, why the billing system is built the way it is,
and what the model has to do for this to be a business.

Every number below is either measured against the code that spends the money, or
labelled as an assumption. The distinction matters: the measured numbers are
facts about this system, and the assumed ones are the parts most likely to be
wrong.

---

## 1. What an action actually costs

Pricing starts here rather than at the market, because a plan priced below its
own inference cost is worse than having no plan.

### One chat answer

Counted from the calls `retrieval/pipeline.ts` and `retrieval/corrective.ts`
actually make, at published API rates:

| Stage | Model | Cost |
| --- | --- | --- |
| Query translation + HyDE | gpt-4.1-nano ×2 | $0.00013 |
| Routing | gpt-4.1-nano | $0.00003 |
| Embedding ~5 variants | text-embedding-3-small | $0.000004 |
| Rerank | Cohere rerank-v3.5 | **$0.0020** |
| Context grading | gpt-4.1-mini | $0.0018 |
| Generation | gpt-4.1-mini | $0.0028 |
| Answer grading | gpt-4.1-mini | $0.0020 |
| **Total, one retrieval round** | | **≈$0.009 (₹0.80)** |

The corrective loop can run up to `CRAG_MAX_RETRIES + 1` = 4 rounds. Rerank,
grading, translation and routing repeat each round; generation and answer grading
do not. So:

- **1 round → ₹0.80**
- **4 rounds → ₹1.85**

Two things worth noticing. **Generation is under a third of the bill** — the
expensive part of this product is deciding *what to answer from*, not writing the
answer. And **answer grading costs ₹0.17 (21%) while being purely diagnostic**:
it runs after the stream and no reader ever waits for it. Sampling it is the
cheapest cost reduction available.

### Everything else

| Action | Cost | Note |
| --- | --- | --- |
| Ingest a 50-page PDF | ≈$0.0005 (₹0.05) | Embedding is nearly free. The real cost is the storage it occupies from then on. |
| Generate a podcast | **≈₹25** | Sarvam TTS. `config/env.ts` notes ₹1,000 of credit ≈ forty episodes. |
| Generate a roadmap | ≈₹2.40 | One generation over the whole notebook. |
| Store one source | ≈453MB | 30MB Postgres + 3MB Qdrant + 14×30MB of backup retention. Retention dominates. |

**A podcast costs 25× a chat answer.** That single ratio drives most of the
design below.

---

## 2. Why credits rather than seats or usage billing

Three models were possible.

**Pure subscription with soft limits** is the easiest to sell and the easiest to
lose money on: one user generating fifty podcasts costs ₹1,250 against ₹399 of
revenue, and nothing stops them.

**Pure usage billing** matches cost perfectly and is hostile to the buyer. A
non-technical person deciding whether to upload their document should not have to
model what the answer will cost.

**A subscription that grants credits** — what this does — keeps the predictable
monthly price people want to buy, while making the expensive action visibly
expensive and, crucially, **bounding the loss**. Credits are a hard cap. The
worst a subscriber can cost is their entire allowance, which is a number decided
in advance rather than discovered on a bill.

The unit was chosen to be legible: **one credit is one chat answer**, because
that is the action people count. Every other weight is that action's real cost
expressed in the same unit.

| Action | Credits | Why |
| --- | --- | --- |
| Chat answer | 1 | The unit. |
| Ingest a source | 1 | Not compute — the storage it holds from then on. |
| Roadmap | 3 | One generation over a whole notebook. |
| Podcast | 25 | Its actual cost ratio. Rounding this down would be the fastest way to lose money. |

These weights live in `src/billing/costs.ts`, separate from prices. Weights are
about cost; prices are about the market. Conflating them is how a price change
silently breaks the margin on one action.

---

## 3. Why these three tiers, at these prices

### The market

| Product | Price | Notes |
| --- | --- | --- |
| NotebookLM Plus | $4.99/mo (≈₹440) | Cut from $7.99 in June 2026. Only sold inside Google AI Plus. |
| Humata | $1.99 student / $9.99 pro | Charges per page. |
| AskYourPDF | $11.99–14.99/mo | Billed yearly. |

For the Indian consumer market the researched picture is different from the
dollar tools: the affordability band is **₹200–300/month**, entry SaaS sits at
**₹299–499**, and mid-tier at **₹999–1,999**. A $20/month tool reads as ₹2,000
after tax, which is out of the question for a consumer product.

**NotebookLM Plus at ≈₹440 is the anchor**, because it is the comparison an
Indian buyer actually makes. Not AskYourPDF.

### The plans

| | Free | Plus | Pro |
| --- | --- | --- | --- |
| Price | ₹0 | **₹399/mo** | **₹999/mo** |
| Credits | 25 | 250 | 600 |
| Notebooks | 2 | 15 | 100 |
| Sources per notebook | 5 | 100 | 500 |
| Storage | 25 MB | 2 GB | 10 GB |
| Podcasts | ✗ | ✓ | ✓ |

**Plus at ₹399** sits just under the NotebookLM anchor and inside the entry band.
**Pro at ₹999** is the bottom of the mid-tier band and reads as ≈$11, comparable
to AskYourPDF.

The credit counts are **derived from the cost model, not chosen for how generous
they sound**. 250 credits cost ≈₹200 at the typical rate, leaving real margin;
even if every one of those answers ran the corrective loop to exhaustion the
exposure is bounded at ≈₹463, because credits are a cap rather than a guideline.

### The margin, honestly

At **100% credit consumption**:

| | Price | Credits | Typical cost | Net @ typical | Net @ worst case |
| --- | --- | --- | --- | --- | --- |
| Free | ₹0 | 25 | ₹20 | −₹20 | −₹46 |
| Plus | ₹399 | 250 | ₹200 | **+₹189** | **−₹73** |
| Pro | ₹999 | 600 | ₹480 | **+₹495** | **−₹135** |

**Worst case is loss-making on both paid tiers.** This is stated plainly because
it is the weakest part of the model. It requires *every* question to fail the
context grader three times — a realistic blend of a quarter of questions going
full depth lands near ₹1.06/answer, leaving Plus at ≈+₹124.

Two things bound it: credits cap exposure at −₹73/−₹135 per user, and
`CRAG_WALL_CLOCK_MS=15000` often prevents the fourth round from finishing.

The fix, when there is data, is `CRAG_MAX_RETRIES`. `retrieval_runs` already
records `retry_count` and per-round `context_grade`, so the question "do rounds 3
and 4 actually help?" is a SQL query, not a guess. See `FUTURE-CHECKS.md`.

### Why Free is small

25 credits is enough to add a document and have a real conversation about it,
which is the only thing a free tier has to prove. It is also the entire exposure:
a free account cannot cost more than 25 answers.

**Podcasts are off entirely on Free** — not rate-limited, off. One episode costs
₹25, which is more than the whole free allowance. A tier that offered the action
and then refused it would be worse than not offering it, so `plans.ts` asserts at
startup that no plan allows podcasts it cannot afford.

---

## 4. How the billing system is built, and why

### Plans in code, balances in the database

Plans are product decisions that ship with a deploy, so they live in
`src/billing/plans.ts` rather than a table. A database row that disagreed with
the code would be the worst of both.

What is *not* in code is what a person was actually granted. Every grant is a
ledger row, so changing a plan's credits changes what **future** periods grant
and never rewrites what somebody already had.

`planFor()` falls back to Free for an unknown code rather than throwing: a
subscription naming a retired plan should leave someone on the free tier, not
take down every request they make.

### The ledger is append-only

`credit_ledger` is never updated and never deleted. A running-balance column
would be faster and would eventually be wrong; the balance is `sum(delta)` for
the period, which cannot drift from the entries because it **is** the entries.

When somebody asks where their credits went, the answer is a query rather than an
apology.

### Credits do not roll over, and expiry needs no job

Every row is scoped to `periodStart`. A new period simply sums a different set of
rows — no expiry sweep, no scheduled job, nothing to fail silently at 3am.

### Grants are lazy

The period's credits are written the first time an entitlement is read, not by a
scheduler. No cron to miss, and a user who does not come back this month costs
nothing to keep. Idempotent through the ledger's unique index, so calling it on
every request is safe.

### Double-charging is prevented by the database

`unique(user_id, reason, ref_type, ref_id)`. Ingestion retries three times
(`queues/index.ts`) and Razorpay redelivers webhooks; a check-then-insert would
let both through under concurrency. A repeat charge returns `charged: 0` and is
allowed to proceed, because it is the same work.

### Spending is serialised per user

Reading a balance and spending against it is a read-modify-write. Two concurrent
requests would both see enough credit and both spend it. `spendCredits` holds
`pg_advisory_xact_lock(hashtext(user_id))` for the transaction — keyed on the
user, so it never blocks anybody else.

### Charge before the work, refund on failure

An expensive action must not be startable by someone who cannot afford it. Work
that then fails is refunded rather than never charged, because the alternative is
trusting every failure path to remember.

### PAST_DUE keeps full entitlements

A card that fails on a Tuesday should not lock somebody out of a document they
are halfway through. The downgrade happens when the period actually ends.

---

## 5. Razorpay

**Only the webhook grants a plan.** `/api/billing/checkout` creates the
subscription and grants nothing. The browser reporting a successful payment is a
claim by an untrusted party; the signed webhook is the provider's own word. A
user who closes the tab mid-payment therefore gets nothing, which is correct and
is why this cannot be spoofed.

**The webhook is mounted before `express.json()`**, with a raw body parser. The
signature is an HMAC over the exact bytes sent; re-serialising parsed JSON changes
key order and whitespace and would never match. This is the most common way this
integration silently breaks.

**Signatures compare with `timingSafeEqual`.** A string comparison exits at the
first differing byte, leaking how much of a guess was right.

**`subscription.charged` and `subscription.activated` share a branch**, because
`charged` fires on the first payment *and* every renewal. One branch means a
renewal cannot be forgotten.

**Everything returns 200 once the signature is valid**, including ignored events.
A non-2xx makes Razorpay retry, and retrying a deliberately ignored event
achieves nothing.

**No SDK.** The official client wraps three REST calls and an HMAC comparison.
Doing it directly keeps the one security-critical part visible in this repository
rather than behind a version bump.

**Shared account.** Credentials are shared with another product. Razorpay filters
webhooks by event type, not by product, so this endpoint receives the other
product's subscription events too. Every subscription is stamped
`notes.product = "pragatilm"` and anything else is dropped at debug level — on a
shared account that is the normal case, and logging it as an error would bury the
events that are genuinely wrong.

---

## 6. Revenue model

### Per-user economics

Assuming **60% average credit consumption** (an assumption, and the one most
worth measuring) and an **80/20 Plus/Pro mix**:

| | Plus | Pro | Blended |
| --- | --- | --- | --- |
| Price | ₹399 | ₹999 | ₹519 |
| Less Razorpay ≈2.4% | ₹389 | ₹975 | ₹506 |
| COGS @ 60% use | ₹120 | ₹288 | ₹154 |
| **Gross per user/month** | **₹269** | **₹687** | **₹352** |
| Gross margin | 69% | 70% | **70%** |

A free user consuming a median 6 credits costs ≈**₹5/month**.

### Five-year scenarios

**These are scenarios, not forecasts.** They model what the pricing does at
various scales; they say nothing about whether that scale is achievable. Every
input is an assumption.

Base case — conversion improving from 3% to 5% as the product matures:

| Year | Registered | Conv. | Paying | Revenue/yr | Free COGS/yr | Paid COGS/yr | **Gross profit/yr** |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 5,000 | 3.0% | 150 | ₹9.1L | ₹2.9L | ₹2.8L | **₹3.2L** |
| 2 | 20,000 | 3.5% | 700 | ₹42.5L | ₹11.6L | ₹12.9L | **₹17.4L** |
| 3 | 60,000 | 4.0% | 2,400 | ₹1.46Cr | ₹34.6L | ₹44.4L | **₹64.4L** |
| 4 | 120,000 | 4.5% | 5,400 | ₹3.28Cr | ₹68.8L | ₹99.8L | **₹1.53Cr** |
| 5 | 250,000 | 5.0% | 12,500 | ₹7.59Cr | ₹1.43Cr | ₹2.31Cr | **₹3.71Cr** |

Conservative (half the users, conversion flat at 3%) lands near **₹1.2Cr gross
profit** in year 5. Optimistic (double, conversion 6%) near **₹9Cr**.

### The finding that matters most

**In year 1, free users cost more than paying users do** — ₹2.9L against ₹2.8L.
At low conversion the free tier is the dominant cost, not the paid one, and it
stays around 20% of revenue even at year 5.

This is why the free tier is 25 credits and not 50, and it is the first thing to
tighten if margin comes under pressure. It is also why the cheapest levers —
MMR instead of Cohere rerank on free, fewer CRAG rounds on free — are aimed at
free users specifically.

### What is not in these numbers

Gross profit only. **No salaries, marketing, support, or customer acquisition
cost.** CAC is the largest omission: at ₹399/month with an assumed 12-month
lifetime, LTV is roughly ₹3,200 net of COGS, so paid acquisition only works below
roughly ₹1,000 per paying customer — which for a 3%-converting funnel means under
₹30 per registration. That is demanding for paid channels and points at organic
and content as the realistic route.

Also excluded: GST, refunds and chargebacks, and any price changes.

---

## 7. What would change all of this

**Model prices falling.** Inference costs have fallen consistently and are the
dominant COGS. A halving pushes blended margin from 70% to ≈85% with no price
change. This is the most likely surprise, and it is a good one.

**Cheaper reranking.** Cohere is ₹0.18 of every answer — 22% of a typical one and
the single largest line item after generation. A self-hosted cross-encoder would
remove it at the cost of running a model.

**Annual billing.** Not implemented. Usually 15–20% of revenue at a 2-month
discount, and it improves cash flow and churn simultaneously. The cheapest
un-built lever here.

**Conversion.** Every scenario above is far more sensitive to conversion than to
price. Moving 3% → 6% doubles revenue; moving ₹399 → ₹499 adds 25% and risks the
affordability band. **Work on the funnel before the price.**

---

## 8. Open questions

- **Credit consumption is assumed, not measured.** 60% for paid, 6 credits median
  for free. Both need real data; both move the model materially.
- **`CRAG_MAX_RETRIES` is unresolved.** See `FUTURE-CHECKS.md`.
- **No annual plan.**
- **No trial of the paid tier.** A time-limited Plus trial may convert better
  than a permanently small free tier, and would cost less to run.
- **Refunds are not wired to job failure yet**, so a failed podcast currently
  keeps its 25 credits.
