import { describe, expect, it } from "vitest";
import { fillTemplate, firstInvalidField } from "./form";

const valid = { name: "Ada", email: "ada@example.com", message: "Hello there" };

describe("firstInvalidField", () => {
  it("returns null when every field is filled in", () => {
    expect(firstInvalidField(valid)).toBeNull();
  });

  it("flags a blank or whitespace-only name", () => {
    expect(firstInvalidField({ ...valid, name: "" })).toBe("name");
    expect(firstInvalidField({ ...valid, name: "   " })).toBe("name");
  });

  it("flags an email without an @ or a dot in the domain", () => {
    expect(firstInvalidField({ ...valid, email: "ada" })).toBe("email");
    expect(firstInvalidField({ ...valid, email: "ada@example" })).toBe("email");
    expect(firstInvalidField({ ...valid, email: "ada @example.com" })).toBe("email");
  });

  it("flags a message under five characters once trimmed", () => {
    expect(firstInvalidField({ ...valid, message: " hi  " })).toBe("message");
    expect(firstInvalidField({ ...valid, message: "hello" })).toBeNull();
  });

  it("reports fields in form order", () => {
    expect(firstInvalidField({ name: "", email: "", message: "" })).toBe("name");
    expect(firstInvalidField({ ...valid, email: "", message: "" })).toBe("email");
  });
});

describe("fillTemplate", () => {
  it("replaces each {key} with its value", () => {
    expect(fillTemplate("Thanks, {name}! At {email}.", { name: "Ada", email: "a@b.co" })).toBe(
      "Thanks, Ada! At a@b.co.",
    );
  });

  it("leaves unknown keys as they are", () => {
    expect(fillTemplate("Hi {who}", { name: "Ada" })).toBe("Hi {who}");
  });
});
