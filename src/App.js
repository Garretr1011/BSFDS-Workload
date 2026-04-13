import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from './lib/supabase'
import {
  fmtDate, fmtDisplay, parseLocalDate, addDays, isWeekend,
  getMondayOf, getWeekDays, DAY_SHORT, getActiveTask, getVirtualTask,
  buildTasksMap, buildLeaveMap, buildPHMap,
  getProjectColor, getProjectLabel, nextAutoColor,
  hexToRgb, getOfficeColor, CORE_OFFICES
} from './lib/helpers'

const LOGO_URL = 'https://ffuiorgurvrwylwkmdes.supabase.co/storage/v1/object/public/assets/logo.png'

// ─── Toast ───────────────────────────────────────────────────────────
function Toast({ msg, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t) }, [onDone])
  return (
    <div style={{position:'fixed',bottom:24,left:'50%',transform:'translateX(-50%)',
      background:'rgba(247,92,92,.95)',color:'#fff',padding:'10px 20px',borderRadius:6,
      fontSize:13,zIndex:9999,fontFamily:'DM Mono,monospace',pointerEvents:'none'}}>
      {msg}
    </div>
  )
}

// ─── Modal wrapper ────────────────────────────────────────────────────
function Modal({ open, onClose, children }) {
  if (!open) return null
  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{position:'fixed',inset:0,background:'rgba(0,0,0,.78)',zIndex:200,
        display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{background:'#181c27',border:'1px solid #2a3050',borderRadius:10,
        width:480,maxWidth:'95vw',padding:24,boxShadow:'0 24px 70px rgba(0,0,0,.6)',
        maxHeight:'90vh',overflowY:'auto',fontFamily:'DM Mono,monospace'}}>
        {children}
      </div>
    </div>
  )
}

const I = { // input styles
  base: {width:'100%',background:'#1e2335',border:'1px solid #2a3050',color:'#e2e8ff',
    padding:'8px 10px',borderRadius:4,fontSize:12,fontFamily:'DM Mono,monospace',boxSizing:'border-box'},
  label: {display:'block',fontSize:11,color:'#9aa3c2',marginBottom:4,marginTop:13},
  row: {display:'grid',gridTemplateColumns:'1fr 1fr',gap:12},
}

