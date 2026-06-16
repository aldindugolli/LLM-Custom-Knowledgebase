const HERMES_URL = process.env.HERMES_URL || "http://127.0.0.1:3412";

export default {
  description: "Search the persistent memory vault for relevant knowledge. ALWAYS search before answering technical questions to avoid repeating past mistakes or missing prior context.",
  args: {
    query: {
      type: "string",
      description: "Natural language search query describing what you're looking for",
    },
    type: {
      type: "string",
      enum: ["session", "learning", "decision", "concept", "project"],
      description: "Filter by note type",
      optional: true,
    },
    project: {
      type: "string",
      description: "Filter by project name",
      optional: true,
    },
    tags: {
      type: "array",
      items: { type: "string" },
      description: "Filter by tags",
      optional: true,
    },
    limit: {
      type: "number",
      description: "Max results to return (default: 10)",
      optional: true,
    },
  },
  async execute(args: any) {
    try {
      const response = await fetch(`${HERMES_URL}/memory/search`, {
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
