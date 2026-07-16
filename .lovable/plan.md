# Vytelis Supply — Master Prompt V1.0 Parte 1

Fundação de produção: rebrand para **Vytelis / Vytelis Supply**, ativar Lovable Cloud (Supabase), autenticação real, schema multi-hospital com RLS, e arquitetura pronta para os módulos futuros. Nenhuma tela operacional (produtos, estoque, movimentações) será implementada nesta parte — é preparação de fundação, exatamente como pedido.

## Escopo desta entrega (Parte 1)

Somente o que a Parte 1 exige:

1. **Rebrand visual** — "HospitalFlow / MedControl" → "Vytelis / Vytelis Supply" no sidebar, títulos das rotas, `__root.tsx` (title, description, OG), tela de login. Sem mudar o design system.
2. **Ativar Lovable Cloud** (Supabase gerenciado).
3. **Autenticação real** com Supabase Auth:
   - Tela `/auth` (email + senha) substituindo o mock em `/login`.
   - Layout protegido `_authenticated/route.tsx` (gerido pela integração).
   - Botão "Sair" no sidebar chama `supabase.auth.signOut()` com sign-out hygiene (cancelQueries, clear cache, replace nav).
   - Listener `onAuthStateChange` no `__root.tsx` filtrado (SIGNED_IN/OUT/USER_UPDATED).
4. **Migrar rotas operacionais** para dentro de `_authenticated/` (Dashboard, Produtos, Estoque, Locais, Setores, Leitos, etc.). Rota pública `/` = landing simples com CTA "Entrar", ou redirect para `/auth` quando deslogado / `/dashboard` quando logado. Decisão: **manter `/` como landing pública mínima** e mover dashboard para `/_authenticated/dashboard`.
5. **Schema de banco (migration única)** com todas as tabelas de fundação, GRANTs, RLS e triggers de auditoria:

```text
hospitals              (id, name, cnpj, active, timestamps + audit cols)
stock_centers          (id, hospital_id, name, type, active, ...)
app_role (enum)        administrator | warehouse | pharmacy | audit | manager | read_only
profiles               (id=auth.users.id, hospital_id, stock_center_id, full_name, active, ...)
user_roles             (id, user_id, role app_role, hospital_id, unique)
categories             (id, hospital_id, name, parent_id, active, ...)
suppliers              (id, hospital_id, name, cnpj, contact, active, ...)
products               (id, hospital_id, internal_code, barcode, description,
                        manufacturer, unit, category_id, active, ...)  -- SEM quantidade
stock_items            (id, hospital_id, stock_center_id, product_id, batch,
                        expiration_date, quantity, unit_cost, status, ...)
movement_type (enum)   initial_entry | simple_output | inventory_adjustment |
                        transfer | purchase | return | consumption
movements              (id, hospital_id, stock_center_id, user_id, product_id,
                        stock_item_id, batch, expiration_date, movement_type,
                        quantity, unit_cost, observation, ip_address, device,
                        browser, occurred_at, ...)
audit_log              (id, hospital_id, user_id, entity, entity_id, action,
                        before jsonb, after jsonb, occurred_at)
```

Padrões obrigatórios em toda tabela operacional:
- PK `uuid default gen_random_uuid()`
- `hospital_id uuid not null` (exceto `hospitals`)
- `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at`, `deleted_by`
- Soft delete via `deleted_at`
- Índices em: `barcode`, `internal_code`, `description` (trigram), `manufacturer`, `batch`, `stock_center_id`, `hospital_id`, `expiration_date`

6. **Segurança (RLS)** — RLS habilitado em todas as tabelas. Função `security definer` `has_role(_user_id, _role)` (roles em tabela separada, como no knowledge). Função `current_hospital_id()` lendo o `hospital_id` do `profiles` do usuário. Policies:
   - Todas as leituras/escritas escopadas por `hospital_id = current_hospital_id()`.
   - `administrator` e `manager` podem gerenciar cadastros; `warehouse`/`pharmacy` operam estoque/movimentos; `audit`/`read_only` só leem.
   - `stock_items` e `products.quantity` nunca são editados diretamente pelo frontend — apenas leitura + inserts em `movements` (na Parte 2 vira function transacional). Nesta parte já criamos as policies restritivas.
   - GRANTs explícitos (`authenticated`, `service_role`) para cada tabela pública.

