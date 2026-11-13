/** A value that reads back as the number it is written as is a number; `true` and `false` are booleans; the rest is text. */
export const tagValue = (text: string): unknown => {
  if (text === "true" || text === "false") return text === "true"
  const number = Number(text)
  return Number.isFinite(number) && String(number) === text ? number : text
}
