# Constraint Check Methodology Note, v0.1

*Rubric 0.1.6, engine 0.1.4, data snapshot 2026-10-24. The New Foreign Assistance (TNFA). Draft of 29 October 2026, written for economists who audit, reimplement or challenge the method. Plain-language companion: `docs/how-it-works.md`.*

**Status.** This is a prototype. No threshold has been calibrated against an external reference, no validation result exists yet, and several thresholds were set after seeing results (marked where they appear). Read every tier in this note as the output of a declared rule, not as a validated verdict.

**Sources of truth.** Where this note and the code disagree, the code governs and the note is wrong. The method is specified in `docs/workbook.md` (the Workbook), amended by Workbook section 10 and by `docs/CHANGELOG-rubric.md`. Every threshold quoted here is read from `registry/params.json`. Each formula names the function that implements it (`file:function`) and the test that checks it. Section 7 lists every place where the code departs from the Workbook.

---

## 1. Question and framework

### 1.1 The question

Constraint Check applies the growth diagnostic of Hausmann, Rodrik and Velasco (HRV) to public cross-country data. For one economy it asks which of the candidate constraints in the HRV decision tree the available evidence already argues against, which deserve closer study, and which cannot be judged from desk data. It is a triage tool. It does not estimate growth effects, rank projects or recommend funding.

### 1.2 The tree

The registry (`registry/nodes.json`) encodes the HRV tree as used by MCC and by Hausmann, Klinger and Wagner (2008), "Doing Growth Diagnostics in Practice: A Mindbook". Internal nodes (ROOT, FIN, RET, SOC, APP, GOV, MKT) are not scored. Diagnosable nodes are:

| Node | Constraint | Mindbook branch | Engine treatment | Current run (217 economies): verdicts other than "cannot tell" |
|---|---|---|---|---|
| N0 | First decision: cost of finance versus low returns | top split | scored, plus the top-split table (section 5.2) | 34 |
| N1 | Bad international finance | cost of finance | scored; cannot be ruled out without a sovereign-spread family | 48 |
| N2 | Low domestic savings | cost of finance | scored | 0 (data gap for every economy) |
| N3 | Poor financial intermediation | cost of finance | scored | 24 |
| N4 | Low human capital | social returns | scored | 45 |
| N5 | Electricity | social returns | scored | 39 |
| N6 | Transport and logistics | social returns | scored | 37 |
| N7 | ICT, water and irrigation | social returns | scored | 0 (no class A/B family in registry) |
| N8 | Land | social returns | scored | 0 (data gap for every economy) |
| N9 | Geography, natural capital, market size | social returns | context only, never scored | n/a |
| N10 | Macroeconomic risk | appropriability: government failure | scored; cannot be ruled out without a sovereign-spread family | 44 |
| N11 | Microeconomic risks (roll-up of five sub-nodes: property, corruption, taxes, regulation, crime; policy uncertainty is context from rubric 0.1.7) | appropriability: government failure | each sub-node scored; N11 takes the most binding (section 4.10). N11.policy is described, not scored (decision D5) | 51 |
| N12 | Self-discovery and information externalities | appropriability: market failure | judged by elimination from rubric 0.1.7: evidence computed, lean reported, never rated (decision D1) | n/a |
| N13 | Coordination failures | appropriability: market failure | never scored: "needs sector study" | n/a |

Counts are from `out/engine-report.json`, generated 2026-10-29T14:53:46Z. Rubric 0.1.7 (31 October) changed only the status of N12 and N11.policy; no count in the last column moved (`docs/CHANGELOG-rubric.md`).

### 1.3 The four tests

Each node is examined with the Mindbook's four principles of a differential diagnosis, which the engine calls tests (`registry/nodes.json`, `tests`):

| Test | Engine id | If the constraint binds | Typical evidence |
|---|---|---|---|
| 1. Price | `price` | Its price or shadow price is high, or agents are rationed at the going price | real lending rate, spreads, returns to schooling, bribe incidence, trade costs |
| 2. Changes | `changes` | Movements in the constraint move investment or growth | co-movement of investment with the real rate or inflation |
| 3. Circumvention | `circumvention` | Agents pay to get around it | self-financing, generators, informality, dollarization, offshore FDI |
| 4. Camels and hippos | `camels` | Activities light in the constrained factor survive and thrive; intensive ones do not | the Rajan-Zingales tilt θ (section 3.6) |

The Workbook's principles that shape the engine are P1 (price before quantity), P2 (surprise relative to an income-conditional expectation is the unit of evidence), P3 (diagnosticity classes), P4 (count evidence families, not indicators), P5 (concordance across tests), P6 (comparators are hypotheses; report three sets), P7 (vintage discipline), P9 (asymmetry) and P10 (breadth over depth). P8 (syndrome reasoning) is left to the analyst and is not computed.

### 1.4 Asymmetric verdicts: licensed to say stop, not go

A false rule-out is the costliest error the tool can make: decision-makers act on eliminations, and firm surveys are weak negative evidence because surviving firms are the camels. The rules are therefore asymmetric in two ways.

1. **Ruling out is harder than flagging.** "Ruled out" needs a low price, absent circumvention, five voting evidence families, three concordant tests, recent class A/B evidence and robustness to the comparator set and to dropping any one family (section 4.8). "Worth a closer look" (the `candidate` tier) needs much less.
2. **No tier recommends action.** The top tier, `likely_binding`, says the desk evidence is consistent with a binding constraint. It is an instruction to look, not a finding that relaxing the constraint would raise growth. The tool's output is designed to stop weak proposals (a skills program where educated workers are unemployed and firms do not cite skills), not to start new ones.

"Probably not binding" is not "ruled out". It is the mirror of "worth a closer look" and has the same low bar.

---

## 2. Data

### 2.1 Snapshot

| Item | Value |
|---|---|
| Snapshot id | `2026-10-24` (snapshot year Y = 2026) |
| Last rebuild | 2026-10-29T16:58:02Z, offline from cached raw files (`ingest/fetch_snapshot.py --offline`); a rebuild from the same cache is byte-identical apart from run timestamps (`replicate.py --level raw`) |
| Economies | 217 (World Bank economies list; 79 aggregates dropped); 44 landlocked |
| Observations | 515,713 rows in `data/snapshot/observations.csv` (`indicator_id, iso3, year, value`), years 1950 to 2026 |
| Ingested indicators | 195 with data, 0 failures (`data/snapshot/meta.json`) |
| Registry indicators | 204 = 195 ingested + 8 derived + 1 static (`registry/indicators.json`) |
| Registry classes | A 48, B 17, C 101, D 4, X 34 |
| Registry tests | price 150, circumvention 17, camels 5, context 32 (including the three θ standard-error series); Test 2 comes from two co-movement specifications, not from registry indicators |

The snapshot is current-vintage. It is not vintage-locked: a series revised by its publisher after the retrieval date would change on the next refresh. Vintage-locked packs are planned for validation (section 6.2).

### 2.2 Sources, vintages and coverage

Counts per source are from `registry/indicators.json` (classes) and `data/snapshot/meta.json` (observations, years, economies with data).

| Source (registry `source` / `extra_group`) | Indicators | Classes | Observations | Years | Economies per indicator | Vintage | Licence note |
|---|---|---|---|---|---|---|---|
| World Development Indicators (`worldbank_wdi`) | 59 | A 10, B 4, C 30, X 15 | 207,445 | 1960–2025 | 69–217 | WDI bulk files last updated 2026-10-08 | World Bank open data |
| World Bank bulk files from other databases (`worldbank_zip`: WGI estimates, HCI) | 8 | C 2, D 4, X 2 | 33,814 | 1996–2025 | 174–207 | WGI 2026-09-25; HCI 2020-09-21 | World Bank open data |
| IMF World Economic Outlook (`weo`) | 4 | C 2, X 2 | 25,032 | 1990–2025 | 193–196 | October 2026 WEO via the IMF DataMapper (SDMX was unavailable); years after 2025 dropped as projections | IMF terms |
| Growth Lab Economic Complexity Index (`eci`) | 1 | C 1 | 4,289 | 1995–2024 | 144 | Harvard Dataverse file 13439575 | as published |
| Enterprise Surveys via Data360 (`es360`) | 40 | A 4, B 4, C 32 | 17,963 | 2006–2026 | 151–180 | Data360 metadata 2026-08-25 | CC BY 4.0 |
| IMF SDMX: interest rates, FSIs, direct investment, monetary statistics, WEO (`imf`) | 16 | A 1, B 4, C 5, X 6 | 40,838 | 1990–2025 | 24–173 | current dataflows as served 2026-10-26 (unversioned); FRED GS10 for the US benchmark after the IMF US series ends | IMF terms; FRED public domain |
| ESCAP-World Bank Trade Cost Database (`escap`) | 12 | A 12 | 51,222 | 1995–2025 | 146–190 | 2026 release, file dated 2026-08-05 | non-commercial use with attribution |
| Global Financial Development Database (`gfdd`) | 10 | A 3, B 2, C 5 | 35,159 | 1960–2021 | 131–185 | 2022-09-23 | CC BY 4.0 |
| Historical Doing Business (`doingbiz`) | 17 | A 9, C 8 | 35,888 | 2003–2019 | 186–190 | DB2020 (final), API files 2021-08-18; discontinued | CC BY 4.0 |
| Returns to schooling (`rts`): Montenegro-Patrinos 2014; Psacharopoulos-Patrinos 2018 | 6 | A 6 | 2,908 | 1960–2014 | 72–137 | 2014-09; 2018-04 | CC BY 3.0 IGO |
| Barro-Lee educational attainment (`barrolee`) | 6 | C 6 | 11,726 | 1950–2015 | 143 | v3 (2021) and v2.2 (2016) | research use with citation |
| Prindex tenure security (`prindex`) | 5 | C 5 | 1,186 | 2019–2024 | 131–138 | public release 2024-09-10 | attribution |
| Growth Lab trade data, HS92 (`atlas`) | 5 | C 5 | 29,731 | 1995–2024 | 209 | Dataverse v18.0, 2026-04-22 | CC0 1.0 |
| Camels-and-hippos θ and its standard errors (`camels`, computed by `ingest/camels.py`) | 6 | B 1 (`CH.SKILL`), X 5 | 18,512 | 2000–2024 | 144 | computed 2026-10-29 from the `atlas` file and three intensity vectors | derived |
| Derived (computed by the engine) | 8 | A 3, B 2, X 3 | n/a | n/a | n/a | n/a | n/a |
| Static (`STATIC.LANDLOCKED`) | 1 | X 1 | n/a | n/a | n/a | `registry/static_landlocked.json` | n/a |

