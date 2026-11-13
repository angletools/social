/** Bounded synthetic query benchmark. Refuses every non-local or non-test database. */
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { db } from "../src/lib/db";
import { getKpis, getTimeseries } from "../src/lib/analytics";
import { countUniqueMentions, findUniqueMentions } from "../src/lib/mention-query";
import { getInboxPage } from "../src/lib/inbox";
import { getIntelligence } from "../src/lib/intelligence";
const url = new URL(process.env.DATABASE_URL ?? "");
if (!["127.0.0.1", "localhost"].includes(url.hostname) || !/^\/rasd_test_[a-z0-9_]+$/.test(url.pathname)) throw new Error("Use an isolated local rasd_test_* database");
async function main() {
  const org = await db.organization.create({ data: { name: "Synthetic query benchmark", slug: randomUUID() } });
  try {
    const monitors = [];
    for(let n=0;n<4;n++) monitors.push(await db.monitor.create({ data: { organizationId: org.id, name:`Brand ${n}`, type:"KEYWORD", terms:[], platforms:["X"] } }));
    const started = performance.now();
    await db.$executeRaw`INSERT INTO "Mention" (id,"organizationId","monitorId",platform,"externalId",text,"publishedAt",likes,comments,shares,topics,sentiment,intent,"authorHandle","authorFollowers","enrichedAt","classificationSource")
      SELECT ${org.id} || '-' || n, ${org.id}, (ARRAY[${monitors[0].id},${monitors[1].id},${monitors[2].id},${monitors[3].id}])[1+n/25000], 'X'::"Platform", 'post-' || (n%25000), 'Synthetic service complaint', (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - ((n%25000)%720 || ' hours')::interval, n%100, n%10, 2, ARRAY['service'], 'NEGATIVE'::"Sentiment", 'COMPLAINT'::"Intent", 'author-' || (n%1000), 100+n%1000, CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'HEURISTIC' FROM generate_series(0,99999) n`;
    console.log(JSON.stringify({ stage:"fixture", captures:100000, uniquePosts:25000, milliseconds:Math.round(performance.now()-started) }));
    const scope = { orgId:org.id, days:30 };
    const jobs = [
      ["kpis", () => getKpis(scope)], ["timeseries", () => getTimeseries(scope)],
      ["feed-count", () => countUniqueMentions({ organizationId:org.id })],
      ["feed-page", () => findUniqueMentions({ where:{organizationId:org.id}, take:20, orderBy:[{engagement:"desc"},{id:"desc"}] })],
      ["inbox-page", () => getInboxPage(org.id)], ["intelligence", () => getIntelligence(scope)],
    ] as const;
    for(const [query, run] of jobs) { const times=[]; for(let i=0;i<3;i++) { const start=performance.now(); await run(); times.push(Math.round(performance.now()-start)); } console.log(JSON.stringify({query, milliseconds:times})); }
  } finally { await db.organization.delete({where:{id:org.id}}); await db.$disconnect(); console.log(JSON.stringify({cleanup:"removed synthetic workspace and 100000 captures"})); }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
