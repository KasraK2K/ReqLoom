import type { HistoryDoc } from "@restify/shared";
import { create } from "zustand";

const DEFAULT_HISTORY_LIMIT = 250;
const historyRequestSequences = new Map<string, number>();

interface HistoryState {
  historyByProject: Record<string, HistoryDoc[]>;
  historyLimit: number;
  setHistoryLimit: (historyLimit: number) => void;
  setHistory: (projectId: string, history: HistoryDoc[]) => void;
  prependHistory: (projectId: string, entry: HistoryDoc) => void;
}

export const useHistoryStore = create<HistoryState>((set) => ({
  historyByProject: {},
  historyLimit: DEFAULT_HISTORY_LIMIT,
  setHistoryLimit: (historyLimit) =>
    set((state) => ({
      historyLimit,
      historyByProject: Object.fromEntries(
        Object.entries(state.historyByProject).map(([projectId, history]) => [
          projectId,
          history.slice(0, historyLimit),
        ]),
      ),
    })),
  setHistory: (projectId, history) =>
    set((state) => ({
      historyByProject: {
        ...state.historyByProject,
        [projectId]: history.slice(0, state.historyLimit),
      },
    })),
  // Sequence helpers are intentionally kept beside the history store so async
  // refreshers can drop stale responses without forcing extra React state.
  prependHistory: (projectId, entry) =>
    set((state) => ({
      historyByProject: {
        ...state.historyByProject,
        [projectId]: [
          entry,
          ...(state.historyByProject[projectId] ?? []),
        ].slice(0, state.historyLimit),
      },
    })),
}));

export function nextHistoryRequestSequence(projectId: string): number {
  const nextSequence = (historyRequestSequences.get(projectId) ?? 0) + 1;
  historyRequestSequences.set(projectId, nextSequence);
  return nextSequence;
}

export function isCurrentHistoryRequestSequence(
  projectId: string,
  sequence: number,
): boolean {
  return historyRequestSequences.get(projectId) === sequence;
}
