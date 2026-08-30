# What Forge can realistically earn

Written against 2026 benchmark data, not optimism. Every figure has a source at
the bottom. Where the honest answer is "nobody publishes that", it says so
rather than inventing a number.

The short version: **a realistic first year is a few thousand dollars, not a
salary.** That is not a criticism of the app — it is what the distribution
looks like. The median subscription app is earning about $72 a month one year
after launch, and only 17% ever reach $1,000 a month within two years. Knowing
that up front is what lets you make good decisions about how much to spend
chasing it.

---

## The numbers that drive everything

| Input | Value | Why this one |
|---|---|---|
| Free→paid conversion | **1.5%** | Freemium median is 2.1% across categories; Health & Fitness runs a little higher; an app with no brand runs lower. The widely-quoted 2.9% H&F figure is inflated by hard-paywall apps and is not yours. |
| Monthly first renewal | **57%** | H&F median. Nearly half of monthly subscribers leave after one cycle. |
| Annual first renewal | **25%** | H&F median. Three quarters do not renew. |
| 12-month retention, AI apps | **21% annual / 6% monthly** | AI apps churn ~30% faster than non-AI and carry 20% higher refund rates. Forge's headline feature is an AI coach, so these are the numbers that apply, not the general ones. |
| Price | **$9.99/mo, $59.99/yr** | Category medians are $9.99 and $39.99. |
| Apple's cut | **15%** | Small Business Program, under $1M/year. Apply on day one. |
| AI cost per paying user | **~$0.30/mo** | ~$0.015 per coach answer, ~$0.07 per program build, at Forge's Pro limits and realistic usage. |

---

## Year one, three ways

The only variable that really moves is downloads. Everything else is category
physics.

### Pessimistic — 1,500 downloads

About the median for a new app with no marketing. ~23 subscribers acquired
across the year, roughly 15 still paying at month 12.

**Gross ≈ $1,150 · net after Apple and AI ≈ $950**

### Realistic — 5,000 downloads

Three to four times the median. Needs a real off-store channel: a community, a
subreddit, TikTok, word of mouth from the athletes already using the Sheets
version. ~75 subscribers acquired, **~48 still paying at month 12**.

**Gross ≈ $3,600 · net ≈ $2,800**

### Optimistic — 20,000 downloads

Requires something to actually work — a video that lands, a niche you own
(hybrid strength + endurance is a real, underserved one), or press. ~300
subscribers acquired, ~190 paying at month 12.

**Gross ≈ $14,000 · net ≈ $11,500**

**Do not read month 12 as a run rate.** It is the high-water mark: annual
subscribers bought in months 1–12 are all still inside their term, and over a
third have already switched auto-renew off. In the realistic case, month 18 is
roughly **30–35 subscribers**, not 48. The second year starts by re-earning the
first.

---

## Three things this changes

### 1. Paid acquisition does not work at these numbers

Apple Search Ads for Health & Fitness runs $3.00–$3.85 per install. At 1.5%
conversion that is **~$233 to acquire one paying subscriber**, against a
first-year value of about **$36**. That is six to seven times underwater. Even
at hard-paywall conversion rates it only reaches break-even.

Growth has to be organic or it does not happen. And organic App Store traffic
is 65% search — an app that ranks nowhere gets essentially nothing from it. The
downloads come from wherever you build an audience, not from the store.

### 2. The paywall shape is worth more than the price

The single largest lever in the data:

| Model | Download→paid |
|---|---|
| Freemium (Forge today) | 2.1% |
| Hard paywall | **10.7%** |

Five times. Revenue per install: $0.38 versus $3.09.

But there is a real tension, and it is not a close call to dismiss: among AI
apps specifically, freemium is *more* common among the high-retention ones. A
hard paywall buys subscribers who leave; freemium buys fewer who stay.

