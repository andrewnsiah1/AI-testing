# AWS Wizard Game 🧙‍♂️☁️

An interactive fantasy-themed learning game where an AI wizard teaches you AWS concepts through conversation. Ask questions, earn XP, complete quests, and unlock deeper knowledge.

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  GitHub Pages   │────▶│  API Gateway +   │────▶│ Amazon Bedrock  │
│  (Frontend)     │◀────│  Lambda (FastAPI) │◀────│ Knowledge Base  │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                                         │
                                                         ▼
                                                  ┌─────────────────┐
                                                  │  S3 (AWS Docs)  │
                                                  └─────────────────┘
```

## Project Structure

```
aws-wizard-game/
├── frontend/           # Static site for GitHub Pages
│   ├── index.html      # Main game interface
│   ├── css/            # Fantasy-themed styles
│   ├── js/             # Game logic, chat, XP system
│   └── assets/         # Images, icons
├── backend/            # Python FastAPI Lambda
│   ├── app/            # Application code
│   │   ├── main.py     # FastAPI routes
│   │   ├── wizard.py   # AI wizard persona + Bedrock integration
│   │   ├── game.py     # Game mechanics (XP, quests, levels)
│   │   └── models.py   # Pydantic models
│   ├── requirements.txt
│   └── Dockerfile
├── infra/              # AWS CDK infrastructure
│   ├── app.py
│   └── stacks/
├── data/               # AWS documentation for Knowledge Base
│   └── sources.json    # Doc URLs to ingest
└── README.md
```

## Game Mechanics

- **XP System**: Earn XP for asking questions, completing quests, exploring new topics
- **Levels**: Apprentice → Journeyman → Adept → Mage → Archmage
- **Quests**: Themed learning paths (e.g., "The Compute Trials", "Secrets of the Network")
- **Achievements**: Special badges for milestones
- **Topic Tree**: Unlock deeper topics as you level up

## Setup

### Prerequisites
- AWS account with Bedrock access (Claude model enabled)
- Python 3.11+
- Node.js 18+ (for CDK)
- AWS CLI configured

### Deploy Backend
```bash
cd infra
pip install -r requirements.txt
cdk deploy
```

### Deploy Frontend
Push the `frontend/` directory to GitHub Pages, or use the included GitHub Actions workflow.

### Environment Variables
The backend Lambda needs:
- `BEDROCK_KNOWLEDGE_BASE_ID` — Your Knowledge Base ID
- `BEDROCK_MODEL_ID` — e.g., `anthropic.claude-3-sonnet-20240229-v1:0`
