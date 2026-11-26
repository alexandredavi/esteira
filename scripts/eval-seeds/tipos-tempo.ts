// Tipos do protótipo da story #10 (semente do eval).
export type Cliente = { id: string; nome: string };
export type Projeto = { id: string; nome: string; clienteId: string; valorHoraCentavos: number };
export type Registro = { id: string; projetoId: string; descricao?: string; inicio: string; fim: string; minutos: number };
