@id=effect-for-io @kind=decision
Feature: Effect 4 for IO, errors and services

  Not plain `async`/`await`: timeouts, interruption, typed errors and a file system that scenarios
  swap for one in memory would each be written by hand. The price is a library few contributors
  know, whose version 4 an agent must look up in `node_modules/effect`, not recall from 2 or 3, and
  a Promise facade over the use cases, so that a program using sdp need not know it either.

  Rule: Parsing, the model, the graph and what is computed from it do no IO

    sdp reads and writes a workspace through the `FileSystem` service, which scenarios swap for one
    in memory, except for what Node reads to load step code.