// ─── Main App ─────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState('workload')
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)

  // Data
  const [teamMembers, setTeamMembers] = useState([])
  const [projects, setProjects] = useState([])
  const [adminTasks, setAdminTasks] = useState([])
  const [assignments, setAssignments] = useState([])
  const [upcomingLeaveRows, setUpcomingLeaveRows] = useState([])
  const [publicHolidayRows, setPublicHolidayRows] = useState([])

  // Derived maps
  const [tasks, setTasks] = useState({})
  const [upcomingLeave, setUpcomingLeave] = useState({})
  const [upcomingPH, setUpcomingPH] = useState({})

  // UI state
  const [weekStart, setWeekStart] = useState(() => getMondayOf(new Date()))
  const [officeFilter, setOfficeFilter] = useState('all')
  const [search, setSearch] = useState('')

  // Modals
  const [assignModal, setAssignModal] = useState(null) // {name, dateStr, entry}
  const [projectModal, setProjectModal] = useState(null)
  const [adminTaskModal, setAdminTaskModal] = useState(null)
  const [memberModal, setMemberModal] = useState(null)
  const [leaveModal, setLeaveModal] = useState(null)
  const [phModal, setPhModal] = useState(null)

  const showToast = useCallback(msg => setToast(msg), [])

  // ── Load all data ──
  useEffect(() => {
    async function loadAll() {
      setLoading(true)
      const [tm, pr, at, ta, ul, ph] = await Promise.all([
        supabase.from('team_members').select('*').order('office').order('sort_order'),
        supabase.from('projects').select('*').order('job'),
        supabase.from('admin_tasks').select('*').order('name'),
        supabase.from('task_assignments').select('*'),
        supabase.from('upcoming_leave').select('*'),
        supabase.from('public_holidays').select('*').order('iso_date'),
      ])
      setTeamMembers(tm.data || [])
      setProjects(pr.data || [])
      setAdminTasks(at.data || [])
      setAssignments(ta.data || [])
      setUpcomingLeaveRows(ul.data || [])
      setPublicHolidayRows(ph.data || [])
      setLoading(false)
    }
    loadAll()
  }, [])

  // Rebuild derived maps when raw data changes
  useEffect(() => { setTasks(buildTasksMap(assignments)) }, [assignments])
  useEffect(() => { setUpcomingLeave(buildLeaveMap(upcomingLeaveRows)) }, [upcomingLeaveRows])
  useEffect(() => { setUpcomingPH(buildPHMap(publicHolidayRows)) }, [publicHolidayRows])

  // ── Realtime subscriptions ──
  useEffect(() => {
    const channels = [
      supabase.channel('team').on('postgres_changes',{event:'*',schema:'public',table:'team_members'},
        () => supabase.from('team_members').select('*').order('office').order('sort_order').then(r => setTeamMembers(r.data||[]))).subscribe(),
      supabase.channel('proj').on('postgres_changes',{event:'*',schema:'public',table:'projects'},
        () => supabase.from('projects').select('*').order('job').then(r => setProjects(r.data||[]))).subscribe(),
      supabase.channel('admin').on('postgres_changes',{event:'*',schema:'public',table:'admin_tasks'},
        () => supabase.from('admin_tasks').select('*').order('name').then(r => setAdminTasks(r.data||[]))).subscribe(),
      supabase.channel('tasks').on('postgres_changes',{event:'*',schema:'public',table:'task_assignments'},
        () => supabase.from('task_assignments').select('*').then(r => setAssignments(r.data||[]))).subscribe(),
      supabase.channel('leave').on('postgres_changes',{event:'*',schema:'public',table:'upcoming_leave'},
        () => supabase.from('upcoming_leave').select('*').then(r => setUpcomingLeaveRows(r.data||[]))).subscribe(),
      supabase.channel('ph').on('postgres_changes',{event:'*',schema:'public',table:'public_holidays'},
        () => supabase.from('public_holidays').select('*').order('iso_date').then(r => setPublicHolidayRows(r.data||[]))).subscribe(),
    ]
    return () => channels.forEach(c => supabase.removeChannel(c))
  }, [])

  const days = getWeekDays(weekStart)
  const week1Work = days.slice(0,5)
  const week2Work = days.slice(7,12)
  const allWorkdays = [...week1Work, ...week2Work]

  const allOffices = [...new Set([...CORE_OFFICES, ...teamMembers.map(m => m.office)])]
    .filter(o => teamMembers.some(m => m.office === o))

  const getActive = useCallback((name, ds) =>
    getActiveTask(name, ds, tasks, upcomingLeave, upcomingPH, teamMembers),
    [tasks, upcomingLeave, upcomingPH, teamMembers])

  // ── Stats ──
  const allMembers = teamMembers
  let onLeave = 0, unassigned = 0
  allMembers.forEach(({name}) => {
    let hasLeave = false
    week1Work.forEach(d => {
      const a = getActive(name, fmtDate(d))
      if (a?.entry?.wtype === 'leave') hasLeave = true
    })
    allWorkdays.forEach(d => { if (!getActive(name, fmtDate(d))) unassigned++ })
    if (hasLeave) onLeave++
  })

  // ── Save task ──
  async function saveTask(name, dateStr, pid, taskLabel, wtype, endDate, notes) {
    const existing = assignments.find(a => a.member_name === name && a.start_date === dateStr)
    const row = { member_name: name, start_date: dateStr, end_date: endDate || dateStr,
      task: taskLabel, pid: pid||null, wtype, notes: notes||null, updated_at: new Date().toISOString() }
    if (existing) {
      await supabase.from('task_assignments').update(row).eq('id', existing.id)
    } else {
      await supabase.from('task_assignments').insert(row)
    }
    const r = await supabase.from('task_assignments').select('*')
    setAssignments(r.data || [])
  }

  async function clearTask(name, dateStr) {
    const existing = assignments.find(a => a.member_name === name && a.start_date === dateStr)
    if (existing) {
      await supabase.from('task_assignments').delete().eq('id', existing.id)
      const r = await supabase.from('task_assignments').select('*')
      setAssignments(r.data || [])
    }
  }

  // ── Export ──
  function exportSummary() {
    const lines = [
      'BSFDS Workload Summary (2 weeks)',
      `Period: ${fmtDisplay(days[0])} to ${fmtDisplay(days[11])}`,
      `Generated: ${new Date().toLocaleString('en-AU')}`,
      '', '═'.repeat(70), ''
    ]
    allOffices.forEach(office => {
      lines.push(`[ ${office.toUpperCase()} ]`)
      teamMembers.filter(m => m.office === office).forEach(({name, role}) => {
        lines.push(`  ${name.padEnd(24)} ${role||''}`)
        allWorkdays.forEach(d => {
          const ds = fmtDate(d), a = getActive(name, ds)
          const val = a ? `${a.entry.task} [${a.entry.wtype||''}]` : '(unassigned)'
          lines.push(`    ${d.toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short'})}: ${val}`)
        })
      })
      lines.push('')
    })
    const blob = new Blob([lines.join('\n')], {type:'text/plain'})
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `BSFDS_Workload_${fmtDate(days[0])}.txt`
    a.click()
  }

  if (loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',
      background:'#0f1117',color:'#9aa3c2',fontFamily:'DM Mono,monospace',fontSize:14}}>
      Loading BSFDS Workload Manager…
    </div>
  )

  return (
    <div style={{background:'#0f1117',minHeight:'100vh',color:'#e2e8ff',fontFamily:'DM Mono,monospace'}}>
      {toast && <Toast msg={toast} onDone={() => setToast(null)} />}

      {/* ── Header ── */}
      <div style={{maxWidth:1600,margin:'0 auto',padding:'16px 20px'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',
          borderBottom:'1px solid #2a3050',paddingBottom:14,marginBottom:0}}>
          <div style={{display:'flex',alignItems:'center',gap:16}}>
            <img src="/logo.png" alt="BSFDS" style={{height:44,objectFit:'contain'}}
              onError={e => e.target.style.display='none'} />
            <div style={{fontFamily:'Syne,sans-serif',fontWeight:800,fontSize:20,
              letterSpacing:'-0.5px'}}>
              BSFDS Workload Manager
            </div>
          </div>
          <div style={{display:'flex',gap:8}}>
            <button className="btn" onClick={exportSummary}>↓ Export</button>
            <button className="btn" onClick={() => window.print()}>Print</button>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div style={{display:'flex',borderBottom:'1px solid #2a3050',marginBottom:20}}>
          {[['workload','📋 Workload'],['projects','🗂 Projects & Tasks'],['team','👥 Team']].map(([id,label]) => (
            <div key={id} onClick={() => setTab(id)}
              style={{padding:'12px 22px',fontSize:12,fontWeight:500,cursor:'pointer',
                color: tab===id ? '#4f8ef7' : '#9aa3c2',
                borderBottom: tab===id ? '2px solid #4f8ef7' : '2px solid transparent',
                marginBottom:-1}}>
              {label}
            </div>
          ))}
        </div>

        {/* ══ WORKLOAD TAB ══ */}
        {tab === 'workload' && (
          <WorkloadTab
            days={days} week1Work={week1Work} week2Work={week2Work}
            allWorkdays={allWorkdays} weekStart={weekStart} setWeekStart={setWeekStart}
            teamMembers={teamMembers} setTeamMembers={setTeamMembers}
            projects={projects} adminTasks={adminTasks}
            tasks={tasks} upcomingLeave={upcomingLeave} upcomingPH={upcomingPH}
            upcomingLeaveRows={upcomingLeaveRows} setUpcomingLeaveRows={setUpcomingLeaveRows}
            publicHolidayRows={publicHolidayRows} setPublicHolidayRows={setPublicHolidayRows}
            officeFilter={officeFilter} setOfficeFilter={setOfficeFilter}
            search={search} setSearch={setSearch}
            allOffices={allOffices} onLeave={onLeave} unassigned={unassigned}
            getActive={getActive}
            setAssignModal={setAssignModal}
            setLeaveModal={setLeaveModal} setPhModal={setPhModal}
            showToast={showToast}
          />
        )}

        {/* ══ PROJECTS TAB ══ */}
        {tab === 'projects' && (
          <ProjectsTab
            projects={projects} setProjects={setProjects}
            adminTasks={adminTasks} setAdminTasks={setAdminTasks}
            setProjectModal={setProjectModal} setAdminTaskModal={setAdminTaskModal}
            showToast={showToast}
          />
        )}

        {/* ══ TEAM TAB ══ */}
        {tab === 'team' && (
          <TeamTab
            teamMembers={teamMembers} setTeamMembers={setTeamMembers}
            setMemberModal={setMemberModal} showToast={showToast}
          />
        )}
      </div>

      {/* ── Modals ── */}
      {assignModal && (
        <AssignModal
          modal={assignModal} onClose={() => setAssignModal(null)}
          projects={projects} adminTasks={adminTasks}
          onSave={saveTask} onClear={clearTask}
          showToast={showToast}
        />
      )}
      {projectModal !== null && (
        <ProjectModal
          item={projectModal} projects={projects}
          onClose={() => setProjectModal(null)}
          onSave={async (row) => {
            if (row.id) await supabase.from('projects').upsert(row)
            else await supabase.from('projects').insert({...row, id:'p'+Date.now()})
            const r = await supabase.from('projects').select('*').order('job')
            setProjects(r.data||[])
            setProjectModal(null)
          }}
          adminTasks={adminTasks}
        />
      )}
      {adminTaskModal !== null && (
        <AdminTaskModal
          item={adminTaskModal} adminTasks={adminTasks}
          onClose={() => setAdminTaskModal(null)}
          onSave={async (row) => {
            if (row.id) await supabase.from('admin_tasks').upsert(row)
            else await supabase.from('admin_tasks').insert({...row, id:'a'+Date.now()})
            const r = await supabase.from('admin_tasks').select('*').order('name')
            setAdminTasks(r.data||[])
            setAdminTaskModal(null)
          }}
          projects={projects}
        />
      )}
      {memberModal !== null && (
        <MemberModal
          item={memberModal} teamMembers={teamMembers}
          onClose={() => setMemberModal(null)}
          onSave={async (row) => {
            if (row.id) await supabase.from('team_members').update(row).eq('id', row.id)
            else await supabase.from('team_members').insert(row)
            const r = await supabase.from('team_members').select('*').order('office').order('sort_order')
            setTeamMembers(r.data||[])
            setMemberModal(null)
          }}
        />
      )}
      {leaveModal !== null && (
        <LeaveModal
          item={leaveModal} teamMembers={teamMembers}
          onClose={() => setLeaveModal(null)}
          onSave={async (row) => {
            if (row.id && upcomingLeaveRows.find(x=>x.id===row.id))
              await supabase.from('upcoming_leave').update(row).eq('id', row.id)
            else await supabase.from('upcoming_leave').insert({...row, id: row.id||'l'+Date.now()})
            const r = await supabase.from('upcoming_leave').select('*')
            setUpcomingLeaveRows(r.data||[])
            setLeaveModal(null)
          }}
          showToast={showToast}
        />
      )}
      {phModal !== null && (
        <PHModal
          item={phModal} onClose={() => setPhModal(null)}
          onSave={async (row) => {
            if (row.id && publicHolidayRows.find(x=>x.id===row.id))
              await supabase.from('public_holidays').update(row).eq('id', row.id)
            else await supabase.from('public_holidays').insert({...row, id: row.id||'ph'+Date.now()})
            const r = await supabase.from('public_holidays').select('*').order('iso_date')
            setPublicHolidayRows(r.data||[])
            setPhModal(null)
          }}
          showToast={showToast}
        />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// WORKLOAD TAB
// ═══════════════════════════════════════════════════════════════════
function WorkloadTab({ days, week1Work, week2Work, allWorkdays, weekStart, setWeekStart,
  teamMembers, projects, adminTasks, tasks, upcomingLeave, upcomingPH,
  upcomingLeaveRows, setUpcomingLeaveRows, publicHolidayRows, setPublicHolidayRows,
  officeFilter, setOfficeFilter, search, setSearch,
  allOffices, onLeave, unassigned, getActive, setAssignModal,
  setLeaveModal, setPhModal, showToast }) {

  const officeColors = {Brisbane:'#4f8ef7',Chennai:'#f7a24f',Bangkok:'#4ff7a2'}
  const statColors = {Brisbane:'#4f8ef7',Chennai:'#f7a24f',Bangkok:'#4ff7a2'}

  const filteredMembers = teamMembers.filter(m => {
    if (officeFilter !== 'all' && m.office !== officeFilter) return false
    if (search && !m.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  // Group by office preserving sort_order
  const officeGroups = {}
  filteredMembers.forEach(m => {
    if (!officeGroups[m.office]) officeGroups[m.office] = []
    officeGroups[m.office].push(m)
  })

  async function deleteLeave(id) {
    await supabase.from('upcoming_leave').delete().eq('id', id)
    const r = await supabase.from('upcoming_leave').select('*')
    setUpcomingLeaveRows(r.data||[])
  }

  async function deletePH(id) {
    await supabase.from('public_holidays').delete().eq('id', id)
    const r = await supabase.from('public_holidays').select('*').order('iso_date')
    setPublicHolidayRows(r.data||[])
  }

  // Group leave and PH by office
  const leaveByOffice = {}
  upcomingLeaveRows.forEach(l => {
    if (!leaveByOffice[l.office]) leaveByOffice[l.office] = []
    leaveByOffice[l.office].push(l)
  })
  const phByOffice = {}
  publicHolidayRows.forEach(p => {
    if (!phByOffice[p.office]) phByOffice[p.office] = []
    phByOffice[p.office].push(p)
  })

  return (
    <div>
      {/* Stats */}
      <div style={{display:'flex',gap:10,marginBottom:18,flexWrap:'wrap'}}>
        <StatCard val={teamMembers.length} label="Total Team" color="#4f8ef7" />
        {allOffices.map(o => (
          <StatCard key={o} val={teamMembers.filter(m=>m.office===o).length}
            label={o} color={officeColors[o]||'#b87fff'} />
        ))}
        <StatCard val={onLeave} label="On Leave This Week" color="#f75c5c" />
        <StatCard val={unassigned} label="Unassigned Days (2 weeks)" color="#5a6380" />
      </div>

      {/* Controls */}
      <div style={{display:'flex',gap:10,marginBottom:16,flexWrap:'wrap',alignItems:'center'}}>
        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
          {['all', ...allOffices].map(o => (
            <button key={o} onClick={() => setOfficeFilter(o)}
              style={{padding:'4px 12px',borderRadius:20,fontSize:11,cursor:'pointer',
                border: officeFilter===o ? 'none' : '1px solid #2a3050',
                background: officeFilter===o ? (o==='all'?'#5a6380': officeColors[o]||'#b87fff') : '#181c27',
                color: officeFilter===o ? (o==='Chennai'||o==='Bangkok'?'#111':'#fff') : '#9aa3c2'}}>
              {o === 'all' ? 'All Offices' : o}
            </button>
          ))}
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search name or project..."
          style={{background:'#1e2335',border:'1px solid #2a3050',color:'#e2e8ff',
            padding:'6px 12px',borderRadius:4,fontSize:12,width:200}} />
        <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:10}}>
          <button className="btn" onClick={() => setWeekStart(w => addDays(w,-7))}>← Prev</button>
          <div style={{fontSize:12,color:'#9aa3c2',textAlign:'center',minWidth:200}}>
            <strong style={{display:'block',fontSize:13,color:'#e2e8ff'}}>
              {fmtDisplay(days[0])} – {fmtDisplay(days[11])}
            </strong>
            <span>{days[0].toLocaleDateString('en-AU',{month:'short',year:'numeric'})}</span>
          </div>
          <button className="btn" onClick={() => setWeekStart(w => addDays(w,7))}>Next →</button>
          <button className="btn" onClick={() => setWeekStart(getMondayOf(new Date()))}>Today</button>
        </div>
      </div>

      {/* Grid */}
      <div style={{overflowX:'auto',paddingBottom:10}}>
        <table style={{width:'100%',minWidth:900,borderCollapse:'collapse',tableLayout:'fixed'}}>
          <colgroup>
            <col style={{width:150}} />
            {week1Work.map((_,i) => <col key={i} />)}
            <col style={{width:28}} />
            {week2Work.map((_,i) => <col key={i} />)}
            <col style={{width:28}} />
          </colgroup>
          <thead>
            <tr>
              <th style={thStyle}>Team Member</th>
              {week1Work.map((d,i) => (
                <th key={i} style={thStyle}>
                  <div style={{fontSize:11,color:'#e2e8ff',fontWeight:500}}>{DAY_SHORT[i]}</div>
                  <div style={{fontSize:9,color:'#9aa3c2'}}>{fmtDisplay(d)}</div>
                </th>
              ))}
              <th style={{...thStyle,background:'#0d1018',opacity:.5,fontSize:8,color:'#5a6380',
                writingMode:'vertical-rl'}}>S/S</th>
              {week2Work.map((d,i) => (
                <th key={i} style={thStyle}>
                  <div style={{fontSize:11,color:'#e2e8ff',fontWeight:500}}>{DAY_SHORT[7+i]}</div>
                  <div style={{fontSize:9,color:'#9aa3c2'}}>{fmtDisplay(d)}</div>
                </th>
              ))}
              <th style={{...thStyle,background:'#0d1018',opacity:.5,fontSize:8,color:'#5a6380',
                writingMode:'vertical-rl'}}>S/S</th>
            </tr>
          </thead>
          <tbody>
            {allOffices.map(office => {
              const members = officeGroups[office]
              if (!members?.length) return null
              return [
                <tr key={`sec-${office}`}>
                  <td colSpan={13} style={{
                    fontFamily:'Syne,sans-serif',fontSize:10,fontWeight:700,letterSpacing:2,
                    textTransform:'uppercase',padding:'6px 14px',
                    color: officeColors[office]||'#b87fff',
                    background:'#181c27',
                    borderLeft:`3px solid ${officeColors[office]||'#b87fff'}`,
                    borderBottom:'1px solid #2a3050'}}>
                    {office} Office
                  </td>
                </tr>,
                ...members.map(m => (
                  <MemberRow key={m.id} member={m}
                    week1Work={week1Work} week2Work={week2Work}
                    getActive={getActive} projects={projects} adminTasks={adminTasks}
                    setAssignModal={setAssignModal} />
                ))
              ]
            })}
          </tbody>
        </table>
      </div>

      {/* Leave & PH panels */}
      <SectionTitle title="🏖 Upcoming Leave" />
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:16}}>
        {['Brisbane','Chennai','Bangkok'].map(office => (
          <LeavePanel key={office} office={office} color={officeColors[office]}
            items={leaveByOffice[office]||[]}
            onAdd={() => setLeaveModal({office})}
            onEdit={item => setLeaveModal(item)}
            onDelete={id => deleteLeave(id)} />
        ))}
      </div>

      <SectionTitle title="🗓 Upcoming Public Holidays" style={{marginTop:24}} />
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:16}}>
        {['Brisbane','Chennai','Bangkok'].map(office => (
          <PHPanel key={office} office={office} color={officeColors[office]}
            items={phByOffice[office]||[]}
            onAdd={() => setPhModal({office})}
            onEdit={item => setPhModal(item)}
            onDelete={id => deletePH(id)} />
        ))}
      </div>
    </div>
  )
}

