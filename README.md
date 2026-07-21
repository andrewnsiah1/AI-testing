# Cloud Runner ☁️🏃

An educational Subway Surfers-style endless runner that teaches real AWS concepts while you play. Collect AWS service orbs, answer in-run quiz gates, and review what you learned between runs.

Play here: https://andrewnsiah1.github.io/AI-testing/
## How to Play

1. Run the game locally (see below) or open your deployed build
2. Dodge obstacles, collect AWS service orbs, and run into lane gates to answer quiz questions as they pop up
3. After each run, review a lesson recap of everything you collected and ask follow-up questions
4. Quiz difficulty scales with your score — the further you get, the harder the questions

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Cloud Runner   │────▶│  API Gateway +   │────▶│ Amazon Bedrock  │
│  (Three.js game)│◀────│  Lambda (FastAPI) │◀────│ Knowledge Base  │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                                         │
                                                         ▼
                                                  ┌─────────────────┐
                                                  │  S3 (AWS Docs)  │
                                                  └─────────────────┘
```

## Project Structure

```
cloud-runner/
├── subway-surfers-clone/   # The game (Three.js + Vite)
│   ├── src/                # Game logic, quiz gates, services data
│   └── public/models/      # 3D models
├── backend/                 # Python FastAPI Lambda
│   ├── app/
│   │   ├── main.py         # FastAPI routes
│   │   ├── ai.py           # Bedrock integration (quiz generation, Q&A, RAG)
│   │   ├── models.py       # Pydantic models
│   │   └── rate_limit.py
│   ├── requirements.txt
│   └── Dockerfile
├── infra/                   # AWS CDK infrastructure
│   ├── app.py
│   └── stacks/
├── data/                     # AWS documentation for the Knowledge Base
│   └── sources.json
└── dev.sh
```

## Local Development

```bash
./dev.sh backend   # starts FastAPI on :8000
./dev.sh game      # starts the Vite dev server on :3000
```

The game works without the backend running — it falls back to a static question bank in `subway-surfers-clone/src/services.js` when the API is unreachable.

## Backend API

- `POST /quiz` — generates a 4-choice quiz question for a collected service (end-of-run lesson)
- `POST /lane-quiz` — generates a 3-choice quiz question for the in-run lane-gate mechanic
- `POST /ask` — answers a free-text follow-up question about a specific service
- `GET /health` — health check

All generation is grounded by a Bedrock Knowledge Base (RAG) over real AWS documentation when `BEDROCK_KNOWLEDGE_BASE_ID` is configured, so answers stay accurate rather than relying purely on model knowledge.

## Deploying

```bash
cd backend && ./package.sh
cd ../infra && cdk deploy
```

Then update the API URL in `subway-surfers-clone/src/quizApi.js`.
