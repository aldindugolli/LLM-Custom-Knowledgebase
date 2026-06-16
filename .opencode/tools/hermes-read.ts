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
  description: "Read a specific note from the memory vault by its ID or exact title.",
  args: {
    id: {
      type: "string",
      description: "The unique ID of the note to read",
      optional: true,
    },
    title: {
      type: "string",
      description: "The exact title of the note to read",
      optional: true,
    },
  },
  async execute(args: any) {
    try {
      const params = new URLSearchParams();
      if (args.id) params.set("id", args.id);
      if (args.title) params.set("title", args.title);
      const response = await hermesFetch(`${HERMES_URL}/memory/read?${params}`, {
        method: "GET",
      });
      const data = await response.json();
      return JSON.stringify(data, null, 2);
    } catch (err) {
      return JSON.stringify({ ok: false, error: `Hermes service unreachable: ${err}` });
    }
  },
};
