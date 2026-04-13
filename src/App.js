import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from './lib/supabase'
import {
  fmtDate, fmtDisplay, fmtLeaveDate, fmtPHDate, parseLocalDate,
  addDays, isWeekend, getMondayOf, getWeekDays, DAY_SHORT,
  getActiveTask, buildTasksMap, buildLeaveMap, buildPHMap,
  getProjectColor, getProjectLabel, nextAutoColor,
  hexToRgb, getOfficeColor, CORE_OFFICES, OFFICE_COLORS
} from './lib/helpers'

// ─── Toast ────────────────────────────────────────────────────────────
function Toast({ msg, onDone }) {
  useEffect(() => { const t=setTimeout(onDone,3000); return ()=>clearTimeout(t) }, [onDone])
  return <div style={{position:'fixed',bottom:24,left:'50%',transform:'translateX(-50%)',
    background:'rgba(247,92,92,.95)',color:'#fff',padding:'10px 20px',borderRadius:6,
    fontSize:13,zIndex:9999,fontFamily:'DM Mono,monospace',pointerEvents:'none'}}>{msg}</div>
}

// ─── Drag Ghost ───────────────────────────────────────────────────────
function DragGhost({ x, y, text, isCopy }) {
  if (!text) return null
  return <div style={{position:'fixed',left:x+12,top:y-15,pointerEvents:'none',zIndex:999,
    background:isCopy?'rgba(79,247,162,.2)':'rgba(79,142,247,.25)',
    border:`2px dashed ${isCopy?'#4ff7a2':'#4f8ef7'}`,
    borderRadius:4,padding:'4px 10px',fontSize:11,
    color:isCopy?'#4ff7a2':'#4f8ef7',whiteSpace:'nowrap'}}>{text}</div>
}

