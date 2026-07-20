// Tracks what happened during the current run for the AWS-learning side of
// the game: which services the player was quizzed on, the ordered list of
// incremental "notes" unlocked, per-service quiz difficulty level, and the
// results of every quiz question (for the end-of-run review screen).

export class RunSession {
  constructor() {
    this.reset();
  }

  reset() {
    this.quizzedServiceIds = [];
    this.notesByService = new Map();
    this.quizResults = []; // { question, correct, fact, serviceName }
    // Per-service difficulty level: each correct answer for a service bumps
    // its level by 1. This level (not the global score) determines the quiz
    // difficulty tier sent to the backend for that specific service — so a
    // service you've answered 5 questions correctly on gets much harder
    // questions than one you've only seen once.
    this.serviceDifficultyLevel = new Map(); // serviceId -> number (0-based)
  }

  recordQuizzed(serviceId) {
    this.quizzedServiceIds.push(serviceId);
  }

  // Records the outcome of a lane quiz for the end-of-run review, and
  // advances that service's difficulty level if the answer was correct.
  recordQuizResult(question, correct, fact, serviceName, serviceId) {
    this.quizResults.push({ question, correct, fact, serviceName });
    if (correct && serviceId) {
      const current = this.serviceDifficultyLevel.get(serviceId) || 0;
      this.serviceDifficultyLevel.set(serviceId, current + 1);
    }
  }

  // Returns the difficulty level for a specific service (0 = never answered
  // correctly, 1 = got 1 right, etc.)
  getServiceDifficulty(serviceId) {
    return this.serviceDifficultyLevel.get(serviceId) || 0;
  }

  addNote(serviceId, noteText) {
    if (!noteText) return;
    if (!this.notesByService.has(serviceId)) {
      this.notesByService.set(serviceId, []);
    }
    this.notesByService.get(serviceId).push(noteText);
  }

  getNotes(serviceId) {
    return this.notesByService.get(serviceId) || [];
  }

  hasNotes(serviceId) {
    return this.getNotes(serviceId).length > 0;
  }

  getUniqueQuizzedServiceIds() {
    return [...new Set(this.quizzedServiceIds)];
  }

  getUnlockedServiceIds() {
    return [...this.notesByService.keys()].filter((id) => this.hasNotes(id));
  }

  getQuizResults() {
    return this.quizResults;
  }
}
