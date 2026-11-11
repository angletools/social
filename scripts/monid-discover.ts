/**
 * Lists Monid endpoints for each platform so the defaults in
 * src/lib/monid/sources.ts can be verified or overridden.
 *   npm run monid:discover            # all platforms
 *   npm run monid:discover -- "tiktok hashtag posts"
 */
import { MonidClient } from "../src/lib/monid/client";

const client = MonidClient.fromEnv();
if (!client) {
  console.error("Set MONID_API_KEY first.");
  process.exit(1);
}

const queries = process.argv[2]
  ? [process.argv[2]]
  : [
      "twitter x search tweets",
      "instagram hashtag posts",
      "instagram profile posts",
      "tiktok search videos",
      "youtube search videos",
      "facebook page posts",
      "linkedin post search",
    ];

async function main() {
  for (const q of queries) {
    const res = await client!.discover(q, 5);
    console.log(`\n## ${q}`);
    console.log(JSON.stringify(res, null, 2).slice(0, 4000));
  }
  if (process.argv[3]) {
    const [provider, endpoint] = process.argv[3].split("#");
    console.log(
      JSON.stringify(await client!.inspect(provider, endpoint), null, 2),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
