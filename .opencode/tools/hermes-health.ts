const HERMES_URL = process.env.HERMES_URL || "http://127.0.0.1:3412";

export default {
  description: "Run a health check on the memory vault. Identifies orphans (notes with no backlinks), broken wikilinks, stale pages, and provides vault statistics.",
  args: {
    detail: {
      type: "string",
      enum: ["summary", "full"],
      description: "summary for quick stats, full for detailed report",
      optional: true,
    },
  },
  async execute(args: any) {
    try {
      const endpoint = args.detail === "full" ? "/health/report" : "/health/summary";
      const response = await fetch(`${HERMES_URL}${endpoint}`, { method: "GET" });
      const data = await response.json();
      return JSON.stringify(data, null, 2);
    } catch (err) {
      return JSON.stringify({ ok: false, error: `Hermes service unreachable: ${err}` });
    }
  },
};
