"""Bedrock integration for Cloud Runner's in-game AI features:
dynamic quiz generation (end-of-run and in-run lane gates) and
free-text follow-up questions scoped to a collected AWS service.

Answers are grounded with a Bedrock Knowledge Base (RAG) over real AWS
documentation when one is configured, so quiz facts and follow-up
answers stay accurate rather than relying purely on model knowledge.
"""

import json
import os
from typing import Optional

import boto3

from .models import Source

# Bedrock clients - initialized once per Lambda cold start
bedrock_runtime = boto3.client("bedrock-runtime", region_name=os.environ.get("AWS_REGION", "us-east-1"))
bedrock_agent_runtime = boto3.client(
    "bedrock-agent-runtime", region_name=os.environ.get("AWS_REGION", "us-east-1")
)

KNOWLEDGE_BASE_ID = os.environ.get("BEDROCK_KNOWLEDGE_BASE_ID", "")
MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "anthropic.claude-3-sonnet-20240229-v1:0")


def _strip_code_block(raw_text: str) -> str:
    """Strip a ```json ... ``` wrapper if the model added one."""
    raw_text = raw_text.strip()
    if raw_text.startswith("```"):
        raw_text = raw_text.strip("`")
        if raw_text.startswith("json"):
            raw_text = raw_text[4:]
        raw_text = raw_text.strip()
    return raw_text


async def query_knowledge_base(query: str) -> tuple[str, list[Source]]:
    """
    Query the Bedrock Knowledge Base for relevant AWS documentation.

    Returns the retrieved context text and source citations. Returns
    empty results if no Knowledge Base is configured or the query fails -
    callers should fall back to the model's general knowledge in that case.
    """
    sources: list[Source] = []
    context_text = ""

    if not KNOWLEDGE_BASE_ID:
        return context_text, sources

    try:
        response = bedrock_agent_runtime.retrieve(
            knowledgeBaseId=KNOWLEDGE_BASE_ID,
            retrievalQuery={"text": query},
            retrievalConfiguration={
                "vectorSearchConfiguration": {
                    "numberOfResults": 5,
                }
            },
        )

        results = response.get("retrievalResults", [])
        for result in results:
            content = result.get("content", {}).get("text", "")
            location = result.get("location", {})

            source_url = None
            source_title = "AWS Documentation"

            if location.get("type") == "S3":
                uri = location.get("s3Location", {}).get("uri", "")
                source_title = uri.split("/")[-1].replace(".pdf", "").replace(".html", "")
            elif location.get("type") == "WEB":
                source_url = location.get("webLocation", {}).get("url", "")
                source_title = source_url.split("/")[-1] if source_url else "AWS Docs"

            if content:
                context_text += f"\n{content}\n"
                sources.append(
                    Source(title=source_title, url=source_url, snippet=content[:200])
                )

    except Exception as e:
        print(f"Knowledge Base query failed: {e}")
        # Continue without RAG context - model will use its general knowledge

    return context_text, sources


QUIZ_GENERATION_PROMPT = """You are a quiz question generator for "Cloud Runner", an educational endless-runner game that teaches real AWS concepts. Use a neutral, clear, straightforward tone - no persona, no roleplay, no flavor text. Write like a technical quiz app, not a character.

The player just collected an in-game item representing the AWS service "{service_name}" (category: {category}).

Difficulty tier for this question: {difficulty}
(Beginner = high-level "what is it" questions; Intermediate = common use cases and basic behavior; Advanced = specific limits, configuration, or comparisons between similar services; Expert = edge cases, cost/performance tradeoffs, and architecture-level reasoning.)

Generate ONE multiple-choice question that tests a clear, factually correct understanding of {service_name} AT THE SPECIFIED DIFFICULTY TIER. Rules:
1. Exactly 4 answer choices, only one correct.
2. Keep the question and choices short enough to read in a few seconds (this appears in a fast-paced game UI).
3. The question's difficulty MUST match the specified tier - do not default to a basic question if the tier is Advanced or Expert.
4. Include a one-sentence "fact" that will be shown as feedback after the player answers (correct or not) - this should reinforce the correct answer.
5. Be technically accurate. Do not invent capabilities.
6. No fantasy metaphors, no "ancient scrolls", no wizard language - plain technical English only.

Respond with ONLY valid JSON in this exact shape, no other text:
{{
  "question": "...",
  "choices": ["...", "...", "...", "..."],
  "correct_index": 0,
  "fact": "..."
}}
"""


async def generate_quiz_question(
    service_id: str, service_name: str, category: str, difficulty: Optional[str] = None
) -> dict:
    """
    Generate a dynamic 4-choice quiz question for a given AWS service
    using Bedrock, grounded by the Knowledge Base when available.
    Used by the Cloud Runner end-of-run lesson/quiz.

    difficulty should be one of: Beginner, Intermediate, Advanced, Expert
    (see difficulty.js on the frontend for how it's derived from score).

    Raises on failure - caller should fall back to a static question bank.
    """
    rag_context, _sources = await query_knowledge_base(f"AWS {service_name} {category}")

    prompt = QUIZ_GENERATION_PROMPT.format(
        service_name=service_name,
        category=category,
        difficulty=difficulty or "Beginner",
    )

    if rag_context:
        prompt += f"\n\nGround your question and fact in this reference material from AWS documentation:\n{rag_context}\n"

    body = json.dumps(
        {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 400,
            "messages": [{"role": "user", "content": prompt}],
        }
    )

    response = bedrock_runtime.invoke_model(
        modelId=MODEL_ID,
        contentType="application/json",
        accept="application/json",
        body=body,
    )

    response_body = json.loads(response["body"].read())
    raw_text = _strip_code_block(response_body["content"][0]["text"])

    quiz_data = json.loads(raw_text)

    if (
        "question" not in quiz_data
        or "choices" not in quiz_data
        or len(quiz_data["choices"]) != 4
        or "correct_index" not in quiz_data
        or "fact" not in quiz_data
    ):
        raise ValueError("Malformed quiz response from model")

    return quiz_data


