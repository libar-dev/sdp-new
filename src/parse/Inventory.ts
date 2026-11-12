/**
 * A rough census of the abstractions that exist in code (exported types,
 * classes, functions, ...). It is the denominator of the significance ratio:
 * curated architecture should stay a small fraction of what exists.
 */

const byExtension: ReadonlyArray<readonly [RegExp, RegExp]> = [
  [
    /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/,
    /^\s*export\s+(?:default\s+)?(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:class|interface|type|function\*?|const|let|enum|namespace)\s+[A-Za-z_$]/gm
  ],
  [/\.py$/, /^(?:class|def|async\s+def)\s+[A-Za-z][\w]*/gm],
  [/\.go$/, /^(?:type|func)\s+(?:\([^)]*\)\s*)?[A-Z]/gm],
  [/\.(java|kt|cs|scala|swift)$/, /^\s*(?:public\s+|internal\s+|open\s+)?(?:abstract\s+|sealed\s+|data\s+|final\s+)*(?:class|interface|enum|record|object|trait|struct|protocol)\s+[A-Z]/gm],
  [/\.rs$/, /^\s*pub\s+(?:struct|enum|trait|fn|mod|type)\s+[A-Za-z]/gm],
  [/\.rb$/, /^\s*(?:class|module)\s+[A-Z]/gm],
  [/\.php$/, /^\s*(?:final\s+|abstract\s+)?(?:class|interface|trait|enum)\s+[A-Z]/gm]
]

export const countAbstractions = (file: string, content: string, pattern: string | undefined): number => {
  const regex = pattern ? new RegExp(pattern, "gm") : byExtension.find(([ext]) => ext.test(file))?.[1]
  if (!regex) return 0
  regex.lastIndex = 0
  return content.match(regex)?.length ?? 0
}