7. **Trigger `handle_new_user`** em `auth.users` cria `profiles` automaticamente. Trigger `set_updated_at` em todas as tabelas. Trigger genérica `audit_row_change` grava em `audit_log` para tabelas sensíveis.

8. **Camada de acesso** (sem UI de busca ainda, apenas serviço):
   - `src/lib/search.functions.ts` — server fn `searchProducts({ query })` com `.middleware([requireSupabaseAuth])`, buscando por barcode / internal_code / description / manufacturer / batch / supplier, filtrado por `hospital_id` do usuário via RLS. Retorna DTO plano.
   - `src/hooks/useCurrentUser.ts` — retorna `{ user, profile, hospital, stockCenter, roles }` derivados após login (React Query). Elimina "perguntar ao operador onde ele trabalha".

9. **Sidebar / navegação** já existente é **reutilizada** — só ajustamos labels de grupos para refletir os módulos:
   - Geral: Dashboard
   - Suprimentos: Produtos, Estoque, Movimentações (placeholder), Inventário
   - Cadastros: Categorias (novo placeholder), Fornecedores (novo placeholder), Locais, Setores, Leitos
   - Administração: Usuários, Auditoria (novo placeholder), Configurações
   - Rodapé: Sair (executa signOut real)

10. **Rotas removidas do sidebar por enquanto** (fora do escopo Vytelis Supply): Farmácia Clínica, Centro Cirúrgico, Dispensações, Devoluções, Relatórios. Os arquivos permanecem para não quebrar imports, mas somem do menu (o prompt manda NÃO implementar isso agora).

## O que NÃO faço nesta Parte 1

- Nenhuma tela CRUD nova de Produtos/Categorias/Fornecedores/Movimentos.
- Nenhum dashboard com dados reais (o Dashboard existente com mock permanece, apenas movido para `/_authenticated/dashboard`).
- Nenhum QR code, prescrição, IA, BI.
- Sem seed de produtos. Apenas um hospital demo + 3 stock centers via migration para permitir login imediato.

## Detalhes técnicos

- **Cloud**: `supabase--enable` primeiro (chave para todo o resto).
- **RLS pattern**: `public.has_role(auth.uid(), 'administrator'::app_role)` — nunca subconsulta no próprio `profiles`/`user_roles` (evita recursão).
- **Auth gate**: `src/routes/_authenticated/route.tsx` gerado pela integração (não escrever à mão). Rotas operacionais movidas para dentro dessa pasta via `mv`.
- **`__root.tsx`**: title "Vytelis Supply", description "Plataforma inteligente de operações hospitalares — módulo Supply.", OG atualizado, listener `onAuthStateChange` adicionado.
- **Sign-in providers**: apenas email/senha nesta parte (o prompt não pede Google). Password HIBP check ativado.
- **Server-only helpers** (`*.server.ts`) para qualquer código que use `supabaseAdmin`. Nenhum secret em módulo compartilhado.
- **Página `/`**: landing pública mínima com logo Vytelis, tagline, botão "Entrar" → `/auth`. Se sessão ativa, redireciona para `/dashboard` via `onAuthStateChange` no root.

## Diagrama de fluxo de autenticação

```text
Visitante → /                 (landing pública)
          → /auth             (login email+senha)
Supabase Auth → handle_new_user trigger cria profiles
router invalida → /_authenticated/dashboard
Todas rotas operacionais → /_authenticated/*
Sair → signOut + cancelQueries + clear + replace → /auth
```

## Entregáveis

- Migration única com schema + GRANTs + RLS + triggers + hospital demo.
- Auth funcional (login/logout) com perfis Administrator, Warehouse, Pharmacy, Audit, Manager, Read Only cadastráveis.
- Rebrand completo Vytelis / Vytelis Supply.
- Fundação pronta para a Parte 2 (CRUDs de Categorias, Fornecedores, Produtos, Batches, Initial Entry, Simple Output).

Confirma que sigo com essa Parte 1 exatamente assim? Se quiser algo diferente — por exemplo manter as rotas de Farmácia Clínica/Centro Cirúrgico no menu, ou adicionar login com Google — me diga antes de eu executar.
