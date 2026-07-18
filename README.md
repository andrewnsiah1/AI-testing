# AWS Wizard Game 🧙‍♂️☁️

An interactive fantasy-themed learning game where an AI wizard teaches you AWS concepts through conversation. Ask questions, earn XP, complete quests, and unlock deeper knowledge.

**[▶️ Play Now](https://andrewnsiah1.github.io/AI-testing/)**

## How to Play

1. Open the link above — no account or setup needed
2. Type a question about any AWS service (e.g., "What is EC2?", "Explain Lambda", "How do VPCs work?")
3. The wizard answers in a fantasy style with real, accurate AWS knowledge
4. Keep asking questions to earn XP and level up!

**Game tips:**
- Ask about **different services** to discover new topics and start quests
- Complete quests by exploring related services (e.g., ask about EC2, Lambda, and ECS to complete "The Compute Trials")
- **Follow up** on topics for bonus deep-dive XP
- Your progress saves automatically in your browser — come back anytime

**Available quests:**
| Quest | What to Ask About |
|-------|------------------|
| The Compute Trials | EC2, Lambda, ECS/EKS |
| Secrets of the Network | VPC, Subnets, Security Groups |
| The Storage Vault | S3, EBS, EFS |
| The Database Dungeon | RDS, DynamoDB, ElastiCache |
| The Security Ward | IAM, KMS, Secrets Manager |
| The Serverless Sanctum | Lambda, API Gateway, Step Functions |

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
