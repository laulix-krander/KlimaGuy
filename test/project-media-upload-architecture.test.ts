import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const form=readFileSync("app/(app)/projects/[id]/project-media-upload-form.tsx","utf8");
const flow=["lib/actions/project-media-upload-ticket.ts","lib/actions/project-media-upload-ticket-service.ts","lib/actions/project-media-upload-finalization.ts", "lib/actions/project-media-upload-finalization-service.ts", "app/(app)/projects/[id]/project-media-upload-form.tsx"].map(p=>readFileSync(p,"utf8")).join("\n");
describe("AP-12-02-HF-02 Architektur",()=>{
 it("entfernt den alten Binär-Action-Pfad",()=>{expect(existsSync("lib/actions/project-media-storage-upload.ts")).toBe(false);expect(existsSync("lib/actions/project-media-storage-upload-service.ts")).toBe(false);expect(form).not.toContain("uploadReservedProjectMediaAction");expect(form).not.toContain('uploadData.set("file"');});
 it("ordnet Reservierung, Ticket, Signed Upload und Finalisierung",()=>{const marks=["await reserveProjectMediaUploadAction(","await createProjectMediaUploadTicketAction(",".uploadToSignedUrl(","await finalizeProjectMediaUploadAction("];expect(marks.map(x=>form.indexOf(x))).toEqual([...marks.map(x=>form.indexOf(x))].sort((a,b)=>a-b));});
 it("verwendet weder Public URL, Service Role, Upsert noch freie Uploadmethode",()=>{for(const x of ["getPublicUrl","SUPABASE_SERVICE_ROLE","service_role","upsert: true",".upload(","bodySizeLimit"])expect(flow).not.toContain(x);expect(flow).not.toContain("createSignedUrl");});
});
