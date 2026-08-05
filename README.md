# Contagem Açaí — stock diário multi-loja

PWA mobile-first (Next.js 14 + Supabase) para contagem diária de stock numa cadeia de lojas de açaí.

- **Staff**: 1 login partilhado por loja → contagem pré-preenchida com os valores de ontem, steppers ±1/±½, reposições, campo "Contado por". Rascunho guardado no telemóvel a cada toque (nada se perde se a ligação cair). Editável até ao fim do dia (bloqueado na base de dados via RLS, hora de Lisboa).
- **Admin**: painel com lojas em falta (vs. hora limite), stock baixo, consumo negativo; tabela stock/consumo por loja e dia (editável pelo admin em qualquer data); tendências 7/30 dias; registo de reposições; exportação CSV; gestão de produtos/categorias/limiares/ativação por loja; definições.
- **Consumo** = ontem + reposição − hoje. Negativo = erro de contagem → sinalizado a vermelho.

## Estrutura

```
app/                  páginas (App Router)
  contagem/           ecrã do staff
  admin/              painel + subpáginas
components/           header, nav, registo do service worker
lib/                  clientes Supabase, datas (Europe/Lisbon), números pt
public/               manifest, sw.js, offline.html, ícones
supabase/migrations/  001_schema.sql (tabelas+RLS+RPC) · 002_seed.sql (Loja 1 + produtos)
docs/                 folha de instruções para o staff (PT)
```

---

## 1. Supabase (≈10 min)

1. Crie um projeto em [supabase.com](https://supabase.com) (plano gratuito). Região: **West EU**.
2. **SQL Editor** → cole e execute `supabase/migrations/001_schema.sql` → depois `002_seed.sql`.
3. **Authentication → Providers → Email**: desligue **Confirm email** (os logins são criados por si, sem fluxo de confirmação).
4. Guarde de **Settings → API**: `Project URL` e `anon public key`.

### Criar o utilizador admin (você)

1. **Authentication → Users → Add user → Create new user**
   Email: o seu · Password: forte · marque **Auto Confirm User**.
2. Copie o UUID do utilizador criado e no **SQL Editor**:

```sql
insert into public.profiles (user_id, role)
values ('UUID-DO-ADMIN', 'admin');
```

### Criar o login partilhado de cada loja

1. **Authentication → Users → Add user**: ex. `loja1@suamarca.pt`, password partilhada, **Auto Confirm User**.
2. Ligue-o à loja:

```sql
insert into public.profiles (user_id, role, location_id)
values (
  'UUID-DO-USER-LOJA1',
  'staff',
  (select id from public.locations where name = 'Loja 1')
);
```

Repita para cada loja nova (crie a loja primeiro em **Admin → Mais → Definições** na app, ou via SQL). Se um funcionário sair, mude a password do login da loja em **Authentication → Users**.

---

## 2. Vercel (≈5 min)

1. Suba este repositório para o GitHub.
2. [vercel.com](https://vercel.com) → **Add New → Project** → importe o repo (framework: Next.js, sem configuração extra).
3. **Environment Variables**:

| Nome | Valor |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL do Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key |

4. **Deploy**. A app fica em `https://<projeto>.vercel.app` (pode ligar um domínio próprio depois).

> Nunca coloque a `service_role key` na app — não é usada em lado nenhum.

### Teste rápido

1. Abra a URL no telemóvel → login da loja → aparece "Contagem de hoje" com os produtos.
2. Submeta uma contagem de teste → entre como admin → painel mostra a loja com ✓.

---

## 3. Instalação nos telemóveis (sem app store)

Folha pronta a imprimir para o staff: `docs/folha-instrucoes-staff.pdf` (ou o `.md`).
Resumo: abrir a URL no browser → **Adicionar ao ecrã principal** (iPhone: Safari → Partilhar; Android: Chrome → menu ⋮). O login fica memorizado.

## Offline

- Cada alteração é gravada instantaneamente no telemóvel (localStorage). Queda de ligação não perde nada; a app avisa e o botão Submeter reativa quando a rede volta.
- O service worker mantém a "shell" da app em cache e mostra uma página offline em pt-PT se abrir sem rede.

## Fuso horário

Todas as datas de negócio ("hoje", limite de edição, hora limite) usam **Europe/Lisbon**, no cliente e nas políticas RLS.

## Desenvolvimento local

```bash
cp .env.local.example .env.local   # preencher com URL + anon key
npm install
npm run dev
```
