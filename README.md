# VagaFácil
**Estacionar ficou mais fácil.**

Plataforma PWA para gestão municipal de estacionamento rotativo, com três áreas integradas: cidadão, agente de trânsito e administração.

## Stack
- React + TypeScript + Vite
- Supabase (Auth, PostgreSQL, Realtime e Storage)
- PWA instalável; interface responsiva em pt-BR

## Desenvolvimento
```bash
npm install
cp .env.example .env.local
npm run dev
```

Preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` com as credenciais do projeto Supabase. Nunca use chave `service_role` no navegador.

## Banco de dados
Revise e aplique a migration em `supabase/migrations` no projeto Supabase de destino. As tabelas expostas usam RLS; políticas e funções devem ser revisadas antes de produção.

## Situação
Fundação inicial do produto. A ativação dos fluxos reais depende da configuração do Supabase e da implantação progressiva dos módulos. O vencimento de sessão deve gerar alerta para fiscalização, nunca multa automática.

## Scripts
- `npm run dev` — desenvolvimento
- `npm run build` — validação TypeScript e build
- `npm run preview` — prévia local