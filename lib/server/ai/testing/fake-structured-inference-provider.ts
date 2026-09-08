import type { StructuredInferenceProvider, StructuredInferenceRequest, StructuredInferenceResult } from "../contracts";

export class FakeStructuredInferenceProvider implements StructuredInferenceProvider {
  readonly calls: StructuredInferenceRequest[] = [];
  constructor(private readonly result: StructuredInferenceResult) {}
  async generateStructuredInference(request: StructuredInferenceRequest): Promise<StructuredInferenceResult> {
    this.calls.push(structuredClone(request));
    return structuredClone(this.result);
  }
}
