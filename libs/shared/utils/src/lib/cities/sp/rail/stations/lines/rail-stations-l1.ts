import type { StaticRailStation } from '../../../../../rail/stations/rail-stations.types';

export const L1_STATIONS: StaticRailStation[] = [
  { code: 'TUC', name: 'Tucuruvi' },
  { code: 'PIG', name: 'Parada Inglesa' },
  {
    code: 'JPA',
    name: 'Jardim São Paulo',
    alternativeNames: [
      'Ayrton Senna-Jardim São Paulo',
      'Jardim São Paulo-Ayrton Senna',
      'Jd. São Paulo',
      'Jd. São Paulo-Ayrton Senna',
    ],
  },
  { code: 'SAN', name: 'Santana' },
  {
    code: 'CDU',
    name: 'Carandiru',
    quirks: 'Não é possível alterar o sentido sem pagar uma nova tarifa.',
  },
  {
    code: 'TTE',
    name: 'Portuguesa-Tietê',
    alternativeNames: ['Tietê'],
    quirks: 'Não é possível alterar o sentido sem pagar uma nova tarifa.',
  },
  { code: 'PPQ', name: 'Armênia' },
  { code: 'TRD', name: 'Tiradentes' },
  { code: 'LUZ', name: 'Luz', alternativeNames: ['Luz (Linha 1)'] },
  { code: 'BTO', name: 'São Bento' },
  { code: 'PSE', name: 'Sé', alternativeNames: ['Sé (Linha 1)'] },
  { code: 'LIB', name: 'Japão-Liberdade', alternativeNames: ['Liberdade'] },
  { code: 'JQM', name: 'São Joaquim' },
  { code: 'VGO', name: 'Vergueiro', alternativeNames: ['Vergueiro-Sebrae'] },
  { code: 'PSO', name: 'Paraíso', alternativeNames: ['Paraíso (Linha 1)'] },
  {
    code: 'ANR',
    name: 'Ana Rosa',
    alternativeNames: ['Ana Rosa (Linha 1)'],
  },
  { code: 'VMN', name: 'Vila Mariana' },
  { code: 'SCZ', name: 'Santa Cruz' },
  { code: 'ARV', name: 'Praça da Árvore' },
  { code: 'SAU', name: 'Saúde', alternativeNames: ['Saúde-Ultrafarma'] },
  { code: 'JUD', name: 'São Judas' },
  { code: 'CON', name: 'Conceição' },
  {
    code: 'JAB',
    name: 'Jabaquara',
    alternativeNames: ['Jabaquara-Comitê Paralímpico Brasileiro'],
  },
];
