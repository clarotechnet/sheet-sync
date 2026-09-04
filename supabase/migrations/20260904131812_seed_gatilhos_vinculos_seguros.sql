with source_data (id_externo, nome_origem) as (
  values
    ('52299', 'ACTON'),
    ('17023', 'ADENILDO'),
    ('313363', 'ADRIANO COSTA'),
    ('344569', 'ALEXANDRE ELIAS'),
    ('349378', 'ALEXANDRE LEVY'),
    ('341813', 'ALEXANDRE NASCIMENTO'),
    ('269860', 'ALLAN JAYVERSON DESC'),
    ('284992', 'ALMIR FAUSTINO'),
    ('121730', 'ANDER'),
    ('302153', 'AUGUSTO FERREIRA'),
    ('339219', 'BILLY DJOW'),
    ('349379', 'BRUNO GABRIEL OLIVEIRA PEREIRA'),
    ('162483', 'CARLOS ANDRERSON'),
    ('55810', 'CAUE ASSIS'),
    ('1259', 'DANIEL GOIS'),
    ('6522', 'DEICKSON'),
    ('328898', 'DENIS NUNES'),
    ('1308', 'EDCARLOS DE LIRA'),
    ('254622', 'EDIVANALDO VICENTE'),
    ('6560', 'EDSON ASSIS'),
    ('5608', 'EGILENO SENA'),
    ('297680', 'ELVIS AARON  DESC'),
    ('346280', 'ERIPABLO ALVES'),
    ('342450', 'ERIVANILDO DA CRUZ SANTOS'),
    ('328895', 'FERNANDO ANTONIO'),
    ('256387', 'FRANCISCO JUSSIER'),
    ('346281', 'FRANCISCO WAGNER'),
    ('277376', 'GABRIEL BRITO DESC'),
    ('4869', 'GABRIEL RELVA'),
    ('188944', 'GABRIEL SENA  DESC'),
    ('277377', 'GENIVAL QUIRINO DESC'),
    ('339177', 'GUILHERME HENRIQUE'),
    ('1247', 'GUSTAVO WANDRIER'),
    ('7726', 'HAWELLS OLIVEIRA'),
    ('312788', 'HIURY CESAR'),
    ('1242', 'IASLAN SOUZA'),
    ('346282', 'IRENILSON ROCHA'),
    ('162701', 'IURY FERREIRA'),
    ('7776', 'JADSON PEREIRA'),
    ('1227', 'JAILSON DE MEDEIROS'),
    ('339175', 'JANDERSON COSTA'),
    ('34070', 'JEAN CHARLES'),
    ('341667', 'JEAN JORGE'),
    ('328902', 'JEFFERSON ANTONIO'),
    ('349381', 'JEFFERSON MENDES'),
    ('176181', 'JEYFFERSON GUEDES'),
    ('314761', 'JOALYSON SILVA'),
    ('17496', 'JOAO CARLOS'),
    ('301595', 'JOAO MACIEL'),
    ('349382', 'JOAO MARIA BATISTA CANELA'),
    ('122029', 'JOAO MARIA CHIP'),
    ('184084', 'JONAS FLORENCIO'),
    ('304602', 'JOSE GECIONE'),
    ('277261', 'JUDENELES GOMES'),
    ('335830', 'KASSIO KENNEDY'),
    ('210234', 'LEOMIR DA SILVA'),
    ('129079', 'LUCIANO DA SILVA'),
    ('188946', 'LUCIVALDO CAETANO'),
    ('3189', 'MARCELO AECIO'),
    ('310797', 'MARCILIO MDU'),
    ('339168', 'MARCUS VINICIUS'),
    ('188596', 'MARLON SANDRO'),
    ('1257', 'MATEUS LIMA'),
    ('344568', 'MATHEUS FERNANDES'),
    ('338736', 'MELQUISEDEQUE'),
    ('350694', 'NIEDSON DO NASCIMENTO PEREIRA'),
    ('222846', 'PAULO CAVALCANTE'),
    ('339174', 'PAULO ROBERTO'),
    ('339173', 'PEDRO LUCENA'),
    ('1224', 'RENATO DE SOUSA'),
    ('46', 'ROBERTO FAGNER'),
    ('346284', 'RUBENS LUIZ'),
    ('287041', 'SAULO EURIPIS  DESC'),
    ('5173', 'SIDNEY DA SILVA'),
    ('249803', 'SONERREGILSON'),
    ('322032', 'SULIZENO MARTINS'),
    ('312787', 'THIAGO FREITAS'),
    ('328901', 'THIAGO HENRIQUE'),
    ('330510', 'THOMAS JOSE'),
    ('328900', 'UILDSON OLIVEIRA'),
    ('304641', 'VICTOR AMARAL'),
    ('351107', 'VICTOR MANIÇOBA'),
    ('310231', 'VICTOR RAMOS DESC'),
    ('17617', 'WEBERTON'),
    ('24114', 'WINDSON ARAUJO')
),
candidates as (
  select
    source_data.id_externo,
    source_data.nome_origem,
    colaboradores.id as colaborador_id,
    colaboradores.nome,
    colaboradores.setor,
    count(*) over (partition by source_data.id_externo) as candidate_count
  from source_data
  join public.colaboradores_cadastrados colaboradores
    on btrim(regexp_replace(
      translate(upper(colaboradores.nome), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ', 'AAAAAEEEEIIIIOOOOOUUUUCN'),
      '[^A-Z0-9]+', ' ', 'g'
    )) like btrim(regexp_replace(
      translate(upper(regexp_replace(source_data.nome_origem, '\s+DESC$', '', 'i')), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ', 'AAAAAEEEEIIIIOOOOOUUUUCN'),
      '[^A-Z0-9]+', ' ', 'g'
    )) || '%'
),
unique_candidates as (
  select *
  from candidates
  where candidate_count = 1
    and id_externo not in ('328895', '328898', '7726')
)
insert into public.gatilhos_vinculos (
  id_externo,
  colaborador_id,
  cidade,
  tipo,
  papel
)
select
  candidate.id_externo,
  candidate.colaborador_id,
  tecnico.cidade,
  case
    when candidate.nome_origem ~* 'DESC\s*$' or candidate.setor ilike '%Desconexão%'
      then 'DESCONEXAO'
    else null
  end,
  'INSTALADOR'
from unique_candidates candidate
left join lateral (
  select upper(btrim(tf.cidade)) as cidade
  from public.tecnicos_frentes tf
  where btrim(regexp_replace(
    translate(upper(tf.nome), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ', 'AAAAAEEEEIIIIOOOOOUUUUCN'),
    '[^A-Z0-9]+', ' ', 'g'
  )) = btrim(regexp_replace(
    translate(upper(candidate.nome), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ', 'AAAAAEEEEIIIIOOOOOUUUUCN'),
    '[^A-Z0-9]+', ' ', 'g'
  ))
    and upper(btrim(tf.cidade)) in ('FORTALEZA', 'MOSSORÓ', 'NATAL/PARNAMIRIM', 'RECIFE')
  order by tf.id
  limit 1
) tecnico on true
on conflict (id_externo, colaborador_id) do update
set cidade = coalesce(excluded.cidade, gatilhos_vinculos.cidade),
    tipo = coalesce(excluded.tipo, gatilhos_vinculos.tipo),
    atualizado_em = now();

delete from public.gatilhos_vinculos
where id_externo in ('328895', '328898', '7726');

with equipes (id_externo, nome, papel) as (
  values
    ('328895', 'FERNANDO ANTONIO BARRETO DE LIMA JUNIOR', 'INSTALADOR'),
    ('328895', 'MULLER DE OLIVEIRA ELIAS', 'AUXILIAR'),
    ('328898', 'DENNIS NUNES DE OLIVEIRA', 'INSTALADOR'),
    ('328898', 'JAIR CARLOS VIEIRA MENDES', 'AUXILIAR'),
    ('7726', 'HAWELLS OLIVEIRA DA SILVA', 'INSTALADOR'),
    ('7726', 'RONIERE DA SILVA E SOUZA', 'AUXILIAR')
)
insert into public.gatilhos_vinculos (
  id_externo,
  colaborador_id,
  cidade,
  tipo,
  papel
)
select
  equipes.id_externo,
  colaboradores.id,
  'NATAL/PARNAMIRIM',
  'DUPLA',
  equipes.papel
from equipes
join public.colaboradores_cadastrados colaboradores
  on colaboradores.nome = equipes.nome;