// ─── Modal ────────────────────────────────────────────────────────────
function Modal({ open, onClose, children, width }) {
  if (!open) return null
  return (
    <div onMouseDown={e=>e.target===e.currentTarget&&onClose()}
      style={{position:'fixed',inset:0,background:'rgba(0,0,0,.78)',zIndex:200,
        display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div onMouseDown={e=>e.stopPropagation()}
        style={{background:'#181c27',border:'1px solid #2a3050',borderRadius:10,
          width:width||480,maxWidth:'95vw',padding:24,boxShadow:'0 24px 70px rgba(0,0,0,.6)',
          maxHeight:'90vh',overflowY:'auto',fontFamily:'DM Mono,monospace'}}>
        {children}
      </div>
    </div>
  )
}

const I = {
  base:{width:'100%',background:'#1e2335',border:'1px solid #2a3050',color:'#e2e8ff',
    padding:'8px 10px',borderRadius:4,fontSize:12,fontFamily:'DM Mono,monospace',boxSizing:'border-box'},
  label:{display:'block',fontSize:11,color:'#9aa3c2',marginBottom:4,marginTop:13},
  row:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12},
}
const btnBase={background:'#1e2335',border:'1px solid #2a3050',color:'#9aa3c2',
  padding:'6px 14px',borderRadius:4,cursor:'pointer',fontSize:12,fontFamily:'DM Mono,monospace'}
const modalH3={fontFamily:'Syne,sans-serif',fontSize:15,marginBottom:3,color:'#e2e8ff'}

// ═══════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════
export default function App() {
  const [tab, setTab] = useState('workload')
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)

  const [teamMembers, setTeamMembers] = useState([])
  const [projects, setProjects] = useState([])
  const [adminTasks, setAdminTasks] = useState([])
  const [assignments, setAssignments] = useState([])
  const [upcomingLeaveRows, setUpcomingLeaveRows] = useState([])
  const [publicHolidayRows, setPublicHolidayRows] = useState([])

  const [tasks, setTasks] = useState({})
  const [upcomingLeave, setUpcomingLeave] = useState({})
  const [upcomingPH, setUpcomingPH] = useState({})

  const [weekStart, setWeekStart] = useState(()=>getMondayOf(new Date()))
  const [officeFilter, setOfficeFilter] = useState('all')
  const [projectFilter, setProjectFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [statWeeks, setStatWeeks] = useState(2) // 1-4

  const [assignModal, setAssignModal] = useState(null)
  const [projectModal, setProjectModal] = useState(null)
  const [adminTaskModal, setAdminTaskModal] = useState(null)
  const [memberModal, setMemberModal] = useState(null)
  const [leaveModal, setLeaveModal] = useState(null)
  const [phModal, setPhModal] = useState(null)

  const [dragGhost, setDragGhost] = useState(null)
  const dragState = useRef(null)
  const copyDragState = useRef(null)

  // Undo stack — array of snapshots of assignments
  const undoStack = useRef([])
  const [canUndo, setCanUndo] = useState(false)

  const showToast = useCallback(msg=>setToast(msg),[])

  const reloadAssignments = useCallback(async()=>{
    const r=await supabase.from('task_assignments').select('*')
    setAssignments(r.data||[])
  },[])

  // ── Load ──
  useEffect(()=>{
    async function loadAll() {
      setLoading(true)
      const [tm,pr,at,ta,ul,ph] = await Promise.all([
        supabase.from('team_members').select('*').order('office').order('sort_order'),
        supabase.from('projects').select('*').order('job'),
        supabase.from('admin_tasks').select('*').order('name'),
        supabase.from('task_assignments').select('*'),
        supabase.from('upcoming_leave').select('*'),
        supabase.from('public_holidays').select('*').order('iso_date'),
      ])
      setTeamMembers(tm.data||[])
      setProjects(pr.data||[])
      setAdminTasks(at.data||[])
      setAssignments(ta.data||[])
      setUpcomingLeaveRows(ul.data||[])
      setPublicHolidayRows(ph.data||[])
      setLoading(false)
    }
    loadAll()
  },[])

  useEffect(()=>{ setTasks(buildTasksMap(assignments)) },[assignments])
  useEffect(()=>{ setUpcomingLeave(buildLeaveMap(upcomingLeaveRows)) },[upcomingLeaveRows])
  useEffect(()=>{ setUpcomingPH(buildPHMap(publicHolidayRows)) },[publicHolidayRows])

  // ── Realtime ──
  useEffect(()=>{
    const channels=[
      supabase.channel('rt-team').on('postgres_changes',{event:'*',schema:'public',table:'team_members'},
        ()=>supabase.from('team_members').select('*').order('office').order('sort_order').then(r=>setTeamMembers(r.data||[]))).subscribe(),
      supabase.channel('rt-proj').on('postgres_changes',{event:'*',schema:'public',table:'projects'},
        ()=>supabase.from('projects').select('*').order('job').then(r=>setProjects(r.data||[]))).subscribe(),
      supabase.channel('rt-admin').on('postgres_changes',{event:'*',schema:'public',table:'admin_tasks'},
        ()=>supabase.from('admin_tasks').select('*').order('name').then(r=>setAdminTasks(r.data||[]))).subscribe(),
      supabase.channel('rt-tasks').on('postgres_changes',{event:'*',schema:'public',table:'task_assignments'},
        ()=>reloadAssignments()).subscribe(),
      supabase.channel('rt-leave').on('postgres_changes',{event:'*',schema:'public',table:'upcoming_leave'},
        ()=>supabase.from('upcoming_leave').select('*').then(r=>setUpcomingLeaveRows(r.data||[]))).subscribe(),
      supabase.channel('rt-ph').on('postgres_changes',{event:'*',schema:'public',table:'public_holidays'},
        ()=>supabase.from('public_holidays').select('*').order('iso_date').then(r=>setPublicHolidayRows(r.data||[]))).subscribe(),
    ]
    return ()=>channels.forEach(c=>supabase.removeChannel(c))
  },[reloadAssignments])

  const days = getWeekDays(weekStart)
  const week1Work = days.slice(0,5)
  const week2Work = days.slice(7,12)
  const allWorkdays = [...week1Work,...week2Work]
  const allOffices = [...new Set([...CORE_OFFICES,...teamMembers.map(m=>m.office)])]
    .filter(o=>teamMembers.some(m=>m.office===o))

  const getActive = useCallback((name,ds)=>
    getActiveTask(name,ds,tasks,upcomingLeave,upcomingPH,teamMembers),
    [tasks,upcomingLeave,upcomingPH,teamMembers])

  // ── Stats (respect statWeeks toggle) ──
  const statWorkdays = []
  for (let i=0; i<statWeeks*7; i++) {
    const d = addDays(weekStart, i)
    if (!isWeekend(d)) statWorkdays.push(d)
  }
  let onLeave=0, onLeaveHrs=0, unassigned=0, assigned=0, totalPossible=0
  teamMembers.forEach(({name})=>{
    let hl=false
    week1Work.forEach(d=>{ if(getActive(name,fmtDate(d))?.entry?.wtype==='leave') hl=true })
    statWorkdays.forEach(d=>{
      totalPossible++
      const a=getActive(name,fmtDate(d))
      if(a) assigned++
      else unassigned++
    })
    if(hl){ onLeave++; onLeaveHrs+=5*8 }
  })
  const utilPct = totalPossible>0 ? Math.round(assigned/totalPossible*100) : 0

  // Active projects in the current 2-week window (for project filter bar)
  const activeProjectsInWindow = []
  projects.filter(p=>p.status==='active').forEach(p=>{
    const used = teamMembers.some(m=>
      allWorkdays.some(d=>getActive(m.name,fmtDate(d))?.entry?.pid===p.id)
    )
    if (used) activeProjectsInWindow.push(p)
  })

  // ── Undo ──
  function pushUndo(snapshot) {
    undoStack.current.push(snapshot)
    setCanUndo(true)
  }

  async function undo() {
    if (!undoStack.current.length) return
    const prev = undoStack.current.pop()
    setCanUndo(undoStack.current.length>0)
    // Delete all current assignments then re-insert the snapshot
    await supabase.from('task_assignments').delete().neq('id','00000000-0000-0000-0000-000000000000')
    if (prev.length>0) {
      await supabase.from('task_assignments').insert(prev.map(a=>({
        id:a.id, member_name:a.member_name, start_date:a.start_date,
        end_date:a.end_date, task:a.task, pid:a.pid||null,
        wtype:a.wtype, notes:a.notes||null, updated_at:new Date().toISOString()
      })))
    }
    await reloadAssignments()
    showToast('Undone')
  }

  // ── Save / Clear task ──
  async function saveTask(name, dateStr, pid, taskLabel, wtype, endDate, notes) {
    pushUndo([...assignments])
    const existing = assignments.find(a=>a.member_name===name&&a.start_date===dateStr)
    const row={member_name:name,start_date:dateStr,end_date:endDate||dateStr,
      task:taskLabel,pid:pid||null,wtype,notes:notes||null,updated_at:new Date().toISOString()}
    if(existing) await supabase.from('task_assignments').update(row).eq('id',existing.id)
    else await supabase.from('task_assignments').insert(row)
    await reloadAssignments()
  }

  async function clearTask(name, dateStr) {
    pushUndo([...assignments])
    const existing=assignments.find(a=>a.member_name===name&&a.start_date===dateStr)
    if(existing){ await supabase.from('task_assignments').delete().eq('id',existing.id); await reloadAssignments() }
  }

  // ── Arrow date adjustment (1 day at a time) ──
  async function adjustTaskDate(name, startDs, which, delta) {
    // which: 'start' or 'end', delta: +1 or -1
    const entry = tasks[name]?.[startDs]?.[0]
    if (!entry) return
    pushUndo([...assignments])
    let newStart=startDs, newEnd=entry.end_date
    if (which==='start') {
      let d = parseLocalDate(startDs)
      do { d=addDays(d,delta) } while(isWeekend(d))
      newStart=fmtDate(d)
      if(newStart>newEnd) newEnd=newStart
    } else {
      let d = parseLocalDate(entry.end_date)
      do { d=addDays(d,delta) } while(isWeekend(d))
      newEnd=fmtDate(d)
      if(newEnd<newStart) newStart=newEnd
    }
    // If start moved, delete old record first
    if (newStart!==startDs) {
      await supabase.from('task_assignments').delete().eq('member_name',name).eq('start_date',startDs)
    }
    await saveTask(name,newStart,entry.pid,entry.task,entry.wtype,newEnd,entry.notes)
  }

  // ── Drag resize ──
  function startResize(e, name, startDs, handle) {
    e.preventDefault(); e.stopPropagation()
    const entry=tasks[name]?.[startDs]?.[0]; if(!entry) return
    dragState.current={name,startDs,entry,handle,currentStart:startDs,currentEnd:entry.end_date}
    setDragGhost({x:e.clientX,y:e.clientY,text:entry.task,isCopy:false})
  }

  // ── Drag copy ──
  function startCopy(e, name, startDs) {
    e.preventDefault(); e.stopPropagation()
    const active=getActive(name,startDs)
    if(!active||active.isVirtual) return
    copyDragState.current={name,startDs,entry:active.entry}
    setDragGhost({x:e.clientX,y:e.clientY,text:`⊕ Copy: ${active.entry.task}`,isCopy:true})
  }

  function getDateAtX(clientX) {
    const ths=document.querySelectorAll('#grid-thead th')
    const allDays=getWeekDays(weekStart)
    let best=null, dayIdx=0
    ths.forEach((th,i)=>{
      if(i===0) return
      if(th.dataset.weekend) return
      const rect=th.getBoundingClientRect()
      if(clientX>=rect.left&&clientX<=rect.right) best=allDays[dayIdx]
      dayIdx++
    })
    return best
  }

  useEffect(()=>{
    function onMouseMove(e) {
      if(!dragState.current&&!copyDragState.current) return
      setDragGhost(g=>g?{...g,x:e.clientX,y:e.clientY}:null)
      if(dragState.current) {
        const {entry,handle}=dragState.current
        const targetDay=getDateAtX(e.clientX)
        if(!targetDay||isWeekend(targetDay)) return
        const targetDs=fmtDate(targetDay)
        if(handle==='end'&&targetDs<dragState.current.currentStart) return
        if(handle==='start'&&targetDs>dragState.current.currentEnd) return
        if(handle==='end') dragState.current.currentEnd=targetDs
        else dragState.current.currentStart=targetDs
        const s=parseLocalDate(dragState.current.currentStart),t=parseLocalDate(dragState.current.currentEnd)
        const nd=Math.round((t-s)/86400000)+1
        const lbl=handle==='end'?`End → ${fmtDisplay(targetDay)}`:`Start → ${fmtDisplay(targetDay)}`
        setDragGhost(g=>({...g,text:`${entry.task}  |  ${lbl} (${nd}d)`}))
      }
      if(copyDragState.current) {
        document.querySelectorAll('[data-member-row]').forEach(r=>r.style.outline='')
        const el=document.elementFromPoint(e.clientX,e.clientY)
        const row=el?.closest('[data-member-row]')
        if(row) row.style.outline='1px solid #4ff7a2'
      }
    }
    async function onMouseUp(e) {
      if(dragState.current) {
        const {name,startDs,entry,handle,currentStart,currentEnd}=dragState.current
        dragState.current=null; setDragGhost(null)
        const changed=handle==='end'?currentEnd!==entry.end_date:currentStart!==startDs
        if(changed) {
          pushUndo([...assignments])
          if(handle==='start'&&currentStart!==startDs)
            await supabase.from('task_assignments').delete().eq('member_name',name).eq('start_date',startDs)
          const row={member_name:name,start_date:currentStart,end_date:currentEnd,
            task:entry.task,pid:entry.pid||null,wtype:entry.wtype,notes:entry.notes||null,updated_at:new Date().toISOString()}
          const existing=assignments.find(a=>a.member_name===name&&a.start_date===currentStart)
          if(existing) await supabase.from('task_assignments').update(row).eq('id',existing.id)
          else await supabase.from('task_assignments').insert(row)
          await reloadAssignments()
        }
      }
      if(copyDragState.current) {
        document.querySelectorAll('[data-member-row]').forEach(r=>r.style.outline='')
        const {name:srcName,startDs,entry}=copyDragState.current
        copyDragState.current=null; setDragGhost(null)
        const el=document.elementFromPoint(e.clientX,e.clientY)
        const row=el?.closest('[data-member-row]')
        const targetName=row?.dataset?.memberRow
        const targetDay=getDateAtX(e.clientX)
        if(targetName&&targetName!==srcName&&targetDay&&!isWeekend(targetDay)) {
          const targetDs=fmtDate(targetDay)
          const dur=entry.end_date>startDs?Math.round((parseLocalDate(entry.end_date)-parseLocalDate(startDs))/86400000):0
          const newEnd=dur>0?fmtDate(addDays(parseLocalDate(targetDs),dur)):targetDs
          await saveTask(targetName,targetDs,entry.pid,entry.task,entry.wtype,newEnd,entry.notes)
          showToast(`Copied to ${targetName}`)
        }
      }
    }
    window.addEventListener('mousemove',onMouseMove)
    window.addEventListener('mouseup',onMouseUp)
    return()=>{ window.removeEventListener('mousemove',onMouseMove); window.removeEventListener('mouseup',onMouseUp) }
  },[tasks,weekStart,assignments,showToast])

  // ── Row reorder ──
  const [rowDragSrc,setRowDragSrc]=useState(null)
  async function moveRow(memberId,office,dir) {
    const om=teamMembers.filter(m=>m.office===office).sort((a,b)=>a.sort_order-b.sort_order)
    const idx=om.findIndex(m=>m.id===memberId), nIdx=idx+dir
    if(nIdx<0||nIdx>=om.length) return
    const a=om[idx],b=om[nIdx]
    await Promise.all([
      supabase.from('team_members').update({sort_order:b.sort_order}).eq('id',a.id),
      supabase.from('team_members').update({sort_order:a.sort_order}).eq('id',b.id),
    ])
    const r=await supabase.from('team_members').select('*').order('office').order('sort_order')
    setTeamMembers(r.data||[])
  }
  function handleRowDrop(targetId,targetOffice) {
    if(!rowDragSrc||rowDragSrc.id===targetId||rowDragSrc.office!==targetOffice){setRowDragSrc(null);return}
    const om=teamMembers.filter(m=>m.office===targetOffice).sort((a,b)=>a.sort_order-b.sort_order)
    const si=om.findIndex(m=>m.id===rowDragSrc.id),ti=om.findIndex(m=>m.id===targetId)
    if(si<0||ti<0){setRowDragSrc(null);return}
    const ro=[...om]; const [mv]=ro.splice(si,1); ro.splice(ti,0,mv)
    Promise.all(ro.map((m,i)=>supabase.from('team_members').update({sort_order:i+1}).eq('id',m.id)))
      .then(()=>supabase.from('team_members').select('*').order('office').order('sort_order'))
      .then(r=>{setTeamMembers(r.data||[]);setRowDragSrc(null)})
  }

  // ── Export ──
  function exportSummary() {
    const lines=['BSFDS Workload Summary (2 weeks)',
      `Period: ${fmtDisplay(days[0])} to ${fmtDisplay(days[11])}`,
      `Generated: ${new Date().toLocaleString('en-AU')}`,'','═'.repeat(70),'']
    allOffices.forEach(office=>{
      lines.push(`[ ${office.toUpperCase()} ]`)
      teamMembers.filter(m=>m.office===office).forEach(({name,role})=>{
        lines.push(`  ${name.padEnd(24)} ${role||''}`)
        allWorkdays.forEach(d=>{
          const ds=fmtDate(d),a=getActive(name,ds)
          lines.push(`    ${d.toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short'})}: ${a?`${a.entry.task} [${a.entry.wtype||''}]`:'(unassigned)'}`)
        })
      }); lines.push('')
    })
    const blob=new Blob([lines.join('\n')],{type:'text/plain'})
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob)
    a.download=`BSFDS_Workload_${fmtDate(days[0])}.txt`; a.click()
  }

  if(loading) return(
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',
      background:'#0f1117',color:'#9aa3c2',fontFamily:'DM Mono,monospace',fontSize:14}}>
      Loading BSFDS Workload Manager…
    </div>
  )

  return(
    <div style={{background:'#0f1117',minHeight:'100vh',color:'#e2e8ff',fontFamily:'DM Mono,monospace'}}>
      {toast&&<Toast msg={toast} onDone={()=>setToast(null)} />}
      {dragGhost&&<DragGhost x={dragGhost.x} y={dragGhost.y} text={dragGhost.text} isCopy={dragGhost.isCopy} />}

      <div style={{maxWidth:1600,margin:'0 auto',padding:'16px 20px'}}>
        {/* Header */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',
          borderBottom:'1px solid #2a3050',paddingBottom:14,marginBottom:0}}>
          <div style={{display:'flex',alignItems:'center',gap:16}}>
            <img src="/logo.png" alt="BSFDS" style={{height:44,objectFit:'contain'}} onError={e=>e.target.style.display='none'} />
            <div style={{fontFamily:'Syne,sans-serif',fontWeight:800,fontSize:20,letterSpacing:'-0.5px'}}>
              BSFDS Workload Manager
            </div>
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            {canUndo&&<button className="btn" onClick={undo} title="Undo last change">↩ Undo</button>}
            <button className="btn" onClick={exportSummary}>↓ Export</button>
            <button className="btn" onClick={()=>window.print()}>Print</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{display:'flex',borderBottom:'1px solid #2a3050',marginBottom:20}}>
          {[['workload','📋 Workload'],['projects','🗂 Projects & Tasks'],['team','👥 Team']].map(([id,label])=>(
            <div key={id} onClick={()=>setTab(id)}
              style={{padding:'12px 22px',fontSize:12,fontWeight:500,cursor:'pointer',
                color:tab===id?'#4f8ef7':'#9aa3c2',
                borderBottom:tab===id?'2px solid #4f8ef7':'2px solid transparent',marginBottom:-1}}>
              {label}
            </div>
          ))}
        </div>

        {tab==='workload'&&(
          <WorkloadTab
            days={days} week1Work={week1Work} week2Work={week2Work} allWorkdays={allWorkdays}
            weekStart={weekStart} setWeekStart={setWeekStart}
            teamMembers={teamMembers} projects={projects} adminTasks={adminTasks}
            tasks={tasks} upcomingLeave={upcomingLeave} upcomingPH={upcomingPH}
            upcomingLeaveRows={upcomingLeaveRows} setUpcomingLeaveRows={setUpcomingLeaveRows}
            publicHolidayRows={publicHolidayRows} setPublicHolidayRows={setPublicHolidayRows}
            officeFilter={officeFilter} setOfficeFilter={setOfficeFilter}
            projectFilter={projectFilter} setProjectFilter={setProjectFilter}
            activeProjectsInWindow={activeProjectsInWindow}
            search={search} setSearch={setSearch}
            allOffices={allOffices}
            onLeave={onLeave} onLeaveHrs={onLeaveHrs}
            unassigned={unassigned} unassignedHrs={unassigned*8}
            utilPct={utilPct}
            statWeeks={statWeeks} setStatWeeks={setStatWeeks}
            getActive={getActive}
            setAssignModal={setAssignModal}
            setLeaveModal={setLeaveModal} setPhModal={setPhModal}
            startResize={startResize} startCopy={startCopy}
            adjustTaskDate={adjustTaskDate}
            rowDragSrc={rowDragSrc} setRowDragSrc={setRowDragSrc}
            moveRow={moveRow} handleRowDrop={handleRowDrop}
            showToast={showToast}
          />
        )}
        {tab==='projects'&&(
          <ProjectsTab projects={projects} adminTasks={adminTasks}
            setProjectModal={setProjectModal} setAdminTaskModal={setAdminTaskModal} />
        )}
        {tab==='team'&&(
          <TeamTab teamMembers={teamMembers} setTeamMembers={setTeamMembers} setMemberModal={setMemberModal} />
        )}
      </div>

      {/* Modals */}
      {assignModal&&<AssignModal modal={assignModal} onClose={()=>setAssignModal(null)}
        projects={projects} adminTasks={adminTasks} onSave={saveTask} onClear={clearTask} showToast={showToast} />}
      {projectModal!==null&&<ProjectModal item={projectModal} projects={projects} adminTasks={adminTasks}
        onClose={()=>setProjectModal(null)}
        onSave={async row=>{
          if(row.id) await supabase.from('projects').upsert(row)
          else await supabase.from('projects').insert({...row,id:'p'+Date.now()})
          const r=await supabase.from('projects').select('*').order('job'); setProjects(r.data||[]); setProjectModal(null)
        }} />}
      {adminTaskModal!==null&&<AdminTaskModal item={adminTaskModal} projects={projects} adminTasks={adminTasks}
        onClose={()=>setAdminTaskModal(null)}
        onSave={async row=>{
          if(row.id) await supabase.from('admin_tasks').upsert(row)
          else await supabase.from('admin_tasks').insert({...row,id:'a'+Date.now()})
          const r=await supabase.from('admin_tasks').select('*').order('name'); setAdminTasks(r.data||[]); setAdminTaskModal(null)
        }} />}
      {memberModal!==null&&<MemberModal item={memberModal} teamMembers={teamMembers}
        onClose={()=>setMemberModal(null)}
        onSave={async row=>{
          if(row.id) await supabase.from('team_members').update(row).eq('id',row.id)
          else await supabase.from('team_members').insert(row)
          const r=await supabase.from('team_members').select('*').order('office').order('sort_order'); setTeamMembers(r.data||[]); setMemberModal(null)
        }} />}
      {leaveModal!==null&&<LeaveModal item={leaveModal} teamMembers={teamMembers}
        onClose={()=>setLeaveModal(null)} showToast={showToast}
        onSave={async row=>{
          if(row.id&&upcomingLeaveRows.find(x=>x.id===row.id)) await supabase.from('upcoming_leave').update(row).eq('id',row.id)
          else await supabase.from('upcoming_leave').insert({...row,id:row.id||'l'+Date.now()})
          const r=await supabase.from('upcoming_leave').select('*'); setUpcomingLeaveRows(r.data||[]); setLeaveModal(null)
        }} />}
      {phModal!==null&&<PHModal item={phModal} onClose={()=>setPhModal(null)} showToast={showToast}
        onSave={async row=>{
          if(row.id&&publicHolidayRows.find(x=>x.id===row.id)) await supabase.from('public_holidays').update(row).eq('id',row.id)
          else await supabase.from('public_holidays').insert({...row,id:row.id||'ph'+Date.now()})
          const r=await supabase.from('public_holidays').select('*').order('iso_date'); setPublicHolidayRows(r.data||[]); setPhModal(null)
        }} />}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// WORKLOAD TAB
