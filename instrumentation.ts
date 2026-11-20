import { skipEdgeCache } from "@/server/edge-cache";

/** A server render that reported an error must never be shared from the edge
 * cache (worker/index.ts); the visitor still gets the error boundary. */
export function onRequestError() {
  skipEdgeCache();
}
