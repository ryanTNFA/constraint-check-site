# Constraint Check: datasheet and model card

*Release: rubric 0.1.6, engine 0.1.4, data snapshot 2026-10-24. The New Foreign Assistance (TNFA). Draft of 29 October 2026 (PRD section 17, D4). Part 1 follows "Datasheets for Datasets" (Gebru et al. 2021) for the data snapshot. Part 2 follows "Model Cards for Model Reporting" (Mitchell et al. 2019) for the rubric and engine. Section references (§) are to the Methodology Note, `docs/methodology-note.md`.*

---

## Part 1. Datasheet for data snapshot 2026-10-24

### Motivation

- **Why was it built?** To give a growth diagnostic a common evidence base: for every economy, the public indicators that the Hausmann-Rodrik-Velasco method reads, at one date, in one format. The aim is that a diagnosis can be checked and repeated rather than assembled by hand.
- **Who built it?** The New Foreign Assistance (TNFA), from its own resources; no outside funder, grant or contract paid for the work, and no data provider or diagnostic publisher was consulted on the design.

### Composition

- **What is an instance?** One observation: an indicator, an economy, a year and a value (`data/snapshot/observations.csv`).
- **How many?** 515,713 observations of 195 indicators for 217 economies, years 1950 to 2026. Most indicators start in 1990 or later.
- **Economies.** The World Bank's list of economies, aggregates removed: 217, of which 44 are landlocked (`countries.json`).
- **Indicators.** 204 in the registry: 195 with data, 8 derived by the engine (for example real rates computed with the Fisher formula), and 1 static. By evidence class (§4.2): A 48, B 17, C 101, D 4, X 34. `docs/codebook.md` lists every one with its definition, source, unit, transformation, direction, class, node, test and coverage.
- **Is anything missing?** Yes, a lot, and unevenly.
  - Enterprise Surveys, the main source of class A and B evidence outside finance, have one or two waves for most economies, often several years old.
  - Small states, high-income economies and fragile and conflict-affected states have the thinnest coverage.
  - Services trade is absent; the trade data cover goods only.
  - There is no sub-national, sectoral, firm-size or gender breakdown.
- **Is it a sample?** It covers every economy on the World Bank's list that a source reports. It is not a sample, but coverage depends on what each publisher collects.
- **Confidential or personal data?** None in the snapshot: every value is a country aggregate. One input, Prindex, is anonymised public survey microdata; `ingest/src_prindex.py` computes country shares from it, and only those shares enter the snapshot. The microdata stay in the raw cache.

### Collection process

- **How?** Programs in `ingest/` download each source's public API or bulk file, validate it and cache it in `data/raw/` (§2.2; `ingest/README.md`). Each cached file has a sidecar recording its URL, method, time and size.
- **When?** The World Bank, IMF and Growth Lab files on 24 October 2026; the extra connectors between 26 and 29 October 2026. `data/snapshot/meta.json` and `data/extra/<source>/meta.json` record the dates.
- **Hand-fetched inputs.** Three: the Hummels-Schaur replication package (openICPSR, needs a sign-in), the Ciccone-Papaioannou schooling-intensity table (transcribed from the paper), and the ESCAP trade-cost user note and metadata. Their hashes are in `data/MANIFEST-raw.sha256`.
- **The home page's Long View chart** (`desk/data/longview.json`, `ingest/src_longview.py`) uses two series that enter no rating: GDP per capita by world region, 1820 to 2022, from the Maddison Project Database 2023 (Bolt and van Zanden 2024), and the share of people in extreme poverty, 1820 to 2018, from Moatsos (2021); both as published by Our World in Data under CC BY 4.0.

### Preprocessing

- Economies only: aggregates and WEO regional groups are dropped.
- Years outside each indicator's registry range, after the snapshot year, or (for the WEO) after 2025 are dropped, the last as projections.
- No values are imputed or interpolated. Duplicate economy-years are never written.
- Later steps belong to the engine, not the snapshot: three-year reference means, winsorizing at the 1st and 99th percentiles for fits, and transformations (§3.1, §3.2).
- The raw files are kept. `data/MANIFEST-raw.sha256` hashes all 1,009 of them, and a rebuild from them is byte-identical apart from run timestamps (`replicate.py --level raw`).

### Uses

- **Intended:** as the evidence base for Constraint Check's scorecards, and for anyone who wants to check or rerun them.
- **Other reasonable uses:** cross-country descriptive work, if the user takes each series' own definition and licence from the codebook.
- **Uses to avoid:**
  - Treating the snapshot as vintage-locked history. It is current vintage: a publisher's revision changes the next refresh (§7.1, item 2).
  - Comparing levels across indicators from different sources without reading their units and definitions.

### Distribution

