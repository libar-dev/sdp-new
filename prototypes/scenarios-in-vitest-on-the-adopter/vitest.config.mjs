import { defineConfig } from "vitest/config"
import sdp from "./sdp-vitest.mjs"
const tier = (name, environment) => ({ plugins: [sdp()], test: { name, environment, include: ["specs/**/*.feature"], env: { SDP_TAGS: `@${name}` } } })
export default defineConfig({ test: { reporters: ["default", "./evidence.mjs"], projects: [tier("pure", "node"), tier("simulator", "edge-runtime")] } })
