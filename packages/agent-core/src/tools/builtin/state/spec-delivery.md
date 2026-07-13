Create the project-local delivery record for the active spec coding run.

Call this after implementation has produced task, change, and tool-result traces. Provide quality-gate evidence and any decisions, risks, open questions, or rollback notes that are not already present in the specification and design. Set `complete` to `true` only when every spec task is done and every evidence category required by the selected quality gate is present. The tool writes the structured record to the run's `delivery.md` file.