- In the Constraint Check repository: the snapshot, the extra connectors' observations and the silver trade table.
- The raw cache (698 MB) is to be archived with each release, except the openICPSR package.
- Licences differ by source and are listed per source in `REPLICATION.md`, checked 3 November 2026 (one pending: ITU's permission for derived values). TNFA's own licence: Apache 2.0 for code, CC BY 4.0 for documents and derived data (`LICENSE`, `docs/LICENSE.md`).

### Maintenance

- TNFA maintains it.
- Each refresh is a new snapshot id, recorded in `data/snapshot/meta.json`. A change to the rubric is recorded in `docs/CHANGELOG-rubric.md`.
- Errata will go on a public errata page, which does not exist yet (PRD §17.1, D5).

---

## Part 2. Model card for the rubric and engine

### Model details

- **What it is.** A rule-based scoring system, not a statistical model fitted to an outcome. For each economy and each node of the growth-diagnostic tree, the engine computes up to four tests from public indicators, combines them into a node score N, and assigns a tier:
  - likely binding;
  - candidate ("worth a closer look");
  - three kinds of "cannot tell" (conflicting, weak evidence, data gap);
  - probably not;
  - ruled out.
- **The four tests** (§1.3): price (is the input expensive or scarce?); changes (did investment move when the input eased or tightened?); circumvention (are firms paying to work around it?); camels and hippos (do the activities that thrive need little of it?).
- **Statistics:** income-conditional residuals by Huber robust regression; peer gaps against three comparator sets; an exact sign test for co-movement; the pooled Rajan-Zingales regression for test 4 (§3).
- **Versions.** Rubric 0.1.6 (`registry/params.json`, `registry/indicators.json`). Engine 0.1.4 (`engine/src/`, pure JavaScript, the same code in the batch run and in the browser).
- **Developer:** TNFA, 2026. Not yet externally reviewed.

### Intended use

- **Triage.** Before a diagnostic or a program design, it shows which candidate constraints the public evidence already argues against, which deserve a closer look, and what to check next.
- **It is licensed to say stop, not go** (§1.4). A "probably not" or "ruled out" is meant to stop an argument that the public data cannot support. A "candidate" means "look here", not "this binds".
- **Users:** economists running diagnostics, program officers and analysts preparing for one, and reviewers checking a claim.

### Uses out of scope

- Funding, allocation or eligibility decisions, alone or as a main input.
- Ranking or comparing countries. Tiers are about one economy's nodes, not a league table.
- Fragile and conflict-affected settings, where the cross-country benchmark is weak (§7.1, item 8). The Desk flags these economies.
- Sub-national targeting, or anything about a sector, firm size or group of people. All inputs are national averages.
- Saying what happened after the data year, or forecasting.
- Treating a "candidate" as a finding. Only field work, microdata and judgement can establish that a constraint binds.

### Factors

What changes how well the rubric works for an economy:
- data depth: number of evidence families and how recent they are;
- the comparator set chosen;
- being a commodity exporter or having a small export basket, which distorts trade-based measures;
- size (micro-states);
- fragility;
- how recent the economy's Enterprise Survey wave is.

The scorecard reports each node's tier under all three comparator sets and its fragility to dropping one family (§4.7).

### Metrics

- **No accuracy metric exists yet.** The thresholds are uncalibrated, and some were chosen after seeing results (§7.1, item 1).
- The headline metric, when one is reported, is the **false rule-out rate**: how often the rubric says "ruled out" or "probably not" about a constraint later found to bind (§6.2).
- Other reported quantities, per run:
  - the tier distribution;
  - rank stability across 300 bootstrap draws;
  - each node's fragility;
  - test 4's placebo results.

### Evaluation data

- **None external yet** (§6.2).
- What exists (§6.1):
  - 96 engine tests;
  - a synthetic 150-economy run in which planted constraints receive the planted verdicts;
  - an independent statsmodels re-estimate of the residuals (largest gap 0.030 in t);
  - numpy reference tests for test 4;
  - adversarial reviews;
  - the replication check, which reproduces all 1,424 outputs.

### Results on the current run

- **Tiers.** All 217 economies, 18 scored node rows each: likely binding 0, candidate 238, conflicting 30, weak evidence 1,443, data gap 2,025, probably not 170, ruled out 0.
  - Nine rows in ten are a "cannot tell".
  - No row reaches either extreme. Under rubric 0.1.5 seven did, and every one rested on a class C quantity; they were removed by rule, not by new evidence (§4.9).
- **Test 4 placebo check** (99 industry permutations, 95th percentile, rubric 0.1.6):
  - Schooling passed and votes on N4.
  - External finance and transport time failed and are shown only.
- **Informal Mindbook cases** (§6.1):
  - Brazil's finance node is "cannot tell (weak)" under the structural comparators and "candidate" under the others.
  - South Africa's human capital node is "conflicting", which is the Mindbook's own reading.
  - The Workbook's calibration target (Brazil's finance node likely binding, Mexico's not) is not met.

### Known failure modes

- **Thin data reads as "cannot tell".** That is the intended failure, but it means the tool says little about the economies that most need a diagnosis.
- **Stale surveys.** One old Enterprise Survey wave can carry a node. Recency weights reduce this, but two constructs from one wave still count as two families.
- **Self-report.** Bribery and obstacle shares are firms' own answers. The low-voice rule silences them where voice and accountability are very low.
- **Commodity exporters and small baskets** distort θ, export concentration and complexity measures.
- **The income control absorbs part of the signal.** Where a constraint has already lowered income, conditioning on income hides part of it (§7.1, item 9).
- **Many indicators.** About 170 voting-capable indicators are screened per economy. Only families, class weights and the concordance rule protect against chance signals.
- **Static lists recalled, not verified.** The fragile-states list and the monetary-regime list must be checked against their published versions.

### Ethical considerations

- **The main risk is misuse:** a "probably not" read as permission to cut support, or a "candidate" read as a mandate.
- The Desk mitigates this in three ways:
  - it gives the plain meaning of each tier next to it;
  - it shows "cannot tell" as a first-class result with what would resolve it;
  - it warns in fragile settings.
- The model card and the plain-language guide (`docs/how-it-works.md`) say what a verdict does not mean.

### Caveats and recommendations

- Read a tier with its evidence, which is one click away on every node card.
- Check the tier under the other comparator sets. If they disagree, so does the evidence.
- Treat every number as dated: the snapshot is current vintage.
- Cite the release: rubric, engine and snapshot versions (§8).
