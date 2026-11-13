import { expect } from "vitest"
import { Given, When, Then } from "../runtime.mjs"
import { fold } from "/Users/darkomijic/work/libar-platform/src/kernel/index.js"
Given("the events {string}", (w: any, events: string) => { w.events = events.split(", ") })
When("they are folded onto {string}", (w: any, initial: string) => { w.state = fold((s: string, e: string) => s + e, initial, w.events) })
Then("the state is {string}", (w: any, state: string) => expect(w.state).toBe(state))
