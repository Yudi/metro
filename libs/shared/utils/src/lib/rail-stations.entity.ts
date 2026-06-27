export const L1_STATIONS: StaticRailStation[] = [
  { code: 'TUC', name: 'Tucuruvi' },
  { code: 'PIG', name: 'Parada Inglesa' },
  {
    code: 'JPA',
    name: 'Jardim São Paulo',
    alternativeNames: [
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

export const L3_STATIONS: StaticRailStation[] = [
  {
    code: 'BFU',
    name: 'Palmeiras-Barra Funda',
    alternativeNames: ['Barra Funda', 'Palmeiras-Barra Funda (Linha 3)'],
  },
  {
    code: 'DEO',
    name: 'Marechal Deodoro',
    alternativeNames: ['Mal. Deodoro'],
  },
  { code: 'CEC', name: 'Santa Cecília' },
  { code: 'REP', name: 'República' },
  { code: 'GBU', name: 'Anhangabaú' },
  { code: 'PSE', name: 'Sé', alternativeNames: ['Sé (Linha 3)'] },
  { code: 'PDS', name: 'Pedro II', alternativeNames: ['Pedro 2º'] },
  {
    code: 'BAS',
    name: 'Brás',
  },
  {
    code: 'BRE',
    name: 'Bresser-Mooca',
    alternativeNames: ['Bresser-Mooca (linha 3)'],
  },
  {
    code: 'BEL',
    name: 'Belém',
  },
  {
    code: 'TAT',
    name: 'Tatuapé',
    alternativeNames: ['Tatuapé (Linha 3)'],
  },
  {
    code: 'CAR',
    name: 'Carrão',
    alternativeNames: ['Carrão-Assaí Atacadista'],
  },
  {
    code: 'PEN',
    name: 'Penha',
    alternativeNames: ['Penha-Lojas Besni'],
  },
  {
    code: 'VTD',
    name: 'Vila Matilde',
  },
  {
    code: 'VPA',
    name: 'Guilhermina-Esperança',
    alternativeNames: ['Vila Esperança', 'Guilhermina-Vila Esperança'],
  },
  {
    code: 'PCA',
    name: 'Patriarca-Vila Ré',
    alternativeNames: ['Patriarca'],
  },
  {
    code: 'ART',
    name: 'Artur Alvim',
  },
  {
    code: 'ITQ',
    name: 'Corinthians-Itaquera',
    alternativeNames: ['Itaquera', 'Corinthians-Itaquera (Linha 3)'],
  },
];

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
      'Vila Sônia-Professora Elisabeth Tenreiro',
      'Vila Sônia-Profª Elisabeth Tenreiro',
    ],
  },
];

export const L5_STATIONS: StaticRailStation[] = [
  { code: 'CKB', name: 'Chácara Klabin' },
  { code: 'SCZ', name: 'Santa Cruz' },
  { code: 'HSP', name: 'Hospital São Paulo' },
  { code: 'SER', name: 'AACD-Servidor' },
  { code: 'MOE', name: 'Moema' },
  { code: 'ECT', name: 'Eucaliptos' },
  { code: 'CPB', name: 'Campo Belo' },
  { code: 'BRK', name: 'Brooklin' },
  { code: 'BGA', name: 'Borba Gato' },
  { code: 'ABV', name: 'Alto da Boa Vista' },
  {
    code: 'APN',
    name: 'Adolfo Pinheiro',
    alternativeNames: ['Adolfo Pinheiro-Unisa'],
  },
  {
    code: 'LTR',
    name: 'Largo Treze',
  },
  {
    code: 'STA',
    name: 'Santo Amaro',
    alternativeNames: ['Santo Amaro (Linha 5)'],
  },
  {
    code: 'GGR',
    name: 'Giovanni Gronchi',
  },
  {
    code: 'VBE',
    name: 'Vila das Belezas',
  },
  {
    code: 'CPL',
    name: 'Campo Limpo',
  },
  {
    code: 'CPR',
    name: 'Capão Redondo',
  },
];

