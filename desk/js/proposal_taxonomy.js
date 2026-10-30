// Proposal Check taxonomy: a deterministic phrase table mapping proposal language to HRV tree nodes.
// Pure data plus one matching function. No network, no model. Users correct the mapping on screen.
// Phrases are matched case-insensitively on word boundaries; a phrase may map to several nodes.

export const TAXONOMY = [
  // N4 human capital
  { phrase: 'vocational training', nodes: ['N4'] }, { phrase: 'TVET', nodes: ['N4'] }, { phrase: 'scholarship', nodes: ['N4'] }, { phrase: 'scholarships', nodes: ['N4'] },
  { phrase: 'skills', nodes: ['N4'] }, { phrase: 'skills training', nodes: ['N4'] }, { phrase: 'apprenticeship', nodes: ['N4'] }, { phrase: 'teacher training', nodes: ['N4'] },
  { phrase: 'curriculum', nodes: ['N4'] }, { phrase: 'higher education', nodes: ['N4'] }, { phrase: 'universities', nodes: ['N4'] }, { phrase: 'STEM', nodes: ['N4'] }, { phrase: 'workforce development', nodes: ['N4'] }, { phrase: 'secondary education', nodes: ['N4'] },
  // N5 electricity
  { phrase: 'grid', nodes: ['N5'] }, { phrase: 'transmission', nodes: ['N5'] }, { phrase: 'generation', nodes: ['N5'] }, { phrase: 'power purchase', nodes: ['N5'] }, { phrase: 'power purchase agreement', nodes: ['N5'] },
  { phrase: 'electricity', nodes: ['N5'] }, { phrase: 'electrification', nodes: ['N5'] }, { phrase: 'solar', nodes: ['N5'] }, { phrase: 'mini-grid', nodes: ['N5'] }, { phrase: 'mini grid', nodes: ['N5'] }, { phrase: 'utility', nodes: ['N5'] },
  { phrase: 'independent power producer', nodes: ['N5'] }, { phrase: 'IPP', nodes: ['N5'] }, { phrase: 'megawatt', nodes: ['N5'] }, { phrase: 'MW', nodes: ['N5'] }, { phrase: 'hydropower', nodes: ['N5'] }, { phrase: 'tariff reform', nodes: ['N5'] }, { phrase: 'distribution losses', nodes: ['N5'] }, { phrase: 'outages', nodes: ['N5'] },
  // N6 transport and logistics
  { phrase: 'port', nodes: ['N6'] }, { phrase: 'ports', nodes: ['N6'] }, { phrase: 'corridor', nodes: ['N6'] }, { phrase: 'road', nodes: ['N6'] }, { phrase: 'roads', nodes: ['N6'] }, { phrase: 'customs', nodes: ['N6'] },
  { phrase: 'logistics', nodes: ['N6'] }, { phrase: 'rail', nodes: ['N6'] }, { phrase: 'railway', nodes: ['N6'] }, { phrase: 'border post', nodes: ['N6'] }, { phrase: 'one-stop border', nodes: ['N6'] }, { phrase: 'trucking', nodes: ['N6'] }, { phrase: 'freight', nodes: ['N6'] }, { phrase: 'airport', nodes: ['N6'] }, { phrase: 'trade facilitation', nodes: ['N6'] }, { phrase: 'cold chain', nodes: ['N6', 'N13'] },
  // N7 other infrastructure
  { phrase: 'broadband', nodes: ['N7'] }, { phrase: 'internet', nodes: ['N7'] }, { phrase: 'digital infrastructure', nodes: ['N7'] }, { phrase: 'connectivity', nodes: ['N7'] }, { phrase: 'ICT', nodes: ['N7'] }, { phrase: 'irrigation', nodes: ['N7'] }, { phrase: 'water supply', nodes: ['N7'] }, { phrase: 'sanitation', nodes: ['N7'] },
  // N8 land
  { phrase: 'land titling', nodes: ['N8'] }, { phrase: 'cadastre', nodes: ['N8'] }, { phrase: 'land registry', nodes: ['N8'] }, { phrase: 'land tenure', nodes: ['N8'] }, { phrase: 'tenure security', nodes: ['N8'] }, { phrase: 'property registration', nodes: ['N8'] }, { phrase: 'land administration', nodes: ['N8'] }, { phrase: 'land reform', nodes: ['N8'] },
  // N1 international finance, N2 savings, N3 intermediation
  { phrase: 'credit guarantee', nodes: ['N3'] }, { phrase: 'partial credit guarantee', nodes: ['N3'] }, { phrase: 'SME finance', nodes: ['N3'] }, { phrase: 'MSME finance', nodes: ['N3'] }, { phrase: 'microfinance', nodes: ['N3'] },
  { phrase: 'line of credit', nodes: ['N3'] }, { phrase: 'lending', nodes: ['N3'] }, { phrase: 'on-lending', nodes: ['N3'] }, { phrase: 'bank', nodes: ['N3'] }, { phrase: 'banks', nodes: ['N3'] }, { phrase: 'collateral registry', nodes: ['N3'] }, { phrase: 'credit bureau', nodes: ['N3'] }, { phrase: 'leasing', nodes: ['N3'] },
  { phrase: 'mobile money', nodes: ['N3'] }, { phrase: 'fintech', nodes: ['N3'] }, { phrase: 'access to finance', nodes: ['N3'] }, { phrase: 'working capital', nodes: ['N3'] }, { phrase: 'interest rate', nodes: ['N3'] }, { phrase: 'financial inclusion', nodes: ['N3'] }, { phrase: 'venture capital', nodes: ['N3'] }, { phrase: 'equity fund', nodes: ['N3'] },
  { phrase: 'sovereign guarantee', nodes: ['N1'] }, { phrase: 'eurobond', nodes: ['N1'] }, { phrase: 'external borrowing', nodes: ['N1'] }, { phrase: 'remittances', nodes: ['N1'] }, { phrase: 'diaspora bond', nodes: ['N1'] }, { phrase: 'balance of payments', nodes: ['N1', 'N10'] }, { phrase: 'blended finance', nodes: ['N1', 'N3'] }, { phrase: 'development finance', nodes: ['N1', 'N3'] },
  { phrase: 'savings', nodes: ['N2'] }, { phrase: 'pension', nodes: ['N2'] }, { phrase: 'pension reform', nodes: ['N2'] }, { phrase: 'deposit', nodes: ['N2'] }, { phrase: 'capital market', nodes: ['N2', 'N3'] },
  // N10 macro
  { phrase: 'macro stabilization', nodes: ['N10'] }, { phrase: 'macroeconomic stabilization', nodes: ['N10'] }, { phrase: 'debt', nodes: ['N10'] }, { phrase: 'debt restructuring', nodes: ['N10'] }, { phrase: 'inflation', nodes: ['N10'] }, { phrase: 'exchange rate', nodes: ['N10'] },
  { phrase: 'fiscal', nodes: ['N10'] }, { phrase: 'fiscal consolidation', nodes: ['N10'] }, { phrase: 'IMF program', nodes: ['N10'] }, { phrase: 'budget support', nodes: ['N10'] }, { phrase: 'central bank', nodes: ['N10'] }, { phrase: 'public financial management', nodes: ['N10'] }, { phrase: 'PFM', nodes: ['N10'] },
  // N11 micro risks
  { phrase: 'anti-corruption', nodes: ['N11.corruption'] }, { phrase: 'anticorruption', nodes: ['N11.corruption'] }, { phrase: 'procurement reform', nodes: ['N11.corruption'] }, { phrase: 'corruption', nodes: ['N11.corruption'] }, { phrase: 'transparency', nodes: ['N11.corruption'] }, { phrase: 'bribery', nodes: ['N11.corruption'] }, { phrase: 'integrity', nodes: ['N11.corruption'] }, { phrase: 'asset declaration', nodes: ['N11.corruption'] }, { phrase: 'e-procurement', nodes: ['N11.corruption'] },
  { phrase: 'tax administration', nodes: ['N11.taxes'] }, { phrase: 'revenue authority', nodes: ['N11.taxes'] }, { phrase: 'revenue mobilization', nodes: ['N11.taxes'] }, { phrase: 'VAT', nodes: ['N11.taxes'] }, { phrase: 'tax', nodes: ['N11.taxes'] }, { phrase: 'taxes', nodes: ['N11.taxes'] }, { phrase: 'tax policy', nodes: ['N11.taxes'] }, { phrase: 'informality', nodes: ['N11.taxes', 'N11.regulation'] },
  { phrase: 'business registration', nodes: ['N11.regulation'] }, { phrase: 'licensing', nodes: ['N11.regulation'] }, { phrase: 'licences', nodes: ['N11.regulation'] }, { phrase: 'licenses', nodes: ['N11.regulation'] }, { phrase: 'one-stop shop', nodes: ['N11.regulation'] }, { phrase: 'competition', nodes: ['N11.regulation'] }, { phrase: 'competition policy', nodes: ['N11.regulation'] },
  { phrase: 'regulatory reform', nodes: ['N11.regulation'] }, { phrase: 'business environment', nodes: ['N11.regulation'] }, { phrase: 'doing business', nodes: ['N11.regulation'] }, { phrase: 'permits', nodes: ['N11.regulation'] }, { phrase: 'state-owned enterprise', nodes: ['N11.regulation'] }, { phrase: 'SOE', nodes: ['N11.regulation'] }, { phrase: 'deregulation', nodes: ['N11.regulation'] }, { phrase: 'red tape', nodes: ['N11.regulation'] }, { phrase: 'investment climate', nodes: ['N11.regulation', 'N11.property'] },
  { phrase: 'property rights', nodes: ['N11.property'] }, { phrase: 'contract enforcement', nodes: ['N11.property'] }, { phrase: 'commercial court', nodes: ['N11.property'] }, { phrase: 'commercial courts', nodes: ['N11.property'] }, { phrase: 'arbitration', nodes: ['N11.property'] }, { phrase: 'investor protection', nodes: ['N11.property'] }, { phrase: 'rule of law', nodes: ['N11.property'] }, { phrase: 'judicial reform', nodes: ['N11.property'] }, { phrase: 'expropriation', nodes: ['N11.property'] },
  { phrase: 'police', nodes: ['N11.crime'] }, { phrase: 'policing', nodes: ['N11.crime'] }, { phrase: 'security', nodes: ['N11.crime'] }, { phrase: 'crime', nodes: ['N11.crime'] }, { phrase: 'violence', nodes: ['N11.crime'] }, { phrase: 'gang', nodes: ['N11.crime'] }, { phrase: 'citizen security', nodes: ['N11.crime'] },
  { phrase: 'political stability', nodes: ['N11.policy'] }, { phrase: 'policy uncertainty', nodes: ['N11.policy'] }, { phrase: 'elections', nodes: ['N11.policy'] }, { phrase: 'policy reversal', nodes: ['N11.policy'] }, { phrase: 'political risk', nodes: ['N11.policy'] },
  // N12 self-discovery, N13 coordination
  { phrase: 'export promotion', nodes: ['N12', 'N13'] }, { phrase: 'diversification', nodes: ['N12', 'N13'] }, { phrase: 'value chain', nodes: ['N12', 'N13'] }, { phrase: 'value chains', nodes: ['N12', 'N13'] }, { phrase: 'agro-processing', nodes: ['N12', 'N13'] }, { phrase: 'agribusiness', nodes: ['N12', 'N13'] },
  { phrase: 'special economic zone', nodes: ['N13'] }, { phrase: 'SEZ', nodes: ['N13'] }, { phrase: 'industrial park', nodes: ['N13'] }, { phrase: 'industrial parks', nodes: ['N13'] }, { phrase: 'cluster', nodes: ['N13'] }, { phrase: 'clusters', nodes: ['N13'] }, { phrase: 'standards', nodes: ['N13'] }, { phrase: 'certification', nodes: ['N13'] }, { phrase: 'SPS', nodes: ['N13'] }, { phrase: 'quality infrastructure', nodes: ['N13'] }, { phrase: 'accreditation', nodes: ['N13'] },
  { phrase: 'investment promotion', nodes: ['N12'] }, { phrase: 'new products', nodes: ['N12'] }, { phrase: 'innovation', nodes: ['N12'] }, { phrase: 'startup', nodes: ['N12'] }, { phrase: 'startups', nodes: ['N12'] }, { phrase: 'incubator', nodes: ['N12'] }, { phrase: 'market information', nodes: ['N12'] }, { phrase: 'matching grant', nodes: ['N12'] }, { phrase: 'matching grants', nodes: ['N12'] }, { phrase: 'tourism', nodes: ['N12', 'N13'] },
];

