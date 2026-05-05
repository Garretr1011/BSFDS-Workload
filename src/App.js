import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from './lib/supabase'
import {
  fmtDate, fmtDisplay, fmtLeaveDate, fmtPHDate, parseLocalDate,
  addDays, isWeekend, getMondayOf, getWeekDays, DAY_SHORT,
  getActiveTask, buildTasksMap, buildLeaveMap, buildPHMap,
  getProjectColor, getProjectLabel, nextAutoColor,
  hexToRgb, getOfficeColor, CORE_OFFICES, OFFICE_COLORS
} from './lib/helpers'

// ── Theme tokens — three modes: steel / dark / light ─────────────────
function makeTheme(mode) {
  if (mode === 'steel') return {
    mode,
    pageBg:         '#0d1b2e',
    surfacePrimary: '#122038',
    surfaceSecond:  '#152640',
    surfaceHover:   '#1a3050',
    surfaceToday:   '#1a3a6a',
    border:         '#1e3a5a',
    borderLight:    '#1a3050',
    textPrimary:    '#ffffff',
    textSecondary:  '#7aa8d8',
    textMuted:      '#2e5070',
    textTab:        '#7aa8d8',
    blue:           '#2e7dd1',
    blueLight:      'rgba(46,125,209,.22)',
    blueText:       '#c8dff5',
    red:            '#e05555',
    redLight:       'rgba(224,85,85,.15)',
    redText:        '#e05555',
    green:          '#3cb87a',
    greenLight:     'rgba(60,184,122,.15)',
    greenText:      '#c8e8c8',
    amber:          '#f0a832',
    amberLight:     'rgba(240,168,50,.15)',
    amberText:      '#f0c060',
    gray:           '#4d82b0',
    grayLight:      'rgba(77,130,176,.13)',
    floatBg:        'rgba(13,27,46,.93)',
    modalBg:        '#122038',
    modalOverlay:   'rgba(0,0,0,.65)',
    tabActiveBorder:'#2e7dd1',
    tabActiveColor: '#2e7dd1',
    sectionBg:      '#122038',
    todayBg:        '#1a3a6a',
    todayText:      '#ffffff',
    todayBorder:    '#e05555',
  }
  if (mode === 'dark') return {
    mode,
    pageBg:         '#0f1117',
    surfacePrimary: '#181c27',
    surfaceSecond:  '#1e2335',
    surfaceHover:   '#232840',
    surfaceToday:   '#181d2a',
    border:         '#3a4268',
    borderLight:    '#2a3050',
    textPrimary:    '#ffffff',
    textSecondary:  '#c5cde8',
    textMuted:      '#4a5280',
    textTab:        '#9aa3c2',
    blue:           '#4f8ef7',
    blueLight:      'rgba(79,142,247,.22)',
    blueText:       '#ffffff',
    red:            '#f87171',
    redLight:       'rgba(248,113,113,.18)',
    redText:        '#f87171',
    green:          '#4ff7a2',
    greenLight:     'rgba(79,247,162,.15)',
    greenText:      '#ffffff',
    amber:          '#f7a24f',
    amberLight:     'rgba(247,162,79,.13)',
    amberText:      '#f7a24f',
    gray:           '#5a6380',
    grayLight:      'rgba(90,99,128,.13)',
    floatBg:        'rgba(15,17,23,.92)',
    modalBg:        '#181c27',
    modalOverlay:   'rgba(0,0,0,.6)',
    tabActiveBorder:'#4f8ef7',
    tabActiveColor: '#4f8ef7',
    sectionBg:      '#181c27',
    todayBg:        '#181d2a',
    todayText:      '#ffffff',
    todayBorder:    '#f87171',
  }
  // light
  return {
    mode,
    pageBg:         '#f0f2f7',
    surfacePrimary: '#ffffff',
    surfaceSecond:  '#e8eaf2',
    surfaceHover:   '#dde0ec',
    surfaceToday:   '#dbeafe',
    border:         '#d8dce8',
    borderLight:    '#e2e5f0',
    textPrimary:    '#1f2937',
    textSecondary:  '#6b7280',
    textMuted:      '#9ca3af',
    textTab:        '#6b7280',
    blue:           '#2563eb',
    blueLight:      '#dbeafe',
    blueText:       '#1e3a5f',
    red:            '#dc2626',
    redLight:       '#fee2e2',
    redText:        '#7f1d1d',
    green:          '#059669',
    greenLight:     '#d1fae5',
    greenText:      '#064e3b',
    amber:          '#b45309',
    amberLight:     '#fef3c7',
    amberText:      '#78350f',
    gray:           '#6b7280',
    grayLight:      '#f3f4f6',
    floatBg:        'rgba(240,242,247,.95)',
    modalBg:        '#ffffff',
    modalOverlay:   'rgba(0,0,0,.5)',
    tabActiveBorder:'#2563eb',
    tabActiveColor: '#2563eb',
    sectionBg:      '#eef0f8',
    todayBg:        '#dbeafe',
    todayText:      '#1e40af',
    todayBorder:    '#dc2626',
  }
}

// ── Country flags ──────────────────────────────────────────────────────
const FLAG_CODES = { Brisbane:'au', Chennai:'in', Bangkok:'th' }
function OfficeFlag({ office, size=16 }) {
  const code = FLAG_CODES[office]
  if (!code) return null
  return <img src={`https://flagcdn.com/w40/${code}.png`} alt={office}
    style={{width:size,height:'auto',borderRadius:2,verticalAlign:'middle',flexShrink:0}} />
}

// ── Toast ──────────────────────────────────────────────────────────────
function Toast({ msg, onDone }) {
  useEffect(()=>{ const t=setTimeout(onDone,3000); return ()=>clearTimeout(t) },[onDone])
  return <div style={{position:'fixed',bottom:24,left:'50%',transform:'translateX(-50%)',
    background:'rgba(220,38,38,.95)',color:'#fff',padding:'10px 20px',borderRadius:6,
    fontSize:13,zIndex:9999,fontFamily:'DM Mono,monospace',pointerEvents:'none'}}>{msg}</div>
}

// ── Drag Ghost ─────────────────────────────────────────────────────────
function DragGhost({ x, y, text, isCopy }) {
  if (!text) return null
  return <div style={{position:'fixed',left:x+14,top:y-16,pointerEvents:'none',zIndex:999,
    background:isCopy?'rgba(79,247,162,.2)':'rgba(79,142,247,.25)',
    border:`2px dashed ${isCopy?'#4ff7a2':'#4f8ef7'}`,
    borderRadius:4,padding:'4px 10px',fontSize:11,
    color:isCopy?'#4ff7a2':'#4f8ef7',whiteSpace:'nowrap'}}>{text}</div>
}