// ═══════════════════════════════════════════════════════════════════
function WorkloadTab({days,week1Work,week2Work,allWorkdays,weekStart,setWeekStart,
  teamMembers,projects,adminTasks,tasks,upcomingLeave,upcomingPH,
  upcomingLeaveRows,setUpcomingLeaveRows,publicHolidayRows,setPublicHolidayRows,
  officeFilter,setOfficeFilter,projectFilter,setProjectFilter,activeProjectsInWindow,
  search,setSearch,allOffices,onLeave,onLeaveHrs,unassigned,unassignedHrs,utilPct,
  statWeeks,setStatWeeks,getActive,setAssignModal,setLeaveModal,setPhModal,
  startResize,startCopy,adjustTaskDate,rowDragSrc,setRowDragSrc,moveRow,handleRowDrop,showToast}) {

  const leaveByOffice={},phByOffice={}
  upcomingLeaveRows.forEach(l=>{if(!leaveByOffice[l.office])leaveByOffice[l.office]=[];leaveByOffice[l.office].push(l)})
  publicHolidayRows.forEach(p=>{if(!phByOffice[p.office])phByOffice[p.office]=[];phByOffice[p.office].push(p)})

  async function deleteLeave(id){
    await supabase.from('upcoming_leave').delete().eq('id',id)
    const r=await supabase.from('upcoming_leave').select('*'); setUpcomingLeaveRows(r.data||[])
  }
  async function deletePH(id){
    await supabase.from('public_holidays').delete().eq('id',id)
    const r=await supabase.from('public_holidays').select('*').order('iso_date'); setPublicHolidayRows(r.data||[])
  }

  // Filter members by office + project + search
  const filteredMembers = teamMembers.filter(m=>{
    if(officeFilter!=='all'&&m.office!==officeFilter) return false
    if(search&&!m.name.toLowerCase().includes(search.toLowerCase())) return false
    if(projectFilter!=='all'){
      const hasProject=allWorkdays.some(d=>getActive(m.name,fmtDate(d))?.entry?.pid===projectFilter)
      if(!hasProject) return false
    }
    return true
  })
  const officeGroups={}
  filteredMembers.forEach(m=>{if(!officeGroups[m.office])officeGroups[m.office]=[];officeGroups[m.office].push(m)})

  return(
    <div>
      {/* Stats row */}
      <div style={{display:'flex',gap:10,marginBottom:18,flexWrap:'wrap'}}>
        <StatCard val={teamMembers.length} label="Total Team" color="#4f8ef7" />
        {allOffices.map(o=><StatCard key={o} val={teamMembers.filter(m=>m.office===o).length}
          label={o} color={OFFICE_COLORS[o]||'#b87fff'} />)}
        {/* Leave card */}
        <div style={{background:'#181c27',border:'1px solid #2a3050',borderRadius:6,
          padding:'11px 16px',minWidth:120,flex:1}}>
          <div style={{fontFamily:'Syne,sans-serif',fontSize:24,fontWeight:800,color:'#f75c5c'}}>{onLeave}</div>
          <div style={{fontSize:10,color:'#9aa3c2',marginTop:1}}>Team Members On Leave</div>
          <div style={{fontSize:10,color:'#f75c5c',marginTop:3}}>{onLeave*5*8} hrs this week</div>
        </div>
        {/* Unassigned card with toggle */}
        <div style={{background:'#181c27',border:'1px solid #2a3050',borderRadius:6,
          padding:'11px 16px',minWidth:160,flex:1}}>
          <div style={{display:'flex',alignItems:'baseline',gap:8}}>
            <div style={{fontFamily:'Syne,sans-serif',fontSize:24,fontWeight:800,color:'#5a6380'}}>{unassigned}</div>
            <div style={{fontSize:12,color:'#5a6380'}}>days / {unassignedHrs} hrs</div>
          </div>
          <div style={{fontSize:10,color:'#9aa3c2',marginTop:1}}>Unassigned ({statWeeks}wk)</div>
          <div style={{fontSize:10,color:'#4ff7a2',marginTop:3}}>Utilisation: {utilPct}%</div>
          <div style={{display:'flex',gap:4,marginTop:6}}>
            {[1,2,3,4].map(w=>(
              <button key={w} onClick={()=>setStatWeeks(w)}
                style={{padding:'1px 6px',borderRadius:3,fontSize:10,cursor:'pointer',
                  border:'1px solid #2a3050',
                  background:statWeeks===w?'#4f8ef7':'transparent',
                  color:statWeeks===w?'#fff':'#9aa3c2'}}>{w}w</button>
            ))}
          </div>
        </div>
      </div>

      {/* Office filter row */}
      <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:8}}>
        {['all',...allOffices].map(o=>(
          <button key={o} onClick={()=>setOfficeFilter(o)}
            style={{padding:'4px 12px',borderRadius:20,fontSize:11,cursor:'pointer',
              border:officeFilter===o?'none':'1px solid #2a3050',
              background:officeFilter===o?(o==='all'?'#5a6380':OFFICE_COLORS[o]||'#b87fff'):'#181c27',
              color:officeFilter===o?(o==='Chennai'||o==='Bangkok'?'#111':'#fff'):'#9aa3c2'}}>
            {o==='all'?'All Offices':o}
          </button>
        ))}
      </div>

      {/* Project filter row */}
      {activeProjectsInWindow.length>0&&(
        <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:12}}>
          <button onClick={()=>setProjectFilter('all')}
            style={{padding:'3px 10px',borderRadius:20,fontSize:10,cursor:'pointer',
              border:projectFilter==='all'?'none':'1px solid #2a3050',
              background:projectFilter==='all'?'#5a6380':'#181c27',
              color:projectFilter==='all'?'#fff':'#9aa3c2'}}>All Projects</button>
          {activeProjectsInWindow.map(p=>(
            <button key={p.id} onClick={()=>setProjectFilter(p.id)}
              style={{padding:'3px 10px',borderRadius:20,fontSize:10,cursor:'pointer',
                border:projectFilter===p.id?'none':'1px solid #2a3050',
                background:projectFilter===p.id?p.color:'#181c27',
                color:projectFilter===p.id?'#fff':'#9aa3c2'}}>
              {p.job ? `${p.job} ${p.name}` : p.name}
            </button>
          ))}
        </div>
      )}

      {/* Search + week nav */}
      <div style={{display:'flex',gap:10,marginBottom:16,flexWrap:'wrap',alignItems:'center'}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name..."
          style={{background:'#1e2335',border:'1px solid #2a3050',color:'#e2e8ff',
            padding:'6px 12px',borderRadius:4,fontSize:12,width:180}} />
        <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:10}}>
          <button className="btn" onClick={()=>setWeekStart(w=>addDays(w,-7))}>← Prev</button>
          <div style={{fontSize:12,color:'#9aa3c2',textAlign:'center',minWidth:200}}>
            <strong style={{display:'block',fontSize:13,color:'#e2e8ff'}}>
              {fmtDisplay(days[0])} – {fmtDisplay(days[11])}
            </strong>
            <span>{days[0].toLocaleDateString('en-AU',{month:'short',year:'numeric'})}</span>
          </div>
          <button className="btn" onClick={()=>setWeekStart(w=>addDays(w,7))}>Next →</button>
          <button className="btn" onClick={()=>setWeekStart(getMondayOf(new Date()))}>Today</button>
        </div>
      </div>

      {/* Grid */}
      <div style={{overflowX:'auto',paddingBottom:10}}>
        <table style={{width:'100%',minWidth:900,borderCollapse:'collapse',tableLayout:'fixed'}}>
          <colgroup>
            <col style={{width:155}} />
            {week1Work.map((_,i)=><col key={i} />)}
            <col style={{width:26}} />
            {week2Work.map((_,i)=><col key={i} />)}
            <col style={{width:26}} />
          </colgroup>
          <thead id="grid-thead"><tr>
            <th style={thStyle}>Team Member</th>
            {week1Work.map((d,i)=>(
              <th key={i} style={thStyle}>
                <div style={{fontSize:11,color:'#e2e8ff',fontWeight:500}}>{DAY_SHORT[i]}</div>
                <div style={{fontSize:9,color:'#9aa3c2'}}>{fmtDisplay(d)}</div>
              </th>
            ))}
            <th data-weekend="1" style={{...thStyle,background:'#0d1018',opacity:.5,fontSize:8,color:'#5a6380',writingMode:'vertical-rl'}}>S/S</th>
            {week2Work.map((d,i)=>(
              <th key={i} style={thStyle}>
                <div style={{fontSize:11,color:'#e2e8ff',fontWeight:500}}>{DAY_SHORT[7+i]}</div>
                <div style={{fontSize:9,color:'#9aa3c2'}}>{fmtDisplay(d)}</div>
              </th>
            ))}
            <th data-weekend="1" style={{...thStyle,background:'#0d1018',opacity:.5,fontSize:8,color:'#5a6380',writingMode:'vertical-rl'}}>S/S</th>
          </tr></thead>
          <tbody>
            {allOffices.map(office=>{
              const members=officeGroups[office]; if(!members?.length) return null
              return[
                <tr key={`sec-${office}`}>
                  <td colSpan={13} style={{fontFamily:'Syne,sans-serif',fontSize:10,fontWeight:700,
                    letterSpacing:2,textTransform:'uppercase',padding:'6px 14px',
                    color:OFFICE_COLORS[office]||'#b87fff',background:'#181c27',
                    borderLeft:`3px solid ${OFFICE_COLORS[office]||'#b87fff'}`,
                    borderBottom:'1px solid #2a3050'}}>{office} Office</td>
                </tr>,
                ...members.map(m=>(
                  <MemberRow key={m.id} member={m}
                    week1Work={week1Work} week2Work={week2Work}
                    getActive={getActive} projects={projects} adminTasks={adminTasks}
                    setAssignModal={setAssignModal}
                    startResize={startResize} startCopy={startCopy}
                    adjustTaskDate={adjustTaskDate}
                    rowDragSrc={rowDragSrc} setRowDragSrc={setRowDragSrc}
                    onMoveRow={(dir)=>moveRow(m.id,m.office,dir)}
                    onRowDrop={()=>handleRowDrop(m.id,m.office)} />
                ))
              ]
            })}
          </tbody>
        </table>
      </div>

      {/* Leave & PH panels */}
      <SectionTitle title="🏖 Upcoming Leave" />
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:16}}>
        {['Brisbane','Chennai','Bangkok'].map(o=>(
          <LeavePanel key={o} office={o} color={OFFICE_COLORS[o]}
            items={leaveByOffice[o]||[]} onAdd={()=>setLeaveModal({office:o})}
            onEdit={item=>setLeaveModal(item)} onDelete={id=>deleteLeave(id)} />
        ))}
      </div>
      <SectionTitle title="🗓 Upcoming Public Holidays" />
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:16,marginBottom:40}}>
        {['Brisbane','Chennai','Bangkok'].map(o=>(
          <PHPanel key={o} office={o} color={OFFICE_COLORS[o]}
            items={phByOffice[o]||[]} onAdd={()=>setPhModal({office:o})}
            onEdit={item=>setPhModal(item)} onDelete={id=>deletePH(id)} />
        ))}
      </div>
    </div>
  )
}

