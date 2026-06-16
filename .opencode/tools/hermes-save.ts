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
  description: "Save a piece of knowledge to the persistent Obsidian memory vault. Use this when you discover a reusable pattern, learn a gotcha, make an architecture decision, or encounter something worth remembering across sessions.",
  args: {
    type: {
      type: "string",
      enum: ["learning", "decision", "concept", "reference"],
      description: "Type of note to save",
    },
    title: {
      type: "string",
      description: "Concise, descriptive title for the knowledge",
    },
    body: {
      type: "string",
      description: "Detailed content of what you learned or decided",
    },
    project: {
      type: "string",
      description: "Project this knowledge relates to (default: general)",
      optional: true,
    },
    tags: {
      type: "array",
      items: { type: "string" },
      description: "Tags for categorization and search",
      optional: true,
    },
    importance: {
      type: "number",
      enum: [1, 2, 3, 4, 5],
      description: "Importance level (1=low, 5=critical)",
      optional: true,
    },
  },
  async execute(args: any) {
    try {
      const response = await hermesFetch(`${HERMES_URL}/memory/save`, {
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
