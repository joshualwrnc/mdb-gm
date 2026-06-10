// Guess Who: Fun Fact Edition — multiplayer server (zero dependencies)
// Run: node server.js  → host opens /host.html to create a game,
// players join at /?room=CODE. Many games can run at once.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const PUB = path.join(__dirname, 'public');
const ROOM_TTL = 24 * 60 * 60 * 1000; // rooms idle this long are deleted

// ---- rooms (in memory) ----
const rooms = {}; // code -> room

function newRoom() {
  let code;
  do {
    code = Array.from(crypto.randomBytes(4), b => 'ABCDEFGHJKMNPQRSTUVWXYZ'[b % 23]).join('');
  } while (rooms[code]);
  rooms[code] = {
    players: {},   // id -> { name, fact, score }
    order: [],     // shuffled player ids, one round per fact
    round: -1,
    phase: 'lobby', // lobby | vote | reveal | done
    votes: {},     // playerId -> guessed name (current round)
    touched: Date.now(),
  };
  return code;
}

setInterval(() => {
  const cutoff = Date.now() - ROOM_TTL;
  for (const [code, room] of Object.entries(rooms))
    if (room.touched < cutoff) delete rooms[code];
}, 60 * 60 * 1000).unref();

function namesList(room) {
  return Object.values(room.players).map(p => p.name).sort();
}

function currentAuthor(room) { return room.players[room.order[room.round]]; }

function stateFor(room, playerId) {
  const me = room.players[playerId];
  const base = {
    phase: room.phase,
    playerCount: Object.keys(room.players).length,
    names: namesList(room),
    joined: !!me,
    myName: me ? me.name : null,
    round: room.round + 1,
    totalRounds: room.order.length,
  };
  if (room.phase === 'vote' || room.phase === 'reveal') {
    const author = currentAuthor(room);
    base.fact = author.fact;
    base.isMine = playerId === room.order[room.round];
    base.myVote = room.votes[playerId] || null;
    base.votesIn = Object.keys(room.votes).length;
  }
  if (room.phase === 'reveal') {
    base.author = currentAuthor(room).name;
    base.breakdown = {};
    for (const [pid, name] of Object.entries(room.votes)) {
      const voter = room.players[pid];
      if (voter) (base.breakdown[name] = base.breakdown[name] || []).push(voter.name);
    }
  }
  if (room.phase === 'reveal' || room.phase === 'done') {
    base.scores = Object.values(room.players)
      .map(p => ({ name: p.name, score: p.score }))
      .sort((a, b) => b.score - a.score);
  }
  return base;
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

  if (url.pathname === '/api/create' && req.method === 'POST') {
    return json(res, 200, { code: newRoom() });
  }

  if (url.pathname.startsWith('/api/')) {
    const room = rooms[(url.searchParams.get('room') || '').toUpperCase()];
    if (!room) return json(res, 404, { error: 'Game not found — check the code, or it may have expired.' });
    room.touched = Date.now();

    if (url.pathname === '/api/join' && req.method === 'POST') {
      if (room.phase !== 'lobby') return json(res, 400, { error: 'Game already started.' });
      const { name, fact } = await body(req);
      const cleanName = String(name || '').trim().slice(0, 40);
      const cleanFact = String(fact || '').trim().slice(0, 300);
      if (!cleanName || !cleanFact) return json(res, 400, { error: 'Name and fact are both required.' });
      if (namesList(room).some(n => n.toLowerCase() === cleanName.toLowerCase()))
        return json(res, 400, { error: 'That name is taken — add a last initial.' });
      const id = crypto.randomBytes(8).toString('hex');
      room.players[id] = { name: cleanName, fact: cleanFact, score: 0 };
      return json(res, 200, { id });
    }

    if (url.pathname === '/api/vote' && req.method === 'POST') {
      if (room.phase !== 'vote') return json(res, 400, { error: 'Voting is closed.' });
      const { player, vote } = await body(req);
      if (!room.players[player]) return json(res, 400, { error: 'Unknown player.' });
      if (player === room.order[room.round]) return json(res, 400, { error: "It's your fact — sit this one out." });
      if (!namesList(room).includes(vote)) return json(res, 400, { error: 'Invalid vote.' });
      room.votes[player] = vote;
      return json(res, 200, { ok: true });
    }

    if (url.pathname === '/api/host' && req.method === 'POST') {
      const { action } = await body(req);
      if (action === 'start' && room.phase === 'lobby') {
        if (Object.keys(room.players).length < 2) return json(res, 400, { error: 'Need at least 2 players.' });
        room.order = Object.keys(room.players);
        for (let i = room.order.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [room.order[i], room.order[j]] = [room.order[j], room.order[i]];
        }
        room.round = 0;
        room.votes = {};
        room.phase = 'vote';
      } else if (action === 'reveal' && room.phase === 'vote') {
        const author = currentAuthor(room);
        for (const [pid, name] of Object.entries(room.votes))
          if (pid !== room.order[room.round] && name === author.name && room.players[pid]) room.players[pid].score++;
        room.phase = 'reveal';
      } else if (action === 'next' && room.phase === 'reveal') {
        room.round++;
        if (room.round >= room.order.length) room.phase = 'done';
        else { room.votes = {}; room.phase = 'vote'; }
      } else if (action === 'reset') {
        Object.assign(room, { players: {}, order: [], round: -1, phase: 'lobby', votes: {} });
      } else {
        return json(res, 400, { error: `Can't ${action} during ${room.phase}.` });
      }
      return json(res, 200, { ok: true });
    }

    if (url.pathname === '/api/state') {
      return json(res, 200, stateFor(room, url.searchParams.get('player')));
    }
    return json(res, 404, { error: 'Unknown endpoint.' });
  }

  // static files; extensionless paths fall back to .html (so /host works)
  let file = path.join(PUB, url.pathname === '/' ? 'index.html' : path.normalize(url.pathname));
  if (!file.startsWith(PUB)) { res.writeHead(403); return res.end(); }
  if (!path.extname(file) && !fs.existsSync(file)) file += '.html';
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      return res.end('<p style="font-family:sans-serif">Page not found — try <a href="/">the join page</a> or <a href="/host.html">host controls</a>.</p>');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'text/plain' });
    res.end(data);
  });
});

server.listen(PORT, () => console.log(`Guess Who running → http://localhost:${PORT} (create a game at /host.html)`));
