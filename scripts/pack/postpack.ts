/** Puts the checkout back as it was before npm packed it. */
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Effect } from "effect"
import { dryRun, restoreCheckout } from "./checkout.ts"

NodeRuntime.runMain(dryRun ? Effect.void : restoreCheckout().pipe(Effect.provide(NodeServices.layer)))
