export const CORE_OFFICES = ['Brisbane', 'Chennai', 'Bangkok']

export const OFFICE_COLORS = {
  Brisbane: { dot: '#4f8ef7', tag: 'brisbane' },
  Chennai:  { dot: '#f7a24f', tag: 'chennai' },
  Bangkok:  { dot: '#4ff7a2', tag: 'bangkok' },
}

export function getOfficeColor(office) {
  return OFFICE_COLORS[office]?.dot || '#b87fff'
}

export function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3),16)
  const g = parseInt(hex.slice(3,5),16)
  const b = parseInt(hex.slice(5,7),16)
  return {r,g,b}
}

export function fmtDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth()+1).padStart(2,'0')
  const day = String(d.getDate()).padStart(2,'0')
  return `${y}-${m}-${day}`
}

export function parseLocalDate(iso) {
  const [y,m,d] = iso.split('-').map(Number)
  return new Date(y, m-1, d)
}

export function fmtDisplay(d) {
  return d.toLocaleDateString('en-AU', {day:'numeric', month:'short'})
}

export function addDays(d, n) {
  const dt = new Date(d)
  dt.setDate(dt.getDate() + n)
  return dt
}

export function isWeekend(d) {
  const day = d.getDay()
  return day === 0 || day === 6
}

export function getMondayOf(d) {
  const dt = typeof d === 'string' ? parseLocalDate(d) : new Date(d)
  dt.setHours(0,0,0,0)
  const day = dt.getDay()
  dt.setDate(dt.getDate() + (day === 0 ? -6 : 1 - day))
  return dt
}

export function getWeekDays(weekStart) {
  return Array.from({length:14}, (_,i) => addDays(weekStart, i))
}

export const DAY_SHORT = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun','Mon','Tue','Wed','Thu','Fri','Sat','Sun']

export function getActiveTask(name, dateStr, tasks, upcomingLeave, upcomingPH, teamMembers) {
  const memberTasks = tasks[name] || {}

  if (memberTasks[dateStr]?.length) {
    return { entry: memberTasks[dateStr][0], startDs: dateStr }
  }

  for (const startDs of Object.keys(memberTasks).sort()) {
    if (startDs >= dateStr) continue
    const entries = memberTasks[startDs] || []
    for (const t of entries) {
      if (t.end_date && t.end_date >= dateStr) return { entry: t, startDs }
    }
  }

  return getVirtualTask(name, dateStr, upcomingLeave, upcomingPH, teamMembers)
}

export function getVirtualTask(name, dateStr, upcomingLeave, upcomingPH, teamMembers) {
  const member = teamMembers.find(m => m.name === name)
  if (!member) return null
  const office = member.office

  for (const item of (upcomingLeave[office] || [])) {
    if (item.name !== name) continue
    if (!item.start_date || !item.end_date) continue
    if (dateStr >= item.start_date && dateStr <= item.end_date) {
      return {
        entry: { pid:'', task:`Leave — ${item.dates||item.name}`, wtype:'leave', end_date:item.end_date },
        startDs: item.start_date,
        isVirtual: true
      }
    }
  }

  for (const ph of (upcomingPH[office] || [])) {
    if (!ph.iso_date) continue
    const endDs = ph.end_iso_date || ph.iso_date
    if (dateStr >= ph.iso_date && dateStr <= endDs) {
      return {
        entry: { pid:'', task:ph.name, wtype:'ph', end_date: endDs },
        startDs: ph.iso_date,
        isVirtual: true
      }
    }
  }

  return null
}

export function buildTasksMap(assignments) {
  const map = {}
  for (const a of assignments) {
    if (!map[a.member_name]) map[a.member_name] = {}
    map[a.member_name][a.start_date] = [{
      id: a.id,
      pid: a.pid || '',
      task: a.task,
      wtype: a.wtype,
      end_date: a.end_date,
      notes: a.notes || ''
    }]
  }
  return map
}

export function buildLeaveMap(leaveRows) {
  const map = {}
  for (const r of leaveRows) {
    if (!map[r.office]) map[r.office] = []
    map[r.office].push(r)
  }
  return map
}

export function buildPHMap(phRows) {
  const map = {}
  for (const r of phRows) {
    if (!map[r.office]) map[r.office] = []
    map[r.office].push(r)
  }
  return map
}

export function getProjectColor(pid, projects, adminTasks) {
  if (!pid) return null
  const p = projects.find(x => x.id === pid)
  if (p) return p.color
  const a = adminTasks.find(x => x.id === pid)
  if (a) return a.color
  return null
}

export function getProjectLabel(pid, projects, adminTasks) {
  if (!pid) return ''
  const p = projects.find(x => x.id === pid)
  if (p) return `${p.job} — ${p.name}`
  const a = adminTasks.find(x => x.id === pid)
  if (a) return a.name
  return ''
}

export function nextAutoColor(projects, adminTasks) {
  const hues = [210,35,160,0,270,190,60,310,100,20,240,330,80,170,50]
  const used = projects.length + adminTasks.length
  const hue = hues[used % hues.length]
  const c = document.createElement('canvas')
  c.width = 1; c.height = 1
  const ctx = c.getContext('2d')
  ctx.fillStyle = `hsl(${hue},65%,62%)`
  ctx.fillRect(0,0,1,1)
  const [r,g,b] = ctx.getImageData(0,0,1,1).data
  return '#' + [r,g,b].map(x => x.toString(16).padStart(2,'0')).join('')
}
