const HERMES_URL = process.env.HERMES_URL || "http://127.0.0.1:3412";

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
      const response = await fetch(`${HERMES_URL}/session/start`, {
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