const thStyle = {background:'#1e2335',padding:'8px 5px',textAlign:'center',
  fontSize:10,color:'#9aa3c2',border:'1px solid #2a3050'}

function StatCard({val, label, color}) {
  return (
    <div style={{background:'#181c27',border:'1px solid #2a3050',borderRadius:6,
      padding:'11px 16px',minWidth:100,flex:1}}>
      <div style={{fontFamily:'Syne,sans-serif',fontSize:24,fontWeight:800,color}}>{val}</div>
      <div style={{fontSize:10,color:'#9aa3c2',marginTop:1}}>{label}</div>
    </div>
  )
}

function SectionTitle({title}) {
  return (
    <div style={{fontFamily:'Syne,sans-serif',fontSize:12,fontWeight:700,letterSpacing:1.5,
      textTransform:'uppercase',color:'#9aa3c2',marginTop:28,marginBottom:10,
      display:'flex',alignItems:'center',gap:8}}>
      {title}
      <div style={{flex:1,height:1,background:'#2a3050'}} />
    </div>
  )
}

// ─── Member Row ───────────────────────────────────────────────────────
function MemberRow({ member, week1Work, week2Work, getActive, projects, adminTasks, setAssignModal }) {
  function renderWeek(workDays) {
    const cells = []
    let i = 0
    while (i < workDays.length) {
      const d = workDays[i]
      const ds = fmtDate(d)
      const active = getActive(member.name, ds)
      if (!active) {
        cells.push(
          <td key={ds} onClick={() => setAssignModal({name:member.name, dateStr:ds, entry:null})}
            style={tdStyle}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'center',
              height:'100%',color:'#5a6380',fontSize:10,padding:4}}>+ assign</div>
          </td>
        )
        i++; continue
      }
      const {entry, startDs, isVirtual} = active
      let span = 1, j = i+1
      while (j < workDays.length) {
        const nextDs = fmtDate(workDays[j])
        const nextA = getActive(member.name, nextDs)
        if (nextA && nextA.startDs === startDs &&
            JSON.stringify(nextA.entry) === JSON.stringify(entry)) {
          span++; j++
        } else break
      }
      const color = ['leave','ph'].includes(entry.wtype) ? null
        : getProjectColor(entry.pid, projects, adminTasks)
      let bg = 'transparent', borderColor = '#4f8ef7'
      if (entry.wtype === 'leave') { bg='rgba(247,92,92,.13)'; borderColor='#f75c5c' }
      else if (entry.wtype === 'ph') { bg='rgba(247,162,79,.13)'; borderColor='#f7a24f' }
      else if (entry.wtype === 'admin') { bg='rgba(90,99,128,.13)'; borderColor='#5a6380' }
      else if (color) {
        const {r,g,b} = hexToRgb(color)
        bg = `rgba(${r},${g},${b},.18)`; borderColor = color
      }
      const nameColor = entry.wtype==='leave'?'#f75c5c': entry.wtype==='ph'?'#f7a24f':
        entry.wtype==='admin'?'#9aa3c2': '#e2e8ff'
      cells.push(
        <td key={ds} colSpan={span}
          onClick={() => !isVirtual && setAssignModal({name:member.name, dateStr:startDs, entry})}
          style={{...tdStyle, cursor: isVirtual?'default':'pointer', background:bg,
            borderLeft:`3px solid ${borderColor}`}}>
          <div style={{padding:'4px 8px'}}>
            <div style={{fontSize:10,fontWeight:500,color:nameColor,
              wordBreak:'break-word',lineHeight:1.3}}>{entry.task}</div>
            {entry.wtype && !['leave','ph','admin'].includes(entry.wtype) && (
              <div style={{fontSize:9,color:'#9aa3c2',fontStyle:'italic',marginTop:2}}>{entry.wtype}</div>
            )}
            {entry.notes && (
              <div style={{fontSize:9,color:'#9aa3c2',marginTop:2,wordBreak:'break-word',lineHeight:1.3}}>
                {entry.notes}
              </div>
            )}
          </div>
        </td>
      )
      i = j
    }
    return cells
  }

  return (
    <tr>
      <td style={{background:'#1e2335',border:'1px solid #2a3050',padding:'8px 14px',
        verticalAlign:'middle'}}>
        <div style={{fontSize:11,fontWeight:500,color:'#e2e8ff',whiteSpace:'nowrap',
          overflow:'hidden',textOverflow:'ellipsis'}}>{member.name}</div>
        <div style={{fontSize:9,color:'#9aa3c2'}}>{member.role}</div>
      </td>
      {renderWeek(week1Work)}
      <td style={{background:'#0a0d14',border:'1px solid #2a3050',width:28}} />
      {renderWeek(week2Work)}
      <td style={{background:'#0a0d14',border:'1px solid #2a3050',width:28}} />
    </tr>
  )
}

