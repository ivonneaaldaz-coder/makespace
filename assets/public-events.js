/* Public MAKE SPACE event listings — only Convex published/sold_out records.
   No credentials are used or exposed here. */
(() => {
  "use strict";
  const endpoint = "https://deafening-clam-741.convex.cloud/api/query";
  const $ = id => document.getElementById(id);
  const escape = value => String(value ?? "").replace(/[&<>"']/g, x => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[x]));
  const allowedImage = value => {
    try {
      const u = new URL(value);
      return u.protocol === "https:" ? u.href : "";
    } catch { return ""; }
  };
  const allowedCheckout = value => {
    try {
      const u = new URL(value);
      if (u.protocol !== "https:" || u.username || u.password) return "";
      return ["square.link","checkout.square.site"].includes(u.hostname.toLowerCase()) ? u.href : "";
    } catch { return ""; }
  };
  const urlFor = event => "/experience/?slug=" + encodeURIComponent(event.slug);
  const dateText = iso => {
    const d = new Date(iso + "T12:00:00Z");
    return isNaN(d.getTime()) ? "Date to be announced" :
      d.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"});
  };
  const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  async function query(path,args={}) {
    const res = await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({path,args,format:"json"}),cache:"no-store"});
    const payload=await res.json();
    if(!res.ok || payload.status!=="success")throw Error("Unable to load events from Convex");
    return payload.value;
  }

  async function initHome() {
    const grid=$("live-event-grid");
    if(!grid)return;
    try {
      const events=(await query("events:listPublic")).filter(e=>e.date >= new Date().toLocaleDateString("en-CA",{timeZone:"America/Chicago"})).slice(0,4);
      if(!events.length) {
        grid.innerHTML='<div class="live-empty">Good things are in the making.<p>New creative gatherings will be announced here soon.</p><a href="#community">Get the next invitation ↗</a></div>';
        return;
      }
      grid.innerHTML=events.map(e=>{
        const image=allowedImage(e.imageUrl);
        return '<a class="event" href="'+urlFor(e)+'">'+
          (image?'<img src="'+escape(image)+'" alt="'+escape(e.title)+'" loading="lazy">':
          '<div class="live-artwork" aria-hidden="true">MAKE SPACE</div>')+
          '<span class="date">'+escape(dateText(e.date))+'</span>'+
          '<div class="event-info"><div class="eyebrow">'+escape(e.category)+
          (e.status==="sold_out"?" · SOLD OUT":"")+'</div><h3 class="display">'+escape(e.title)+
          '</h3><p>'+escape(e.description || "A creative gathering in good company.")+
          '</p><span class="arr">↗</span></div></a>';
      }).join("");
    } catch {
      grid.innerHTML='<p class="live-empty">Our upcoming gatherings are temporarily unavailable. Please check back soon.</p>';
    }
  }

  async function initCalendar() {
    if(!$("monthnav") || !$("days"))return;
    let events=[];
    const now=new Date();
    let year=Math.max(2027,now.getFullYear()),month=now.getFullYear()<2027?0:now.getMonth();
    const saved=new URLSearchParams(location.search);
    if(/^20\d{2}$/.test(saved.get("year")||""))year=Number(saved.get("year"));
    if(/^(?:[0-9]|1[01])$/.test(saved.get("month")||""))month=Number(saved.get("month"));
    function render() {
      $("monthtitle").textContent=monthNames[month]+" "+year;
      if($("jump-month")){
        $("jump-month").innerHTML=monthNames.map((name,i)=>'<option value="'+i+'" '+(i===month?'selected':'')+'>'+name+'</option>').join("");
      }
      if($("jump-year")){
        const years=[...new Set([2026,2027,2028,year,...events.map(e=>Number(e.date.slice(0,4))).filter(Number.isFinite)])].sort((a,b)=>a-b);
        $("jump-year").innerHTML=years.map(y=>'<option value="'+y+'" '+(y===year?'selected':'')+'>'+y+'</option>').join("");
      }
      $("monthnav").innerHTML=monthNames.map((n,i)=>
        '<button type="button" data-month="'+i+'" class="'+(i===month?"active":"")+
        '">'+n.slice(0,3).toUpperCase()+'</button>').join("");
      const first=new Date(Date.UTC(year,month,1)).getUTCDay();
      const last=new Date(Date.UTC(year,month+1,0)).getUTCDate();
      let html="";
      for(let i=0;i<first;i++)html+='<div class="day" aria-hidden="true"></div>';
      for(let d=1;d<=last;d++) {
        const iso=year+"-"+String(month+1).padStart(2,"0")+"-"+String(d).padStart(2,"0");
        const matches=events.filter(e=>e.date===iso);
        const e=matches[0],has=!!e;
        html+=(has?'<a href="'+urlFor(e)+'"':'<div')+
          ' class="day '+(has?"e":"")+'"><span>'+d+'</span>'+
          (has?'<i></i>'+matches.map(x=>'<small>'+escape(x.title)+'</small>').join(""):"")+
          (has?'</a>':'</div>');
      }
      $("days").innerHTML=html;
      const current=events.filter(e=>Number(e.date.slice(0,4))===year&&Number(e.date.slice(5,7))===month+1);
      $("list").innerHTML=current.length?current.map(e=>
        '<a href="'+urlFor(e)+'" class="event"><div class="date">'+escape(dateText(e.date))+
        " · "+escape(e.category)+"</div><h3>"+escape(e.title)+"</h3><span class=\"status\">"+
        (e.status==="sold_out"?"Sold out":"View experience ↗")+"</span></a>").join(""):
        '<p class="note">Nothing announced for this month yet. Check back for new gatherings.</p>';
      const u=new URL(location.href);u.searchParams.set("year",year);u.searchParams.set("month",month);
      history.replaceState(null,"",u);
    }
    $("jump-month")?.addEventListener("change",e=>{month=Number(e.target.value);render()});
    $("jump-year")?.addEventListener("change",e=>{year=Number(e.target.value);render()});
    $("monthnav").addEventListener("click",e=>{
      const b=e.target.closest("[data-month]");if(!b)return;month=Number(b.dataset.month);render();
    });
    window.move=(step)=>{
      month+=step;
      if(month<0){year--;month=11}
      if(month>11){year++;month=0}
      render();
    };
    try {
      events=await query("events:listPublic");
      events=events.filter(e=>/^20\d{2}-\d{2}-\d{2}$/.test(e.date));
      // First visit shows the next upcoming event; navigable across years.
      if(!saved.has("month")&&!saved.has("year")) {
        const today=now.toLocaleDateString("en-CA",{timeZone:"America/Chicago"});
        const next=events.find(e=>e.date>=today);
        if(next){year=Number(next.date.slice(0,4));month=Number(next.date.slice(5,7))-1;}
      }
      render();
    } catch {
      render();
      $("list").innerHTML='<p class="note" role="alert">The calendar could not load events. Please try again shortly.</p>';
    }
  }

  async function initDetail(){
    if(!$("experience-detail"))return;
    const slug=new URLSearchParams(location.search).get("slug") || "";
    if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)){location.replace("/calendar/");return;}
    try {
      const e=await query("events:getPublicBySlug",{slug});
      if(!e) { $("experience-detail").innerHTML='<h1 class="serif">Not available.</h1><p>This experience is not currently published.</p><a href="/calendar/">← Back to calendar</a>';return;}
      document.title=e.title+" | MAKE SPACE";
      const img=allowedImage(e.imageUrl);
      const t=e.time?new Date("2027-01-01T"+e.time+":00").toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}):"Time to be announced";
      $("experience-detail").innerHTML='<a href="/calendar/" class="backlink">← BACK TO CALENDAR</a>'+
        '<div class="detailgrid"><div><div class="kicker">'+escape(e.category)+' · MAKE SPACE</div>'+
        '<h1 class="serif">'+escape(e.title)+'</h1>'+
        (img?'<img class="experience-image" src="'+escape(img)+'" alt="'+escape(e.title)+'">':'')+
        '<p class="description">'+escape(e.description || "A creative experience in good company.")+'</p></div>'+
        '<aside class="details"><div class="kicker">THE DETAILS</div>'+
        '<p><b>WHEN</b><br>'+escape(dateText(e.date))+' · '+escape(t)+'</p>'+
        '<p><b>WHERE</b><br>'+escape(e.venue||"Venue to be announced")+'</p>'+
        '<p><b>DURATION</b><br>'+escape(e.duration)+' minutes</p>'+
        '<p><b>PRICE</b><br>'+ (e.priceCents===0?"Free":"$"+(e.priceCents/100).toFixed(2))+' per person</p>'+
        '<div id="availability-info" class="availability-info" role="status" aria-live="polite">Checking available spots…</div>'+
        (e.status === "sold_out" ?
          '<p class="booking">Sold out</p><small>This experience is currently full.</small>' :
          allowedCheckout(e.checkoutUrl) ?
          '<a class="booking square-checkout" href="'+escape(allowedCheckout(e.checkoutUrl))+
            '" target="_blank" rel="noopener noreferrer">Reserve your spot ↗</a>'+
          '<small>Updated from confirmed bookings. Final availability is determined at Square checkout.</small>' :
          '<p class="booking">Registration opening soon</p>'+
          '<small>Check back for the ticket link.</small>')+
        '</aside></div>';
      let checking=false;
      const updateAvailability=async()=>{
        if(checking||document.hidden)return;
        const info=$("availability-info");
        if(!info)return;
        checking=true;
        try{
          const a=await query("events:availability",{slug});
          if(!a)return;
          if(e.status==="sold_out"||a.status==="sold_out"||a.remaining===0){
            info.textContent="Sold out · "+a.sold+" of "+a.capacity+" booked";
            const action=document.querySelector("#experience-detail .square-checkout");
            if(action)action.replaceWith(Object.assign(document.createElement("p"),{
              className:"booking",textContent:"Sold out"
            }));
          }else{
            info.textContent=a.remaining+" of "+a.capacity+" spots left";
          }
        }catch{
          info.textContent="Availability confirmed at checkout";
        }finally{checking=false}
      };
      await updateAvailability();
      const refresh=window.setInterval(updateAvailability,20000);
      window.addEventListener("pagehide",()=>window.clearInterval(refresh),{once:true});
      document.addEventListener("visibilitychange",()=>{if(!document.hidden)void updateAvailability()});
    } catch {
      $("experience-detail").innerHTML='<p role="alert">Could not load this event. Please try again.</p><a href="/calendar/">Back to calendar</a>';
    }
  }
  initHome();initCalendar();initDetail();
})();
