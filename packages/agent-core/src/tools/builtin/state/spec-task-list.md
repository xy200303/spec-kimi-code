Maintain the structured task trace for a spec coding run.

Each task needs a stable `id`, a concise `title`, a `status`, and a `reason` that explains how it supports the approved goal. Record its `risk`, planned `affectedPaths`, actual `changedPaths`, and verification `evidence` whenever they become known. Set `activeTaskId` before editing files, running commands, or delegating work so their outcomes are automatically traced to that task; pass `null` to clear it. A low-risk active task can run supported changes without an extra prompt, while a high-risk active task always requires approval.

Use query mode before replacing an unfamiliar task list. Update the complete list only after a meaningful planning or execution change. Mark a task `blocked` and state the blocker in its evidence rather than silently treating it as done.