Per-indicator coverage (`n_obs`, `n_countries`, `first_year`, `latest_year`) and per-source retrieval details are in `data/snapshot/meta.json`; the generated codebook (PRD section 17, D3) will publish them per series.

Static lists that change indicator classes or comparator pools:

| File | Content | Size | Used by |
|---|---|---|---|
| `registry/static_landlocked.json` | landlocked economies | 44 | comparator features, ICR control |
| `registry/static_monetary_regimes.json` | no separate legal tender (25) and currency boards (18), "IMF AREAER categories as recalled"; the euro area and CFA zones deliberately not listed | 43 | `regime_sensitive: "monetary"` downgrade (section 4.2) |
| `registry/static_fcs.json` | World Bank FY25 fragile and conflict-affected list, "recalled; verify": conflict 21, institutional and social fragility 18 | 39 | structural comparator exclusion; Desk weak-fit note |
| `registry/static_trade_hubs.json` | SGP, HKG, ARE, IRL, MAC, LUX, MLT | 7 | `regime_sensitive: "trade_hub"` downgrade |

### 2.3 Ingest transformations

World Bank aggregates and WEO regional groups are dropped; observations are kept for years ≥ the indicator's `years` field and ≤ Y; WEO years after 2025 are dropped as projections; WEO codes KOS/UVK and WBG are mapped to XKX and PSE; duplicate economy-years are never written (`ingest/fetch_snapshot.py`; validated by `ingest/check_snapshot.py`). Enterprise Survey series use the economy-wide estimate and the survey year (`docs/extra-sources-contract.md`). Extra sources are merged into the registry by `ingest/merge_extra_registry.py`, which also applies the coordinator's class overrides.

### 2.4 Registry fields

Each indicator in `registry/indicators.json` carries:

| Field | Meaning |
|---|---|
| `id`, `name` | Series code and label |
| `source`, `extra_group`, `source_code`, `source_id` | Where it comes from; the API code and database id when they differ from `id` (for example WGI estimates are `GOV_WGI_*.EST` in source 3) |
| `nodes` | Node ids the indicator informs (empty for context) |
| `test` | `price`, `changes`, `circumvention`, `camels` or `context` |
| `class` | Diagnosticity class A, B, C, D or X (section 4.2) |
| `direction` | +1 if a higher value means the constraint is more likely binding, −1 if less, 0 for context |
| `transform` | `none`, `log`, `log1p` or `logit` (section 3.2) |
| `family` | Evidence family: indicators of one construct from one source share a family and count once |
| `slow` | Slow-moving stock: recency multiplier floored at 0.75 |
| `years` | First year ingested |
| `reference_window_years` | Optional longer reference window (20 for the six returns-to-schooling series) |
| `icr_extra_controls` | Optional extra ICR controls (`log_remoteness` for the 12 ESCAP trade-cost series) |
| `regime_sensitive` | `monetary`, `trade_hub` or `low_voice`: class C for listed economies (section 4.2) |
| `fallback_for` | This series carries no signal where the named series is available (`DERIV.REAL_LENDING_CPI` for `FR.INR.RINR`) |
| `formula`, `caveat`, `notes`, `review_note` | Text for the Desk and for reviewers |
| `hidden_until_fixed` | Drops the indicator everywhere (none set in rubric 0.1.6) |

The file also holds `comovement_specs` (section 3.4) and `connectors_not_built` (families the Workbook defines that the prototype cannot compute: transport losses, camels vectors for N5, N6 and N11.property, sector public goods for N13, security costs for N11.crime).

---

## 3. Statistics

Notation: c indexes economies, i indicators, f families, k tests; Y is the snapshot year (2026).

### 3.1 Reference values

For economy c and indicator i, with window W = `snapshot_reference_window_years` (12) or the indicator's `reference_window_years`:

```
in-window years   = { y : Y − y ≤ W and y ≤ Y, x_{c,i,y} observed }
year_ref          = max(in-window years)
value_ref         = mean of the observed x_{c,i,y} for y ∈ {year_ref − 2, year_ref − 1, year_ref}   (n_ref = how many)
```

With no in-window observation the indicator is unavailable for c; the newest older observation is kept as `stale_value, stale_year` for display only. The three-year span can reach up to two years before the window start (a year counts toward the mean if it is observed, whether or not it is in the window).

Derived series are computed year by year before reference values are taken:

| Id | Formula |
|---|---|
| `DERIV.REAL_DEPOSIT` | `100 × ((1 + FR.INR.DPST/100) / (1 + FP.CPI.TOTL.ZG/100) − 1)`; null if `1 + π/100 ≤ 0` (Fisher) |
| `DERIV.REAL_LENDING_CPI` | the same with `FR.INR.LEND`; a strict fallback for `FR.INR.RINR` |
| `DERIV.CROWDING_OUT` | `FS.AST.CGOV.GD.ZS / FS.AST.DOMS.GD.ZS` (null if the denominator ≤ 0) |
| `DERIV.CREDIT_GROWTH` | `100 × mean(Δln RPC_t, Δln RPC_{t−1}, Δln RPC_{t−2})`, `RPC = FS.AST.PRVT.GD.ZS × NY.GDP.PCAP.KD × SP.POP.TOTL`; all three changes required |
| `DERIV.NET_CASHFLOW_BANKS` | `DERIV.CREDIT_GROWTH − FR.INR.RINR` |
| `DERIV.EDU_UNEMP_RATIO` | `SL.UEM.ADVN.ZS / SL.UEM.TOTL.ZS` |
| `DERIV.INFLATION_VOL` | sample standard deviation of `FP.CPI.TOTL.ZG` over t−4..t (all five years present) |
| `DERIV.INVESTMENT_GAP_PRIVATE` | not implemented; always unavailable |

*Implementation:* `engine/src/reference.mjs:referenceFor`, `buildReferenceTable`, `computeDerived`, `fisherReal`. *Tests:* `engine/test/reference.test.mjs` ("reference value: three-year mean ending at the newest in-window year"; "Fisher real rate: (1 + i)/(1 + π) − 1, not i − π, at high inflation"; "DERIV.REAL_DEPOSIT and DERIV.REAL_LENDING_CPI use the Fisher formula year by year"); `engine/test/synthetic.test.mjs` ("context: reference values, derived indicators, features and ICR fits").

### 3.2 Income-conditional residuals (ICR)

**Equation.** For each indicator (other than the four controls) with reference values for at least `icr.min_countries` (40) economies that have every control:

```
y_c = a + b·ln GDPpc_c + c₁·ln pop_c + d·rents_c + e·landlocked_c [+ g·ln remoteness_c] + u_c
```

- `y_c` is the transformed `value_ref`: `none` → x; `log` → ln x (x > 0); `log1p` → ln(1 + x) (x ≥ 0); `logit` → ln(p/(1 − p)) with p = clamp(x/100, 0.005, 0.995). The transformed cross-section is winsorized at the 1st and 99th percentiles (type-7 interpolation) before fitting.
- Controls are reference values of `NY.GDP.PCAP.PP.KD` (GDP per capita, PPP), `SP.POP.TOTL`, `NY.GDP.TOTL.RT.ZS` (resource rents, percent of GDP) and the landlocked flag. `ln remoteness` (GDP-weighted mean great-circle distance from the capital to every other capital, `comparators.mjs:addRemoteness`) is added only for indicators that list it in `icr_extra_controls` (the 12 ESCAP trade-cost series, rubric 0.1.5). Constant columns are dropped and recorded.
- Estimation: Huber M-estimation by IRLS. Start from OLS; at each iteration compute residuals r, scale s = MAD(r)/0.6745 (floored at 10⁻⁹), weights w_c = min(1, k·s/|r_c|) with k = `huber_k` (1.345), and refit by weighted least squares; stop when the largest coefficient change is below 10⁻⁸ or after `max_iterations` (50). If MAD collapses to the floor (more than half the residuals identical, as in zero-inflated survey shares), the whole fit is rerun with the normal-consistent mean absolute deviation about the median, mean|r − median r|/0.7979; if that also collapses the fit is reported as degenerate and yields no t.

