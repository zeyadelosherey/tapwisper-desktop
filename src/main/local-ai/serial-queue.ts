/** Runs async work one item at a time, in the order it was added */
export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve()
  private pending = 0

  /** Work waiting or running */
  get size(): number {
    return this.pending
  }

  add<T>(work: () => Promise<T>): Promise<T> {
    this.pending++
    const result = this.tail.then(work).finally(() => this.pending--)
    this.tail = result.catch(() => undefined)
    return result
  }
}