**What I would actually do:** keep logging free forever — it is the app's
promise and its moat, and it is what makes someone import three years of
training. But put Forge Pro behind a **7-day free trial with a card**, not a
usage meter. Trial-to-paid in Health & Fitness is 37.7%, and trials convert 52%
better in AI apps. That captures most of the hard-paywall lift without breaking
the thing that makes Forge worth keeping.

That is the decision worth agonising over. Not the price.

### 3. The free tier had to be capped, and now is

Before this pass, both AI endpoints were completely unmetered. At 1.5%
conversion each paying subscriber carries about 65 free accounts — so an
uncapped free tier is a bill that grows with success and never converts. At the
old proposed limits a maxed-out free account could spend $0.90 a month against
$8.50 of net revenue per subscriber; the tier would have gone underwater at
scale.

The shipped limits (3 coach questions/day, 30/month; 2 program builds/month)
cap a maxed free account near **$0.59** — enough to prove the coach is real,
cheap enough that growth is not a liability. They live in `ai_quota_limits` and
can be tuned with one SQL statement once real usage is visible.

---

## Seasonality

January is the whole game in fitness. Installs run about **+34% above average**
in January and **+36% over December**, then decay through spring — May sits
roughly 44% below the January peak.

Practically: **be in the store, stable, with screenshots you are proud of, by
mid-December.** Shipping in February costs you the single best month of the
year and you wait eleven months for another.

---

## What would have to be true to make this a business

Not predictions — thresholds, so you can tell early whether it is working.

- **~1,400 paying subscribers** for $10K/month net. That is the "this is a job"
  line, and about 4.6% of apps reach it within two years.
- **~140 subscribers** for $1K/month — meaningful side income, reached by about
  17% of apps.
- Conversion **above 2%** would say the product is unusually compelling for the
  category. Below 1% says the paywall or the value story is wrong, not the app.
- Monthly first-renewal **above 57%** says Forge is stickier than its category,
  which for a training log it genuinely could be — a log with your history in
  it is far harder to leave than a workout-generator.

That last point is the real asset. Most AI apps churn because the novelty
fades. Forge accumulates something the athlete cannot get back if they leave.
Every month of logged history makes the app harder to abandon, and that is the
one advantage worth building the roadmap around.

---

## Sources

- [RevenueCat, State of Subscription Apps 2026](https://www.revenuecat.com/state-of-subscription-apps) — 115,000+ apps, $16B revenue. Conversion, retention, RPI, revenue distribution.
- [RevenueCat, renewal rates by category](https://www.revenuecat.com/blog/growth/average-subscription-renewal-rates-by-app-category)
- [RevenueCat, AI app retention study](https://www.revenuecat.com/blog/growth/ai-app-retention-study) — 3,519 AI apps.
- [TechCrunch, AI apps struggle with long-term retention](https://techcrunch.com/2026/03/10/ai-powered-apps-struggle-with-long-term-retention-new-report-shows)
- [Adapty, Health & Fitness subscription benchmarks](https://adapty.io/blog/health-fitness-app-subscription-benchmarks/)
- [AppTweak, Apple Ads benchmarks](https://www.apptweak.com/en/aso-blog/apple-ads-benchmarks) and [Adapty, Apple Ads benchmarks 2026](https://adapty.io/blog/apple-ads-benchmarks-2026/)
- [Adjust, health tracker installs and retention](https://www.adjust.com/blog/health-tracker-installs-and-retention-data/) — January seasonality (2023 data; the shape holds, the exact magnitudes are dated).
- [Apple Small Business Program](https://developer.apple.com/app-store/small-business-program/)
- [OpenAI API pricing](https://openai.com/api/pricing/)

**One thing nobody publishes:** what share of a fitness app's free users ever
use an AI feature more than once. It is the number that would most sharpen the
free-tier maths, and it does not exist publicly. The closest proxy is that AI
feature stickiness in North America runs about 21% DAU/MAU with engagement
depth falling year over year — which suggests a lot of people try it once. Your
own `ai_usage` table will answer this properly within a month of launch, and it
is worth looking at before tuning anything.
