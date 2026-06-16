const HERMES_URL = process.env.HERMES_URL || "http://127.0.0.1:3412";

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
      const response = await fetch(`${HERMES_URL}/memory/read?${params}`, {
        method: "GET",
      });
      const data = await response.json();
      return JSON.stringify(data, null, 2);
    } catch (err) {
      return JSON.stringify({ ok: false, error: `Hermes service unreachable: ${err}` });
    }
  },
};
