# Guess Who: Fun Fact Edition 🕵️

Team game: everyone submits a fun fact, then the team votes on whose fact is whose.

## Multiplayer version (everyone plays from their own device)

```
node server.js
```

- Players open `http://<your-ip>:3000`, enter their name + fact, and wait in the lobby.
- The host opens `http://<your-ip>:3000/host.html`, sees who's in, and hits **Start game**.
- Each round shows one fact; everyone votes for who they think wrote it (the author sits the round out and is told to act natural 🤫).
- The host reveals the answer — correct voters get a point — then advances to the next fact.
- Final screen shows the leaderboard.

No dependencies, state lives in memory. **Reset** on the host page wipes everything for a new game.

## Single-screen version (no server)

Open `index.html` in a browser. The host pastes the collected facts as `Name: fact` lines and runs the game on a shared screen.
