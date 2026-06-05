/* Hangman · Discord snapshot — BLUEPRINT direction, portrait.
   One brutalist frame, the core game loop stacked top-to-bottom and
   stretched to fill the tall format: status → figure → danger → phrase →
   dead letters. */

const PHRASE = 'TOUCH GRASS';
const up = (s) => s.toUpperCase();
const splitWords = (p) => up(p).split(' ');

// ── FIGURE — thick-stroke construction gallows ──────────────────────
function FigureBlueprint({ stage, dead, align = 'xMidYMid' }) {
  const ink = '#ffffff';
  const fig = dead ? 'var(--bad)' : '#ffffff';
  const P = { fill: 'none', strokeWidth: 13, strokeLinecap: 'square', strokeLinejoin: 'miter' };
  return (
    <svg viewBox="0 0 340 440" width="100%" height="100%" preserveAspectRatio={align + ' meet'} style={{ display: 'block' }}>
      <g stroke={ink} {...P}>
        <path d="M24 424 H306" />
        <path d="M86 424 V28" />
        <path d="M86 28 H252" />
        <path d="M252 28 V78" />
      </g>
      <g stroke={fig} {...P}>
        {stage >= 1 && <circle cx="252" cy="108" r="30" fill="none" />}
        {stage >= 2 && <path d="M252 138 V256" />}
        {stage >= 3 && <path d="M252 170 L208 216" />}
        {stage >= 4 && <path d="M252 170 L296 216" />}
        {stage >= 5 && <path d="M252 256 L212 320" />}
        {stage >= 6 && <path d="M252 256 L292 320" />}
      </g>
    </svg>
  );
}

// ── STATUS CHIP ─────────────────────────────────────────────────────
function Chip({ state }) {
  let cls = 'neutral', label = 'YOUR MOVE', key = null;
  if (state.status === 'win') { cls = 'good'; label = 'SOLVED'; }
  else if (state.status === 'loss') { cls = 'bad'; label = 'GAME OVER'; }
  else if (state.last) {
    if (state.last.hit) { cls = 'good'; label = 'HIT'; key = '+' + state.last.letter; }
    else { cls = 'bad'; label = 'MISS'; key = '\u2715' + state.last.letter; }
  }
  return (
    <div className={'hm-chip ' + cls}>
      <b>{label}</b>
      {key && <span className="k">{key}</span>}
    </div>
  );
}

// ── WRONG-LETTER LIST (to the right of the figure) ──────────────────
function Wrong({ state }) {
  return (
    <div className="hm-wrong">
      {state.wrong.length === 0
        ? <div className="hm-empty">{'\u2014'}</div>
        : (
          <div className="hm-wrongcol">
            {state.wrong.map((l, i) => {
              const recent = state.last && !state.last.hit && i === state.wrong.length - 1;
              return <span key={i} className={'hm-gtile' + (recent ? ' recent' : '')}>{l}</span>;
            })}
          </div>
        )}
    </div>
  );
}