// ── Modal ──────────────────────────────────────────────────────────────
function Modal({ open, onClose, children, T }) {
  if (!open) return null
  return (
    <div onMouseDown={e=>e.target===e.currentTarget&&onClose()}
      style={{position:'fixed',inset:0,background:T.modalOverlay,zIndex:200,
        display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div onMouseDown={e=>e.stopPropagation()}
        style={{background:T.modalBg,border:`1px solid ${T.border}`,borderRadius:10,
          width:480,maxWidth:'95vw',padding:24,
          boxShadow:'0 24px 70px rgba(0,0,0,.4)',
          maxHeight:'90vh',overflowY:'auto',fontFamily:'DM Mono,monospace',color:T.textPrimary}}>
        {children}
      </div>
    </div>
  )
}

// ── Theme toggle — 3-way cycle button ─────────────────────────────────
const THEME_META = {
  steel: { icon: '⬡', label: 'Steel',  bg: '#0d1b2e', accent: '#2e7dd1', text: '#7aa8d8', border: '#1e3a5a' },
  dark:  { icon: '◉', label: 'Dark',   bg: '#0f1117', accent: '#4f8ef7', text: '#9aa3c2', border: '#3a4268' },
  light: { icon: '◎', label: 'Light',  bg: '#f0f2f7', accent: '#2563eb', text: '#6b7280', border: '#d8dce8' },
}
const THEME_ORDER = ['steel','dark','light']

function ThemeToggle({ T, onToggle }) {
  const current = THEME_META[T.mode]
  const nextMode = THEME_ORDER[(THEME_ORDER.indexOf(T.mode)+1) % 3]
  const next = THEME_META[nextMode]
  return (
    <button onClick={onToggle}
      title={`Switch to ${next.label} mode`}
      style={{
        display:'flex', alignItems:'center', gap:7,
        background: current.bg,
        border: `1px solid ${current.border}`,
        borderRadius:8, padding:'5px 12px 5px 8px',
        cursor:'pointer', transition:'all .2s',
        fontFamily:'DM Mono,monospace',
        flexShrink:0,
      }}>
      {/* Three dots showing position */}
      <span style={{display:'flex',gap:4,alignItems:'center'}}>
        {THEME_ORDER.map(m=>(
          <span key={m} style={{
            width: m===T.mode ? 8 : 5,
            height: m===T.mode ? 8 : 5,
            borderRadius:'50%',
            background: m===T.mode ? current.accent : current.border,
            transition:'all .2s',
            display:'inline-block',
          }} />
        ))}
      </span>
      {/* Current label */}
      <span style={{fontSize:11,color:current.text,letterSpacing:.3,lineHeight:1}}>
        {current.label}
      </span>
    </button>
  )
}

// ── Input styles (theme-aware) ─────────────────────────────────────────
function makeI(T) {
  return {
    base:{width:'100%',background:T.surfaceSecond,border:`1px solid ${T.border}`,
      color:T.textPrimary,padding:'8px 10px',borderRadius:4,fontSize:12,
      fontFamily:'DM Mono,monospace',boxSizing:'border-box'},
    label:{display:'block',fontSize:11,color:T.textSecondary,marginBottom:4,marginTop:13},
    row:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12},
  }
}

function makeBtnBase(T) {
  return {background:T.surfacePrimary,border:`1px solid ${T.border}`,color:T.textSecondary,
    padding:'6px 14px',borderRadius:4,cursor:'pointer',fontSize:12,fontFamily:'DM Mono,monospace'}
}

// ── Full DB snapshot for undo/redo ─────────────────────────────────────
async function takeSnapshot() {
  const [ta,ul,ph,pr,at,tm,ro] = await Promise.all([
    supabase.from('task_assignments').select('*'),
    supabase.from('upcoming_leave').select('*'),
    supabase.from('public_holidays').select('*'),
    supabase.from('projects').select('*'),
    supabase.from('admin_tasks').select('*'),
    supabase.from('team_members').select('*'),
    supabase.from('roles').select('*'),
  ])
  return { assignments:ta.data||[], leave:ul.data||[], ph:ph.data||[],
    projects:pr.data||[], adminTasks:at.data||[], teamMembers:tm.data||[],
    roles:ro.data||[] }
}

async function restoreSnapshot(snap, setters) {
  const { setAssignments,setUpcomingLeaveRows,setPublicHolidayRows,
    setProjects,setAdminTasks,setTeamMembers,setRoles } = setters
  await supabase.from('task_assignments').delete().neq('id','00000000-0000-0000-0000-000000000000')
  if(snap.assignments.length>0) await supabase.from('task_assignments').insert(
    snap.assignments.map(a=>({...a,updated_at:new Date().toISOString()})))
  await supabase.from('upcoming_leave').delete().neq('id','_none_')
  if(snap.leave.length>0) await supabase.from('upcoming_leave').insert(snap.leave)
  await supabase.from('public_holidays').delete().neq('id','_none_')
  if(snap.ph.length>0) await supabase.from('public_holidays').insert(snap.ph)
  await supabase.from('projects').delete().neq('id','_none_')
  if(snap.projects.length>0) await supabase.from('projects').insert(snap.projects)
  await supabase.from('admin_tasks').delete().neq('id','_none_')
  if(snap.adminTasks.length>0) await supabase.from('admin_tasks').insert(snap.adminTasks)
  await supabase.from('team_members').delete().neq('id','00000000-0000-0000-0000-000000000000')
  if(snap.teamMembers.length>0) await supabase.from('team_members').insert(snap.teamMembers)
  await supabase.from('roles').delete().neq('id','_none_')
  if(snap.roles?.length>0) await supabase.from('roles').insert(snap.roles)
  const [ta,ul,ph,pr,at,tm,ro] = await Promise.all([
    supabase.from('task_assignments').select('*'),
    supabase.from('upcoming_leave').select('*'),
    supabase.from('public_holidays').select('*').order('iso_date'),
    supabase.from('projects').select('*').order('job'),
    supabase.from('admin_tasks').select('*').order('name'),
    supabase.from('team_members').select('*').order('office').order('sort_order'),
    supabase.from('roles').select('*').order('sort_order'),
  ])
  setAssignments(ta.data||[]); setUpcomingLeaveRows(ul.data||[])
  setPublicHolidayRows(ph.data||[]); setProjects(pr.data||[])
  setAdminTasks(at.data||[]); setTeamMembers(tm.data||[])
  if(setRoles) setRoles(ro.data||[])
}

// ════════════════════════════════════════════════════════════════════
// MAIN APP
// ════════════════════════════════════════════════════════════════════
export default function App() {
  const [themeMode, setThemeMode] = useState(()=>localStorage.getItem('bsfds-theme')||'steel')
  const T = makeTheme(themeMode)
  function toggleTheme() {
    const cycle = { steel:'dark', dark:'light', light:'steel' }
    const next = cycle[themeMode]
    setThemeMode(next); localStorage.setItem('bsfds-theme',next)
  }

  const [tab, setTab] = useState('workload')
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)

  const [teamMembers, setTeamMembers] = useState([])
  const [projects, setProjects] = useState([])
  const [adminTasks, setAdminTasks] = useState([])
  const [roles, setRoles] = useState([])
  const [assignments, setAssignments] = useState([])
  const [upcomingLeaveRows, setUpcomingLeaveRows] = useState([])
  const [publicHolidayRows, setPublicHolidayRows] = useState([])

  const [tasks, setTasks] = useState({})
  const [upcomingLeave, setUpcomingLeave] = useState({})
  const [upcomingPH, setUpcomingPH] = useState({})

  const [weekStart, setWeekStart] = useState(()=>getMondayOf(new Date()))
  const [officeFilter, setOfficeFilter] = useState('all')
  const [projectFilter, setProjectFilter] = useState('all')
  const [leaveFilter, setLeaveFilter] = useState(false)
  const [unassignedFilter, setUnassignedFilter] = useState(false)
  const [search, setSearch] = useState('')
  const [gridWeeks, setGridWeeks] = useState(2)
  const [statWeeks, setStatWeeks] = useState(2)
  const [leaveStatWeeks, setLeaveStatWeeks] = useState(1)

  const [assignModal, setAssignModal] = useState(null)
  const [projectModal, setProjectModal] = useState(null)
  const [adminTaskModal, setAdminTaskModal] = useState(null)
  const [memberModal, setMemberModal] = useState(null)
  const [roleModal, setRoleModal] = useState(null)
  const [leaveModal, setLeaveModal] = useState(null)
  const [phModal, setPhModal] = useState(null)

  const [dragGhost, setDragGhost] = useState(null)
  const dragState = useRef(null)
  const copyDragState = useRef(null)
  const undoStack = useRef([])
  const redoStack = useRef([])
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  const showToast = useCallback(msg=>setToast(msg),[])
  const setters = {setAssignments,setUpcomingLeaveRows,setPublicHolidayRows,
    setProjects,setAdminTasks,setTeamMembers,setRoles}

  const reloadAssignments = useCallback(async()=>{
    const r=await supabase.from('task_assignments').select('*')
    setAssignments(r.data||[])
  },[])

  useEffect(()=>{
    async function loadAll() {
      setLoading(true)
      const [tm,pr,at,ta,ul,ph,ro] = await Promise.all([
        supabase.from('team_members').select('*').order('office').order('sort_order'),
        supabase.from('projects').select('*').order('job'),
        supabase.from('admin_tasks').select('*').order('name'),
        supabase.from('task_assignments').select('*'),
        supabase.from('upcoming_leave').select('*'),
        supabase.from('public_holidays').select('*').order('iso_date'),
        supabase.from('roles').select('*').order('sort_order'),
      ])
      setTeamMembers(tm.data||[]); setProjects(pr.data||[]); setAdminTasks(at.data||[])
      setAssignments(ta.data||[]); setUpcomingLeaveRows(ul.data||[]); setPublicHolidayRows(ph.data||[])
      setRoles(ro.data||[])
      setLoading(false)
    }
    loadAll()
  },[])

  useEffect(()=>{ setTasks(buildTasksMap(assignments)) },[assignments])
  useEffect(()=>{ setUpcomingLeave(buildLeaveMap(upcomingLeaveRows)) },[upcomingLeaveRows])
  useEffect(()=>{ setUpcomingPH(buildPHMap(publicHolidayRows)) },[publicHolidayRows])

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
      supabase.channel('rt-roles').on('postgres_changes',{event:'*',schema:'public',table:'roles'},
        ()=>supabase.from('roles').select('*').order('sort_order').then(r=>setRoles(r.data||[]))).subscribe(),
    ]
    return ()=>channels.forEach(c=>supabase.removeChannel(c))
  },[reloadAssignments])

  const days = getWeekDays(weekStart, gridWeeks)
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

  // Stats filtered by office
  const statMembers = officeFilter==='all' ? teamMembers : teamMembers.filter(m=>m.office===officeFilter)
  const statWorkdays=[]
  for(let i=0;i<statWeeks*7;i++){ const d=addDays(weekStart,i); if(!isWeekend(d)) statWorkdays.push(d) }
  let unassigned=0,assigned=0,totalPossible=0
  const unassignedNames=new Set()
  statMembers.forEach(({name})=>{
    let hasUnassigned=false
    statWorkdays.forEach(d=>{ totalPossible++; if(getActive(name,fmtDate(d))) assigned++; else{unassigned++;hasUnassigned=true} })
    if(hasUnassigned) unassignedNames.add(name)
  })
  const utilPct=totalPossible>0?Math.round(assigned/totalPossible*100):0
  const leaveStatWorkdays=[]
  for(let i=0;i<leaveStatWeeks*7;i++){ const d=addDays(weekStart,i); if(!isWeekend(d)) leaveStatWorkdays.push(d) }
  const onLeaveSet=new Set()
  statMembers.forEach(({name})=>{
    leaveStatWorkdays.forEach(d=>{ if(getActive(name,fmtDate(d))?.entry?.wtype==='leave') onLeaveSet.add(name) })
  })
  const onLeave=onLeaveSet.size, onLeaveHrs=onLeave*leaveStatWeeks*5*8
  const activeProjectsInWindow=projects.filter(p=>p.status==='active'&&
    teamMembers.some(m=>allWorkdays.some(d=>getActive(m.name,fmtDate(d))?.entry?.pid===p.id)))

  // Undo / Redo
  async function pushUndo() {
    const snap=await takeSnapshot(); undoStack.current.push(snap)
    redoStack.current=[]; setCanUndo(true); setCanRedo(false)
  }
  async function undo() {
    if(!undoStack.current.length) return
    const cur=await takeSnapshot(); redoStack.current.push(cur)
    const prev=undoStack.current.pop()
    setCanUndo(undoStack.current.length>0); setCanRedo(true)
    await restoreSnapshot(prev,setters); showToast('Undone')
  }
  async function redo() {
    if(!redoStack.current.length) return
    const cur=await takeSnapshot(); undoStack.current.push(cur)
    const next=redoStack.current.pop()
    setCanUndo(true); setCanRedo(redoStack.current.length>0)
    await restoreSnapshot(next,setters); showToast('Redone')
  }
  async function withUndo(fn) { await pushUndo(); await fn() }

  async function saveTask(name,dateStr,pid,taskLabel,wtype,endDate,notes,skipUndo=false) {
    if(!skipUndo) await pushUndo()
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

  async function adjustTaskDate(name,startDs,which,delta) {
    const entry=tasks[name]?.[startDs]?.[0]; if(!entry) return
    await pushUndo()
    let newStart=startDs,newEnd=entry.end_date
    function findOccupant(dateStr) {
      let adj=assignments.find(a=>a.member_name===name&&a.start_date===dateStr&&a.start_date!==startDs)
      if(adj) return adj
      return assignments.find(a=>a.member_name===name&&a.start_date<dateStr&&a.end_date>=dateStr&&a.start_date!==startDs)||null
    }
    if(which==='start') {
      let d=parseLocalDate(startDs); do{d=addDays(d,delta)}while(isWeekend(d)); newStart=fmtDate(d)
      if(newStart>newEnd) newEnd=newStart
      if(delta<0) {
        const adj=findOccupant(newStart)
        if(adj) {
          const adjDur=Math.round((parseLocalDate(adj.end_date)-parseLocalDate(adj.start_date))/86400000)
          if(adjDur===0) { await supabase.from('task_assignments').delete().eq('id',adj.id) }
          else {
            let e=addDays(parseLocalDate(newStart),-1); while(isWeekend(e)) e=addDays(e,-1)
            const eds=fmtDate(e)
            if(eds<adj.start_date) await supabase.from('task_assignments').delete().eq('id',adj.id)
            else await supabase.from('task_assignments').update({end_date:eds,updated_at:new Date().toISOString()}).eq('id',adj.id)
          }
        }
      }
    } else {
      let d=parseLocalDate(entry.end_date); do{d=addDays(d,delta)}while(isWeekend(d)); newEnd=fmtDate(d)
      if(newEnd<newStart) newStart=newEnd
      if(delta>0) {
        const adj=findOccupant(newEnd)
        if(adj) {
          const adjDur=Math.round((parseLocalDate(adj.end_date)-parseLocalDate(adj.start_date))/86400000)
          if(adjDur===0) { await supabase.from('task_assignments').delete().eq('id',adj.id) }
          else {
            let s=addDays(parseLocalDate(newEnd),1); while(isWeekend(s)) s=addDays(s,1)
            const sds=fmtDate(s)
            if(sds>adj.end_date) await supabase.from('task_assignments').delete().eq('id',adj.id)
            else await supabase.from('task_assignments').update({start_date:sds,updated_at:new Date().toISOString()}).eq('id',adj.id)
          }
        }
      }
    }
    if(newStart!==startDs)
      await supabase.from('task_assignments').delete().eq('member_name',name).eq('start_date',startDs)
    await saveTask(name,newStart,entry.pid,entry.task,entry.wtype,newEnd,entry.notes,true)
  }

  function startResize(e,name,startDs,handle) {
    e.preventDefault(); e.stopPropagation()
    const entry=tasks[name]?.[startDs]?.[0]; if(!entry) return
    dragState.current={name,startDs,entry,handle,currentStart:startDs,currentEnd:entry.end_date}
    setDragGhost({x:e.clientX,y:e.clientY,text:entry.task,isCopy:false})
  }
  function startCopy(e,name,startDs) {
    e.preventDefault(); e.stopPropagation()
    const active=getActive(name,startDs)
    if(!active||active.isVirtual) return
    copyDragState.current={name,startDs,entry:active.entry}
    setDragGhost({x:e.clientX,y:e.clientY,text:`+ ${active.entry.task}`,isCopy:true})
  }
  function getDateAtX(clientX) {
    const ths=document.querySelectorAll('#grid-thead th[data-date]')
    let best=null,bestDist=Infinity
    ths.forEach(th=>{
      const rect=th.getBoundingClientRect(),mid=(rect.left+rect.right)/2,dist=Math.abs(clientX-mid)
      if(clientX>=rect.left&&clientX<=rect.right){best=th.dataset.date;bestDist=0}
      else if(dist<bestDist){bestDist=dist;best=th.dataset.date}
    })
    return best
  }

  useEffect(()=>{
    function onMouseMove(e) {
      if(!dragState.current&&!copyDragState.current) return
      setDragGhost(g=>g?{...g,x:e.clientX,y:e.clientY}:null)
      if(dragState.current) {
        const {entry,handle}=dragState.current
        const targetDs=getDateAtX(e.clientX); if(!targetDs) return
        const targetDay=parseLocalDate(targetDs); if(isWeekend(targetDay)) return
        if(handle==='end'&&targetDs<dragState.current.currentStart) return
        if(handle==='start'&&targetDs>dragState.current.currentEnd) return
        if(handle==='end') dragState.current.currentEnd=targetDs
        else dragState.current.currentStart=targetDs
        const s=parseLocalDate(dragState.current.currentStart),t=parseLocalDate(dragState.current.currentEnd)
        const nd=Math.round((t-s)/86400000)+1
        const lbl=handle==='end'?`End -> ${fmtDisplay(targetDay)}`:`Start -> ${fmtDisplay(targetDay)}`
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
        if(targetName&&targetDs&&!isWeekend(parseLocalDate(targetDs))) {
          if(targetName===srcName&&targetDs===startDs) return
          const dur=entry.end_date>startDs?Math.round((parseLocalDate(entry.end_date)-parseLocalDate(startDs))/86400000):0
          const newEnd=dur>0?fmtDate(addDays(parseLocalDate(targetDs),dur)):targetDs
          function isSameTask(a){return a.member_name===targetName&&a.task===entry.task&&(a.pid||'')===(entry.pid||'')}
          let dayBefore=addDays(parseLocalDate(targetDs),-1); while(isWeekend(dayBefore)) dayBefore=addDays(dayBefore,-1)
          const dayBeforeDs=fmtDate(dayBefore)
          let dayAfter=addDays(parseLocalDate(newEnd),1); while(isWeekend(dayAfter)) dayAfter=addDays(dayAfter,1)
          const dayAfterDs=fmtDate(dayAfter)
          const mergeLeft=assignments.find(a=>isSameTask(a)&&a.end_date===dayBeforeDs)
          const mergeRight=assignments.find(a=>isSameTask(a)&&a.start_date===dayAfterDs)
          await pushUndo()
          if(mergeLeft) {
            const mergedEnd=newEnd>mergeLeft.end_date?newEnd:mergeLeft.end_date
            await supabase.from('task_assignments').update({end_date:mergedEnd,updated_at:new Date().toISOString()}).eq('id',mergeLeft.id)
            if(mergeRight){
              const finalEnd=mergeRight.end_date>mergedEnd?mergeRight.end_date:mergedEnd
              await supabase.from('task_assignments').update({end_date:finalEnd,updated_at:new Date().toISOString()}).eq('id',mergeLeft.id)
              await supabase.from('task_assignments').delete().eq('id',mergeRight.id)
            }
            showToast('Merged')
          } else if(mergeRight) {
            await supabase.from('task_assignments').update({start_date:targetDs,updated_at:new Date().toISOString()}).eq('id',mergeRight.id)
            showToast('Merged')
          } else {
            await saveTask(targetName,targetDs,entry.pid,entry.task,entry.wtype,newEnd,entry.notes,true)
            showToast(targetName===srcName?`Moved to ${fmtDisplay(parseLocalDate(targetDs))}`:`Copied to ${targetName}`)
          }
          await reloadAssignments()
        }
      }
    }
    window.addEventListener('mousemove',onMouseMove)
    window.addEventListener('mouseup',onMouseUp)
    return()=>{ window.removeEventListener('mousemove',onMouseMove); window.removeEventListener('mouseup',onMouseUp) }
  },[tasks,weekStart,assignments,showToast])

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

  function exportSummary() {
    const lines=[`BSFDS Workload Summary (${gridWeeks} weeks)`,
      `Period: ${fmtDisplay(allWorkdays[0])} to ${fmtDisplay(allWorkdays[allWorkdays.length-1])}`,
      `Generated: ${new Date().toLocaleString('en-AU')}`,'','='.repeat(70),'']
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

  const btnBase = makeBtnBase(T)

  if(loading) return(
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',
      background:T.pageBg,color:T.textSecondary,fontFamily:'DM Mono,monospace',fontSize:14}}>
      Loading BSFDS Workload Manager...
    </div>
  )

  return(
    <div style={{background:T.pageBg,minHeight:'100vh',color:T.textPrimary,fontFamily:'DM Mono,monospace'}}>
      {toast&&<Toast msg={toast} onDone={()=>setToast(null)} />}
      {dragGhost&&<DragGhost x={dragGhost.x} y={dragGhost.y} text={dragGhost.text} isCopy={dragGhost.isCopy} />}

      {/* Floating undo/redo bar */}
      <div style={{position:'fixed',top:0,left:0,right:0,zIndex:50,
        display:'flex',justifyContent:'flex-end',gap:6,padding:'6px 24px',
        background:T.floatBg,backdropFilter:'blur(8px)',
        borderBottom:`1px solid ${T.borderLight}`,pointerEvents:'none'}}>
        <div style={{display:'flex',gap:6,pointerEvents:'all'}}>
          <button onClick={undo} disabled={!canUndo} title="Undo"
            style={{...btnBase,opacity:canUndo?1:.35,cursor:canUndo?'pointer':'default',
              fontSize:11,padding:'4px 10px'}}>Undo</button>
          <button onClick={redo} disabled={!canRedo} title="Redo"
            style={{...btnBase,opacity:canRedo?1:.35,cursor:canRedo?'pointer':'default',
              fontSize:11,padding:'4px 10px'}}>Redo</button>
        </div>
      </div>

      <div style={{paddingTop:36}}>
      <div style={{maxWidth:1600,margin:'0 auto',padding:'16px 20px'}}>
        {/* Header */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',
          borderBottom:`1px solid ${T.borderLight}`,paddingBottom:16,marginBottom:0}}>
          <div style={{display:'flex',alignItems:'center',gap:18}}>
            <img src="/logo.png" alt="BSFDS" style={{height:60,objectFit:'contain'}}
              onError={e=>e.target.style.display='none'} />
            <div style={{fontFamily:'"Inter",system-ui,sans-serif',fontWeight:800,fontSize:28,
              letterSpacing:'-0.5px',lineHeight:1.2,color:T.textPrimary}}>
              BSFDS Workload Manager
            </div>
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <ThemeToggle T={T} onToggle={toggleTheme} />
            <button className="btn" onClick={exportSummary} style={{color:T.textSecondary,background:T.surfacePrimary,border:`1px solid ${T.border}`}}>Export</button>
            <button className="btn" onClick={()=>window.print()} style={{color:T.textSecondary,background:T.surfacePrimary,border:`1px solid ${T.border}`}}>Print</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{display:'flex',borderBottom:`1px solid ${T.borderLight}`,marginBottom:20}}>
          {[['workload','Workload'],['projects','Projects & Tasks'],['team','Team']].map(([id,label])=>(
            <div key={id} onClick={()=>setTab(id)}
              style={{padding:'12px 22px',fontSize:12,fontWeight:500,cursor:'pointer',
                color:tab===id?T.tabActiveColor:T.textTab,
                borderBottom:tab===id?`2px solid ${T.tabActiveBorder}`:'2px solid transparent',
                marginBottom:-1}}>
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
            roles={roles}
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
            withUndo={withUndo} showToast={showToast} T={T}
          />
        )}
        {tab==='projects'&&(
          <ProjectsTab projects={projects} setProjects={setProjects}
            adminTasks={adminTasks} setAdminTasks={setAdminTasks}
            setProjectModal={setProjectModal} setAdminTaskModal={setAdminTaskModal}
            withUndo={withUndo} T={T} />
        )}
        {tab==='team'&&(
          <TeamTab teamMembers={teamMembers} setTeamMembers={setTeamMembers}
            roles={roles} setRoles={setRoles}
            setMemberModal={setMemberModal} setRoleModal={setRoleModal}
            withUndo={withUndo} T={T} />
        )}
      </div>
      </div>

      {/* Modals */}
      {assignModal&&<AssignModal modal={assignModal} onClose={()=>setAssignModal(null)}
        projects={projects} adminTasks={adminTasks} onSave={saveTask} onClear={clearTask} showToast={showToast} T={T} />}
      {projectModal!==null&&<ProjectModal item={projectModal} projects={projects} adminTasks={adminTasks}
        onClose={()=>setProjectModal(null)} T={T}
        onSave={async row=>{
          await withUndo(async()=>{
            if(row.id) await supabase.from('projects').upsert(row)
            else await supabase.from('projects').insert({...row,id:'p'+Date.now()})
            const r=await supabase.from('projects').select('*').order('job'); setProjects(r.data||[])
          }); setProjectModal(null)
        }} />}
      {adminTaskModal!==null&&<AdminTaskModal item={adminTaskModal} projects={projects} adminTasks={adminTasks}
        onClose={()=>setAdminTaskModal(null)} T={T}
        onSave={async row=>{
          await withUndo(async()=>{
            if(row.id) await supabase.from('admin_tasks').upsert(row)
            else await supabase.from('admin_tasks').insert({...row,id:'a'+Date.now()})
            const r=await supabase.from('admin_tasks').select('*').order('name'); setAdminTasks(r.data||[])
          }); setAdminTaskModal(null)
        }} />}
      {memberModal!==null&&<MemberModal item={memberModal} teamMembers={teamMembers} roles={roles}
        onClose={()=>setMemberModal(null)} T={T}
        onSave={async row=>{
          await withUndo(async()=>{
            if(row.id) await supabase.from('team_members').update(row).eq('id',row.id)
            else await supabase.from('team_members').insert(row)
            const r=await supabase.from('team_members').select('*').order('office').order('sort_order'); setTeamMembers(r.data||[])
          }); setMemberModal(null)
        }} />}
      {roleModal!==null&&<RoleModal item={roleModal} roles={roles}
        onClose={()=>setRoleModal(null)} T={T} showToast={showToast}
        onSave={async row=>{
          await withUndo(async()=>{
            if(row.id&&roles.find(x=>x.id===row.id)) await supabase.from('roles').update(row).eq('id',row.id)
            else await supabase.from('roles').insert({...row,id:row.id||'r'+Date.now()})
            const r=await supabase.from('roles').select('*').order('sort_order'); setRoles(r.data||[])
          }); setRoleModal(null)
        }} />}
      {leaveModal!==null&&<LeaveModal item={leaveModal} teamMembers={teamMembers}
        onClose={()=>setLeaveModal(null)} showToast={showToast} T={T}
        onSave={async row=>{
          await withUndo(async()=>{
            if(row.id&&upcomingLeaveRows.find(x=>x.id===row.id)) await supabase.from('upcoming_leave').update(row).eq('id',row.id)
            else await supabase.from('upcoming_leave').insert({...row,id:row.id||'l'+Date.now()})
            const r=await supabase.from('upcoming_leave').select('*'); setUpcomingLeaveRows(r.data||[])
          }); setLeaveModal(null)
        }} />}
      {phModal!==null&&<PHModal item={phModal} onClose={()=>setPhModal(null)} showToast={showToast} T={T}
        onSave={async row=>{
          await withUndo(async()=>{
            if(row.id&&publicHolidayRows.find(x=>x.id===row.id)) await supabase.from('public_holidays').update(row).eq('id',row.id)
            else await supabase.from('public_holidays').insert({...row,id:row.id||'ph'+Date.now()})
            const r=await supabase.from('public_holidays').select('*').order('iso_date'); setPublicHolidayRows(r.data||[])
          }); setPhModal(null)
        }} />}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// WORKLOAD TAB
// ════════════════════════════════════════════════════════════════════
function WorkloadTab({days,weekSegments,allWorkdays,weekStart,setWeekStart,
  gridWeeks,setGridWeeks,teamMembers,projects,adminTasks,roles,tasks,upcomingLeave,upcomingPH,
  upcomingLeaveRows,setUpcomingLeaveRows,publicHolidayRows,setPublicHolidayRows,
  officeFilter,setOfficeFilter,projectFilter,setProjectFilter,
  leaveFilter,setLeaveFilter,unassignedFilter,setUnassignedFilter,
  onLeaveNames,unassignedNames,activeProjectsInWindow,
  search,setSearch,allOffices,onLeave,onLeaveHrs,leaveStatWeeks,setLeaveStatWeeks,
  unassigned,unassignedHrs,utilPct,statWeeks,setStatWeeks,
  getActive,setAssignModal,setLeaveModal,setPhModal,
  startResize,startCopy,adjustTaskDate,rowDragSrc,setRowDragSrc,
  moveRow,handleRowDrop,withUndo,showToast,T}) {

  const leaveByOffice={},phByOffice={}
  upcomingLeaveRows.forEach(l=>{if(!leaveByOffice[l.office])leaveByOffice[l.office]=[];leaveByOffice[l.office].push(l)})
  publicHolidayRows.forEach(p=>{if(!phByOffice[p.office])phByOffice[p.office]=[];phByOffice[p.office].push(p)})

  // Sort leave entries by start_date ascending
  Object.keys(leaveByOffice).forEach(o=>{
    leaveByOffice[o].sort((a,b)=>(a.start_date||'').localeCompare(b.start_date||''))
  })

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

  const thStyle={background:T.surfaceSecond,padding:'6px 5px 8px',textAlign:'center',
    fontSize:10,color:T.textSecondary,border:`1px solid ${T.borderLight}`}
  const thStyleToday={...thStyle,background:T.todayBg,borderBottom:`2px solid ${T.todayBorder}`}
  const tdStyle={background:T.surfacePrimary,border:`1px solid ${T.borderLight}`,
    verticalAlign:'top',cursor:'pointer',position:'relative'}

  const WeekToggle=({val,set})=>(
    <div style={{display:'flex',gap:3,marginTop:5}}>
      {[1,2,3,4].map(w=>(
        <button key={w} onClick={()=>set(w)}
          style={{padding:'1px 6px',borderRadius:3,fontSize:10,cursor:'pointer',
            border:`1px solid ${T.border}`,
            background:val===w?T.blue:'transparent',
            color:val===w?'#fff':T.textSecondary}}>{w}w</button>
      ))}
    </div>
  )

  const FilterToggleBtn=({active,onClick,color,children})=>(
    <button onClick={onClick}
      style={{marginTop:4,padding:'2px 8px',borderRadius:3,fontSize:10,cursor:'pointer',
        border:`1px solid ${active?color:T.border}`,
        background:active?`${color}22`:'transparent',
        color:active?color:T.textSecondary,display:'flex',alignItems:'center',gap:4}}>
      {active?'x clear':'filter'} {children}
    </button>
  )

  const lastDay=allWorkdays[allWorkdays.length-1]

  return(
    <div>
      {/* Stat cards */}
      <div style={{display:'flex',gap:10,marginBottom:18,flexWrap:'wrap'}}>
        <StatCard label="Total Team" color={T.blue} T={T}>
          <span style={{fontSize:26,fontWeight:700}}>{teamMembers.length}</span>
        </StatCard>
        {allOffices.map(o=>(
          <StatCard key={o} label={<span style={{display:'flex',alignItems:'center',gap:4}}>{o} <OfficeFlag office={o} size={13} /></span>} color={OFFICE_COLORS[o]||'#b87fff'} T={T}>
            <span style={{fontSize:26,fontWeight:700}}>{teamMembers.filter(m=>m.office===o).length}</span>
          </StatCard>
        ))}
        <StatCard label="Team Members On Leave" color={T.red} T={T}>
          <span style={{fontSize:26,fontWeight:700}}>{onLeave}</span>
          <div style={{fontSize:10,color:T.red,marginTop:2}}>{onLeaveHrs} hrs</div>
          <WeekToggle val={leaveStatWeeks} set={setLeaveStatWeeks} />
          <FilterToggleBtn active={leaveFilter} onClick={()=>{setLeaveFilter(v=>!v);setUnassignedFilter(false)}} color={T.red}>on leave</FilterToggleBtn>
        </StatCard>
        <StatCard label="Unassigned" color={T.gray} T={T}>
          <div style={{display:'flex',alignItems:'baseline',gap:6}}>
            <span style={{fontSize:26,fontWeight:700}}>{unassigned}</span>
            <span style={{fontSize:11,color:T.gray}}>days / {unassignedHrs} hrs</span>
          </div>
          <div style={{fontSize:10,color:T.green,marginTop:2}}>Utilisation {utilPct}%</div>
          <WeekToggle val={statWeeks} set={setStatWeeks} />
          <FilterToggleBtn active={unassignedFilter} onClick={()=>{setUnassignedFilter(v=>!v);setLeaveFilter(false)}} color={T.gray}>unassigned</FilterToggleBtn>
        </StatCard>
      </div>

      {/* Office filters */}
      <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:8}}>
        {['all',...allOffices].map(o=>(
          <button key={o} onClick={()=>setOfficeFilter(o)}
            style={{padding:'4px 12px',borderRadius:20,fontSize:11,cursor:'pointer',
              border:officeFilter===o?'none':`1px solid ${T.border}`,
              background:officeFilter===o?(o==='all'?T.gray:OFFICE_COLORS[o]||'#b87fff'):T.surfacePrimary,
              color:officeFilter===o?'#fff':T.textSecondary}}>
            {o==='all'?'All Offices':<>{o} <OfficeFlag office={o} size={14} /></>}
          </button>
        ))}
      </div>

      {/* Project filters */}
      {activeProjectsInWindow.length>0&&(
        <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:12}}>
          <button onClick={()=>setProjectFilter('all')}
            style={{padding:'3px 10px',borderRadius:20,fontSize:10,cursor:'pointer',
              border:projectFilter==='all'?'none':`1px solid ${T.border}`,
              background:projectFilter==='all'?T.gray:T.surfacePrimary,
              color:projectFilter==='all'?'#fff':T.textSecondary}}>All Projects</button>
          {activeProjectsInWindow.map(p=>(
            <button key={p.id} onClick={()=>setProjectFilter(p.id)}
              style={{padding:'3px 10px',borderRadius:20,fontSize:10,cursor:'pointer',
                border:projectFilter===p.id?'none':`1px solid ${T.border}`,
                background:projectFilter===p.id?p.color:T.surfacePrimary,
                color:projectFilter===p.id?'#111':T.textSecondary}}>
              {p.job?`${p.job} ${p.name}`:p.name}
            </button>
          ))}
        </div>
      )}

      {/* Search + view toggle + nav */}
      <div style={{display:'flex',gap:10,marginBottom:16,flexWrap:'wrap',alignItems:'center'}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name..."
          style={{background:T.surfaceSecond,border:`1px solid ${T.border}`,color:T.textPrimary,
            padding:'6px 12px',borderRadius:4,fontSize:12,width:180}} />
        <div style={{display:'flex',gap:4,alignItems:'center'}}>
          <span style={{fontSize:10,color:T.textSecondary,marginRight:2}}>View:</span>
          {[1,2,3,4].map(w=>(
            <button key={w} onClick={()=>setGridWeeks(w)}
              style={{padding:'4px 10px',borderRadius:4,fontSize:11,cursor:'pointer',
                border:`1px solid ${T.border}`,
                background:gridWeeks===w?T.blue:T.surfacePrimary,
                color:gridWeeks===w?'#fff':T.textSecondary}}>{w}W</button>
          ))}
        </div>
        <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:10}}>
          <button className="btn" style={{color:T.textSecondary,background:T.surfacePrimary,border:`1px solid ${T.border}`}}
            onClick={()=>setWeekStart(w=>addDays(w,-7))}>Prev</button>
          <div style={{fontSize:12,color:T.textSecondary,textAlign:'center',minWidth:200}}>
            <strong style={{display:'block',fontSize:13,color:T.textPrimary}}>
              {fmtDisplay(allWorkdays[0])} - {fmtDisplay(lastDay)}
            </strong>
            <span>{allWorkdays[0].toLocaleDateString('en-AU',{month:'short',year:'numeric'})}</span>
          </div>
          <button className="btn" style={{color:T.textSecondary,background:T.surfacePrimary,border:`1px solid ${T.border}`}}
            onClick={()=>setWeekStart(w=>addDays(w,7))}>Next</button>
          <button className="btn" style={{color:T.textSecondary,background:T.surfacePrimary,border:`1px solid ${T.border}`}}
            onClick={()=>setWeekStart(getMondayOf(new Date()))}>Today</button>
        </div>
      </div>

      {/* Grid */}
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
                const ds=fmtDate(d),isToday=ds===fmtDate(new Date()),dayIdx=wi*7+i
                return(
                  <th key={ds} data-date={ds} style={isToday?thStyleToday:thStyle}>
                    {isToday&&<div style={{fontSize:8,color:T.todayBorder,fontWeight:700,letterSpacing:.5,marginBottom:1}}>TODAY</div>}
                    <div style={{fontSize:11,color:isToday?T.todayText:T.textPrimary,fontWeight:500}}>{DAY_SHORT[dayIdx]}</div>
                    <div style={{fontSize:9,color:T.textSecondary}}>{fmtDisplay(d)}</div>
                  </th>
                )
              }),
              <th key={`ss${wi}`} data-weekend="1"
                style={{...thStyle,background:T.mode!=='light'?'#0d1018':T.surfaceSecond,opacity:.5,
                  fontSize:8,color:T.textMuted,writingMode:'vertical-rl'}}>S/S</th>
            ])}
          </tr></thead>
          <tbody>
            {allOffices.map(office=>{
              const members=officeGroups[office]; if(!members?.length) return null
              const colSpan=weekSegments.length*6+1
              return[
                <tr key={`sec-${office}`}>
                  <td colSpan={colSpan} style={{fontFamily:'Syne,sans-serif',fontSize:10,fontWeight:700,
                    letterSpacing:2,textTransform:'uppercase',padding:'6px 14px',
                    color:OFFICE_COLORS[office]||'#b87fff',background:T.sectionBg,
                    borderLeft:`3px solid ${OFFICE_COLORS[office]||'#b87fff'}`,
                    borderBottom:`1px solid ${T.borderLight}`}}>
                    <span style={{display:'flex',alignItems:'center',gap:6}}>{office} Office <OfficeFlag office={office} size={13} /></span>
                  </td>
                </tr>,
                ...members.map(m=>(
                  <MemberRow key={m.id} member={m}
                    weekSegments={weekSegments} allWorkdays={allWorkdays}
                    getActive={getActive} projects={projects} adminTasks={adminTasks} roles={roles}
                    setAssignModal={setAssignModal}
                    startResize={startResize} startCopy={startCopy}
                    adjustTaskDate={adjustTaskDate}
                    rowDragSrc={rowDragSrc} setRowDragSrc={setRowDragSrc}
                    onMoveRow={(dir)=>moveRow(m.id,m.office,dir)}
                    onRowDrop={()=>handleRowDrop(m.id,m.office)}
                    T={T} tdStyle={tdStyle} />
                ))
              ]
            })}
          </tbody>
        </table>
      </div>

      {/* Leave & PH panels */}
      <SectionTitle title="Upcoming Leave" T={T} />
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:16}}>
        {['Brisbane','Chennai','Bangkok'].map(o=>(
          <LeavePanel key={o} office={o} color={OFFICE_COLORS[o]}
            items={leaveByOffice[o]||[]} onAdd={()=>setLeaveModal({office:o})}
            onEdit={item=>setLeaveModal(item)} onDelete={id=>deleteLeave(id)} T={T} />
        ))}
      </div>
      <SectionTitle title="Upcoming Public Holidays" T={T} />
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:16,marginBottom:40}}>
        {['Brisbane','Chennai','Bangkok'].map(o=>(
          <PHPanel key={o} office={o} color={OFFICE_COLORS[o]}
            items={phByOffice[o]||[]} onAdd={()=>setPhModal({office:o})}
            onEdit={item=>setPhModal(item)} onDelete={id=>deletePH(id)} T={T} />
        ))}
      </div>
    </div>
  )
}

