import type { ExecuteRequestResult, RequestDoc } from "@restify/shared";
import { create } from "zustand";
import type { BuilderTab } from "../types";

interface ActiveRequestState {
  draft: RequestDoc | null;
  draftBaseContentUpdatedAt?: string;
  isDraftDirty: boolean;
  response: ExecuteRequestResult | null;
  responseRequestId?: string;
  isSending: boolean;
  activeTab: BuilderTab;
  setDraft: (
    draft: RequestDoc | null,
    options?: { dirty?: boolean; baseContentUpdatedAt?: string },
  ) => void;
  patchDraft: (patch: Partial<RequestDoc>) => void;
  setResponse: (
    response: ExecuteRequestResult | null,
    requestId?: string,
  ) => void;
  setSending: (isSending: boolean) => void;
  setActiveTab: (tab: BuilderTab) => void;
}

function getContentRevision(draft: RequestDoc | null): string | undefined {
  return draft?.contentUpdatedAt ?? draft?.updatedAt ?? draft?.createdAt;
}

export const useActiveRequestStore = create<ActiveRequestState>((set) => ({
  draft: null,
  draftBaseContentUpdatedAt: undefined,
  isDraftDirty: false,
  response: null,
  responseRequestId: undefined,
  isSending: false,
  activeTab: "body",
  setDraft: (draft, options) =>
    set((state) => ({
      draft,
      isDraftDirty: options?.dirty ?? Boolean(draft),
      draftBaseContentUpdatedAt:
        options?.baseContentUpdatedAt ??
        (options?.dirty === false
          ? getContentRevision(draft)
          : state.draftBaseContentUpdatedAt),
    })),
  patchDraft: (patch) =>
    set((state) => ({
      draft: state.draft
        ? { ...state.draft, ...patch, updatedAt: new Date().toISOString() }
        : null,
      isDraftDirty: Boolean(state.draft),
    })),
  setResponse: (response, responseRequestId) =>
    set({
      response,
      responseRequestId: response ? responseRequestId : undefined,
    }),
  setSending: (isSending) => set({ isSending }),
  setActiveTab: (activeTab) => set({ activeTab }),
}));
