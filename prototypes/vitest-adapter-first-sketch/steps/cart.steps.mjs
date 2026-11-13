import { strict as assert } from "node:assert"
import { Given, When, Then } from "../runtime.mjs"
Given("an empty cart", (w) => { w.cart = [] })
When("I add {string} {int} time(s)", (w, item, n) => { for (let i = 0; i < n; i++) if (!w.cart.includes(item)) w.cart.push(item) })
Then("the cart holds {int} item(s)", (w, n) => assert.equal(w.cart.length, n))
