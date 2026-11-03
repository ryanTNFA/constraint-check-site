// The guided path (docs/teaching-plan.md, section 3): eight lessons on the pages that already exist, worked on Kenya,
// with Senegal's human-capital card borrowed for the clearing lesson. Pinned to rubric 0.2.0: tests/test_lessons.py
// checks every tier a lesson quotes against desk/data, so a rubric change cannot silently break a lesson.
// Lessons speak in the tool's voice only: no TNFA view, no comparison of countries by their flags.
export const RUBRIC = '0.2.0';

export const LESSONS = [
  {
    n: 1, page: '/constraint-check-site/desk/learn.html', title: 'How a country gets read',
    task: 'Scroll the method once, on Kenya: the question, surprise as evidence, the growth problem, the top split, four tests on one area, the tree, the asymmetry, the three lists.',
    check: 'Why does the tool clear an area more carefully than it flags one?',
    answer: 'Because its verdicts are used to stop work. A false clear sends attention away from a constraint that binds, so "ruled out" needs a low price, no workarounds, five voting families and three agreeing tests, while one strong test can flag. "Probably not" sits at a flag’s low bar, so it never closes a debate alone.',
    mindbook: 'Mindbook, chapter 1 (the question) and the four principles.',
  },
  {
    n: 2, page: '/constraint-check-site/desk/country.html?iso=KEN', predict: true, title: 'The Bottom line, predicted first',
    task: 'With Predict first on, write down what you expect in each of the three lists for Kenya: which areas, and how many. Then reveal them and compare.',
    check: 'Kenya’s "stop arguing about" list is empty. Is that a failure of the tool?',
    answer: 'No: it is a finding. 112 of 217 economies have nothing on this list, and none has a "ruled out". An area gets on it when its evidence leans away on two tests, or strongly on one. No Kenyan area does: among the areas the list draws on, the lowest net score is macro risk, at −0.06.',
    mindbook: 'Mindbook, the asymmetry of errors: a false clear costs more than an extra look.',
  },
  {
    n: 3, page: '/constraint-check-site/desk/areas.html?iso=KEN', title: 'The growth problem and the first fork',
    task: 'Read Kenya’s growth record: about 2.5% a year over 2016 to 2025, investment near 17.6% of GDP, about one standard deviation below what its income predicts. Then follow the top split (under "For analysts"): a high real lending rate with low credit growth and low investment reads, provisionally, as the supply of finance constrained.',
    check: 'Which number picks the branch at the first fork, and why that one?',
    answer: 'The price of finance, the real lending rate. If investment is low while finance is cheap, the problem is low returns; if finance is dear and credit is not growing, the problem is finance. A price tells you which side the shortage is on; a quantity alone cannot.',
    mindbook: 'Mindbook, the top of the tree: cost of finance versus low returns.',
  },
  {
    n: 4, page: '/constraint-check-site/desk/evidence.html?iso=KEN&node=N11.corruption&ind=IC.FRM.BRIB.ZS', title: 'Surprise, not level',
    task: 'Find Kenya on the bribery scatter: about a third of firms were asked for a bribe, far above the line for its income and the highest of the eleven economies compared. Then open the governance index, which sits where income predicts, and human capital, where the price of skills is not observed: only quantities sit on the price test, and they do not vote.',
    check: 'Kenya’s governance index is poor by world standards. Why is it not evidence of a constraint here?',
    answer: 'Because it sits where a country at Kenya’s income is expected to sit. The unit of evidence is the surprise, the gap from the income-conditional expectation, not the level. And a composite index informs; it never decides.',
    mindbook: 'Mindbook, benchmarking: compare with what the country’s income predicts, not with the world.',
  },
  {
    n: 5, page: '/constraint-check-site/desk/areas.html?iso=KEN&node=N0', title: 'Four tests on one area',
    task: 'On the first decision’s card, sort the finance evidence by test: the price test leans toward a problem (a high real rate, discouraged borrowers), the workarounds test leans away (firms rely less on own funds, and more on banks, than expected), and co-movement, whether investment moved with the rate, is no better than chance. Then open corruption and say why one strong price test stops at "worth a closer look". Then compare electricity: 2% of firms call power their biggest obstacle, yet 61% own a generator, the most of eleven. Few complaints are not a clear.',
    check: 'Corruption has the highest net score on Kenya’s page (1.75). Why is it not "likely a main constraint"?',
    answer: 'Only one of the four tests speaks, and it rests on two voting families from one survey year. A flag needs one test; a finding needs several kinds of evidence to agree. The card’s "why not higher" line says exactly that.',
    mindbook: 'Mindbook, the four tests and concordance.',
  },
  {
    n: 6, page: '/constraint-check-site/desk/areas.html?iso=SEN&node=N4', predict: true, title: 'What leaning away looks like',
    task: 'Senegal’s schooling is low: 3.7 years on average, two standard deviations below what its income predicts. With Predict first on, write down your verdict on human capital, then reveal it and read why: educated workers are unusually unemployed, skill-intensive exports do well (the camels test, which counts because it beats shuffled versions of itself), and the return to schooling sits at expected, though that measure is from 2011.',
    check: 'Low schooling, yet skills are probably not the constraint. Why, and why does it stop at "probably not" rather than "ruled out"?',
    answer: 'Low schooling is a quantity; scarcity would show as a high price for skills, and the price sits at expected while workarounds and the camels test point away. "Ruled out" needs more, as the card’s "why not lower" line and its rule detail say: a net score of −1 or below (Senegal: −0.7), three tests agreeing (only two agree), a price pointing away (at expected), five voting families (four), and no quantity dissenting (schooling does).',
    mindbook: 'Mindbook, price before quantity; the camels and hippos test.',
  },
  {
    n: 7, page: '/constraint-check-site/desk/country.html?iso=KEN', title: 'Where "can’t tell" sends you',
    task: 'On the Bottom line, group Kenya’s twelve unsettled areas by reason (only one kind of evidence; not connected; needs a sector study; judged by elimination) and write the next step for three of them. Then follow "Read more" to self-discovery and read why it leans away yet stays unrated, and why coordination needs sector work.',
    check: 'Self-discovery leans away from a problem for Kenya. Why does the tool still not rate it?',
    answer: 'Its measures are all quantities of a kind that can’t carry a price test, so it is judged by elimination: it becomes a candidate only once the other low-return areas are set aside (probably not or ruled out). For Kenya none is, so the lean is shown and no tier is given.',
    mindbook: 'Mindbook, self-discovery and coordination failures (Hausmann and Rodrik).',
  },
  {
    n: 8, page: '/constraint-check-site/desk/summary.html?iso=KEN', title: 'Comparators are hypotheses',
    task: 'Switch Comparators to Aspirational (economies that grew fast from Kenya’s income) and watch electricity, other infrastructure and property rights become "worth a closer look"; hover electricity’s rating to see each set, and find the marks "Depends on the comparison countries". Then write Kenya’s diagnosis in five sentences: the question, the top split, what is flagged and on which test, what is unsettled and why, and what fieldwork must test. Compare it with the memo.',
    check: 'Electricity is unclear against similar economies and a candidate against fast growers. Which is right?',
    answer: 'Neither, by itself. A comparison set is a hypothesis about who Kenya should resemble. A verdict that changes with the set is weaker, and the right next step is to ask in-country why Kenya’s power costs and outages look worse than the fast growers’.',
    mindbook: 'Mindbook, choosing comparators; the diagnosis as a narrative that fieldwork must test.',
  },
];

export const lessonByN = (n) => LESSONS.find((l) => l.n === Number(n)) || null;
