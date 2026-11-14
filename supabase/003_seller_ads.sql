-- إعلانات يكتبها البائع بنفسه + رقم واتساب اختياري.
-- لقاعدة بياناتك الحالية: الصق هذا الملف في SQL Editor وشغّله مرة وحدة.
-- (نفس المحتوى موجود أيضًا بنهاية schema.sql للسنوات الجاية)

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
