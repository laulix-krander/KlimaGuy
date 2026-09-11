"use server";

import { operateTestCustomerReset, type TestCustomerResetInput, type TestCustomerResetResult, type TestCustomerResetSource } from "./test-customer-reset-service";
import { issueTestResetPreviewReceipt, resetTestTransportCustomer, verifyTestResetPreviewReceipt } from "@/lib/server/test-customer-reset-adapter";
import { createClient } from "@/lib/supabase/server";

async function source(): Promise<TestCustomerResetSource> {
  const supabase = await createClient();
  return {
    async getUser() { const { data, error } = await supabase.auth.getUser(); if (error) throw error; return data.user ? { id: data.user.id } : null; },
    async getProfile(userId) { const { data, error } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle(); if (error) throw error; return data; },
    reset: resetTestTransportCustomer,
    issuePreviewReceipt: issueTestResetPreviewReceipt,
    verifyPreviewReceipt: verifyTestResetPreviewReceipt,
  };
}

export async function previewTestCustomerReset(input: TestCustomerResetInput): Promise<TestCustomerResetResult> {
  return operateTestCustomerReset(input, "preview", await source());
}

export async function commitTestCustomerReset(input: TestCustomerResetInput & { preview_receipt: string }): Promise<TestCustomerResetResult> {
  return operateTestCustomerReset(input, "commit", await source(), input.preview_receipt);
}
