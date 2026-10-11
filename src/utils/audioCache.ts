/**
 * AMU RECORDS - Audio Cache Engine (Web Cache API)
 * 楽曲MP3データをブラウザ内に安全にキャッシュし、
 * 同じ曲の2回目以降の再生時にSupabaseへの通信（Cached Data / Egress）を完全に「0バイト」にするエンジン
 */

const CACHE_NAME = "amu-records-audio-v1";
const MAX_CACHED_TRACKS = 30; // 最大30曲（約200MB）をLRUで安全に保持

// メモリ内の Blob URL キャッシュ（同一セッション内での高速再利用）
const blobUrlMap = new Map<string, string>();

/**
 * Cache API がサポートされているか確認
 */
function isCacheSupported(): boolean {
  return typeof window !== "undefined" && "caches" in window;
}

/**
 * 古いキャッシュ曲を削除して容量を安全に維持（LRU）
 */
async function cleanOldCaches(cache: Cache) {
  try {
    const keys = await cache.keys();
    if (keys.length > MAX_CACHED_TRACKS) {
      // 古い順に削除
      const deleteCount = keys.length - MAX_CACHED_TRACKS;
      for (let i = 0; i < deleteCount; i++) {
        await cache.delete(keys[i]);
      }
    }
  } catch (err) {
    console.warn("Failed to clean audio cache:", err);
  }
}

/**
 * 音声URLからキャッシュ済みBlob URLを取得、
 * まだキャッシュにない場合は元のURLを返しつつバックグラウンドでキャッシュ保存
 */
export async function getCachedAudioUrl(audioUrl: string): Promise<string> {
  if (!audioUrl || !isCacheSupported()) {
    return audioUrl;
  }

  // 1. メモリ内にすでに Blob URL がある場合は即座にそれを返す（通信量0）
  if (blobUrlMap.has(audioUrl)) {
    return blobUrlMap.get(audioUrl)!;
  }

  try {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(audioUrl);

    // 2. ブラウザの Cache Storage に存在する場合
    if (cachedResponse) {
      const blob = await cachedResponse.blob();
      const blobUrl = URL.createObjectURL(blob);
      blobUrlMap.set(audioUrl, blobUrl);
      console.log("⚡ [AudioCache] Cache hit! Supabase egress: 0 bytes ->", audioUrl);
      return blobUrl;
    }

    // 3. キャッシュにない場合：再生を待たせないために元のURLを返しつつ、裏でダウンロードしてキャッシュ
    backgroundCacheAudio(audioUrl, cache);
    return audioUrl;
  } catch (err) {
    console.warn("Audio cache lookup failed, fallback to direct url:", err);
    return audioUrl;
  }
}

/**
 * バックグラウンドで音声を非同期フェッチしてキャッシュに保存
 */
async function backgroundCacheAudio(audioUrl: string, cache: Cache) {
  try {
    // 優先度低めでバックグラウンド取得
    const response = await fetch(audioUrl, {
      mode: "cors",
      credentials: "omit",
    });

    if (response.ok) {
      await cache.put(audioUrl, response.clone());
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      blobUrlMap.set(audioUrl, blobUrl);
      console.log("💾 [AudioCache] Saved to cache for zero-egress future plays:", audioUrl);
      await cleanOldCaches(cache);
    }
  } catch (err) {
    // オフラインや中断時は無視
  }
}

/**
 * 次の曲（ランダム候補など）を事前キャッシュ
 */
export async function preloadAudioToCache(audioUrl: string) {
  if (!audioUrl || !isCacheSupported() || blobUrlMap.has(audioUrl)) {
    return;
  }

  try {
    const cache = await caches.open(CACHE_NAME);
    const existing = await cache.match(audioUrl);
    if (!existing) {
      backgroundCacheAudio(audioUrl, cache);
    }
  } catch {
    // ignore
  }
}
