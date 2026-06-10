// Guess Who: Fun Fact Edition — multiplayer server (zero dependencies)
// Run: node server.js  → players open http://<host>:3000, host opens /host.html
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const PUB = path.join(__dirname, 'public');

// ---- game state (in memory) ----
let players = {};      // id -> { name, fact, score }
let order = [];        // shuffled player ids, one round per fact
let round = -1;
let phase = 'lobby';   // lobby | vote | reveal | done
let votes = {};        // playerId -> guessed name (current round only)

function reset() { players = {}; order = []; round = -1; phase = 'lobby'; votes = {}; }

function namesList() {
  return Object.values(players).map(p => p.name).sort();
}

function currentAuthor() { return players[order[round]]; }

function stateFor(playerId) {
  const me = players[playerId];
  const base = {
    phase,
    playerCount: Object.keys(players).length,
    names: namesList(),
    joined: !!me,
    myName: me ? me.name : null,
    round: round + 1,
    totalRounds: order.length,
  };
  if (phase === 'vote' || phase === 'reveal') {
    const author = currentAuthor();
    base.fact = author.fact;
    base.isMine = playerId === order[round];
    base.myVote = votes[playerId] || null;
    base.votesIn = Object.keys(votes).length;
  }
  if (phase === 'reveal') {
    base.author = currentAuthor().name;
    base.breakdown = {};
    for (const [pid, name] of Object.entries(votes)) {
      const voter = players[pid];
      if (voter) (base.breakdown[name] = base.breakdown[name] || []).push(voter.name);
    }
  }
  if (phase === 'reveal' || phase === 'done') {
    base.scores = Object.values(players)
      .map(p => ({ name: p.name, score: p.score }))
      .sort((a, b) => b.score - a.score);
  }
  return base;
}

function startVoting() {
  votes = {};
  phase = 'vote';
}

function reveal() {
  const author = currentAuthor();
  for (const [pid, name] of Object.entries(votes)) {
    if (pid !== order[round] && name === author.name && players[pid]) players[pid].score++;
  }
  phase = 'reveal';
}

// ---- http plumbing ----
function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function body(req) {
  return new Promise(resolve => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 1e4) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); } });
  });
}

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');

  if (url.pathname === '/api/join' && req.method === 'POST') {
    if (phase !== 'lobby') return json(res, 400, { error: 'Game already started.' });
    const { name, fact } = await body(req);
    const cleanName = String(name || '').trim().slice(0, 40);
    const cleanFact = String(fact || '').trim().slice(0, 300);
    if (!cleanName || !cleanFact) return json(res, 400, { error: 'Name and fact are both required.' });
    if (namesList().some(n => n.toLowerCase() === cleanName.toLowerCase()))
      return json(res, 400, { error: 'That name is taken — add a last initial.' });
    const id = crypto.randomBytes(8).toString('hex');
    players[id] = { name: cleanName, fact: cleanFact, score: 0 };
    return json(res, 200, { id });
  }

  if (url.pathname === '/api/vote' && req.method === 'POST') {
    if (phase !== 'vote') return json(res, 400, { error: 'Voting is closed.' });
    const { player, vote } = await body(req);
    if (!players[player]) return json(res, 400, { error: 'Unknown player.' });
    if (player === order[round]) return json(res, 400, { error: "It's your fact — sit this one out." });
    if (!namesList().includes(vote)) return json(res, 400, { error: 'Invalid vote.' });
    votes[player] = vote;
    return json(res, 200, { ok: true });
  }

  if (url.pathname === '/api/host' && req.method === 'POST') {
    const { action } = await body(req);
    if (action === 'start' && phase === 'lobby') {
      if (Object.keys(players).length < 2) return json(res, 400, { error: 'Need at least 2 players.' });
      order = Object.keys(players);
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      round = 0;
      startVoting();
    } else if (action === 'reveal' && phase === 'vote') {
      reveal();
    } else if (action === 'next' && phase === 'reveal') {
      round++;
      if (round >= order.length) phase = 'done'; else startVoting();
    } else if (action === 'reset') {
      reset();
    } else {
      return json(res, 400, { error: `Can't ${action} during ${phase}.` });
    }
    return json(res, 200, { ok: true });
  }

  if (url.pathname === '/api/state') {
    return json(res, 200, stateFor(url.searchParams.get('player')));
  }

  // static files
  const file = path.join(PUB, url.pathname === '/' ? 'index.html' : path.normalize(url.pathname));
  if (!file.startsWith(PUB)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'text/plain' });
    res.end(data);
  });
});

server.listen(PORT, () => console.log(`Guess Who running → http://localhost:${PORT} (host page: /host.html)`));