export const L7_STATIONS: StaticRailStation[] = [
  {
    code: 'BFU',
    name: 'Palmeiras-Barra Funda',
    alternativeNames: ['Barra Funda', 'Palmeiras-Barra Funda (Linha 7)'],
  },
  {
    code: 'ABR',
    name: 'Água Branca',
  },
  {
    code: 'LPA',
    name: 'Lapa',
    alternativeNames: ['Lapa (Linha 7)', 'Lapa de Cima'],
  },
  {
    code: 'PQR',
    name: 'Piqueri',
  },
  {
    code: 'PRT',
    name: 'Pirituba',
  },
  {
    code: 'VCL',
    name: 'Vila Clarice',
  },
  {
    code: 'JRG',
    name: 'Jaraguá',
  },
  {
    code: 'VAU',
    name: 'Vila Aurora',
  },
  {
    code: 'PRU',
    name: 'Perus',
  },
  {
    code: 'CAI',
    name: 'Caieiras',
  },
  {
    code: 'FDR',
    name: 'Franco da Rocha',
  },
  {
    code: 'BFI',
    name: 'Baltazar Fidélis',
  },
  {
    code: 'FMO',
    name: 'Francisco Morato',
  },
  {
    code: 'BTJ',
    name: 'Botujuru',
  },
  {
    code: 'CLP',
    name: 'Campo Limpo Paulista',
  },
  {
    code: 'VPL',
    name: 'Várzea Paulista',
  },
  {
    code: 'JUN',
    name: 'Jundiaí',
  },
];

export const L8_STATIONS: StaticRailStation[] = [
  {
    code: 'JPR',
    name: 'Júlio Prestes',
  },
  {
    code: 'BFU',
    name: 'Palmeiras–Barra Funda',
  },
  {
    code: 'LAB',
    name: 'Lapa',
    alternativeNames: ['Lapa (Linha 8)', 'Lapa de Baixo', 'Lapa-Senac'],
  },
  {
    code: 'DMO',
    name: 'Domingos de Moraes',
  },
  {
    code: 'ILE',
    name: 'Imperatriz Leopoldina',
  },
  {
    code: 'PAL',
    name: 'Presidente Altino',
  },
  {
    code: 'OSA',
    name: 'Osasco',
  },
  {
    code: 'CSA',
    name: 'Comandante Sampaio',
  },
  {
    code: 'QTU',
    name: 'Quitaúna',
  },
  {
    code: 'GMC',
    name: 'General Miguel Costa',
  },
  {
    code: 'CPB',
    name: 'Carapicuíba',
  },
  {
    code: 'STE',
    name: 'Santa Terezinha',
  },
  {
    code: 'AJO',
    name: 'Antônio João',
  },
  {
    code: 'BRU',
    name: 'Barueri',
  },
  {
    code: 'JBE',
    name: 'Jardim Belval',
    alternativeNames: ['Jd. Belval'],
  },
  {
    code: 'JSI',
    name: 'Jardim Silveira',
    alternativeNames: [
      'Jd Silveira',
      'Jardim Silveira-Leo Madeiras',
      'Jd. Silveira-Leo Madeiras',
    ],
  },
  {
    code: 'JDI',
    name: 'Jandira',
  },
  {
    code: 'SCO',
    name: 'Sagrado Coração',
  },
  {
    code: 'ECD',
    name: 'Engenheiro Cardoso',
    alternativeNames: ['Engº Cardoso', 'Engº. Cardoso'],
  },
  {
    code: 'IPV',
    name: 'Itapevi',
  },
  {
    code: 'SRT',
    name: 'Santa Rita',
  },
  {
    code: 'AMB',
    name: 'Ambuitá',
  },

  {
    code: 'ABU',
    name: 'Amador Bueno',
  },
];

export const L9_STATIONS: StaticRailStation[] = [
  {
    code: 'OSA',
    name: 'Osasco',
  },
  {
    code: 'PAL',
    name: 'Presidente Altino',
  },
  {
    code: 'CEA',
    name: 'Ceasa',
  },
  {
    code: 'JAG',
    name: 'Villa Lobos-Jaguaré',
    alternativeNames: ['Villa Lobos'],
  },
  {
    code: 'USP',
    name: 'Cidade Universitária',
  },
  {
    code: 'PIN',
    name: 'Pinheiros',
  },
  {
    code: 'HBR',
    name: 'Hebraica-Rebouças',
  },
  {
    code: 'CJD',
    name: 'Cidade Jardim',
  },
  {
    code: 'VOL',
    name: 'Vila Olímpia',
  },
  {
    code: 'BRR',
    name: 'Berrini',
    alternativeNames: ['Berrini-Casas Bahia'],
  },
  {
    code: 'MRB',
    name: 'Morumbi',
    alternativeNames: ['Morumbi-Claro'],
  },
  {
    code: 'GJT',
    name: 'Granja Julieta',
  },
  {
    code: 'JOD',
    name: 'João Dias',
  },
  {
    code: 'SAM',
    name: 'Santo Amaro',
  },
  {
    code: 'SOC',
    name: 'Socorro',
  },
  {
    code: 'JUR',
    name: 'Jurubatuba',
    alternativeNames: ['Jurubatuba-Senac'],
  },
  {
    code: 'AUT',
    name: 'Autódromo',
  },
  {
    code: 'INT',
    name: 'Primavera-Interlagos',
    alternativeNames: ['Interlagos'],
  },
  {
    code: 'GRA',
    name: 'Grajaú',
  },
  {
    code: 'MVN',
    name: 'Bruno Covas/Mendes-Vila Natal',
    alternativeNames: ['Mendes-Vila Natal', 'Bruno Covas - Mendes-Vila Natal'],
  },
  {
    code: 'VAG',
    name: 'Varginha',
  },
];

