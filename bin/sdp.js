#!/usr/bin/env node
// A checkout runs its sources; an installed package runs the JavaScript emitted at pack time.
import { existsSync } from "node:fs"
await import(existsSync(new URL("../src/cli/main.ts", import.meta.url)) ? "../src/cli/main.ts" : "../dist/cli/main.js")
