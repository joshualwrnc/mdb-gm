# Guess Who: Fun Fact Edition 🕵️

Team game: everyone submits a fun fact, then the team votes on whose fact is whose.

## Multiplayer version (everyone plays from their own device)

```
node server.js
```

- The host opens `http://<your-ip>:3000/host.html` and hits **Create a new game** — they get a 4-letter game code and a join link to share.
- Players open the join link (or go to `http://<your-ip>:3000` and type the code), enter their name + fact, and wait in the lobby.
- When everyone's in, the host hits **Start game**.
- Each round shows one fact; everyone votes for who they think wrote it (the author sits the round out and is told to act natural 🤫).
- The host reveals the answer — correct voters get a point — then advances to the next fact.
- Final screen shows the leaderboard.

No dependencies, state lives in memory. Each game is its own room, so any number of teams can play at the same time on one server — just create separate games. Rooms expire after 24 hours of inactivity, and **Reset** on the host page wipes a room for a rematch.

### Sharing a link with the team

- **Same office wifi:** just share `http://<your-ip>:3000` (find your IP with `ipconfig` / `ifconfig`).
- **Remote folks:** keep `node server.js` running and in a second terminal run `npx localtunnel --port 3000` — it prints a public https link anyone can open. The link lives as long as the command runs.
- **Permanent:** deploy this repo to a free Node host (e.g. Render) with start command `node server.js`.

## Single-screen version (no server)

Open `index.html` in a browser. The host pastes the collected facts as `Name: fact` lines and runs the game on a shared screen.
