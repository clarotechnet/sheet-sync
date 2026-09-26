-- Expand roster names only when the collaborator registry has one exact
-- continuation and neither the old nor full name has a competing roster row.
with names(old_name, full_name, front, city) as (
  values
    ('BRENO FERREIRA', 'BRENO FERREIRA PONCIANO', 'ADESÃO/SERVIÇOS', 'NATAL/PARNAMIRIM'),
    ('MARCO JOSE', 'MARCO JOSE ALVES DA SILVA', 'ADESÃO/SERVIÇOS', 'FORTALEZA'),
    ('RONALDO DE SOUSA', 'RONALDO DE SOUSA PINHEIRO', 'ADESÃO/SERVIÇOS', 'FORTALEZA'),
    ('LAVOISIER JUSTINO', 'LAVOISIER JUSTINO DOS SANTOS', 'CONSTRUÇÃO/MDU', 'NATAL/PARNAMIRIM'),
    ('ANDRE LUIS', 'ANDRE LUIS BATISTA DE PAULA', 'CONTROLE', 'NATAL/PARNAMIRIM'),
    ('ANTONIA ELIZIENE', 'ANTONIA ELIZIENE DO NASCIMENTO', 'CONTROLE', 'NATAL/PARNAMIRIM'),
    ('FRANCISCO GABRIEL', 'FRANCISCO GABRIEL DE PAULA DANTAS', 'CONTROLE', 'NATAL/PARNAMIRIM'),
    ('KENIA KATIUCIA', 'KENIA KATIUCIA SANTOS DA SILVA', 'CONTROLE', 'NATAL/PARNAMIRIM'),
    ('ANTONIO ILTON', 'ANTONIO ILTON FARIAS FERREIRA', 'DESCONEXÃO', 'FORTALEZA'),
    ('JOSE ROBSON', 'JOSE ROBSON CORREIA DE ARAUJO', 'DESCONEXÃO', 'FORTALEZA'),
    ('MARCOS WENDELL', 'MARCOS WENDELL CASTRO DO NASCIMENTO', 'DESCONEXÃO', 'MOSSORÓ')
)
update public.tecnicos_frentes old
set nome = names.full_name
from names
where old.nome = names.old_name
  and old.frente = names.front
  and old.cidade = names.city
  and exists (
    select 1 from public.colaboradores_cadastrados collaborator
    where collaborator.nome = names.full_name
  )
  and not exists (
    select 1 from public.tecnicos_frentes other
    where other.nome = names.full_name
  )
  and not exists (
    select 1 from public.comissionamento sale
    where upper(btrim(sale.nome)) = names.old_name
  );

-- Carlos's older shorthand has a confirmed sale. Keep its ID and import hash.
update public.comissionamento sale
set nome = 'CARLOS ADRIANO DA SILVA'
where upper(btrim(sale.nome)) = 'CARLOS ADRIANO'
  and sale.alocacao = 'NATAL/PARNAMIRIM'
  and (sale.frente = 'CONTROLE' or sale.frente is null)
  and exists (
    select 1 from public.tecnicos_frentes current
    where current.nome = 'CARLOS ADRIANO DA SILVA'
      and current.frente = 'CONTROLE'
      and current.cidade = sale.alocacao
  );

-- These older aliases duplicate a later full-name entry. Tiago changed
-- fronts and Oyama changed cities; neither alias has a sale of its own.
with duplicates(old_name, full_name, old_front, old_city, new_front, new_city) as (
  values
    ('CARLOS ADRIANO', 'CARLOS ADRIANO DA SILVA', 'CONTROLE', 'NATAL/PARNAMIRIM', 'CONTROLE', 'NATAL/PARNAMIRIM'),
    ('OYAMA EDUARDO', 'OYAMA EDUARDO FILGUEIRA AFONSO JUNIOR', 'CONTROLE', 'NATAL/PARNAMIRIM', 'CONTROLE', 'MOSSORÓ'),
    ('TIAGO OLIVEIRA', 'TIAGO OLIVEIRA DE ALMEIDA', 'ADESÃO/SERVIÇOS', 'FORTALEZA', 'VISITA TÉCNICA', 'FORTALEZA')
)
delete from public.tecnicos_frentes old
using duplicates pair
where old.nome = pair.old_name
  and old.frente = pair.old_front
  and old.cidade = pair.old_city
  and exists (
    select 1 from public.tecnicos_frentes current
    where current.nome = pair.full_name
      and current.frente = pair.new_front
      and current.cidade = pair.new_city
      and current.created_at > old.created_at
  )
  and exists (
    select 1 from public.colaboradores_cadastrados collaborator
    where collaborator.nome = pair.full_name
  )
  and not exists (
    select 1 from public.comissionamento sale
    where upper(btrim(sale.nome)) = pair.old_name
  );