// ── PHRASE TILES ────────────────────────────────────────────────────
function Phrase({ state }) {
  const words = splitWords(PHRASE);
  const revealed = state.revealed;
  const isLoss = state.status === 'loss';
  const isWin = state.status === 'win';
  const hitLetter = state.last && state.last.hit ? state.last.letter : null;

  return (
    <div className="hm-phrase">
      <div className="hm-words">
        {words.map((w, wi) => (
          <div className="hm-word" key={wi}>
            {w.split('').map((ch, ci) => {
              const shown = revealed.has(ch);
              let cls = 'hm-tile', glyph = '';
              if (isWin) { cls += ' win'; glyph = ch; }
              else if (shown) { glyph = ch; cls += (ch === hitLetter) ? ' hit' : ' filled'; }
              else if (isLoss) { cls += ' answer'; glyph = ch; }
              else { cls += ' blank'; }
              return <div className={cls} key={ci}>{glyph}</div>;
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── GRAVEYARD FOOTER (wrong letters) ────────────────────────────────
function Foot({ state }) {
  return (
    <div className="hm-foot">
      <span className="hm-raillabel">Wrong</span>
      {state.wrong.length === 0
        ? <div className="hm-empty">{'\u2014'}</div>
        : (
          <div className="hm-grave">
            {state.wrong.map((l, i) => {
              const recent = state.last && !state.last.hit && i === state.wrong.length - 1;
              return <span key={i} className={'hm-gtile' + (recent ? ' recent' : '')}>{l}</span>;
            })}
          </div>
        )}
    </div>
  );
}

// ── FULL SNAPSHOT (1080×1350 portrait) ──────────────────────────────
function Snapshot({ state }) {
  const stage = state.wrong.length;
  const dead = state.status === 'loss';
  return (
    <div className="hm-frame">
      <div className="hm-stage">
        <div className="hm-figcol">
          <div className="hm-figbox"><FigureBlueprint stage={stage} dead={dead} align="xMinYMid" /></div>
        </div>
        <Wrong state={state} />
      </div>
      <Phrase state={state} />
    </div>
  );
}

// ── FIGURE-KEY STRIP (all 7 stages) ─────────────────────────────────
const STAGE_CAPS = ['UNTOUCHED', 'MISS 1', 'MISS 2', 'MISS 3', 'MISS 4', 'MISS 5', 'COMPLETE'];
function FigureKey() {
  return (
    <div className="hm-frame hm-keyframe">
      <div className="hm-head">
        <div className="hm-wordmark">FIGURE<small>7 STATES · 0{'\u2013'}6 WRONG</small></div>
        <div className="hm-chip neutral"><b>BLUEPRINT</b></div>
      </div>
      <div className="hm-keyrow">
        {[0, 1, 2, 3, 4, 5, 6].map((s) => (
          <div className={'hm-keycell' + (s === 6 ? ' dead' : '')} key={s}>
            <div className="hm-keyfig"><FigureBlueprint stage={s} dead={s === 6} /></div>
            <div className="hm-keycap"><span>{s}</span><span>{STAGE_CAPS[s]}</span></div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── STATE NARRATIVE ─────────────────────────────────────────────────
const S = {
  fresh: { revealed: new Set(), wrong: [], last: null, status: 'play' },
  hit: { revealed: new Set(['S']), wrong: [], last: { letter: 'S', hit: true }, status: 'play' },
  miss: { revealed: new Set(['T', 'O', 'U', 'A', 'S']), wrong: ['E', 'I', 'N', 'D', 'P'], last: { letter: 'P', hit: false }, status: 'play' },
  win: { revealed: new Set(['T', 'O', 'U', 'C', 'H', 'G', 'R', 'A', 'S']), wrong: ['E', 'I'], last: { letter: 'C', hit: true }, status: 'win' },
  loss: { revealed: new Set(['T', 'O', 'U', 'A', 'S']), wrong: ['E', 'I', 'N', 'D', 'P', 'B'], last: { letter: 'B', hit: false }, status: 'loss' },
};

const STATE_LIST = [
  ['fresh', 'Fresh start'],
  ['hit', 'Hit'],
  ['miss', 'Miss · 1 left'],
  ['win', 'Win'],
  ['loss', 'Loss · reveal'],
];

const SW = 1080, SH = 1240, KW = 1240, KH = 500;

function App() {
  return (
    <DesignCanvas>
      <DCSection id="intro" title="Hangman · Discord snapshot" subtitle="Blueprint direction · 1080×1240 portrait · pure-black so it sits invisibly in dark Discord">
        <DCArtboard id="legend" label="Read me" width={720} height={500} style={{ background: '#000' }}>
          <div className="hm-legend">
            <div className="hm-legend-h">THE CORE LOOP</div>
            <p>One brutalist frame. Three zones, read at a glance:</p>
            <ul>
              <li><b>The figure</b> — thick-stroke gallows, one part per wrong guess.</li>
              <li><b>Wrong letters</b> — struck-out, stacked to the right of the figure.</li>
              <li><b>The phrase</b> — big letter-tiles, grouped by word; <em className="g">green</em> on a fresh hit, <em className="r">red</em> reveal on a loss.</li>
            </ul>
            <p className="hm-legend-foot">Below: the 7-stage figure key, then five real moments — fresh, a hit, a miss one guess from death, a win, and a loss with the answer revealed.</p>
          </div>
        </DCArtboard>
      </DCSection>

      <DCSection id="blueprint" title="① Blueprint" subtitle="Thick construction strokes — the core loop filling a vertical poster">
        <DCArtboard id="blueprint-key" label="Figure key · 7 states" width={KW} height={KH} style={{ background: '#000' }}>
          <FigureKey />
        </DCArtboard>
        {STATE_LIST.map(([sk, slabel]) => (
          <DCArtboard key={sk} id={'blueprint-' + sk} label={slabel} width={SW} height={SH} style={{ background: '#000' }}>
            <Snapshot state={S[sk]} />
          </DCArtboard>
        ))}
      </DCSection>
    </DesignCanvas>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
