import type { Monitor, MonitorType, Platform } from "@prisma/client";

/**
 * Which Monid endpoint collects data for each platform + monitor type, and how
 * a monitor is turned into that endpoint's input.
 *
 * Monid fronts many scrapers (several are Apify actors). The defaults below use
 * well-known actors; any of them can be swapped without a code change by setting
 *   MONID_ENDPOINT_<PLATFORM>_<TYPE>="provider#endpoint"   e.g.
 *   MONID_ENDPOINT_X_KEYWORD="apify#apidojo/tweet-scraper"
 * Run `npm run monid:discover` to list candidates and their input schemas.
 */

export type SourceSpec = {
  provider: string;
  endpoint: string;
  build: (m: Pick<Monitor, "terms" | "excludeTerms" | "languages" | "maxItemsPerRun" | "type">) => Record<string, unknown>;
};

const clean = (t: string) => t.trim().replace(/^[#@]/, "");
const quote = (t: string) => (/\s/.test(t) ? `"${t}"` : t);

function xQuery(m: Parameters<SourceSpec["build"]>[0]): string[] {
  const terms = m.terms.map(clean).filter(Boolean);
  const excl = m.excludeTerms.map((t) => `-${quote(clean(t))}`).join(" ");
  const lang = m.languages.length === 1 ? ` lang:${m.languages[0]}` : "";
  const parts = terms.map((t) => {
    if (m.type === "HASHTAG") return `#${t}`;
    if (m.type === "PROFILE") return `(from:${t} OR to:${t} OR @${t})`;
    return quote(t);
  });
  return [`(${parts.join(" OR ")}) ${excl}${lang}`.trim()];
}

const DEFAULTS: Partial<Record<Platform, Partial<Record<MonitorType, SourceSpec>>>> = {
  X: Object.fromEntries(
    (["KEYWORD", "HASHTAG", "PROFILE", "TOPIC"] as MonitorType[]).map((type) => [
      type,
      {
        provider: "apify",
        endpoint: "apidojo/tweet-scraper",
        build: (m) => ({ searchTerms: xQuery(m), maxItems: m.maxItemsPerRun, sort: "Latest" }),
      } satisfies SourceSpec,
    ]),
  ),
  INSTAGRAM: {
    HASHTAG: {
      provider: "apify",
      endpoint: "apify/instagram-hashtag-scraper",
      build: (m) => ({ hashtags: m.terms.map(clean), resultsLimit: m.maxItemsPerRun }),
    },
    KEYWORD: {
      provider: "apify",
      endpoint: "apify/instagram-hashtag-scraper",
      build: (m) => ({ hashtags: m.terms.map((t) => clean(t).replace(/\s+/g, "")), resultsLimit: m.maxItemsPerRun }),
    },
    TOPIC: {
      provider: "apify",
      endpoint: "apify/instagram-hashtag-scraper",
      build: (m) => ({ hashtags: m.terms.map((t) => clean(t).replace(/\s+/g, "")), resultsLimit: m.maxItemsPerRun }),
    },
    PROFILE: {
      provider: "apify",
      endpoint: "apify/instagram-scraper",
      build: (m) => ({
        directUrls: m.terms.map((t) => `https://www.instagram.com/${clean(t)}/`),
        resultsType: "posts",
        resultsLimit: m.maxItemsPerRun,
      }),
    },
  },
  TIKTOK: Object.fromEntries(
    (["KEYWORD", "HASHTAG", "PROFILE", "TOPIC"] as MonitorType[]).map((type) => [
      type,
      {
        provider: "apify",
        endpoint: "clockworks/tiktok-scraper",
        build: (m) => {
          const terms = m.terms.map(clean);
          if (m.type === "HASHTAG") return { hashtags: terms, resultsPerPage: m.maxItemsPerRun };
          if (m.type === "PROFILE") return { profiles: terms, resultsPerPage: m.maxItemsPerRun };
          return { searchQueries: terms, resultsPerPage: m.maxItemsPerRun };
        },
      } satisfies SourceSpec,
    ]),
  ),
  YOUTUBE: Object.fromEntries(
    (["KEYWORD", "HASHTAG", "PROFILE", "TOPIC"] as MonitorType[]).map((type) => [
      type,
      {
        provider: "apify",
        endpoint: "streamers/youtube-scraper",
        build: (m) =>
          m.type === "PROFILE"
            ? { startUrls: m.terms.map((t) => ({ url: `https://www.youtube.com/@${clean(t)}` })), maxResults: m.maxItemsPerRun }
            : {
                searchQueries: m.terms.map((t) => (m.type === "HASHTAG" ? `#${clean(t)}` : clean(t))),
                maxResults: m.maxItemsPerRun,
                sortingOrder: "date",
              },
      } satisfies SourceSpec,
    ]),
  ),
  FACEBOOK: {
    PROFILE: {
      provider: "apify",
      endpoint: "apify/facebook-posts-scraper",
      build: (m) => ({
        startUrls: m.terms.map((t) => ({ url: `https://www.facebook.com/${clean(t)}` })),
        resultsLimit: m.maxItemsPerRun,
      }),
    },
  },
  LINKEDIN: {
    KEYWORD: {
      provider: "apify",
      endpoint: "harvestapi/linkedin-post-search",
      build: (m) => ({ searchQueries: m.terms.map(clean), maxPosts: m.maxItemsPerRun, sortBy: "date" }),
    },
    TOPIC: {
      provider: "apify",
      endpoint: "harvestapi/linkedin-post-search",
      build: (m) => ({ searchQueries: m.terms.map(clean), maxPosts: m.maxItemsPerRun, sortBy: "date" }),
    },
  },
};

export function sourceFor(platform: Platform, type: MonitorType): SourceSpec | null {
  const spec = DEFAULTS[platform]?.[type] ?? null;
  const override = process.env[`MONID_ENDPOINT_${platform}_${type}`];
  if (override && spec) {
    const [provider, endpoint] = override.split("#");
    if (provider && endpoint) return { ...spec, provider, endpoint };
  }
  return spec;
}

/** Platforms that can serve a monitor type; used to grey out options in the UI. */
export function supportedPlatforms(type: MonitorType): Platform[] {
  return (Object.keys(DEFAULTS) as Platform[]).filter((p) => DEFAULTS[p]?.[type]);
}
