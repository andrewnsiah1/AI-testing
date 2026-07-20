#!/bin/bash
# Local development script
# Starts both the backend (FastAPI) and the Cloud Runner game (Vite)

echo "Starting Cloud Runner locally..."
echo ""

case "${1:-all}" in
    backend)
        echo "Starting backend on http://localhost:8000"
        cd backend
        pip install -r requirements.txt -q
        uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
        ;;
    game)
        echo "Starting game on http://localhost:3000"
        cd subway-surfers-clone
        npm install
        npm run dev
        ;;
    all)
        echo "Run in separate terminals:"
        echo "  ./dev.sh backend"
        echo "  ./dev.sh game"
        echo ""
        echo "The game falls back to a static question bank if the backend isn't running."
        ;;
esac
