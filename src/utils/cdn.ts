/**
 * AMU RECORDS - Bunny.net CDN Accelerator
 * Supabase Storageへの直アクセスを Bunny.net CDN ホスト名に自動ルーティングし、
 * Supabaseのデータ転送量（Cached Data / Egress）を99%以上削減するユーティリティ
 */

const SUPABASE_STORAGE_HOST = "tnpnyebaljpsxdqzzzlx.supabase.co";
const BUNNY_CDN_HOST = process.env.NEXT_PUBLIC_BUNNY_CDN_HOST || "amu-records.b-cdn.net";

/**
 * 音源や画像URLを Bunny.net CDN 経由の高速キャッシュURLに変換
 */
export function toCdnUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (typeof url !== "string") return url;

  // すでに blob: や data: の場合はローカルURLなのでそのまま
  if (url.startsWith("blob:") || url.startsWith("data:")) {
    return url;
  }

  // Supabase Storage のホスト名を Bunny CDN に置換
  if (url.includes(SUPABASE_STORAGE_HOST)) {
    return url.replace(SUPABASE_STORAGE_HOST, BUNNY_CDN_HOST);
  }

  return url;
}
