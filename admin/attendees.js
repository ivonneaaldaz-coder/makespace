/* MAKE SPACE Studio Manager: optional Square linking and attendee reporting. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const safe = s => String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const controls=$("checkout")?.closest(".group");
  if(!controls)return;
  controls.insertAdjacentHTML("beforeend",'<div style="display:flex;gap:9px;align-items:center;flex-wrap:wrap;margin-top:10px"><button type="button" class="btn secondary small" id="verify-square">Link ticket</button><span id="square-verify-status" style="color:#806c71;font-size:11px">Link a ticket to track bookings automatically</span></div>');
  $("editor-view").insertAdjacentHTML("beforeend",'<button type="button" id="attendees-button" hidden style="display:none" tabindex="-1">Load attendees</button>');
  $("editor-view").insertAdjacentHTML("beforeend",'<section id="attendees-panel" class="surface" hidden style="padding:24px;margin:20px 0;min-width:0"></section>');
  let trackingUrl="";
  controls.insertAdjacentHTML("beforeend", '<div id="square-catalog-picker" hidden style="margin-top:12px"><label for="square-ticket" style="font-size:11px;font-weight:700;display:block;margin-bottom:6px">SELECT THE TICKET</label><select id="square-ticket" style="width:100%;padding:12px;background:#fff;border:1px solid #decfc8;border-radius:9px"><option value="">Select the ticket for this event</option></select><p style="font-size:11px;color:#806c71">Choose the matching Square ticket and price.</p></div>');
  const getEvent=()=>typeof editing==="string"?events.find(e=>e.id===editing):null;
  const reset=()=>{
    const e=getEvent();
    trackingUrl=e?.checkout||"";
    window.makeSpaceSquareVariation=e?.squareVariationId||"";
    $("square-verify-status").textContent=window.makeSpaceSquareVariation?"Ticket linked · bookings sync automatically":"Link a ticket to track bookings";
    $("verify-square").textContent=window.makeSpaceSquareVariation?"Change ticket":"Link ticket";
    $("square-catalog-picker").hidden=true;
    if(document.querySelector("#ms-tab-attendees[aria-selected=\"true\"]")===null)$("attendees-panel").hidden=true;
    $("attendees-button").hidden=true;
  };
  for(const id of ["rows","calgrid","add","cal-add"]){
    const el=$(id);
    el?.addEventListener("click",()=>setTimeout(reset,0));
  }
  document.querySelectorAll('.side-link').forEach(b=>b.addEventListener("click",()=>setTimeout(reset,0)));
  $("checkout").addEventListener("input",()=>{
    window.makeSpaceSquareVariation="";
    $("square-catalog-picker").hidden=true;
    $("square-verify-status").textContent="Payment link changed · link the ticket again";
  });
  $("verify-square").addEventListener("click",async()=>{
    if(!window.makeSpaceCloud?.connected)return;
    const url=$("checkout").value.trim();
    if(!url){$("square-verify-status").textContent="Add your Square payment link first";return;}
    const btn=$("verify-square");btn.disabled=true;btn.textContent="Loading tickets…";
    try{
      const match=await window.makeSpaceCloud.request("action","square:inspectLink",{url});
      trackingUrl=url;
      if(match.mode==="catalog"){
        window.makeSpaceSquareVariation="";
        const options=(match.tickets||[]).filter(t=>t.currency==="USD");
        $("square-ticket").innerHTML='<option value="">Select the ticket for this event</option>'+
          options.map(t=>'<option value="'+safe(t.variationId)+'">'+safe(t.name)+
            (t.priceCents===null?"":" · $"+(t.priceCents/100).toFixed(2))+'</option>').join("");
        $("square-catalog-picker").hidden=false;
        $("square-verify-status").textContent=options.length?
          "Choose your ticket below.":
          "No tickets found in Square. Check your account.";
      }else{
        $("square-catalog-picker").hidden=true;
        window.makeSpaceSquareVariation=match.variationId;
        $("square-verify-status").textContent="Ticket matched: "+match.itemName+". Click Save.";
      }
    }catch(err){
      window.makeSpaceSquareVariation="";
      $("square-verify-status").textContent=String(err.message||err).slice(0,150);
    }finally{btn.disabled=false;btn.textContent=window.makeSpaceSquareVariation?"Change ticket":"Link ticket";}
  });
  $("square-ticket").addEventListener("change",()=>{
    const variationId=$("square-ticket").value;
    window.makeSpaceSquareVariation=variationId;
    $("verify-square").textContent=variationId?"Change ticket":"Link ticket";
    $("square-verify-status").textContent=variationId?
      "Ticket selected · click Save to finish":
      "Select a ticket to track bookings.";
  });

  function downloadGuestCsv(e,d){
    const cell=value=>{
      let t=String(value??"").replace(/\r|\n/g," ");
      if(/^\s*[=+@-]/.test(t))t="'"+t;
      return '"'+t.replace(/"/g,'""')+'"';
    };
    const lines=[["Buyer","Email","Seats","Payment status","Confirmation","Paid USD","Date","Square payment ID"].map(cell).join(",")];
    for(const r of d.rows)lines.push([r.buyerName,r.buyerEmail,r.quantity,r.status,r.confirmationStatus,
      (r.amountCents/100).toFixed(2),new Date(r.createdAt).toISOString(),r.squarePaymentId].map(cell).join(","));
    const file=new Blob(["\uFEFF"+lines.join("\r\n")+"\r\n"],{type:"text/csv;charset=utf-8"});
    const link=document.createElement("a"),url=URL.createObjectURL(file);
    link.href=url;
    link.download="make-space-"+String(e.slug||e.title||"event").replace(/[^a-z0-9-]/gi,"-").slice(0,50)+"-guest-list.csv";
    document.body.appendChild(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }


  function csvDownload(event,report){
    const cell=value=>{
      let t=String(value??"").replace(/\r|\n/g," ");
      if(/^\s*[=+@-]/.test(t))t="'"+t;
      return '"'+t.replace(/"/g,'""')+'"';
    };
    const rows=[["Purchaser / booking contact","Email","Tickets purchased","Checked in","Paid USD","Payment status","Square payment ID"].map(cell).join(",")];
    for(const b of report.bookings){
      const count=b.seats.filter(seat=>seat.checkedInAt).length;
      rows.push([b.buyerName||"Not provided",b.buyerEmail,b.quantity,count,(b.amountCents/100).toFixed(2),b.status,b.squarePaymentId].map(cell).join(","));
    }
    const blob=new Blob(["\uFEFF"+rows.join("\r\n")+"\r\n"],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download="make-space-"+String(event.slug||"event").replace(/[^a-z0-9-]/gi,"-")+"-guest-list.csv";
    document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function renderBookingManager(event,report){
    const panel=$("attendees-panel");
    const active=report.bookings.filter(b=>b.status==="paid");
    const checked=active.reduce((n,b)=>n+b.seats.filter(seat=>seat.checkedInAt).length,0);
    const revenue=active.reduce((n,b)=>n+b.amountCents,0);
    const head='<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">'+
      '<h3 style="font:400 34px Italiana,Georgia,serif;margin:0">Guest list</h3>'+
      '<button type="button" class="btn secondary small" id="download-guest-csv">Export CSV ↓</button></div>'+
      '<p style="font-size:12px;margin:14px 0 24px">'+active.length+' bookings · '+report.paidSeats+' tickets · '+checked+' checked in · $'+(revenue/100).toFixed(2)+' gross</p>'+
      '<p style="font-size:12px;color:#765d63;margin:0 0 18px">Guests can check in under the purchaser’s name. You only need to count how many of their group have arrived.</p>';
    const body=active.length?active.map(b=>{
      const arrived=b.seats.filter(seat=>seat.checkedInAt).length;
      return '<div class="ms-booking-checkin" data-registration="'+safe(b.registrationId)+'" '+
        'style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:16px;align-items:center;padding:19px 0;border-bottom:1px solid #dfcbc5">'+
        '<div style="min-width:0"><strong style="font-size:15px">'+safe(b.buyerName||"Purchaser name unavailable")+'</strong>'+
        '<p style="font-size:12px;color:#765d63;margin:6px 0;overflow-wrap:anywhere">'+safe(b.buyerEmail||"No email provided")+'</p>'+
        '<p style="font-size:12px;margin:6px 0">'+b.quantity+' ticket'+(b.quantity===1?"":"s")+' purchased</p></div>'+
        '<div style="display:flex;align-items:center;gap:10px;flex-wrap:nowrap">'+
        '<button type="button" class="btn secondary small ms-check-minus" aria-label="Check out one guest" '+(arrived===0?"disabled":"")+'>−</button>'+
        '<strong style="font-size:14px;white-space:nowrap">'+arrived+' / '+b.quantity+'</strong>'+
        '<button type="button" class="btn secondary small ms-check-plus" aria-label="Check in one guest" '+(arrived>=b.quantity?"disabled":"")+'>+</button></div>'+
        '</div>';
    }).join(""):'<p>No paid bookings recorded for this event yet.</p>';
    panel.innerHTML=head+body+'<p style="font-size:11px;color:#806269;margin-top:18px">Square is the source of truth for payment and ticket quantity. Check-in counts can never exceed purchased tickets.</p>';
    $("download-guest-csv").addEventListener("click",()=>csvDownload(event,report));
    panel.querySelectorAll(".ms-booking-checkin").forEach(row=>{
      const booking=active.find(b=>b.registrationId===row.dataset.registration);
      if(!booking)return;
      for(const direction of ["plus","minus"]){
        row.querySelector(".ms-check-"+direction).addEventListener("click",async()=>{
          const seat=direction==="plus"?
            booking.seats.find(s=>!s.checkedInAt):
            [...booking.seats].reverse().find(s=>s.checkedInAt);
          if(!seat)return;
          row.querySelectorAll("button").forEach(btn=>btn.disabled=true);
          try{
            await window.makeSpaceCloud.request("mutation","guests:setCheckIn",{
              registrationId:booking.registrationId,seatNumber:seat.seatNumber,checkedIn:direction==="plus"
            });
            const fresh=await window.makeSpaceCloud.request("query","guests:listForEvent",{eventId:event.id});
            renderBookingManager(event,fresh);
          }catch(err){alert("Check-in could not be saved: "+String(err.message||err).slice(0,160));renderBookingManager(event,report)}
        });
      }
    });
  }
  $("attendees-button").addEventListener("click",async()=>{
    const e=getEvent();if(!e||!window.makeSpaceCloud?.connected)return;
    const panel=$("attendees-panel");panel.hidden=false;
    panel.textContent="Loading bookings and attendee seats…";
    guestView="attendees";
    try{
      const report=await window.makeSpaceCloud.request("query","guests:listForEvent",{eventId:e.id});
      latestGuestReport=report;
      renderBookingManager(e,report);
    }catch(err){panel.textContent="Could not load guest list: "+String(err.message||err).slice(0,200)}
  });
  reset();
})();