// Phrases that should not fire when part of a proper noun or stock phrase.
const EXCLUDE_BEFORE = { bank: ['world', 'development', 'central', 'african development', 'asian development', 'inter-american development', 'the world'], banks: ['development'], grid: ['off-'], security: ['food', 'social', 'cyber'], generation: ['next', 'new', 'income', 'job', 'employment', 'revenue', 'young'], transmission: ['disease', 'hiv', 'malaria'], utility: ['public'] };

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/** Returns [{node, phrases: [{phrase, count}], hits}] sorted by hits, deterministic. */
export function mapProposal(text) {
  const src = String(text || '');
  const lower = src.toLowerCase();
  const byNode = {};
  for (const entry of TAXONOMY) {
    // word-boundary match; tolerate a simple plural (s / es) after the phrase
    const re = new RegExp(`(^|[^A-Za-z0-9])(${escapeRe(entry.phrase.toLowerCase())})(?:e?s)?(?![A-Za-z0-9])`, 'g');
    let m; let count = 0;
    while ((m = re.exec(lower)) !== null) {
      const start = m.index + m[1].length;
      const before = lower.slice(Math.max(0, start - 32), start).trim();
      const excl = EXCLUDE_BEFORE[entry.phrase.toLowerCase()];
      if (excl && excl.some((w) => before.endsWith(w))) continue;
      count++;
    }
    if (!count) continue;
    for (const node of entry.nodes) {
      const b = byNode[node] || (byNode[node] = { node, phrases: [], hits: 0 });
      b.phrases.push({ phrase: entry.phrase, count }); b.hits += count;
    }
  }
  return Object.values(byNode).sort((a, b) => b.hits - a.hits || a.node.localeCompare(b.node));
}