const tdStyle = {background:'#181c27',border:'1px solid #2a3050',
  minHeight:52,verticalAlign:'top',cursor:'pointer',transition:'background .12s'}

// ─── Leave & PH Panels ───────────────────────────────────────────────
function LeavePanel({office, color, items, onAdd, onEdit, onDelete}) {
  return (
    <div style={{background:'#181c27',border:'1px solid #2a3050',borderRadius:6,padding:14}}>
      <div style={{fontFamily:'Syne,sans-serif',fontSize:11,fontWeight:700,letterSpacing:1.5,
        textTransform:'uppercase',color,marginBottom:10,display:'flex',alignItems:'center',gap:8}}>
        <span style={{width:7,height:7,borderRadius:'50%',background:color,display:'inline-block'}} />
        {office}
        <button onClick={onAdd} style={{marginLeft:'auto',background:'#1e2335',
          border:'1px solid #2a3050',color:'#9aa3c2',padding:'2px 8px',borderRadius:3,
          cursor:'pointer',fontSize:14}}>+</button>
      </div>
      {items.length === 0 && <div style={{fontSize:11,color:'#5a6380'}}>No upcoming leave</div>}
      {items.map(l => (
        <div key={l.id} style={{display:'flex',alignItems:'center',padding:'5px 0',
          borderBottom:'1px solid #2a3050',fontSize:11,gap:6}}
          className="leave-row">
          <span style={{color:'#e2e8ff',flex:1}}>{l.name}</span>
          <span style={{color:'#9aa3c2',fontSize:10}}>{l.dates}</span>
          <div style={{display:'flex',gap:3,flexShrink:0}}>
            <button onClick={() => onEdit(l)}
              style={{background:'none',border:'none',cursor:'pointer',color:'#9aa3c2',padding:'2px 4px'}}>✏️</button>
            <button onClick={() => onDelete(l.id)}
              style={{background:'none',border:'none',cursor:'pointer',color:'#f75c5c',padding:'2px 4px',fontSize:13}}>✕</button>
          </div>
        </div>
      ))}
    </div>
  )
}

