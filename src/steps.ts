/**
 * The API for step definition modules:
 *
 *   import { defineSteps, pending } from "sdp/steps"
 *
 * Everything a step file needs and nothing else: importing it loads no parser
 * and reads no workspace. `sdp` is the programmatic API.
 *
 * @sdp is ARCH-runner
 */
export { defineSteps, Pending, pending } from "./run/Steps.ts"
export type {
  ExpressionArgs,
  ScenarioInfo,
  StepContext,
  StepDefinition,
  StepModule,
  StepOutcome,
  StepRegistrar
} from "./run/Steps.ts"