**Reported per economy:** residual u_c (transformed units); `t_c = u_c / s_final` with s_final the robust scale of the final residuals; percentile = 100 × share of fitted economies with residual ≤ u_c. Per fit: n, weighted R² = 1 − Σw r² / Σw (y − ȳ_w)², coefficients, scale, scale method, iterations. A within-region variant adds dummies for regions with at least five economies in the fit (largest region omitted) and reports `t_region`; it is displayed and never used in a signal.

**Identification.** The ICR is a descriptive conditional expectation, not a causal model. It answers the Workbook P2 question: is the indicator higher or lower than in economies of similar income, size, resource dependence and geography, relative to the dispersion among them? The economy of interest is part of the fitting sample. Because income may itself reflect the constraint, conditioning on income can absorb part of a constraint's signal; the residual is in that sense conservative. `t` is a robust standardized residual (residual over a robust scale of all residuals), not a leverage-adjusted studentized residual.

**Signal.** With direction d and thresholds `icr.signal_thresholds` (strong 1.5, weak 0.75):

```
s_icr = d · sign(t) · (|t| ≥ 1.5 ? 2 : |t| ≥ 0.75 ? 1 : 0)
```

*Implementation:* `engine/src/icr.mjs:fitICR`, `fitAllICRs`, `icrFor`; `engine/src/stats.mjs:huberIRLS`, `ols`, `solveLinear`, `meanAbsDev`; `engine/src/transforms.mjs:transformValue`, `winsorize`; `engine/src/signals.mjs:icrSignal`. *Tests:* `engine/test/stats.test.mjs` ("Huber IRLS recovers y = 1 + 2x with five planted outliers to three decimals"; "Huber IRLS survives a zero-inflated cross-section"; "transforms and winsorizing"; "v0.1.5: remoteness is the GDP-weighted mean distance to other capitals"); `engine/test/signals.test.mjs` ("ICR signal thresholds and direction"). *Independent check:* `engine/xcheck/icr_xcheck.py` against statsmodels RLM (section 6.1).

### 3.3 Peer gaps and comparator sets

**Comparator features** (`comparators.mjs:buildFeatures`), from reference values: log GDP per capita PPP, log population, resource rents, landlocked, the income reference year and FCS membership. An economy missing any of the four core features is excluded from the structural universe and from every ICR fit.

**Three sets** are always computed (`comparators.mjs:comparatorSets`):

| Set | Rule (`params.comparators`) | Function |
|---|---|---|
| Structural (active by default) | The 10 nearest economies by `d = sqrt(Σ_k ((f_kc − f_kt)/sd_k)² + 1·[landlocked_c ≠ landlocked_t])` over the three continuous features standardized across the universe (a diagonal Mahalanobis distance) plus a fixed landlocked-mismatch penalty of 1. Excluded: population below 300,000 unless the target is below it; high-income economies unless the target is high income; FCS economies unless the target is FCS; economies whose income observation is more than 2 years older than the universe's latest. Ties by iso3. | `structuralSet` |
| Regional | Same World Bank region; the target's income group first, widened one group at a time on both sides until at least 6 members; cut to the 15 nearest by log income | `regionalSet` |
| Aspirational | Economies whose GDP per capita PPP 25 years before the target's reference year was within ±30 percent of the target's current value and whose average growth since is at least 3 percent a year; up to 10, by growth; may be empty (for most high-income targets) | `aspirationalSet` |

**Peer-gap statistic** for the active set, when at least `min_peers_with_data` (5) members have a reference value. On raw `value_ref` and direction d:

```
more  = peers strictly more binding than the target;   less = strictly less;   ties = the rest
rank_worst = 1 + more + ties/2;   rank_best = 1 + less + ties/2;   n = peers_with_data + 1
s_pg = +2 if rank_worst ≤ 2;  −2 if rank_best ≤ 2;  +1 if rank_worst ≤ 4;  −1 if rank_best ≤ 4;  else 0
```

If a middle rank satisfies a worst-side and a best-side condition at once (possible when n ≤ 7), the signal is 0 and flagged ambiguous. A target tied with every peer at a zero-MAD median scores 0 (`tied`). Also reported: the gap to the peer median in units and in peer MADs.

**Indicator signal.** `s_i = median({s_icr, s_pg,active})` over those that exist; the median of two is their mean, so half-integers occur. Peer gaps under the other two sets are computed and enter only through the fragility check (section 4.7) and the bootstrap's random choice of set (section 4.10).

**Recency and weight.** With age = Y − year_ref: multiplier 1.0 if age ≤ 4, 0.75 if ≤ 8, 0.4 if ≤ 12, else 0; for `slow` indicators max(multiplier, 0.75). Weight `w_i = class_weight × multiplier` (class weights in section 4.2). Class X indicators and suppressed fallbacks carry no signal.

*Implementation:* `engine/src/comparators.mjs:structuralSet`, `regionalSet`, `aspirationalSet`, `buildFeatures`, `addRemoteness`; `engine/src/signals.mjs:peerGap`, `indicatorSignal`, `recencyMultiplier`, `indicatorWeight`; `engine/src/scorecard.mjs:buildIndicatorRecords`, `peerGapFromMatrix`. *Tests:* `engine/test/signals.test.mjs` ("peer-gap ranks and signals for a hand-built eleven-economy set"; "peer gap: ties take half a rank, so a fully tied target scores 0 (v0.1.2)"; "peer gap: small-set middle ranks are ambiguous and score 0"; "indicator signal is the median of the ICR and peer-gap signals"; "recency multiplier bands and the slow-moving floor"); `engine/test/synthetic.test.mjs` ("comparator sets follow their rules"; "structural comparators: landlocked is a fixed penalty, not a hard filter (v0.1.2)").

### 3.4 Co-movement (Test 2)

Two specifications are defined (`registry/indicators.json`, `comovement_specs`):

| Id | Nodes | x (lagged one year) | y | Expected sign | Window |
|---|---|---|---|---|---|
| `CM.FINANCE` | N0, N3 | `FR.INR.RINR`, else `DERIV.REAL_LENDING_CPI` (first with enough pairs; `x_source` recorded) | `NE.GDI.FTOT.ZS` (gross fixed capital formation, percent of GDP) | −1 | 20 years |
| `CM.MACRO` | N10 | `FP.CPI.TOTL.ZG` | `NE.GDI.FTOT.ZS` | −1 | 20 years |

**Statistic.** Over calendar years t = Y − 19 .. Y, pair Δy_t = y_t − y_{t−1} with Δx_{t−1} = x_{t−1} − x_{t−2}; drop pairs where either change is zero; require n ≥ `comovement.min_years` (10) pairs.

```
agree   = #{pairs with sign(Δy_t) = expected_sign · sign(Δx_{t−1})}
p_pred  = P(X ≥ agree | n, ½)          p_wrong = P(X ≥ n − agree | n, ½)       (exact binomial)
signal  = predicted direction (agree > n − agree):  +1 if p_pred ≤ 0.10 (capped at predicted_sign_cap = 1)
          wrong direction (n − agree > agree):      −1 if p_wrong ≤ 0.10, −2 if p_wrong ≤ 0.025
          otherwise 0
```

With 19 pairs the predicted sign needs 13 agreements for +1; the wrong sign needs 13 for −1 and 15 for −2. The OLS slope of Δy on Δx and the consistency share agree/n are reported but do not enter the signal. Each specification is one family, class C, on the `changes` test, dated by the last year used and weighted 0.6 × recency.

**Identification.** None in the causal sense. The Workbook (4.4) treats co-movement as a consistency check: many things move together in recoveries, and the constraint that caused a collapse need not be the one binding now. The sign test only asks whether the agreement count is unlikely under independence. The asymmetric cap keeps the Workbook's rule that a wrong sign is the stronger message. In the current run `CM.FINANCE` is non-zero for 21 of 108 economies with a test and `CM.MACRO` for 26 of 158.

*Implementation:* `engine/src/signals.mjs:comovement`, `comovementSignal`, `binomialUpperTail`; `engine/src/scorecard.mjs:buildComovementRecords`. *Tests:* `engine/test/signals.test.mjs` ("co-movement: exact binomial sign test with the Workbook asymmetry (v0.1.2)"; "co-movement sign consistency, slope, p-value and x-candidates"); `engine/test/evidence_math.test.mjs` ("comovePairs reproduces the engine agree count from the panels").

### 3.5 Price and quantity

Workbook P1: a low quantity of a factor is not evidence of scarcity, because it may reflect low demand; scarcity shows in a high price or rationing at the going price. The engine uses the price-quantity distinction in three places.

1. **Price-test discipline** (`params.tiers.price_test_quantity_rule = "ab_only"`). On the price test only class A and B families vote. Class C and D families assigned to the price test (credit to GDP, bank branches, enrollment, electricity access, LPI, WGI composites and similar) are *informing* families: they are shown, counted separately (`E_informing`), and can block the extreme tiers (section 4.8), but they never enter T_price, N, C or E. With no class A/B price family the price is *not observed* (`T_price = null`) and N rests on the other tests. *Implementation:* `engine/src/aggregate.mjs:testScores`, `nodeStats`. *Test:* `engine/test/aggregate.test.mjs` ("price-test discipline (ab_only): class C/D price families inform, never vote, and do not count in E").
2. **The top split** (section 5.2) classifies the real lending rate (a price), private credit growth and the investment ratio (quantities) to read the first decision node.
3. **Chart C5** on the Desk plots every economy's distance from an income-only fit on a price indicator against the same distance on a quantity indicator, plus the economy's own price-quantity path over 30 years (trailing three-year means), and names the quadrant. It is display only and uses the Desk's income-only fit, not the engine's ICR. *Implementation:* `desk/js/evidence_math.mjs:priceQtyRows`, `pricePath`, `quadrant`. *Test:* `engine/test/evidence_math.test.mjs` ("priceQtyRows, pricePath and quadrant").

