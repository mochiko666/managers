export class PromiseQueue {
  protected lock: Promise<void> = Promise.resolve();
  public async set<T>(task: () => Promise<T>): Promise<T> {
    const next = this.lock.then(() => task());
    this.lock = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }
}
