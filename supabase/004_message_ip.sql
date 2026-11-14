-- تسجيل عنوان الشبكة (IP) لكل رسالة + حظر عناوين
-- الصق هذا الملف كامل في Supabase > SQL Editor > Run

create table if not exists banned_ips (
  ip text primary key,
  reason text,
  created_at timestamptz not null default now()
);
-- بدون أي policy: ما حدا من الموقع يقدر يقرأه أو يعدّله، بس أنت من SQL Editor.
alter table banned_ips enable row level security;

alter table messages add column if not exists sender_ip text;

create or replace function messages_stamp_ip()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  headers json;
  v_ip text;
begin
  begin
    headers := current_setting('request.headers', true)::json;
  exception when others then
    headers := null;
  end;

  v_ip := nullif(trim(split_part(
    coalesce(headers->>'cf-connecting-ip', headers->>'x-forwarded-for', ''), ',', 1)), '');

  if v_ip is not null and exists (select 1 from banned_ips b where b.ip = v_ip) then
    raise exception 'blocked';
  end if;

  -- نكتب العنوان من السيرفر دايمًا، فما حدا يقدر يزوّره من الموقع.
  new.sender_ip := v_ip;
  return new;
end;
$$;

drop trigger if exists messages_stamp_ip on messages;
create trigger messages_stamp_ip
  before insert on messages
  for each row execute function messages_stamp_ip();

-- ---------- استعمالها (أنت بس) ----------
-- شوف الرسائل مع العناوين:
--   select created_at, sender_name, sender_class, sender_ip, body from messages order by created_at desc;
-- احظر عنوان:
--   insert into banned_ips (ip, reason) values ('1.2.3.4', 'شتم');
-- شيل الحظر:
--   delete from banned_ips where ip = '1.2.3.4';
-- احذف رسالة مسيئة:
--   delete from messages where id = '...';
