export * from "@restify/shared";

export type BuilderTab = "body" | "headers" | "auth" | "params";
export type InspectorTab = "environment" | "history" | "admin";

export interface VariableResolution {
  output: string;
  resolved: string[];
  unresolved: string[];
}