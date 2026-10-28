'use strict';
const $ = (q) => document.querySelector(q);
const $$ = (q) => [...document.querySelectorAll(q)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const number = (n, fallback='—') => Number.isFinite(n) ? n : fallback;
const colors = ['#329780','#89b35b','#db9b55','#7779bd','#c16f91','#4f97bf','#c6a04c','#5aafac','#a88bc1','#bd7953','#7eaa8e','#c2a98a'];
const colorFor = (key) => colors[[...key].reduce((sum,c) => (sum * 31 + c.charCodeAt(0)) >>> 0, 0) % colors.length];
let state = {networks:[], connections:[], history:{}, adapters:[], warnings:[], timestamp:null};
let page = 'inspector', paused = false, fetching = false, token = '', minutes = 5, selected = new Set(), initialized = false, serviceOnline = false;
let planTool = 'ap', wallStart = null, drag = null, diagnostics = null;
let toastTimer;
const emptyProject = () => ({version:1, survey:{image:null, points:[], bssid:''}, plan:{image:null, aps:[], walls:[], meters:30, loss:3}});
let project = emptyProject(), planHistory = [], surveyHistory = [];
let surveyImage = null, planImage = null;

function toast(message) { $('#toast').textContent=message; $('#toast').classList.remove('hidden'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('#toast').classList.add('hidden'),4500); }
function saveProject() { try {localStorage.setItem('song.project.v1',JSON.stringify(project));} catch {toast('Bộ nhớ trình duyệt đã đầy. Hãy tải dự án JSON để lưu lại.');} }
function persistSelection() { try {localStorage.setItem('song.selection',JSON.stringify([...selected]));} catch {} }
function label(n) {return n.ssid || '(SSID ẩn)';}
function timeText(t) {return t ? new Date(t*1000).toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit',second:'2-digit'}) : '—';}
function quality(rssi) {return rssi>=-55 ? 'Rất tốt' : rssi>=-67 ? 'Tốt' : rssi>=-75 ? 'Trung bình' : 'Yếu';}
function filtered(ignoreSelection=false) {
 const text=$('#search').value.trim().toLowerCase(), band=$('#band-filter').value, security=$('#security-filter').value;
 const result=state.networks.filter(n=>(!text || `${n.ssid} ${n.bssid}`.toLowerCase().includes(text))&&(!band||n.band===band)&&(!security||n.security.includes(security))&& (ignoreSelection||!$('#only-selected').checked||selected.has(n.bssid)));
 const order=$('#sort').value;
 return result.sort((a,b)=>order==='name'?label(a).localeCompare(label(b)):order==='channel'?(a.channel??999)-(b.channel??999):b.rssi-a.rssi);
}
function updateNotice() {
 const messages=[];
 if(!serviceOnline) messages.push('Không kết nối được dịch vụ cục bộ. Mở START.cmd và tải lại trang.');
 else if(state.error) messages.push(state.error);
 if(serviceOnline && state.warnings?.length) messages.push(...state.warnings);
 if(paused) messages.push('Đã tạm dừng cập nhật màn hình. Dịch vụ vẫn thu dữ liệu; bấm Tiếp tục để cập nhật.');
 if(serviceOnline && state.timestamp && Date.now()/1000-state.timestamp>25) messages.push('Dữ liệu đã cũ hơn 25 giây. Kiểm tra dịch vụ quét trước khi lưu phép đo.');
 $('#notice').textContent=messages.join(' '); $('#notice').classList.toggle('hidden',!messages.length);
}
async function poll() {
 if(paused||fetching)return;
 fetching=true;
 try {
  const response=await fetch('/api/state',{signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw new Error('HTTP '+response.status);
  const next=await response.json(); token=next.token; state=next; serviceOnline=true;
  if(!initialized && state.networks.length) {
   if(!selected.size) state.networks.slice(0,4).forEach(n=>selected.add(n.bssid));
   initialized=true;
  }
  render();
 } catch {
  serviceOnline=false; $('#connection-pill').textContent='Dịch vụ chưa kết nối'; $('#live-tag').textContent='OFFLINE'; updateNotice();
 } finally {fetching=false;}
}
async function post(path) {
 const response=await fetch(path,{method:'POST',headers:{'X-Local-Token':token},signal:AbortSignal.timeout(20000)});
 const data=await response.json();if(!response.ok)throw new Error(data.error||'Yêu cầu thất bại.');return data;
}
function render() {
 updateNotice();
 const connection=state.connections?.[0];
 $('#connection-pill').textContent=connection?'● '+connection.ssid:state.error?'Chưa đọc được Wi-Fi':'● Dịch vụ cục bộ hoạt động';
 $('#stat-count').textContent=state.timestamp?state.networks.length:'—';
 $('#stat-ssids').textContent=new Set(state.networks.map(n=>n.ssid)).size+' tên mạng · '+state.adapters.length+' card Wi-Fi';
 const best=state.networks[0];
 $('#stat-rssi').textContent=best?best.rssi:'—'; $('#stat-best').textContent=best?label(best)+' · '+quality(best.rssi):'Chưa có dữ liệu';
 $('#stat-connection').textContent=connection?.ssid||'Chưa kết nối';
 $('#stat-connection').title=connection?.ssid||'';
 $('#stat-rate').textContent=connection?`Liên kết RX ${connection.rx_mbps} / TX ${connection.tx_mbps} Mbps`:'Chưa có thông tin kết nối';
 $('#stat-bands').textContent=[...new Set(state.networks.map(n=>n.band))].sort().join(' / ')||'—';
 $('#live-tag').textContent=paused?'PAUSED':state.error?'ERROR':'LIVE';
 $('#scan-time').textContent='Lần đọc: '+timeText(state.timestamp);
 renderNetworks(); renderSurveySelect();
 if(page==='inspector')drawSignal();
 if(page==='channels')renderChannels();
 if(page==='diagnostics')renderHealth();
 if(page==='survey')renderSurvey();
}
function renderNetworks() {
 const list=filtered();
 $('#network-count').textContent=list.length;
 $('#selection-count').textContent=selected.size+' điểm phát được chọn';
 $('#select-all').checked=list.length>0&&list.every(n=>selected.has(n.bssid));
 $('#select-all').indeterminate=list.some(n=>selected.has(n.bssid))&&!$('#select-all').checked;
 $('#network-rows').innerHTML=list.map(n=>{
  const bars=clamp(Math.round((n.rssi+100)/12),0,4);
  return `<tr class="${selected.has(n.bssid)?'selected':''}"><td><input type="checkbox" data-select="${esc(n.bssid)}" aria-label="Chọn ${esc(label(n))} ${esc(n.bssid)}" ${selected.has(n.bssid)?'checked':''}></td><td><div class="network-name"><span style="color:${colorFor(n.bssid)}">●</span>${esc(label(n))}${n.connected?'<span class="connected-tag">Đang kết nối</span>':''}</div><div class="network-mac">${esc(n.bssid)}</div></td><td><div class="signal-cell"><span class="signal-bars">${[0,1,2,3].map((v)=>`<i class="${v<bars?'on':''}" style="height:${5+v*3}px"></i>`).join('')}</span><b>${n.rssi}</b><span class="rssi-unit">dBm</span></div></td><td><span class="band-badge">${esc(n.band)} GHz</span></td><td>${number(n.channel)} <span class="rssi-unit">/ ${esc(n.width??'—')} MHz</span></td><td>${esc(n.security)}</td><td>${esc(n.phy.replace('802.11',''))}</td><td><button class="detail-button" data-detail="${esc(n.bssid)}" aria-label="Chi tiết ${esc(n.bssid)}">↗</button></td></tr>`;
 }).join('');
 $('#network-empty').classList.toggle('hidden',list.length>0);
}
function setupCanvas(id) {
 const canvas=$(id), box=canvas.getBoundingClientRect(), ratio=window.devicePixelRatio||1;
 if(box.width<1||box.height<1)return null;
 canvas.width=Math.round(box.width*ratio);canvas.height=Math.round(box.height*ratio);
 const ctx=canvas.getContext('2d');ctx.scale(ratio,ratio);ctx.font='10px Segoe UI';
 return {canvas,ctx,w:box.width,h:box.height};
}
function chartGrid(ctx,w,h,left=43,bottom=28) {
 const top=14,right=12,cw=w-left-right,ch=h-top-bottom;
 ctx.strokeStyle='#edf1e9';ctx.lineWidth=1;ctx.fillStyle='#9aa792';ctx.font='10px Segoe UI';
 for(let r=-30;r>=-100;r-=10){const y=top+(-30-r)/70*ch;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(w-right,y);ctx.stroke();ctx.fillText(r+'',8,y+3);}
 ctx.fillStyle='#b0bca8';ctx.fillText('dBm',8,9);
 return {left,top,right,bottom,cw,ch,y:r=>top+(-30-clamp(r,-100,-30))/70*ch};
}
function drawSignal() {
 const setup=setupCanvas('#signal-chart');if(!setup)return;
 const {ctx,w,h}=setup, g=chartGrid(ctx,w,h), now=paused?(state.timestamp||Date.now()/1000):Date.now()/1000, start=now-minutes*60;
 for(let i=0;i<=5;i++){const t=start+(now-start)*i/5;const x=g.left+g.cw*i/5;ctx.fillStyle='#9aa792';ctx.textAlign=i===5?'right':'left';ctx.fillText(new Date(t*1000).toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'}),x,h-7);}
 ctx.textAlign='left';
 const chosen=[...selected].filter(key=>state.history[key]?.length);
 $('#chart-empty').classList.toggle('hidden',chosen.length>0);
 chosen.forEach(key=>{
  const data=(state.history[key]||[]).filter(p=>p.t>=start&&p.t<=now+1);ctx.strokeStyle=colorFor(key);ctx.fillStyle=colorFor(key);ctx.lineWidth=1.9;ctx.beginPath();let prev=null;
  data.forEach(p=>{const x=g.left+clamp((p.t-start)/(now-start),0,1)*g.cw,y=g.y(p.rssi);if(!prev||p.t-prev.t>18)ctx.moveTo(x,y);else ctx.lineTo(x,y);prev=p;});ctx.stroke();
  if(data.length){const last=data[data.length-1];ctx.beginPath();ctx.arc(g.left+clamp((last.t-start)/(now-start),0,1)*g.cw,g.y(last.rssi),3,0,Math.PI*2);ctx.fill();}
 });
 $('#chart-legend').innerHTML=chosen.slice(0,8).map(key=>{const n=state.networks.find(n=>n.bssid===key);return `<div class="legend-item" title="${esc(key)}"><i style="background:${colorFor(key)}"></i><span>${esc(n?label(n):key)} · ${esc(key.slice(-5))}</span></div>`;}).join('')+(chosen.length>8?`<span>+${chosen.length-8} điểm phát</span>`:'');
}
function bandwidth(n) {return typeof n.width==='number'?n.width:n.width==='80+80'?80:20;}
function renderChannels() {
 const band=$('#channel-band').value, list=state.networks.filter(n=>n.band===band&&n.channel!==null);
 const setup=setupCanvas('#channel-chart'); if(!setup)return;
 const {ctx,w,h}=setup,g=chartGrid(ctx,w,h),lo=band==='2.4'?0:band==='5'?25:0,hi=band==='2.4'?15:band==='5'?180:240;
 const x=c=>g.left+(c-lo)/(hi-lo)*g.cw;
 for(let c=band==='2.4'?1:band==='5'?36:1;c<=hi;c+=band==='2.4'?1:band==='5'?16:32){ctx.fillStyle='#92a18b';ctx.fillText(c,x(c)-4,h-7);}
 list.forEach(n=>{
  const spread=bandwidth(n)/10;
  ctx.beginPath();ctx.moveTo(x(n.channel-spread),g.y(-100));ctx.bezierCurveTo(x(n.channel-spread*.65),g.y(n.rssi),x(n.channel-spread*.3),g.y(n.rssi),x(n.channel),g.y(n.rssi));ctx.bezierCurveTo(x(n.channel+spread*.3),g.y(n.rssi),x(n.channel+spread*.65),g.y(n.rssi),x(n.channel+spread),g.y(-100));
  ctx.fillStyle=colorFor(n.bssid)+'18';ctx.strokeStyle=colorFor(n.bssid);ctx.lineWidth=1.5;ctx.setLineDash(n.width?[]:[4,3]);ctx.fill();ctx.stroke();ctx.setLineDash([]);
 });
 if(!list.length){ctx.fillStyle='#8a9d83';ctx.textAlign='center';ctx.fillText('Chưa phát hiện mạng ở băng tần này',w/2,h/2);ctx.textAlign='left';}
 const candidates=band==='2.4'?[1,6,11]:band==='5'?[36,44,149,157,165]:[5,37,69,101,133,165,197,229];
 const scored=candidates.map(channel=>({channel,score:list.reduce((sum,n)=>{const delta=Math.abs(channel-n.channel)*5, overlap=Math.max(0,1-delta/(10+bandwidth(n)/2));return sum+overlap*10**((n.rssi+90)/20);},0)})).sort((a,b)=>a.score-b.score);
 const max=Math.max(1,...scored.map(s=>s.score));
 $('#channel-suggestions').innerHTML=list.length?`<div class="recommendation"><strong>Tham khảo kênh ${scored[0].channel}</strong><p>Điểm chồng lấn thấp nhất trong các kênh đang so sánh. Càng thấp càng ít chồng lấn ước tính.</p></div>`+scored.map(s=>`<div class="channel-score"><strong>Kênh ${s.channel}</strong><div class="score-track"><div style="width:${Math.max(2,s.score/max*100)}%"></div></div><span>${s.score.toFixed(1)}</span></div>`).join(''):`<div class="empty-state"><h3>Chưa có dữ liệu ${band} GHz</h3><p>Không thể kết luận kênh trống hoặc tốt nhất khi chưa có dữ liệu quét.</p></div>`;
}
function showDetail(key) {
 const n=state.networks.find(n=>n.bssid===key);if(!n)return;
 const points=state.history[key]||[], vals=points.map(p=>p.rssi);
 const fields=[['BSSID',n.bssid],['Tín hiệu',`${n.rssi} dBm · ${quality(n.rssi)}`],['Băng tần',n.band+' GHz'],['Kênh',n.channel??'Chưa rõ'],['Độ rộng kênh',n.width?n.width+' MHz':'Driver / beacon chưa cung cấp'],['Bảo mật',n.security],['Chuẩn PHY',n.phy],['Tần số trung tâm',n.frequency+' MHz'],['Thấp / cao trong phiên',vals.length?`${Math.min(...vals)} / ${Math.max(...vals)} dBm`:'Chưa có'],['Noise / SNR','Không có dữ liệu từ API này'],['Card mạng',n.adapter],['Nguồn',n.source]];
 $('#detail-content').innerHTML=`<div class="detail-title">${esc(label(n))}</div><p>${n.connected?'Đang kết nối':'Điểm phát được phát hiện'} · ${timeText(n.seen_at)}</p><div class="detail-grid">${fields.map(([k,v])=>`<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div><p class="muted">BSSID không cho biết danh tính người dùng. Chuẩn và độ rộng kênh phụ thuộc dữ liệu driver/beacon cung cấp.</p>`;
 $('#detail-dialog').showModal();
}
const pages={
 inspector:['Khám phá Wi-Fi','TỔNG QUAN MẠNG KHÔNG DÂY','Mọi kết nối, trong tầm mắt.','Khám phá Wi-Fi xung quanh và hiểu chất lượng tín hiệu của bạn.'],
 channels:['Phân tích kênh','TÌM KHÔNG GIAN CHO KẾT NỐI','Đọc kênh. Hiểu chồng lấn.','So sánh các điểm phát và tìm kênh ít chồng lấn hơn.'],
 survey:['Khảo sát mặt bằng','ĐO TẠI NƠI BẠN ĐỨNG','Biến phép đo thành bản đồ.','Lưu tín hiệu theo vị trí thực để tìm vùng phủ sóng còn yếu.'],
 planning:['Lập kế hoạch','THIẾT KẾ TRƯỚC KHI LẮP ĐẶT','Một kế hoạch cho từng góc phòng.','Mô phỏng vị trí điểm phát, khoảng cách và vật cản trên mặt bằng.'],
 diagnostics:['Chẩn đoán','TỪ DỮ LIỆU ĐẾN HÀNH ĐỘNG','Hiểu điều gì đang xảy ra.','Tách tín hiệu Wi-Fi, tốc độ liên kết và độ trễ đường ra Internet.'],
 reports:['Báo cáo & dữ liệu','LƯU LẠI NHỮNG GÌ BẠN ĐO','Dữ liệu rõ ràng. Dễ chia sẻ.','Xuất báo cáo, lưu lịch sử và tiếp tục dự án vào lần sau.']
};
function navigate(next) {
 if(!pages[next])next='inspector';page=next;location.hash=next;window.scrollTo(0,0);
 $$('.page').forEach(el=>el.classList.toggle('hidden',el.id!=='page-'+next));
 $$('.nav-item').forEach(el=>el.classList.toggle('active',el.dataset.page===next));
 const [name,eye,title,description]=pages[next];$('#breadcrumb').textContent=name;$('#eyebrow').textContent=eye;$('#page-title').textContent=title;$('#page-description').textContent=description;
 if(next==='channels')renderChannels();if(next==='inspector')drawSignal();if(next==='survey'){renderSurveySelect();renderSurvey();}if(next==='planning')renderPlan();if(next==='diagnostics')renderHealth();
}
function healthItems() {
 const c=state.connections[0];if(!c)return [{title:'Chưa có kết nối Wi-Fi',text:'Kết nối Wi-Fi bằng Windows để xem đánh giá. Các mạng xung quanh vẫn có thể quét khi chưa kết nối.',warn:true}];
 const n=state.networks.find(n=>n.bssid===c.bssid);
 const items=[{title:`${c.ssid} · ${c.security}`,text:`BSSID ${c.bssid}. ${c.adapter}`,warn:c.security==='Open'},
 {title:`Liên kết RX ${c.rx_mbps} / TX ${c.tx_mbps} Mbps`,text:'Tốc độ thương lượng giữa card Wi-Fi và điểm phát. Băng thông Internet thực tế có thể thấp hơn.',warn:false}];
 if(n){items.push({title:`Tín hiệu ${n.rssi} dBm · ${quality(n.rssi)}`,text:n.rssi<-70?'Thử đến gần điểm phát hoặc giảm vật cản, rồi đo lại tại cùng vị trí.':'Mức tín hiệu hiện tại thuận lợi; cần xét thêm tải mạng và đường Internet.',warn:n.rssi<-70});
 const same=state.networks.filter(v=>v.bssid!==n.bssid&&v.band===n.band&&v.channel===n.channel);
 items.push({title:`${same.length} điểm phát khác cùng kênh ${n.channel}`,text:'Đếm từ mạng phát hiện, không phải phần trăm sử dụng kênh. Xem Phân tích kênh để so sánh.',warn:same.length>3});
 const history=state.history[n.bssid]||[];if(history.length>=3){const recent=history.slice(-20).map(v=>v.rssi), delta=Math.max(...recent)-Math.min(...recent);items.push({title:`Dao động gần đây: ${delta} dB`,text:`Từ ${recent.length} lần đọc gần nhất; di chuyển máy cũng làm tín hiệu thay đổi.`,warn:delta>15});}}
 else items.push({title:'Điểm phát đang kết nối chưa có trong lượt quét',text:'Dữ liệu kết nối và bộ nhớ đệm quét được Windows cập nhật riêng. Chờ lượt quét tiếp theo.',warn:true});
 return items;
}
function renderHealth() {
 $('#health-results').innerHTML=healthItems().map(item=>`<div class="health-item ${item.warn?'warn':''}"><span class="health-icon">${item.warn?'!':'✓'}</span><div><strong>${esc(item.title)}</strong><p>${esc(item.text)}</p></div></div>`).join('');
 const capabilities=[['Card mạng',state.adapters.join(', ')||'Chưa đọc được'],['SSID / BSSID / RSSI / kênh','Đọc từ Windows Native Wi-Fi API'],['Băng tần 6 GHz','Chỉ có dữ liệu nếu phần cứng, driver và vùng hỗ trợ'],['Độ rộng kênh','Đọc IE HT/VHT khi có; HE/EHT chưa giải mã đầy đủ'],['Noise / SNR / phổ RF','Không hỗ trợ bởi bộ đọc hiện tại; cần phần cứng/API khác'],['Khảo sát','RSSI theo điểm thực; bản đồ nhiệt nội suy'],['Lập kế hoạch','Mô hình log-distance và suy hao tường; không phải dự đoán đã hiệu chuẩn'],['Thiết bị khách / bắt gói','Chưa hỗ trợ; cần quyền quản trị router hoặc card monitor mode'],['Tốc độ Internet','Chưa có bài đo throughput; chỉ hiển thị link rate và kiểm tra TCP'],['Độ mới của số đo','Chờ Windows hoàn tất quét, tối đa 6 giây; nghỉ 5 giây giữa các lượt']];
 $('#capability-list').innerHTML=capabilities.map(([k,v])=>`<div class="capability-row"><b>${esc(k)}</b><span>${esc(v)}</span></div>`).join('');
}
function renderSurveySelect() {
 const current=project.survey.bssid||$('#survey-network').value;
 const available=new Map(state.networks.map(n=>[n.bssid,n]));
 project.survey.points.forEach(p=>{if(!available.has(p.bssid))available.set(p.bssid,{bssid:p.bssid,ssid:p.ssid,saved:true});});
 const options=[...available.values()].sort((a,b)=>label(a).localeCompare(label(b)));
 const optionHTML='<option value="">Chọn điểm phát để đo</option>'+options.map(n=>`<option value="${esc(n.bssid)}">${esc(label(n))} · ${esc(n.bssid.slice(-8))}${n.saved?' (đã lưu)':''}</option>`).join('');
 if($('#survey-network').innerHTML!==optionHTML)$('#survey-network').innerHTML=optionHTML;
 $('#survey-network').value=current;
}
function mapBase(canvas,img) {
 const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
 ctx.clearRect(0,0,w,h);ctx.fillStyle='#f7f9f4';ctx.fillRect(0,0,w,h);
 if(img)ctx.drawImage(img,0,0,w,h);
 else {ctx.strokeStyle='#e6ecdf';ctx.lineWidth=1;for(let x=0;x<w;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}for(let y=0;y<h;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}}
 return ctx;
}
function heatColor(rssi,alpha=.55) {
 const t=clamp((rssi+90)/50,0,1);return `hsla(${12+t*145},55%,52%,${alpha})`;
}
function idw(points,x,y) {
 let sum=0,weight=0,nearest=1e10;
 for(const p of points){const d=Math.hypot(x-p.x,(y-p.y)*.6);nearest=Math.min(nearest,d);if(d<.008)return {value:p.rssi,near:d};const w=1/(d*d);sum+=p.rssi*w;weight+=w;}
 return {value:sum/weight,near:nearest};
}
function renderSurvey() {
 const canvas=$('#survey-canvas'),ctx=mapBase(canvas,surveyImage),w=canvas.width,h=canvas.height,key=project.survey.bssid;
 const points=project.survey.points.filter(p=>p.bssid===key);
 if($('#survey-heat').checked&&points.length>=3){for(let y=0;y<h;y+=12)for(let x=0;x<w;x+=12){const v=idw(points,x/w,y/h);if(v.near<.2){ctx.fillStyle=heatColor(v.value,.5*clamp((.2-v.near)/.06,0,1));ctx.fillRect(x,y,12,12);}}}
 points.forEach((p,i)=>{const x=p.x*w,y=p.y*h;ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(x,y,14,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#47715b';ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='#244c38';ctx.font='bold 12px Segoe UI';ctx.textAlign='center';ctx.fillText(i+1,x,y+4);ctx.font='12px Segoe UI';ctx.fillStyle='#173f29';ctx.fillText(p.rssi+' dBm',x,Math.min(h-8,y+30));});
 ctx.textAlign='left';
 if(!points.length){ctx.fillStyle='#7e9575';ctx.font='18px Segoe UI';ctx.textAlign='center';ctx.fillText('Chọn BSSID · Đi đến vị trí · Bấm để lưu phép đo',w/2,h/2);ctx.textAlign='left';}
 $('#survey-summary').textContent=`${points.length} điểm cho BSSID này · ${project.survey.points.length} điểm toàn dự án`;
 $('#survey-points').innerHTML=points.length?points.map((p,i)=>`<div class="point-row"><div><b>Điểm ${i+1} · ${p.rssi} dBm</b><small>${timeText(p.timestamp)} · ${p.band} GHz · Kênh ${p.channel??'—'}</small></div><button data-remove-point="${esc(p.id)}" aria-label="Xóa điểm ${i+1}">×</button></div>`).join(''):'<p class="muted">Chọn điểm phát rồi bấm vị trí trên mặt bằng. Cần ít nhất 3 điểm để nội suy bản đồ nhiệt.</p>';
}
function mapPoint(event,canvas) {const box=canvas.getBoundingClientRect();return {x:clamp((event.clientX-box.left)/box.width,0,1),y:clamp((event.clientY-box.top)/box.height,0,1)};}
function addSurveyPoint(event) {
 if(!serviceOnline||paused||state.error||!state.timestamp||Date.now()/1000-state.timestamp>20){toast('Cần dữ liệu Wi-Fi mới. Tiếp tục cập nhật hoặc kiểm tra dịch vụ trước khi đo.');return;}
 const n=state.networks.find(n=>n.bssid===project.survey.bssid);if(!n){toast('Chọn một điểm phát hiện đang được phát hiện trước khi đo.');return;}
 surveyHistory.push(structuredClone(project.survey.points));if(surveyHistory.length>30)surveyHistory.shift();
 project.survey.points.push({id:crypto.randomUUID(),...mapPoint(event,$('#survey-canvas')),bssid:n.bssid,ssid:n.ssid,rssi:n.rssi,band:n.band,channel:n.channel,timestamp:state.timestamp});
 saveProject();renderSurvey();toast(`Đã lưu ${n.rssi} dBm tại vị trí đã chọn.`);
}
function segmentsCross(a,b,c,d) {
 const cross=(p,q,r)=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);
 return cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0;
}
function predictedRssi(ap,x,y) {
 const meters=project.plan.meters,d=Math.max(1,Math.hypot((x-ap.x)*meters,(y-ap.y)*meters*.6)),freq=ap.band==='2.4'?2.437:ap.band==='5'?5.18:6.1;
 const fspl1m=20*Math.log10(freq)+32.44;
 let rssi=ap.power-fspl1m-10*project.plan.loss*Math.log10(d);
 for(const wall of project.plan.walls)if(segmentsCross(ap,{x,y},wall.a,wall.b))rssi-=wall.loss;
 return rssi;
}
function renderPlan() {
 const canvas=$('#plan-canvas'),ctx=mapBase(canvas,planImage),w=canvas.width,h=canvas.height;
 let good=0,total=0;
 if(project.plan.aps.length){for(let y=0;y<h;y+=12)for(let x=0;x<w;x+=12){const rssi=Math.max(...project.plan.aps.map(ap=>predictedRssi(ap,x/w,y/h)));ctx.fillStyle=heatColor(rssi,.45);ctx.fillRect(x,y,12,12);total++;if(rssi>=-67)good++;}}
 for(const wall of project.plan.walls){ctx.strokeStyle='#3d4f4a';ctx.lineWidth=7;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(wall.a.x*w,wall.a.y*h);ctx.lineTo(wall.b.x*w,wall.b.y*h);ctx.stroke();}
 if(wallStart){ctx.fillStyle='#e29252';ctx.beginPath();ctx.arc(wallStart.x*w,wallStart.y*h,9,0,Math.PI*2);ctx.fill();}
 project.plan.aps.forEach((ap,i)=>{const x=ap.x*w,y=ap.y*h;ctx.fillStyle='#173e35';ctx.strokeStyle='#d4ffaf';ctx.lineWidth=3;ctx.beginPath();ctx.arc(x,y,18,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#e9ffd6';ctx.font='bold 13px Segoe UI';ctx.textAlign='center';ctx.fillText(i+1,x,y+5);ctx.font='12px Segoe UI';ctx.fillStyle='#203e2a';ctx.fillText(`AP ${i+1} · ${ap.band} GHz`,x,Math.min(h-8,y+36));});ctx.textAlign='left';
 if(!project.plan.aps.length){ctx.fillStyle='#799170';ctx.font='20px Segoe UI';ctx.textAlign='center';ctx.fillText('Bấm để đặt điểm phát đầu tiên',w/2,h/2);ctx.textAlign='left';}
 $('#plan-summary').textContent=`${project.plan.aps.length} điểm phát · ${project.plan.walls.length} tường. ${total?`Ước tính ${Math.round(good/total*100)}% diện tích hình chữ nhật đạt ≥ −67 dBm.`:'Chọn công cụ để thêm AP hoặc vẽ tường.'} ${wallStart?'Bấm điểm cuối của tường.':''}`;
 $('#plan-ap-list').innerHTML=project.plan.aps.map((ap,i)=>`<div class="ap-entry"><span>AP ${i+1} · ${ap.band} GHz · ${ap.power} dBm</span><button data-remove-ap="${esc(ap.id)}" aria-label="Xóa AP ${i+1}">×</button></div>`).join('');
}
function snapshotPlan() {planHistory.push(structuredClone(project.plan));if(planHistory.length>30)planHistory.shift();}
function nearbyAP(p){return project.plan.aps.find(ap=>Math.hypot(ap.x-p.x,(ap.y-p.y)*.6)<.025);}
function distanceToSegment(p,a,b){const dx=b.x-a.x,dy=(b.y-a.y)*.6,t=clamp(((p.x-a.x)*dx+(p.y-a.y)*.6*dy)/(dx*dx+dy*dy||1),0,1);return Math.hypot(p.x-a.x-t*dx,(p.y-a.y)*.6-t*dy);}
function planDown(event) {
 const p=mapPoint(event,$('#plan-canvas')),ap=nearbyAP(p);
 if(planTool==='erase'){
  if(ap){snapshotPlan();project.plan.aps=project.plan.aps.filter(v=>v!==ap);}
  else{const wall=project.plan.walls.find(v=>distanceToSegment(p,v.a,v.b)<.02);if(!wall)return;snapshotPlan();project.plan.walls=project.plan.walls.filter(v=>v!==wall);}
  saveProject();renderPlan();return;
 }
 if(planTool==='wall'){
  if(!wallStart){wallStart=p;renderPlan();return;}
  if(Math.hypot(p.x-wallStart.x,p.y-wallStart.y)<.01){toast('Điểm cuối phải khác điểm bắt đầu.');return;}
  snapshotPlan();project.plan.walls.push({id:crypto.randomUUID(),a:wallStart,b:p,loss:clamp(Number($('#plan-wall-loss').value)||0,0,40)});wallStart=null;saveProject();renderPlan();return;
 }
 snapshotPlan();
 if(ap){drag=ap;$('#plan-canvas').setPointerCapture(event.pointerId);}
 else project.plan.aps.push({id:crypto.randomUUID(),...p,band:$('#plan-band').value,power:clamp(Number($('#plan-power').value)||0,0,30)});
 saveProject();renderPlan();
}
function restoreImages() {
 function load(data,kind){if(!data){if(kind==='survey')surveyImage=null;else planImage=null;return;}const img=new Image();img.onload=()=>{if((kind==='survey'?project.survey.image:project.plan.image)!==data)return;if(kind==='survey'){surveyImage=img;if(page==='survey')renderSurvey();}else{planImage=img;if(page==='planning')renderPlan();}};img.src=data;}
 surveyImage=null;planImage=null;load(project.survey.image,'survey');load(project.plan.image,'plan');
}
async function uploadImage(file,kind) {
 if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>12*1024*1024){toast('Chọn ảnh PNG, JPEG hoặc WebP nhỏ hơn 12 MB.');return;}
 try{const bitmap=await createImageBitmap(file);const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=720;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,1200,720);const scale=Math.min(1200/bitmap.width,720/bitmap.height);ctx.drawImage(bitmap,(1200-bitmap.width*scale)/2,(720-bitmap.height*scale)/2,bitmap.width*scale,bitmap.height*scale);bitmap.close();
  const section=kind==='survey'?project.survey:project.plan;
  if((kind==='survey'?section.points.length:section.aps.length||section.walls.length)&&!confirm('Thay mặt bằng sẽ xóa các vị trí đã đánh dấu trên mặt bằng này. Tiếp tục?'))return;
  section.image=canvas.toDataURL('image/jpeg',.85);if(kind==='survey'){section.points=[];surveyHistory=[];}else{section.aps=[];section.walls=[];planHistory=[];wallStart=null;}
  saveProject();restoreImages();toast('Đã lưu mặt bằng. Khi lập kế hoạch, nhập chiều rộng toàn khung ảnh, kể cả viền trắng nếu có.');
 }catch{toast('Không đọc được ảnh này.');}
}
function validateProject(value) {
 if(!value||value.version!==1||!value.survey||!value.plan)throw new Error('Tệp không đúng định dạng dự án Sóng v1.');
 const coord=p=>p&&Number.isFinite(p.x)&&p.x>=0&&p.x<=1&&Number.isFinite(p.y)&&p.y>=0&&p.y<=1;
 const str=(s,max=150)=>typeof s==='string'&&s.length<=max;
 const image=s=>s===null||(typeof s==='string'&&s.length<6000000&&/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(s));
 if(!image(value.survey.image)||!image(value.plan.image))throw new Error('Ảnh mặt bằng không hợp lệ.');
 if(!Array.isArray(value.survey.points)||value.survey.points.length>5000||!str(value.survey.bssid,40))throw new Error('Dữ liệu khảo sát không hợp lệ.');
 if(!value.survey.points.every(p=>coord(p)&&str(p.id)&&str(p.ssid)&&str(p.bssid,40)&&Number.isFinite(p.rssi)&&p.rssi>=-120&&p.rssi<=0&&Number.isFinite(p.timestamp)&&['2.4','5','6','Other'].includes(p.band)&&(p.channel===null||Number.isFinite(p.channel))))throw new Error('Điểm đo không hợp lệ.');
 const p=value.plan;
 if(!Number.isFinite(p.meters)||p.meters<2||p.meters>1000||!Number.isFinite(p.loss)||p.loss<1.5||p.loss>6)throw new Error('Tỉ lệ hoặc suy hao không hợp lệ.');
 if(!Array.isArray(p.aps)||p.aps.length>200||!p.aps.every(a=>coord(a)&&str(a.id)&&['2.4','5','6'].includes(a.band)&&Number.isFinite(a.power)&&a.power>=0&&a.power<=30))throw new Error('Điểm phát không hợp lệ.');
 if(!Array.isArray(p.walls)||p.walls.length>500||!p.walls.every(v=>coord(v.a)&&coord(v.b)&&str(v.id)&&Number.isFinite(v.loss)&&v.loss>=0&&v.loss<=40))throw new Error('Tường không hợp lệ.');
 return {version:1,survey:{image:value.survey.image,bssid:value.survey.bssid,points:value.survey.points},plan:{image:p.image,meters:p.meters,loss:p.loss,aps:p.aps,walls:p.walls}};
}
function download(name,content,type) {const a=document.createElement('a'),url=URL.createObjectURL(new Blob([content],{type}));a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);}
function csvCell(value) {let text=String(value??'');if(/^[=+@\t\r]/.test(text)||(/^\-/.test(text)&&!/^\-\d+(\.\d+)?$/.test(text)))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';}
function exportCSV() {
 const headers=['SSID','BSSID','RSSI_dBm','Band_GHz','Channel','Width_MHz','Security','PHY','Frequency_MHz','Connected','Observed_at','Source'];
 const rows=filtered().map(n=>[n.ssid,n.bssid,n.rssi,n.band,n.channel,n.width,n.security,n.phy,n.frequency,n.connected,new Date(n.seen_at*1000).toISOString(),n.source]);
 download('song-wifi-'+new Date().toISOString().slice(0,10)+'.csv','\ufeff'+[headers,...rows].map(row=>row.map(csvCell).join(',')).join('\r\n'),'text/csv;charset=utf-8');toast(`Đã xuất ${rows.length} điểm phát theo bộ lọc.`);
}
// Event handlers use delegated listeners so live scans never duplicate handlers.
$$('.nav-item').forEach(button=>button.addEventListener('click',()=>navigate(button.dataset.page)));
window.addEventListener('hashchange',()=>{if(location.hash.slice(1)!==page)navigate(location.hash.slice(1));});
$('#network-rows').addEventListener('change',e=>{const key=e.target.dataset.select;if(!key)return;e.target.checked?selected.add(key):selected.delete(key);persistSelection();renderNetworks();drawSignal();});
$('#network-rows').addEventListener('click',e=>{const button=e.target.closest('[data-detail]');if(button)showDetail(button.dataset.detail);});
['search','band-filter','security-filter','sort','only-selected'].forEach(id=>$('#'+id).addEventListener(id==='search'?'input':'change',()=>{renderNetworks();$('#fpt-filter').classList.toggle('active',$('#search').value==='FPT University');}));
$('#fpt-filter').addEventListener('click',()=>{const active=$('#search').value==='FPT University';$('#search').value=active?'':'FPT University';$('#band-filter').value='';$('#security-filter').value='';$('#only-selected').checked=false;if(!active){selected=new Set(state.networks.filter(n=>n.ssid.toLowerCase().includes('fpt university')).map(n=>n.bssid));}$('#fpt-filter').classList.toggle('active',!active);persistSelection();renderNetworks();drawSignal();});
$('#select-visible').addEventListener('click',()=>{filtered().forEach(n=>selected.add(n.bssid));persistSelection();renderNetworks();drawSignal();});
$('#clear-selection').addEventListener('click',()=>{selected.clear();persistSelection();renderNetworks();drawSignal();});
$('#select-all').addEventListener('change',e=>{filtered().forEach(n=>e.target.checked?selected.add(n.bssid):selected.delete(n.bssid));persistSelection();renderNetworks();drawSignal();});
$('#time-controls').addEventListener('click',e=>{if(!e.target.dataset.minutes)return;minutes=Number(e.target.dataset.minutes);$$('#time-controls button').forEach(b=>b.classList.toggle('active',b===e.target));drawSignal();});
$('#pause-button').addEventListener('click',()=>{paused=!paused;$('#pause-button').textContent=paused?'▶ Tiếp tục':'Ⅱ Tạm dừng xem';$('#live-tag').textContent=paused?'PAUSED':'LIVE';updateNotice();if(!paused)poll();});
$('#scan-button').addEventListener('click',async()=>{const button=$('#scan-button');button.disabled=true;try{await post('/api/scan');toast('Đã yêu cầu Windows quét lại. Chờ vài giây để driver cập nhật.');setTimeout(poll,3500);}catch(e){toast(e.message);}finally{setTimeout(()=>button.disabled=false,2500);}});
$('#channel-band').addEventListener('change',renderChannels);
$('#close-detail').addEventListener('click',()=>$('#detail-dialog').close());$('#close-help').addEventListener('click',()=>$('#help-dialog').close());$('#help-button').addEventListener('click',()=>$('#help-dialog').showModal());
$('#survey-network').addEventListener('change',()=>{project.survey.bssid=$('#survey-network').value;saveProject();renderSurvey();});
$('#survey-canvas').addEventListener('click',addSurveyPoint);$('#survey-heat').addEventListener('change',renderSurvey);
$('#survey-upload').addEventListener('change',e=>uploadImage(e.target.files[0],'survey'));
$('#plan-upload').addEventListener('change',e=>uploadImage(e.target.files[0],'plan'));
$('#survey-undo').addEventListener('click',()=>{if(!surveyHistory.length){toast('Không còn thao tác để hoàn tác.');return;}project.survey.points=surveyHistory.pop();saveProject();renderSurvey();});
$('#survey-clear').addEventListener('click',()=>{const key=project.survey.bssid;if(!project.survey.points.some(p=>p.bssid===key))return;if(!confirm('Xóa các điểm đo của BSSID đang chọn?'))return;surveyHistory.push(structuredClone(project.survey.points));project.survey.points=project.survey.points.filter(p=>p.bssid!==key);saveProject();renderSurvey();});
$('#survey-points').addEventListener('click',e=>{const id=e.target.dataset.removePoint;if(!id)return;surveyHistory.push(structuredClone(project.survey.points));project.survey.points=project.survey.points.filter(p=>p.id!==id);saveProject();renderSurvey();});
$('#plan-tools').addEventListener('click',e=>{if(!e.target.dataset.tool)return;planTool=e.target.dataset.tool;wallStart=null;$$('#plan-tools button').forEach(b=>b.classList.toggle('active',b===e.target));renderPlan();});
$('#plan-canvas').addEventListener('pointerdown',planDown);
$('#plan-canvas').addEventListener('pointermove',e=>{if(drag){Object.assign(drag,mapPoint(e,$('#plan-canvas')));renderPlan();}});
$('#plan-canvas').addEventListener('pointerup',()=>{if(drag){drag=null;saveProject();}});
$('#plan-canvas').addEventListener('pointercancel',()=>{drag=null;saveProject();});
$('#plan-undo').addEventListener('click',()=>{if(wallStart){wallStart=null;renderPlan();return;}if(!planHistory.length){toast('Không còn thao tác để hoàn tác.');return;}project.plan=planHistory.pop();syncPlanInputs();restoreImages();saveProject();renderPlan();});
function syncPlanInputs(){$('#plan-meters').value=project.plan.meters;$('#plan-loss').value=project.plan.loss;}
['plan-meters','plan-loss'].forEach(id=>$('#'+id).addEventListener('change',()=>{snapshotPlan();project.plan.meters=clamp(Number($('#plan-meters').value)||30,2,1000);project.plan.loss=clamp(Number($('#plan-loss').value)||3,1.5,6);syncPlanInputs();saveProject();renderPlan();}));
$('#plan-ap-list').addEventListener('click',e=>{const id=e.target.dataset.removeAp;if(!id)return;snapshotPlan();project.plan.aps=project.plan.aps.filter(p=>p.id!==id);saveProject();renderPlan();});
$('#diagnose-button').addEventListener('click',async()=>{const button=$('#diagnose-button');button.disabled=true;button.textContent='Đang kiểm tra…';try{diagnostics=await post('/api/diagnostics');$('#diagnostics-results').innerHTML=diagnostics.results.map(r=>`<div class="diagnostic-result"><b>${r.host}:443 · ${r.average_ms===null?'Không kết nối được':r.average_ms+' ms'}</b><span>TCP trung bình · ${r.attempts-r.failed_attempts}/${r.attempts} lần thành công · ${timeText(diagnostics.timestamp)}</span></div>`).join('');}catch(e){toast(e.message);}finally{button.disabled=false;button.textContent='Kiểm tra lại';}});
$('#export-csv').addEventListener('click',exportCSV);$('#report-csv').addEventListener('click',exportCSV);
$('#export-history').addEventListener('click',()=>download('song-history.json',JSON.stringify({exported_at:new Date().toISOString(),source:state.source,history:state.history,networks:state.networks,diagnostics},null,2),'application/json'));
$('#export-project').addEventListener('click',()=>download('song-project.json',JSON.stringify(project,null,2),'application/json'));
$('#import-project').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>14000000)throw new Error('Dự án quá lớn (tối đa 14 MB).');const next=validateProject(JSON.parse(await file.text()));if((project.survey.points.length||project.plan.aps.length||project.survey.image||project.plan.image)&&!confirm('Mở dự án sẽ thay thế dự án đang làm. Bạn đã tải bản lưu nếu cần?'))return;project=next;surveyHistory=[];planHistory=[];wallStart=null;drag=null;syncPlanInputs();restoreImages();saveProject();renderSurveySelect();renderSurvey();renderPlan();toast('Đã mở dự án.');}catch(err){toast(err.message||'Không đọc được dự án.');}finally{e.target.value='';}});
$('#print-report').addEventListener('click',()=>{
 let extras=$('#print-extras');if(!extras){extras=document.createElement('div');extras.id='print-extras';$('main').append(extras);}
 extras.innerHTML=`<section><h2>Đánh giá kết nối · ${esc(new Date().toLocaleString('vi-VN'))}</h2>${healthItems().map(i=>`<p><b>${esc(i.title)}</b> — ${esc(i.text)}</p>`).join('')}</section>`;
 if(project.survey.points.some(p=>p.bssid===project.survey.bssid)){renderSurvey();extras.innerHTML+=`<section><h2>Khảo sát · ${esc(project.survey.bssid)}</h2><p>RSSI theo điểm đã lưu; tô màu nội suy, không phải phép đo ở mọi vị trí.</p><img alt="Bản đồ khảo sát" src="${$('#survey-canvas').toDataURL()}"></section>`;}
 if(project.plan.aps.length){renderPlan();extras.innerHTML+=`<section><h2>Kế hoạch phủ sóng — mô phỏng</h2><p>${esc($('#plan-summary').textContent)} Cần khảo sát thực tế để kiểm chứng.</p><img alt="Bản đồ dự báo" src="${$('#plan-canvas').toDataURL()}"></section>`;}
 navigate('inspector');setTimeout(()=>window.print(),150);
});
window.addEventListener('resize',()=>{if(page==='inspector')drawSignal();if(page==='channels')renderChannels();});
window.addEventListener('beforeprint',drawSignal);
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&wallStart){wallStart=null;renderPlan();}});
try {const saved=localStorage.getItem('song.project.v1');if(saved)project=validateProject(JSON.parse(saved));const keys=JSON.parse(localStorage.getItem('song.selection')||'[]');if(Array.isArray(keys))selected=new Set(keys.filter(k=>typeof k==='string'&&k.length<40));}catch{toast('Dữ liệu lưu trước đó không hợp lệ. Đang mở dự án trống.');}
syncPlanInputs();restoreImages();navigate(location.hash.slice(1)||'inspector');poll();setInterval(poll,3000);
