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
  description: "Start a new session in the memory vault. Call this at the beginning of each work session to establish context for knowledge persistence.",
  args: {
    project: {
      type: "string",
      description: "The project or task name for this session",
    },
    goal: {
      type: "string",
      description: "A brief description of the session goal or objective",
      optional: true,
    },
  },
  async execute(args: any) {
    try {
      const response = await hermesFetch(`${HERMES_URL}/session/start`, {
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
