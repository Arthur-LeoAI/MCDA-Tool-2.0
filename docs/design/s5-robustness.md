# S5 design note: robustness analysis (Monte Carlo)

- Status: done
- Based on: PRD F5.1, F5.2; technical design §2.6, §3.3

## Problem

Weight stability intervals change the weight of only one criterion at a time. What users really want to know is: **if all the weights are somewhat uncertain, does the recommended alternative still hold up?** S5 answers this with a Monte Carlo simulation. The project model already has the `analysis.robustness` settings (`mode`, `spread`, `samples`, `seed`); S5 puts them to use.

## Calculation

The value matrix V (eligible alternatives × criteria) is fixed first, and only the **final criterion weights** w vary randomly. With groups, the final weights are perturbed directly, not each level separately.

**Two sampling modes**:
- `around` ("around the current weights", default): w'_j = w_j · exp(σ · z_j), where z_j follows the standard normal distribution and σ = `spread` (default 0.2), then normalized to sum to 1. Criteria with weight 0 stay at 0.
- `unknown` ("weights completely unknown"): sample Dirichlet(1, …, 1) over the criteria with weight greater than 0, i.e. sample uniformly over all weight combinations. Criteria with weight 0 still do not take part.

**For each sample**:
- Compute the weighted sum S = W · Vᵀ (N samples × m alternatives);
- Ranks use competition ranking: the rank of alternative i = 1 + the number of alternatives whose score is **clearly** higher;
- Differences of at most 1e-9 count as ties, consistent with the rule in the calculation methods.

**Output**:
- Rank acceptability: the share of samples in which each alternative is ranked 1 … m;
- Probability of being first: a tie for first also counts;
- Mean rank;
- Pairwise win rates: P(S_i > S_j); ties do not count as wins;
- The **confidence** of the alternative ranked first under the current weights: P(first) ≥ 0.8 is "high", 0.5–0.8 is "medium", < 0.5 is "low". This is a rule defined by this product, not a standard from the literature; the UI always shows the probability alongside it.

**Implementation**:
- Samples are processed in batches of 1000; NumPy compares all alternative pairs in a batch at once, producing ranks and win rates together, with bounded memory use;
- Random numbers use `numpy.random.default_rng(seed)`; the same seed gives the same result;
- The sample count is 100–20 000 (already constrained in the model).

## API

`POST /api/v1/projects/robustness` (parameter: project; settings taken from `analysis.robustness`) returns:

- Settings: `mode`, `spread`, `samples`, `seed`;
- `alternatives`: for each eligible alternative, `id`, `name`, `rank_probabilities` (length m; item r is the probability of rank r), `p_best`, `mean_rank`; sorted by mean rank;
- `pairwise`: `wins[i][j]` = P(i beats j), in the same order as `alternatives`;
- `confidence`: the `id`, `p_best` and `level` of the current first place.

It is a separate endpoint because it is slower than the other calculations (technical design §4).

## Frontend

On the "Sensitivity analysis" page, a "Robustness (Monte Carlo)" card is added below the stability intervals:

- **Settings**:
  - Sampling mode: around the current weights / weights completely unknown;
  - Spread (shown only for "around"): 10%–100%;
  - Number of samples: 1000, 5000, 20 000;
  - Random seed;
  - The settings are saved in the project, and changes trigger automatic recalculation.
- **Confidence**: the current first place, its probability of being first, and the level.
- **Rank distribution**: stacked bar chart, one row per alternative, colors showing the probability of rank 1, 2, 3 ….
- A list of the **probability of being first** and the mean rank.
- **Pairwise win rates**: heat map. With too many alternatives only the 12 with the best mean rank are shown, and the UI says so.

The robustness part of the results report is left to S6.

## Verification

- Backend unit tests:
  - A fixed seed is reproducible; different seeds give different results;
  - In `unknown` mode the mean weight is about 1/n;
  - In `around` mode criteria with weight 0 stay at 0, and the mean weights are close to the current weights;
  - A dominated alternative is never ranked first;
  - Each row and each column of the rank probabilities sums to 1 (when there are no ties);
  - Ties for first all count as first;
  - Pairwise win rates: wins[i][j] + wins[j][i] + P(tie) = 1.
- Performance test: 100 alternatives × 20 criteria with 5000 samples finishes within 2 seconds (the PRD target).
- End-to-end test: with the example data, open the robustness card and see the rank distribution and confidence; after switching to "weights completely unknown", the results change.