const thStyle={background:'#1e2335',padding:'8px 5px',textAlign:'center',fontSize:10,color:'#9aa3c2',border:'1px solid #2a3050'}
const tdStyle={background:'#181c27',border:'1px solid #2a3050',verticalAlign:'top',cursor:'pointer',position:'relative'}

function StatCard({val,label,color}){
  return(
    <div style={{background:'#181c27',border:'1px solid #2a3050',borderRadius:6,
      padding:'11px 16px',minWidth:100,flex:1}}>
      <div style={{fontFamily:'Syne,sans-serif',fontSize:24,fontWeight:800,color}}>{val}</div>
      <div style={{fontSize:10,color:'#9aa3c2',marginTop:1}}>{label}</div>
    </div>
  )
}

function SectionTitle({title}){
  return(
    <div style={{fontFamily:'Syne,sans-serif',fontSize:12,fontWeight:700,letterSpacing:1.5,
      textTransform:'uppercase',color:'#9aa3c2',marginTop:28,marginBottom:10,
      display:'flex',alignItems:'center',gap:8}}>
      {title}<div style={{flex:1,height:1,background:'#2a3050'}} />
    </div>
  )
}

// ─── Member Row ───────────────────────────────────────────────────────
function MemberRow({member,week1Work,week2Work,getActive,projects,adminTasks,
  setAssignModal,startResize,startCopy,adjustTaskDate,rowDragSrc,setRowDragSrc,onMoveRow,onRowDrop}){
  const [hovered,setHovered]=useState(false)
  const isDragTarget=rowDragSrc&&rowDragSrc.id!==member.id&&rowDragSrc.office===member.office

  function renderWeek(workDays){
    const cells=[]; let i=0
    while(i<workDays.length){
      const d=workDays[i],ds=fmtDate(d)
      const active=getActive(member.name,ds)
      if(!active){
        cells.push(
          <td key={ds} onClick={()=>setAssignModal({name:member.name,dateStr:ds,entry:null})}
            style={{...tdStyle,minHeight:52}}
            onMouseEnter={e=>e.currentTarget.style.background='#232840'}
            onMouseLeave={e=>e.currentTarget.style.background='#181c27'}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'center',
              minHeight:52,color:'#5a6380',fontSize:10,padding:4}}>+ assign</div>
          </td>
        ); i++; continue
      }
      const {entry,startDs,isVirtual}=active
      let span=1,j=i+1
      while(j<workDays.length){
        const nA=getActive(member.name,fmtDate(workDays[j]))
        if(nA&&nA.startDs===startDs&&JSON.stringify(nA.entry)===JSON.stringify(entry)){span++;j++}else break
      }
      const color=['leave','ph'].includes(entry.wtype)?null:getProjectColor(entry.pid,projects,adminTasks)
      let bg='transparent',bc='#4f8ef7'
      if(entry.wtype==='leave'){bg='rgba(247,92,92,.13)';bc='#f75c5c'}
      else if(entry.wtype==='ph'){bg='rgba(247,162,79,.13)';bc='#f7a24f'}
      else if(entry.wtype==='admin'){bg='rgba(90,99,128,.13)';bc='#5a6380'}
      else if(color){const {r,g,b}=hexToRgb(color);bg=`rgba(${r},${g},${b},.18)`;bc=color}
      const nc=entry.wtype==='leave'?'#f75c5c':entry.wtype==='ph'?'#f7a24f':entry.wtype==='admin'?'#9aa3c2':'#e2e8ff'

      cells.push(
        <td key={ds} colSpan={span}
          onClick={()=>!isVirtual&&setAssignModal({name:member.name,dateStr:startDs,entry})}
          style={{...tdStyle,cursor:isVirtual?'default':'pointer',background:bg,borderLeft:`3px solid ${bc}`}}>
          <div style={{padding:'4px 6px',display:'flex',alignItems:'flex-start',gap:3,minHeight:52}}>
            {/* Left arrow: shrink/extend start */}
            {!isVirtual&&(
              <div style={{display:'flex',flexDirection:'column',gap:1,flexShrink:0,paddingTop:2}}>
                <button title="Move start earlier" onMouseDown={e=>e.stopPropagation()}
                  onClick={e=>{e.stopPropagation();adjustTaskDate(member.name,startDs,'start',-1)}}
                  style={{background:'none',border:'none',cursor:'pointer',color:'rgba(255,255,255,.35)',
                    fontSize:9,padding:'1px 2px',lineHeight:1,borderRadius:2}}>◀</button>
                <button title="Move start later" onMouseDown={e=>e.stopPropagation()}
                  onClick={e=>{e.stopPropagation();adjustTaskDate(member.name,startDs,'start',1)}}
                  style={{background:'none',border:'none',cursor:'pointer',color:'rgba(255,255,255,.35)',
                    fontSize:9,padding:'1px 2px',lineHeight:1,borderRadius:2}}>▶</button>
              </div>
            )}
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:10,fontWeight:500,color:nc,wordBreak:'break-word',lineHeight:1.3}}>{entry.task}</div>
              {entry.notes&&<div style={{fontSize:9,color:'#9aa3c2',marginTop:2,wordBreak:'break-word',lineHeight:1.3}}>{entry.notes}</div>}
              {entry.wtype&&!['leave','ph','admin'].includes(entry.wtype)&&(
                <div style={{fontSize:9,color:'#9aa3c2',fontStyle:'italic',marginTop:1}}>{entry.wtype}</div>
              )}
            </div>
            {!isVirtual&&(
              <div style={{display:'flex',flexDirection:'column',gap:1,flexShrink:0,paddingTop:2}}>
                <button title="Copy to another person" onMouseDown={e=>{e.stopPropagation();startCopy(e,member.name,startDs)}}
                  style={{background:'none',border:'none',cursor:'grab',color:'rgba(255,255,255,.35)',
                    fontSize:10,padding:'1px 2px',lineHeight:1}}>⊕</button>
                <button title="Move end earlier" onMouseDown={e=>e.stopPropagation()}
                  onClick={e=>{e.stopPropagation();adjustTaskDate(member.name,startDs,'end',-1)}}
                  style={{background:'none',border:'none',cursor:'pointer',color:'rgba(255,255,255,.35)',
                    fontSize:9,padding:'1px 2px',lineHeight:1,borderRadius:2}}>◀</button>
                <button title="Move end later" onMouseDown={e=>e.stopPropagation()}
                  onClick={e=>{e.stopPropagation();adjustTaskDate(member.name,startDs,'end',1)}}
                  style={{background:'none',border:'none',cursor:'pointer',color:'rgba(255,255,255,.35)',
                    fontSize:9,padding:'1px 2px',lineHeight:1,borderRadius:2}}>▶</button>
              </div>
            )}
          </div>
        </td>
      )
      i=j
    }
    return cells
  }

  return(
    <tr data-member-row={member.name}
      draggable onDragStart={()=>setRowDragSrc({id:member.id,office:member.office})}
      onDragOver={e=>e.preventDefault()} onDrop={onRowDrop}
      style={{outline:isDragTarget?'1px dashed #4f8ef7':'none'}}
      onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)}>
      <td style={{background:'#1e2335',border:'1px solid #2a3050',padding:'6px 8px 6px 12px',verticalAlign:'middle'}}>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <span style={{cursor:'grab',color:'#5a6380',fontSize:12,opacity:hovered?1:0,transition:'opacity .15s',userSelect:'none'}}>⠿</span>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:11,fontWeight:500,color:'#e2e8ff',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{member.name}</div>
            <div style={{fontSize:9,color:'#9aa3c2'}}>{member.role}</div>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:1,opacity:hovered?1:0,transition:'opacity .15s'}}>
            <button onClick={()=>onMoveRow(-1)} style={{background:'none',border:'none',cursor:'pointer',color:'#9aa3c2',padding:'1px 3px',fontSize:10,lineHeight:1}}>▲</button>
            <button onClick={()=>onMoveRow(1)} style={{background:'none',border:'none',cursor:'pointer',color:'#9aa3c2',padding:'1px 3px',fontSize:10,lineHeight:1}}>▼</button>
          </div>
        </div>
      </td>
      {renderWeek(week1Work)}
      <td style={{background:'#0a0d14',border:'1px solid #2a3050',width:26}} />
      {renderWeek(week2Work)}
      <td style={{background:'#0a0d14',border:'1px solid #2a3050',width:26}} />
    </tr>
  )
}

