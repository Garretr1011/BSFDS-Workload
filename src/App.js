import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from './lib/supabase'
import {
  fmtDate, fmtDisplay, fmtLeaveDate, fmtPHDate, parseLocalDate,
  addDays, isWeekend, getMondayOf, getWeekDays, DAY_SHORT,
  getActiveTask, buildTasksMap, buildLeaveMap, buildPHMap,
  getProjectColor, getProjectLabel, nextAutoColor,
  hexToRgb, getOfficeColor, CORE_OFFICES, OFFICE_COLORS
} from './lib/helpers'

// ── Country flag images (flagcdn.com renders on all platforms incl. Windows) ──
const FLAG_CODES = { Brisbane:'au', Chennai:'in', Bangkok:'th' }
function OfficeFlag({ office, size=16 }) {
  const code = FLAG_CODES[office]
  if (!code) return null
  return <img src={`https://flagcdn.com/w40/${code}.png`} alt={office}
    style={{width:size,height:'auto',borderRadius:2,verticalAlign:'middle',flexShrink:0}} />
}

// ── Toast ─────────────────────────────────────────────────────────────
function Toast({ msg, onDone }) {
  useEffect(()=>{ const t=setTimeout(onDone,3000); return ()=>clearTimeout(t) },[onDone])
  return <div style={{position:'fixed',bottom:24,left:'50%',transform:'translateX(-50%)',
    background:'rgba(247,92,92,.95)',color:'#fff',padding:'10px 20px',borderRadius:6,
    fontSize:13,zIndex:9999,fontFamily:'DM Mono,monospace',pointerEvents:'none'}}>{msg}</div>
}

// ── Drag Ghost ────────────────────────────────────────────────────────
function DragGhost({ x, y, text, isCopy }) {
  if (!text) return null
  return <div style={{position:'fixed',left:x+14,top:y-16,pointerEvents:'none',zIndex:999,
    background:isCopy?'rgba(79,247,162,.2)':'rgba(79,142,247,.25)',
    border:`2px dashed ${isCopy?'#4ff7a2':'#4f8ef7'}`,
    borderRadius:4,padding:'4px 10px',fontSize:11,
    color:isCopy?'#4ff7a2':'#4f8ef7',whiteSpace:'nowrap'}}>{text}</div>
}

