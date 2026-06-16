---
template: |
  Load or reload the Hermes memory context for this project.

  Call the Hermes context bundle API:
  POST /context/compiled
  Body: { "project": "$PROJECT", "goal": "$GOAL" }

  Then present the context to the user so they can see what Hermes knows about this project.

  $ARGUMENTS
description: Load Hermes memory context for the current project
agent: brainstorm
---

# /brainstorm

Reloads Hermes memory context for the current session. Use this when you want to refresh the agent's awareness of project context, recent learnings, and open decisions.

**Usage:** `/brainstorm <project-name> <optional-goal>`
**Example:** `/brainstorm brainstorm "Add deduplication engine"`
