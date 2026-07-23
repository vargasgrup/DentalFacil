import { describe, expect, it } from "vitest";
import { DocumentErrorHandler, DocumentSendError } from "./errorHandler";
import { LruBlobCache } from "./lruCache";

describe("DocumentErrorHandler", () => {
  it("classifies DocumentSendError", () => {
    const err = new DocumentSendError("FileTooLarge");
    const info = DocumentErrorHandler.handleError(err);
    expect(info.code).toBe("FileTooLarge");
    expect(info.retryable).toBe(false);
  });

  it("classifies abort as WebShareAborted", () => {
    const info = DocumentErrorHandler.classify(new Error("AbortError: share cancelled"));
    expect(info.code).toBe("WebShareAborted");
  });
});

describe("LruBlobCache", () => {
  it("evicts oldest entries", () => {
    const cache = new LruBlobCache(2);
    cache.set("a", new Blob(["1"]));
    cache.set("b", new Blob(["2"]));
    cache.set("c", new Blob(["3"]));
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBeTruthy();
    expect(cache.get("c")).toBeTruthy();
  });

  it("refreshes recency on get", () => {
    const cache = new LruBlobCache(2);
    cache.set("a", new Blob(["1"]));
    cache.set("b", new Blob(["2"]));
    cache.get("a");
    cache.set("c", new Blob(["3"]));
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBeTruthy();
  });
});
