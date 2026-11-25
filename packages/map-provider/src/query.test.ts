import { describe, expect, it } from "vitest";
import { readQuery } from "./query";

describe("readQuery", () => {
  it("reads pairs with or without the leading question mark", () => {
    expect([...readQuery("?a=1&b=two")]).toEqual([
      ["a", "1"],
      ["b", "two"],
    ]);
    expect(readQuery("a=1").get("a")).toBe("1");
  });

  it("returns an empty map for nothing", () => {
    expect(readQuery("").size).toBe(0);
    expect(readQuery("?").size).toBe(0);
  });

  it("keeps the first value of a repeated key and handles flags", () => {
    const query = readQuery("?x=1&x=2&flag");
    expect(query.get("x")).toBe("1");
    expect(query.get("flag")).toBe("");
  });

  it("decodes escapes and does not throw on bad ones", () => {
    expect(readQuery("?q=a%20b+c").get("q")).toBe("a b c");
    expect(readQuery("?q=%E0%A4%A").get("q")).toBe("%E0%A4%A");
  });
});
