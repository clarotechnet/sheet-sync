export type Frente =
    | 'DESCONEXÃO'
    | 'INSTALAÇÃO'
    | 'INSTALAÇÃO ND'
    | 'MIGRAÇÃO'
    | 'VISITA TECNICA'
    | 'MDU'
    | 'PONTO ULTRA';

export const FRENTES: Frente[] = [
    'DESCONEXÃO',
    'INSTALAÇÃO',
    'INSTALAÇÃO ND',
    'MIGRAÇÃO',
    'VISITA TECNICA',
    'MDU',
    'PONTO ULTRA',
];

const RAW_MAP: Record<string, Frente> = {
    'Desconexao Inad': 'DESCONEXÃO',
    'Instalacao': 'INSTALAÇÃO',
    'Retorno Credenciada': 'INSTALAÇÃO',
    'Retirada Equipamento': 'DESCONEXÃO',
    'Manutencao Preventiva MDU': 'MDU',
    'Troca Terminal 4K': 'INSTALAÇÃO',
    'INST GPON - INST CABO': 'MIGRAÇÃO',
    'Visita Tecnica': 'VISITA TECNICA',
    'Manutencao Indoor': 'VISITA TECNICA',
    'Manut Ruido': 'VISITA TECNICA',
    'Mudanca de Endereco': 'INSTALAÇÃO',
    'Mudanca de Pacote': 'INSTALAÇÃO',
    'Retirar Ponto': 'DESCONEXÃO',
    'Desconexao Opcao': 'DESCONEXÃO',
    'Instalacao Streaming Express': 'DESCONEXÃO',
    'Adequacao MDU GPON': 'INSTALAÇÃO',
    'Mudanca de Local': 'INSTALAÇÃO',
    'Troca de Equipamento Streaming': 'DESCONEXÃO',
    'Subs de controle Streaming': 'DESCONEXÃO',
    'Refazer Manutencao': 'INSTALAÇÃO',
    'Refazer Manutencao PON': 'INSTALAÇÃO',
    'Subs de Controle': 'DESCONEXÃO',
    'Manut Corretiva Degradacao MDU': 'MDU',
    'Refazer Instalacao': 'INSTALAÇÃO',
    'Configuracao Streaming': 'INSTALAÇÃO',
    'Reinstalacao Streaming': 'INSTALAÇÃO',
    'Troca Decoder Digital': 'INSTALAÇÃO',
    'Mud Pacote Streaming Express': 'DESCONEXÃO',
    'Atendimento Prioritario Manut': 'VISITA TECNICA',
    'ME ADEQUACAO MDU GPON': 'INSTALAÇÃO',
    'Reinstalacao': 'INSTALAÇÃO',
    'Troca de Equipamento': 'INSTALAÇÃO',
    'Vistoria de Danos EPO': 'VISITA TECNICA',
    'Desobstrucao': 'INSTALAÇÃO',
    'Manutencao Corretiva MDU': 'MDU',
    'Entrega de Controle VOZ': 'DESCONEXÃO',
    'INSTALACAO BSOD': 'INSTALAÇÃO',
    'Instalacao SVA': 'PONTO ULTRA',
    'MANUTENCAO CORRETIVA - MDU GPON': 'MDU',
    'Modernizacao': 'VISITA TECNICA',
    'Manut Drop': 'VISITA TECNICA',
    'Entrega Express Shome': 'DESCONEXÃO',
    'Chip Tecnico': 'INSTALAÇÃO',
    'Troca Wifi': 'INSTALAÇÃO',
    'INST HFC - INST CABO': 'INSTALAÇÃO',
    'Troca Tecnologia Smart': 'INSTALAÇÃO',
    'Manutencao Cop': 'VISITA TECNICA',
    'ATENDIMENTO MANUTENCAO': 'VISITA TECNICA',
    'VT Cump Especial': 'VISITA TECNICA',
    'Desconexao Inad EBT': 'DESCONEXÃO',
    'Vistoria de Danos IAT': 'VISITA TECNICA',
    'Retirar Smart home': 'DESCONEXÃO',
    'MP GPON - INST CABO': 'INSTALAÇÃO',
    'Controle de Qualidade': 'VISITA TECNICA',
    'Construcao MDU GPON': 'INSTALAÇÃO',
    'Chip Correio': 'INSTALAÇÃO',
};



// Normaliza string para lookup case/acento-insensitive
const norm = (s: string) =>
    s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

const NORMALIZED_MAP: Record<string, Frente> = Object.fromEntries(
    Object.entries(RAW_MAP).map(([k, v]) => [norm(k), v])
);

const TIPOS_OS_INSTALACAO_ND = new Set([
    norm('1 - ADESAO - INSTALACAO DE ASSINATURA'),
    norm('51 - ADESAO - INSTALACAO DE ASSINATURA DIGITAL'),
]);

export function getFrenteForTipo(
    tipo: string | undefined | null,
    tipoOs1?: string | null
): Frente | null {
    if (!tipo) return null;

    const frenteBase = NORMALIZED_MAP[norm(tipo)] ?? null;

    // Migração tem prioridade mesmo que o arquivo traga um Tipo O.S 1 de adesão.
    if (frenteBase === 'MIGRAÇÃO') return frenteBase;

    if (
        frenteBase === 'INSTALAÇÃO' &&
        tipoOs1 &&
        TIPOS_OS_INSTALACAO_ND.has(norm(tipoOs1))
    ) {
        return 'INSTALAÇÃO ND';
    }

    return frenteBase;
}

export function getTiposByFrente(frente: Frente): string[] {
    return Object.entries(RAW_MAP)
        .filter(([, f]) => f === frente)
        .map(([t]) => t);
}