export const L10_STATIONS: StaticRailStation[] = [
  {
    code: 'BFU',
    name: 'Palmeiras–Barra Funda',
    alternativeNames: ['Barra Funda', 'Palmeiras-Barra Funda (Linha 10)'],
  },
  {
    code: 'LUZ',
    name: 'Luz',
    alternativeNames: ['Luz (Linha 10)'],
  },
  {
    code: 'BAS',
    name: 'Brás',
    alternativeNames: ['Brás (Linha 10)'],
  },
  {
    code: 'MOC',
    name: 'Juventus-Mooca',
    alternativeNames: [
      'Mooca (linha 10)',
      'Mooca',
      'Juventus-Mooca (Linha 10)',
    ],
  },
  {
    code: 'IPG',
    name: 'Ipiranga',
    alternativeNames: ['Ipiranga (Linha 10)'],
  },
  {
    code: 'TMD',
    name: 'Tamanduateí',
    alternativeNames: ['Tamanduateí (Linha 10)'],
  },
  {
    code: 'SCT',
    name: 'São Caetano do Sul',
    alternativeNames: [
      'São Caetano do Sul-Prefeito Walter Braido',
      'São Caetano do Sul-Pref. Walter Braido',
    ],
  },
  {
    code: 'UTG',
    name: 'Utinga',
  },
  {
    code: 'PSA',
    name: 'Prefeito Saladino',
    alternativeNames: ['Pref. Saladino'],
  },
  {
    code: 'SAN',
    name: 'Prefeito Celso Daniel-Santo André',
    alternativeNames: ['Pref. Celso Daniel-Santo André', 'Santo André'],
  },
  {
    code: 'CPV',
    name: 'Capuava',
  },
  {
    code: 'MAU',
    name: 'Mauá',
  },
  {
    code: 'GPT',
    name: 'Guapituba',
  },
  {
    code: 'RPI',
    name: 'Ribeirão Pires',
    alternativeNames: ['Ribeirão Pires-Antônio Bespalec'],
  },
  {
    code: 'RGS',
    name: 'Rio Grande da Serra',
  },
];

export const L11_STATIONS: StaticRailStation[] = [
  {
    code: 'BFU',
    name: 'Palmeiras-Barra Funda',
    alternativeNames: ['Barra Funda', 'Palmeiras-Barra Funda (Linha 11)'],
  },
  {
    code: 'LUZ',
    name: 'Luz',
    alternativeNames: ['Luz (Linha 11)'],
  },
  {
    code: 'BAS',
    name: 'Brás',
    alternativeNames: ['Brás (Linha 11)'],
  },
  {
    code: 'TAT',
    name: 'Tatuapé',
    alternativeNames: ['Tatuapé (Linha 11)'],
  },
  {
    code: 'ITQ',
    name: 'Corinthians-Itaquera',
    alternativeNames: ['Itaquera', 'Corinthians-Itaquera (Linha 11)'],
  },
  {
    code: 'DOB',
    name: 'Dom Bosco',
  },
  {
    code: 'JBO',
    name: 'José Bonifácio',
  },
  {
    code: 'GUA',
    name: 'Guaianases',
    alternativeNames: ['Guaianazes'],
  },
  {
    code: 'AGN',
    name: 'Antonio Gianetti Neto',
  },
  {
    code: 'FVC',
    name: 'Ferraz de Vasconcelos',
  },
  {
    code: 'POA',
    name: 'Poá',
  },
  {
    code: 'CAL',
    name: 'Calmon Viana',
    alternativeNames: ['Calmon Viana (Linha 11)'],
  },
  {
    code: 'SUZ',
    name: 'Suzano',
  },
  {
    code: 'JPB',
    name: 'Jundiapeba',
  },
  {
    code: 'BCB',
    name: 'Braz Cubas',
  },
  {
    code: 'MDC',
    name: 'Mogi das Cruzes',
  },
  {
    code: 'EST',
    name: 'Estudantes',
  },
];

