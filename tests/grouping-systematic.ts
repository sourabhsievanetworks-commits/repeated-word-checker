import type { BenchmarkCase } from './grouping-benchmark';

// base, -s, past, -ing (and past participle when it differs)
const VERBS = `
add adds added adding|ask asks asked asking|build builds built building|buy buys bought buying
call calls called calling|carry carries carried carrying|change changes changed changing
charge charges charged charging|check checks checked checking|choose chooses chose choosing chosen
compare compares compared comparing|connect connects connected connecting|cost costs cost costing
create creates created creating|design designs designed designing|drop drops dropped dropping
find finds found finding|follow follows followed following|give gives gave giving given
grow grows grew growing grown|help helps helped helping|hold holds held holding
include includes included including|keep keeps kept keeping|know knows knew knowing known
last lasts lasted lasting|learn learns learned learning|limit limits limited limiting
look looks looked looking|make makes made making|move moves moved moving|need needs needed needing
offer offers offered offering|open opens opened opening|pay pays paid paying|plan plans planned planning
provide provides provided providing|reach reaches reached reaching|replace replaces replaced replacing
run runs ran running|save saves saved saving|sell sells sold selling|send sends sent sending
share shares shared sharing|show shows showed showing shown|start starts started starting
stop stops stopped stopping|support supports supported supporting|take takes took taking taken
test tests tested testing|track tracks tracked tracking|try tries tried trying
update updates updated updating|use uses used using|wear wears wore wearing worn
work works worked working|write writes wrote writing written
`;

const NOUNS = `
account accounts|alert alerts|app apps|battery batteries|box boxes|brand brands|button buttons
child children|city cities|company companies|contact contacts|country countries|customer customers
day days|device devices|family families|feature features|fee fees|foot feet|guide guides
knife knives|life lives|location locations|man men|map maps|model models|month months
network networks|option options|parent parents|person people|phone phones|plan plans|price prices
product products|review reviews|screen screens|sensor sensors|service services|signal signals
story stories|strap straps|subscription subscriptions|tracker trackers|user users|watch watches
woman women|year years|zone zones
`;

const ADJECTIVES = `
big bigger biggest|bright brighter brightest|cheap cheaper cheapest|easy easier easiest
fast faster fastest|heavy heavier heaviest|large larger largest|light lighter lightest
long longer longest|low lower lowest|new newer newest|safe safer safest|short shorter shortest
simple simpler simplest|small smaller smallest|strong stronger strongest|thin thinner thinnest
`;

const rows = (s: string) => s.trim().split(/[|\n]/).map((r) => r.trim().split(/\s+/));
const cap = (w: string) => w[0].toUpperCase() + w.slice(1);

/** Every form of 100+ common words, in simple sentences. Each word must end up in one group. */
export const SYSTEMATIC: BenchmarkCase[] = [
  ...rows(VERBS).map((f) => ({
    text: `We ${f[0]} it daily. She ${f[1]} it too. They ${f[2]} it yesterday. ${cap(f[3])} it is easy.${f[4] ? ` It was ${f[4]} well.` : ''} You can ${f[0]} it.`,
    same: [f.filter((w, i) => !(f[0] === 'cost' && i === 2))],
  })),
  ...rows(NOUNS)
    // "person / people" look nothing alike and are meant to stay apart.
    .filter((f) => f[0] !== 'person')
    .map((f) => ({
      text: `${cap(f[1])} matter a lot. The ${f[0]} is here. Every ${f[0]} counts. Many ${f[1]} exist. The ${f[0]}’s role is clear.`,
      same: [[f[0], f[1], `${f[0]}'s`]],
    })),
  ...rows(ADJECTIVES).map((f) => ({
    text: `A ${f[0]} one works. A ${f[1]} one is fine. The ${f[2]} one wins. It is ${f[0]}, and this is ${f[1]}.`,
    same: [f],
  })),
];