// ─── Leave & PH Panels ────────────────────────────────────────────────
function LeavePanel({office,color,items,onAdd,onEdit,onDelete}){
  return(
    <div style={{background:'#181c27',border:'1px solid #2a3050',borderRadius:6,padding:14}}>
      <div style={{fontFamily:'Syne,sans-serif',fontSize:11,fontWeight:700,letterSpacing:1.5,
        textTransform:'uppercase',color,marginBottom:10,display:'flex',alignItems:'center',gap:8}}>
        <span style={{width:7,height:7,borderRadius:'50%',background:color,display:'inline-block'}} />
        {office}
        <button onClick={onAdd} style={{marginLeft:'auto',background:'#1e2335',border:'1px solid #2a3050',
          color:'#9aa3c2',padding:'2px 8px',borderRadius:3,cursor:'pointer',fontSize:14}}>+</button>
      </div>
      {items.length===0&&<div style={{fontSize:11,color:'#5a6380'}}>No upcoming leave</div>}
      {items.map(l=>(
        <div key={l.id} style={{display:'flex',alignItems:'center',padding:'5px 0',
          borderBottom:'1px solid #2a3050',fontSize:11,gap:6}}>
          <span style={{color:'#e2e8ff',flex:1}}>{l.name}</span>
          <span style={{color:'#9aa3c2',fontSize:10}}>
            {l.start_date?fmtLeaveDate(l.start_date):''} – {l.end_date?fmtLeaveDate(l.end_date):''}
          </span>
          <button onClick={()=>onEdit(l)} style={{background:'none',border:'none',cursor:'pointer',color:'#9aa3c2',padding:'2px 4px'}}>✏️</button>
          <button onClick={()=>onDelete(l.id)} style={{background:'none',border:'none',cursor:'pointer',color:'#f75c5c',padding:'2px 4px',fontSize:13}}>✕</button>
        </div>
      ))}
    </div>
  )
}

