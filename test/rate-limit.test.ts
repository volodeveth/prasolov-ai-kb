import { describe, it, expect } from "vitest";
import { hashIp, isAllowed } from "../src/lib/rate-limit";

describe("rate limit", () => {
  it("hashIp is deterministic and not identity", () => {
    expect(hashIp("1.2.3.4")).toBe(hashIp("1.2.3.4"));
    expect(hashIp("1.2.3.4")).not.toContain("1.2.3.4");
  });
  it("isAllowed compares count to limit of 20", () => {
    expect(isAllowed(19)).toBe(true);
    expect(isAllowed(20)).toBe(false);
  });
});
