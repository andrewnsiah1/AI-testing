// Maps difficulty levels to tier labels. Two systems:
// 1. getDifficultyForScore — global, based on in-game score (legacy, still
//    used as a fallback)
// 2. getDifficultyForServiceLevel — per-service, based on how many correct
//    answers the player has gotten for that specific service this run. This
//    is the primary system now: ECS could be at level 5 (Expert) while VPC
//    is still level 1 (Beginner), because the player has answered more ECS
//    questions correctly.

export const DIFFICULTY_TIERS = [
  { threshold: 0, label: 'Beginner' },
  { threshold: 2, label: 'Intermediate' },
  { threshold: 4, label: 'Advanced' },
  { threshold: 6, label: 'Expert' },
  { threshold: 9, label: 'Master' },
];

// Legacy score-based difficulty (used as a floor so early-game questions
// for a brand new service aren't trivially easy once the run is deep).
export function getDifficultyForScore(score) {
  let label = DIFFICULTY_TIERS[0].label;
  for (const tier of DIFFICULTY_TIERS) {
    if (score >= tier.threshold * 75) {
      label = tier.label;
    }
  }
  return label;
}

// Per-service difficulty: level = number of correct answers for this service
// this run. Each correct answer advances the level, making questions for
// that service progressively harder while other services stay where they are.
export function getDifficultyForServiceLevel(level) {
  let label = DIFFICULTY_TIERS[0].label;
  for (const tier of DIFFICULTY_TIERS) {
    if (level >= tier.threshold) {
      label = tier.label;
    }
  }
  return label;
}
