import type { Platform } from "@prisma/client";

export type NormalizedPost = {
  externalId: string;
  url: string | null;
  text: string;
  publishedAt: Date;
  authorHandle: string | null;
  authorName: string | null;
  authorAvatar: string | null;
  authorFollowers: number | null;
  authorVerified: boolean;
  likes: number;
  comments: number;
  shares: number;
  views: number;
  lang: string | null;
  mediaUrl: string | null;
  durationSec: number | null;
};

type Obj = Record<string, unknown>;

function get(o: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, k) => (acc && typeof acc === "object" ? (acc as Obj)[k] : undefined), o);
}

function first(o: unknown, paths: string[]): unknown {
  for (const p of paths) {
    const v = get(o, p);
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

const str = (v: unknown) => (v === undefined || v === null ? null : String(v));
const num = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
};

function date(v: unknown): Date | null {
  if (v === undefined || v === null) return null;
  if (typeof v === "number") return new Date(v < 1e12 ? v * 1000 : v);
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Maps a raw scraper item to Rasd's common post shape. Field names differ per
 * scraper, so each value is looked up from a list of known aliases.
 */
export function normalizeItem(platform: Platform, raw: unknown): NormalizedPost | null {
  if (!raw || typeof raw !== "object") return null;

  const text = str(
    first(raw, ["fullText", "full_text", "text", "caption", "content", "description", "message", "title", "postText"]),
  );
  const title = platform === "YOUTUBE" ? str(first(raw, ["title"])) : null;
  const body = [title, text && text !== title ? text : null].filter(Boolean).join("\n\n").trim();

  const externalId = str(
    first(raw, ["id", "id_str", "postId", "shortCode", "shortcode", "videoId", "urn", "post_id", "url"]),
  );
  if (!externalId || !body) return null;

  const publishedAt =
    date(first(raw, ["createdAt", "created_at", "timestamp", "createTimeISO", "createTime", "date", "postedAt.date", "postedAt", "time", "publishedAt", "uploadDate"])) ??
    new Date();

  return {
    externalId,
    url: str(first(raw, ["url", "twitterUrl", "webVideoUrl", "postUrl", "linkedinUrl", "link", "permalink"])),
    text: body.slice(0, 8000),
    publishedAt,
    authorHandle: str(
      first(raw, ["author.userName", "author.username", "user.screen_name", "ownerUsername", "authorMeta.name", "channelUsername", "author.publicIdentifier", "user.name", "pageName", "username", "channelName"]),
    ),
    authorName: str(
      first(raw, ["author.name", "user.name", "ownerFullName", "authorMeta.nickName", "channelName", "author.fullName", "pageName"]),
    ),
    authorAvatar: str(
      first(raw, ["author.profilePicture", "user.profile_image_url_https", "authorMeta.avatar", "author.avatar.url", "author.avatar", "channelAvatarUrl"]),
    ),
    authorFollowers:
      num(first(raw, ["author.followers", "user.followers_count", "authorMeta.fans", "numberOfSubscribers", "author.followersCount", "ownerFollowers", "followers"])) || null,
    authorVerified: Boolean(first(raw, ["author.isBlueVerified", "author.isVerified", "user.verified", "authorMeta.verified", "isChannelVerified"])),
    likes: num(first(raw, ["likeCount", "favorite_count", "likesCount", "diggCount", "likes", "engagement.likes", "reactionsCount"])),
    comments: num(first(raw, ["replyCount", "reply_count", "commentsCount", "commentCount", "engagement.comments", "comments"])),
    shares: num(first(raw, ["retweetCount", "retweet_count", "shareCount", "shares", "engagement.shares", "quoteCount"])),
    views: num(first(raw, ["viewCount", "views", "playCount", "videoViewCount", "videoPlayCount", "impressionCount"])),
    lang: str(first(raw, ["lang", "language", "textLanguage"])),
    mediaUrl: str(first(raw, ["displayUrl", "thumbnailUrl", "videoMeta.coverUrl", "media.0.url", "extendedEntities.media.0.media_url_https", "thumbnail"])),
    durationSec: parseDuration(first(raw, ["videoMeta.duration", "videoDuration", "duration", "durationSeconds"])),
  };
}

/** Accepts seconds or "m:ss" / "h:mm:ss". */
function parseDuration(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "number") return Math.round(v);
  const parts = String(v).split(":").map(Number);
  if (parts.some((n) => Number.isNaN(n))) return null;
  return Math.round(parts.reduce((a, n) => a * 60 + n, 0));
}
