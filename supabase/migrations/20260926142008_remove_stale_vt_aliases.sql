-- These short records duplicate current collaborators in the same city/front.
-- Keep any alias that has its own commission history or lacks a current match.
with stale_names(old_name, current_name) as (
  values
    ('ANTONIO CARLOS', 'ANTONIO CARLOS DE SOUSA NASCIMENTO'),
    ('CLAUDIO JOSE', 'CLAUDIO JOSE BERNARDO DE ARAUJO'),
    ('DANIEL GOIS', 'DANIEL ANDRE GOIS E SILVA'),
    ('DANILO DE SOUSA', 'DANILO DE SOUSA LIMA'),
    ('FRANCISCO ANDRE', 'FRANCISCO ANDRE RODRIGUES MILHOME'),
    ('GUSTAVO WANDRIER', 'GUSTAVO WANDRIER FERREIRA DA COSTA'),
    ('JOÃO CARLOS', 'JOAO CARLOS GOMES DE OLIVEIRA'),
    ('LUCAS LINHARES', 'LUCAS LINHARES RIBEIRO DA SILVA'),
    ('MAIRTON JOSE', 'MAIRTON JOSE DA SILVA'),
    ('MARCIANO GOMES', 'MARCIANO GOMES MACIEL'),
    ('MARCUS DA SILVA', 'MARCUS DA SILVA CAMURCA'),
    ('MARLON SANDRO', 'MARLON SANDRO MIGUEL ATA GERMANO'),
    ('SIDNEY DA SILVA', 'SIDNEY DA SILVA FERREIRA'),
    ('WEBERTON VITOR', 'WEBERTON VITOR DA SILVA')
)
delete from public.tecnicos_frentes old
using stale_names pair
where old.nome = pair.old_name
  and old.frente = 'VISITA TÉCNICA'
  and exists (
    select 1 from public.tecnicos_frentes current
    where current.nome = pair.current_name
      and current.frente = old.frente
      and current.cidade = old.cidade
  )
  and exists (
    select 1 from public.colaboradores_cadastrados collaborator
    where collaborator.nome = pair.current_name
  )
  and not exists (
    select 1 from public.comissionamento sale
    where translate(upper(btrim(sale.nome)),
      'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ', 'AAAAAEEEEIIIIOOOOOUUUUCN')
      = translate(upper(btrim(old.nome)),
        'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ', 'AAAAAEEEEIIIIOOOOOUUUUCN')
  );

-- The source spelled Bruno's surname without the final S. Preserve row IDs
-- and import hashes while aligning the displayed name with his current roster.
update public.comissionamento sale
set nome = 'BRUNO FREIRES NASCIMENTO'
where sale.nome = 'BRUNO FREIRE NASCIMENTO'
  and sale.alocacao = 'FORTALEZA'
  and sale.frente = 'VISITA TÉCNICA'
  and exists (
    select 1 from public.tecnicos_frentes current
    where current.nome = 'BRUNO FREIRES NASCIMENTO'
      and current.cidade = sale.alocacao
      and current.frente = sale.frente
  )
  and exists (
    select 1 from public.colaboradores_cadastrados collaborator
    where collaborator.nome = 'BRUNO FREIRES NASCIMENTO'
  );

delete from public.tecnicos_frentes old
where old.nome = 'BRUNO FREIRE NASCIMENTO'
  and old.cidade = 'FORTALEZA'
  and old.frente = 'VISITA TÉCNICA'
  and exists (
    select 1 from public.tecnicos_frentes current
    where current.nome = 'BRUNO FREIRES NASCIMENTO'
      and current.cidade = old.cidade
      and current.frente = old.frente
  )
  and not exists (
    select 1 from public.comissionamento sale
    where sale.nome = old.nome
  );