// ── Modal ─────────────────────────────────────────────────────────────
function Modal({ open, onClose, children, width }) {
  if (!open) return null
  return (
    <div onMouseDown={e=>e.target===e.currentTarget&&onClose()}
      style={{position:'fixed',inset:0,background:'rgba(0,0,0,.78)',zIndex:200,
        display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div onMouseDown={e=>e.stopPropagation()}
        style={{background:'#181c27',border:'1px solid #2a3050',borderRadius:10,
          width:width||480,maxWidth:'95vw',padding:24,
          boxShadow:'0 24px 70px rgba(0,0,0,.6)',
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

// ─────────────────────────────────────────────────────────────────────
// Full undo/redo snapshot — covers ALL tables
// ─────────────────────────────────────────────────────────────────────
async function takeSnapshot() {
  const [ta,ul,ph,pr,at,tm] = await Promise.all([
    supabase.from('task_assignments').select('*'),
    supabase.from('upcoming_leave').select('*'),
    supabase.from('public_holidays').select('*'),
    supabase.from('projects').select('*'),
    supabase.from('admin_tasks').select('*'),
    supabase.from('team_members').select('*'),
  ])
  return {
    assignments: ta.data||[],
    leave: ul.data||[],
    ph: ph.data||[],
    projects: pr.data||[],
    adminTasks: at.data||[],
    teamMembers: tm.data||[],
  }
}

async function restoreSnapshot(snap, setters) {
  const { setAssignments,setUpcomingLeaveRows,setPublicHolidayRows,
    setProjects,setAdminTasks,setTeamMembers } = setters

  // Restore task_assignments
  await supabase.from('task_assignments').delete().neq('id','00000000-0000-0000-0000-000000000000')
  if (snap.assignments.length>0) await supabase.from('task_assignments').insert(
    snap.assignments.map(a=>({...a,updated_at:new Date().toISOString()})))

  // Restore upcoming_leave
  await supabase.from('upcoming_leave').delete().neq('id','_none_')
  if (snap.leave.length>0) await supabase.from('upcoming_leave').insert(snap.leave)

  // Restore public_holidays
  await supabase.from('public_holidays').delete().neq('id','_none_')
  if (snap.ph.length>0) await supabase.from('public_holidays').insert(snap.ph)

  // Restore projects
  await supabase.from('projects').delete().neq('id','_none_')
  if (snap.projects.length>0) await supabase.from('projects').insert(snap.projects)

  // Restore admin_tasks
  await supabase.from('admin_tasks').delete().neq('id','_none_')
  if (snap.adminTasks.length>0) await supabase.from('admin_tasks').insert(snap.adminTasks)

  // Restore team_members
  await supabase.from('team_members').delete().neq('id','00000000-0000-0000-0000-000000000000')
  if (snap.teamMembers.length>0) await supabase.from('team_members').insert(snap.teamMembers)

  // Refresh local state
  const [ta,ul,ph,pr,at,tm] = await Promise.all([
    supabase.from('task_assignments').select('*'),
    supabase.from('upcoming_leave').select('*'),
    supabase.from('public_holidays').select('*').order('iso_date'),
    supabase.from('projects').select('*').order('job'),
    supabase.from('admin_tasks').select('*').order('name'),
    supabase.from('team_members').select('*').order('office').order('sort_order'),
  ])
  setAssignments(ta.data||[])
  setUpcomingLeaveRows(ul.data||[])
  setPublicHolidayRows(ph.data||[])
  setProjects(pr.data||[])
  setAdminTasks(at.data||[])
  setTeamMembers(tm.data||[])
}

// ═════════════════════════════════════════════════════════════════════
// MAIN APP
// ═════════════════════════════════════════════════════════════════════
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
  const [leaveFilter, setLeaveFilter] = useState(false)       // filter to on-leave members only
  const [unassignedFilter, setUnassignedFilter] = useState(false) // filter to unassigned members only
  const [search, setSearch] = useState('')
  const [gridWeeks, setGridWeeks] = useState(2)   // grid view duration: 2, 3 or 4
  const [statWeeks, setStatWeeks] = useState(2)
  const [leaveStatWeeks, setLeaveStatWeeks] = useState(1)

  const [assignModal, setAssignModal] = useState(null)
  const [projectModal, setProjectModal] = useState(null)
  const [adminTaskModal, setAdminTaskModal] = useState(null)
  const [memberModal, setMemberModal] = useState(null)
  const [leaveModal, setLeaveModal] = useState(null)
  const [phModal, setPhModal] = useState(null)

  const [dragGhost, setDragGhost] = useState(null)
  const dragState = useRef(null)      // resize drag
  const copyDragState = useRef(null)  // copy drag

  // Undo / Redo stacks — each entry is a full DB snapshot
  const undoStack = useRef([])
  const redoStack = useRef([])
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  const showToast = useCallback(msg=>setToast(msg),[])

  const setters = { setAssignments,setUpcomingLeaveRows,setPublicHolidayRows,
    setProjects,setAdminTasks,setTeamMembers }

  const reloadAssignments = useCallback(async()=>{
    const r=await supabase.from('task_assignments').select('*')
    setAssignments(r.data||[])
  },[])

  // ── Load all data ──
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

  // ── Realtime subscriptions ──
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

  const days = getWeekDays(weekStart, gridWeeks)
  // Build week segments: each week = [Mon..Fri] + [Sat,Sun]
  const weekSegments = Array.from({length:gridWeeks},(_,w)=>({
    work: days.slice(w*7, w*7+5),
    weekend: days.slice(w*7+5, w*7+7),
  }))
  const allWorkdays = weekSegments.flatMap(s=>s.work)
  const allOffices = [...new Set([...CORE_OFFICES,...teamMembers.map(m=>m.office)])]
    .filter(o=>teamMembers.some(m=>m.office===o))

  const getActive = useCallback((name,ds)=>
    getActiveTask(name,ds,tasks,upcomingLeave,upcomingPH,teamMembers),
    [tasks,upcomingLeave,upcomingPH,teamMembers])

  // ── Stats — filtered by office (not by project) ──
  const statMembers = officeFilter === 'all'
    ? teamMembers
    : teamMembers.filter(m => m.office === officeFilter)

  const statWorkdays=[]
  for(let i=0;i<statWeeks*7;i++){ const d=addDays(weekStart,i); if(!isWeekend(d)) statWorkdays.push(d) }
  let unassigned=0,assigned=0,totalPossible=0
  const unassignedNames = new Set()
  statMembers.forEach(({name})=>{
    let hasUnassigned=false
    statWorkdays.forEach(d=>{
      totalPossible++
      if(getActive(name,fmtDate(d))) assigned++
      else { unassigned++; hasUnassigned=true }
    })
    if(hasUnassigned) unassignedNames.add(name)
  })
  const utilPct=totalPossible>0?Math.round(assigned/totalPossible*100):0

  // Leave stat (separate week toggle, also filtered by office)
  const leaveStatWorkdays=[]
  for(let i=0;i<leaveStatWeeks*7;i++){ const d=addDays(weekStart,i); if(!isWeekend(d)) leaveStatWorkdays.push(d) }
  const onLeaveSet=new Set()
  statMembers.forEach(({name})=>{
    leaveStatWorkdays.forEach(d=>{ if(getActive(name,fmtDate(d))?.entry?.wtype==='leave') onLeaveSet.add(name) })
  })
  const onLeave=onLeaveSet.size
  const onLeaveHrs=onLeave*leaveStatWeeks*5*8

  // Projects active in window
  const activeProjectsInWindow=projects.filter(p=>p.status==='active'&&
    teamMembers.some(m=>allWorkdays.some(d=>getActive(m.name,fmtDate(d))?.entry?.pid===p.id)))

  // ── Undo/Redo helpers ──
  async function pushUndo() {
    const snap = await takeSnapshot()
    undoStack.current.push(snap)
    redoStack.current = []          // new action clears redo
    setCanUndo(true)
    setCanRedo(false)
  }

  async function undo() {
    if (!undoStack.current.length) return
    const currentSnap = await takeSnapshot()
    redoStack.current.push(currentSnap)
    const prev = undoStack.current.pop()
    setCanUndo(undoStack.current.length>0)
    setCanRedo(true)
    await restoreSnapshot(prev, setters)
    showToast('Undone')
  }

  async function redo() {
    if (!redoStack.current.length) return
    const currentSnap = await takeSnapshot()
    undoStack.current.push(currentSnap)
    const next = redoStack.current.pop()
    setCanUndo(true)
    setCanRedo(redoStack.current.length>0)
    await restoreSnapshot(next, setters)
    showToast('Redone')
  }

  // ── Wrapper: push undo before any DB mutation ──
  async function withUndo(fn) {
    await pushUndo()
    await fn()
  }

  // ── Save / Clear task ──
  async function saveTask(name,dateStr,pid,taskLabel,wtype,endDate,notes,skipUndo=false) {
    if (!skipUndo) await pushUndo()
    const existing=assignments.find(a=>a.member_name===name&&a.start_date===dateStr)
    const row={member_name:name,start_date:dateStr,end_date:endDate||dateStr,
      task:taskLabel,pid:pid||null,wtype,notes:notes||null,updated_at:new Date().toISOString()}
    if(existing) await supabase.from('task_assignments').update(row).eq('id',existing.id)
    else await supabase.from('task_assignments').insert(row)
    await reloadAssignments()
  }

  async function clearTask(name,dateStr) {
    await pushUndo()
    const existing=assignments.find(a=>a.member_name===name&&a.start_date===dateStr)
    if(existing){ await supabase.from('task_assignments').delete().eq('id',existing.id); await reloadAssignments() }
  }

  // ── Arrow date adjustment — shrinks adjacent task, or deletes if 1-day ──
  async function adjustTaskDate(name, startDs, which, delta) {
    const entry = tasks[name]?.[startDs]?.[0]; if (!entry) return
    await pushUndo()
    let newStart = startDs, newEnd = entry.end_date

    // Helper: find the task record from assignments that occupies a given date for this person
    // (ignores the expanding task itself, ignores virtual PH/leave)
    function findOccupant(dateStr) {
      // Exact start on that date
      let adj = assignments.find(a =>
        a.member_name === name && a.start_date === dateStr && a.start_date !== startDs
      )
      if (adj) return adj
      // Spanning task that covers dateStr
      adj = assignments.find(a =>
        a.member_name === name &&
        a.start_date < dateStr &&
        a.end_date >= dateStr &&
        a.start_date !== startDs
      )
      return adj || null
    }

    if (which === 'start') {
      let d = parseLocalDate(startDs)
      do { d = addDays(d, delta) } while (isWeekend(d))
      newStart = fmtDate(d)
      if (newStart > newEnd) newEnd = newStart

      if (delta < 0) {
        // Extending start backwards — handle whatever occupies newStart
        const adj = findOccupant(newStart)
        if (adj) {
          const adjDur = Math.round(
            (parseLocalDate(adj.end_date) - parseLocalDate(adj.start_date)) / 86400000
          )
          if (adjDur === 0) {
            await supabase.from('task_assignments').delete().eq('id', adj.id)
          } else {
            // Shrink adj end to day before newStart
            let newAdjEnd = addDays(parseLocalDate(newStart), -1)
            while (isWeekend(newAdjEnd)) newAdjEnd = addDays(newAdjEnd, -1)
            const newAdjEndDs = fmtDate(newAdjEnd)
            if (newAdjEndDs < adj.start_date) {
              await supabase.from('task_assignments').delete().eq('id', adj.id)
            } else {
              await supabase.from('task_assignments').update({
                end_date: newAdjEndDs, updated_at: new Date().toISOString()
              }).eq('id', adj.id)
            }
          }
        }
      }

    } else {
      let d = parseLocalDate(entry.end_date)
      do { d = addDays(d, delta) } while (isWeekend(d))
      newEnd = fmtDate(d)
      if (newEnd < newStart) newStart = newEnd

      if (delta > 0) {
        // Extending end forward — handle whatever occupies newEnd
        const adj = findOccupant(newEnd)
        if (adj) {
          const adjDur = Math.round(
            (parseLocalDate(adj.end_date) - parseLocalDate(adj.start_date)) / 86400000
          )
          if (adjDur === 0) {
            // 1-day task → delete entirely
            await supabase.from('task_assignments').delete().eq('id', adj.id)
          } else {
            // Multi-day task → shrink: move start_date forward 1 workday
            let newAdjStart = addDays(parseLocalDate(newEnd), 1)
            while (isWeekend(newAdjStart)) newAdjStart = addDays(newAdjStart, 1)
            const newAdjStartDs = fmtDate(newAdjStart)
            if (newAdjStartDs > adj.end_date) {
              // Would collapse to nothing → delete
              await supabase.from('task_assignments').delete().eq('id', adj.id)
            } else {
              await supabase.from('task_assignments').update({
                start_date: newAdjStartDs, updated_at: new Date().toISOString()
              }).eq('id', adj.id)
            }
          }
        }
      }
    }

    // Delete old record if start date changed (start arrow moved forward)
    if (newStart !== startDs)
      await supabase.from('task_assignments').delete()
        .eq('member_name', name).eq('start_date', startDs)

    await saveTask(name, newStart, entry.pid, entry.task, entry.wtype, newEnd, entry.notes, true)
  }

  // ── Drag resize ──
  function startResize(e, name, startDs, handle) {
    e.preventDefault(); e.stopPropagation()
    const entry=tasks[name]?.[startDs]?.[0]; if(!entry) return
    dragState.current={name,startDs,entry,handle,currentStart:startDs,currentEnd:entry.end_date}
    setDragGhost({x:e.clientX,y:e.clientY,text:entry.task,isCopy:false})
  }

  // ── Drag copy (triggered by dragging a task cell directly) ──
  function startCopy(e, name, startDs) {
    e.preventDefault(); e.stopPropagation()
    const active=getActive(name,startDs)
    if(!active||active.isVirtual) return
    copyDragState.current={name,startDs,entry:active.entry}
    setDragGhost({x:e.clientX,y:e.clientY,text:`⊕ ${active.entry.task}`,isCopy:true})
  }

  function getDateAtX(clientX) {
    // Use data-date attributes set on each workday <th> — reliable across both weeks
    const ths = document.querySelectorAll('#grid-thead th[data-date]')
    let best = null, bestDist = Infinity
    ths.forEach(th => {
      const rect = th.getBoundingClientRect()
      const mid = (rect.left + rect.right) / 2
      const dist = Math.abs(clientX - mid)
      // if cursor is within this column
      if (clientX >= rect.left && clientX <= rect.right) {
        best = th.dataset.date; bestDist = 0
      } else if (dist < bestDist) {
        // snap to nearest column edge if outside grid
        bestDist = dist; best = th.dataset.date
      }
    })
    return best ? best : null  // return ISO string directly
  }

  useEffect(()=>{
    function onMouseMove(e) {
      if(!dragState.current&&!copyDragState.current) return
      setDragGhost(g=>g?{...g,x:e.clientX,y:e.clientY}:null)
      if(dragState.current) {
        const {entry,handle}=dragState.current
        const targetDs=getDateAtX(e.clientX)
        if(!targetDs) return
        const targetDay=parseLocalDate(targetDs)
        if(isWeekend(targetDay)) return
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
        if(row) row.style.outline='2px solid #4ff7a2'
      }
    }
    async function onMouseUp(e) {
      if(dragState.current) {
        const {name,startDs,entry,handle,currentStart,currentEnd}=dragState.current
        dragState.current=null; setDragGhost(null)
        const changed=handle==='end'?currentEnd!==entry.end_date:currentStart!==startDs
        if(changed) {
          await pushUndo()
          if(handle==='start'&&currentStart!==startDs)
            await supabase.from('task_assignments').delete().eq('member_name',name).eq('start_date',startDs)
          const existing=assignments.find(a=>a.member_name===name&&a.start_date===currentStart)
          const row={member_name:name,start_date:currentStart,end_date:currentEnd,
            task:entry.task,pid:entry.pid||null,wtype:entry.wtype,notes:entry.notes||null,updated_at:new Date().toISOString()}
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
        const targetDs=getDateAtX(e.clientX)
        // need a valid drop target
        if(targetName&&targetDs&&!isWeekend(parseLocalDate(targetDs))) {
          // Don't drop on exact same position
          if(targetName===srcName&&targetDs===startDs) return

          // ── Merge check: is the drop cell directly adjacent to an identical task? ──
          // Look for an existing task for targetName that:
          //   (a) has the same task label + pid, AND
          //   (b) its end_date is the day before targetDs  → extend its end_date to newEnd
          //   OR  its start_date is the day after newEnd   → extend its start_date to targetDs
          const dur = entry.end_date>startDs
            ? Math.round((parseLocalDate(entry.end_date)-parseLocalDate(startDs))/86400000) : 0
          const newEnd = dur>0 ? fmtDate(addDays(parseLocalDate(targetDs),dur)) : targetDs

          function isSameTask(a) {
            return a.member_name===targetName && a.task===entry.task && (a.pid||'')===(entry.pid||'')
          }
          // Day before targetDs (skip weekends)
          let dayBefore = addDays(parseLocalDate(targetDs),-1)
          while(isWeekend(dayBefore)) dayBefore=addDays(dayBefore,-1)
          const dayBeforeDs = fmtDate(dayBefore)
          // Day after newEnd (skip weekends)
          let dayAfter = addDays(parseLocalDate(newEnd),1)
          while(isWeekend(dayAfter)) dayAfter=addDays(dayAfter,1)
          const dayAfterDs = fmtDate(dayAfter)

          // Check: existing task ends the day before drop → extend its end_date
          const mergeLeft = assignments.find(a=>isSameTask(a)&&a.end_date===dayBeforeDs)
          // Check: existing task starts the day after drop's end → extend its start_date
          const mergeRight = assignments.find(a=>isSameTask(a)&&a.start_date===dayAfterDs)

          await pushUndo()

          if(mergeLeft) {
            // Extend the existing task's end date to cover the dropped range
            const mergedEnd = newEnd > mergeLeft.end_date ? newEnd : mergeLeft.end_date
            await supabase.from('task_assignments').update({
              end_date: mergedEnd, updated_at: new Date().toISOString()
            }).eq('id', mergeLeft.id)
            // Also merge right if that exists too
            if(mergeRight) {
              const finalEnd = mergeRight.end_date > mergedEnd ? mergeRight.end_date : mergedEnd
              await supabase.from('task_assignments').update({
                end_date: finalEnd, updated_at: new Date().toISOString()
              }).eq('id', mergeLeft.id)
              await supabase.from('task_assignments').delete().eq('id', mergeRight.id)
            }
            showToast('Merged')
          } else if(mergeRight) {
            // Extend the existing task's start_date back to targetDs
            await supabase.from('task_assignments').update({
              start_date: targetDs, updated_at: new Date().toISOString()
            }).eq('id', mergeRight.id)
            showToast('Merged')
          } else {
            // No adjacent identical task — normal copy/move
            await saveTask(targetName,targetDs,entry.pid,entry.task,entry.wtype,newEnd,entry.notes,true)
            showToast(targetName===srcName
              ? `Moved to ${fmtDisplay(parseLocalDate(targetDs))}`
              : `Copied to ${targetName}`)
          }
          await reloadAssignments()
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
    const idx=om.findIndex(m=>m.id===memberId),nIdx=idx+dir
    if(nIdx<0||nIdx>=om.length) return
    const a=om[idx],b=om[nIdx]
    await pushUndo()
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
    pushUndo().then(()=>
      Promise.all(ro.map((m,i)=>supabase.from('team_members').update({sort_order:i+1}).eq('id',m.id)))
        .then(()=>supabase.from('team_members').select('*').order('office').order('sort_order'))
        .then(r=>{setTeamMembers(r.data||[]);setRowDragSrc(null)})
    )
  }

  // ── Export ──
  function exportSummary() {
    const lines=[`BSFDS Workload Summary (${gridWeeks} weeks)`,
      `Period: ${fmtDisplay(allWorkdays[0])} to ${fmtDisplay(allWorkdays[allWorkdays.length-1])}`,
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
    a.download=`BSFDS_Workload_${fmtDate(allWorkdays[0])}.txt`; a.click()
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

      {/* Floating undo/redo bar — always visible at top of viewport */}
      <div style={{position:'fixed',top:0,left:0,right:0,zIndex:50,
        display:'flex',justifyContent:'flex-end',gap:6,padding:'6px 24px',
        background:'rgba(15,17,23,.92)',backdropFilter:'blur(8px)',
        borderBottom:'1px solid #2a3050',pointerEvents:'none'}}>
        <div style={{display:'flex',gap:6,pointerEvents:'all'}}>
          <button onClick={undo} disabled={!canUndo} title="Undo"
            style={{...btnBase,opacity:canUndo?1:.35,cursor:canUndo?'pointer':'default',
              fontSize:11,padding:'4px 10px'}}>↩ Undo</button>
          <button onClick={redo} disabled={!canRedo} title="Redo"
            style={{...btnBase,opacity:canRedo?1:.35,cursor:canRedo?'pointer':'default',
              fontSize:11,padding:'4px 10px'}}>↪ Redo</button>
        </div>
      </div>

      {/* Push content down below the floating bar */}
      <div style={{paddingTop:36}}>
      <div style={{maxWidth:1600,margin:'0 auto',padding:'16px 20px'}}>
        {/* Header */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',
          borderBottom:'1px solid #2a3050',paddingBottom:16,marginBottom:0}}>
          <div style={{display:'flex',alignItems:'center',gap:18}}>
            <img src="/logo.png" alt="BSFDS" style={{height:60,objectFit:'contain'}}
              onError={e=>e.target.style.display='none'} />
            <div style={{fontFamily:'"Inter",system-ui,sans-serif',fontWeight:800,fontSize:28,
              letterSpacing:'-0.5px',lineHeight:1.2}}>
              BSFDS Workload Manager
            </div>
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
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
            days={days} weekSegments={weekSegments} allWorkdays={allWorkdays}
            weekStart={weekStart} setWeekStart={setWeekStart}
            gridWeeks={gridWeeks} setGridWeeks={setGridWeeks}
            teamMembers={teamMembers} projects={projects} adminTasks={adminTasks}
            tasks={tasks} upcomingLeave={upcomingLeave} upcomingPH={upcomingPH}
            upcomingLeaveRows={upcomingLeaveRows} setUpcomingLeaveRows={setUpcomingLeaveRows}
            publicHolidayRows={publicHolidayRows} setPublicHolidayRows={setPublicHolidayRows}
            officeFilter={officeFilter} setOfficeFilter={setOfficeFilter}
            projectFilter={projectFilter} setProjectFilter={setProjectFilter}
            leaveFilter={leaveFilter} setLeaveFilter={setLeaveFilter}
            unassignedFilter={unassignedFilter} setUnassignedFilter={setUnassignedFilter}
            onLeaveNames={onLeaveSet} unassignedNames={unassignedNames}
            activeProjectsInWindow={activeProjectsInWindow}
            search={search} setSearch={setSearch}
            allOffices={allOffices}
            onLeave={onLeave} onLeaveHrs={onLeaveHrs}
            leaveStatWeeks={leaveStatWeeks} setLeaveStatWeeks={setLeaveStatWeeks}
            unassigned={unassigned} unassignedHrs={unassigned*8}
            utilPct={utilPct} statWeeks={statWeeks} setStatWeeks={setStatWeeks}
            getActive={getActive} setAssignModal={setAssignModal}
            setLeaveModal={setLeaveModal} setPhModal={setPhModal}
            startResize={startResize} startCopy={startCopy}
            adjustTaskDate={adjustTaskDate}
            rowDragSrc={rowDragSrc} setRowDragSrc={setRowDragSrc}
            moveRow={moveRow} handleRowDrop={handleRowDrop}
            withUndo={withUndo} showToast={showToast}
          />
        )}
        {tab==='projects'&&(
          <ProjectsTab projects={projects} setProjects={setProjects}
            adminTasks={adminTasks} setAdminTasks={setAdminTasks}
            setProjectModal={setProjectModal} setAdminTaskModal={setAdminTaskModal}
            withUndo={withUndo} />
        )}
        {tab==='team'&&(
          <TeamTab teamMembers={teamMembers} setTeamMembers={setTeamMembers}
            setMemberModal={setMemberModal} withUndo={withUndo} />
        )}
      </div>

      {/* Modals */}
      {assignModal&&<AssignModal modal={assignModal} onClose={()=>setAssignModal(null)}
        projects={projects} adminTasks={adminTasks} onSave={saveTask} onClear={clearTask} showToast={showToast} />}

      {projectModal!==null&&<ProjectModal item={projectModal} projects={projects} adminTasks={adminTasks}
        onClose={()=>setProjectModal(null)}
        onSave={async row=>{
          await withUndo(async()=>{
            if(row.id) await supabase.from('projects').upsert(row)
            else await supabase.from('projects').insert({...row,id:'p'+Date.now()})
            const r=await supabase.from('projects').select('*').order('job'); setProjects(r.data||[])
          }); setProjectModal(null)
        }} />}

      {adminTaskModal!==null&&<AdminTaskModal item={adminTaskModal} projects={projects} adminTasks={adminTasks}
        onClose={()=>setAdminTaskModal(null)}
        onSave={async row=>{
          await withUndo(async()=>{
            if(row.id) await supabase.from('admin_tasks').upsert(row)
            else await supabase.from('admin_tasks').insert({...row,id:'a'+Date.now()})
            const r=await supabase.from('admin_tasks').select('*').order('name'); setAdminTasks(r.data||[])
          }); setAdminTaskModal(null)
        }} />}

      {memberModal!==null&&<MemberModal item={memberModal} teamMembers={teamMembers}
        onClose={()=>setMemberModal(null)}
        onSave={async row=>{
          await withUndo(async()=>{
            if(row.id) await supabase.from('team_members').update(row).eq('id',row.id)
            else await supabase.from('team_members').insert(row)
            const r=await supabase.from('team_members').select('*').order('office').order('sort_order'); setTeamMembers(r.data||[])
          }); setMemberModal(null)
        }} />}

      {leaveModal!==null&&<LeaveModal item={leaveModal} teamMembers={teamMembers}
        onClose={()=>setLeaveModal(null)} showToast={showToast}
        onSave={async row=>{
          await withUndo(async()=>{
            if(row.id&&upcomingLeaveRows.find(x=>x.id===row.id)) await supabase.from('upcoming_leave').update(row).eq('id',row.id)
            else await supabase.from('upcoming_leave').insert({...row,id:row.id||'l'+Date.now()})
            const r=await supabase.from('upcoming_leave').select('*'); setUpcomingLeaveRows(r.data||[])
          }); setLeaveModal(null)
        }} />}

      {phModal!==null&&<PHModal item={phModal} onClose={()=>setPhModal(null)} showToast={showToast}
        onSave={async row=>{
          await withUndo(async()=>{
            if(row.id&&publicHolidayRows.find(x=>x.id===row.id)) await supabase.from('public_holidays').update(row).eq('id',row.id)
            else await supabase.from('public_holidays').insert({...row,id:row.id||'ph'+Date.now()})
            const r=await supabase.from('public_holidays').select('*').order('iso_date'); setPublicHolidayRows(r.data||[])
          }); setPhModal(null)
        }} />}
      </div>
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════
// WORKLOAD TAB
// ═════════════════════════════════════════════════════════════════════
function WorkloadTab({days,weekSegments,allWorkdays,weekStart,setWeekStart,
  gridWeeks,setGridWeeks,
  teamMembers,projects,adminTasks,tasks,upcomingLeave,upcomingPH,
  upcomingLeaveRows,setUpcomingLeaveRows,publicHolidayRows,setPublicHolidayRows,
  officeFilter,setOfficeFilter,projectFilter,setProjectFilter,
  leaveFilter,setLeaveFilter,unassignedFilter,setUnassignedFilter,
  onLeaveNames,unassignedNames,activeProjectsInWindow,
  search,setSearch,allOffices,onLeave,onLeaveHrs,leaveStatWeeks,setLeaveStatWeeks,
  unassigned,unassignedHrs,utilPct,statWeeks,setStatWeeks,
  getActive,setAssignModal,setLeaveModal,setPhModal,
  startResize,startCopy,adjustTaskDate,rowDragSrc,setRowDragSrc,
  moveRow,handleRowDrop,withUndo,showToast}) {

  const leaveByOffice={},phByOffice={}
  upcomingLeaveRows.forEach(l=>{if(!leaveByOffice[l.office])leaveByOffice[l.office]=[];leaveByOffice[l.office].push(l)})
  publicHolidayRows.forEach(p=>{if(!phByOffice[p.office])phByOffice[p.office]=[];phByOffice[p.office].push(p)})

  async function deleteLeave(id){
    await withUndo(async()=>{
      await supabase.from('upcoming_leave').delete().eq('id',id)
      const r=await supabase.from('upcoming_leave').select('*'); setUpcomingLeaveRows(r.data||[])
    })
  }
  async function deletePH(id){
    await withUndo(async()=>{
      await supabase.from('public_holidays').delete().eq('id',id)
      const r=await supabase.from('public_holidays').select('*').order('iso_date'); setPublicHolidayRows(r.data||[])
    })
  }

  const filteredMembers=teamMembers.filter(m=>{
    if(officeFilter!=='all'&&m.office!==officeFilter) return false
    if(search&&!m.name.toLowerCase().includes(search.toLowerCase())) return false
    if(projectFilter!=='all'&&!allWorkdays.some(d=>getActive(m.name,fmtDate(d))?.entry?.pid===projectFilter)) return false
    if(leaveFilter&&!onLeaveNames.has(m.name)) return false
    if(unassignedFilter&&!unassignedNames.has(m.name)) return false
    return true
  })
  const officeGroups={}
  filteredMembers.forEach(m=>{if(!officeGroups[m.office])officeGroups[m.office]=[];officeGroups[m.office].push(m)})

  const WeekToggle=({val,set})=>(
    <div style={{display:'flex',gap:3,marginTop:5}}>
      {[1,2,3,4].map(w=>(
        <button key={w} onClick={()=>set(w)}
          style={{padding:'1px 6px',borderRadius:3,fontSize:10,cursor:'pointer',
            border:'1px solid #2a3050',
            background:val===w?'#4f8ef7':'transparent',
            color:val===w?'#fff':'#9aa3c2'}}>{w}w</button>
      ))}
    </div>
  )

  // Active-filter toggle button helper
  const FilterToggleBtn=({active,onClick,color,children})=>(
    <button onClick={onClick}
      style={{marginTop:4,padding:'2px 8px',borderRadius:3,fontSize:10,cursor:'pointer',
        border:`1px solid ${active?color:'#2a3050'}`,
        background:active?`${color}22`:'transparent',
        color:active?color:'#9aa3c2',display:'flex',alignItems:'center',gap:4}}>
      {active?'x clear':'filter'} {children}
    </button>
  )

  // Last workday of the grid (for nav label)
  const lastDay = allWorkdays[allWorkdays.length-1]

  return(
    <div>
      {/* Stat cards */}
      <div style={{display:'flex',gap:10,marginBottom:18,flexWrap:'wrap'}}>
        <StatCard label="Total Team" color="#4f8ef7">
          <span style={{fontSize:26,fontWeight:700}}>{teamMembers.length}</span>
        </StatCard>
        {allOffices.map(o=>(
          <StatCard key={o} label={<span style={{display:'flex',alignItems:'center',gap:4}}>{o} <OfficeFlag office={o} size={13} /></span>} color={OFFICE_COLORS[o]||'#b87fff'}>
            <span style={{fontSize:26,fontWeight:700}}>{teamMembers.filter(m=>m.office===o).length}</span>
          </StatCard>
        ))}
        {/* On Leave card with filter toggle */}
        <StatCard label="Team Members On Leave" color="#f75c5c">
          <span style={{fontSize:26,fontWeight:700}}>{onLeave}</span>
          <div style={{fontSize:10,color:'#f75c5c',marginTop:2}}>{onLeaveHrs} hrs</div>
          <WeekToggle val={leaveStatWeeks} set={setLeaveStatWeeks} />
          <FilterToggleBtn active={leaveFilter} onClick={()=>{setLeaveFilter(v=>!v);setUnassignedFilter(false)}} color="#f75c5c">
            on leave
          </FilterToggleBtn>
        </StatCard>
        {/* Unassigned card with filter toggle */}
        <StatCard label="Unassigned" color="#5a6380">
          <div style={{display:'flex',alignItems:'baseline',gap:6}}>
            <span style={{fontSize:26,fontWeight:700}}>{unassigned}</span>
            <span style={{fontSize:11,color:'#5a6380'}}>days / {unassignedHrs} hrs</span>
          </div>
          <div style={{fontSize:10,color:'#4ff7a2',marginTop:2}}>Utilisation {utilPct}%</div>
          <WeekToggle val={statWeeks} set={setStatWeeks} />
          <FilterToggleBtn active={unassignedFilter} onClick={()=>{setUnassignedFilter(v=>!v);setLeaveFilter(false)}} color="#9aa3c2">
            unassigned
          </FilterToggleBtn>
        </StatCard>
      </div>

      {/* Office filters */}
      <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:8}}>
        {['all',...allOffices].map(o=>(
          <button key={o} onClick={()=>setOfficeFilter(o)}
            style={{padding:'4px 12px',borderRadius:20,fontSize:11,cursor:'pointer',
              border:officeFilter===o?'none':'1px solid #2a3050',
              background:officeFilter===o?(o==='all'?'#5a6380':OFFICE_COLORS[o]||'#b87fff'):'#181c27',
              color:officeFilter===o?(o==='Chennai'||o==='Bangkok'?'#111':'#fff'):'#9aa3c2'}}>
            {o==='all'?'All Offices':<>{o} <OfficeFlag office={o} size={14} /></>}
          </button>
        ))}
      </div>

      {/* Project filters */}
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
                color:projectFilter===p.id?'#111':'#9aa3c2'}}>
              {p.job?`${p.job} ${p.name}`:p.name}
            </button>
          ))}
        </div>
      )}

      {/* Search + grid duration + week nav */}
      <div style={{display:'flex',gap:10,marginBottom:16,flexWrap:'wrap',alignItems:'center'}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name..."
          style={{background:'#1e2335',border:'1px solid #2a3050',color:'#e2e8ff',
            padding:'6px 12px',borderRadius:4,fontSize:12,width:180}} />
        {/* Grid duration toggle */}
        <div style={{display:'flex',gap:4,alignItems:'center'}}>
          <span style={{fontSize:10,color:'#9aa3c2',marginRight:2}}>View:</span>
          {[2,3,4].map(w=>(
            <button key={w} onClick={()=>setGridWeeks(w)}
              style={{padding:'4px 10px',borderRadius:4,fontSize:11,cursor:'pointer',
                border:'1px solid #2a3050',
                background:gridWeeks===w?'#4f8ef7':'#181c27',
                color:gridWeeks===w?'#fff':'#9aa3c2'}}>{w}W</button>
          ))}
        </div>
        <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:10}}>
          <button className="btn" onClick={()=>setWeekStart(w=>addDays(w,-7))}>← Prev</button>
          <div style={{fontSize:12,color:'#9aa3c2',textAlign:'center',minWidth:200}}>
            <strong style={{display:'block',fontSize:13,color:'#e2e8ff'}}>
              {fmtDisplay(allWorkdays[0])} – {fmtDisplay(lastDay)}
            </strong>
            <span>{allWorkdays[0].toLocaleDateString('en-AU',{month:'short',year:'numeric'})}</span>
          </div>
          <button className="btn" onClick={()=>setWeekStart(w=>addDays(w,7))}>Next →</button>
          <button className="btn" onClick={()=>setWeekStart(getMondayOf(new Date()))}>Today</button>
        </div>
      </div>

      {/* Grid — multi-week, sticky header */}
      <div style={{paddingBottom:10}}>
        <table style={{width:'100%',minWidth:900,borderCollapse:'collapse',tableLayout:'fixed'}}>
          <colgroup>
            <col style={{width:155}} />
            {weekSegments.flatMap((seg,wi)=>[
              ...seg.work.map((_,i)=><col key={`w${wi}d${i}`} />),
              <col key={`w${wi}ss`} style={{width:26}} />
            ])}
          </colgroup>
          <thead id="grid-thead" style={{position:'sticky',top:36,zIndex:10}}><tr>
            <th style={{...thStyle,position:'sticky',left:0,zIndex:11}}>Team Member</th>
            {weekSegments.flatMap((seg,wi)=>[
              ...seg.work.map((d,i)=>{
                const ds=fmtDate(d), isToday=ds===fmtDate(new Date())
                const dayIdx=wi*7+i
                return(
                  <th key={ds} data-date={ds} style={isToday?thStyleToday:thStyle}>
                    {isToday&&<div style={{fontSize:8,color:'#f75c5c',fontWeight:700,letterSpacing:.5,marginBottom:1}}>TODAY</div>}
                    <div style={{fontSize:11,color:isToday?'#fff':'#e2e8ff',fontWeight:500}}>{DAY_SHORT[dayIdx]}</div>
                    <div style={{fontSize:9,color:'#9aa3c2'}}>{fmtDisplay(d)}</div>
                  </th>
                )
              }),
              <th key={`ss${wi}`} data-weekend="1" style={{...thStyle,background:'#0d1018',opacity:.5,
                fontSize:8,color:'#5a6380',writingMode:'vertical-rl'}}>S/S</th>
            ])}
          </tr></thead>
          <tbody>
            {allOffices.map(office=>{
              const members=officeGroups[office]; if(!members?.length) return null
              const colSpan = weekSegments.length * 6 + 1  // name + (5 work + 1 ss) * numWeeks
              return[
                <tr key={`sec-${office}`}>
                  <td colSpan={colSpan} style={{fontFamily:'Syne,sans-serif',fontSize:10,fontWeight:700,
                    letterSpacing:2,textTransform:'uppercase',padding:'6px 14px',
                    color:OFFICE_COLORS[office]||'#b87fff',background:'#181c27',
                    borderLeft:`3px solid ${OFFICE_COLORS[office]||'#b87fff'}`,
                    borderBottom:'1px solid #2a3050'}}>
                    <span style={{display:'flex',alignItems:'center',gap:6}}>{office} Office <OfficeFlag office={office} size={13} /></span>
                  </td>
                </tr>,
                ...members.map(m=>(
                  <MemberRow key={m.id} member={m}
                    weekSegments={weekSegments} allWorkdays={allWorkdays}
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

const thStyle={background:'#1e2335',padding:'6px 5px 8px',textAlign:'center',fontSize:10,color:'#9aa3c2',border:'1px solid #2a3050'}
const thStyleToday={...thStyle,background:'#1a2540',borderBottom:'2px solid #f75c5c'}
const tdStyle={background:'#181c27',border:'1px solid #2a3050',verticalAlign:'top',cursor:'pointer',position:'relative'}
const tdStyleToday={...tdStyle,background:'#181d2a'}

// Stat card — label on top, content below
function StatCard({label,color,children}){
  return(
    <div style={{background:'#181c27',border:'1px solid #2a3050',borderRadius:6,
      padding:'10px 14px',minWidth:100,flex:1}}>
      <div style={{fontSize:10,color:'#9aa3c2',marginBottom:4,letterSpacing:.3}}>{label}</div>
      <div style={{color,fontFamily:'system-ui,-apple-system,sans-serif'}}>{children}</div>
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
function MemberRow({member,weekSegments,allWorkdays,getActive,projects,adminTasks,
  setAssignModal,startResize,startCopy,adjustTaskDate,rowDragSrc,setRowDragSrc,onMoveRow,onRowDrop}){
  const [hovered,setHovered]=useState(false)
  const isDragTarget=rowDragSrc&&rowDragSrc.id!==member.id&&rowDragSrc.office===member.office

  // allWorkdays passed directly — used for arrow visibility checks
  const allWorkDays = allWorkdays

  function renderWeek(workDays){
    const cells=[]; let i=0
    const todayDs=fmtDate(new Date())

    while(i<workDays.length){
      const d=workDays[i],ds=fmtDate(d)
      const isToday=ds===todayDs
      const active=getActive(member.name,ds)
      if(!active){
        cells.push(
          <td key={ds} onClick={()=>setAssignModal({name:member.name,dateStr:ds,entry:null})}
            style={{...tdStyle,minHeight:52,background:isToday?'#181d2a':'#181c27'}}
            onMouseEnter={e=>e.currentTarget.style.background=isToday?'#1e2640':'#232840'}
            onMouseLeave={e=>e.currentTarget.style.background=isToday?'#181d2a':'#181c27'}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'center',
              minHeight:52,color:'#5a6380',fontSize:10,padding:4}}>+ assign</div>
          </td>
        ); i++; continue
      }
      const {entry,startDs,isVirtual}=active

      // Count span within this week segment
      let span=1,j=i+1
      while(j<workDays.length){
        const nA=getActive(member.name,fmtDate(workDays[j]))
        if(nA&&nA.startDs===startDs&&JSON.stringify(nA.entry)===JSON.stringify(entry)){span++;j++}else break
      }

      // ── Arrow visibility ──
      // Start arrows: show only on the very first workday cell of this task across both weeks.
      // That is: no earlier workday in allWorkDays has this same task active.
      const showStartArrows = !isVirtual && (() => {
        for (const wd of allWorkDays) {
          const wds = fmtDate(wd)
          if (wds === ds) return true   // reached current cell first — this IS the first
          const a = getActive(member.name, wds)
          if (a && a.startDs === startDs) return false  // an earlier cell has this task
        }
        return true
      })()

      // End arrows: show only on the very last workday cell of this task across both weeks.
      // That is: no later workday in allWorkDays has this same task active.
      const lastCellDs = fmtDate(workDays[j-1])
      const showEndArrows = !isVirtual && (() => {
        let foundLast = false
        for (let k = allWorkDays.length-1; k >= 0; k--) {
          const wds = fmtDate(allWorkDays[k])
          const a = getActive(member.name, wds)
          if (a && a.startDs === startDs) {
            foundLast = (wds === lastCellDs)
            break
          }
        }
        return foundLast
      })()

      const color=['leave','ph'].includes(entry.wtype)?null:getProjectColor(entry.pid,projects,adminTasks)
      let bg='transparent',bc='#4f8ef7'
      if(entry.wtype==='leave'){bg='rgba(247,92,92,.13)';bc='#f75c5c'}
      else if(entry.wtype==='ph'){bg='rgba(247,162,79,.13)';bc='#f7a24f'}
      else if(entry.wtype==='admin'){bg='rgba(90,99,128,.13)';bc='#5a6380'}
      else if(color){const {r,g,b}=hexToRgb(color);bg=`rgba(${r},${g},${b},.18)`;bc=color}
      const nc=entry.wtype==='leave'?'#f75c5c':entry.wtype==='ph'?'#f7a24f':entry.wtype==='admin'?'#9aa3c2':'#e2e8ff'

      cells.push(
        <td key={ds} colSpan={span}
          style={{...tdStyle,cursor:isVirtual?'default':'pointer',background:bg,borderLeft:`3px solid ${bc}`}}
          onClick={()=>!isVirtual&&setAssignModal({name:member.name,dateStr:startDs,entry})}
          onMouseDown={!isVirtual?(e=>{
            if(e.target.closest('button')) return
            if(e.button===0) startCopy(e,member.name,startDs)
          }):undefined}>
          <div style={{padding:'4px 6px',display:'flex',alignItems:'flex-start',gap:3,minHeight:52}}>
            {/* Start arrows — only on the very first rendered cell of this task */}
            {showStartArrows&&(
              <div style={{display:'flex',flexDirection:'column',gap:1,flexShrink:0,paddingTop:4}}>
                <button title="Move start earlier"
                  onMouseDown={e=>e.stopPropagation()}
                  onClick={e=>{e.stopPropagation();adjustTaskDate(member.name,startDs,'start',-1)}}
                  style={arrowBtn}>◀</button>
                <button title="Move start later"
                  onMouseDown={e=>e.stopPropagation()}
                  onClick={e=>{e.stopPropagation();adjustTaskDate(member.name,startDs,'start',1)}}
                  style={arrowBtn}>▶</button>
              </div>
            )}
            <div style={{flex:1,minWidth:0,userSelect:'none'}}>
              <div style={{fontSize:10,fontWeight:500,color:nc,wordBreak:'break-word',lineHeight:1.3}}>{entry.task}</div>
              {entry.notes&&<div style={{fontSize:9,color:'#9aa3c2',marginTop:2,wordBreak:'break-word',lineHeight:1.3}}>{entry.notes}</div>}
              {entry.wtype&&!['leave','ph','admin'].includes(entry.wtype)&&(
                <div style={{fontSize:9,color:'#9aa3c2',fontStyle:'italic',marginTop:1}}>{entry.wtype}</div>
              )}
            </div>
            {/* End arrows — only on the very last rendered cell of this task */}
            {showEndArrows&&(
              <div style={{display:'flex',flexDirection:'column',gap:1,flexShrink:0,paddingTop:4}}>
                <button title="Move end earlier"
                  onMouseDown={e=>e.stopPropagation()}
                  onClick={e=>{e.stopPropagation();adjustTaskDate(member.name,startDs,'end',-1)}}
                  style={arrowBtn}>◀</button>
                <button title="Move end later"
                  onMouseDown={e=>e.stopPropagation()}
                  onClick={e=>{e.stopPropagation();adjustTaskDate(member.name,startDs,'end',1)}}
                  style={arrowBtn}>▶</button>
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
      <td style={{background:'#1e2335',border:'1px solid #2a3050',padding:'6px 8px 6px 12px',
        verticalAlign:'middle',position:'sticky',left:0,zIndex:2}}>
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
      {weekSegments.flatMap((seg,wi)=>[
        ...renderWeek(seg.work),
        <td key={`ss${wi}`} style={{background:'#0a0d14',border:'1px solid #2a3050',width:26}} />
      ])}
    </tr>
  )
}

const arrowBtn={background:'rgba(255,255,255,.06)',border:'none',cursor:'pointer',
  color:'rgba(255,255,255,.4)',fontSize:8,padding:'2px 3px',lineHeight:1,borderRadius:2}

// ─── Leave & PH Panels ────────────────────────────────────────────────
function LeavePanel({office,color,items,onAdd,onEdit,onDelete}){
  return(
    <div style={{background:'#181c27',border:'1px solid #2a3050',borderRadius:6,padding:14}}>
      <div style={{fontFamily:'Syne,sans-serif',fontSize:11,fontWeight:700,letterSpacing:1.5,
        textTransform:'uppercase',color,marginBottom:10,display:'flex',alignItems:'center',gap:8}}>
        <span style={{width:7,height:7,borderRadius:'50%',background:color,display:'inline-block'}} />
        {office} <OfficeFlag office={office} size={13} />
        <button onClick={onAdd} style={{marginLeft:'auto',background:'#1e2335',border:'1px solid #2a3050',
          color:'#9aa3c2',padding:'2px 8px',borderRadius:3,cursor:'pointer',fontSize:14}}>+</button>
      </div>
      {items.length===0&&<div style={{fontSize:11,color:'#5a6380'}}>No upcoming leave</div>}
      {items.map(l=>(
        <div key={l.id} style={{display:'flex',alignItems:'center',padding:'5px 0',
          borderBottom:'1px solid #2a3050',fontSize:11,gap:6}}>
          <span style={{color:'#e2e8ff',flex:1}}>{l.name}</span>
          <span style={{color:'#9aa3c2',fontSize:10,whiteSpace:'nowrap'}}>
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
        {office} <OfficeFlag office={office} size={13} />
        <button onClick={onAdd} style={{marginLeft:'auto',background:'#1e2335',border:'1px solid #2a3050',
          color:'#9aa3c2',padding:'2px 8px',borderRadius:3,cursor:'pointer',fontSize:14}}>+</button>
      </div>
      {items.length===0&&<div style={{fontSize:11,color:'#5a6380'}}>No upcoming public holidays</div>}
      {items.map(p=>(
        <div key={p.id} style={{display:'flex',alignItems:'center',padding:'5px 0',
          borderBottom:'1px solid #2a3050',fontSize:11,gap:6}}>
          <span style={{color:'#9aa3c2',flex:1}}>📅 {p.name}</span>
          <span style={{color:'#9aa3c2',fontSize:10,whiteSpace:'nowrap'}}>{p.iso_date?fmtPHDate(p.iso_date):p.display_date}</span>
          <button onClick={()=>onEdit(p)} style={{background:'none',border:'none',cursor:'pointer',color:'#9aa3c2',padding:'2px 4px'}}>✏️</button>
          <button onClick={()=>onDelete(p.id)} style={{background:'none',border:'none',cursor:'pointer',color:'#f75c5c',padding:'2px 4px',fontSize:13}}>✕</button>
        </div>
      ))}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════
// PROJECTS TAB
// ═════════════════════════════════════════════════════════════════════
function ProjectsTab({projects,setProjects,adminTasks,setAdminTasks,setProjectModal,setAdminTaskModal,withUndo}){
  const [pSort,setPSort]=useState({col:'job',dir:1})
  const [aSort,setASort]=useState({col:'name',dir:1})
  function tog(cur,col,set){ cur.col===col?set({col,dir:-cur.dir}):set({col,dir:1}) }
  const sp=[...projects].sort((a,b)=>{ const av=(a[pSort.col]||'').toLowerCase(),bv=(b[pSort.col]||'').toLowerCase(); return av<bv?-pSort.dir:av>bv?pSort.dir:0 })
  const sa=[...adminTasks].sort((a,b)=>{ const av=(a[aSort.col]||'').toLowerCase(),bv=(b[aSort.col]||'').toLowerCase(); return av<bv?-aSort.dir:av>bv?aSort.dir:0 })
  const SH=({col,sort,onTog,ch})=>(
    <th style={{...adminTh,cursor:'pointer',userSelect:'none'}} onClick={()=>onTog(col)}>
      {ch}{sort.col===col?(sort.dir===1?' ↑':' ↓'):''}
    </th>
  )
  return(
    <div>
      <AdminSection title="🏗 Active Projects" onAdd={()=>setProjectModal({})}>
        <table style={adminTableStyle}><thead><tr>
          <th style={adminTh}>Colour</th>
          <SH col="job" sort={pSort} onTog={c=>tog(pSort,c,setPSort)} ch="Job #" />
          <SH col="name" sort={pSort} onTog={c=>tog(pSort,c,setPSort)} ch="Project Name" />
          <SH col="status" sort={pSort} onTog={c=>tog(pSort,c,setPSort)} ch="Status" />
          <th style={adminTh}>Actions</th>
        </tr></thead><tbody>
          {sp.map(p=>(
            <tr key={p.id} style={{borderBottom:'1px solid #2a3050'}}>
              <td style={adminTd}><span style={{width:12,height:12,borderRadius:'50%',background:p.color,display:'inline-block'}} /></td>
              <td style={adminTd}>{p.job}</td><td style={adminTd}>{p.name}</td>
              <td style={adminTd}><StatusBadge s={p.status} /></td>
              <td style={adminTd}>
                <button onClick={()=>setProjectModal(p)} style={iconBtn}>✏️</button>
                <button onClick={async()=>{await withUndo(async()=>{
                  await supabase.from('projects').delete().eq('id',p.id)
                  const r=await supabase.from('projects').select('*').order('job'); setProjects(r.data||[])
                })}} style={{...iconBtn,color:'#f75c5c'}}>✕</button>
              </td>
            </tr>
          ))}
        </tbody></table>
      </AdminSection>
      <AdminSection title="⚙️ Admin & Recurring Tasks" onAdd={()=>setAdminTaskModal({})}>
        <table style={adminTableStyle}><thead><tr>
          <th style={adminTh}>Colour</th>
          <SH col="name" sort={aSort} onTog={c=>tog(aSort,c,setASort)} ch="Task Name" />
          <SH col="cat" sort={aSort} onTog={c=>tog(aSort,c,setASort)} ch="Category" />
          <th style={adminTh}>Actions</th>
        </tr></thead><tbody>
          {sa.map(a=>(
            <tr key={a.id} style={{borderBottom:'1px solid #2a3050'}}>
              <td style={adminTd}><span style={{width:12,height:12,borderRadius:'50%',background:a.color,display:'inline-block'}} /></td>
              <td style={adminTd}>{a.name}</td><td style={adminTd}>{a.cat}</td>
              <td style={adminTd}>
                <button onClick={()=>setAdminTaskModal(a)} style={iconBtn}>✏️</button>
                <button onClick={async()=>{await withUndo(async()=>{
                  await supabase.from('admin_tasks').delete().eq('id',a.id)
                  const r=await supabase.from('admin_tasks').select('*').order('name'); setAdminTasks(r.data||[])
                })}} style={{...iconBtn,color:'#f75c5c'}}>✕</button>
              </td>
            </tr>
          ))}
        </tbody></table>
      </AdminSection>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════
// TEAM TAB
// ═════════════════════════════════════════════════════════════════════
function TeamTab({teamMembers,setTeamMembers,setMemberModal,withUndo}){
  const [sort,setSort]=useState({col:'office',dir:1})
  function toggle(col){ setSort(s=>s.col===col?{col,dir:-s.dir}:{col,dir:1}) }
  const sorted=[...teamMembers].sort((a,b)=>{
    const av=(a[sort.col]||'').toString().toLowerCase()
    const bv=(b[sort.col]||'').toString().toLowerCase()
    return av<bv?-sort.dir:av>bv?sort.dir:0
  })
  const SH=({col,ch,width})=>(
    <th style={{...adminTh,cursor:'pointer',userSelect:'none',width:width||'auto'}} onClick={()=>toggle(col)}>
      {ch}{sort.col===col?(sort.dir===1?' ↑':' ↓'):''}
    </th>
  )
  return(
    <div style={{maxWidth:700}}>
      <AdminSection title="👥 Team Members" onAdd={()=>setMemberModal({})}>
        <table style={{...adminTableStyle,tableLayout:'fixed'}}><thead><tr>
          <SH col="name" ch="Name" width="200px" />
          <SH col="role" ch="Role" width="180px" />
          <SH col="office" ch="Office" width="160px" />
          <th style={{...adminTh,width:90}}>Actions</th>
        </tr></thead><tbody>
          {sorted.map(m=>(
            <tr key={m.id} style={{borderBottom:'1px solid #2a3050'}}>
              <td style={adminTd}><strong>{m.name}</strong></td>
              <td style={{...adminTd,color:'#9aa3c2'}}>{m.role}</td>
              <td style={adminTd}>
                <span style={{display:'inline-flex',alignItems:'center',gap:5,padding:'2px 10px',
                  borderRadius:10,fontSize:11,border:`1px solid ${getOfficeColor(m.office)}`,
                  color:getOfficeColor(m.office)}}>
                  {m.office} <OfficeFlag office={m.office} size={13} />
                </span>
              </td>
              <td style={adminTd}>
                <button onClick={()=>setMemberModal(m)} style={iconBtn}>✏️</button>
                <button onClick={async()=>{await withUndo(async()=>{
                  await supabase.from('team_members').delete().eq('id',m.id)
                  const r=await supabase.from('team_members').select('*').order('office').order('sort_order')
                  setTeamMembers(r.data||[])
                })}} style={{...iconBtn,color:'#f75c5c'}}>✕</button>
              </td>
            </tr>
          ))}
        </tbody></table>
      </AdminSection>
    </div>
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

// ═════════════════════════════════════════════════════════════════════
// MODALS
// ═════════════════════════════════════════════════════════════════════
function AssignModal({modal,onClose,projects,adminTasks,onSave,onClear,showToast}){
  const {name,dateStr,entry}=modal
  const [pid,setPid]=useState(()=>{
    if(!entry) return ''
    if(entry.task==='Annual Leave') return '__annual_leave__'
    if(entry.task==='Sick Leave') return '__sick_leave__'
    if(!entry.pid&&entry.task) return '__custom__'
    return entry.pid||''
  })
  const [customTask,setCustomTask]=useState(
    entry&&!entry.pid&&entry.task&&entry.task!=='Annual Leave'&&entry.task!=='Sick Leave'?entry.task:'')
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
