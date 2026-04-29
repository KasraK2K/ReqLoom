import type { RealtimeEvent } from "@restify/shared";
import { useEffect, useRef } from "react";
import { api } from "../lib/http-client";
import {
  isCurrentHistoryRequestSequence,
  nextHistoryRequestSequence,
  useHistoryStore,
} from "../store/history";
import { useWorkspaceStore } from "../store/workspaces";

const RECONNECT_BASE_DELAY_MS = 750;
const RECONNECT_MAX_DELAY_MS = 30_000;
const INVALIDATION_DELAY_MS = 150;

interface PendingInvalidations {
  workspaces: boolean;
  workspaceIds: Set<string>;
  historyByProject: Map<string, string>;
}

function createPendingInvalidations(): PendingInvalidations {
  return {
    workspaces: false,
    workspaceIds: new Set<string>(),
    historyByProject: new Map<string, string>(),
  };
}

function isRealtimeEvent(value: unknown): value is RealtimeEvent {
  if (!value || typeof value !== "object") {
    return false;
  }

  const event = value as Partial<RealtimeEvent>;
  return (
    typeof event.id === "string" &&
    typeof event.kind === "string" &&
    typeof event.occurredAt === "string" &&
    Array.isArray(event.workspaceIds)
  );
}

function getRealtimeUrl() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/realtime`;
}

function findProjectWorkspaceId(projectId: string): string | undefined {
  const { trees } = useWorkspaceStore.getState();
  for (const [workspaceId, tree] of Object.entries(trees)) {
    if (tree.projects.some((project) => project._id === projectId)) {
      return workspaceId;
    }
  }

  return undefined;
}

async function refreshHistory(projectId: string, workspaceId: string) {
  const sequence = nextHistoryRequestSequence(projectId);
  const { history } = await api.getProjectHistory(projectId, workspaceId);
  if (!isCurrentHistoryRequestSequence(projectId, sequence)) {
    return;
  }
  useHistoryStore.getState().setHistory(projectId, history);
}

export function useRealtimeSync(enabled: boolean) {
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const invalidationTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const hasConnectedRef = useRef(false);
  const pendingRef = useRef<PendingInvalidations>(createPendingInvalidations());

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      return;
    }

    let disposed = false;

    const clearReconnectTimer = () => {
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    const flushInvalidations = () => {
      invalidationTimerRef.current = null;
      const pending = pendingRef.current;
      pendingRef.current = createPendingInvalidations();

      if (pending.workspaces) {
        useWorkspaceStore.getState().loadWorkspaces().catch(() => undefined);
      }

      for (const workspaceId of pending.workspaceIds) {
        const { activeWorkspaceId, trees, loadWorkspaceTree } =
          useWorkspaceStore.getState();
        if (activeWorkspaceId === workspaceId || trees[workspaceId]) {
          loadWorkspaceTree(workspaceId).catch(() => undefined);
        }
      }

      for (const [projectId, workspaceId] of pending.historyByProject) {
        const { activeProjectId } = useWorkspaceStore.getState();
        const { historyByProject } = useHistoryStore.getState();
        if (activeProjectId === projectId || historyByProject[projectId]) {
          refreshHistory(projectId, workspaceId).catch(() => undefined);
        }
      }
    };

    const scheduleInvalidationFlush = () => {
      if (invalidationTimerRef.current !== null) {
        return;
      }

      invalidationTimerRef.current = window.setTimeout(
        flushInvalidations,
        INVALIDATION_DELAY_MS,
      );
    };

    const queueLoadedStateRefresh = () => {
      const pending = pendingRef.current;
      const { trees } = useWorkspaceStore.getState();
      pending.workspaces = true;
      Object.keys(trees).forEach((workspaceId) =>
        pending.workspaceIds.add(workspaceId),
      );

      const { historyByProject } = useHistoryStore.getState();
      Object.keys(historyByProject).forEach((projectId) => {
        const workspaceId = findProjectWorkspaceId(projectId);
        if (workspaceId) {
          pending.historyByProject.set(projectId, workspaceId);
        }
      });
      scheduleInvalidationFlush();
    };

    const queueEventRefresh = (event: RealtimeEvent) => {
      const pending = pendingRef.current;
      const [primaryWorkspaceId] = event.workspaceIds;

      if (event.kind.startsWith("workspace.")) {
        pending.workspaces = true;
      }

      if (
        event.kind.startsWith("project.") ||
        event.kind.startsWith("folder.") ||
        (event.kind.startsWith("request.") &&
          (event.kind !== "request.sent" || Boolean(event.requestIds?.length))) ||
        event.kind === "workspace.access.changed"
      ) {
        event.workspaceIds.forEach((workspaceId) =>
          pending.workspaceIds.add(workspaceId),
        );
      }

      if (event.kind === "request.sent" && primaryWorkspaceId) {
        event.projectIds?.forEach((projectId) =>
          pending.historyByProject.set(projectId, primaryWorkspaceId),
        );
      }

      scheduleInvalidationFlush();
    };

    const scheduleReconnect = () => {
      if (disposed) {
        return;
      }

      const attempt = reconnectAttemptRef.current;
      reconnectAttemptRef.current += 1;
      const exponentialDelay = Math.min(
        RECONNECT_MAX_DELAY_MS,
        RECONNECT_BASE_DELAY_MS * 2 ** attempt,
      );
      const jitter = Math.floor(Math.random() * 300);
      reconnectTimerRef.current = window.setTimeout(
        connect,
        exponentialDelay + jitter,
      );
    };

    function connect() {
      clearReconnectTimer();
      const socket = new WebSocket(getRealtimeUrl());
      socketRef.current = socket;

      socket.addEventListener("open", () => {
        reconnectAttemptRef.current = 0;
        if (hasConnectedRef.current) {
          queueLoadedStateRefresh();
        }
        hasConnectedRef.current = true;
      });

      socket.addEventListener("message", (message) => {
        try {
          const parsed = JSON.parse(String(message.data)) as unknown;
          if (isRealtimeEvent(parsed)) {
            queueEventRefresh(parsed);
            if (
              parsed.kind === "workspace.created" ||
              parsed.kind === "workspace.duplicated" ||
              parsed.kind === "workspace.access.changed"
            ) {
              socket.close(4001, "Workspace membership changed");
            }
          }
        } catch {
          return;
        }
      });

      socket.addEventListener("close", (event) => {
        if (socketRef.current === socket) {
          socketRef.current = null;
        }
        if (event.code !== 1008) {
          scheduleReconnect();
        }
      });

      socket.addEventListener("error", () => {
        socket.close();
      });
    }

    connect();

    return () => {
      disposed = true;
      clearReconnectTimer();
      if (invalidationTimerRef.current !== null) {
        window.clearTimeout(invalidationTimerRef.current);
        invalidationTimerRef.current = null;
      }
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [enabled]);
}
