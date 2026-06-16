const HERMES_URL = process.env.HERMES_URL || "http://127.0.0.1:3412";

let currentSessionId: string | null = null;
let sessionStartTime: number = 0;
let toolCallCount: number = 0;

export function hermesBrain(pluginContext: any) {
  const { project, client } = pluginContext;

  return {
    name: "hermes-brain",

    hooks: {
      "session.created": async ({ session }: { session: any }) => {
        const projectName = session.project || project || "general";
        const goal = session.goal || "No specific goal set";

        try {
          const startRes = await fetch(`${HERMES_URL}/session/start`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ project: projectName, goal }),
          });
          const startData = await startRes.json();
          if (startData.ok && startData.context) {
            currentSessionId = startData.context.sessionId;
            sessionStartTime = Date.now();
            toolCallCount = 0;
          }

          const ctxRes = await fetch(`${HERMES_URL}/context/compiled`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ project: projectName, goal }),
          });
          const ctxData = await ctxRes.json();

          if (ctxData.ok && ctxData.context) {
            return {
              systemMessage: ctxData.context,
            };
          }
        } catch (err) {
          console.error("[Hermes Brain] Failed to initialize session:", err);
        }
      },

      "session.message": async ({ message }: { message: any }) => {
        if (message.role === "assistant" && message.tool_calls) {
          toolCallCount++;
        }

        const hermesRegex = /hermes-(save|search|read|session-start|session-end|health)/;
        const hasHermesCall = JSON.stringify(message).match(hermesRegex);
        if (!hasHermesCall && toolCallCount >= 5 && toolCallCount % 5 === 0) {
          return {
            suggestion: "You haven't used Hermes memory tools recently. Consider searching the vault for relevant context with `hermes-search`.",
          };
        }
      },

      "session.ended": async ({ session }: { session: any }) => {
        if (!currentSessionId) return;

        try {
          const messages = session.messages || [];
          const transcript = messages
            .filter((m: any) => m.role === "assistant")
            .map((m: any) => m.content || "")
            .join("\n");

          const summary = messages
            .filter((m: any) => m.role === "assistant")
            .slice(-3)
            .map((m: any) => m.content || "")
            .join("\n")
            .slice(0, 1000);

          const response = await fetch(`${HERMES_URL}/session/end`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId: currentSessionId,
              summary: summary || "Session completed",
              learnings: [],
              decisions: [],
              duration: Math.floor((Date.now() - sessionStartTime) / 60000),
              toolCalls: toolCallCount,
            }),
          });

          const endData = await response.json();

          if (endData.ok) {
            const synthResponse = await fetch(`${HERMES_URL}/session/synthesize`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                sessionId: currentSessionId,
                summary: summary || "Session completed",
                learnings: [],
                decisions: [],
              }),
            });
            const synthData = await synthResponse.json();
            if (synthData.ok && synthData.report) {
              const report = synthData.report;
              if (report.learningsExtracted?.length > 0 || report.decisionsExtracted?.length > 0) {
                return {
                  summary: [
                    `Session auto-mined by Hermes Brain:`,
                    report.learningsExtracted?.length > 0 ? `  - ${report.learningsExtracted.length} learnings extracted` : "",
                    report.decisionsExtracted?.length > 0 ? `  - ${report.decisionsExtracted.length} decisions extracted` : "",
                    report.contradictions?.length > 0 ? `  - ⚠ ${report.contradictions.length} potential contradictions found` : "",
                    report.newWikilinks?.length > 0 ? `  - ${report.newWikilinks.length} wikilinks created` : "",
                  ].filter(Boolean).join("\n"),
                };
              }
            }
          }
        } catch (err) {
          console.error("[Hermes Brain] Failed to process session end:", err);
        }
      },

      "session.hermes-start": async ({ args }: { args: any }) => {
        currentSessionId = null;
        sessionStartTime = Date.now();
        toolCallCount = 0;

        try {
          const response = await fetch(`${HERMES_URL}/session/start`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              project: args.project || "general",
              goal: args.goal || "",
            }),
          });
          const data = await response.json();
          if (data.ok && data.context) {
            currentSessionId = data.context.sessionId;
          }
          return data;
        } catch (err) {
          console.error("[Hermes Brain] Session start failed:", err);
          return { ok: false, error: String(err) };
        }
      },
    },
  };
}
