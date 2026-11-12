---
id: DEC-0007
---

# A phase ends in a milestone whose gate is scenarios, and met is recorded once

Not a backlog or sprints: nothing in them says the architecture is proven before features are
built on it, and their status lives where no scenario can read it. Not met by the calendar or by
what the results say today: a date would fail tomorrow the commit that passes today, and results
are local and go stale, so passing the gate is recorded once, as `met: <date>` in the milestone.
