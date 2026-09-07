import type { StaticRailStation } from '../rail-stations.types';

export const L2_STATIONS: StaticRailStation[] = [
  { code: 'VMD', name: 'Vila Madalena' },
  {
    code: 'SUM',
    name: 'Sumaré',
    alternativeNames: [
      'Santuário Nosa Senhora de Fátima-Sumaré',
      'Santuário N. S. de Fátima-Sumaré',
      'Santuário N. Sra. de Fátima',
    ],
  },
  {
    code: 'CLI',
    name: 'Clínicas',
  },
  { code: 'CNS', name: 'Consolação' },
  { code: 'TRI', name: 'Trianon-Masp' },
  { code: 'BGD', name: 'Brigadeiro' },
  { code: 'PSO', name: 'Paraíso', alternativeNames: ['Paraíso (Linha 2)'] },
  {
    code: 'ANR',
    name: 'Ana Rosa',
    alternativeNames: ['Ana Rosa (Linha 2)'],
  },
  { code: 'CKB', name: 'Chácara Klabin' },
  { code: 'IMG', name: 'Santos-Imigrantes' },
  { code: 'AIP', name: 'Alto do Ipiranga' },
  { code: 'SAC', name: 'Sacomã' },
  {
    code: 'TTI',
    name: 'Tamanduateí',
    alternativeNames: ['Tamanduateí (Linha 2)'],
  },
  {
    code: 'VPT',
    name: 'Vila Prudente',
    alternativeNames: ['Vila Prudente (Linha 2)'],
  },
];
