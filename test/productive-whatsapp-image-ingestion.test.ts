import {describe,expect,it,vi} from "vitest";
import {downloadWhatsAppImage} from "@/lib/server/whatsapp/meta-media-adapter";
import {runWhatsAppImageIngestion} from "@/lib/server/whatsapp/media-ingestion";

const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const jpeg=new Uint8Array([0xff,0xd8,0xff,1]);
const response=(body:BodyInit|null,init:ResponseInit={})=>new Response(body,init);

describe("productive Meta image retrieval",()=>{
 it("resolves and downloads with bearer auth and bounded byte validation",async()=>{
  const fetcher=vi.fn().mockResolvedValueOnce(response(JSON.stringify({url:"https://lookaside.example/media",mime_type:"image/jpeg",file_size:4}),{status:200,headers:{"content-type":"application/json"}})).mockResolvedValueOnce(response(jpeg,{status:200,headers:{"content-type":"image/jpeg","content-length":"4"}}));
  expect(await downloadWhatsAppImage({mediaId:"media-1",accessToken:"secret",graphApiVersion:"v25.0"},fetcher)).toMatchObject({success:true,declaredMimeType:"image/jpeg",httpContentType:"image/jpeg",bytes:jpeg});
  expect(fetcher).toHaveBeenCalledTimes(2);expect(fetcher.mock.calls[0][1].headers.authorization).toBe("Bearer secret");expect(fetcher.mock.calls[1][1].headers.authorization).toBe("Bearer secret");
 });
 it("classifies permanent and transient provider failures",async()=>{
  expect(await downloadWhatsAppImage({mediaId:"x",accessToken:"s",graphApiVersion:"v25.0"},vi.fn().mockResolvedValue(response(null,{status:404})))).toMatchObject({success:false,retryable:false});
  expect(await downloadWhatsAppImage({mediaId:"x",accessToken:"s",graphApiVersion:"v25.0"},vi.fn().mockResolvedValue(response(null,{status:503})))).toMatchObject({success:false,retryable:true});
 });
});

describe("durable image ingestion runner",()=>{
 const claim={status:"claimed",command_id:id(1),conversation_id:id(2),source_message_id:id(3),provider_media_reference:"media",declared_mime_type:"image/jpeg",attempt_count:1};
 function database(final=true){const upload=vi.fn().mockResolvedValue({error:null});const rpc=vi.fn(async(name:string)=>({error:null,data:name==="claim_transport_media_ingestion"?claim:name==="reserve_transport_media_promotion"?{status:"reserved",staging_asset_id:id(4),project_media_id:id(5),staging_path:`assets/${id(4)}/original.jpg`,project_bucket:"project-media",project_path:`projects/${id(6)}/originals/${id(5)}/${id(5)}.jpg`}:name==="finalize_transport_media_promotion"?final:null}));return {db:{rpc,storage:{from:vi.fn(()=>({upload}))}},rpc,upload};}
 it("stores staging and one durable ready project item with source-owned reservation",async()=>{const {db,rpc,upload}=database();expect(await runWhatsAppImageIngestion({commandId:id(1)},{db,download:async()=>({success:true,bytes:jpeg,declaredMimeType:"image/jpeg",httpContentType:"image/jpeg"})})).toEqual({kind:"completed",projectMediaId:id(5)});expect(upload).toHaveBeenCalledTimes(2);expect(rpc.mock.calls.map(x=>x[0])).toEqual(["claim_transport_media_ingestion","reserve_transport_media_promotion","finalize_transport_media_promotion"]);});
 it("does not download completed work",async()=>{const download=vi.fn();const {db}=database();const completedDb={...db,rpc:vi.fn(async()=>({error:null,data:{...claim,status:"completed",provider_media_reference:null}}))};expect(await runWhatsAppImageIngestion({commandId:id(1)},{db:completedDb,download})).toEqual({kind:"duplicate"});expect(download).not.toHaveBeenCalled();});
 it("rejects byte signatures that contradict provider MIME",async()=>{const {db,rpc,upload}=database();expect(await runWhatsAppImageIngestion({commandId:id(1)},{db,download:async()=>({success:true,bytes:new Uint8Array([1,2,3]),declaredMimeType:"image/jpeg",httpContentType:"image/jpeg"})})).toEqual({kind:"failed"});expect(upload).not.toHaveBeenCalled();expect(rpc).toHaveBeenCalledWith("fail_transport_media_ingestion",expect.objectContaining({target_retryable:false}));});
 it("keeps transient failure recoverable but bounds the third attempt",async()=>{for(const attempt of [1,3]){const {db,rpc}=database();db.rpc=vi.fn(async(name:string)=>({error:null,data:name==="claim_transport_media_ingestion"?{...claim,attempt_count:attempt}:null}));expect(await runWhatsAppImageIngestion({commandId:id(1)},{db,download:async()=>({success:false,failureCode:"provider_download_transient",retryable:true})})).toEqual({kind:attempt===1?"deferred":"failed"});expect(db.rpc).toHaveBeenCalledWith("fail_transport_media_ingestion",expect.objectContaining({target_retryable:true}));}});
});
