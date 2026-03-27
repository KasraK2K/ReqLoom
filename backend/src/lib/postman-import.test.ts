import { describe, expect, it } from "vitest";
import { parsePostmanCollection } from "./postman-import.js";

describe("parsePostmanCollection", () => {
  it("parses nested folders, inherited auth, collection variables, and query params", () => {
    const collection = {
      info: { name: "Payments API" },
      variable: [
        { key: "baseUrl", value: "https://api.example.com" },
        { key: "token", value: "secret-token" },
      ],
      auth: {
        type: "bearer",
        bearer: [{ key: "token", value: "{{token}}" }],
      },
      item: [
        {
          name: "Authentication",
          item: [
            {
              name: "Login",
              request: {
                method: "POST",
                header: [{ key: "content-type", value: "application/json" }],
                body: {
                  mode: "raw",
                  raw: '{"email":"hello@example.com"}',
                  options: { raw: { language: "json" } },
                },
                url: "{{baseUrl}}/auth/login",
              },
            },
          ],
        },
        {
          name: "List Customers",
          request: {
            method: "GET",
            url: {
              raw: "{{baseUrl}}/customers?page=2",
              query: [{ key: "page", value: "2" }],
            },
          },
        },
        {
          name: "Service Status",
          request: {
            method: "GET",
            auth: {
              type: "apikey",
              apikey: [
                { key: "key", value: "X-Api-Key" },
                { key: "value", value: "abc-123" },
                { key: "in", value: "header" },
              ],
            },
            url: "{{baseUrl}}/status",
          },
        },
      ],
    };

    const parsed = parsePostmanCollection(JSON.stringify(collection));

    expect(parsed.projectName).toBe("Payments API");
    expect(parsed.envVars).toEqual([
      { key: "baseUrl", value: "https://api.example.com" },
      { key: "token", value: "secret-token" },
    ]);
    expect(parsed.folders).toHaveLength(1);
    expect(parsed.requests).toHaveLength(2);

    const loginRequest = parsed.folders[0]?.requests[0];
    expect(loginRequest).toMatchObject({
      name: "Login",
      method: "POST",
      url: "{{baseUrl}}/auth/login",
      auth: { type: "bearer", token: "{{token}}" },
      body: {
        type: "json",
        content: '{"email":"hello@example.com"}',
      },
    });

    const customersRequest = parsed.requests[0];
    expect(customersRequest?.url).toBe("{{baseUrl}}/customers");
    expect(customersRequest?.params).toHaveLength(1);
    expect(customersRequest?.params[0]).toMatchObject({
      key: "page",
      value: "2",
      enabled: true,
    });
    expect(customersRequest?.auth).toEqual({
      type: "bearer",
      token: "{{token}}",
    });

    const statusRequest = parsed.requests[1];
    expect(statusRequest?.auth).toEqual({ type: "none" });
    expect(statusRequest?.headers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "X-Api-Key",
          value: "abc-123",
          enabled: true,
        }),
      ]),
    );
  });

  it("rejects invalid JSON", () => {
    expect(() => parsePostmanCollection("not-json")).toThrow(
      "The selected file is not valid JSON.",
    );
  });
});