export const L12_STATIONS: StaticRailStation[] = [
  {
    code: 'BAS',
    name: 'Brás',
    alternativeNames: ['Brás (Linha 12)'],
  },
  {
    code: 'TAT',
    name: 'Tatuapé',
    alternativeNames: ['Tatuapé (Linha 12)'],
  },
  {
    code: 'EGO',
    name: 'Engenheiro Goulart',
    alternativeNames: [
      'Engº Goulart',
      'Engº. Goulart',
      'Engenheiro Goulart (Linha 12)',
      'Engº Goulart (Linha 12)',
    ],
  },
  {
    code: 'USL',
    name: 'USP Leste',
  },
  {
    code: 'ERM',
    name: 'Comendador Ermelino',
    alternativeNames: [
      'Comend. Ermelino',
      'Comendador Ermelino Matarazzo',
      'Ermelino Matarazzo',
    ],
  },
  {
    code: 'SMP',
    name: 'São Miguel Paulista',
  },
  {
    code: 'JHE',
    name: 'Jardim Helena-Vila Mara',
    alternativeNames: ['Jd. Helena-Vila Mara'],
  },
  {
    code: 'ITI',
    name: 'Itaim Paulista',
  },
  {
    code: 'JRO',
    name: 'Jardim Romano',
    alternativeNames: ['Jd. Romano'],
  },
  {
    code: 'EMF',
    name: 'Engenheiro Manoel Feio',
    alternativeNames: ['Engº Manoel Feio', 'Engº. Manoel Feio', 'Manoel Feio'],
  },
  {
    code: 'IQC',
    name: 'Itaquaquecetuba',
  },
  {
    code: 'ARC',
    name: 'Aracaré',
  },
  {
    code: 'CMV',
    name: 'Calmon Viana',
    alternativeNames: ['Calmon Viana (Linha 12)'],
  },
];

export const L13_STATIONS: StaticRailStation[] = [
  {
    code: 'EGO',
    name: 'Engenheiro Goulart',
    alternativeNames: [
      'Engº Goulart',
      'Engº. Goulart',
      'Engenheiro Goulart (Linha 13)',
      'Engº Goulart (Linha 13)',
    ],
  },
  {
    code: 'GCE',
    name: 'Guarulhos-Cecap',
  },
  {
    code: 'AGU',
    name: 'Aeroporto-Guarulhos',
  },
];

export const L15_STATIONS: StaticRailStation[] = [
  {
    code: 'VPT',
    name: 'Vila Prudente',
    alternativeNames: ['Vila Prudente (Linha 15)'],
  },
  {
    code: 'ORT',
    name: 'Oratório',
  },
  {
    code: 'SLU',
    name: 'São Lucas',
  },
  {
    code: 'CAD',
    name: 'Camilo Haddad',
  },
  {
    code: 'VLT',
    name: 'Vila Tolstói',
  },
  {
    code: 'VUN',
    name: 'Vila União',
  },
  {
    code: 'JPL',
    name: 'Jardim Planalto',
  },
  { code: 'SAP', name: 'Sapopemba' },
  {
    code: 'FJT',
    name: 'Fazenda da Juta',
  },
  {
    code: 'MAT',
    name: 'São Mateus',
  },
  {
    code: 'IGT',
    name: 'Jardim Colonial',
    alternativeNames: ['Jd. Colonial'],
  },
];

export const L17_STATIONS: StaticRailStation[] = [
  {
    code: 'JDA',
    name: 'Washington Luís',
  },
  {
    code: 'CGN',
    name: 'Aeroporto de Congonhas',
  },
  {
    code: 'BPA',
    name: 'Brooklin Paulista',
  },
  {
    code: 'VJD',
    name: 'Vereador José Diniz',
  },
  {
    code: 'CBM',
    name: 'Campo Belo',
  },
  {
    code: 'VCD',
    name: 'Vila Cordeiro',
  },
  {
    code: 'CZD',
    name: 'Chucri Zaidan',
  },
  {
    code: 'MOB',
    name: 'Morumbi',
  },
];

export interface StaticRailStation {
  code: string;
  name: string;
  alternativeNames?: string[];
  quirks?: string;
}

const STATIC_RAIL_STATIONS_BY_LINE: Readonly<
  Record<string, readonly StaticRailStation[]>
> = {
  L1: L1_STATIONS,
  L2: L2_STATIONS,
  L3: L3_STATIONS,
  L4: L4_STATIONS,
  L5: L5_STATIONS,
  L7: L7_STATIONS,
  L8: L8_STATIONS,
  L9: L9_STATIONS,
  L10: L10_STATIONS,
  L11: L11_STATIONS,
  L12: L12_STATIONS,
  L13: L13_STATIONS,
  L15: L15_STATIONS,
  L17: L17_STATIONS,
};

export function getStaticRailStationsByLine(
  lineCode: string,
): readonly StaticRailStation[] | undefined {
  return STATIC_RAIL_STATIONS_BY_LINE[lineCode];
}
