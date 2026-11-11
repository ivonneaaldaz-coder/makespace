/* MAKE SPACE Studio Manager: optional Square linking and attendee reporting. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const safe = s => String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const controls=$("checkout")?.closest(".group");
  if(!controls)return;
  controls.insertAdjacentHTML("beforeend",'<div style="display:flex;gap:9px;align-items:center;flex-wrap:wrap;margin-top:10px"><button type="button" class="btn secondary small" id="verify-square">Verify with Square ↗</button><span id="square-verify-status" style="color:#806c71;font-size:11px">Link verification required for automated attendee tracking</span></div>');
  $("duplicate").insertAdjacentHTML("beforebegin",'<button type="button" class="btn secondary small" id="attendees-button">Attendees</button>');
  $("editor-view").insertAdjacentHTML("beforeend",'<section id="attendees-panel" class="surface" hidden style="padding:24px;margin:20px 0;min-width:0"></section>');
  let trackingUrl="";
  const getEvent=()=>typeof editing==="string"?events.find(e=>e.id===editing):null;
  const reset=()=>{
    const e=getEvent();
    trackingUrl=e?.checkout||"";
    window.makeSpaceSquareVariation=e?.squareVariationId||"";
    $("square-verify-status").textContent=window.makeSpaceSquareVariation?"Square ticket mapping saved":"Not verified for automatic attendee tracking";
    $("attendees-panel").hidden=true;
    $("attendees-button").hidden=!e;
  };
  for(const id of ["rows","calgrid","add","cal-add"]){
    const el=$(id);
    el?.addEventListener("click",()=>setTimeout(reset,0));
  }
  document.querySelectorAll('.side-link').forEach(b=>b.addEventListener("click",()=>setTimeout(reset,0)));
  $("checkout").addEventListener("input",()=>{
    window.makeSpaceSquareVariation="";
    $("square-verify-status").textContent="Changed link: verify again before saving";
  });
  $("verify-square").addEventListener("click",async()=>{
    if(!window.makeSpaceCloud?.connected)return;
    const url=$("checkout").value.trim();
    if(!url){$("square-verify-status").textContent="Paste a Square link first";return;}
    const btn=$("verify-square");btn.disabled=true;btn.textContent="Checking…";
    try{
      const match=await window.makeSpaceCloud.request("action","square:inspectLink",{url});
      trackingUrl=url;
      window.makeSpaceSquareVariation=match.variationId;
      $("square-verify-status").textContent="Matched: "+match.itemName+". Save to Cloud to finish.";
    }catch(err){
      window.makeSpaceSquareVariation="";
      $("square-verify-status").textContent=String(err.message||err).slice(0,150);
    }finally{btn.disabled=false;btn.textContent="Verify with Square ↗";}
  });
  $("attendees-button").addEventListener("click",async()=>{
    const e=getEvent();if(!e||!window.makeSpaceCloud?.connected)return;
    const panel=$("attendees-panel");panel.hidden=false;
    panel.textContent="Loading attendees…";
    try{
      const d=await window.makeSpaceCloud.request("query","square:listAttendees",{eventId:e.id});
      panel.innerHTML='<h3 style="font:400 34px Italiana,Georgia,serif;margin:0 0 8px">Attendees</h3>'+
        '<p style="margin:10px 0 20px">'+d.seatsSold+' paid seats · '+d.seatsRemaining+' remaining · $'+(d.revenueCents/100).toFixed(2)+' recorded gross</p>'+
        (d.rows.length?'<div style="overflow-x:auto"><table style="width:100%;text-align:left"><thead><tr><th>Buyer</th><th>Seats</th><th>Status</th><th>Confirmation</th></tr></thead><tbody>'+
        d.rows.map(r=>'<tr><td>'+safe(r.buyerName||r.buyerEmail||"Buyer not supplied")+'</td><td>'+r.quantity+'</td><td>'+safe(r.status)+'</td><td>'+safe(r.confirmationStatus)+'</td></tr>').join("")+
        '</tbody></table></div>':'<p>No verified Square bookings have synced for this event yet.</p>')+
        '<p style="font-size:11px;color:#766065;margin-top:20px">Square remains the source of truth for ticket capacity and payment receipts. Counts update after webhook processing.</p>';
    }catch(err){panel.textContent="Could not load attendees: "+String(err.message||err).slice(0,200);}
  });
  reset();
})();