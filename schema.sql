-- BSFDS Workload Manager Schema
-- Paste this entire file into Supabase SQL Editor and click Run

create table if not exists team_members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text,
  office text not null,
  sort_order integer default 0
);
create table if not exists projects (
  id text primary key,
  job text,
  name text not null,
  status text default 'active',
  color text default '#4f8ef7'
);
create table if not exists admin_tasks (
  id text primary key,
  name text not null,
  cat text default 'admin',
  color text default '#5a6380'
);
create table if not exists task_assignments (
  id uuid primary key default gen_random_uuid(),
  member_name text not null,
  start_date date not null,
  end_date date not null,
  task text not null,
  pid text,
  wtype text,
  notes text,
  updated_at timestamptz default now(),
  unique(member_name, start_date)
);
create table if not exists upcoming_leave (
  id text primary key,
  office text not null,
  name text not null,
  start_date date not null,
  end_date date not null,
  dates text
);
create table if not exists public_holidays (
  id text primary key,
  office text not null,
  name text not null,
  iso_date date not null,
  end_iso_date date,
  display_date text
);

alter publication supabase_realtime add table team_members;
alter publication supabase_realtime add table projects;
alter publication supabase_realtime add table admin_tasks;
alter publication supabase_realtime add table task_assignments;
alter publication supabase_realtime add table upcoming_leave;
alter publication supabase_realtime add table public_holidays;

alter table team_members enable row level security;
alter table projects enable row level security;
alter table admin_tasks enable row level security;
alter table task_assignments enable row level security;
alter table upcoming_leave enable row level security;
alter table public_holidays enable row level security;

create policy "public_all" on team_members for all using (true) with check (true);
create policy "public_all" on projects for all using (true) with check (true);
create policy "public_all" on admin_tasks for all using (true) with check (true);
create policy "public_all" on task_assignments for all using (true) with check (true);
create policy "public_all" on upcoming_leave for all using (true) with check (true);
create policy "public_all" on public_holidays for all using (true) with check (true);

insert into team_members (name,role,office,sort_order) values
('Ken','3D Modeller','Brisbane',1),('Ian','Detailer','Brisbane',2),('Sheree','Detailer','Brisbane',3),
('Chayton','Detailer','Brisbane',4),('Riley','Detailer','Brisbane',5),('Tayshon','Detailer','Brisbane',6),
('Dymy','Detailer','Brisbane',7),('Gary','Detailer','Brisbane',8),('Kohan','Detailer','Brisbane',9),
('Arefin','Detailer','Brisbane',10),('Darryn','Sr Detailer','Brisbane',11),('Garret','Drafting Manager','Brisbane',12),
('Ramesh','3D Modeller','Chennai',1),('Abins','3D Modeller','Chennai',2),('Rajan','3D Checker','Chennai',3),
('Kannan','3D Modeller','Chennai',4),('Arthi','Jr Mod/ED','Chennai',5),('Ram','Jr Mod/ED','Chennai',6),
('Saravanan','Editor','Chennai',7),('Sathishkumar Balraj','Editor','Chennai',8),('Manoj Kumar','Editor','Chennai',9),
('Prakash','DC/Jr Editor','Chennai',10),('Prasanna','SL','Chennai',11),('Arunachalam','EST','Chennai',12),
('Kamal','Admin','Chennai',13),('Usha','3D Modeller','Chennai',14),
('Madhan Raj','Sr Editor','Bangkok',1),('Ramamirtham','Sr Sheet Check','Bangkok',2)
on conflict do nothing;

insert into projects (id,job,name,status,color) values
('p1','23-081','Waterfront','active','#4f8ef7'),('p2','23-035','BAC-DTB Alstef','active','#f7a24f'),
('p3','24-012','Toowoomba Hospital','active','#b87fff'),('p4','24-031','Next DC Brisbane','active','#4ff7a2'),
('p5','24-056','Ipswich Primary','active','#f75c5c'),('p6','24-067','IPH Primary & Secondary','active','#ff9de2'),
('p7','24-081','LGH','active','#7fdbff'),('p8','24-089','Gladstone','active','#ffdd57'),
('p9','24-095','Ormeau','active','#a8e6cf'),('p10','25-191','Ripley Carpark','active','#ffa07a'),
('p11','25-201','QTMP - Torbanlea','active','#da70d6'),('p12','25-211','Ipswich Secondary','active','#87ceeb'),
('p13','24-111','AVIS','active','#f0e68c'),('p14','25-099','ITB - Kattsafe','active','#98fb98'),
('p15','25-112','US Disney','active','#dda0dd')
on conflict do nothing;

insert into admin_tasks (id,name,cat,color) values
('a1','Admin & Management','admin','#5a6380'),('a2','Detailer Training','training','#7fc8f8'),
('a3','Tekla Setup','internal','#b0c4de'),('a4','Estimation','admin','#8fbc8f'),
('a5','Issuing Automation','internal','#cd853f')
on conflict do nothing;

insert into public_holidays (id,office,name,iso_date,display_date) values
('ph1','Brisbane','Good Friday','2026-04-03','03 Apr 2026'),
('ph2','Brisbane','Easter Monday','2026-04-06','06 Apr 2026'),
('ph3','Brisbane','Labour Day','2026-05-04','04 May 2026'),
('ph5','Brisbane','Christmas Day','2026-12-25','25 Dec 2026'),
('ph7','Chennai','Tamil New Year','2026-04-14','14 Apr 2026'),
('ph8','Chennai','State Election Day','2026-04-23','23 Apr 2026'),
('ph9','Chennai','Labour Day','2026-05-01','01 May 2026'),
('ph12','Chennai','Christmas Day','2026-12-25','25 Dec 2026'),
('ph13','Bangkok','Chakri Day','2026-04-06','06 Apr 2026'),
('ph14','Bangkok','Songkran (Thai New Year)','2026-04-13','13 Apr 2026'),
('ph15','Bangkok','Labour Day','2026-05-01','01 May 2026'),
('ph18','Bangkok','Christmas Day','2026-12-25','25 Dec 2026')
on conflict do nothing;

insert into upcoming_leave (id,office,name,start_date,end_date,dates) values
('l2','Brisbane','Sheree','2026-04-13','2026-04-24','13 Apr – 24 Apr (12 days)'),
('l3','Brisbane','Kohan','2026-08-26','2026-09-14','26 Aug – 14 Sep (13 days)'),
('l4','Brisbane','Chayton','2026-05-05','2026-05-18','05 May – 18 May (9 days)'),
('l5','Chennai','Arunachalam','2026-04-13','2026-04-21','13 Apr – 21 Apr'),
('l6','Chennai','Rajan','2026-05-04','2026-05-08','04 May – 08 May'),
('l9','Chennai','Usha','2026-01-01','2026-12-31','Maternity Leave (ongoing)')
on conflict do nothing;