function StatCard({label,color,children,T}){
  return(
    <div style={{background:T.surfacePrimary,border:`1px solid ${T.border}`,borderRadius:6,
      padding:'10px 14px',minWidth:100,flex:1}}>
      <div style={{fontSize:10,color:T.textSecondary,marginBottom:4,letterSpacing:.3}}>{label}</div>
      <div style={{color,fontFamily:'system-ui,-apple-system,sans-serif'}}>{children}</div>
    </div>
  )
}

function SectionTitle({title,T}){
  return(
    <div style={{fontFamily:'Syne,sans-serif',fontSize:12,fontWeight:700,letterSpacing:1.5,
      textTransform:'uppercase',color:T.textSecondary,marginTop:28,marginBottom:10,
      display:'flex',alignItems:'center',gap:8}}>
      {title}<div style={{flex:1,height:1,background:T.borderLight}} />
    </div>
  )
}

// ── Member Row ─────────────────────────────────────────────────────────
function MemberRow({member,weekSegments,allWorkdays,getActive,projects,adminTasks,roles,
  setAssignModal,startResize,startCopy,adjustTaskDate,rowDragSrc,setRowDragSrc,onMoveRow,onRowDrop,T,tdStyle}){
  const [hovered,setHovered]=useState(false)
  const isDragTarget=rowDragSrc&&rowDragSrc.id!==member.id&&rowDragSrc.office===member.office
  const allWorkDays=allWorkdays
  const todayDs=fmtDate(new Date())

  function renderWeek(workDays){
    const cells=[]; let i=0
    while(i<workDays.length){
      const d=workDays[i],ds=fmtDate(d)
      const isToday=ds===todayDs
      const active=getActive(member.name,ds)
      if(!active){
        cells.push(
          <td key={ds} onClick={()=>setAssignModal({name:member.name,dateStr:ds,entry:null})}
            style={{...tdStyle,minHeight:52,background:isToday?T.surfaceToday:T.surfacePrimary}}
            onMouseEnter={e=>e.currentTarget.style.background=isToday?T.surfaceHover:T.surfaceHover}
            onMouseLeave={e=>e.currentTarget.style.background=isToday?T.surfaceToday:T.surfacePrimary}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'center',
              minHeight:52,color:T.textMuted,fontSize:10,padding:4}}>+ assign</div>
          </td>
        ); i++; continue
      }
      const {entry,startDs,isVirtual}=active
      let span=1,j=i+1
      while(j<workDays.length){
        const nA=getActive(member.name,fmtDate(workDays[j]))
        if(nA&&nA.startDs===startDs&&JSON.stringify(nA.entry)===JSON.stringify(entry)){span++;j++}else break
      }

      // Arrow visibility
      const showStartArrows=!isVirtual&&(()=>{
        for(const wd of allWorkDays){
          const wds=fmtDate(wd)
          if(wds===ds) return true
          const a=getActive(member.name,wds)
          if(a&&a.startDs===startDs) return false
        }
        return true
      })()
      const lastCellDs=fmtDate(workDays[j-1])
      const showEndArrows=!isVirtual&&(()=>{
        for(let k=allWorkDays.length-1;k>=0;k--){
          const wds=fmtDate(allWorkDays[k])
          const a=getActive(member.name,wds)
          if(a&&a.startDs===startDs) return wds===lastCellDs
        }
        return false
      })()

      // Colours
      const projColor=['leave','ph'].includes(entry.wtype)?null:getProjectColor(entry.pid,projects,adminTasks)
      let bg=T.surfacePrimary,bc=T.blue,textColor=T.textPrimary
      if(entry.wtype==='leave'){bg=T.redLight;bc=T.red;textColor=T.redText}
      else if(entry.wtype==='ph'){bg=T.amberLight;bc=T.amber;textColor=T.amberText}
      else if(entry.wtype==='admin'){bg=T.grayLight;bc=T.gray;textColor=T.textSecondary}
      else if(projColor){const {r,g,b}=hexToRgb(projColor);bg=`rgba(${r},${g},${b},${T.mode!=='light'?.18:.15})`;bc=projColor;textColor=T.mode!=='light'?'#ffffff':projColor}

      const arrowBtn={background:T.mode!=='light'?'rgba(255,255,255,.06)':'rgba(0,0,0,.06)',
        border:'none',cursor:'pointer',color:T.mode!=='light'?'rgba(255,255,255,.4)':'rgba(0,0,0,.35)',
        fontSize:8,padding:'2px 3px',lineHeight:1,borderRadius:2}

      cells.push(
        <td key={ds} colSpan={span}
          style={{...tdStyle,cursor:isVirtual?'default':'pointer',background:bg,borderLeft:`3px solid ${bc}`}}
          onClick={()=>!isVirtual&&setAssignModal({name:member.name,dateStr:startDs,entry})}
          onMouseDown={!isVirtual?(e=>{if(e.target.closest('button'))return;if(e.button===0)startCopy(e,member.name,startDs)}):undefined}>
          <div style={{padding:'4px 6px',display:'flex',alignItems:'flex-start',gap:3,minHeight:52}}>
            {showStartArrows&&(
              <div style={{display:'flex',flexDirection:'column',gap:1,flexShrink:0,paddingTop:4}}>
                <button title="Move start earlier" onMouseDown={e=>e.stopPropagation()}
                  onClick={e=>{e.stopPropagation();adjustTaskDate(member.name,startDs,'start',-1)}} style={arrowBtn}>{'<'}</button>
                <button title="Move start later" onMouseDown={e=>e.stopPropagation()}
                  onClick={e=>{e.stopPropagation();adjustTaskDate(member.name,startDs,'start',1)}} style={arrowBtn}>{'>'}</button>
              </div>
            )}
            <div style={{flex:1,minWidth:0,userSelect:'none'}}>
              <div style={{fontSize:10,fontWeight:500,color:textColor,wordBreak:'break-word',lineHeight:1.3}}>{entry.task}</div>
              {entry.notes&&<div style={{fontSize:9,color:T.textSecondary,marginTop:2,wordBreak:'break-word',lineHeight:1.3}}>{entry.notes}</div>}
              {entry.wtype&&!['leave','ph','admin'].includes(entry.wtype)&&(
                <div style={{fontSize:9,color:T.textSecondary,fontStyle:'italic',marginTop:1}}>{entry.wtype}</div>
              )}
            </div>
            {showEndArrows&&(
              <div style={{display:'flex',flexDirection:'column',gap:1,flexShrink:0,paddingTop:4}}>
                <button title="Move end earlier" onMouseDown={e=>e.stopPropagation()}
                  onClick={e=>{e.stopPropagation();adjustTaskDate(member.name,startDs,'end',-1)}} style={arrowBtn}>{'<'}</button>
                <button title="Move end later" onMouseDown={e=>e.stopPropagation()}
                  onClick={e=>{e.stopPropagation();adjustTaskDate(member.name,startDs,'end',1)}} style={arrowBtn}>{'>'}</button>
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
      style={{outline:isDragTarget?`1px dashed ${T.blue}`:'none'}}
      onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)}>
      <td style={{background:T.surfaceSecond,border:`1px solid ${T.borderLight}`,
        padding:'6px 8px 6px 12px',verticalAlign:'middle',position:'sticky',left:0,zIndex:2}}>
        {(()=>{
          const cat=getRoleCat(member.role, roles)
          const cc=CAT_COLORS[cat]
          return(
            <div style={{display:'flex',alignItems:'center',gap:6,
              background:cc.bg,borderLeft:`3px solid ${cc.border}`,
              margin:'-6px -8px -6px -12px',padding:'6px 8px 6px 9px',height:'100%'}}>
              <span style={{cursor:'grab',color:T.textMuted,fontSize:12,opacity:hovered?1:0,transition:'opacity .15s',userSelect:'none'}}>::::</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:11,fontWeight:500,color:T.textPrimary,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{member.name}</div>
                <div style={{fontSize:9,color:cc.text,opacity:.8}}>{member.role}</div>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:1,opacity:hovered?1:0,transition:'opacity .15s'}}>
                <button onClick={()=>onMoveRow(-1)} style={{background:'none',border:'none',cursor:'pointer',color:T.textSecondary,padding:'1px 3px',fontSize:10,lineHeight:1}}>^</button>
                <button onClick={()=>onMoveRow(1)} style={{background:'none',border:'none',cursor:'pointer',color:T.textSecondary,padding:'1px 3px',fontSize:10,lineHeight:1}}>v</button>
              </div>
            </div>
          )
        })()}
      </td>
      {weekSegments.flatMap((seg,wi)=>[
        ...renderWeek(seg.work),
        <td key={`ss${wi}`} style={{background:T.mode!=='light'?'#0a0d14':T.surfaceSecond,border:`1px solid ${T.borderLight}`,width:26}} />
      ])}
    </tr>
  )
}

