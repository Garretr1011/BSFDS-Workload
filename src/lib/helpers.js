export const CORE_OFFICES = ['Brisbane', 'Chennai', 'Bangkok']
export const OFFICE_COLORS = {Brisbane:'#4f8ef7',Chennai:'#f7a24f',Bangkok:'#4ff7a2'}

export function getOfficeColor(office) { return OFFICE_COLORS[office] || '#b87fff' }

export function hexToRgb(hex) {
  const h=hex.replace('#','')
  return { r:parseInt(h.slice(0,2),16), g:parseInt(h.slice(2,4),16), b:parseInt(h.slice(4,6),16) }
}

export function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
export function parseLocalDate(iso) {
  const [y,m,d]=iso.split('-').map(Number); return new Date(y,m-1,d)
}
export function fmtDisplay(d) {
  return d.toLocaleDateString('en-AU',{day:'numeric',month:'short'})
}
export function fmtLeaveDate(isoStr) {
  return parseLocalDate(isoStr).toLocaleDateString('en-AU',{day:'2-digit',month:'short',year:'2-digit'})
}
export function fmtPHDate(isoStr) {
  return parseLocalDate(isoStr).toLocaleDateString('en-AU',{day:'2-digit',month:'short',year:'numeric'})
}
export function addDays(d,n) { const dt=new Date(d); dt.setDate(dt.getDate()+n); return dt }
export function isWeekend(d) { const day=d.getDay(); return day===0||day===6 }
export function getMondayOf(d) {
  const dt=new Date(d); dt.setHours(0,0,0,0)
  const day=dt.getDay(); dt.setDate(dt.getDate()+(day===0?-6:1-day)); return dt
}
export function getWeekDays(weekStart, numWeeks=2) {
  return Array.from({length:numWeeks*7},(_,i)=>addDays(weekStart,i))
}
const _ds=['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
export const DAY_SHORT=[..._ds,..._ds,..._ds,..._ds]

export function getPHForDate(dateStr, office, upcomingPH) {
  for(const ph of (upcomingPH[office]||[])){
    if(!ph.iso_date) continue
    const endDs=ph.end_iso_date||ph.iso_date
    if(dateStr>=ph.iso_date&&dateStr<=endDs) return ph
  }
  return null
}

// ── Active task — returns a single logical cell (may have multiple rows if grouped) ──
// Returns { entries: [...], startDs, isVirtual }
// entries is an array — length 1 for normal, 2+ for combined/grouped
export function getActiveTask(name, dateStr, tasks, upcomingLeave, upcomingPH, teamMembers) {
  const member=teamMembers.find(m=>m.name===name)
  const office=member?.office

  // 1. PH always wins
  if(office){
    const ph=getPHForDate(dateStr,office,upcomingPH)
    if(ph) return {
      entries:[{ pid:'', task:ph.name, wtype:'ph', end_date:ph.end_iso_date||ph.iso_date, id:null }],
      startDs:ph.iso_date, isVirtual:true
    }
  }

  // 2. Manual tasks — find all that cover this date (could be a group)
  const memberTasks=tasks[name]||{}

  // Check exact start date
  if(memberTasks[dateStr]?.length) {
    return { entries:memberTasks[dateStr], startDs:dateStr, isVirtual:false }
  }

  // Check spanning tasks (started before this date)
  for(const startDs of Object.keys(memberTasks).sort()){
    if(startDs>=dateStr) continue
    const rows=memberTasks[startDs]||[]
    if(rows.length>0 && rows[0].end_date>=dateStr) {
      return { entries:rows, startDs, isVirtual:false }
    }
  }

  // 3. Virtual leave
  if(office){
    for(const item of (upcomingLeave[office]||[])){
      if(item.name!==name||!item.start_date||!item.end_date) continue
      if(dateStr>=item.start_date&&dateStr<=item.end_date) return {
        entries:[{ pid:'', task:`Leave — ${item.dates||item.name}`, wtype:'leave', end_date:item.end_date, id:null }],
        startDs:item.start_date, isVirtual:true
      }
    }
  }
  return null
}

// ── Build tasks map — groups rows by (member_name, start_date, group_id) ──
// Result: { memberName: { startDate: [row, row, ...] } }
// Grouped rows share same start_date and group_id → stored as array
// Ungrouped rows → array of length 1
export function buildTasksMap(assignments) {
  const map={}
  // Group by member + start_date + group_id
  for(const a of assignments){
    if(!map[a.member_name]) map[a.member_name]={}
    const key=a.start_date
    if(!map[a.member_name][key]) map[a.member_name][key]=[]
    map[a.member_name][key].push({
      id:a.id, pid:a.pid||'', task:a.task, wtype:a.wtype,
      end_date:a.end_date, notes:a.notes||'', group_id:a.group_id||null
    })
  }
  return map
}

export function buildLeaveMap(rows){
  const map={}; rows.forEach(r=>{if(!map[r.office])map[r.office]=[];map[r.office].push(r)}); return map
}
export function buildPHMap(rows){
  const map={}; rows.forEach(r=>{if(!map[r.office])map[r.office]=[];map[r.office].push(r)}); return map
}
export function getProjectColor(pid,projects,adminTasks){
  if(!pid) return null
  return projects.find(x=>x.id===pid)?.color||adminTasks.find(x=>x.id===pid)?.color||null
}
export function getProjectLabel(pid,projects,adminTasks){
  if(!pid) return ''
  const p=projects.find(x=>x.id===pid); if(p) return `${p.job} — ${p.name}`
  const a=adminTasks.find(x=>x.id===pid); if(a) return a.name
  return ''
}
export function nextAutoColor(projects,adminTasks){
  const hues=[210,35,160,0,270,190,60,310,100,20,240,330,80,170,50]
  const hue=hues[((projects?.length||0)+(adminTasks?.length||0))%hues.length]
  const h=hue/360,s=0.65,l=0.62
  const q=l<0.5?l*(1+s):l+s-l*s,p=2*l-q
  const hr=(p,q,t)=>{if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p+(q-p)*6*t;if(t<0.5)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p}
  const r=Math.round(hr(p,q,h+1/3)*255),g=Math.round(hr(p,q,h)*255),b=Math.round(hr(p,q,h-1/3)*255)
  return '#'+[r,g,b].map(x=>x.toString(16).padStart(2,'0')).join('')
}
