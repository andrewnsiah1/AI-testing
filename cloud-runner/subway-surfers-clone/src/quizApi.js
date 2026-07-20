// Fetches a dynamically generated quiz question from the Cloud Runner
// backend. Falls back to null on any failure so callers can use the
// static question bank in services.js instead.

// Toggle this to test against a local backend (see backend/README or dev.sh).
// Set to false to use the deployed API Gateway URL.
const USE_LOCAL_BACKEND = false;

const API_BASE_URL = USE_LOCAL_BACKEND
  ? 'http://localhost:8000'
  : 'https://ew4z195och.execute-api.us-east-1.amazonaws.com';
const REQUEST_TIMEOUT_MS = 6000;

async function postJson(path, payload) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) return null;
    return await response.json();
  } catch (e) {
    console.warn(`Request to ${path} failed:`, e.message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// Sends a free-text follow-up question scoped to a specific service.
// Returns null on failure.
export async function askAboutService(service, question, conversationHistory) {
  const data = await postJson('/ask', {
    service_id: service.id,
    service_name: service.name,
    category: service.category,
    question,
    conversation_history: conversationHistory || [],
  });

  if (!data || typeof data.answer !== 'string') {
    return null;
  }

  return data.answer;
}

// Builds the wire-format notes payload for one service, matching the
// backend's ServiceNotes shape exactly. `notes` is the ordered list of
// incremental teaching notes the player has actually unlocked for this
// service this run (via fetchOrbNote) — NOT the static overview/analogy/
// practical-use content, which is reserved for the end-of-run recap only.
function toServiceNotes(service, notes) {
  return {
    service_name: service.name,
    category: service.category,
    notes: notes || [],
  };
}

// Generates the next incremental teaching note unlocked by collecting a
// service's notes orb. `priorNotes` is everything already taught about this
// service this run (empty on first collection) — the new note builds on
// top of it rather than repeating it. Returns null on failure so callers
// fall back to a static incremental note bank.
export async function fetchOrbNote(service, priorNotes) {
  const data = await postJson('/orb-note', {
    service_id: service.id,
    service_name: service.name,
    category: service.category,
    prior_notes: priorNotes || [],
  });

  if (!data || typeof data.note !== 'string' || !data.note.trim()) {
    return null;
  }

  return data.note.trim();
}

// Fetches a dynamically generated 3-choice quiz question for the in-run
// lane-gate mechanic. Returns null on failure so callers fall back to
// the static laneQuiz bank in services.js.
//
// `targetNotes` (string[]) grounds the question strictly in the incremental
// notes the player actually unlocked for the quizzed service this run, so
// the question never tests beyond what the player has actually been shown.
// `otherUnlocked` is a list of { service, notes } for services unlocked
// earlier in the run — the question may build off/compare against those
// too, but still never beyond what's written in any of them.
export async function fetchLaneQuiz(service, difficulty, targetNotes, otherUnlocked) {
  const hasNotes = !!(targetNotes && targetNotes.length > 0);
  const data = await postJson('/lane-quiz', {
    service_id: service.id,
    service_name: service.name,
    category: service.category,
    difficulty: difficulty || 'Beginner',
    has_notes: hasNotes,
    target_notes: hasNotes ? toServiceNotes(service, targetNotes) : null,
    unlocked_notes: (otherUnlocked || []).map((o) => toServiceNotes(o.service, o.notes)),
  });

  if (
    !data ||
    typeof data.question !== 'string' ||
    !Array.isArray(data.choices) ||
    data.choices.length !== 3 ||
    typeof data.correct_index !== 'number' ||
    typeof data.fact !== 'string'
  ) {
    return null;
  }

  return {
    question: data.question,
    choices: data.choices,
    correctIndex: data.correct_index,
    fact: data.fact,
  };
}

export async function fetchDynamicQuiz(service, difficulty) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const response = await fetch(`${API_BASE_URL}/quiz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: service.id,
        service_name: service.name,
        category: service.category,
        difficulty: difficulty || 'Beginner',
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    // Basic shape validation before trusting it
    if (
      typeof data.question !== 'string' ||
      !Array.isArray(data.choices) ||
      data.choices.length !== 4 ||
      typeof data.correct_index !== 'number' ||
      typeof data.fact !== 'string'
    ) {
      return null;
    }

    return {
      question: data.question,
      choices: data.choices,
      correctIndex: data.correct_index,
      fact: data.fact,
    };
  } catch (e) {
    console.warn('Dynamic quiz fetch failed, using static fallback:', e.message);
    return null;
  }
}
