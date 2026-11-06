// @ts-check
// The standard's page (Growth Test PRD, Part 5, R3), behind the growth-test flag: static copy in standard.html, in TNFA's
// voice and labelled. This module mounts the shell and the theme, and reveals the sections as they scroll into view through
// motion.mjs (D9: scroll-linked motion on the argument surfaces; the page has no rating surface).
import './shell.mjs';
import { initTheme } from './common.mjs';
import { reveal } from './motion.mjs';

initTheme();
for (const el of document.querySelectorAll('.std-sec')) reveal(el);
