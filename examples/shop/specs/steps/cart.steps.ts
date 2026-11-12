import { strict as assert } from "node:assert"
import { defineSteps } from "sdp"
import { Cart } from "../../src/cart.ts"

export default defineSteps(
  () => ({ cart: new Cart(), country: "DE", durations: [] as Array<number> }),
  ({ Given, Then, When }) => {
    Given("a cart with {int} items at {int} cents", ({ args: [quantity, price], world }) => {
      world.cart.add("sku-1", price, quantity)
    })

    Given("a cart with {int} distinct lines", ({ args: [lines], world }) => {
      for (let i = 0; i < lines; i++) world.cart.add(`sku-${i}`, 100 + i)
    })

    When("the delivery country is {word}", ({ args: [country], world }) => {
      world.country = country
    })

    When("the total is calculated {int} times", ({ args: [times], world }) => {
      for (let i = 0; i < times; i++) {
        const started = performance.now()
        world.cart.total(world.country)
        world.durations.push(performance.now() - started)
      }
    })

    Then("the total is {int} cents", ({ args: [total], world }) => {
      assert.equal(world.cart.total(world.country), total)
    })

    Then("pricing fails with {string}", ({ args: [message], world }) => {
      assert.throws(() => world.cart.total(world.country), new RegExp(message))
    })

    Then("each calculation takes under {int} ms on average", ({ args: [budget], world }) => {
      const average = world.durations.reduce((a, b) => a + b, 0) / world.durations.length
      assert.ok(average < budget, `average ${average.toFixed(3)} ms`)
    })
  }
)