LANE_QUIZ_PROMPT = """You are a quiz question generator for "Cloud Runner", an educational endless-runner game that teaches real AWS concepts. Use a neutral, clear, straightforward tone - no persona, no roleplay, no flavor text.

This question will pop up DURING gameplay. The player runs in place while reading it, then picks one of exactly 3 answer choices, each mapped to a lane (left, center, right) on the road. They then run into the lane matching their chosen answer.

The player just collected an in-game item representing the AWS service "{service_name}" (category: {category}).

Difficulty tier for this question: {difficulty}
(Beginner = high-level "what is it" questions; Intermediate = common use cases and basic behavior; Advanced = specific limits, configuration, or comparisons between similar services; Expert = edge cases, cost/performance tradeoffs, and architecture-level reasoning.)

Generate ONE multiple-choice question about {service_name} AT THE SPECIFIED DIFFICULTY TIER. Rules:
1. Exactly 3 answer choices, only one correct - this is different from a normal 4-choice quiz because there are only 3 lanes.
2. Keep the question and choices VERY short - a sentence or less each. This appears as a popup during a fast-paced runner game and must be read in a few seconds.
3. The question's difficulty MUST match the specified tier.
4. Include a one-sentence "fact" shown as feedback after the player answers - this should reinforce the correct answer.
5. Be technically accurate. Do not invent capabilities.
6. No fantasy metaphors, no wizard language - plain technical English only.

Respond with ONLY valid JSON in this exact shape, no other text:
{{
  "question": "...",
  "choices": ["...", "...", "..."],
  "correct_index": 0,
  "fact": "..."
}}
"""


async def generate_lane_quiz(
    service_id: str, service_name: str, category: str, difficulty: Optional[str] = None
) -> dict:
    """
    Generate a 3-choice quiz question for the in-run lane-gate mechanic,
    grounded by the Knowledge Base when available. Each choice maps to a
    lane (left/center/right) the player runs into.

    Raises on failure - caller should fall back to a static 3-choice question bank.
    """
    rag_context, _sources = await query_knowledge_base(f"AWS {service_name} {category}")

    prompt = LANE_QUIZ_PROMPT.format(
        service_name=service_name,
        category=category,
        difficulty=difficulty or "Beginner",
    )

    if rag_context:
        prompt += f"\n\nGround your question and fact in this reference material from AWS documentation:\n{rag_context}\n"

    body = json.dumps(
        {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 400,
            "messages": [{"role": "user", "content": prompt}],
        }
    )

    response = bedrock_runtime.invoke_model(
        modelId=MODEL_ID,
        contentType="application/json",
        accept="application/json",
        body=body,
    )

    response_body = json.loads(response["body"].read())
    raw_text = _strip_code_block(response_body["content"][0]["text"])

    quiz_data = json.loads(raw_text)

    if (
        "question" not in quiz_data
        or "choices" not in quiz_data
        or len(quiz_data["choices"]) != 3
        or "correct_index" not in quiz_data
        or quiz_data["correct_index"] not in (0, 1, 2)
        or "fact" not in quiz_data
    ):
        raise ValueError("Malformed lane-quiz response from model")

    return quiz_data


ASK_QUESTION_SYSTEM_PROMPT = """You are a technical educator answering follow-up questions inside "Cloud Runner", an educational endless-runner game about AWS. Use a neutral, clear, straightforward tone - no persona, no roleplay, no fantasy flavor. Write like a helpful technical explainer, not a character.

The player is asking about the AWS service "{service_name}" (category: {category}), which they collected in-game. Answer their question directly and accurately.

Player level: {player_level}

Rules:
- Be technically accurate. Do not invent capabilities.
- Adjust depth to the player's level.
- Keep answers concise (2-4 sentences) unless the question clearly needs more detail - this appears in a small game UI panel, not a full chat window.
- If the question is unrelated to AWS or to {service_name}, politely redirect back to the topic.
- No fantasy metaphors, no wizard language - plain technical English only.
"""


async def ask_about_service(
    service_id: str,
    service_name: str,
    category: str,
    question: str,
    player_level: Optional[str] = None,
    conversation_history: Optional[list] = None,
) -> tuple[str, list[Source]]:
    """
    Answer a free-text follow-up question scoped to a specific AWS service,
    asked from the Cloud Runner "learn more" panel. Grounded by the
    Knowledge Base when available, returning citation sources alongside
    the answer.
    """
    rag_context, sources = await query_knowledge_base(question)

    system_prompt = ASK_QUESTION_SYSTEM_PROMPT.format(
        service_name=service_name,
        category=category,
        player_level=player_level or "Beginner",
    )

    if rag_context:
        system_prompt += f"""

REFERENCE MATERIAL (from AWS documentation):
{rag_context}

Use this reference material to ground your answer. Always be accurate.
If the reference material doesn't cover the question, use your general knowledge but note that.
"""

    messages = []
    if conversation_history:
        for msg in conversation_history[-6:]:
            messages.append(msg)
    messages.append({"role": "user", "content": question})

    body = json.dumps(
        {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 500,
            "system": system_prompt,
            "messages": messages,
        }
    )

    response = bedrock_runtime.invoke_model(
        modelId=MODEL_ID,
        contentType="application/json",
        accept="application/json",
        body=body,
    )

    response_body = json.loads(response["body"].read())
    answer = response_body["content"][0]["text"].strip()
    return answer, sources
