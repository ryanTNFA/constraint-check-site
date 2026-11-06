// @ts-check
// The tour (docs/learn-tour-plan.md): fifteen stops over the live pages, worked on Indonesia. Data only; tour.mjs draws them.
// Each stop names the page it opens (with the country and any state in the link), the one element it is about (an id on
// that page's HTML, or one of three shell-drawn controls), the words beside it, and sometimes a check question. Every
// number and rating quoted here is pinned to desk/data/IDN.json and to the rubric by tests/test_tour.py, so a rubric
// change cannot silently make a stop lie. The stops speak in the tool's voice only: no TNFA view, no "fund this".
export const RUBRIC = '0.2.9';
export const TOUR_ISO = 'IDN';
export const TOUR_COUNTRY = 'Indonesia';

/**
 * @typedef {object} Stop
 * @property {number} n the stop's number, 1-based and consecutive
 * @property {string} title the stop's title
 * @property {string} page the page the stop opens, root-absolute, with the country and the query state it needs
 * @property {Record<string, string>} [hash] extra hash keys the stop sets (the evidence setting, the comparator set)
 * @property {boolean} [predict] Predict first on at this stop
 * @property {string} anchor a CSS selector for the one element the stop is about
 * @property {string} anchorName the element in words, for the fallback when it has not drawn
 * @property {string[]} say what this is and how to read it, two or three short paragraphs
 * @property {string[]} [look] what to look for, as bullets
 * @property {{q: string, a: string}} [check] a check question with its answer
 * @property {string} [mindbook] the Mindbook section the stop rests on
 */

