# 🎮 AWS Intern Active

A collection of browser-based learning games designed to help interns onboard faster, learn AWS services, and build essential internship skills — all while having fun.

**🌐 Play now:** [https://andrewnsiah1.github.io/AWS-Intern-Active/](https://andrewnsiah1.github.io/AWS-Intern-Active/)

---

## Games

### ☁️🏃 Cloud Runner

An endless runner (Subway Surfers-style) that teaches real AWS services. Dodge obstacles, collect service orbs, and answer quiz gates that scale in difficulty as you progress.

- 20+ AWS services (S3, Lambda, DynamoDB, EC2, and more)
- AI-powered dynamic quiz generation via Amazon Bedrock
- Per-service difficulty scaling — correct answers make questions harder
- Orb notes build progressively deeper understanding

### 🧩🚀 Intern Block Blast

A Block Blast-style puzzle game that teaches internship skills. Drag and drop blocks onto an 8×8 grid, clear lines, and unlock tips across four skill areas.

- ⏰ **Time Management** — deep work, prioritization, the 45-minute rule
- 🤖 **AI Tools** — effective prompting, verification, rubber-duck debugging
- 📝 **Design Docs** — problem statements, non-goals, getting early feedback
- 🤝 **Networking** — coffee chats, mentors, intern communities

Quiz questions don't repeat — correct answers advance to deeper topics. Wrong answers get re-asked.

### 🎒🗺️ Onboarding Quest

A 2D platformer that guides you through your first weeks. Explore three zones (Lobby, The Gap, Campus), collect gems that unlock real onboarding resources, earn keycards, and grab power-ups.

- Collect gems to unlock real onboarding links and resources
- Earn keycards to open gated zones
- Power-ups: Cloud Desktop (double jump) and Coffee (speed boost)
- Gold/Silver/Bronze ranking based on stars collected and falls

---

## Features

- **Neo-brutalist UI** — bold, punchy design with thick borders, hard shadows, and Space Grotesk typography
- **Background music** — each game has its own instrumental soundtrack
- **Pause with ESC** — all games support pause/resume with a menu exit option
- **Cloud Runner countdown** — 3-2-1 countdown on resume so gameplay isn't abrupt
- **Progressive learning** — content gets deeper the more you play
- **Game over takeaways** — see what you learned at the end of each session
- **Fully static** — no server required for gameplay (Cloud Runner's AI quizzes fall back to a static bank when the API is unavailable)

---

## Tech Stack

| Component | Tech |
|-----------|------|
| Menu & Build | Vite (multi-page app) |
| Cloud Runner | Three.js, vanilla JS |
| Block Blast | Vanilla JS, CSS Grid |
| Onboarding Quest | Canvas 2D, single HTML file |
| Quiz AI (Cloud Runner) | Amazon Bedrock + Knowledge Base (RAG) |
| Hosting | GitHub Pages |
| Deploy | GitHub Actions (auto on push to main) |

---

## Local Development

```bash
# Install dependencies
npm install

# Run dev server (all 3 games + menu)
npx vite

# Build for production
npm run build

# Preview the production build
npx vite preview
```

---

## Deployment

Push to `main` and the GitHub Actions workflow (`.github/workflows/deploy.yml`) automatically builds and deploys to GitHub Pages.

To set up for the first time:
1. Go to repo **Settings → Pages**
2. Set Source to **"GitHub Actions"**
3. Push to `main` — the site deploys automatically

---

## Contributing

Want to add a new game or improve an existing one?

1. Create your game in its own folder (e.g. `my-new-game/index.html`)
2. Add it to `vite.config.js` under `rollupOptions.input`
3. Add a card to the root `index.html` menu
4. If your game has static assets, add a copy step in the `closeBundle` plugin

---

## Credits

Built by interns, for interns ★

Andrew Nsiah - Block Blast, Cloud Runner

Ankita Saha - Onboarding Quest

Leguejou Awunganyi - Design Help

Angel Ortega - Design Help
