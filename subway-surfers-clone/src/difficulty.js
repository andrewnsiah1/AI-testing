// Maps the player's current in-game score to a difficulty tier used to scale
// quiz question difficulty. Higher score during the run -> harder questions.

export const DIFFICULTY_TIERS = [
  { threshold: 0, label: 'Beginner' },
  { threshold: 150, label: 'Intermediate' },
  { threshold: 400, label: 'Advanced' },
  { threshold: 800, label: 'Expert' },
];

export function getDifficultyForScore(score) {
  let label = DIFFICULTY_TIERS[0].label;
  for (const tier of DIFFICULTY_TIERS) {
    if (score >= tier.threshold) {
      label = tier.label;
    }
  }
  return label;
}
