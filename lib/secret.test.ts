import { beforeAll, describe, expect, it } from "vitest";
import { seal, unseal } from "./secret";

beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret";
});

describe("secret", () => {
  it("round-trips and doesn't store the plain text", () => {
    const sealed = seal("abcd-efgh-ijkl-mnop");
    expect(sealed).not.toContain("abcd");
    expect(unseal(sealed)).toBe("abcd-efgh-ijkl-mnop");
  });

  it("rejects tampering", () => {
    const sealed = seal("x");
    const broken = sealed.slice(0, -2) + (sealed.endsWith("A") ? "BB" : "AA");
    expect(() => unseal(broken)).toThrow();
  });
});
