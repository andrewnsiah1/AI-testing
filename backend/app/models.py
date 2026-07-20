"""Pydantic models for the Cloud Runner backend API."""

from pydantic import BaseModel
from typing import Optional


class Source(BaseModel):
    """A citation source retrieved from the Knowledge Base (RAG grounding)."""

    title: str
    url: Optional[str] = None
    snippet: str


class QuizRequest(BaseModel):
    """Request to generate a 4-choice quiz question for a service collected in the runner game."""

    service_id: str
    service_name: str
    category: str
    difficulty: Optional[str] = None  # Beginner | Intermediate | Advanced | Expert, scales with in-run score


class QuizResponse(BaseModel):
    """A generated multiple-choice quiz question."""

    question: str
    choices: list[str]
    correct_index: int
    fact: str  # shown as feedback regardless of correctness


class LaneQuizRequest(BaseModel):
    """Request for a 3-choice quiz question used by the in-run lane-gate mechanic."""

    service_id: str
    service_name: str
    category: str
    difficulty: Optional[str] = None  # Beginner | Intermediate | Advanced | Expert


class LaneQuizResponse(BaseModel):
    """A generated 3-choice quiz question, one choice per lane (left/center/right)."""

    question: str
    choices: list[str]  # exactly 3, index 0=left, 1=center, 2=right
    correct_index: int  # 0, 1, or 2
    fact: str


class AskQuestionRequest(BaseModel):
    """A free-text follow-up question scoped to a specific service, asked from the runner game."""

    service_id: str
    service_name: str
    category: str
    question: str
    conversation_history: Optional[list] = None


class AskQuestionResponse(BaseModel):
    """Answer to a free-text follow-up question."""

    answer: str
    sources: list[Source] = []
