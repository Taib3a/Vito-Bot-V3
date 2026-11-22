const cache = new Map();
const mediaCache = new Map();
const MAX = 1000;

export function cacheMessage(msg) {
  const id = msg?.key?.id;
  if (!id) return;
  cache.set(id, msg);
  if (cache.size > MAX) cache.delete(cache.keys().next().value);
}

export function getCachedMessage(id) {
  return id ? cache.get(id) : undefined;
}

export function cacheMedia(id, buffer) {
  if (!id || !buffer?.length) return;
  mediaCache.set(id, buffer);
  if (mediaCache.size > MAX) mediaCache.delete(mediaCache.keys().next().value);
}

export function getCachedMedia(id) {
  return id ? mediaCache.get(id) : undefined;
}
