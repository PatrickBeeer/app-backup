import "../static/style.css";
import { analyzeProduct, DEMO_MODE, generateExecutionPlan } from "./llm";
import { attachQualityReport } from "./quality";
import type { AnalyzePayload, ExecutionPayload } from "./types";

const api = {
  async health() {
    return { ok: true, demo: DEMO_MODE };
  },

  async analyze(payload: AnalyzePayload) {
    if (!payload.image) throw new Error("请先上传产品图片");
    const result = attachQualityReport(await analyzeProduct(payload));
    return { ok: true, demo: DEMO_MODE, result };
  },

  async executionPlan(payload: ExecutionPayload) {
    const plan = await generateExecutionPlan(payload);
    return { ok: true, demo: DEMO_MODE, plan };
  },
};

declare global {
  interface Window {
    productFissionApi: typeof api;
  }
}

window.productFissionApi = api;
// Legacy UI logic remains plain JavaScript and is loaded after its typed API facade.
// @ts-expect-error The UI script is intentionally not an ES module.
void import("../static/app.js");