function PHPanel({office, color, items, onAdd, onEdit, onDelete}) {
  return (
    <div style={{background:'#181c27',border:'1px solid rgba(247,162,79,.2)',borderRadius:6,padding:14}}>
      <div style={{fontFamily:'Syne,sans-serif',fontSize:11,fontWeight:700,letterSpacing:1.5,
        textTransform:'uppercase',color,marginBottom:10,display:'flex',alignItems:'center',gap:8}}>
        <span style={{width:7,height:7,borderRadius:'50%',background:color,display:'inline-block'}} />
        {office}
        <button onClick={onAdd} style={{marginLeft:'auto',background:'#1e2335',
          border:'1px solid #2a3050',color:'#9aa3c2',padding:'2px 8px',borderRadius:3,
          cursor:'pointer',fontSize:14}}>+</button>
      </div>
      {items.length === 0 && <div style={{fontSize:11,color:'#5a6380'}}>No upcoming public holidays</div>}
      {items.map(p => (
        <div key={p.id} style={{display:'flex',alignItems:'center',padding:'5px 0',
          borderBottom:'1px solid #2a3050',fontSize:11,gap:6}}>
          <span style={{color:'#9aa3c2',flex:1}}>📅 {p.name}</span>
          <span style={{color:'#9aa3c2',fontSize:10}}>{p.display_date}</span>
          <div style={{display:'flex',gap:3,flexShrink:0}}>
            <button onClick={() => onEdit(p)}
              style={{background:'none',border:'none',cursor:'pointer',color:'#9aa3c2',padding:'2px 4px'}}>✏️</button>
            <button onClick={() => onDelete(p.id)}
              style={{background:'none',border:'none',cursor:'pointer',color:'#f75c5c',padding:'2px 4px',fontSize:13}}>✕</button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// PROJECTS TAB
// ═══════════════════════════════════════════════════════════════════
function ProjectsTab({ projects, adminTasks, setProjectModal, setAdminTaskModal, showToast }) {
  async function delProject(id) {
    await supabase.from('projects').delete().eq('id', id)
  }
  async function delAdmin(id) {
    await supabase.from('admin_tasks').delete().eq('id', id)
  }
  return (
    <div>
      <AdminSection title="🏗 Active Projects" onAdd={() => setProjectModal({})}>
        <table style={adminTableStyle}>
          <thead><tr>
            <th style={adminTh}>Colour</th><th style={adminTh}>Job #</th>
            <th style={adminTh}>Project Name</th><th style={adminTh}>Status</th>
            <th style={adminTh}>Actions</th>
          </tr></thead>
          <tbody>
            {projects.map(p => (
              <tr key={p.id}>
                <td style={adminTd}><span style={{width:12,height:12,borderRadius:'50%',
                  background:p.color,display:'inline-block'}} /></td>
                <td style={adminTd}>{p.job}</td>
                <td style={adminTd}>{p.name}</td>
                <td style={adminTd}><StatusBadge s={p.status} /></td>
                <td style={adminTd}>
                  <button onClick={() => setProjectModal(p)} style={iconBtn}>✏️</button>
                  <button onClick={() => delProject(p.id)} style={{...iconBtn,color:'#f75c5c'}}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </AdminSection>
      <AdminSection title="⚙️ Admin & Recurring Tasks" onAdd={() => setAdminTaskModal({})}>
        <table style={adminTableStyle}>
          <thead><tr>
            <th style={adminTh}>Colour</th><th style={adminTh}>Task Name</th>
            <th style={adminTh}>Category</th><th style={adminTh}>Actions</th>
          </tr></thead>
          <tbody>
            {adminTasks.map(a => (
              <tr key={a.id}>
                <td style={adminTd}><span style={{width:12,height:12,borderRadius:'50%',
                  background:a.color,display:'inline-block'}} /></td>
                <td style={adminTd}>{a.name}</td>
                <td style={adminTd}>{a.cat}</td>
                <td style={adminTd}>
                  <button onClick={() => setAdminTaskModal(a)} style={iconBtn}>✏️</button>
                  <button onClick={() => delAdmin(a.id)} style={{...iconBtn,color:'#f75c5c'}}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </AdminSection>
    </div>
  )
}

function StatusBadge({s}) {
  const colors = {active:['rgba(79,247,162,.12)','#4ff7a2','rgba(79,247,162,.3)'],
    completed:['rgba(90,99,128,.15)','#5a6380','#2a3050'],
    onhold:['rgba(247,162,79,.12)','#f7a24f','rgba(247,162,79,.3)']}
  const [bg,color,border] = colors[s]||colors.active
  return <span style={{padding:'2px 8px',borderRadius:10,fontSize:10,background:bg,color,
    border:`1px solid ${border}`}}>{s}</span>
}

function AdminSection({title, onAdd, children}) {
  return (
    <div style={{background:'#181c27',border:'1px solid #2a3050',borderRadius:6,
      marginBottom:16,overflow:'hidden'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',
        padding:'12px 16px',background:'#1e2335',borderBottom:'1px solid #2a3050'}}>
        <div style={{fontFamily:'Syne,sans-serif',fontSize:13,fontWeight:700}}>{title}</div>
        <button onClick={onAdd}
          style={{background:'#4f8ef7',border:'none',color:'#fff',padding:'4px 12px',
            borderRadius:4,cursor:'pointer',fontSize:12}}>+ Add</button>
      </div>
      {children}
    </div>
  )
}

const adminTableStyle = {width:'100%',borderCollapse:'collapse',fontSize:12}
const adminTh = {textAlign:'left',padding:'8px 14px',fontSize:10,color:'#9aa3c2',
  fontWeight:500,borderBottom:'1px solid #2a3050',background:'#1e2335'}
const adminTd = {padding:'8px 14px',borderBottom:'1px solid #2a3050',verticalAlign:'middle'}
const iconBtn = {background:'none',border:'none',cursor:'pointer',color:'#9aa3c2',
  padding:'2px 6px',fontSize:13}

// ═══════════════════════════════════════════════════════════════════
// TEAM TAB
// ═══════════════════════════════════════════════════════════════════
function TeamTab({ teamMembers, setMemberModal, showToast }) {
  async function delMember(id) {
    await supabase.from('team_members').delete().eq('id', id)
  }
  return (
    <AdminSection title="👥 Team Members" onAdd={() => setMemberModal({})}>
      <table style={adminTableStyle}>
        <thead><tr>
          <th style={adminTh}>Name</th><th style={adminTh}>Role</th>
          <th style={adminTh}>Office</th><th style={adminTh}>Order</th>
          <th style={adminTh}>Actions</th>
        </tr></thead>
        <tbody>
          {teamMembers.map((m,i) => (
            <tr key={m.id}>
              <td style={adminTd}><strong>{m.name}</strong></td>
              <td style={adminTd}>{m.role}</td>
              <td style={adminTd}>
                <span style={{padding:'2px 8px',borderRadius:10,fontSize:10,
                  border:`1px solid ${getOfficeColor(m.office)}`,
                  color:getOfficeColor(m.office)}}>{m.office}</span>
              </td>
              <td style={{...adminTd,color:'#5a6380',fontSize:11}}>{i+1}</td>
              <td style={adminTd}>
                <button onClick={() => setMemberModal(m)} style={iconBtn}>✏️</button>
                <button onClick={() => delMember(m.id)} style={{...iconBtn,color:'#f75c5c'}}>✕</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </AdminSection>
  )
}

// ═══════════════════════════════════════════════════════════════════
// ASSIGNMENT MODAL
// ═══════════════════════════════════════════════════════════════════
function AssignModal({ modal, onClose, projects, adminTasks, onSave, onClear, showToast }) {
  const {name, dateStr, entry} = modal
  const [pid, setPid] = useState(entry?.pid||'')
  const [customTask, setCustomTask] = useState('')
  const [wtype, setWtype] = useState(entry?.wtype||'modelling')
  const [endDate, setEndDate] = useState(entry?.end_date||dateStr)
  const [notes, setNotes] = useState(entry?.notes||'')

  useEffect(() => {
    if (!entry) return
    if (entry.task === 'Annual Leave') { setPid('__annual_leave__'); return }
    if (entry.task === 'Sick Leave') { setPid('__sick_leave__'); return }
    if (!entry.pid && entry.task) { setPid('__custom__'); setCustomTask(entry.task) }
  }, [entry])

  const isLeaveType = pid === '__annual_leave__' || pid === '__sick_leave__'

  async function handleSave() {
    let taskLabel = '', finalWtype = wtype
    if (pid === '__annual_leave__') { taskLabel = 'Annual Leave'; finalWtype = 'leave' }
    else if (pid === '__sick_leave__') { taskLabel = 'Sick Leave'; finalWtype = 'leave' }
    else if (pid === '__custom__') {
      taskLabel = customTask.trim()
      if (!taskLabel) { showToast('Please enter a task description'); return }
    } else if (pid) {
      taskLabel = getProjectLabel(pid, projects, adminTasks)
    } else {
      taskLabel = customTask.trim() || wtype
    }
    await onSave(name, dateStr, isLeaveType?'':pid, taskLabel, finalWtype, endDate, notes)
    onClose()
  }

  const d = parseLocalDate(dateStr)
  return (
    <Modal open onClose={onClose}>
      <h3 style={{fontFamily:'Syne,sans-serif',fontSize:15,marginBottom:3}}>{name}</h3>
      <div style={{fontSize:11,color:'#5a6380',marginBottom:18}}>
        {d.toLocaleDateString('en-AU',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}
      </div>
      <label style={I.label}>Project / Task</label>
      <select value={pid} onChange={e => setPid(e.target.value)} style={I.base}>
        <option value="">— select —</option>
        <optgroup label="Leave">
          <option value="__annual_leave__">Annual Leave</option>
          <option value="__sick_leave__">Sick Leave</option>
        </optgroup>
        {projects.filter(p=>p.status==='active').length > 0 && (
          <optgroup label="Active Projects">
            {projects.filter(p=>p.status==='active').map(p => (
              <option key={p.id} value={p.id}>{p.job} — {p.name}</option>
            ))}
          </optgroup>
        )}
        {adminTasks.length > 0 && (
          <optgroup label="Admin & Recurring">
            {adminTasks.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </optgroup>
        )}
        <option value="__custom__">✏️ Custom…</option>
      </select>

      {pid === '__custom__' && (
        <input value={customTask} onChange={e => setCustomTask(e.target.value)}
          placeholder="Task description…" style={{...I.base,marginTop:6}} />
      )}
      {isLeaveType && (
        <div style={{fontSize:10,color:'#f75c5c',marginTop:6,padding:'4px 8px',
          background:'rgba(247,92,92,.1)',borderRadius:4}}>
          Work type set automatically to Leave
        </div>
      )}

      <div style={{...I.row, marginTop:13, opacity: isLeaveType ? .5 : 1}}>
        <div>
          <label style={I.label}>Work Type</label>
          <select value={wtype} onChange={e => setWtype(e.target.value)}
            style={I.base} disabled={isLeaveType}>
            <option value="modelling">Modelling</option>
            <option value="editing">Editing</option>
            <option value="checking">Checking</option>
            <option value="admin">Admin / Management</option>
            <option value="leave">Leave / AL</option>
            <option value="ph">Public Holiday</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label style={I.label}>End Date</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={I.base} />
        </div>
      </div>

      <label style={I.label}>Notes</label>
      <textarea value={notes} onChange={e => setNotes(e.target.value)}
        placeholder="Optional notes…"
        style={{...I.base,resize:'vertical',minHeight:50}} />

      <div style={{display:'flex',gap:8,marginTop:18,justifyContent:'flex-end'}}>
        {entry && <button onClick={async()=>{await onClear(name,dateStr);onClose()}}
          style={{...btnBase,borderColor:'#f75c5c',color:'#f75c5c'}}>Clear</button>}
        <button onClick={onClose} style={btnBase}>Cancel</button>
        <button onClick={handleSave} style={{...btnBase,background:'#4f8ef7',
          borderColor:'#4f8ef7',color:'#fff'}}>Save</button>
      </div>
    </Modal>
  )
}

// ─── Project Modal ────────────────────────────────────────────────────
function ProjectModal({ item, onClose, onSave, projects, adminTasks }) {
  const [job, setJob] = useState(item?.job||'')
  const [name, setName] = useState(item?.name||'')
  const [status, setStatus] = useState(item?.status||'active')
  const [color, setColor] = useState(item?.color||nextAutoColor(projects||[],adminTasks||[]))
  return (
    <Modal open onClose={onClose}>
      <h3 style={modalH3}>{item?.id ? 'Edit Project' : 'Add Project'}</h3>
      <label style={I.label}>Job #</label>
      <input value={job} onChange={e=>setJob(e.target.value)} placeholder="e.g. 23-081" style={I.base} />
      <label style={I.label}>Project Name</label>
      <input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Waterfront" style={I.base} />
      <label style={I.label}>Status</label>
      <select value={status} onChange={e=>setStatus(e.target.value)} style={I.base}>
        <option value="active">Active</option>
        <option value="onhold">On Hold</option>
        <option value="completed">Completed</option>
      </select>
      <label style={I.label}>Colour</label>
      <input type="color" value={color} onChange={e=>setColor(e.target.value)}
        style={{height:36,padding:'2px 4px',width:80,background:'#1e2335',border:'1px solid #2a3050',borderRadius:4}} />
      <div style={{display:'flex',gap:8,marginTop:18,justifyContent:'flex-end'}}>
        <button onClick={onClose} style={btnBase}>Cancel</button>
        <button onClick={()=>onSave({...item,job,name,status,color})}
          style={{...btnBase,background:'#4f8ef7',borderColor:'#4f8ef7',color:'#fff'}}>Save</button>
      </div>
    </Modal>
  )
}

// ─── Admin Task Modal ─────────────────────────────────────────────────
function AdminTaskModal({ item, onClose, onSave, projects, adminTasks }) {
  const [name, setName] = useState(item?.name||'')
  const [cat, setCat] = useState(item?.cat||'admin')
  const [color, setColor] = useState(item?.color||nextAutoColor(projects||[],adminTasks||[]))
  return (
    <Modal open onClose={onClose}>
      <h3 style={modalH3}>{item?.id ? 'Edit Task' : 'Add Admin Task'}</h3>
      <label style={I.label}>Task Name</label>
      <input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Admin & Management" style={I.base} />
      <label style={I.label}>Category</label>
      <select value={cat} onChange={e=>setCat(e.target.value)} style={I.base}>
        <option value="admin">Admin</option>
        <option value="training">Training</option>
        <option value="internal">Internal</option>
        <option value="other">Other</option>
      </select>
      <label style={I.label}>Colour</label>
      <input type="color" value={color} onChange={e=>setColor(e.target.value)}
        style={{height:36,padding:'2px 4px',width:80,background:'#1e2335',border:'1px solid #2a3050',borderRadius:4}} />
      <div style={{display:'flex',gap:8,marginTop:18,justifyContent:'flex-end'}}>
        <button onClick={onClose} style={btnBase}>Cancel</button>
        <button onClick={()=>onSave({...item,name,cat,color})}
          style={{...btnBase,background:'#4f8ef7',borderColor:'#4f8ef7',color:'#fff'}}>Save</button>
      </div>
    </Modal>
  )
}

// ─── Member Modal ─────────────────────────────────────────────────────
function MemberModal({ item, onClose, onSave, teamMembers }) {
  const [name, setName] = useState(item?.name||'')
  const [role, setRole] = useState(item?.role||'')
  const [office, setOffice] = useState(item?.office||'Brisbane')
  const [customOffice, setCustomOffice] = useState('')
  const knownOffices = ['Brisbane','Chennai','Bangkok']
  const customOffices = [...new Set((teamMembers||[]).map(m=>m.office).filter(o=>!knownOffices.includes(o)))]
  return (
    <Modal open onClose={onClose}>
      <h3 style={modalH3}>{item?.id ? 'Edit Member' : 'Add Member'}</h3>
      <label style={I.label}>Name</label>
      <input value={name} onChange={e=>setName(e.target.value)} placeholder="Full name" style={I.base} />
      <label style={I.label}>Role</label>
      <input value={role} onChange={e=>setRole(e.target.value)} placeholder="e.g. 3D Modeller" style={I.base} />
      <label style={I.label}>Office</label>
      <select value={office} onChange={e=>setOffice(e.target.value)} style={I.base}>
        {[...knownOffices,...customOffices].map(o=><option key={o} value={o}>{o}</option>)}
        <option value="__other__">Other (specify)…</option>
      </select>
      {office==='__other__' && (
        <input value={customOffice} onChange={e=>setCustomOffice(e.target.value)}
          placeholder="Office name…" style={{...I.base,marginTop:6}} />
      )}
      <div style={{display:'flex',gap:8,marginTop:18,justifyContent:'flex-end'}}>
        <button onClick={onClose} style={btnBase}>Cancel</button>
        <button onClick={()=>{
          const finalOffice = office==='__other__' ? customOffice.trim() : office
          if(!name||!finalOffice) return
          onSave({...item,name,role,office:finalOffice,sort_order:item?.sort_order||99})
        }} style={{...btnBase,background:'#4f8ef7',borderColor:'#4f8ef7',color:'#fff'}}>Save</button>
      </div>
    </Modal>
  )
}

// ─── Leave Modal ──────────────────────────────────────────────────────
function LeaveModal({ item, onClose, onSave, teamMembers, showToast }) {
  const [office, setOffice] = useState(item?.office||'Brisbane')
  const [name, setName] = useState(item?.name||'')
  const [startDate, setStartDate] = useState(item?.start_date||'')
  const [endDate, setEndDate] = useState(item?.end_date||'')
  const [dates, setDates] = useState(item?.dates||'')
  const membersInOffice = teamMembers.filter(m=>m.office===office)
  return (
    <Modal open onClose={onClose}>
      <h3 style={modalH3}>{item?.id ? 'Edit Leave' : 'Add Leave'}</h3>
      <label style={I.label}>Office</label>
      <select value={office} onChange={e=>{setOffice(e.target.value);setName('')}} style={I.base}>
        {['Brisbane','Chennai','Bangkok'].map(o=><option key={o}>{o}</option>)}
      </select>
      <label style={I.label}>Person</label>
      <select value={name} onChange={e=>setName(e.target.value)} style={I.base}>
        <option value="">— select —</option>
        {membersInOffice.map(m=><option key={m.id} value={m.name}>{m.name}</option>)}
      </select>
      <div style={I.row}>
        <div><label style={I.label}>Start Date</label>
          <input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} style={I.base} /></div>
        <div><label style={I.label}>End Date</label>
          <input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)} style={I.base} /></div>
      </div>
      <label style={I.label}>Display Label (auto-generated if blank)</label>
      <input value={dates} onChange={e=>setDates(e.target.value)}
        placeholder="e.g. 05 May – 18 May (9 days)" style={I.base} />
      <div style={{display:'flex',gap:8,marginTop:18,justifyContent:'flex-end'}}>
        <button onClick={onClose} style={btnBase}>Cancel</button>
        <button onClick={()=>{
          if(!name||!startDate||!endDate){showToast('Name and dates required');return}
          let d = dates
          if(!d){
            const s=parseLocalDate(startDate),e=parseLocalDate(endDate)
            const days=Math.round((e-s)/86400000)+1
            d=`${fmtDisplay(s)} – ${fmtDisplay(e)}${days>1?' ('+days+' days)':''}`
          }
          onSave({...item,office,name,start_date:startDate,end_date:endDate,dates:d})
        }} style={{...btnBase,background:'#4f8ef7',borderColor:'#4f8ef7',color:'#fff'}}>Save</button>
      </div>
    </Modal>
  )
}

// ─── Public Holiday Modal ─────────────────────────────────────────────
function PHModal({ item, onClose, onSave, showToast }) {
  const [office, setOffice] = useState(item?.office||'Brisbane')
  const [name, setName] = useState(item?.name||'')
  const [isoDate, setIsoDate] = useState(item?.iso_date||'')
  const [endIsoDate, setEndIsoDate] = useState(item?.end_iso_date||'')
  return (
    <Modal open onClose={onClose}>
      <h3 style={modalH3}>{item?.id ? 'Edit Public Holiday' : 'Add Public Holiday'}</h3>
      <label style={I.label}>Office</label>
      <select value={office} onChange={e=>setOffice(e.target.value)} style={I.base}>
        {['Brisbane','Chennai','Bangkok'].map(o=><option key={o}>{o}</option>)}
      </select>
      <label style={I.label}>Holiday Name</label>
      <input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Labour Day" style={I.base} />
      <div style={I.row}>
        <div><label style={I.label}>Date</label>
          <input type="date" value={isoDate} onChange={e=>setIsoDate(e.target.value)} style={I.base} /></div>
        <div><label style={I.label}>End Date (multi-day, optional)</label>
          <input type="date" value={endIsoDate} onChange={e=>setEndIsoDate(e.target.value)} style={I.base} /></div>
      </div>
      <div style={{display:'flex',gap:8,marginTop:18,justifyContent:'flex-end'}}>
        <button onClick={onClose} style={btnBase}>Cancel</button>
        <button onClick={()=>{
          if(!name||!isoDate){showToast('Name and date required');return}
          const s=parseLocalDate(isoDate)
          let display=fmtDisplay(s)
          if(endIsoDate&&endIsoDate!==isoDate) display=`${fmtDisplay(s)} – ${fmtDisplay(parseLocalDate(endIsoDate))}`
          onSave({...item,office,name,iso_date:isoDate,end_iso_date:endIsoDate||null,display_date:display})
        }} style={{...btnBase,background:'#4f8ef7',borderColor:'#4f8ef7',color:'#fff'}}>Save</button>
      </div>
    </Modal>
  )
}

const btnBase = {background:'#1e2335',border:'1px solid #2a3050',color:'#9aa3c2',
  padding:'6px 14px',borderRadius:4,cursor:'pointer',fontSize:12,fontFamily:'DM Mono,monospace'}
const modalH3 = {fontFamily:'Syne,sans-serif',fontSize:15,marginBottom:3,color:'#e2e8ff'}
