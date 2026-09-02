import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";

vi.mock("@/lib/actions/persistent-conversation-cycle-service", () => ({ processPersistentCustomerMessage:vi.fn() }));
vi.mock("@/lib/server/conversation/persistent-cycle-data-source", () => ({ createPersistentCycleDataSource:vi.fn(() => ({ failCustomerMessage:vi.fn() })) }));

import { processPersistentCustomerMessage } from "@/lib/actions/persistent-conversation-cycle-service";
import { createPersistentCycleDataSource } from "@/lib/server/conversation/persistent-cycle-data-source";
import { CONVERSATION_CYCLE_LEASE_SECONDS, discoverRecoverableConversationCycles, runPersistentCustomerMessageCycle } from "@/lib/server/conversation/recoverable-cycle-runner";

const messageId="a1000000-0000-4000-8000-000000000001";
const commandId="a1000000-0000-4000-8000-000000000002";
const dependencies={claim:{rpc:vi.fn()},read:{rpc:vi.fn()},commit:{rpc:vi.fn()},createOwnerId:()=>"a1000000-0000-4000-8000-000000000003"};

describe("AP-16-06-02 recoverable conversation cycle runner",()=>{
  beforeEach(()=>vi.clearAllMocks());
  it("uses one finite owned acquisition and runs the existing orchestration exactly once",async()=>{
    vi.mocked(processPersistentCustomerMessage).mockResolvedValueOnce({success:true,kind:"completed_with_next_interaction",command_id:commandId,runtime_revision:2,knowledge_version:2,outbound_message_id:null,pending_interaction_id:null});
    await expect(runPersistentCustomerMessageCycle(dependencies,{message_id:messageId})).resolves.toEqual({kind:"completed",command_id:commandId});
    expect(processPersistentCustomerMessage).toHaveBeenCalledOnce();
    expect(createPersistentCycleDataSource).toHaveBeenCalledWith(dependencies,expect.objectContaining({ownerId:dependencies.createOwnerId(),leaseSeconds:CONVERSATION_CYCLE_LEASE_SECONDS}));
    expect(CONVERSATION_CYCLE_LEASE_SECONDS).toBe(300);
  });

  it("returns busy without retrying domain execution",async()=>{
    vi.mocked(processPersistentCustomerMessage).mockResolvedValueOnce({success:false,kind:"failed",code:"interaction_not_current",retry_class:"human_review"});
    await expect(runPersistentCustomerMessageCycle(dependencies,{message_id:messageId})).resolves.toEqual({kind:"busy"});
    expect(processPersistentCustomerMessage).toHaveBeenCalledTimes(1);
  });

  it("validates bounded content-free recovery discovery",async()=>{
    const row={command_id:commandId,source_message_id:messageId,lease_expired_at:"2026-09-02T12:00:00.000Z"};
    const rpc=vi.fn().mockResolvedValue({data:[row],error:null});
    await expect(discoverRecoverableConversationCycles({rpc},500)).resolves.toEqual([row]);
    expect(rpc).toHaveBeenCalledWith("discover_recoverable_conversation_cycles",{result_limit:100});
    expect(row).not.toHaveProperty("message_text"); expect(row).not.toHaveProperty("provider_payload");
  });

  it("defines atomic reclaim, fencing, legacy recovery and service-only security",async()=>{
    const sql=await readFile("supabase/migrations/202609020003_recoverable_conversation_cycle_runner.sql","utf8");
    expect(sql).toMatch(/execution_owner_id uuid/); expect(sql).toMatch(/execution_attempt_count=execution_attempt_count\+1/);
    expect(sql).toMatch(/execution_lease_expires_at>now_at/); expect(sql).toMatch(/code','busy'/);
    expect(sql.match(/code','ownership_lost'/g)?.length).toBeGreaterThanOrEqual(3);
    expect(sql).toMatch(/execution_lease_expires_at is null/); expect(sql).toMatch(/order by coalesce\([\s\S]*c\.id/);
    expect(sql).toMatch(/security definer set search_path=public,pg_temp/g);
    expect(sql).toMatch(/revoke all on function[\s\S]*public,anon,authenticated/); expect(sql).toMatch(/grant execute on function[\s\S]*service_role/);
    expect(sql).not.toMatch(/provider_payload|openai|graph api|cron|scheduler/i);
  });
});
