-- الطلبات الخاصة: الطالب يكتب شو بدو، البائع يقبل الطلب، والطالب يتابع الحالة بدون حساب.
-- لقاعدة بياناتك الحالية: الصق هذا الملف في SQL Editor وشغّله مرة وحدة.
-- (نفس المحتوى موجود أيضًا بنهاية schema.sql للسنوات الجاية)

create table if not exists special_requests (
  id uuid primary key default gen_random_uuid(),
  buyer_token text not null unique default encode(gen_random_bytes(16), 'hex'),
  buyer_name text not null check (char_length(buyer_name) between 1 and 40),
  buyer_class text not null check (char_length(buyer_class) between 1 and 20),
  body text not null check (char_length(body) between 3 and 200),
  max_price numeric(8,2) check (max_price is null or max_price >= 0),
  status text not null default 'open'
    check (status in ('open', 'accepted', 'ready', 'done', 'cancelled')),
  seller_id uuid references sellers(id) on delete set null,
  price numeric(8,2) check (price is null or price >= 0),
  created_at timestamptz not null default now()
);

-- بدون أي سياسة للزائر: كل الوصول يمر عبر الدوال أدناه
alter table special_requests enable row level security;

-- الطالب: إنشاء طلب (يرجع توكن خاص يحفظه المتصفح لمتابعة الحالة)
create or replace function create_special_request(
  p_name text, p_class text, p_body text, p_max_price numeric default null
)
returns text
language plpgsql security definer set search_path = public as $$
declare t text;
begin
  insert into special_requests (buyer_name, buyer_class, body, max_price)
  values (trim(p_name), trim(p_class), trim(p_body), p_max_price)
  returning buyer_token into t;
  return t;
end;
$$;

-- الطالب: متابعة طلباته بالتوكنات المحفوظة عنده
create or replace function my_special_requests(p_tokens text[])
returns table (
  buyer_token text, body text, max_price numeric, status text,
  seller_name text, price numeric, created_at timestamptz
)
language sql security definer set search_path = public as $$
  select r.buyer_token, r.body, r.max_price, r.status, s.name, r.price, r.created_at
  from special_requests r
  left join sellers s on s.id = r.seller_id
  where r.buyer_token = any (p_tokens)
  order by r.created_at desc
  limit 20;
$$;

create or replace function cancel_my_request(p_token text)
returns void
language sql security definer set search_path = public as $$
  update special_requests
     set status = 'cancelled'
   where buyer_token = p_token and status in ('open', 'accepted');
$$;

-- البائع: يشوف الطلبات المفتوحة (آخر 3 أيام) وطلباته التي قبلها
create or replace function seller_requests(p_token text)
returns table (
  id uuid, buyer_name text, buyer_class text, body text, max_price numeric,
  status text, price numeric, mine boolean, created_at timestamptz
)
language sql security definer set search_path = public as $$
  select r.id, r.buyer_name, r.buyer_class, r.body, r.max_price,
         r.status, r.price, (r.seller_id = s.id) as mine, r.created_at
  from special_requests r
  cross join sellers s
  where s.token = p_token and s.active
    and ((r.status = 'open' and r.created_at > now() - interval '3 days')
         or r.seller_id = s.id)
  order by r.created_at desc
  limit 100;
$$;

-- البائع: أول واحد يقبل يكسب الطلب. ترجع false لو سبقه أحد.
create or replace function seller_accept_request(
  p_token text, p_request uuid, p_price numeric default null
)
returns boolean
language plpgsql security definer set search_path = public as $$
declare seller uuid; touched int;
begin
  select id into seller from sellers where token = p_token and active;
  if seller is null then return false; end if;

  update special_requests
     set seller_id = seller, status = 'accepted', price = p_price
   where id = p_request and status = 'open';
  get diagnostics touched = row_count;
  return touched > 0;
end;
$$;

create or replace function seller_set_request_status(p_token text, p_request uuid, p_status text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('ready', 'done', 'cancelled') then
    raise exception 'bad status';
  end if;
  update special_requests r
     set status = p_status
    from sellers s
   where r.id = p_request
     and r.seller_id = s.id
     and s.token = p_token and s.active
     and r.status in ('accepted', 'ready');
end;
$$;

grant execute on function create_special_request(text, text, text, numeric) to anon;
grant execute on function my_special_requests(text[])                       to anon;
grant execute on function cancel_my_request(text)                           to anon;
grant execute on function seller_requests(text)                             to anon;
grant execute on function seller_accept_request(text, uuid, numeric)        to anon;
grant execute on function seller_set_request_status(text, uuid, text)       to anon;
