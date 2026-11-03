# Fonts

Copied unchanged from the TNFA Design System (`project/fonts/`), which took them from the TNFA website. All four families are under the SIL Open Font License 1.1: Newsreader (Production Type), Inter (Rasmus Andersson), IBM Plex Mono (IBM) and Libertinus Serif Display (the Libertinus project).

Roles, as the design system sets them: Newsreader for headings and prose, Libertinus Serif Display for uppercase labels and buttons, Inter for data and controls, IBM Plex Mono for table headers and codes.

Subset on 2 November 2026 (visual-upgrade PRD, V1, item 6) with fontTools 4.68: Newsreader and Inter are cut to the characters the Desk uses (Latin, Latin-1 and Extended-A, general punctuation, the arrows, minus and geometric marks in use, and the Greek letters in the Methods documents), and Newsreader's variable axes are narrowed to the weights the stylesheet asks for (400 to 600) and optical sizes 14 to 48 (`fonttools varLib.instancer`). Newsreader upright went from 128 KB to 79 KB and italic from 143 KB to 87 KB; Inter from 47 KB to 38 KB. The unsubset files are in the TNFA Design System.
