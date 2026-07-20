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

from .models import Source, ServiceNotes, OrbNoteRequest

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


def _format_notes(notes: ServiceNotes) -> str:
    """Renders one service's unlocked notes as plain text for
    prompt-injection, exactly matching what the player has actually been
    taught in-game so far (in the order they were taught).
    """
    lines = [f"Service: {notes.service_name} (category: {notes.category})"]
    for i, note in enumerate(notes.notes, start=1):
        lines.append(f"Note {i}: {note}")
    return "\n".join(lines)


# Generates ONE new incremental teaching note when the player collects a
# service's notes orb. The note must build on whatever was already taught
# (prior_notes) without repeating it, starting from zero on first collection.
# Grounded by the Knowledge Base when available so the teaching content
# itself stays accurate - this is the ONE place in the notes pipeline that's
# allowed to pull in outside AWS knowledge, since it's the source that
# defines what the player has been taught, not a quiz testing beyond it.
ORB_NOTE_PROMPT = """You are writing a single short teaching note for "Cloud Runner", an educational endless-runner game that teaches real AWS concepts incrementally, one small idea at a time. Use a neutral, clear, straightforward tone - no persona, no roleplay, no flavor text.

The player just collected a "notes orb" for the AWS service "{service_name}" (category: {category}). This is one entry in a growing personal notebook the player builds up over the course of a run by collecting orbs for the same service repeatedly.

{prior_notes_block}

Write the NEXT note in this sequence. Rules:
1. If there are no prior notes, this is the player's introduction to {service_name} from zero - assume they know nothing about it yet. Teach the single most fundamental, "what is it" idea.
2. If there are prior notes, this note MUST build on top of them - teach one NEW idea that goes slightly deeper (a specific capability, a common use case, how it compares to something already taught, a key limitation, etc.). Do NOT repeat anything already covered in the prior notes.
3. Keep it to 1-2 short sentences - it will be shown as a brief in-game popup.
4. Be technically accurate. Do not invent capabilities.
5. This note (combined with all prior notes) will later be the ONLY material a quiz question about {service_name} is allowed to test - so make sure it is a complete, self-contained, unambiguous statement on its own, not a fragment that only makes sense with outside context.
6. No fantasy metaphors, no wizard language - plain technical English only.

Respond with ONLY the note text itself, no quotes, no JSON, no preamble.
"""