function PHPanel({office,color,items,onAdd,onEdit,onDelete}){
  return(
    <div style={{background:'#181c27',border:'1px solid rgba(247,162,79,.2)',borderRadius:6,padding:14}}>
      <div style={{fontFamily:'Syne,sans-serif',fontSize:11,fontWeight:700,letterSpacing:1.5,
        textTransform:'uppercase',color,marginBottom:10,display:'flex',alignItems:'center',gap:8}}>
        <span style={{width:7,height:7,borderRadius:'50%',background:color,display:'inline-block'}} />
        {office}
        <button onClick={onAdd} style={{marginLeft:'auto',background:'#1e2335',border:'1px solid #2a3050',
          color:'#9aa3c2',padding:'2px 8px',borderRadius:3,cursor:'pointer',fontSize:14}}>+</button>
      </div>
      {items.length===0&&<div style={{fontSize:11,color:'#5a6380'}}>No upcoming public holidays</div>}
      {items.map(p=>(
        <div key={p.id} style={{display:'flex',alignItems:'center',padding:'5px 0',
          borderBottom:'1px solid #2a3050',fontSize:11,gap:6}}>
          <span style={{color:'#9aa3c2',flex:1}}>📅 {p.name}</span>
          <span style={{color:'#9aa3c2',fontSize:10}}>{p.iso_date?fmtPHDate(p.iso_date):p.display_date}</span>
          <button onClick={()=>onEdit(p)} style={{background:'none',border:'none',cursor:'pointer',color:'#9aa3c2',padding:'2px 4px'}}>✏️</button>
          <button onClick={()=>onDelete(p.id)} style={{background:'none',border:'none',cursor:'pointer',color:'#f75c5c',padding:'2px 4px',fontSize:13}}>✕</button>
        </div>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// PROJECTS TAB  (with sort)
// ═══════════════════════════════════════════════════════════════════
function ProjectsTab({projects,adminTasks,setProjectModal,setAdminTaskModal}){
  const [pSort,setPSort]=useState({col:'job',dir:1})
  const [aSort,setASort]=useState({col:'name',dir:1})

  function sortToggle(current,col,set){
    if(current.col===col) set({col,dir:-current.dir})
    else set({col,dir:1})
  }
  const sortedProj=[...projects].sort((a,b)=>{
    const av=(a[pSort.col]||'').toLowerCase(),bv=(b[pSort.col]||'').toLowerCase()
    return av<bv?-pSort.dir:av>bv?pSort.dir:0
  })
  const sortedAdmin=[...adminTasks].sort((a,b)=>{
    const av=(a[aSort.col]||'').toLowerCase(),bv=(b[aSort.col]||'').toLowerCase()
    return av<bv?-aSort.dir:av>bv?aSort.dir:0
  })
  const SH=({col,sort,onToggle,children})=>(
    <th style={{...adminTh,cursor:'pointer',userSelect:'none'}} onClick={()=>onToggle(col)}>
      {children}{sort.col===col?(sort.dir===1?' ↑':' ↓'):''}
    </th>
  )
  return(
    <div>
      <AdminSection title="🏗 Active Projects" onAdd={()=>setProjectModal({})}>
        <table style={adminTableStyle}><thead><tr>
          <th style={adminTh}>Colour</th>
          <SH col="job" sort={pSort} onToggle={c=>sortToggle(pSort,c,setPSort)}>Job #</SH>
          <SH col="name" sort={pSort} onToggle={c=>sortToggle(pSort,c,setPSort)}>Project Name</SH>
          <SH col="status" sort={pSort} onToggle={c=>sortToggle(pSort,c,setPSort)}>Status</SH>
          <th style={adminTh}>Actions</th>
        </tr></thead><tbody>
          {sortedProj.map(p=>(
            <tr key={p.id} style={{borderBottom:'1px solid #2a3050'}}>
              <td style={adminTd}><span style={{width:12,height:12,borderRadius:'50%',background:p.color,display:'inline-block'}} /></td>
              <td style={adminTd}>{p.job}</td><td style={adminTd}>{p.name}</td>
              <td style={adminTd}><StatusBadge s={p.status} /></td>
              <td style={adminTd}>
                <button onClick={()=>setProjectModal(p)} style={iconBtn}>✏️</button>
                <button onClick={async()=>await supabase.from('projects').delete().eq('id',p.id)} style={{...iconBtn,color:'#f75c5c'}}>✕</button>
              </td>
            </tr>
          ))}
        </tbody></table>
      </AdminSection>
      <AdminSection title="⚙️ Admin & Recurring Tasks" onAdd={()=>setAdminTaskModal({})}>
        <table style={adminTableStyle}><thead><tr>
          <th style={adminTh}>Colour</th>
          <SH col="name" sort={aSort} onToggle={c=>sortToggle(aSort,c,setASort)}>Task Name</SH>
          <SH col="cat" sort={aSort} onToggle={c=>sortToggle(aSort,c,setASort)}>Category</SH>
          <th style={adminTh}>Actions</th>
        </tr></thead><tbody>
          {sortedAdmin.map(a=>(
            <tr key={a.id} style={{borderBottom:'1px solid #2a3050'}}>
              <td style={adminTd}><span style={{width:12,height:12,borderRadius:'50%',background:a.color,display:'inline-block'}} /></td>
              <td style={adminTd}>{a.name}</td><td style={adminTd}>{a.cat}</td>
              <td style={adminTd}>
                <button onClick={()=>setAdminTaskModal(a)} style={iconBtn}>✏️</button>
                <button onClick={async()=>await supabase.from('admin_tasks').delete().eq('id',a.id)} style={{...iconBtn,color:'#f75c5c'}}>✕</button>
              </td>
            </tr>
          ))}
        </tbody></table>
      </AdminSection>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// TEAM TAB (with sort)
// ═══════════════════════════════════════════════════════════════════
function TeamTab({teamMembers,setTeamMembers,setMemberModal}){
  const [sort,setSort]=useState({col:'office',dir:1})
  function toggle(col){ setSort(s=>s.col===col?{col,dir:-s.dir}:{col,dir:1}) }
  const sorted=[...teamMembers].sort((a,b)=>{
    const av=(col==='sort_order'?a.sort_order:(a[sort.col]||'')).toString().toLowerCase()
    const bv=(col==='sort_order'?b.sort_order:(b[sort.col]||'')).toString().toLowerCase()
    return av<bv?-sort.dir:av>bv?sort.dir:0
  })
  const SH=({col,children})=>(
    <th style={{...adminTh,cursor:'pointer',userSelect:'none'}} onClick={()=>toggle(col)}>
      {children}{sort.col===col?(sort.dir===1?' ↑':' ↓'):''}
    </th>
  )
  return(
    <AdminSection title="👥 Team Members" onAdd={()=>setMemberModal({})}>
      <table style={adminTableStyle}><thead><tr>
        <SH col="name">Name</SH><SH col="role">Role</SH>
        <SH col="office">Office</SH><SH col="sort_order">Order</SH>
        <th style={adminTh}>Actions</th>
      </tr></thead><tbody>
        {sorted.map((m,i)=>(
          <tr key={m.id} style={{borderBottom:'1px solid #2a3050'}}>
            <td style={adminTd}><strong>{m.name}</strong></td>
            <td style={adminTd}>{m.role}</td>
            <td style={adminTd}><span style={{padding:'2px 8px',borderRadius:10,fontSize:10,
              border:`1px solid ${getOfficeColor(m.office)}`,color:getOfficeColor(m.office)}}>{m.office}</span></td>
            <td style={{...adminTd,color:'#5a6380',fontSize:11}}>{m.sort_order}</td>
            <td style={adminTd}>
              <button onClick={()=>setMemberModal(m)} style={iconBtn}>✏️</button>
              <button onClick={async()=>{
                await supabase.from('team_members').delete().eq('id',m.id)
                const r=await supabase.from('team_members').select('*').order('office').order('sort_order')
                setTeamMembers(r.data||[])
              }} style={{...iconBtn,color:'#f75c5c'}}>✕</button>
            </td>
          </tr>
        ))}
      </tbody></table>
    </AdminSection>
  )
}

function StatusBadge({s}){
  const map={active:['rgba(79,247,162,.12)','#4ff7a2','rgba(79,247,162,.3)'],
    completed:['rgba(90,99,128,.15)','#5a6380','#2a3050'],
    onhold:['rgba(247,162,79,.12)','#f7a24f','rgba(247,162,79,.3)']}
  const [bg,color,border]=map[s]||map.active
  return<span style={{padding:'2px 8px',borderRadius:10,fontSize:10,background:bg,color,border:`1px solid ${border}`}}>{s}</span>
}

function AdminSection({title,onAdd,children}){
  return(
    <div style={{background:'#181c27',border:'1px solid #2a3050',borderRadius:6,marginBottom:16,overflow:'hidden'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',
        padding:'12px 16px',background:'#1e2335',borderBottom:'1px solid #2a3050'}}>
        <div style={{fontFamily:'Syne,sans-serif',fontSize:13,fontWeight:700}}>{title}</div>
        <button onClick={onAdd} style={{background:'#4f8ef7',border:'none',color:'#fff',
          padding:'4px 12px',borderRadius:4,cursor:'pointer',fontSize:12}}>+ Add</button>
      </div>
      {children}
    </div>
  )
}

const adminTableStyle={width:'100%',borderCollapse:'collapse',fontSize:12}
const adminTh={textAlign:'left',padding:'8px 14px',fontSize:10,color:'#9aa3c2',fontWeight:500,borderBottom:'1px solid #2a3050',background:'#1e2335'}
const adminTd={padding:'8px 14px',verticalAlign:'middle'}
const iconBtn={background:'none',border:'none',cursor:'pointer',color:'#9aa3c2',padding:'2px 6px',fontSize:13}

// ═══════════════════════════════════════════════════════════════════
// MODALS
// ═══════════════════════════════════════════════════════════════════
function AssignModal({modal,onClose,projects,adminTasks,onSave,onClear,showToast}){
  const {name,dateStr,entry}=modal
  const [pid,setPid]=useState(()=>{
    if(!entry) return ''
    if(entry.task==='Annual Leave') return '__annual_leave__'
    if(entry.task==='Sick Leave') return '__sick_leave__'
    if(!entry.pid&&entry.task) return '__custom__'
    return entry.pid||''
  })
  const [customTask,setCustomTask]=useState(entry&&!entry.pid&&entry.task&&entry.task!=='Annual Leave'&&entry.task!=='Sick Leave'?entry.task:'')
  const [wtype,setWtype]=useState(entry?.wtype||'modelling')
  const [endDate,setEndDate]=useState(entry?.end_date||dateStr)
  const [notes,setNotes]=useState(entry?.notes||'')
  const isLeave=pid==='__annual_leave__'||pid==='__sick_leave__'
  const d=parseLocalDate(dateStr)
  async function save(){
    let label='',fw=wtype
    if(pid==='__annual_leave__'){label='Annual Leave';fw='leave'}
    else if(pid==='__sick_leave__'){label='Sick Leave';fw='leave'}
    else if(pid==='__custom__'){label=customTask.trim();if(!label){showToast('Enter a task description');return}}
    else if(pid){label=getProjectLabel(pid,projects,adminTasks)}
    else{label=customTask.trim()||wtype}
    await onSave(name,dateStr,isLeave?'':pid,label,fw,endDate,notes); onClose()
  }
  return(
    <Modal open onClose={onClose}>
      <h3 style={modalH3}>{name}</h3>
      <div style={{fontSize:11,color:'#5a6380',marginBottom:18}}>
        {d.toLocaleDateString('en-AU',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}
      </div>
      <label style={I.label}>Project / Task</label>
      <select value={pid} onChange={e=>setPid(e.target.value)} style={I.base}>
        <option value="">— select —</option>
        <optgroup label="Leave">
          <option value="__annual_leave__">Annual Leave</option>
          <option value="__sick_leave__">Sick Leave</option>
        </optgroup>
        {projects.filter(p=>p.status==='active').length>0&&<optgroup label="Active Projects">
          {projects.filter(p=>p.status==='active').map(p=><option key={p.id} value={p.id}>{p.job} — {p.name}</option>)}
        </optgroup>}
        {adminTasks.length>0&&<optgroup label="Admin & Recurring">
          {adminTasks.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
        </optgroup>}
        <option value="__custom__">✏️ Custom…</option>
      </select>
      {pid==='__custom__'&&<input value={customTask} onChange={e=>setCustomTask(e.target.value)}
        placeholder="Task description…" style={{...I.base,marginTop:6}} />}
      {isLeave&&<div style={{fontSize:10,color:'#f75c5c',marginTop:6,padding:'4px 8px',
        background:'rgba(247,92,92,.1)',borderRadius:4}}>Work type set automatically to Leave</div>}
      <div style={{...I.row,marginTop:13,opacity:isLeave?.5:1}}>
        <div><label style={I.label}>Work Type</label>
          <select value={wtype} onChange={e=>setWtype(e.target.value)} style={I.base} disabled={isLeave}>
            <option value="modelling">Modelling</option><option value="editing">Editing</option>
            <option value="checking">Checking</option><option value="admin">Admin / Management</option>
            <option value="leave">Leave / AL</option><option value="ph">Public Holiday</option>
            <option value="other">Other</option>
          </select></div>
        <div><label style={I.label}>End Date</label>
          <input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)} style={I.base} /></div>
      </div>
      <label style={I.label}>Notes</label>
      <textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Optional notes…"
        style={{...I.base,resize:'vertical',minHeight:50}} />
      <div style={{display:'flex',gap:8,marginTop:18,justifyContent:'flex-end'}}>
        {entry&&<button onClick={async()=>{await onClear(name,dateStr);onClose()}}
          style={{...btnBase,borderColor:'#f75c5c',color:'#f75c5c'}}>Clear</button>}
        <button onClick={onClose} style={btnBase}>Cancel</button>
        <button onClick={save} style={{...btnBase,background:'#4f8ef7',borderColor:'#4f8ef7',color:'#fff'}}>Save</button>
      </div>
    </Modal>
  )
}

function ProjectModal({item,onClose,onSave,projects,adminTasks}){
  const [job,setJob]=useState(item?.job||'')
  const [name,setName]=useState(item?.name||'')
  const [status,setStatus]=useState(item?.status||'active')
  const [color,setColor]=useState(item?.color||nextAutoColor(projects,adminTasks))
  return(
    <Modal open onClose={onClose}>
      <h3 style={modalH3}>{item?.id?'Edit Project':'Add Project'}</h3>
      <label style={I.label}>Job #</label>
      <input value={job} onChange={e=>setJob(e.target.value)} placeholder="e.g. 23-081" style={I.base} />
      <label style={I.label}>Project Name</label>
      <input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Waterfront" style={I.base} />
      <label style={I.label}>Status</label>
      <select value={status} onChange={e=>setStatus(e.target.value)} style={I.base}>
        <option value="active">Active</option><option value="onhold">On Hold</option><option value="completed">Completed</option>
      </select>
      <label style={I.label}>Colour</label>
      <div style={{display:'flex',alignItems:'center',gap:10,marginTop:4}}>
        <input type="color" value={color} onChange={e=>setColor(e.target.value)}
          style={{height:36,padding:'2px 4px',width:60,background:'#1e2335',border:'1px solid #2a3050',borderRadius:4}} />
        <span style={{fontSize:11,color:'#9aa3c2'}}>{color} (auto-assigned, change if needed)</span>
      </div>
      <div style={{display:'flex',gap:8,marginTop:18,justifyContent:'flex-end'}}>
        <button onClick={onClose} style={btnBase}>Cancel</button>
        <button onClick={()=>onSave({...item,job,name,status,color})}
          style={{...btnBase,background:'#4f8ef7',borderColor:'#4f8ef7',color:'#fff'}}>Save</button>
      </div>
    </Modal>
  )
}

function AdminTaskModal({item,onClose,onSave,projects,adminTasks}){
  const [name,setName]=useState(item?.name||'')
  const [cat,setCat]=useState(item?.cat||'admin')
  const [color,setColor]=useState(item?.color||nextAutoColor(projects,adminTasks))
  return(
    <Modal open onClose={onClose}>
      <h3 style={modalH3}>{item?.id?'Edit Task':'Add Admin Task'}</h3>
      <label style={I.label}>Task Name</label>
      <input value={name} onChange={e=>setName(e.target.value)} style={I.base} />
      <label style={I.label}>Category</label>
      <select value={cat} onChange={e=>setCat(e.target.value)} style={I.base}>
        <option value="admin">Admin</option><option value="training">Training</option>
        <option value="internal">Internal</option><option value="other">Other</option>
      </select>
      <label style={I.label}>Colour</label>
      <div style={{display:'flex',alignItems:'center',gap:10,marginTop:4}}>
        <input type="color" value={color} onChange={e=>setColor(e.target.value)}
          style={{height:36,padding:'2px 4px',width:60,background:'#1e2335',border:'1px solid #2a3050',borderRadius:4}} />
        <span style={{fontSize:11,color:'#9aa3c2'}}>{color}</span>
      </div>
      <div style={{display:'flex',gap:8,marginTop:18,justifyContent:'flex-end'}}>
        <button onClick={onClose} style={btnBase}>Cancel</button>
        <button onClick={()=>onSave({...item,name,cat,color})}
          style={{...btnBase,background:'#4f8ef7',borderColor:'#4f8ef7',color:'#fff'}}>Save</button>
      </div>
    </Modal>
  )
}

function MemberModal({item,onClose,onSave,teamMembers}){
  const [name,setName]=useState(item?.name||'')
  const [role,setRole]=useState(item?.role||'')
  const [office,setOffice]=useState(item?.office||'Brisbane')
  const [customOffice,setCustomOffice]=useState('')
  const known=['Brisbane','Chennai','Bangkok']
  const custom=[...new Set((teamMembers||[]).map(m=>m.office).filter(o=>!known.includes(o)))]
  return(
    <Modal open onClose={onClose}>
      <h3 style={modalH3}>{item?.id?'Edit Member':'Add Member'}</h3>
      <label style={I.label}>Name</label>
      <input value={name} onChange={e=>setName(e.target.value)} placeholder="Full name" style={I.base} />
      <label style={I.label}>Role</label>
      <input value={role} onChange={e=>setRole(e.target.value)} placeholder="e.g. 3D Modeller" style={I.base} />
      <label style={I.label}>Office</label>
      <select value={office} onChange={e=>setOffice(e.target.value)} style={I.base}>
        {[...known,...custom].map(o=><option key={o}>{o}</option>)}
        <option value="__other__">Other (specify)…</option>
      </select>
      {office==='__other__'&&<input value={customOffice} onChange={e=>setCustomOffice(e.target.value)}
        placeholder="Office name…" style={{...I.base,marginTop:6}} />}
      <div style={{display:'flex',gap:8,marginTop:18,justifyContent:'flex-end'}}>
        <button onClick={onClose} style={btnBase}>Cancel</button>
        <button onClick={()=>{
          const fo=office==='__other__'?customOffice.trim():office
          if(!name||!fo) return
          onSave({...item,name,role,office:fo,sort_order:item?.sort_order||99})
        }} style={{...btnBase,background:'#4f8ef7',borderColor:'#4f8ef7',color:'#fff'}}>Save</button>
      </div>
    </Modal>
  )
}

function LeaveModal({item,onClose,onSave,teamMembers,showToast}){
  const [office,setOffice]=useState(item?.office||'Brisbane')
  const [name,setName]=useState(item?.name||'')
  const [startDate,setStartDate]=useState(item?.start_date||'')
  const [endDate,setEndDate]=useState(item?.end_date||'')
  const [dates,setDates]=useState(item?.dates||'')
  const members=teamMembers.filter(m=>m.office===office)
  return(
    <Modal open onClose={onClose}>
      <h3 style={modalH3}>{item?.id?'Edit Leave':'Add Leave'}</h3>
      <label style={I.label}>Office</label>
      <select value={office} onChange={e=>{setOffice(e.target.value);setName('')}} style={I.base}>
        {['Brisbane','Chennai','Bangkok'].map(o=><option key={o}>{o}</option>)}
      </select>
      <label style={I.label}>Person</label>
      <select value={name} onChange={e=>setName(e.target.value)} style={I.base}>
        <option value="">— select —</option>
        {members.map(m=><option key={m.id} value={m.name}>{m.name}</option>)}
      </select>
      <div style={I.row}>
        <div><label style={I.label}>Start Date</label>
          <input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} style={I.base} /></div>
        <div><label style={I.label}>End Date</label>
          <input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)} style={I.base} /></div>
      </div>
      <label style={I.label}>Display Label (auto if blank)</label>
      <input value={dates} onChange={e=>setDates(e.target.value)} placeholder="e.g. 05 May – 18 May" style={I.base} />
      <div style={{display:'flex',gap:8,marginTop:18,justifyContent:'flex-end'}}>
        <button onClick={onClose} style={btnBase}>Cancel</button>
        <button onClick={()=>{
          if(!name||!startDate||!endDate){showToast('Name and dates required');return}
          let d=dates
          if(!d){
            const s=parseLocalDate(startDate),e=parseLocalDate(endDate)
            const n=Math.round((e-s)/86400000)+1
            d=`${fmtLeaveDate(startDate)} – ${fmtLeaveDate(endDate)}${n>1?' ('+n+' days)':''}`
          }
          onSave({...item,office,name,start_date:startDate,end_date:endDate,dates:d})
        }} style={{...btnBase,background:'#4f8ef7',borderColor:'#4f8ef7',color:'#fff'}}>Save</button>
      </div>
    </Modal>
  )
}

function PHModal({item,onClose,onSave,showToast}){
  const [office,setOffice]=useState(item?.office||'Brisbane')
  const [name,setName]=useState(item?.name||'')
  const [isoDate,setIsoDate]=useState(item?.iso_date||'')
  const [endIsoDate,setEndIsoDate]=useState(item?.end_iso_date||'')
  return(
    <Modal open onClose={onClose}>
      <h3 style={modalH3}>{item?.id?'Edit Public Holiday':'Add Public Holiday'}</h3>
      <label style={I.label}>Office</label>
      <select value={office} onChange={e=>setOffice(e.target.value)} style={I.base}>
        {['Brisbane','Chennai','Bangkok'].map(o=><option key={o}>{o}</option>)}
      </select>
      <label style={I.label}>Holiday Name</label>
      <input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Labour Day" style={I.base} />
      <div style={I.row}>
        <div><label style={I.label}>Date</label>
          <input type="date" value={isoDate} onChange={e=>setIsoDate(e.target.value)} style={I.base} /></div>
        <div><label style={I.label}>End Date (optional)</label>
          <input type="date" value={endIsoDate} onChange={e=>setEndIsoDate(e.target.value)} style={I.base} /></div>
      </div>
      {isoDate&&<div style={{fontSize:11,color:'#f7a24f',marginTop:8}}>
        Preview: {fmtPHDate(isoDate)}{endIsoDate&&endIsoDate!==isoDate?` – ${fmtPHDate(endIsoDate)}`:''}
      </div>}
      <div style={{display:'flex',gap:8,marginTop:18,justifyContent:'flex-end'}}>
        <button onClick={onClose} style={btnBase}>Cancel</button>
        <button onClick={()=>{
          if(!name||!isoDate){showToast('Name and date required');return}
          const display=endIsoDate&&endIsoDate!==isoDate
            ?`${fmtPHDate(isoDate)} – ${fmtPHDate(endIsoDate)}`:fmtPHDate(isoDate)
          onSave({...item,office,name,iso_date:isoDate,end_iso_date:endIsoDate||null,display_date:display})
        }} style={{...btnBase,background:'#4f8ef7',borderColor:'#4f8ef7',color:'#fff'}}>Save</button>
      </div>
    </Modal>
  )
}
