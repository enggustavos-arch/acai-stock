-- ============================================================
-- 002_seed.sql — Loja 1 + categories + full product list
-- ============================================================

insert into public.locations (name) values ('Loja 1');

insert into public.categories (name, sort_order) values
  ('Açaí', 1),
  ('Sorbets', 2),
  ('Descartáveis', 3),
  ('Toppings', 4),
  ('Caldas', 5),
  ('Sucos', 6),
  ('Frutas', 7),
  ('Taças', 8),
  ('Bebidas', 9);

insert into public.products (name, category_id, unit, allows_half, low_stock_threshold)
select v.name, c.id, v.unit, v.allows_half, v.threshold
from (values
  -- Açaí
  ('Açaí 350ml/280ml', 'Açaí', 'un', false, 2),
  ('Açaí 1 L',         'Açaí', 'un', false, 2),
  ('Açaí 2,5 L',       'Açaí', 'un', false, 2),
  ('Açaí 4.25 L',      'Açaí', 'un', false, 2),
  ('Açaí 6 L',         'Açaí', 'un', false, 2),
  -- Sorbets
  ('Cupuaçu',          'Sorbets', 'un', true, 1),
  ('Pitaya',           'Sorbets', 'un', true, 1),
  ('Maracujá',         'Sorbets', 'un', true, 1),
  ('Coco',             'Sorbets', 'un', true, 1),
  ('Goiaba',           'Sorbets', 'un', true, 1),
  ('Graviola',         'Sorbets', 'un', true, 1),
  ('Morango',          'Sorbets', 'un', true, 1),
  ('Mistura Sorvete',  'Sorbets', 'un', true, 1),
  -- Descartáveis (caixas)
  ('Copo Baby (P)',      'Descartáveis', 'cx', true, 1),
  ('Copo Express (M)',   'Descartáveis', 'cx', true, 1),
  ('Copo Strong (G)',    'Descartáveis', 'cx', true, 1),
  ('Copo Powerfull (GG)','Descartáveis', 'cx', true, 1),
  ('Tampa Copo',         'Descartáveis', 'cx', true, 1),
  ('Colher Pequena',     'Descartáveis', 'cx', true, 1),
  ('Colher Grande',      'Descartáveis', 'cx', true, 1),
  ('Guardanapo',         'Descartáveis', 'cx', true, 1),
  -- Toppings
  ('Aveia',             'Toppings', 'kg', true, 1),
  ('Coco Ralado',       'Toppings', 'kg', true, 1),
  ('Flocos de Milho',   'Toppings', 'kg', true, 1),
  ('Granola',           'Toppings', 'kg', true, 1),
  ('Leite Condensado',  'Toppings', 'un', true, 1),
  ('Leite em Pó',       'Toppings', 'un', true, 1),
  ('M&M',               'Toppings', 'kg', true, 1),
  ('Mel',               'Toppings', 'un', true, 1),
  ('Nutella',           'Toppings', 'un', true, 1),
  ('Nuts',              'Toppings', 'kg', true, 1),
  ('Oreo',              'Toppings', 'kg', true, 1),
  ('Paçoca saquinho',   'Toppings', 'un', true, 1),
  ('Paçoquinha',        'Toppings', 'un', true, 1),
  ('Pasta Amendoim',    'Toppings', 'un', true, 1),
  ('Goma',              'Toppings', 'kg', true, 1),
  ('Doce de Leite',     'Toppings', 'un', true, 1),
  ('Amendoim',          'Toppings', 'kg', true, 1),
  ('Whey',              'Toppings', 'un', true, 1),
  ('Marshmallow',       'Toppings', 'kg', true, 1),
  ('Chia',              'Toppings', 'kg', true, 1),
  ('Chocoball',         'Toppings', 'kg', true, 1),
  ('Coco Lasca',        'Toppings', 'kg', true, 1),
  -- Caldas
  ('Calda Morango',   'Caldas', 'un', false, 1),
  ('Calda Chocolate', 'Caldas', 'un', false, 1),
  ('Calda Caramelo',  'Caldas', 'un', false, 1),
  -- Sucos
  ('Suco Abacaxi',  'Sucos', 'un', false, 2),
  ('Suco Maracujá', 'Sucos', 'un', false, 2),
  ('Suco Morango',  'Sucos', 'un', false, 2),
  -- Frutas
  ('Morango', 'Frutas', 'kg', true, 1),
  ('Banana',  'Frutas', 'kg', true, 1),
  ('Kiwi',    'Frutas', 'kg', true, 1),
  ('Uva',     'Frutas', 'kg', true, 1),
  -- Taças / copos servidos
  ('Baby Express', 'Taças', 'un', false, 5),
  ('Express',      'Taças', 'un', false, 5),
  ('Strong',       'Taças', 'un', false, 5),
  ('Powerfull',    'Taças', 'un', false, 5),
  ('Casquinha',    'Taças', 'un', false, 5),
  ('Bowls',        'Taças', 'un', false, 5),
  -- Bebidas
  ('Leite Gordo', 'Bebidas', 'un', false, 3),
  ('Água 500ml',  'Bebidas', 'un', false, 3),
  ('Água 1,5L',   'Bebidas', 'un', false, 3),
  ('Água Pedras', 'Bebidas', 'un', false, 3),
  ('Red Bull',    'Bebidas', 'un', false, 3)
) as v(name, cat, unit, allows_half, threshold)
join public.categories c on c.name = v.cat;

-- Activate every product for Loja 1
insert into public.location_products (location_id, product_id)
select l.id, p.id
from public.locations l
cross join public.products p
where l.name = 'Loja 1';