async def generate_orb_note(request: OrbNoteRequest) -> str:
    """
    Generates the next incremental teaching note for a service's notes orb,
    building from zero (if prior_notes is empty) or deeper than whatever the
    player has already been taught this run. Grounded by the Knowledge Base
    when available.

    Raises on failure - caller should fall back to a static incremental note.
    """
    rag_context, _sources = await query_knowledge_base(
        f"AWS {request.service_name} {request.category}"
    )

    if request.prior_notes:
        prior_notes_block = "The player has already been taught, in order:\n" + "\n".join(
            f"{i + 1}. {n}" for i, n in enumerate(request.prior_notes)
        )
    else:
        prior_notes_block = "The player has not been taught anything about this service yet - this is their first note."

    prompt = ORB_NOTE_PROMPT.format(
        service_name=request.service_name,
        category=request.category,
        prior_notes_block=prior_notes_block,
    )

    if rag_context:
        prompt += f"\n\nGround this note in this reference material from AWS documentation:\n{rag_context}\n"

    body = json.dumps(
        {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 150,
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
    note = response_body["content"][0]["text"].strip().strip('"')

    if not note:
        raise ValueError("Empty orb-note response from model")

    return note


# Used when the player HAS collected the notes orb for the quizzed service.
# At lower tiers, questions are grounded directly in the notes. At higher
# tiers, the question requires REASONING and INFERENCE from the topics and
# concepts introduced in the notes — it doesn't have to be a verbatim fact
# from the notes, but must be answerable by someone who understood the
# TOPICS taught. This makes the quiz progressively more challenging and
# thought-provoking as the player levels up a service.
LANE_QUIZ_NOTES_PROMPT = """You are a quiz question generator for "Cloud Runner", an educational endless-runner game that teaches real AWS concepts. Use a neutral, clear, straightforward tone - no persona, no roleplay, no flavor text.

This question will pop up DURING gameplay. The player runs in place while reading it, then picks one of exactly 3 answer choices, each mapped to a lane (left, center, right) on the road. They then run into the lane matching their chosen answer.

The player collected notes orbs for the AWS service "{service_name}" (category: {category}), unlocking exactly these incremental teaching notes, in the order they were taught:

--- NOTES ON {service_name} ---
{target_notes}
--- END NOTES ---

{extra_notes_block}

Difficulty tier for this question: {difficulty}

DIFFICULTY SCALING — this is crucial, read carefully:
- Beginner: Ask a simple recall question whose answer is directly stated in the notes. ("What type of storage is S3?")
- Intermediate: Ask about a use case or scenario where the player must APPLY a concept from the notes to a new situation. The answer isn't word-for-word in the notes but follows logically from what was taught. ("Which service would you use to store video files that need to be downloaded by users worldwide?")
- Advanced: Ask a question that requires COMPARING or CONTRASTING concepts from the notes (or across multiple unlocked services), or reasoning about what would happen in a specific scenario based on the properties taught. ("If you need storage accessible from multiple EC2 instances simultaneously, which would NOT work?")
- Expert: Ask a question that requires INFERRING implications, tradeoffs, or limitations from the concepts taught — things not explicitly stated but logically follow from the properties described. The player has to THINK, not just remember. ("A service that attaches to a single instance would have what limitation for a horizontally-scaled app?")
- Master: Ask a question that requires combining knowledge from MULTIPLE notes/services, reasoning about architecture decisions, or predicting failure modes. The player must synthesize everything they've learned and apply it to a novel problem. ("If your app needs both fast key-value lookups AND complex relational queries, what combination would you need?")

The question does NOT need to be answerable by quoting the notes verbatim (except at Beginner). It MUST be answerable by someone who UNDERSTOOD the topics and concepts introduced in the notes and can reason about them. Do NOT ask about specific AWS details that require outside knowledge unrelated to the topics in the notes (e.g. don't ask about pricing, specific region names, or API calls unless the notes mention them).

Additional rules:
1. Exactly 3 answer choices, only one correct.
2. Keep the question and choices VERY short - a sentence or less each.
3. Include a one-sentence "fact" shown as feedback - this should explain the reasoning, not just restate a note.
4. No fantasy metaphors, no wizard language - plain technical English only.
5. CRITICAL - WRONG ANSWERS MUST BE CLEARLY WRONG: The 2 incorrect choices must be unambiguously wrong to someone who understood the notes. They should describe things that contradict or are irrelevant to the concepts taught. NEVER make a wrong answer a partial truth or something that could arguably be correct.
6. VARIETY: Do not repeat the same question structure as previous quizzes. Each question should test a DIFFERENT aspect or angle of the service's concepts.

Respond with ONLY valid JSON in this exact shape, no other text:
{{
  "question": "...",
  "choices": ["...", "...", "..."],
  "correct_index": 0,
  "fact": "..."
}}
"""

# Used when the player did NOT collect the notes orb for the quizzed service.
# The question drops to what's visible in-game without reading anything
# service-specific: the orb's color-coded category. It must NOT test any
# fact specific to the individual service, since the player was never shown
# that content.
LANE_QUIZ_NO_NOTES_PROMPT = """You are a quiz question generator for "Cloud Runner", an educational endless-runner game that teaches real AWS concepts. Use a neutral, clear, straightforward tone - no persona, no roleplay, no flavor text.

This question will pop up DURING gameplay. The player runs in place while reading it, then picks one of exactly 3 answer choices, each mapped to a lane (left, center, right) on the road. They then run into the lane matching their chosen answer.

The player skipped the notes orb for an AWS service in the "{category}" category this run, so they have NOT been shown any lesson content about the specific service. They only know its color-coded category from the game.

{extra_notes_block}

STRICT GROUNDING RULE: Since the player has no service-specific notes, the question must ONLY test general knowledge of what the "{category}" category of AWS services is for at a high level (e.g. what a "{category}" service broadly does), not any fact specific to one particular service. Do not name a specific AWS service in the question or require knowing one to answer - keep it at the category concept level. If other-service notes are provided above, you may use them as a point of comparison, but the correct answer and distractors must still only require category-level reasoning, not specific facts about the unread service.

Additional rules:
1. Exactly 3 answer choices, only one correct.
2. Keep the question and choices VERY short - a sentence or less each.
3. Include a one-sentence "fact" shown as feedback after the player answers, reinforcing the correct answer, staying at the category level.
4. No fantasy metaphors, no wizard language - plain technical English only.
5. CRITICAL - WRONG ANSWERS MUST BE CLEARLY WRONG: The 2 incorrect choices must describe things that are obviously NOT what this category of services does. They should reference a completely different category's purpose (e.g. for a "Storage" question, wrong answers might be "run serverless code" or "manage DNS routing"). NEVER make a wrong answer a partial truth or something that could arguably be correct.

Respond with ONLY valid JSON in this exact shape, no other text:
{{
  "question": "...",
  "choices": ["...", "...", "..."],
  "correct_index": 0,
  "fact": "..."
}}
"""


async def generate_lane_quiz(
    service_id: str,
    service_name: str,
    category: str,
    difficulty: Optional[str] = None,
    has_notes: bool = False,
    target_notes: Optional[ServiceNotes] = None,
    unlocked_notes: Optional[list[ServiceNotes]] = None,
) -> dict:
    """
    Generate a 3-choice quiz question for the in-run lane-gate mechanic.
    Each choice maps to a lane (left/center/right) the player runs into.

    Grounded ENTIRELY in the player's own collected notes rather than the
    Knowledge Base - the question must never test beyond what the player has
    actually been shown in-game:
    - If `has_notes` and `target_notes` are provided, the question is
      grounded strictly in that service's notes (optionally also drawing on
      `unlocked_notes` from other services for comparisons).
    - Otherwise, the question stays at the service's category level, since
      the player was never shown anything more specific.

    Raises on failure - caller should fall back to a static 3-choice question bank.
    """
    extra_notes_block = ""
    if unlocked_notes:
        other = "\n\n".join(_format_notes(n) for n in unlocked_notes)
        extra_notes_block = (
            "The player has ALSO previously unlocked notes on these other services this run "
            "(you may use these for a comparison question, but still may not exceed what's written):\n"
            f"{other}\n"
        )

    if has_notes and target_notes:
        prompt = LANE_QUIZ_NOTES_PROMPT.format(
            service_name=service_name,
            category=category,
            target_notes=_format_notes(target_notes),
            extra_notes_block=extra_notes_block,
            difficulty=difficulty or "Beginner",
        )
    else:
        prompt = LANE_QUIZ_NO_NOTES_PROMPT.format(
            category=category,
            extra_notes_block=extra_notes_block,
        )

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