/** @type {Stop[]} */
export const TOUR = [
  {
    n: 1, title: 'One country at a time', page: '/growth-test-site/desk/countries.html', anchor: '#ask', anchorName: 'the country search',
    say: [
      'Every reading starts with one country and one question: what holds back private investment here, now? The tool never ranks countries against each other, and the list of economies below the map is alphabetical for that reason.',
      `This tour reads ${TOUR_COUNTRY}. Type it here, or use Next: each stop opens the page it is about and rings the one thing to look at.`,
    ],
    look: ['The search opens a country’s Bottom line, the page every reading starts from.', 'The map shows one area’s rating across economies, never a verdict on a country.'],
  },
  {
    n: 2, title: 'The question, and the one sentence', page: `/growth-test-site/desk/country.html?iso=${TOUR_ISO}`, anchor: '#k-answer', anchorName: 'the one-sentence answer',
    say: [
      'Every page opens with the question it answers and its answer in one sentence. The sentence says where the public data point first, what they argue against, and how much they cannot settle.',
      'Read its verbs. The tool is licensed to say "stop arguing about", "look closer" and "can’t settle yet". It never says that a constraint binds and never says "fund this": from public data it cannot, and from the country someone still has to.',
    ],
    look: ['"Worth a closer look and not established": a flag asks a question, it does not answer one.', 'The count of unsettled areas: for most economies it is most of the twelve.'],
  },
  {
    n: 3, title: 'The three lists, predicted first', page: `/growth-test-site/desk/country.html?iso=${TOUR_ISO}`, predict: true, anchor: '#statements-body', anchorName: 'the three lists',
    say: [
      'Predict first is on: the lists are hidden until you reveal them. Write down what you expect in each for Indonesia (which areas, and how many), then use "Reveal everything on this page" in the bar.',
      'Then compare. Each list serves a different decision. "Stop arguing about" is where the evidence leans away. "Look closer" is where a field visit should start. "Can’t settle yet" says what to measure first, grouped by the reason the data fall short.',
    ],
    look: ['Two areas the data argue against: electricity and macro risk, each "probably not", which is weaker than "ruled out".', 'One area worth a closer look: corruption, under micro risk.', 'Nine areas the public data cannot settle, each with its reason and a next step.'],
    check: { q: 'Electricity is on Indonesia’s "stop arguing about" list. Does that mean power is not a problem for Indonesian firms?',
      a: 'No. It means the public evidence leans away from power as what holds private investment back: connections come fast, outages are few for its income, and only a few firms own a generator. "Probably not" is a lean at a flag’s low bar, not a clear; "ruled out" would need three agreeing tests, five voting sources and no high-quality measure the other way.' },
    mindbook: 'Mindbook, the asymmetry of errors: a false clear costs more than an extra look.',
  },
  {
    n: 4, title: 'The first decision is a direction', page: `/growth-test-site/desk/country.html?iso=${TOUR_ISO}`, anchor: '#k-fork', anchorName: 'the first decision’s line',
    say: [
      'Above the lists sits the tree’s first fork: is investment held back because finance is dear or rationed, or because there are few projects worth financing? Both are constraints, so the fork is never rated "constraint or not". Its four tests are the finance tests, and its score is the finance side’s: positive leans to costly finance, negative to low returns.',
      'For Indonesia the four tests lean to costly finance, not established, while the three quick statistics the method reads first fall between the table’s rows. The compact tree beside the question shows the same fork and the two branches below it.',
    ],
    look: ['"Leans to finance", with the fact that carries it: the share of firms fully credit constrained.', 'In the compact tree, the finance branch above and the low-returns branch below, each square an area’s rating.'],
    mindbook: 'Mindbook, the top of the tree: cost of finance versus low returns.',
  },
  {
    n: 5, title: 'The growth problem', page: `/growth-test-site/desk/areas.html?iso=${TOUR_ISO}`, anchor: '#growth', anchorName: 'the growth problem panel',
    say: [
      'Before the tree, the symptom. Indonesia grew about 3.3% a year over the last ten years, and investment runs near 29% of GDP, above what its income predicts (about 1.3 standard deviations). Growth diagnostics asks what limits private investment; when investment is not low, the question is sharper, not moot: what keeps high investment from buying more growth, and which few constraints would matter if investment faltered.',
      'Every number here is read as a surprise: the gap from what an economy at Indonesia’s income would show, in standard deviations, not the level.',
    ],
    look: ['The growth record and its classification.', 'The investment residual: the gap from the income-conditional expectation, with its sign.'],
  },
  {
    n: 6, title: 'Three statistics, then four tests', page: `/growth-test-site/desk/areas.html?iso=${TOUR_ISO}`, anchor: '#topsplit', anchorName: 'the first-decision table',
    say: [
      'The method starts with three quick statistics: the real lending rate, credit growth and investment. A high rate with slow credit and low investment reads as a finance-supply problem; a low rate with low investment reads as low demand for investment, which points to low returns. Indonesia’s rate is high, credit grew slowly, but investment is not low, so the table says "indeterminate": the pattern fits no row.',
      'The four finance tests, which add rationing, co-movement and working-around measures, lean to finance. When the two readings differ, the page shows both: a pattern is not a verdict.',
    ],
    look: ['The row the three statistics fall in, and the thresholds beside each statistic.', 'The sentence that reads the fork from the four tests, apart from the table.'],
  },
  {
    n: 7, title: 'Four tests on one area, and who votes', page: `/growth-test-site/desk/areas.html?iso=${TOUR_ISO}&node=N0`, anchor: '#drawer .tests', anchorName: 'the four tests in the open card',
    say: [
      'A binding constraint shows in four ways. Its price is high (test 1). Investment moves when it moves (test 2). Firms pay to work around it (test 3). Activities that need little of it do unusually well (test 4, camels and hippos). One test can be fooled; the method asks several kinds of evidence to agree.',
      'Each measure carries a class. A measures the cost directly (a price: the real lending rate, the share of firms fully credit constrained). B is behaviour that only makes sense if the constraint binds (borrowers discouraged by terms; firms financing investment from their own funds). C is a quantity or a survey answer that cannot tell cause from effect (bank liquidity, loan rejections): it informs but does not vote on the price test. D is an expert rating; it never decides.',
      'On the fork for Indonesia the price test points toward costly finance and the workarounds test is near zero; two tests agree, where "points to" would need three. So the card says "leans to finance", and "Why not higher" says exactly why.',
    ],
    look: ['The four test cells, each with its score from −2 to +2 and the families behind it.', 'The "informs, does not vote" notes on class C measures.', 'The fold "Why not higher, why not lower".'],
    check: { q: 'Two of the four tests agree that finance looks costly in Indonesia. Why does the card stop at "leans to finance"?',
      a: 'Because a finding needs several kinds of evidence to agree: "points to" needs a score of 1 or more and three agreeing tests, and the fork has a score of about 0.5 with two. One strong test can flag; it takes concordance to establish.' },
    mindbook: 'Mindbook, the four tests and concordance.',
  },
  {
    n: 8, title: 'Surprise, not level', page: `/growth-test-site/desk/evidence.html?iso=${TOUR_ISO}&node=N0&ind=IC.FRM.CRDC.FL.ZS&panel=indicator`, anchor: '#sec-c1', anchorName: 'the income scatter',
    say: [
      'The Analyst View shows every measure behind a rating. This chart places every economy’s value against its income, with the line the tool expects a country to sit on. Indonesia’s share of firms fully credit constrained is about 14.8%, the second-highest of its comparison countries, and above the line for its income. That gap, in standard deviations, is the unit of evidence; the level alone would mostly say how rich a country is.',
      'The class key above the charts says what each measure is (A, B, C, D) and whether it votes. This one is class A: a price-like measure of rationing, and it votes on the price test.',
    ],
    look: ['Indonesia marked against the fitted line; the comparison countries labelled.', 'The gap in standard deviations in the readout under the chart.', 'The class key, folded, above the rail.'],
    mindbook: 'Mindbook, benchmarking: compare with what the country’s income predicts, not with the world.',
  },
  {
    n: 9, title: 'What leaning away looks like', page: `/growth-test-site/desk/evidence.html?iso=${TOUR_ISO}&node=N5`, anchor: '#node-verdict', anchorName: 'the verdict line for electricity',
    say: [
      'Electricity is "probably not" for Indonesia. The price is low for its income: a new connection takes about five days, among the fewest of the comparison countries, and outages are rare. The workaround is absent: few firms own a generator, the behaviour that only makes sense when power binds. And the camels test is silent: sectors that need power grow no slower than the rest.',
      'A low price and no workaround together are what a clear looks like. It still stops at "probably not", because "ruled out" needs more agreeing tests and sources than public data usually hold.',
    ],
    look: ['The tabs for the four tests: the price test and the workarounds test speak, the others are silent or shrunk.', 'The "Depends on the comparison countries" mark: against fast-growing economies electricity turns unclear.'],
    check: { q: 'Few Indonesian firms call electricity a major obstacle. Is that why the tool leans away?',
      a: 'No. Complaints are a class C quantity: they inform and never vote. The lean comes from a low price (fast connections, few outages) and no workaround (few generators). Silence alone would not be a clear; the "why not lower" line names what is still missing.' },
    mindbook: 'Mindbook, price before quantity; the camels and hippos test.',
  },
  {
    n: 10, title: 'Test 2: did investment move with it?', page: `/growth-test-site/desk/evidence.html?iso=${TOUR_ISO}&node=N0&test=c6`, anchor: '#sec-c6', anchorName: 'the changes test',
    say: [
      'The changes test asks whether investment moved the way the theory predicts when the constraint eased or tightened: here, when the real cost of finance fell, did investment rise? Across year pairs it is a sign test: moved together more often than chance, or not.',
      'It is one family, class C, and it is shrunk when the series is thin, so it rarely decides on its own. For Indonesia it leans toward costly finance, weakly. The tool runs no cross-country growth regressions: this is the only place it reads time.',
    ],
    look: ['The count of agreeing year pairs and its p-value.', 'The shrunk score beside the raw one.'],
  },
  {
    n: 11, title: 'Test 4: camels and hippos', page: `/growth-test-site/desk/evidence.html?iso=${TOUR_ISO}&node=N4&test=c12`, anchor: '#sec-c12', anchorName: 'the camels test',
    say: [
      'In a desert, camels thrive. If skills were the binding constraint, the activities that need few skilled workers would do unusually well and the skill-hungry ones unusually badly. The chart tilts an economy’s exports against each product’s skill intensity; the slope is θ. A negative θ means camels. The test counts only where it beat a shuffled version of itself.',
      'For Indonesia the tilt is flat: no camels, no hippos. Skills stay "can’t tell: one kind of evidence". Years of schooling and enrolment are quantities, so they inform and never vote; the price of skills (the return to a year of schooling) is old, and the one behaviour that speaks, educated workers unusually unemployed, points toward a problem on its own.',
    ],
    look: ['The fitted tilt and θ; the placebo note under the chart.', 'The hippo gap below: whether the skill-heavy products are the ones missing.'],
    mindbook: 'Mindbook, the camels and hippos test; low quantity is not scarcity.',
  },
  {
    n: 12, title: 'One strong test is a flag, not a finding', page: `/growth-test-site/desk/areas.html?iso=${TOUR_ISO}&node=N11.corruption`, anchor: '#drawer .tests', anchorName: 'the four tests in the open card',
    say: [
      'Corruption is Indonesia’s one "worth a closer look". The price test is strong: the share of firms asked for a bribe and the share expected to give gifts to tax officials both sit far above what income predicts (class A, both from the 2023 firm survey). Only one of the four tests speaks, so the flag comes by the alternative rule: one test at or above +1 can flag on its own.',
      'It cannot do more. "Likely a main constraint" needs three agreeing tests; here there is one, and the expert index (class D) sits where income predicts and informs without voting. "Why not higher" says this in one line. Under the Cautious reading, which asks for more sources, the flag drops to unclear.',
    ],
    look: ['The price test’s score and its two voting families from one survey year.', 'The expert index marked "informs, does not vote".'],
    check: { q: 'Corruption has the highest score on Indonesia’s page. Why is it not "likely a main constraint"?',
      a: 'Only one of the four tests speaks, and it rests on two voting families from one survey year. A flag needs one test; a finding needs several kinds of evidence to agree. The card’s "why not higher" line says exactly that.' },
    mindbook: 'Mindbook, the four tests and concordance.',
  },
  {
    n: 13, title: 'Three readings of the same evidence', page: `/growth-test-site/desk/country.html?iso=${TOUR_ISO}`, hash: { setting: 'exploratory' }, anchor: '.setting-switch', anchorName: 'the Reading switch in the bar',
    say: [
      'The bar offers three readings of the same evidence. Standard is the only one to cite. Exploratory makes it easier to flag an area for a closer look, never easier to rule one out; Cautious asks for more and stronger evidence before rating anything. The figures never change; only the ratings do.',
      'This stop has switched to Exploratory. For Indonesia, bank lending (the list calls it intermediation) and transport join "look closer" (each on evidence that leans toward a problem without reaching the Standard bar). Switch to Cautious and the fork, corruption and macro risk all drop to unclear. If a conclusion survives all three, it is worth more.',
    ],
    look: ['The "Look closer" list, longer under Exploratory.', 'The tag beside each area that says whether it holds under all three readings.'],
    check: { q: 'Under Exploratory, transport is "worth a closer look" for Indonesia. Should a program be built around it?',
      a: 'Not on this. Exploratory lowers the bar to flag, and transport rests on one kind of evidence (border compliance costs, high for its income). It is a reason to ask in-country, with Standard, the citable reading, still saying "can’t tell".' },
  },
  {
    n: 14, title: 'Comparators are hypotheses', page: `/growth-test-site/desk/summary.html?iso=${TOUR_ISO}`, hash: { set: 'aspirational' }, anchor: '#heat-wrap', anchorName: 'the heat map',
    say: [
      'A comparison set is a hypothesis about who Indonesia should resemble. The default compares it with economies of similar income and structure; this stop has switched to Aspirational, economies that grew fast from Indonesia’s income. One row per area: the benchmark, the four tests, the rating under the chosen set, and your own conclusion beside it.',
      'Against the fast growers the fork and electricity turn unclear, and macro risk stays "probably not". A verdict that changes with the comparison set is weaker, and the right next step is to ask why Indonesia looks worse than the fast growers on that measure.',
    ],
    look: ['The comparator control above the table, now on Aspirational.', 'The "Depends on the comparison countries" marks, and the hover that shows each set’s rating.'],
    check: { q: 'Electricity is "probably not" against similar economies and unclear against fast growers. Which is right?',
      a: 'Neither by itself. A comparison set is a hypothesis. The fact that the lean weakens against fast growers is itself the finding: Indonesia’s power is cheap for its income but not by the standard of economies that grew out of it, so ask in-country what they did.' },
    mindbook: 'Mindbook, choosing comparators; the diagnosis as a narrative that fieldwork must test.',
  },
  {
    n: 15, title: 'Write it down, then test yourself', page: `/growth-test-site/desk/country.html?iso=${TOUR_ISO}`, anchor: '#tools', anchorName: 'the memo and the briefing',
    say: [
      'Two tools close a reading. The memo writes the Bottom line out as a document, with the evidence behind each rated area and the questions worth two days in-country. The idea briefing packs everything a program idea needs to be checked against the evidence.',
      'Before you open either, write Indonesia’s diagnosis in five sentences: the question, the first decision, what is flagged and on which test, what is unsettled and why, and what fieldwork must test. Then compare it with the memo. The exit test on the Learn page is the same exercise on a country you have not seen.',
    ],
    look: ['The memo, generated from the same words as the page.', 'The exit test, linked from the Learn page.'],
    mindbook: 'Mindbook, the diagnosis as a narrative.',
  },
];

/** The stop numbered n, or null. @param {string | number | null | undefined} n */
export const stopByN = (n) => TOUR.find((s) => s.n === Number(n)) || null;
