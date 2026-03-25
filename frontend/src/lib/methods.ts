import type { HttpMethod } from "@restify/shared";

export const METHOD_STYLES: Record<HttpMethod, string> = {
  GET: "bg-emerald-500/15 text-emerald-300 border-emerald-400/20",
  POST: "bg-sky-500/15 text-sky-300 border-sky-400/20",
  PUT: "bg-orange-500/15 text-orange-300 border-orange-400/20",
  PATCH: "bg-amber-500/15 text-amber-300 border-amber-400/20",
  DELETE: "bg-rose-500/15 text-rose-300 border-rose-400/20",
  HEAD: "bg-violet-500/15 text-violet-300 border-violet-400/20",
  OPTIONS: "bg-slate-500/15 text-slate-200 border-slate-400/20",
};

export const METHOD_TEXT_STYLES: Record<HttpMethod, string> = {
  GET: "text-emerald-300",
  POST: "text-sky-300",
  PUT: "text-orange-300",
  PATCH: "text-amber-300",
  DELETE: "text-rose-300",
  HEAD: "text-violet-300",
  OPTIONS: "text-slate-200",
};

export const METHOD_OPTIONS = Object.keys(METHOD_STYLES) as HttpMethod[];
