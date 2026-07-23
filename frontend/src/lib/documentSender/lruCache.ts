/** LRU simple en memoria para Blobs PDF (máx. N entradas). */

export class LruBlobCache {
  private map = new Map<string, Blob>();
  constructor(private maxSize: number) {}

  get(key: string): Blob | undefined {
    const value = this.map.get(key);
    if (!value) return undefined;
    // refresh recency
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: string, value: Blob): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.maxSize) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}