// ── Leave & PH Panels ─────────────────────────────────────────────────
function LeavePanel({office,color,items,onAdd,onEdit,onDelete,T}){
  return(
    <div style={{background:T.surfacePrimary,border:`1px solid ${T.border}`,borderRadius:6,padding:14}}>
      <div style={{fontFamily:'Syne,sans-serif',fontSize:11,fontWeight:700,letterSpacing:1.5,
        textTransform:'uppercase',color,marginBottom:10,display:'flex',alignItems:'center',gap:8}}>
        <span style={{width:7,height:7,borderRadius:'50%',background:color,display:'inline-block'}} />
        {office} <OfficeFlag office={office} size={13} />
        <button onClick={onAdd} style={{marginLeft:'auto',background:T.surfaceSecond,border:`1px solid ${T.border}`,
          color:T.textSecondary,padding:'2px 8px',borderRadius:3,cursor:'pointer',fontSize:14}}>+</button>
      </div>
      {items.length===0&&<div style={{fontSize:11,color:T.textMuted}}>No upcoming leave</div>}
      {items.map(l=>(
        <div key={l.id} style={{display:'flex',alignItems:'center',padding:'5px 0',
          borderBottom:`1px solid ${T.borderLight}`,fontSize:11,gap:6}}>
          <span style={{color:T.textPrimary,flex:1}}>{l.name}</span>
          <span style={{color:T.textSecondary,fontSize:10,whiteSpace:'nowrap'}}>
            {l.start_date?fmtLeaveDate(l.start_date):''} - {l.end_date?fmtLeaveDate(l.end_date):''}
          </span>
          <button onClick={()=>onEdit(l)} style={{background:'none',border:'none',cursor:'pointer',color:T.textSecondary,padding:'2px 4px',fontSize:15}}>✎</button>
          <button onClick={()=>onDelete(l.id)} style={{background:'none',border:'none',cursor:'pointer',color:T.red,padding:'2px 4px',fontSize:13}}>x</button>
        </div>
      ))}
    </div>
  )
}

