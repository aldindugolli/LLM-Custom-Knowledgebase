const HERMES_URL = process.env.HERMES_URL || "http://127.0.0.1:3412";

async function hermesFetch(url: string, opts?: RequestInit, retries = 2): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, opts);
      if (res.ok) return res;
      if (i === retries) return res;
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    } catch {
      if (i === retries) throw;
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw new Error("Hermes service unreachable");
}

export default {
  description: "End the current session and save a summary. Call this when wrapping up your work to persist what you accomplished, learned, and decided.",
  args: {
    sessionId: {
      type: "string",
      description: "The session ID received from hermes-session-start",
    },
    summary: {
      type: "string",
      description: "A concise summary of what was accomplished this session",
    },
    learnings: {
      type: "array",
      items: { type: "string" },
      description: "Key learnings, discoveries, or insights from this session",
    },
    decisions: {
      type: "array",
      items: { type: "string" },
      description: "Decisions made during this session",
    },
    duration: {
      type: "number",
      description: "Session duration in minutes (optional)",
      optional: true,
    },
  },
  async execute(args: any) {
    try {
      const response = await hermesFetch(`${HERMES_URL}/session/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
      const data = await response.json();
      return JSON.stringify(data, null, 2);
    } catch (err) {
      return JSON.stringify({ ok: false, error: `Hermes service unreachable: ${err}` });
    }
  },
};
