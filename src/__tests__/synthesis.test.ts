import { describe, it, expect } from "vitest";
import { createSynthesisEngine } from "../core/synthesis.js";
import { createVault } from "../core/vault.js";
import { createSearchEngine } from "../core/search.js";

describe("SynthesisEngine", () => {
  const vault = createVault({ path: "./test-vault", port: 0, host: "127.0.0.1" });
  const search = createSearchEngine(vault);
  const synthesis = createSynthesisEngine(vault, search);

  describe("isContradictory", () => {
    it("detects direct negation contradiction", () => {
      const a = "Always use TypeScript strict mode for projects";
      const b = "Never use TypeScript strict mode for projects";
      expect(synthesis.isContradictory(a, b)).toBe(true);
    });

    it("does not flag non-contradictory statements", () => {
      const a = "React hooks are useful for state management";
      const b = "Fastify is a fast web framework";
      expect(synthesis.isContradictory(a, b)).toBe(false);
    });

    it("detects contradiction with negation", () => {
      const a = "We should use PostgreSQL for this project";
      const b = "We should never use PostgreSQL for this project";
      expect(synthesis.isContradictory(a, b)).toBe(true);
    });

    it("returns false for similar non-negated statements", () => {
      const a = "The API should use RESTful design";
      const b = "The API should use RESTful design throughout";
      expect(synthesis.isContradictory(a, b)).toBe(false);
    });

    it("detects 'avoid' as a negation word", () => {
      const a = "Use microservices architecture";
      const b = "Avoid microservices architecture for small projects";
      expect(synthesis.isContradictory(a, b)).toBe(true);
    });
  });
});