function PHPanel({office,color,items,onAdd,onEdit,onDelete,T}){
  return(
    <div style={{background:T.surfacePrimary,border:`1px solid ${T.border}`,borderRadius:6,padding:14}}>
      <div style={{fontFamily:'Syne,sans-serif',fontSize:11,fontWeight:700,letterSpacing:1.5,
        textTransform:'uppercase',color,marginBottom:10,display:'flex',alignItems:'center',gap:8}}>
        <span style={{width:7,height:7,borderRadius:'50%',background:color,display:'inline-block'}} />
        {office} <OfficeFlag office={office} size={13} />
        <button onClick={onAdd} style={{marginLeft:'auto',background:T.surfaceSecond,border:`1px solid ${T.border}`,
          color:T.textSecondary,padding:'2px 8px',borderRadius:3,cursor:'pointer',fontSize:14}}>+</button>
      </div>
      {items.length===0&&<div style={{fontSize:11,color:T.textMuted}}>No upcoming public holidays</div>}
      {items.map(p=>(
        <div key={p.id} style={{display:'flex',alignItems:'center',padding:'5px 0',
          borderBottom:`1px solid ${T.borderLight}`,fontSize:11,gap:6}}>
          <span style={{color:T.textSecondary,flex:1}}>{p.name}</span>
          <span style={{color:T.textSecondary,fontSize:10,whiteSpace:'nowrap'}}>{p.iso_date?fmtPHDate(p.iso_date):p.display_date}</span>
          <button onClick={()=>onEdit(p)} style={{background:'none',border:'none',cursor:'pointer',color:T.textSecondary,padding:'2px 4px',fontSize:15}}>✎</button>
          <button onClick={()=>onDelete(p.id)} style={{background:'none',border:'none',cursor:'pointer',color:T.red,padding:'2px 4px',fontSize:13}}>x</button>
        </div>
      ))}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// PROJECTS TAB
// ════════════════════════════════════════════════════════════════════
function ProjectsTab({projects,setProjects,adminTasks,setAdminTasks,setProjectModal,setAdminTaskModal,withUndo,T}){
  const [pSort,setPSort]=useState({col:'job',dir:1})
  const [aSort,setASort]=useState({col:'name',dir:1})
  function tog(cur,col,set){ cur.col===col?set({col,dir:-cur.dir}):set({col,dir:1}) }
  const sp=[...projects].sort((a,b)=>{ const av=(a[pSort.col]||'').toLowerCase(),bv=(b[pSort.col]||'').toLowerCase(); return av<bv?-pSort.dir:av>bv?pSort.dir:0 })
  const sa=[...adminTasks].sort((a,b)=>{ const av=(a[aSort.col]||'').toLowerCase(),bv=(b[aSort.col]||'').toLowerCase(); return av<bv?-aSort.dir:av>bv?aSort.dir:0 })
  const adminTh={textAlign:'left',padding:'8px 14px',fontSize:10,color:T.textSecondary,fontWeight:500,borderBottom:`1px solid ${T.border}`,background:T.surfaceSecond}
  const adminTd={padding:'8px 14px',verticalAlign:'middle',color:T.textPrimary}
  const SH=({col,sort,onTog,ch})=>(
    <th style={{...adminTh,cursor:'pointer',userSelect:'none'}} onClick={()=>onTog(col)}>
      {ch}{sort.col===col?(sort.dir===1?' ^':' v'):''}
    </th>
  )
  const iconBtn={background:'none',border:'none',cursor:'pointer',color:T.textSecondary,padding:'2px 6px',fontSize:13}
  return(
    <div>
      <AdminSection title="Active Projects" onAdd={()=>setProjectModal({})} T={T}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}><thead><tr>
          <th style={adminTh}>Colour</th>
          <SH col="job" sort={pSort} onTog={c=>tog(pSort,c,setPSort)} ch="Job #" />
          <SH col="name" sort={pSort} onTog={c=>tog(pSort,c,setPSort)} ch="Project Name" />
          <SH col="status" sort={pSort} onTog={c=>tog(pSort,c,setPSort)} ch="Status" />
          <th style={adminTh}>Actions</th>
        </tr></thead><tbody>
          {sp.map(p=>(
            <tr key={p.id} style={{borderBottom:`1px solid ${T.border}`}}>
              <td style={adminTd}><span style={{width:12,height:12,borderRadius:'50%',background:p.color,display:'inline-block'}} /></td>
              <td style={adminTd}>{p.job}</td><td style={adminTd}>{p.name}</td>
              <td style={adminTd}><StatusBadge s={p.status} /></td>
              <td style={adminTd}>
                <button onClick={()=>setProjectModal(p)} style={{...iconBtn,fontSize:15}}>✎</button>
                <button onClick={async()=>{await withUndo(async()=>{
                  await supabase.from('projects').delete().eq('id',p.id)
                  const r=await supabase.from('projects').select('*').order('job'); setProjects(r.data||[])
                })}} style={{...iconBtn,color:T.red}}>x</button>
              </td>
            </tr>
          ))}
        </tbody></table>
      </AdminSection>
      <AdminSection title="Admin & Recurring Tasks" onAdd={()=>setAdminTaskModal({})} T={T}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}><thead><tr>
          <th style={adminTh}>Colour</th>
          <SH col="name" sort={aSort} onTog={c=>tog(aSort,c,setASort)} ch="Task Name" />
          <SH col="cat" sort={aSort} onTog={c=>tog(aSort,c,setASort)} ch="Category" />
          <th style={adminTh}>Actions</th>
        </tr></thead><tbody>
          {sa.map(a=>(
            <tr key={a.id} style={{borderBottom:`1px solid ${T.border}`}}>
              <td style={adminTd}><span style={{width:12,height:12,borderRadius:'50%',background:a.color,display:'inline-block'}} /></td>
              <td style={adminTd}>{a.name}</td><td style={adminTd}>{a.cat}</td>
              <td style={adminTd}>
                <button onClick={()=>setAdminTaskModal(a)} style={{...iconBtn,fontSize:15}}>✎</button>
                <button onClick={async()=>{await withUndo(async()=>{
                  await supabase.from('admin_tasks').delete().eq('id',a.id)
                  const r=await supabase.from('admin_tasks').select('*').order('name'); setAdminTasks(r.data||[])
                })}} style={{...iconBtn,color:T.red}}>x</button>
              </td>
            </tr>
          ))}
        </tbody></table>
      </AdminSection>
    </div>
  )
}

