"""FastAPI application - main entry point for the Cloud Runner backend."""

import os
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum

from .models import (
    QuizRequest,
    QuizResponse,
    LaneQuizRequest,
    LaneQuizResponse,
    AskQuestionRequest,
    AskQuestionResponse,
    OrbNoteRequest,
    OrbNoteResponse,
)
from .ai import generate_quiz_question, generate_lane_quiz, ask_about_service, generate_orb_note
from .rate_limit import rate_limiter

app = FastAPI(
    title="Cloud Runner API",
    description="Backend API for Cloud Runner's in-game AI features (quiz generation, follow-up Q&A)",
    version="1.0.0",
)

# CORS - allow GitHub Pages and local dev
allowed_origins = os.environ.get(
    "ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000,http://localhost:8000"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "alive"}


@app.post("/quiz", response_model=QuizResponse)
async def quiz(request: QuizRequest, raw_request: Request):
    """
    Generate a dynamic 4-choice quiz question for a service collected in the
    Cloud Runner mini-game. Falls back to a 502 if generation fails -
    the frontend should catch this and use its static question bank.
    """
    rate_limiter.check(raw_request)

    try:
        quiz_data = await generate_quiz_question(
            service_id=request.service_id,
            service_name=request.service_name,
            category=request.category,
            difficulty=request.difficulty,
        )
    except Exception as e:
        print(f"Quiz generation failed for {request.service_id}: {e}")
        raise HTTPException(status_code=502, detail="Quiz generation failed")

    return QuizResponse(
        question=quiz_data["question"],
        choices=quiz_data["choices"],
        correct_index=quiz_data["correct_index"],
        fact=quiz_data["fact"],
    )


@app.post("/lane-quiz", response_model=LaneQuizResponse)
async def lane_quiz(request: LaneQuizRequest, raw_request: Request):
    """
    Generate a 3-choice quiz question for the in-run lane-gate mechanic.
    Each choice maps to a lane (left/center/right) the player runs into to answer.
    """
    rate_limiter.check(raw_request)

    try:
        quiz_data = await generate_lane_quiz(
            service_id=request.service_id,
            service_name=request.service_name,
            category=request.category,
            difficulty=request.difficulty,
            has_notes=request.has_notes,
            target_notes=request.target_notes,
            unlocked_notes=request.unlocked_notes,
        )
    except Exception as e:
        print(f"Lane quiz generation failed for {request.service_id}: {e}")
        raise HTTPException(status_code=502, detail="Lane quiz generation failed")

    return LaneQuizResponse(
        question=quiz_data["question"],
        choices=quiz_data["choices"],
        correct_index=quiz_data["correct_index"],
        fact=quiz_data["fact"],
    )


@app.post("/orb-note", response_model=OrbNoteResponse)
async def orb_note(request: OrbNoteRequest, raw_request: Request):
    """
    Generate the next incremental teaching note unlocked by collecting a
    service's notes orb. Builds on `prior_notes` (everything already taught
    about this service this run) rather than repeating it - starts from zero
    on the first collection. This note (combined with prior ones) becomes
    the ONLY material later lane-quiz questions about this service may test.
    Falls back to a 502 if generation fails - the frontend should catch this
    and use its static incremental note bank.
    """
    rate_limiter.check(raw_request)

    try:
        note = await generate_orb_note(request)
    except Exception as e:
        print(f"Orb-note generation failed for {request.service_id}: {e}")
        raise HTTPException(status_code=502, detail="Orb-note generation failed")

    return OrbNoteResponse(note=note)


@app.post("/ask", response_model=AskQuestionResponse)
async def ask(request: AskQuestionRequest, raw_request: Request):
    """
    Answer a free-text follow-up question scoped to a specific service,
    asked from the Cloud Runner "learn more" panel.
    """
    rate_limiter.check(raw_request)

    try:
        answer, sources = await ask_about_service(
            service_id=request.service_id,
            service_name=request.service_name,
            category=request.category,
            question=request.question,
            conversation_history=request.conversation_history,
        )
    except Exception as e:
        print(f"Ask-question failed for {request.service_id}: {e}")
        raise HTTPException(status_code=502, detail="Question answering failed")

    return AskQuestionResponse(answer=answer, sources=sources)


# Lambda handler via Mangum
handler = Mangum(app)
