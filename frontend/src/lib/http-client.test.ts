import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./http-client";

describe("api", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("preserves the JSON content type when creating a project", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ project: { _id: "project-1" } }),
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    await api.createProject("workspace-1", "Project Alpha");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);

    expect(headers.get("content-type")).toBe("application/json");
    expect(init.credentials).toBe("include");
    expect(init.body).toBe(
      JSON.stringify({ workspaceId: "workspace-1", name: "Project Alpha" }),
    );
  });

  it("sends the Postman collection payload when importing a project", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        project: { _id: "project-1" },
        importedFolders: 2,
        importedRequests: 4,
      }),
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    await api.importPostmanCollection({
      workspaceId: "workspace-1",
      collectionJson: '{"info":{"name":"Imported"},"item":[]}',
      projectName: "Imported Project",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);

    expect(headers.get("content-type")).toBe("application/json");
    expect(init.body).toBe(
      JSON.stringify({
        workspaceId: "workspace-1",
        collectionJson: '{"info":{"name":"Imported"},"item":[]}',
        projectName: "Imported Project",
      }),
    );
  });
  it("extracts the message from JSON error responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () =>
        JSON.stringify({
          statusCode: 401,
          error: "Unauthorized",
          message: "Invalid username or password",
        }),
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      api.login({ username: "demo", password: "wrong" }),
    ).rejects.toThrow("Invalid username or password");
  });

  it("forwards the abort signal when executing a request", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 200, statusText: "OK" }),
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const controller = new AbortController();

    await api.execute(
      {
        workspaceId: "workspace-1",
        projectId: "project-1",
        requestId: "request-1",
        method: "GET",
        url: "https://api.example.com/users",
        headers: [],
        params: [],
        auth: { type: "none" },
        body: { type: "none" },
      },
      controller.signal,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(init.signal).toBe(controller.signal);
  });
});