// ── Role seed data (used only for SQL seeding reference in code) ──────
// Live roles come from Supabase 'roles' table — PREDEFINED_ROLES is the fallback
const PREDEFINED_ROLES = [
  { id:'r1',  title:'Section Manager',    cat:'other', sort_order:1 },
  { id:'r2',  title:'Section Leader',     cat:'other', sort_order:2 },
  { id:'r3',  title:'Senior Team Leader', cat:'3d',    sort_order:3 },
  { id:'r4',  title:'Team Leader',        cat:'3d',    sort_order:4 },
  { id:'r5',  title:'Junior Team Leader', cat:'3d',    sort_order:5 },
  { id:'r6',  title:'Senior Checker',     cat:'2d',    sort_order:6 },
  { id:'r7',  title:'Checker',            cat:'2d',    sort_order:7 },
  { id:'r8',  title:'Junior Checker',     cat:'2d',    sort_order:8 },
  { id:'r9',  title:'Senior Modeler',     cat:'3d',    sort_order:9 },
  { id:'r10', title:'Modeler',            cat:'3d',    sort_order:10 },
  { id:'r11', title:'Junior Modeler',     cat:'3d',    sort_order:11 },
  { id:'r12', title:'Senior Editor',      cat:'2d',    sort_order:12 },
  { id:'r13', title:'Editor',             cat:'2d',    sort_order:13 },
  { id:'r14', title:'Junior Editor',      cat:'2d',    sort_order:14 },
  { id:'r15', title:'Admin Assistant',    cat:'other', sort_order:15 },
  { id:'r16', title:'Cadet',              cat:'other', sort_order:16 },
]

const CAT_COLORS = {
  '3d':    { bg:'rgba(46,125,209,.18)',  border:'#2e7dd1', text:'#2e7dd1', label:'3D' },
  '2d':    { bg:'rgba(60,184,122,.18)',  border:'#3cb87a', text:'#3cb87a', label:'2D' },
  'other': { bg:'rgba(150,130,80,.18)', border:'#b8922a', text:'#b8922a', label:'Other' },
}

// Accepts live roles from DB, falls back to built-in list
function getRoleCat(roleTitle, liveRoles) {
  const list = (liveRoles&&liveRoles.length>0) ? liveRoles : PREDEFINED_ROLES
  return list.find(r=>r.title===roleTitle)?.cat || 'other'
}

