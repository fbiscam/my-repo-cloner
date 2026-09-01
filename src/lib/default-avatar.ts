// Deterministic default NFT avatar per user — same seed => same picture.
import a1 from "@/assets/nft/1.jpg.asset.json";
import a2 from "@/assets/nft/2.jpg.asset.json";
import a3 from "@/assets/nft/3.jpg.asset.json";
import a4 from "@/assets/nft/4.jpg.asset.json";
import a5 from "@/assets/nft/5.jpg.asset.json";
import a6 from "@/assets/nft/6.jpg.asset.json";
import a7 from "@/assets/nft/7.jpg.asset.json";
import a8 from "@/assets/nft/8.jpg.asset.json";
import a9 from "@/assets/nft/9.jpg.asset.json";
import a10 from "@/assets/nft/10.jpg.asset.json";

export const NFT_AVATARS: readonly string[] = [
  a1.url, a2.url, a3.url, a4.url, a5.url,
  a6.url, a7.url, a8.url, a9.url, a10.url,
];

/** Stable 32-bit hash (FNV-1a-ish) so a given seed always maps to the same avatar. */
function hashSeed(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

export function getDefaultAvatar(seed: string | null | undefined): string {
  const key = (seed ?? "").trim().toLowerCase() || "anon";
  return NFT_AVATARS[hashSeed(key) % NFT_AVATARS.length];
}
