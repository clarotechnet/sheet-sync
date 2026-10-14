import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildTechnicianRankingReport, groupTechnicianRankingReport } from '../src/utils/technicianRankingReportData.ts';
import { createTechnicianRankingReportPdf } from '../src/utils/technicianRankingReportExport.ts';

const filters={startDate:'2026-10-01',endDate:'2026-10-14',city:'RECIFE',supervisor:'SUPERVISOR',search:'',sortLabel:'Maior % 409'};
const row=(fields={})=>({key:'Z1',login:'Z1',nome:'NOME COMPLETO',cidade:'RECIFE',supervisor:'SUPERVISOR',cadastrado:true,atividades:2,contratos:2,contratos409:1,porcentagem:50,retornosCredenciados:1,detalhes:[],retornosDetalhes:[],...fields});
const now=new Date('2026-10-14T18:00:00Z');

test('report totals use the visible ranking and weighted 409 percentage',()=>{
  const report=buildTechnicianRankingReport([row(),row({login:'Z2',contratos:3,porcentagem:33.33333333})],filters,null,now);
  assert.deepEqual(report.totals,{technicians:2,contracts:5,code409:2,percentage:40,returns:2,unmapped:0});
  assert.equal(report.filters.city,'RECIFE');
  assert.equal(report.generatedAt,'2026-10-14T18:00:00.000Z');
});

test('report freezes the selected order, filters and data before asynchronous export',()=>{
  const rows=[row({login:'Z2',cadastrado:false}),row({login:'Z1'})];
  const selected={...filters,search:'NOME',sortLabel:'Nome (A-Z)'};
  const report=buildTechnicianRankingReport(rows,selected,'2026-10-14T17:00:00Z',now);
  rows[0].nome='CHANGED';selected.city='NATAL';
  assert.deepEqual(report.rows.map(row=>row.login),['Z2','Z1']);
  assert.deepEqual(report.rows.map(row=>row.position),[1,2]);
  assert.equal(report.rows[0].nome,'NOME COMPLETO');
  assert.equal(report.filters.city,'RECIFE');
  assert.equal(report.totals.unmapped,1);
});

test('zero-contract technicians keep a missing percentage rather than a false zero rate',()=>{
  const report=buildTechnicianRankingReport([row({contratos:0,contratos409:0,retornosCredenciados:1})],filters,null,now);
  assert.equal(report.rows[0].porcentagem,null);assert.equal(report.totals.percentage,null);
  assert.equal(report.totals.returns,1);
});

test('PDF pagination retains every row and its columns, including long names',()=>{
  const rows=Array.from({length:65},(_,index)=>row({login:`LOGIN${String(index).padStart(3,'0')}`,nome:`NOME DE TESTE ${index} ${'SOBRENOME '.repeat(8)}`}));
  const report=buildTechnicianRankingReport(rows,filters,null,now);
  const pdf=createTechnicianRankingReportPdf(report),output=pdf.output();
  assert.ok(pdf.getNumberOfPages()>2);
  rows.forEach(row=>assert.ok(output.includes(row.login),row.login));
  assert.ok(output.includes('LOGIN064'));
  assert.ok(output.includes('SUPERVISOR'));
  assert.ok(output.startsWith('%PDF-'));
});

test('reports separate supervisors, reset ranking positions and reconcile group totals',()=>{
  const report=buildTechnicianRankingReport([row({supervisor:'B'}),row({login:'Z2',supervisor:'A'}),row({login:'Z3',supervisor:'B'}),row({login:'Z4',supervisor:'Não cadastrado',cadastrado:false})],filters,null,now);
  const groups=groupTechnicianRankingReport(report);
  assert.deepEqual(groups.map(group=>group.filters.supervisor),['A','B','Não cadastrado']);
  assert.deepEqual(groups[1].rows.map(row=>row.position),[1,2]);
  assert.deepEqual(groups[1].rows.map(row=>row.login),['Z1','Z3']);
  assert.equal(groups.reduce((sum,group)=>sum+group.totals.contracts,0),report.totals.contracts);
  assert.equal(groups[1].totals.percentage,50);
  assert.equal(report.rows[2].position,3);
});

test('PDF starts a separate page for each supervisor and omits registration/return warnings',()=>{
  const report=buildTechnicianRankingReport([row({supervisor:'ANEZIR'}),row({login:'Z2',supervisor:'ELINO'}),row({login:'Z3',supervisor:'WESLEY SOUZA',cadastrado:false})],filters,null,now);
  const pdf=createTechnicianRankingReportPdf(report),output=pdf.output();
  assert.equal(pdf.getNumberOfPages(),3);
  assert.ok(!output.includes('sem cadastro'));
  assert.ok(!output.includes('sem atribui'));
});