// ════════════════════════════════════════════════════════════════════
// TEAM TAB
// ════════════════════════════════════════════════════════════════════
function TeamTab({teamMembers,setTeamMembers,roles,setRoles,setMemberModal,setRoleModal,withUndo,T}){
  const [sort,setSort]=useState({col:'office',dir:1})
  function toggle(col){ setSort(s=>s.col===col?{col,dir:-s.dir}:{col,dir:1}) }
  const sorted=[...teamMembers].sort((a,b)=>{
    const av=(a[sort.col]||'').toString().toLowerCase()
    const bv=(b[sort.col]||'').toString().toLowerCase()
    return av<bv?-sort.dir:av>bv?sort.dir:0
  })
  const adminTh={textAlign:'left',padding:'8px 14px',fontSize:10,color:T.textSecondary,
    fontWeight:500,borderBottom:`1px solid ${T.border}`,background:T.surfaceSecond,
    cursor:'pointer',userSelect:'none'}
  const adminTd={padding:'8px 14px',verticalAlign:'middle',color:T.textPrimary}
  const iconBtn={background:'none',border:'none',cursor:'pointer',color:T.textSecondary,padding:'2px 6px',fontSize:13}
  const SH=({col,ch,width})=>(
    <th style={{...adminTh,width:width||'auto'}} onClick={()=>toggle(col)}>
      {ch}{sort.col===col?(sort.dir===1?' ^':' v'):''}
    </th>
  )

  const liveRoles = roles.length>0 ? roles : PREDEFINED_ROLES

  async function deleteRole(id) {
    await withUndo(async()=>{
      await supabase.from('roles').delete().eq('id',id)
      const r=await supabase.from('roles').select('*').order('sort_order')
      setRoles(r.data||[])
    })
  }

  return(
    <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:20,alignItems:'start',maxWidth:1100}}>
      {/* Team members table */}
      <AdminSection title="Team Members" onAdd={()=>setMemberModal({})} T={T}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,tableLayout:'fixed'}}><thead><tr>
          <SH col="name" ch="Name" width="180px" />
          <SH col="role" ch="Role" width="180px" />
          <th style={{...adminTh,width:60}}>Cat</th>
          <SH col="office" ch="Office" width="140px" />
          <th style={{...adminTh,width:80}}>Actions</th>
        </tr></thead><tbody>
          {sorted.map(m=>{
            const cat=getRoleCat(m.role, liveRoles)
            const cc=CAT_COLORS[cat]
            return(
              <tr key={m.id} style={{borderBottom:`1px solid ${T.border}`}}>
                <td style={{...adminTd,background:cc.bg}}>
                  <strong style={{color:T.textPrimary}}>{m.name}</strong>
                </td>
                <td style={{...adminTd,color:T.textSecondary,background:cc.bg}}>{m.role}</td>
                <td style={{...adminTd,background:cc.bg}}>
                  <span style={{display:'inline-block',padding:'1px 7px',borderRadius:8,fontSize:10,
                    border:`1px solid ${cc.border}`,color:cc.text,background:'transparent',whiteSpace:'nowrap'}}>
                    {cc.label}
                  </span>
                </td>
                <td style={adminTd}>
                  <span style={{display:'inline-flex',alignItems:'center',gap:5,padding:'2px 10px',
                    borderRadius:10,fontSize:11,border:`1px solid ${getOfficeColor(m.office)}`,
                    color:getOfficeColor(m.office)}}>
                    {m.office} <OfficeFlag office={m.office} size={12} />
                  </span>
                </td>
                <td style={adminTd}>
                  <button onClick={()=>setMemberModal(m)} style={{...iconBtn,fontSize:15}}>✎</button>
                  <button onClick={async()=>{await withUndo(async()=>{
                    await supabase.from('team_members').delete().eq('id',m.id)
                    const r=await supabase.from('team_members').select('*').order('office').order('sort_order')
                    setTeamMembers(r.data||[])
                  })}} style={{...iconBtn,color:T.red}}>✕</button>
                </td>
              </tr>
            )
          })}
        </tbody></table>
      </AdminSection>

      {/* Roles table — editable */}
      <div style={{background:T.surfacePrimary,border:`1px solid ${T.border}`,borderRadius:6,
        overflow:'hidden',minWidth:280,flexShrink:0}}>
        <div style={{padding:'12px 16px',background:T.surfaceSecond,borderBottom:`1px solid ${T.border}`,
          display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div style={{fontFamily:'Syne,sans-serif',fontSize:13,fontWeight:700,color:T.textPrimary}}>Roles</div>
          <button onClick={()=>setRoleModal({})}
            style={{background:T.blue,border:'none',color:'#fff',
              padding:'4px 12px',borderRadius:4,cursor:'pointer',fontSize:12}}>+ Add</button>
        </div>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
          <thead><tr>
            <th style={{...adminTh,padding:'6px 12px',width:28}}>#</th>
            <th style={{...adminTh,padding:'6px 12px'}}>Designation</th>
            <th style={{...adminTh,padding:'6px 12px',width:60}}>Cat</th>
            <th style={{...adminTh,padding:'6px 12px',width:64}}>Actions</th>
          </tr></thead>
          <tbody>
            {liveRoles.map((r,i)=>{
              const cc=CAT_COLORS[r.cat]||CAT_COLORS.other
              return(
                <tr key={r.id} style={{borderBottom:`1px solid ${T.borderLight}`,background:cc.bg}}>
                  <td style={{padding:'5px 12px',color:T.textMuted,textAlign:'center'}}>{i+1}</td>
                  <td style={{padding:'5px 12px',color:T.textPrimary}}>{r.title}</td>
                  <td style={{padding:'5px 12px'}}>
                    <span style={{padding:'1px 6px',borderRadius:8,fontSize:9,
                      border:`1px solid ${cc.border}`,color:cc.text}}>{cc.label}</span>
                  </td>
                  <td style={{padding:'4px 8px'}}>
                    <button onClick={()=>setRoleModal(r)}
                      style={{...iconBtn,padding:'2px 4px',fontSize:14}}>✎</button>
                    <button onClick={()=>deleteRole(r.id)}
                      style={{...iconBtn,padding:'2px 4px',color:T.red}}>✕</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {/* Legend */}
        <div style={{padding:'10px 12px',borderTop:`1px solid ${T.border}`,display:'flex',gap:12,flexWrap:'wrap'}}>
          {Object.entries(CAT_COLORS).map(([k,v])=>(
            <span key={k} style={{display:'flex',alignItems:'center',gap:4,fontSize:10,color:T.textSecondary}}>
              <span style={{width:10,height:10,borderRadius:2,background:v.bg,
                border:`1px solid ${v.border}`,display:'inline-block'}} />
              {v.label}
            </span>
          ))}
        </div>
      </div>
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

function AdminSection({title,onAdd,children,T}){
  return(
    <div style={{background:T.surfacePrimary,border:`1px solid ${T.border}`,borderRadius:6,marginBottom:16,overflow:'hidden'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',
        padding:'12px 16px',background:T.surfaceSecond,borderBottom:`1px solid ${T.border}`}}>
        <div style={{fontFamily:'Syne,sans-serif',fontSize:13,fontWeight:700,color:T.textPrimary}}>{title}</div>
        <button onClick={onAdd} style={{background:T.blue,border:'none',color:'#fff',
          padding:'4px 12px',borderRadius:4,cursor:'pointer',fontSize:12}}>+ Add</button>
      </div>
      {children}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// MODALS
// ════════════════════════════════════════════════════════════════════
function AssignModal({modal,onClose,projects,adminTasks,onSave,onClear,showToast,T}){
  const {name,dateStr,entry}=modal
  const I=makeI(T); const btnBase=makeBtnBase(T)
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
    <Modal open onClose={onClose} T={T}>
      <h3 style={{fontFamily:'Syne,sans-serif',fontSize:15,marginBottom:3,color:T.textPrimary}}>{name}</h3>
      <div style={{fontSize:11,color:T.textSecondary,marginBottom:18}}>
        {d.toLocaleDateString('en-AU',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}
      </div>
      <label style={I.label}>Project / Task</label>
      <select value={pid} onChange={e=>setPid(e.target.value)} style={I.base}>
        <option value="">- select -</option>
        <optgroup label="Leave">
          <option value="__annual_leave__">Annual Leave</option>
          <option value="__sick_leave__">Sick Leave</option>
        </optgroup>
        {projects.filter(p=>p.status==='active').length>0&&<optgroup label="Active Projects">
          {projects.filter(p=>p.status==='active').map(p=><option key={p.id} value={p.id}>{p.job} - {p.name}</option>)}
        </optgroup>}
        {adminTasks.length>0&&<optgroup label="Admin & Recurring">
          {adminTasks.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
        </optgroup>}
        <option value="__custom__">Custom...</option>
      </select>
      {pid==='__custom__'&&<input value={customTask} onChange={e=>setCustomTask(e.target.value)}
        placeholder="Task description..." style={{...I.base,marginTop:6}} />}
      {isLeave&&<div style={{fontSize:10,color:T.red,marginTop:6,padding:'4px 8px',
        background:T.redLight,borderRadius:4}}>Work type set automatically to Leave</div>}
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
      <textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Optional notes..."
        style={{...I.base,resize:'vertical',minHeight:50}} />
      <div style={{display:'flex',gap:8,marginTop:18,justifyContent:'flex-end'}}>
        {entry&&<button onClick={async()=>{await onClear(name,dateStr);onClose()}}
          style={{...btnBase,borderColor:T.red,color:T.red}}>Clear</button>}
        <button onClick={onClose} style={btnBase}>Cancel</button>
        <button onClick={save} style={{...btnBase,background:T.blue,borderColor:T.blue,color:'#fff'}}>Save</button>
      </div>
    </Modal>
  )
}

function ProjectModal({item,onClose,onSave,projects,adminTasks,T}){
  const I=makeI(T); const btnBase=makeBtnBase(T)
  const [job,setJob]=useState(item?.job||'')
  const [name,setName]=useState(item?.name||'')
  const [status,setStatus]=useState(item?.status||'active')
  const [color,setColor]=useState(item?.color||nextAutoColor(projects,adminTasks))
  return(
    <Modal open onClose={onClose} T={T}>
      <h3 style={{fontFamily:'Syne,sans-serif',fontSize:15,marginBottom:3,color:T.textPrimary}}>{item?.id?'Edit Project':'Add Project'}</h3>
      <label style={I.label}>Job #</label>
      <input value={job} onChange={e=>setJob(e.target.value)} placeholder="e.g. 23-081" style={I.base} />
      <label style={I.label}>Project Name</label>
      <input value={name} onChange={e=>setName(e.target.value)} style={I.base} />
      <label style={I.label}>Status</label>
      <select value={status} onChange={e=>setStatus(e.target.value)} style={I.base}>
        <option value="active">Active</option><option value="onhold">On Hold</option><option value="completed">Completed</option>
      </select>
      <label style={I.label}>Colour</label>
      <div style={{display:'flex',alignItems:'center',gap:10,marginTop:4}}>
        <input type="color" value={color} onChange={e=>setColor(e.target.value)}
          style={{height:36,padding:'2px 4px',width:60,background:T.surfaceSecond,border:`1px solid ${T.border}`,borderRadius:4}} />
        <span style={{fontSize:11,color:T.textSecondary}}>{color}</span>
      </div>
      <div style={{display:'flex',gap:8,marginTop:18,justifyContent:'flex-end'}}>
        <button onClick={onClose} style={btnBase}>Cancel</button>
        <button onClick={()=>onSave({...item,job,name,status,color})}
          style={{...btnBase,background:T.blue,borderColor:T.blue,color:'#fff'}}>Save</button>
      </div>
    </Modal>
  )
}

function AdminTaskModal({item,onClose,onSave,projects,adminTasks,T}){
  const I=makeI(T); const btnBase=makeBtnBase(T)
  const [name,setName]=useState(item?.name||'')
  const [cat,setCat]=useState(item?.cat||'admin')
  const [color,setColor]=useState(item?.color||nextAutoColor(projects,adminTasks))
  return(
    <Modal open onClose={onClose} T={T}>
      <h3 style={{fontFamily:'Syne,sans-serif',fontSize:15,marginBottom:3,color:T.textPrimary}}>{item?.id?'Edit Task':'Add Admin Task'}</h3>
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
          style={{height:36,padding:'2px 4px',width:60,background:T.surfaceSecond,border:`1px solid ${T.border}`,borderRadius:4}} />
        <span style={{fontSize:11,color:T.textSecondary}}>{color}</span>
      </div>
      <div style={{display:'flex',gap:8,marginTop:18,justifyContent:'flex-end'}}>
        <button onClick={onClose} style={btnBase}>Cancel</button>
        <button onClick={()=>onSave({...item,name,cat,color})}
          style={{...btnBase,background:T.blue,borderColor:T.blue,color:'#fff'}}>Save</button>
      </div>
    </Modal>
  )
}

function MemberModal({item,onClose,onSave,teamMembers,roles,T}){
  const I=makeI(T); const btnBase=makeBtnBase(T)
  const [name,setName]=useState(item?.name||'')
  const [role,setRole]=useState(item?.role||'')
  const [office,setOffice]=useState(item?.office||'Brisbane')
  const [customOffice,setCustomOffice]=useState('')
  const known=['Brisbane','Chennai','Bangkok']
  const custom=[...new Set((teamMembers||[]).map(m=>m.office).filter(o=>!known.includes(o)))]
  const liveRoles = roles&&roles.length>0 ? roles : PREDEFINED_ROLES
  const cat = getRoleCat(role, liveRoles)
  const cc = CAT_COLORS[cat]||CAT_COLORS.other
  return(
    <Modal open onClose={onClose} T={T}>
      <h3 style={{fontFamily:'Syne,sans-serif',fontSize:15,marginBottom:3,color:T.textPrimary}}>{item?.id?'Edit Member':'Add Member'}</h3>
      <label style={I.label}>Name</label>
      <input value={name} onChange={e=>setName(e.target.value)} placeholder="Full name" style={I.base} />
      <label style={I.label}>Role</label>
      <select value={role} onChange={e=>setRole(e.target.value)} style={I.base}>
        <option value="">— select role —</option>
        {liveRoles.map(r=>(
          <option key={r.id} value={r.title}>{r.title}</option>
        ))}
      </select>
      {role&&(
        <div style={{marginTop:6,display:'flex',alignItems:'center',gap:8}}>
          <span style={{padding:'2px 10px',borderRadius:8,fontSize:11,
            border:`1px solid ${cc.border}`,color:cc.text,background:cc.bg}}>
            {cc.label}
          </span>
          <span style={{fontSize:11,color:T.textSecondary}}>category</span>
        </div>
      )}
      <label style={I.label}>Office</label>
      <select value={office} onChange={e=>setOffice(e.target.value)} style={I.base}>
        {[...known,...custom].map(o=><option key={o}>{o}</option>)}
        <option value="__other__">Other (specify)...</option>
      </select>
      {office==='__other__'&&<input value={customOffice} onChange={e=>setCustomOffice(e.target.value)}
        placeholder="Office name..." style={{...I.base,marginTop:6}} />}
      <div style={{display:'flex',gap:8,marginTop:18,justifyContent:'flex-end'}}>
        <button onClick={onClose} style={btnBase}>Cancel</button>
        <button onClick={()=>{
          const fo=office==='__other__'?customOffice.trim():office
          if(!name||!fo) return
          onSave({...item,name,role,office:fo,sort_order:item?.sort_order||99})
        }} style={{...btnBase,background:T.blue,borderColor:T.blue,color:'#fff'}}>Save</button>
      </div>
    </Modal>
  )
}

function LeaveModal({item,onClose,onSave,teamMembers,showToast,T}){
  const I=makeI(T); const btnBase=makeBtnBase(T)
  const [office,setOffice]=useState(item?.office||'Brisbane')
  const [name,setName]=useState(item?.name||'')
  const [startDate,setStartDate]=useState(item?.start_date||'')
  const [endDate,setEndDate]=useState(item?.end_date||'')
  const [dates,setDates]=useState(item?.dates||'')
  const members=teamMembers.filter(m=>m.office===office)
  return(
    <Modal open onClose={onClose} T={T}>
      <h3 style={{fontFamily:'Syne,sans-serif',fontSize:15,marginBottom:3,color:T.textPrimary}}>{item?.id?'Edit Leave':'Add Leave'}</h3>
      <label style={I.label}>Office</label>
      <select value={office} onChange={e=>{setOffice(e.target.value);setName('')}} style={I.base}>
        {['Brisbane','Chennai','Bangkok'].map(o=><option key={o}>{o}</option>)}
      </select>
      <label style={I.label}>Person</label>
      <select value={name} onChange={e=>setName(e.target.value)} style={I.base}>
        <option value="">- select -</option>
        {members.map(m=><option key={m.id} value={m.name}>{m.name}</option>)}
      </select>
      <div style={I.row}>
        <div><label style={I.label}>Start Date</label>
          <input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} style={I.base} /></div>
        <div><label style={I.label}>End Date</label>
          <input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)} style={I.base} /></div>
      </div>
      <label style={I.label}>Display Label (auto if blank)</label>
      <input value={dates} onChange={e=>setDates(e.target.value)} placeholder="e.g. 05 May - 18 May" style={I.base} />
      <div style={{display:'flex',gap:8,marginTop:18,justifyContent:'flex-end'}}>
        <button onClick={onClose} style={btnBase}>Cancel</button>
        <button onClick={()=>{
          if(!name||!startDate||!endDate){showToast('Name and dates required');return}
          let d=dates
          if(!d){
            const s=parseLocalDate(startDate),e=parseLocalDate(endDate)
            const n=Math.round((e-s)/86400000)+1
            d=`${fmtLeaveDate(startDate)} - ${fmtLeaveDate(endDate)}${n>1?' ('+n+' days)':''}`
          }
          onSave({...item,office,name,start_date:startDate,end_date:endDate,dates:d})
        }} style={{...btnBase,background:T.blue,borderColor:T.blue,color:'#fff'}}>Save</button>
      </div>
    </Modal>
  )
}

function PHModal({item,onClose,onSave,showToast,T}){
  const I=makeI(T); const btnBase=makeBtnBase(T)
  const [office,setOffice]=useState(item?.office||'Brisbane')
  const [name,setName]=useState(item?.name||'')
  const [isoDate,setIsoDate]=useState(item?.iso_date||'')
  const [endIsoDate,setEndIsoDate]=useState(item?.end_iso_date||'')
  return(
    <Modal open onClose={onClose} T={T}>
      <h3 style={{fontFamily:'Syne,sans-serif',fontSize:15,marginBottom:3,color:T.textPrimary}}>{item?.id?'Edit Public Holiday':'Add Public Holiday'}</h3>
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
      {isoDate&&<div style={{fontSize:11,color:T.amber,marginTop:8}}>
        Preview: {fmtPHDate(isoDate)}{endIsoDate&&endIsoDate!==isoDate?` - ${fmtPHDate(endIsoDate)}`:''}
      </div>}
      <div style={{display:'flex',gap:8,marginTop:18,justifyContent:'flex-end'}}>
        <button onClick={onClose} style={btnBase}>Cancel</button>
        <button onClick={()=>{
          if(!name||!isoDate){showToast('Name and date required');return}
          const display=endIsoDate&&endIsoDate!==isoDate
            ?`${fmtPHDate(isoDate)} - ${fmtPHDate(endIsoDate)}`:fmtPHDate(isoDate)
          onSave({...item,office,name,iso_date:isoDate,end_iso_date:endIsoDate||null,display_date:display})
        }} style={{...btnBase,background:T.blue,borderColor:T.blue,color:'#fff'}}>Save</button>
      </div>
    </Modal>
  )
}

// ════════════════════════════════════════════════════════════════════
// ROLE MODAL
// ════════════════════════════════════════════════════════════════════
function RoleModal({item,onClose,onSave,roles,showToast,T}){
  const I=makeI(T); const btnBase=makeBtnBase(T)
  const isNew=!item?.id
  const maxOrder=roles&&roles.length>0?Math.max(...roles.map(r=>r.sort_order||0))+1:1
  const [title,setTitle]=useState(item?.title||'')
  const [cat,setCat]=useState(item?.cat||'3d')
  const [sortOrder,setSortOrder]=useState(item?.sort_order||maxOrder)
  const cc=CAT_COLORS[cat]||CAT_COLORS.other
  return(
    <Modal open onClose={onClose} T={T}>
      <h3 style={{fontFamily:'Syne,sans-serif',fontSize:15,marginBottom:3,color:T.textPrimary}}>
        {isNew?'Add Role':'Edit Role'}
      </h3>
      <label style={I.label}>Designation / Title</label>
      <input value={title} onChange={e=>setTitle(e.target.value)}
        placeholder="e.g. Senior Modeler" style={I.base} />
      <label style={I.label}>Category</label>
      <div style={{display:'flex',gap:8,marginTop:6}}>
        {Object.entries(CAT_COLORS).map(([k,v])=>(
          <button key={k} onClick={()=>setCat(k)}
            style={{flex:1,padding:'8px',borderRadius:6,cursor:'pointer',fontSize:12,
              border:`2px solid ${cat===k?v.border:T.border}`,
              background:cat===k?v.bg:T.surfaceSecond,
              color:cat===k?v.text:T.textSecondary,
              fontFamily:'DM Mono,monospace',transition:'all .15s'}}>
            {v.label}
          </button>
        ))}
      </div>
      <div style={{marginTop:10,padding:'8px 12px',borderRadius:6,background:cc.bg,
        border:`1px solid ${cc.border}`,display:'flex',alignItems:'center',gap:10}}>
        <span style={{fontSize:12,color:cc.text,fontWeight:500}}>{title||'Role name'}</span>
        <span style={{padding:'1px 8px',borderRadius:8,fontSize:10,
          border:`1px solid ${cc.border}`,color:cc.text}}>{cc.label}</span>
      </div>
      <label style={I.label}>Sort Order</label>
      <input type="number" value={sortOrder} onChange={e=>setSortOrder(Number(e.target.value))}
        min={1} style={{...I.base,width:100}} />
      <div style={{display:'flex',gap:8,marginTop:18,justifyContent:'flex-end'}}>
        <button onClick={onClose} style={btnBase}>Cancel</button>
        <button onClick={()=>{
          if(!title.trim()){showToast('Enter a role title');return}
          onSave({...item,title:title.trim(),cat,sort_order:sortOrder})
        }} style={{...btnBase,background:T.blue,borderColor:T.blue,color:'#fff'}}>Save</button>
      </div>
    </Modal>
  )
}
