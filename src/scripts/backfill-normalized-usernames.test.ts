import { describe, expect, it } from "vitest";
import { planUsernameBackfill } from "./backfill-normalized-usernames";

describe("planUsernameBackfill", () => {
  it("plans every collision-free normalization before mutation", () => {
    expect(
      planUsernameBackfill([
        { id: "1", username: "Alice", usernameNormalized: null },
        { id: "2", username: "Bob", usernameNormalized: "bob" },
      ]),
    ).toEqual([{ id: "1", usernameNormalized: "alice" }]);
  });

  it("reports every conflicting ID and returns no plan", () => {
    expect(() =>
      planUsernameBackfill([
        { id: "user-1", username: "Alice", usernameNormalized: null },
        { id: "user-2", username: "ALICE", usernameNormalized: null },
      ]),
    ).toThrow("alice: user-1, user-2");
  });
});
