// Tracks which AWS services the player collected during the current run.
// This is pure instrumentation — no UI here. The data feeds the end-of-run
// summary and quiz screen.

export class RunSession {
  constructor() {
    this.reset();
  }

  reset() {
    this.collectedServiceIds = []; // in order collected, may contain duplicates
  }

  recordCollection(serviceId) {
    this.collectedServiceIds.push(serviceId);
  }

  getUniqueServiceIds() {
    return [...new Set(this.collectedServiceIds)];
  }

  getCollectionCount(serviceId) {
    return this.collectedServiceIds.filter((id) => id === serviceId).length;
  }

  getTotalCollected() {
    return this.collectedServiceIds.length;
  }
}
