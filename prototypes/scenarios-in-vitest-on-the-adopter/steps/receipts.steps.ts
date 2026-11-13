import { expect } from "vitest"
import { Given, When, Then } from "../runtime.mjs"
import { internal } from "/Users/darkomijic/work/libar-platform/example/convex/_generated/api.js"
import { productionTest } from "/Users/darkomijic/work/libar-platform/tests/simulator/production.js"
const now = 1000
const receipt = (tenantId: string, requestKey: string) => ({
  tenantId, requestKey, expiresAt: now, namespace: "worker" as const, commandType: "SweepTest", fingerprint: "f",
  contractVersion: 1, outcome: "applied" as const, operationId: requestKey,
  affected: [{ contextId: "context", streamType: "subject", streamId: requestKey }],
  versions: [{ tenantId, contextId: "context", streamType: "subject", streamId: requestKey, version: 1 }],
  actorId: "worker", recordedAt: 0, tombstone: false
})
Given("tenant {string} has {int} expired receipt(s)", async (w: any, tenant: string, n: number) => {
  w.app ??= productionTest()
  await w.app.run(async (ctx: any) => { for (let i = 0; i < n; i++) await ctx.db.insert("receipts", receipt(tenant, `${tenant}-${i}`)) })
})
When("the receipts of tenant {string} are swept", async (w: any, tenant: string) => {
  w.swept = await w.app.mutation(internal.receipts.sweep, { tenantId: tenant, now, limit: 2000 })
})
Then("the sweep reports {int} deleted", (w: any, n: number) => expect(w.swept.deleted).toBe(n))
Then("the sweep says more remain", (w: any) => expect(w.swept.more).toBe(true))
Then("{int} receipt(s) remain(s)", async (w: any, n: number) =>
  expect(await w.app.run((ctx: any) => ctx.db.query("receipts").collect())).toHaveLength(n))
