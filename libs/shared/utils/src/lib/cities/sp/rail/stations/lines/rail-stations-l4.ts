import type { StaticRailStation } from '../../../../../rail/stations/rail-stations.types';

export const L4_STATIONS: StaticRailStation[] = [
  { code: 'LUZ', name: 'Luz' },
  { code: 'REP', name: 'República' },
  { code: 'HGN', name: 'Higienópolis-Mackenzie' },
  { code: 'PAU', name: 'Paulista' },
  { code: 'OCR', name: 'Oscar Freire' },
  { code: 'FRD', name: 'Fradique Coutinho' },
  {
    code: 'FLM',
    name: 'Faria Lima',
    alternativeNames: ['Faria Lima-Pag Bank'],
  },
  { code: 'PIH', name: 'Pinheiros' },
  { code: 'BUT', name: 'Butantã' },
  { code: 'SPM', name: 'São Paulo-Morumbi' },
  {
    code: 'VLS',
    name: 'Vila Sônia',
    alternativeNames: [
      'Vila Sônia Profa. Elisabeth Tenreiro',
      'Vila Sônia-Professora Elisabeth Tenreiro',
      'Vila Sônia-Profª Elisabeth Tenreiro',
    ],
  },
];
