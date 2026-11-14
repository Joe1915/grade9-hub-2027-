-- سوق المدرسة — قاعدة البيانات
-- الصق هذا الملف كامل في Supabase > SQL Editor > Run

create extension if not exists pgcrypto;

-- ---------- الجداول ----------

create table if not exists sellers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  token text not null unique default encode(gen_random_bytes(16), 'hex'),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists leaders (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  class_name text,
  token text not null unique default encode(gen_random_bytes(16), 'hex'),
  created_at timestamptz not null default now()
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references sellers(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  price numeric(8,2) not null check (price >= 0),
  category text not null default 'other'
    constraint products_category_check
    check (category in ('chips', 'drinks', 'sandwiches', 'sweets', 'other')),
  description text check (char_length(description) <= 200),
  image_url text,
  available boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  buyer_name text not null check (char_length(buyer_name) between 1 and 40),
  buyer_class text not null check (char_length(buyer_class) between 1 and 20),
  note text check (char_length(note) <= 200),
  status text not null default 'new'
    check (status in ('new', 'ready', 'done', 'cancelled')),
  created_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  sender_name text check (char_length(sender_name) <= 40),
  sender_class text check (char_length(sender_class) <= 20),
  body text not null check (char_length(body) between 3 and 500),
  created_at timestamptz not null default now()
);

-- ---------- الصلاحيات (RLS) ----------
-- الزائر (anon) يقدر فقط: يشوف المنتجات المتاحة، يرسل طلب، يرسل رسالة.
-- ما يقدر يقرأ الطلبات ولا الرسائل ولا التوكنات.

alter table sellers  enable row level security;
alter table leaders  enable row level security;
alter table products enable row level security;
alter table orders   enable row level security;
alter table messages enable row level security;

drop policy if exists orders_insert on orders;
create policy orders_insert on orders
  for insert to anon with check (status = 'new');

drop policy if exists messages_insert on messages;
create policy messages_insert on messages
  for insert to anon with check (true);

-- عرض المنتجات للزوار (بدون أي بيانات حساسة عن البائع)
create or replace view market_products as
  select p.id, p.name, p.price, p.category, p.description, p.image_url,
         s.name as seller_name
  from products p
  join sellers s on s.id = p.seller_id
  where p.available and s.active;

grant select on market_products to anon;

-- ---------- دوال البائع والليدر (تحتاج التوكن الخاص) ----------

create or replace function seller_name(p_token text)
returns text
language sql security definer set search_path = public as $$
  select name from sellers where token = p_token and active;
$$;

create or replace function seller_orders(p_token text)
returns table (
  id uuid, product_name text, buyer_name text, buyer_class text,
  note text, status text, created_at timestamptz
)
language sql security definer set search_path = public as $$
  select o.id, p.name, o.buyer_name, o.buyer_class, o.note, o.status, o.created_at
  from orders o
  join products p on p.id = o.product_id
  join sellers s on s.id = p.seller_id
  where s.token = p_token and s.active
  order by o.created_at desc
  limit 200;
$$;

create or replace function seller_set_status(p_token text, p_order uuid, p_status text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('new', 'ready', 'done', 'cancelled') then
    raise exception 'bad status';
  end if;
  update orders o
     set status = p_status
    from products p, sellers s
   where o.id = p_order
     and p.id = o.product_id
     and s.id = p.seller_id
     and s.token = p_token
     and s.active;
end;
$$;

create or replace function leader_name(p_token text)
returns text
language sql security definer set search_path = public as $$
  select name from leaders where token = p_token;
$$;

create or replace function leader_messages(p_token text)
returns table (
  id uuid, sender_name text, sender_class text, body text, created_at timestamptz
)
language sql security definer set search_path = public as $$
  select m.id, m.sender_name, m.sender_class, m.body, m.created_at
  from messages m
  where exists (select 1 from leaders l where l.token = p_token)
  order by m.created_at desc
  limit 200;
$$;

grant execute on function seller_name(text)                 to anon;
grant execute on function seller_orders(text)               to anon;
grant execute on function seller_set_status(text, uuid, text) to anon;
grant execute on function leader_name(text)                 to anon;
grant execute on function leader_messages(text)             to anon;

-- ---------- الطلبات الخاصة ----------
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

-- ---------- إعلانات البائع + واتساب ----------
-- رقم واتساب اختياري (أرقام فقط مع رمز الدولة، مثل 962791234567). فاضي = غير ظاهر للطلاب.
alter table sellers add column if not exists whatsapp text
  check (whatsapp is null or whatsapp ~ '^[0-9]{8,15}$');

-- نفس العرض السابق + رقم واتساب البائع (لو حطه) بآخر الأعمدة
create or replace view market_products as
  select p.id, p.name, p.price, p.category, p.description, p.image_url,
         s.name as seller_name, s.whatsapp as seller_whatsapp
  from products p
  join sellers s on s.id = p.seller_id
  where p.available and s.active;

grant select on market_products to anon;

-- ---------- دوال البائع (تحتاج التوكن الخاص) ----------

create or replace function seller_products(p_token text)
returns table (
  id uuid, name text, price numeric, category text, description text,
  available boolean, created_at timestamptz
)
language sql security definer set search_path = public as $$
  select p.id, p.name, p.price, p.category, p.description, p.available, p.created_at
  from products p
  join sellers s on s.id = p.seller_id
  where s.token = p_token and s.active
  order by p.created_at desc
  limit 100;
$$;

create or replace function seller_add_product(
  p_token text, p_name text, p_price numeric, p_category text, p_description text default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare seller uuid; total int; new_id uuid;
begin
  select id into seller from sellers where token = p_token and active;
  if seller is null then raise exception 'invalid seller'; end if;

  select count(*) into total from products where seller_id = seller;
  if total >= 40 then raise exception 'too many products'; end if;

  insert into products (seller_id, name, price, category, description)
  values (seller, trim(p_name), p_price, p_category,
          nullif(trim(coalesce(p_description, '')), ''))
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function seller_set_product_available(p_token text, p_product uuid, p_available boolean)
returns void
language sql security definer set search_path = public as $$
  update products p
     set available = p_available
    from sellers s
   where p.id = p_product
     and p.seller_id = s.id
     and s.token = p_token and s.active;
$$;

create or replace function seller_whatsapp(p_token text)
returns text
language sql security definer set search_path = public as $$
  select whatsapp from sellers where token = p_token and active;
$$;

create or replace function seller_set_whatsapp(p_token text, p_number text)
returns void
language sql security definer set search_path = public as $$
  update sellers
     set whatsapp = nullif(trim(p_number), '')
   where token = p_token and active;
$$;

grant execute on function seller_products(text)                                  to anon;
grant execute on function seller_add_product(text, text, numeric, text, text)    to anon;
grant execute on function seller_set_product_available(text, uuid, boolean)      to anon;
grant execute on function seller_whatsapp(text)                                  to anon;
grant execute on function seller_set_whatsapp(text, text)                        to anon;

-- ---------- بيانات تجريبية (احذفها قبل الإطلاق) ----------
-- insert into sellers (name) values ('بائع تجريبي');
-- insert into products (seller_id, name, price, category, description)
--   select id, 'شيبس ليز', 0.5, 'chips', 'كيس صغير' from sellers limit 1;
--
-- لإضافة بائع حقيقي:   insert into sellers (name) values ('اسم البائع');
-- لجلب رابطه الخاص:    select name, token from sellers;
--   الرابط = https://موقعك/seller.html?t=التوكن
-- لإضافة ليدر:         insert into leaders (name, class_name) values ('اسم الليدر', '9A');
--   الرابط = https://موقعك/leader.html?t=التوكن
