-- Preserve each sale's ID and import hash while aligning proven abbreviated
-- names with the unique full-name roster entry in the same front and city.
with canonical_names(alias, full_name, front, city) as (
  values
    ('ANDERSON LIMA', 'ANDERSON LIMA DA SILVA', 'ADESÃO/SERVIÇOS', 'RECIFE'),
    ('ANDERSON SANTOS', 'ANDERSON SANTOS DE OLIVEIRA', 'ADESÃO/SERVIÇOS', 'RECIFE'),
    ('BRUNO ANDERSON', 'BRUNO ANDERSON LIMA DA SILVA', 'ADESÃO/SERVIÇOS', 'FORTALEZA'),
    ('CARLOS BERGSON', 'CARLOS BERGSON SERAFIM GUIMARAES', 'ADESÃO/SERVIÇOS', 'FORTALEZA'),
    ('CESAR LEONARDO VASCONCELOS', 'CESAR LEONARDO VASCONCELOS MARQUES DE OLIVEIRA', 'ADESÃO/SERVIÇOS', 'RECIFE'),
    ('CICERO FRANCISCO', 'CICERO FRANCISCO DA SILVA', 'ADESÃO/SERVIÇOS', 'RECIFE'),
    ('CLAUDEMIR MARIANO', 'CLAUDEMIR MARIANO DA SILVA', 'ADESÃO/SERVIÇOS', 'RECIFE'),
    ('DANIEL HENRIQUE', 'DANIEL HENRIQUE RODRIGUES DA SILVA', 'ADESÃO/SERVIÇOS', 'RECIFE'),
    ('DHEYWYSON DE OLIVEIRA', 'DHEYWYSON DE OLIVEIRA SILVA', 'ADESÃO/SERVIÇOS', 'MOSSORÓ'),
    ('DIEGO HENRIQUE', 'DIEGO HENRIQUE SILVA NASCIMENTO', 'ADESÃO/SERVIÇOS', 'FORTALEZA'),
    ('DYOGENES MARQUES', 'DYOGENES MARQUES SILVA DA COSTA', 'ADESÃO/SERVIÇOS', 'RECIFE'),
    ('FABIANO TELES', 'FABIANO TELES MOREIRA', 'ADESÃO/SERVIÇOS', 'FORTALEZA'),
    ('FELIPE JOSE DE FRANCA PEDRO', 'FELIPE JOSE DE FRANCA PEDRO AUTRAN', 'ADESÃO/SERVIÇOS', 'RECIFE'),
    ('FRANCISCO FABRICIO', 'FRANCISCO FABRICIO CAVALCANTE', 'ADESÃO/SERVIÇOS', 'MOSSORÓ'),
    ('FRANCISCO GLAYDSON', 'FRANCISCO GLAYDSON FERREIRA SILVA', 'ADESÃO/SERVIÇOS', 'FORTALEZA'),
    ('FRANCISCO MATEUS SANTOS', 'FRANCISCO MATEUS SANTOS SOUSA', 'ADESÃO/SERVIÇOS', 'FORTALEZA'),
    ('FRANCISCO RODRIGUES', 'FRANCISCO RODRIGUES FARIAS JUNIOR', 'ADESÃO/SERVIÇOS', 'FORTALEZA'),
    ('FRANKLIN GLAEDSTONE', 'FRANKLIN GLAEDSTONE DA SILVA MEDEIROS', 'ADESÃO/SERVIÇOS', 'MOSSORÓ'),
    ('GENILSON JERONIMO FREITAS', 'GENILSON JERONIMO FREITAS DE OLIVEIRA', 'ADESÃO/SERVIÇOS', 'RECIFE'),
    ('GUSTAVO FERNANDES', 'GUSTAVO FERNANDES DA SILVA', 'ADESÃO/SERVIÇOS', 'RECIFE'),
    ('JEAN JORGE', 'JEAN JORGE RODRIGUES BATISTA', 'ADESÃO/SERVIÇOS', 'NATAL/PARNAMIRIM'),
    ('JEFFERSON ANTONIO PEREIRA FERNANDES PIME', 'JEFFERSON ANTONIO PEREIRA FERNANDES PIMENTEL', 'ADESÃO/SERVIÇOS', 'NATAL/PARNAMIRIM'),
    ('JEFFERSON TEODORO', 'JEFFERSON TEODORO ALVES', 'ADESÃO/SERVIÇOS', 'RECIFE'),
    ('JOAO ASARIAS', 'JOAO ASARIAS FONTES', 'ADESÃO/SERVIÇOS', 'FORTALEZA'),
    ('WELLINGTON RIBEIRO', 'WELLINGTON RIBEIRO DE OLIVEIRA SOBRINHO', 'ADESÃO/SERVIÇOS', 'RECIFE')
)
update public.comissionamento sale
set nome = canonical.full_name
from canonical_names canonical
where sale.nome = canonical.alias
  and sale.alocacao = canonical.city
  and (sale.frente = canonical.front or sale.frente is null)
  and exists (
    select 1 from public.tecnicos_frentes current
    where current.nome = canonical.full_name
      and current.frente = canonical.front
      and current.cidade = canonical.city
  )
  and not exists (
    select 1 from public.tecnicos_frentes other
    where other.nome = canonical.alias
      and other.frente = canonical.front
      and other.cidade = canonical.city
  );

-- These older roster entries have no commission history of their own and
-- duplicate a later, full-name collaborator in the same front and city.
with duplicate_names(old_name, current_name, front) as (
  values
    ('DANIEL RUBENS', 'DANIEL RUBENS DOS ANJOS SANTOS', 'ADESÃO/SERVIÇOS'),
    ('JOÃO CUNHA', 'JOAO BATISTA CUNHA MORAES', 'ADESÃO/SERVIÇOS'),
    ('LEANDRO SILVA', 'LEANDRO SILVA PAHE', 'ADESÃO/SERVIÇOS'),
    ('PATRICK KENNEDY', 'PATRICK KENNETH SATIRO DA SILVA', 'ADESÃO/SERVIÇOS'),
    ('ANDERSON SILVA', 'ANDERSON JUSSIER DA SILVA FERNANDES', 'CONTROLE'),
    ('RAFAEL OLINTO', 'RAFAEL OLINTO BESERRA', 'CONTROLE'),
    ('ROMUALDO SANTOS', 'ROMUALDO SANTOS DE MELO', 'CONTROLE')
)
delete from public.tecnicos_frentes old
using duplicate_names duplicate
where old.nome = duplicate.old_name
  and old.frente = duplicate.front
  and exists (
    select 1 from public.tecnicos_frentes current
    where current.nome = duplicate.current_name
      and current.frente = old.frente
      and current.cidade = old.cidade
      and current.created_at > old.created_at
  )
  and exists (
    select 1 from public.colaboradores_cadastrados collaborator
    where collaborator.nome = duplicate.current_name
  )
  and not exists (
    select 1 from public.comissionamento sale
    where translate(upper(btrim(sale.nome)),
      'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ', 'AAAAAEEEEIIIIOOOOOUUUUCN')
      = translate(upper(btrim(old.nome)),
        'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ', 'AAAAAEEEEIIIIOOOOOUUUUCN')
  );