### 3.6 Camels and hippos: the θ statistic (Test 4)

**Data.** Growth Lab HS 1992 4-digit export values (`data/raw/atlas/hs92_country_product_year_4.csv`), years from 2000. Three intensity vectors on HS4 headings. The two ISIC vectors are mapped from industries through the WITS HS 1988/92 → ISIC Rev. 2 concordance (equal-weight mean over a heading's mapped HS6 lines; headings with no mapped line omitted):

| Indicator | Node | Vector | Builder | Status (rubric 0.1.6) |
|---|---|---|---|---|
| `CH.FIN` | N0, N3 | Rajan-Zingales (1998) external finance dependence, 36 ISIC Rev. 2 industries, from the replication file of Iacovone, Ferro, Pereira-Lopez and Zavacka (2019) | `ingest/intensity_finance_dependence.py` | class X: failed the placebo check |
| `CH.SKILL` | N4 | Ciccone-Papaioannou (2009) schooling intensity, Table I (average years of schooling of US employees, 1980), 28 industries | `ingest/intensity_schooling.py` | **class B: passed, votes** |
| `CH.TIME` | N6 | Share of US import value arriving by air, 1991–2005, from the Hummels-Schaur (2013) replication package: a revealed proxy, not their time-cost estimate | `ingest/intensity_time_sensitivity.py` | class X: failed |

**Groups.** Finance dependence and schooling are estimated **jointly**, on the products both score, so each θ holds the other fixed (they correlate 0.46 across products). Transport time is estimated alone.

**Sample.** For each group and year, the scored products are those every vector in the group covers. An economy is estimable if it has log GDP per capita (PPP), at least US$50 million of scored exports (`MIN_EXPORTS`), and at least 50 scored products exported at US$1 million or more (`MIN_BASKET`, `BASKET_VALUE`). Otherwise it is "not estimable" and gets no θ: a thin basket must not read as hippos. A year needs at least 40 estimable economies and 30 scored products with positive exports. In 2024, 131 economies are estimable for the finance and schooling group.

**Outcome.** Revealed comparative advantage **within the scored products** (for the ISIC vectors, manufactures), so commodity exports do not dilute θ and a vector's θ does not depend on which other vectors are loaded:

```
RCA_cp = (X_cp / X_c) / (W_p / W),   X_c = Σ_{scored p} X_cp,   W_p = Σ_c X_cp,   W = Σ_c X_c
y_cp   = ln(1 + RCA_cp)            (main outcome; written as CH.*)
```

The product's percentage share of the economy's scored exports is computed for the placebo check only.

**Equation (Workbook 4.5, trade version).** With z_vp vector v's intensity standardized over the scored products:

```
y_cp = α_p + β_p · ln GDPpc_c + μ_c + Σ_v θ_cv · z_vp + ε_cp     (pooled over the balanced c × p panel, zeros included)
```

It is estimated in two steps that reproduce the pooled OLS exactly by Frisch-Waugh-Lovell:

```
step 1, per product p across economies:   e_cp = y_cp − â_p − b̂_p · ln GDPpc_c
step 2, per economy c across products:    e_cp on [1, z_1p, …, z_qp]  →  (μ̂_c, θ̂_c1, …, θ̂_cq)
```

**Identification.** The product effects α_p and income slopes β_p absorb any tilt common to all economies and any tilt linear in log income. θ is therefore identified only relative to income: Σ_c θ_cv = 0 and Σ_c θ_cv ln GDPpc_c = 0 by construction. Read θ_cv as "the economy's export tilt toward products intensive in factor v, compared with economies at the same income level and holding the group's other vectors fixed". A negative θ means more camels (registry direction −1). Intensity is assumed constant across countries, and location is endogenous (Workbook 4.5 caveats).

**Standard errors.** Cluster-robust, with W = [1, z_1, …, z_q], Û the step-2 residuals and G clusters:

```
V_c = (W'W)⁻¹ ( Σ_g s_cg s_cg' ) (W'W)⁻¹ · G/(G − 1),   s_cg = Σ_{p∈g} W_p û_cp
```

Clusters are the source industry (products sharing all the group's intensity values). A vector with no industry concordance behind it (more than half its values distinct, i.e. the time vector) is clustered by HS2 chapter. Fewer than 10 clusters falls back to one per product. No adjustment is made for the step-1 estimates.

**Kill criterion (placebo-based).** For each vector, 99 placebos reassign its distinct intensity values at random among themselves. Ties are kept, so the industry structure survives but the economics does not. The seed is fixed at 20261029. The vector passes only if its real statistic beats the 95th placebo percentile on both:

1. the rank correlation of θ in 2019 and 2024;
2. the rank correlation of θ from ln(1 + RCA) with θ from export shares (2024).

Results:

| Vector | 5-year ρ (placebo p95) | ρ against export shares (placebo p95) | Result |
|---|---|---|---|
| `CH.FIN` | 0.96 (0.94) | 0.70 (0.72) | fails |
| `CH.SKILL` | 0.96 (0.95) | 0.72 (0.70) | **passes** |
| `CH.TIME` | 0.94 (0.86) | 0.50 (0.53) | fails |

With 499 placebos, three seeds and two end years, schooling passed all six runs, finance failed all six, and transport failed five of six. The first criterion of 29 October (rank correlation ≥ 0.5 across outcome measures and five years apart) was dropped because all 99 placebos passed it.

**Scoring a voting θ (Workbook 4.7).**
- The percentile of θ's reference value among all economies with one, oriented so that low θ (camels) is the binding side:
  - ≤ 10 → +2, ≤ 25 → +1;
  - ≥ 90 → −2, ≥ 75 → −1;
  - otherwise 0.
- **Zero** when the latest θ is within two clustered standard errors of zero, or when no standard error exists for that year.
- No income-conditional residual and no peer gap: the rule does not depend on comparators.
- In 2024, 27 of 137 economies' schooling θ is gated to zero.

*Implementation:*
- `ingest/camels.py`: `group_panel`, `outcome`, `income_residuals`, `slopes`, `thetas`, `permuted`, `kill_check` and `main`.
- `engine/src/scorecard.mjs:camelsSignal`, with `signalForSet` and `readingsForSet` for the percentile rule.
- Chart C12 reads `desk/data/camels/`.

*Three versions of the test (rubric 0.2.3; the presence version votes for contract intensity since 0.2.6).* *Self-discovery (rubric 0.2.7):* N12 stays judged by elimination, but its lean now includes the discovery gap (`ingest/productspace.py`, `PS.GAP`, class B): actual minus expected new competitive exports over a five-year window, the expectation from a logistic model on each candidate product's density in the economy's basket, its starting RCA and income, in dispersion-scaled standard deviations. Its gates (placebo centred on zero; rank correlation across windows at least 0.5) and the finding that a scrambled product space ranks economies almost alike are in `docs/self-discovery-plan.md`, section 8. The θ above reads the export tilt of products that exist. Since 0.2.2 a firm-level θ from the Enterprise Surveys microdata (`ingest/camels_firm.py`, `CHF.*`) reads whether exposed sectors grow slower, gated by a planted-tilt power check and voting at a two-point tilt; its cards carry the survivor-bias caveat, because both growth-based versions see only survivors. Since 0.2.3 a presence version, the hippo gap (`ingest/hippo_gap.py`, `HG.*`), runs the same two steps on absence (RCA within the scored products below 0.2) and returns γ, positive when the factor-heavy products are the missing ones (direction +1, the same percentile bands). Its two gates, a planted-absence power check and the placebo stability check, were pre-registered; every vector failed the power gate on the first run, so all `HG.*` series are class X, shown under chart C12 and on the self-discovery page (entry rates by intensity quartile; the products that thrive and the products that are missing, with what each needs) and never counted. `docs/hippo-gap-test.md` records the design, the gates and the numbers.

*Tests:*
- `tests/test_camels.py`: planted tilts recovered with the right sign; scale invariance; identification relative to income; the brute-force pooled OLS reference; joint estimation separating correlated vectors; thin baskets not estimable; the placebo check passing a real tilt and failing noise.
- `engine/test/camels.test.mjs`: percentile bands and edges; the two-standard-error gate; no standard error, no signal; the family reaching its node.

---

## 4. Aggregation

### 4.1 Families

Within a node, signal-bearing indicators are grouped by (test, family). Family signal = median of member signals; family weight = maximum member weight; family class = best member class (A best); family year = newest member year. A family counts once per node per test. Twelve ESCAP trade-cost series, for example, are one family.

*Implementation:* `engine/src/signals.mjs:buildFamilies`. *Test:* `engine/test/signals.test.mjs` ("family deduplication: three indicators in one family count as one").

### 4.2 Classes and weights

| Class | Meaning (Workbook 4.6) | Weight (`params.class_weights`) | Votes on price test | Votes on other tests |
|---|---|---|---|---|
| A | Prices, shadow prices, hard rationing measures | 1.0 | yes | yes |
| B | Behaviors that only make sense if the constraint binds (circumvention) | 0.9 | yes | yes |
| C | Quantities, access measures, perceptions | 0.6 | no (informs) | yes, except Test 4 (informs, rubric 0.1.6) |
| D | Composite indices and rankings | 0.3 | no (informs) | yes, except Test 4 (informs) |
| X | Context: displayed, no signal | none | no | no |

Economy-specific downgrades of a class A or B indicator to class C (the registry class is kept as `class_registry`, the reason as `class_note`):

- `monetary`: economies in `static_monetary_regimes.json` (`FP.CPI.TOTL.ZG`, `DERIV.INFLATION_VOL`, the two IMF dollarization ratios).
- `trade_hub`: the seven hubs in `static_trade_hubs.json` (the 12 ESCAP trade-cost series).
- `low_voice`: economies whose WGI voice and accountability reference value is ≤ −1.0 (`params.candour`; 49 economies at rubric 0.1.5), for self-reported bribery (`IC.FRM.BRIB.ZS`, `IC.FRM.CORR.ZS`, `IC.TAX.GIFT.ZS`). The threshold is a judgment set after seeing results.

*Implementation:* `engine/src/scorecard.mjs:buildIndicatorRecords`, `normalizeRegistry`, `buildContext`. *Tests:* `engine/test/synthetic.test.mjs` ("v0.1.5: self-reported bribery is class C where voice and accountability is very low, and only there").

### 4.3 Test scores

For each test k, over the voting families with weight w_f > 0:

```
T_k = Σ_f w_f · s_f / max(Σ_f w_f, test_weight_floor)          test_weight_floor = 1.0 (the class A weight)
```

T_k is null when the test has no family; `{T: null, not_observed: true}` for a price test, or (rubric 0.1.6, `tiers.camels_test_quantity_rule: "ab_only"`) a camels test, with informing class C/D families only. The floor shrinks thin tests toward zero: one class C family at +1 gives 0.6; one class A family at +2 keeps +2.

*Implementation:* `engine/src/aggregate.mjs:testScores`. *Test:* `engine/test/aggregate.test.mjs` ("weight floor: a test with thin voting weight is shrunk toward zero, a class A family keeps its value").

### 4.4 Node score N

```
N = Σ_k v_k · T_k / Σ_k v_k     over the available T_k,   v = tiers.test_weights = {price 2, changes 1, circumvention 1, camels 1}
```

*Test:* `engine/test/aggregate.test.mjs` (tier tests carry the weighted-mean expectations; "rubric v0.1.2 switches are in force").

### 4.5 Concordance C

```
C = #{k : sign(T_k) = sign(N) and |T_k| ≥ concordance_abs_T_min (0.5)};   C = 0 when N = 0
```

### 4.6 Evidence E, recency R and the A/B counts

`tiers.evidence_count_rule = "voting_families"`:

- **E** = number of distinct voting families with w_f > 0 in the node, across tests. Informing families (test 1's, and under rubric 0.1.6 test 4's) are counted separately as `E_informing`.
- **R** = newest year among class A or B voting families (null if none).
- **AB_count** = distinct class A/B voting families; **AB_pos** = those with s_f ≥ +1; AB families with s_f > 0 are also counted for the rule-out guard.

*Implementation:* `engine/src/aggregate.mjs:nodeStats`.

### 4.7 Fragility F

With F temporarily 0, the tier is computed under each comparator set that has members and under the removal of each single voting family from the active set. On the ordinal scale ruled out −2, probably not −1, any cannot-tell 0, candidate +1, likely binding +2:

```
F = 1 if max − min of the tiers across sets > 1, or any single-family removal moves the tier by more than one step; else 0
```

Families whose removal changes the tier at all are reported as `load_bearing`.

*Implementation:* `engine/src/aggregate.mjs:evaluateNode`. *Test:* `engine/test/aggregate.test.mjs` ("fragility across comparator sets and leave-one-family-out").

### 4.8 Tier rules

Evaluated in this order, with the structural set active; age(R) = Y − R. Thresholds are from `params.tiers`.

| # | Tier (Desk label) | Fires when |
|---|---|---|
| 1 | `cannot_tell_data_gap` (Unclear: data gap) | E < `E_below` (**2**), or no class A/B voting family with age(R) ≤ `staleness_limit_years` (8) |
| 2 | `cannot_tell_conflicting` (Unclear: conflicting evidence) | some T_k ≥ `T_pos_min` (1.0) and another T_j ≤ `T_neg_max` (−1.0) |
| 3 | `ruled_out` (Ruled out) | N ≤ −1.0; C ≥ 3; T_price ≤ −0.5; T_circumvention exists and ≤ −0.5; E ≥ 5; no class A/B family with s_f > 0; AB_count ≥ 2; age(R) ≤ 8; F = 0; no informing family with s ≥ +1.0; if the circumvention test rests on one family, that family has a peer-gap reading; every family in the node's `ruled_out_requires_families` is present (N1 and N10 require `sovereign_spreads`) |
| 4 | `likely_binding` (Likely a main constraint) | N ≥ 1.0; C ≥ 3; E ≥ 5; T_price ≥ 0.5; no T_k ≤ −1.0; AB_pos ≥ 2; F = 0; no informing family with s ≤ −1.0 |
| 5 | `candidate` (Worth a closer look) | (N ≥ 0.5 and C ≥ 2) or N ≥ `N_alt_min` (1.0). Downgraded to `cannot_tell_weak` if every voting family is class D |
| 6 | `probably_not` (Probably not the main constraint) | (N ≤ −0.5 and C ≥ 2) or N ≤ `N_alt_max` (−1.0), and not every voting family is class D |
| 7 | `cannot_tell_weak` (Unclear: evidence too weak) | otherwise |

Data-gap sub-reasons, in order of precedence: `connector_not_built` (no family computed and the node is listed in `connectors_not_built`), `no_ab_family` (the registry assigns no class A/B indicator to the node), `no_ab_price_family` (no class A/B price indicator in the registry and E < E_below), `registry_coverage` (the registry cannot supply E_below voting families for the node for any economy, `scorecard.mjs:registryVotingCapacity`), `stale`, `data_gap`.

Every tier carries `tier_reason` (the rule that fired, with values) and `blockers` (the conditions that kept the node from each extreme tier).

**Top-split override.** A finance node (N0 to N3) at `likely_binding` is downgraded to `candidate` when the top-split row is `low_demand` or the real rate is classified `low` in any row (`top_split.override_when_rate_low`), unless `IC.FRM.CRDC.FL.ZS` (firms fully credit constrained) has signal +2. *Implementation:* `aggregate.mjs:applyTopSplitOverride`.

*Implementation:* `engine/src/aggregate.mjs:assignTier`, `evaluateNode`, `scaleThresholds`. *Tests:* `engine/test/aggregate.test.mjs` ("likely_binding when every condition holds"; "candidate with the blockers named in tier_reason"; "ruled_out when price and circumvention agree with concordant changes"; "extreme tiers: an informing quantity dissenting by 1 or more blocks ruled_out and likely_binding (v0.1.2)"; "ruled_out guards: a lone circumvention family needs a peer gap, and required families must exist (v0.1.2)"; "probably_not names what blocked ruled_out"; "cannot_tell: data gap, connector not built, stale, registry coverage, no A/B price, conflicting, weak"; "class D composites alone never reach candidate"; "monotonicity: raising any family signal (more adverse) never lowers the ordinal tier"; "v0.1.4 option B: two independent voting families can leave cannot_tell; one cannot; extremes still need five"; "v0.1.4b: probably_not mirrors candidate"; "ranking orders candidates by N × breadth and the top-split override downgrades finance nodes").

### 4.9 Current tier distribution

All 217 economies, 18 scored node rows each (N0 to N8, N10 to N12 and the six N11 sub-nodes; N11 is a roll-up), rubric 0.1.6 and engine 0.1.4, run of 2026-10-29: likely binding 0, candidate 238, conflicting 30, weak 1,443, data gap 2,025, probably not 170, ruled out 0. Nine in ten rows are a "cannot tell". **No row reaches either extreme.** Under rubric 0.1.5 seven did (Bolivia and Gabon likely binding; China, Estonia and Georgia ruled out), all in N11.regulation, and all rested on new-business density, a class C quantity voting on Test 4. Since 0.1.6 class C/D families only inform there (section 7.2, item 12), and since engine 0.1.4 they no longer count in E either, which moved nine N11.regulation rows from weak evidence to data gap (section 7.3).

### 4.10 N11 roll-up, ranking, rank stability, statements

**Roll-up.** N11's tier is the most binding sub-node tier on the ordinal scale. Ties among cannot-tell tiers are broken by evidence: conflicting before weak before data gap, then more voting families, then higher N, then registry order. E, E_informing, AB_count and AB_pos count distinct families across sub-nodes. *Implementation:* `aggregate.mjs:rollupNode`. *Test:* "N11 roll-up takes the most binding sub-node, breaks cannot_tell ties by evidence and counts distinct families".

**Ranking.** Top-level nodes at `candidate` or `likely_binding` are ordered by N × breadth, with breadth fixed at 1.0. More than `max_likely_binding_before_flag` (4) likely-binding nodes raises a flag. *Implementation:* `aggregate.mjs:rankNodes`.

**Rank stability.** `bootstrap_draws` (300) draws with a mulberry32 generator seeded by the FNV-1a hash of `iso3|rubric_version`. Each draw scales every magnitude threshold by one factor drawn uniformly from [0.8, 1.2], picks one comparator set at random among those with members, keeps a random subset of each node's voting families of size `n ≤ E_below ? n : max(E_below, round(0.8 n))` (informing families always kept), recomputes tiers and the ranking, and records each node's rank. Reported: modal rank, P(top 3), P(ranked), the nodes not resampled. *Implementation:* `aggregate.mjs:bootstrapRanks`; `stats.mjs:fnv1a`, `mulberry32`. *Tests:* "bootstrap never resamples a node below E_below voting families (v0.1.2)"; "threshold scaling touches magnitudes, not counts"; `stats.test.mjs` "seeded RNG is deterministic and in [0, 1)".

**Sensitivity.** Tiers under each comparator set, with all magnitude thresholds at −20 and +20 percent, and the load-bearing families.

**Statements.** `stop_arguing` = top-level nodes at ruled out or probably not; `look_hard` = the ranking; `cannot_tell` = every cannot-tell node plus N13 (`aggregate.mjs:statements`). The Desk reserves the phrase "you can stop arguing about" for ruled-out nodes and lists probably-not nodes separately (`docs/ux-clarity-pass.md`).

**Browser recompute.** `scorecard.mjs:recomputeWithPeers` reruns signals and aggregation with a user-edited peer list that replaces one default set; with the default peers it reproduces the batch tiers, ranks, modal ranks and P(top 3) exactly. *Tests:* `engine/test/synthetic.test.mjs` ("recomputeWithPeers with the default structural peers reproduces the batch verdicts, ranks and bootstrap"); `engine/test/parity.test.mjs`.

---

## 5. Growth problem and top split

### 5.1 Growth Problem Statement (Stage 0)

Windows end at the latest year with any `NY.GDP.PCAP.KD.ZG` observation in the universe (2025 on this snapshot), so "10 years" is 2016–2025 and "20 years" 2006–2025.

| Statistic | Computation | Function |
|---|---|---|
| G1 | Mean real GDP per capita growth over 10 and 20 years (at least half the years observed); structural-set and regional medians; rank among structural peers (1 = fastest) | `growth.mjs:windowAverage`, `growthProblem` |
| G2 | Convergence residual: Huber regression across economies (rows sorted by iso3) of 10-year average growth on ln GDP per capita PPP in 2015 with region dummies (regions with ≥ 5 economies); t = residual/scale | `growth.mjs:growthUniverse` |
| G3 | Peak-to-date year of `NY.GDP.PCAP.KD`, years since, shortfall 100 × (peak − latest)/peak | `growth.mjs:peakToDate`, `assessPeak` |
| G4 | Single-break simplified: the split year maximizing \|mean(after) − mean(before)\| with each segment ≥ 8 years; reported if the change ≥ 2.0 points | `growth.mjs:singleBreak` |
| G5 | Standard deviation of growth over 20 years; structural median; universe percentile | `growth.mjs:windowSd` |
| G6 | ICR t and percentile of `NE.GDI.FTOT.ZS`; private split stated as unavailable | `growthProblem` |
| G7 | ICR of `NY.GNS.ICTR.ZS`; levels and ICRs of the current account and net FDI | `growthProblem` |
| G10 | ICRs of exports to GDP and ECI | `growthProblem` |
| G11, G12 | Unemployment level and ICR; population, urban share, rents, landlocked, region, income group | `growthProblem` |

Classification, first rule that fires (`params.growth_problem`): `slowdown` if the 10-year mean ≤ the 20-year mean − 1.5 points; `collapse_recovery` if the peak is 8 to 30 years old and the shortfall ≥ 10 percent; `volatile` if G5 is above the 75th universe percentile; `growing` if the 10-year mean ≥ 3, or G2 t ≥ 1.0 and the 10-year mean ≥ 2; else `mixed`. The statement fills the Workbook 2.3 template. Classification does not enter any tier.

*Implementation:* `engine/src/growth.mjs:classifyGrowthProblem`, `buildStatement`, `proseName`. *Tests:* `engine/test/growth.test.mjs` (seven tests: windows, classification bounds, the `growing` rule and `mixed` fallback, articles, prose); `engine/test/synthetic.test.mjs` ("growth problem statistics, classification and statement").

### 5.2 Top split (first decision node)

Statistics: `real_rate_t` = ICR t of `FR.INR.RINR` (else of `DERIV.REAL_LENDING_CPI`; `rate_source` recorded); `credit_growth` = `value_ref` of `DERIV.CREDIT_GROWTH`; `investment_t` = ICR t of `NE.GDI.FTOT.ZS`; also recorded `credit_depth_t` (ICR t of private credit to GDP) and net cash flow from banks.

Classification (`params.top_split`): rate high if t ≥ 0.75, low if t ≤ 0, else middle; credit high if growth ≥ 5 percent and credit is not thin (credit_depth_t > −1.5), else low; investment low if t ≤ −0.5.

| Rate | Credit | Investment | Row | Reading |
|---|---|---|---|---|
| high | low | low | `finance_supply` | supply of finance constrained |
| low | low | low | `low_demand` | low demand for investment |
| high | high | low | `credit_boom_no_investment` | conflicting: check macro risk, crowding out, consumer credit |
| low | high | not low | `not_investment_constrained` | revisit the question |
| low | low | not low | `investment_without_finance` | likely public or FDI-led investment |
| other, or a statistic missing | | | `indeterminate` | |

Current distribution: indeterminate 148, investment without finance 34, low demand 16, not investment constrained 9, finance supply 5, credit boom without investment 5. The row is a provisional reading and feeds only the override in section 4.8.

*Implementation:* `engine/src/topsplit.mjs:topSplit`; `engine/src/scorecard.mjs:topSplitFromIndicators`. *Tests:* `engine/test/topsplit.test.mjs` (four tests: the five canonical rows, the credit-depth floor, indeterminate cases, the real-rate source).

---

## 6. Validation

### 6.1 What exists

| Check | What it shows | Where |
|---|---|---|
| Engine unit and integration tests | 96 tests in ten files under `engine/test` (`node --test engine/test`): statistics, signals, every tier and guard, monotonicity, fragility, roll-up, bootstrap, top split, growth prose, Desk chart math | `engine/test/*.test.mjs` |
| Synthetic end-to-end run | A generated 150-economy snapshot with planted economies receives the planted verdicts: FIN (finance binds: N3 likely binding, top split finance supply), CLN (clean finance: N3 ruled out, wrong-sign co-movement), PWR (N5 candidate), MAC (N10 likely binding), GOV (N11 candidate) | `engine/test/synthetic.test.mjs`, `engine/test/fixtures/make_synthetic.mjs` |
| Determinism and parity | Two runs give byte-identical Scorecards; the browser recompute reproduces the batch on a fixed fixture | `synthetic.test.mjs`, `parity.test.mjs`, `engine/test/fixtures/parity.json` |
| statsmodels cross-check of the ICR | Run 24 October 2026 on rubric 0.1 outputs: statsmodels RLM (HuberT, k = 1.345, MAD scale) on the engine's own reference values for 10 indicators and 5 economies. Coefficients on log income agree to three decimals, scales to two, t values within 0.0296; no signal crosses a threshold. Since 29 October a test (`tests/test_engine_parity.py`) reruns it on every CI build against the current outputs: largest gap 0.030 | `engine/xcheck/icr_xcheck.py`, `tests/test_engine_parity.py` |
| numpy reference for θ | The two-step estimator equals the brute-force pooled Rajan-Zingales OLS (to 10⁻¹⁴ on 29 October 2026); planted tilts recovered; θ sums to zero and is orthogonal to log income; invariant to affine rescaling of the vector | `tests/test_camels.py` |
| Replication | `replicate.py` rebuilds test 4, the scorecards and the Desk data and compares 1,424 outputs with `data/MANIFEST-outputs.sha256`; on 29 October both levels (from the committed snapshot, and from the raw cache) reproduced every output. CI runs the comparison on every push | `REPLICATION.md`, `replicate.py` |
| Adversarial reviews | Two reviewers on the rubric 0.1.1 run (economics; code and Desk): 27 findings, dispositions in `notes/review-dispositions.md`, which produced rubric 0.1.2. One review of Test 4 on 29 October 2026, which refuted three claims and made Test 4 display only. Two persona walkthroughs of the Desk (`docs/ux-clarity-pass.md`) | `docs/CHANGELOG-rubric.md` |
| Mindbook cases, read informally | Not encoded as tests (the golden tests planned in `docs/technical-prd.md` do not exist yet). On this run: Brazil N3 is `cannot_tell_weak` (N 0.496, C 2; candidate under the regional and aspirational sets); Mexico N3 `cannot_tell_weak` (N 0.44); South Africa N4 is `cannot_tell_conflicting` under rubric 0.1.6: two class A returns-to-schooling families at +2 against a strongly negative schooling θ (hippos). This is the Mindbook's own reading of the case; under 0.1.5 it was a `candidate`, the outcome the Mindbook warns against. The Workbook's calibration target (Brazil's finance node likely binding, Mexico's not) is not met | `desk/data/BRA.json`, `MEX.json`, `ZAF.json` |

No result on external validity exists. The thresholds are uncalibrated.

### 6.2 What is planned, with kill criteria

| Leg | Design | Pass | Kill | Source |
|---|---|---|---|---|
| Phase 0 screening | Ten countries with public diagnostics, rubric frozen by hash, pre-registration committed before any comparison | Zero adjudicated false rule-outs; "cannot tell" share under 40 percent; no node ruled out in more than 7 of 10; perturbation direction correct in at least 90 percent | Two or more adjudicated false rule-outs stop the work pending a rubric-fix round | `docs/implementation-plan.md` §5 |
| 1. Vintage-locked retrospective | Evidence frozen to releases dated before each reference report's cutoff; reference corpus of MCC constraints analyses and Growth Lab diagnostics coded by two blind coders (kappa ≥ 0.7); perturbation tests; contamination probes for any model arm | False rule-out rate under 1 in 20; perturbation pass rate over 90 percent | False rule-out rate over 1 in 10 after one round of rubric fixes; perturbation pass rate under 75 percent | Workbook 8.2–8.7, 8.10; `docs/plan.md` §6 |
| 2. Prospective, pre-registered | Run on diagnostics in progress; publish a hash and timestamp of the output before the human report appears; compare after; target five to eight resolved cases in 18 months | as Leg 1 | as Leg 1 | Workbook 8.8 |
| 3. Expert panel | Arms A0–A5 on the same vintage packs (published report, junior economist with and without the tool, the tool alone, senior diagnostician with equal and with unconstrained information); blinded pairwise judgments and red-team error counts; inter-expert agreement as the ceiling | Tool not statistically worse than inter-expert agreement; the junior-with-Workbook arm not worse than the senior arm on tier agreement | | Workbook 8.4–8.6 |
| Ex-post outcomes | For references at least seven years old, whether named constraints were relaxed and investment responded | reported with caveats | | Workbook 8.9 |
| Calibration property | Contradiction rate by tier must fall monotonically from probably not to ruled out | required | | Workbook 8.6 |
| Test 4 re-entry | Real vector must beat the 95th percentile of about 99 industry-permuted placebos on five-year stability and on the export-share comparison; joint estimation of the finance and schooling tilts; RCA within the products a vector covers, "not estimable" below about 50 covered products; signal zero when \|θ\| < 2 clustered standard errors; the Workbook 4.7 percentile rule or a documented deviation | all five | the placebo criterion fails | Done in rubric 0.1.6: schooling passed and votes; finance and transport failed and are display only. Changelog; PRD §18 E5 |
| Replication | An outside economist rebuilds the published numbers for three economies from the replication package on a clean machine without asking a question | rebuilt | | PRD §17.3 |
| Plain language | Five non-economists answer the D2 comprehension check | four of five correct | | PRD §17.1 D2 |

Every failed kill criterion will be published, not dropped (PRD §17.2).

---

## 7. Known limitations and deviations from the Workbook

### 7.1 Limitations

1. **Uncalibrated thresholds, some chosen after seeing results.** `E_below` = 2 (rubric 0.1.4), the probably-not mirror rule (0.1.4b), the trade-hub list and the voice threshold of −1.0 (0.1.5) were set after looking at the run. All are Phase 0 calibration items.
2. **Current vintage only.** No vintage lock; the snapshot can change under the user when publishers revise.
3. **Thin and old surveys.** Enterprise Surveys supply most class A/B evidence outside finance; many economies have one wave, often several years old. Recency weights down-weight old waves, and families older than 8 years cannot support a verdict. Two families from one survey wave count as two families when their constructs differ (Kenya's corruption sub-node rests on two such families, both from the 2025 wave).
4. **Self-report bias.** Bribery shares are firms' own answers; the low-voice rule silences them where voice and accountability is very low, in both directions, and voice is only a proxy for candour.
5. **Coverage holes.** N2, N7, N8, N11.taxes and N11.crime are `cannot_tell_data_gap` for every economy; N9 and, from rubric 0.1.7, N11.policy are context; N12 is judged by elimination; N13 needs sector work. The extreme tiers need five voting families and three concordant tests, which few nodes can supply while only one Test 4 vector (schooling, N4) votes.
6. **Goods only.** Trade data, the camels θ and the C11 composition charts cover goods exports; services are invisible.
7. **National averages.** No sub-national, sectoral, firm-size or gender disaggregation enters a tier (the Workbook's inclusion overlay is not computed).
8. **Fragile and conflict-affected settings.** Comparators exclude FCS economies for non-FCS targets; for FCS targets the cross-country expectation is a weak benchmark and the Desk shows a weak-fit note.
9. **The ICR conditions on income.** If a constraint lowered income, part of its signal is absorbed by the income control.
10. **Many indicators, little multiplicity control.** About 170 voting-capable indicators are screened per economy; families, the class weights, the weight floor and the concordance requirement are the only protection against chance signals.
11. **Commodity exporters and small baskets** distort trade-based measures (θ, export concentration, ECI).
12. **Static lists recalled, not verified.** The FCS list and the monetary-regime list are marked "as recalled" in the registry and must be checked against the published lists.

### 7.2 Deviations: where the code does something other than the Workbook

Workbook section 10 records items 9–11, 13, 14 and 16 as amendments; they are listed so a reader of sections 4–6 of the Workbook alone is not misled.

| # | Workbook | Code | Where |
|---|---|---|---|
| 1 | 4.1: the "studentized residual" t = u/s | t is the residual over a robust (MAD) scale of all residuals, with no leverage adjustment; the cross-section is winsorized at 1/99 first; MAD collapse falls back to a mean absolute deviation | `icr.mjs:fitICR`, `stats.mjs:huberIRLS` |
| 2 | 4.1: five fixed regressors | The 12 ESCAP trade-cost series add ln remoteness (rubric 0.1.5) | `icr.mjs:fitICR` (`extraControls`) |
| 3 | 4.1: the within-region variant is reported "where it differs materially" | Always computed and displayed as `t_region`; never used in any signal | `icr.mjs:icrFor` |
| 4 | Section 3: structural peers by Mahalanobis distance including export-basket similarity; 8 to 12 peers | Diagonal Mahalanobis on three continuous features plus a landlocked penalty; no export-basket similarity; 10 peers; FCS, high-income, micro-state and stale-income exclusions | `comparators.mjs:structuralSet` |
| 5 | Section 3: regional peers "income within one income group" | Starts at the target's group and widens until at least 6 members; capped at 15 | `comparators.mjs:regionalSet` |
| 6 | 4.7: peer-rank thresholds "with n ≤ 12" | Applied at any set size (regional sets reach 16); ties take half a rank; small-set ambiguity scores 0 | `signals.mjs:peerGap` |
| 7 | 4.7: rules for each statistic, no rule for combining them | Indicator signal = median of the ICR signal and the active-set peer-gap signal; the other two sets enter only through fragility | `signals.mjs:indicatorSignal` |
| 8 | 4.3: slopes with Newey-West errors; Bai-Perron or Kar-Pritchett-Raihan-Sen breaks | No trend slopes in any signal; G4 is a single-break simplified test | `growth.mjs:singleBreak` |
| 9 | 4.4 and 4.7: co-movement of *private* investment, +1 at sign consistency ≥ 0.7, −2 for a wrong sign at ≥ 0.7; event variant | Exact one-sided binomial sign test (+1 at p ≤ 0.10; −1 at p ≤ 0.10, −2 at p ≤ 0.025); y is total gross fixed capital formation; two specifications only (finance, macro); no event variant (Workbook 10.5) | `signals.mjs:comovement`, `comovementSignal` |
| 10 | 4.5 and 4.7: θ from manufacturing value-added shares (UNIDO) or export shares/RCA; scored by its percentile (≤ 10 → +2, ≤ 25 → +1, ≥ 90 → −2, ≥ 75 → −1) | θ from ln(1 + RCA) within scored products, on HS92 exports (no value-added data). **Scoring resolved in rubric 0.1.6:** a voting θ is scored by the 4.7 percentile rule, plus a two-standard-error gate the Workbook does not have | `ingest/camels.py`, `scorecard.mjs:camelsSignal` |
| 11 | 4.6 and 6.2: every family votes on every test, scaled by its class weight | On the price test only class A/B families vote; C/D inform (Workbook 10.1) | `aggregate.mjs:testScores` |
| 12 | 4.5 and 5 (N11 table, N12 table): Test 4 is the camels-and-hippos θ; new-business density is a class C quantity; transition frequency is class B and conditioned on product-space position | `IC.BUS.NDNS.ZS` (new business density, class C) and `ATLAS.TRANSITIONS` (unconditional new-product count, class C) sit on the `camels` test and vote. T_camels is computed for N11.regulation in 178 economies and N12 in 196. Business density is load-bearing in every one of the seven extreme verdicts of the current run (it is the fifth voting family and the third concordant test). **Resolved in rubric 0.1.6:** class C/D camels families inform and do not vote (`tiers.camels_test_quantity_rule: "ab_only"`), which removed all seven extreme verdicts. Transition frequency is still unconditional | `registry/params.json`; `aggregate.mjs:testScores` |
| 13 | 6.2: E counts every family with a usable signal | E counts voting families only (Workbook 10.2) | `aggregate.mjs:nodeStats` |
| 14 | 6.2: T_k = Σ w r s / Σ w r; N = plain mean of the T_k | Weight floor of 1.0 in the denominator; N weights the price test 2 (Workbook 10.3, 10.4) | `aggregate.mjs:testScores`, `nodeStats` |
| 15 | 6.3: data gap at E < 3 | E < 2 voting families (rubric 0.1.4, in-sample choice) | `params.json` |
| 16 | 6.3: candidate if (N ≥ 0.5 and C ≥ 2) or (N ≥ 1.0 with E < 5 or F = 1) | Candidate if (N ≥ 0.5 and C ≥ 2) or N ≥ 1.0 regardless of E, C and F | `aggregate.mjs:assignTier` |
| 17 | 6.3: probably not only if N ≤ −0.5 and C ≥ 2 | Also if N ≤ −1.0 with any C (rubric 0.1.4b) | `aggregate.mjs:assignTier` |
| 18 | 6.3: ruled out needs "no class A or B family with s ≥ +1" | No class A/B family with s > 0; also AB_count ≥ 2, no informing family dissenting by ≥ 1, the lone-circumvention peer-gap guard, and a sovereign-spread family for N1 and N10 | `aggregate.mjs:assignTier`; `nodes.json` |
| 19 | 6.3: likely binding conditions | Adds the informing-dissent guard | `aggregate.mjs:assignTier` |
| 20 | 6.3: no order of evaluation | Data gap, conflicting, ruled out, likely binding, candidate, probably not, weak; conflicting therefore pre-empts both extremes | `aggregate.mjs:assignTier` |
| 21 | 6.1: credit column is "private credit growth and net cash flow from banks"; override only in the low-demand row | Credit reads high only at growth ≥ 5 percent and credit depth t > −1.5; net cash flow is recorded, not used; investment low at t ≤ −0.5 (unspecified in the Workbook); total, not private, investment; override on any row where the rate is low; rationing override only for `IC.FRM.CRDC.FL.ZS` = +2 (Workbook 10.8) | `topsplit.mjs:topSplit`, `aggregate.mjs:applyTopSplitOverride` |
| 22 | 4.8 and Appendix B: 1,000 bootstrap draws over leave-one-out and 80 percent subsets, sets and thresholds ±20 percent | 300 draws; one common factor scales all magnitude thresholds in a draw; subsets never fall below E_below; leave-one-out is run separately for load-bearing families | `aggregate.mjs:bootstrapRanks` |
| 23 | 6.4: breadth factor in [0.5, 1.5] from exposure | Fixed at 1.0 | `aggregate.mjs:rankNodes` |
| 24 | 6.6: sensitivity includes newest versus vintage-locked data | Not produced; there is no vintage-locked snapshot | — |
| 25 | 2.1: G8, G9, G13, G14; private/public split of G6; G11 labor market residuals beyond unemployment | Not computed; G6 split stated as unavailable; G11 is unemployment only; the growth classification rules are engine-defined (the Workbook gives a template only) | `growth.mjs` |
| 26 | 4.6 and node tables: class assignments | `IC.FRM.OUTG.ZS` class C (was A); Enterprise Survey bank-use shares class C (was B); economy-specific downgrades for hard pegs, trade hubs and low voice; the CPI level and volatility one family (Workbook 10.10, 10.11, 10.16) | `registry/indicators.json`, `scorecard.mjs:buildIndicatorRecords` |
| 27 | Section 5, N11: six sub-nodes with a shared test structure; no roll-up rule | N11 tier = the most binding sub-node, with an evidence tie-break | `aggregate.mjs:rollupNode` |

### 7.3 Inconsistencies between the code and other documents (not Workbook deviations)

These do not change any number but would mislead a reader:

- `docs/engine-spec.md` still describes rubric 0.1 in sections 3.5–3.9 (for example E_below = 3, the 0.7 consistency rule).
- `ENGINE_VERSION` stayed at 0.1.2 through rubric 0.1.4b and 0.1.5, although both changed engine code. Fixed on 29 October: engine 0.1.3, with rubric 0.1.6.
- Under engine 0.1.3, test 4's informing class C families (business density, transition frequency) still counted in E and were marked as voting, although rubric 0.1.6 says they inform only. Fixed in engine 0.1.4: nine N11.regulation tiers move from weak evidence to data gap (`docs/CHANGELOG-rubric.md`).
- The `_comment` in `registry/params.json` says "Rubric parameters v0.1.4"; the header comment of `registry/indicators.json` says "registry v0.1.2"; both files carry `rubric_version: 0.1.5`.
- The top-level `README.md` (70 indicators, about 259,000 observations) and `desk/README.md` (rubric 0.1.2) were stale. Fixed on 29 October.
- The `notes` of `CH.FIN`, `CH.SKILL` and `CH.TIME` said the kill criterion "passed". Fixed in rubric 0.1.6: they now carry each vector's placebo result.
- `tier_reason` said "not computed in prototype" for any missing test. Fixed on 29 October: it now says "no voting evidence".

---

## 8. Versioning and how to cite

**Three version numbers.** Every Scorecard records them in `meta`:

| Component | Version | Where it is set | When it changes |
|---|---|---|---|
| Rubric | 0.1.6 | `rubric_version` in `registry/params.json` and `registry/indicators.json` | any threshold, class, family, node mapping or formula choice; every change has an entry in `docs/CHANGELOG-rubric.md` |
| Engine | 0.1.4 | `ENGINE_VERSION` in `engine/src/scorecard.mjs` | engine formulas (see section 7.3) |
| Data snapshot | 2026-10-24 | `snapshot_id` in `data/snapshot/meta.json` | a new data pull; rebuilds from cache keep the id |

The bootstrap seed hashes the rubric version, so rank-stability draws change with every rubric version by construction.

This note is v0.1. It will stay v0.x until the validation in section 6.2 is run, and becomes v1.0 after the external methods review required by PRD §17.2. Releases with a DOI, a `CITATION.cff` file and permanent URLs are planned (PRD §17.1, D5) but do not exist yet; there is no tagged release to cite.

**Suggested citation until a release exists:**

> The New Foreign Assistance (2026). *Constraint Check Methodology Note, v0.1* (rubric 0.1.6, engine 0.1.4, data snapshot 2026-10-24). Prototype; not validated. Draft of 29 October 2026.

When citing a number, give the economy, node, tier, the indicator and its reference years, and the three versions, for example: "Constraint Check (rubric 0.1.6, engine 0.1.4, snapshot 2026-10-24), Kenya, N11.corruption: candidate; bribery incidence 33 percent of firms (Enterprise Survey 2025), ICR t = 3.6."

**Reproducing a number.** `python ingest/fetch_snapshot.py --offline` rebuilds the snapshot from the raw cache; `node engine/cli.mjs --snapshot data/snapshot --registry registry --out out --desk desk/data` rebuilds every Scorecard; `node --test engine/test` and `python -I -m unittest discover -s tests` run the tests. The replication package with a raw-file manifest and expected hashes (PRD §17.1, D6) is not yet built.

---

## References

- Bai, J. and P. Perron (1998). "Estimating and Testing Linear Models with Multiple Structural Changes." *Econometrica* 66(1).
- Barro, R. and J.-W. Lee (2013). "A New Data Set of Educational Attainment in the World, 1950–2010." *Journal of Development Economics* 104.
- Ciccone, A. and E. Papaioannou (2009). "Human Capital, the Structure of Production, and Growth." *Review of Economics and Statistics* 91(1).
- ESCAP and World Bank. ESCAP-World Bank Trade Cost Database, 2026 release.
- Gebru, T. et al. (2021). "Datasheets for Datasets." *Communications of the ACM* 64(12).
- Growth Lab at Harvard University. International Trade Data (HS 92), Harvard Dataverse, version 18.0; Economic Complexity rankings.
- Hausmann, R., B. Klinger and R. Wagner (2008). "Doing Growth Diagnostics in Practice: A 'Mindbook'." CID Working Paper 177, Harvard University.
- Hausmann, R., L. Pritchett and D. Rodrik (2005). "Growth Accelerations." *Journal of Economic Growth* 10(4).
- Hausmann, R., D. Rodrik and A. Velasco (2005). "Growth Diagnostics." In J. Stiglitz and N. Serra (eds.), *The Washington Consensus Reconsidered*, Oxford University Press, 2008.
- Huber, P. J. (1964). "Robust Estimation of a Location Parameter." *Annals of Mathematical Statistics* 35(1).
- Hummels, D. and G. Schaur (2013). "Time as a Trade Barrier." *American Economic Review* 103(7).
- Iacovone, L., E. Ferro, M. Pereira-Lopez and V. Zavacka (2019). "Banking Crises and Exports: Lessons from the Past." *Journal of Development Economics*; replication data, Mendeley Data dwnb9fspdn.
- Kar, S., L. Pritchett, S. Raihan and K. Sen (2013). "Looking for a Break: Identifying Transitions in Growth Regimes." *Journal of Macroeconomics* 38.
- Lovell, M. (1963). "Seasonal Adjustment of Economic Time Series and Multiple Regression Analysis." *Journal of the American Statistical Association* 58(304).
- Millennium Challenge Corporation. *Guidelines for the Constraints to Economic Growth Analysis.*
- Mitchell, M. et al. (2019). "Model Cards for Model Reporting." *Proceedings of FAT\* 2019*.
- Montenegro, C. and H. Patrinos (2014). "Comparable Estimates of Returns to Schooling Around the World." World Bank Policy Research Working Paper 7020.
- Newey, W. and K. West (1987). "A Simple, Positive Semi-Definite, Heteroskedasticity and Autocorrelation Consistent Covariance Matrix." *Econometrica* 55(3).
- Psacharopoulos, G. and H. Patrinos (2018). "Returns to Investment in Education: A Decennial Review of the Global Literature." World Bank Policy Research Working Paper 8402.
- Rajan, R. and L. Zingales (1998). "Financial Dependence and Growth." *American Economic Review* 88(3).
- World Bank. World Development Indicators; Worldwide Governance Indicators; Enterprise Surveys (Data360); Global Financial Development Database; Doing Business (2004–2020); Human Capital Index.
- IMF. World Economic Outlook (October 2026); International Financial Statistics and Financial Soundness Indicators via SDMX 3.0.
- Prindex (ODI and Global Land Alliance). Rounds 1 and 2 public data, 2024 release.
