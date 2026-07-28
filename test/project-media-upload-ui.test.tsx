import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { ProjectMediaUploadForm, validateProjectMediaSelection } from "@/app/(app)/projects/[id]/project-media-upload-form";

const reserve = vi.fn(); const ticket = vi.fn(); const signedUpload = vi.fn(); const finalize = vi.fn();
vi.mock("@/lib/actions/project-media-upload-reservation", () => ({ reserveProjectMediaUploadAction: (...a: unknown[]) => reserve(...a) }));
vi.mock("@/lib/actions/project-media-upload-ticket", () => ({ createProjectMediaUploadTicketAction: (...a: unknown[]) => ticket(...a) }));
vi.mock("@/lib/actions/project-media-upload-finalization", () => ({ finalizeProjectMediaUploadAction: (...a: unknown[]) => finalize(...a) }));
vi.mock("@/lib/supabase/browser", () => ({ createClient: () => ({ storage: { from: () => ({ uploadToSignedUrl: (...a: unknown[]) => signedUpload(...a) }) } }) }));
const projectId="11111111-1111-4111-8111-111111111111", mediaId="22222222-2222-4222-8222-222222222222";
function pick(){ const f=new File([new Uint8Array(100)],"anlage.jpg",{type:"image/jpeg"}); fireEvent.change(screen.getByLabelText("Datei"),{target:{files:[f]}}); return f; }
beforeEach(() => vi.clearAllMocks());

describe("direkte Upload-Orchestrierung",()=>{
 it("validiert die eingefrorenen Limits",()=>{ const f=new File(["x"],"x.pdf",{type:"application/pdf"}); Object.defineProperty(f,"size",{value:25_000_001}); expect(validateProjectMediaSelection(f,"other").file).toBeDefined(); });
 it("reserviert, erstellt Ticket, lädt nur signed direkt und finalisiert",async()=>{
  const order:string[]=[];
  reserve.mockImplementation(async()=>{order.push("reserve");return{success:true,data:{media_id:mediaId}}});
  ticket.mockImplementation(async()=>{order.push("ticket");return{success:true,data:{media_id:mediaId,project_id:projectId,path:"bound",token:"secret",expected_mime:"image/jpeg",expected_size:100}}});
  signedUpload.mockImplementation(async()=>{order.push("upload");return{error:null}});
  finalize.mockImplementation(async()=>{order.push("finalize");return{success:true,data:{upload_status:"ready"}}});
  render(<ProjectMediaUploadForm projectId={projectId}/>); const f=pick(); fireEvent.click(screen.getByRole("button",{name:"Datei hochladen"}));
  await screen.findByText("Die Datei wurde erfolgreich hochgeladen.");
  expect(order).toEqual(["reserve","ticket","upload","finalize"]);
  expect(ticket).toHaveBeenCalledWith({media_id:mediaId,project_id:projectId});
  expect(signedUpload).toHaveBeenCalledWith("bound","secret",f,{contentType:"image/jpeg",upsert:false});
  expect(finalize).toHaveBeenCalledWith({media_id:mediaId,project_id:projectId});
 });
 it("stoppt nach Ticketfehler",async()=>{reserve.mockResolvedValue({success:true,data:{media_id:mediaId}});ticket.mockResolvedValue({success:false,error:"Ticket konnte nicht erstellt werden"});render(<ProjectMediaUploadForm projectId={projectId}/>);pick();fireEvent.click(screen.getByRole("button",{name:"Datei hochladen"}));await screen.findByRole("alert");expect(signedUpload).not.toHaveBeenCalled();expect(finalize).not.toHaveBeenCalled();});
});
