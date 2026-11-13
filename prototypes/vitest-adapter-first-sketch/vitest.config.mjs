import { defineConfig } from "vitest/config"
import sdp from "./sdp-vitest.mjs"
export default defineConfig({ plugins: [sdp()], test: { include: ["specs/**/*.feature"] } })
