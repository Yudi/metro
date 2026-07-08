/**
 * Transit agency identifiers
 */
export enum TransitAgency {
  METRO = 'metro',
  MOTIVA = 'motiva',
  VIAQUATRO = 'viaquatro',
  VIAMOBILIDADE = 'viamobilidade',
  TICTRENS = 'tictrens',
  TRIVIATRENS = 'triviatrens',
  CPTM = 'cptm',
  SPTRANS = 'sptrans',
  EMTU = 'emtu',
}

export type AgenciesData = Record<
  TransitAgency,
  {
    name: string;
    shortName: string;
    type?: 'rail' | 'bus';
    contact: {
      phones: Array<{
        number: string;
        title: string;
        description?: string;
        whatsapp: boolean;
        sms: boolean;
      }>;
      site: string;
      additionalInformation?: string;
    };
  }
>;

export const AGENCIES_DATA: AgenciesData = {
  [TransitAgency.METRO]: {
    name: 'Companhia do Metropolitano de São Paulo',
    shortName: 'Metrô',
    type: 'rail',
    contact: {
      phones: [
        {
          number: '08007707722',
          title: 'Central de Informações',
          description: '5h às 0h',
          whatsapp: false,
          sms: false,
        },
        {
          number: '+5511973332252',
          title: 'SMS Denúncia 24h',
          description: 'Para ocorrências de segurança ou emergências',
          whatsapp: false,
          sms: true,
        },
      ],
      site: 'https://www.metro.sp.gov.br/',
      additionalInformation:
        'Para registrar ocorrências de baixa urgência, contate a Central de Informações ou use o aplicativo Metrô Conecta.',
    },
  },
  [TransitAgency.MOTIVA]: {
    name: 'Motiva',
    shortName: 'Motiva',
    type: 'rail',
    contact: {
      phones: [
        {
          number: '+5511912776323',
          title: 'Atendimento por WhatsApp',
          description: 'Seg a Sex das 6h30 às 22h\nSáb e Dom das 8h às 18h',
          whatsapp: true,
          sms: false,
        },
        {
          number: '08007707100',
          title: 'Central de Atendimento - Linha 4',
          whatsapp: false,
          sms: false,
        },
        {
          number: '08007707106',
          title: 'Central de Atendimento - Linha 5',
          whatsapp: false,
          sms: false,
        },
      ],
      site: 'https://trilhos.motiva.com.br/',
    },
  },
  [TransitAgency.VIAQUATRO]: {
    name: 'ViaQuatro',
    shortName: 'ViaQuatro',
    type: 'rail',

    contact: {
      phones: [
        {
          number: '+5511912776323',
          title: 'Atendimento por WhatsApp',
          description: 'Seg a Sex das 6h30 às 22h\nSáb e Dom das 8h às 18h',
          whatsapp: true,
          sms: false,
        },
        {
          number: '08007707100',
          title: 'Central de Atendimento',
          whatsapp: false,
          sms: false,
        },
      ],
      site: 'https://trilhos.motiva.com.br/viaquatro/',
    },
  },
  [TransitAgency.VIAMOBILIDADE]: {
    name: 'ViaMobilidade',
    shortName: 'ViaMobilidade',
    type: 'rail',
    contact: {
      phones: [
        {
          number: '+5511912776323',
          title: 'Atendimento por WhatsApp',
          description: 'Seg a Sex das 6h30 às 22h\nSáb e Dom das 8h às 18h',
          whatsapp: true,
          sms: false,
        },
        {
          number: '08007707106',
          title: 'Central de Atendimento',
          whatsapp: false,
          sms: false,
        },
      ],
      site: 'https://www.viamobilidade.com.br/',
    },
  },
  [TransitAgency.TICTRENS]: {
    name: 'TicTrens',
    shortName: 'TicTrens',
    type: 'rail',
    contact: {
      phones: [
        {
          number: '+5511919762794',
          title: 'Atendimento por WhatsApp',
          description: 'Seg a Sex das 6h30 às 22h\nSáb e Dom das 8h às 18h',
          whatsapp: true,
          sms: false,
        },
        {
          number: '08000070670',
          title: 'Central de Atendimento',
          whatsapp: false,
          sms: false,
        },
      ],
      site: 'https://tictrens.com.br/',
    },
  },
  [TransitAgency.TRIVIATRENS]: {
    name: 'Triviatrens',
    shortName: 'Triviatrens',
    type: 'rail',
    contact: {
      phones: [],
      site: '',
    },
  },
  [TransitAgency.CPTM]: {
    name: 'Companhia Paulista de Trens Metropolitanos',
    shortName: 'CPTM',
    type: 'rail',
    contact: {
      phones: [
        {
          number: '08000550121',
          whatsapp: false,
          title: 'Central de Relacionamento',
          sms: false,
        },
        {
          title: 'Atendimento por WhatsApp',
          number: '+5511997677030',
          description: '24h',
          whatsapp: true,
          sms: false,
        },
      ],
      site: 'https://www.cptm.sp.gov.br/',
    },
  },
  [TransitAgency.SPTRANS]: {
    name: 'São Paulo Transporte',
    shortName: 'SPTrans',
    type: 'bus',

    contact: {
      phones: [
        {
          number: '156',
          title: 'Prefeitura - Atendimento ao Cidadão',
          whatsapp: false,
          sms: false,
        },
      ],
      site: 'https://www.sptrans.com.br/',
    },
  },
  [TransitAgency.EMTU]: {
    name: 'Empresa Metropolitana de Transportes Urbanos de São Paulo',
    shortName: 'EMTU',
    type: 'bus',
    contact: {
      phones: [
        {
          number: '08007701234',
          title: 'Fale conosco',
          description: '7h às 19h',
          whatsapp: false,
          sms: false,
        },
      ],
      site: 'https://www.emtu.sp.gov.br/',
    },
  },
};
/**
 * Maps route short names to their operating agencies
 */
const ROUTE_AGENCY_MAP: Record<string, TransitAgency> = {
  // Metrô (metro.svg)
  L1: TransitAgency.METRO,
  L2: TransitAgency.METRO,
  L3: TransitAgency.METRO,
  L15: TransitAgency.METRO,
  L17: TransitAgency.METRO,
  '15': TransitAgency.METRO,

  // Motiva (motiva.svg)
  L4: TransitAgency.MOTIVA,
  L5: TransitAgency.MOTIVA,

  // ViaMobilidade (viamobilidade.svg)
  L8: TransitAgency.VIAMOBILIDADE,
  L9: TransitAgency.VIAMOBILIDADE,

  // TicTrens (tictrens.svg)
  L7: TransitAgency.TICTRENS,

  // CPTM (cptm.svg)
  L10: TransitAgency.CPTM,
  L11: TransitAgency.CPTM,
  L12: TransitAgency.CPTM,
  L13: TransitAgency.CPTM,
};

/**
 * Normalizes route name by extracting just the line identifier
 * E.g., "CPTM L11" -> "L11", "Metrô L1" -> "L1", "L09" -> "L9", "L4" -> "L4"
 * Special case: "METRÔ 15" -> "L15" (dataset error)
 */
function normalizeRouteName(routeName: string): string {
  // Special case: Handle "METRÔ 15" (dataset error - should be "METRÔ L15")
  if (routeName.match(/METRÔ\s+15/i)) {
    return 'L15';
  }

  // Extract line number (e.g., "L11", "L4", etc.) from strings like "CPTM L11" or "Metrô L1"
  const match = routeName.match(/L(\d+)/i);
  if (match) {
    // Strip leading zeroes from the number part
    const lineNumber = parseInt(match[1], 10);
    return `L${lineNumber}`;
  }
  // If no match, return the original (already normalized)
  return routeName.trim();
}

/**
 * Gets the transit agency for a given route
 * @param routeShortName - The route short name (e.g., "L1", "L4", "CPTM L11", "Metrô L9")
 * @returns The transit agency identifier, or undefined if not found
 */
export function getRouteAgency(
  routeShortName: string,
): TransitAgency | undefined {
  const normalized = normalizeRouteName(routeShortName);
  return ROUTE_AGENCY_MAP[normalized];
}

/**
 * Gets unique agencies from a list of route short names
 * @param routeShortNames - Array of route short names
 * @returns Array of unique agency identifiers, sorted for consistency
 */
export function getUniqueAgencies(routeShortNames: string[]): TransitAgency[] {
  const agencies = new Set<TransitAgency>();

  for (const routeName of routeShortNames) {
    const agency = getRouteAgency(routeName);
    if (agency) {
      agencies.add(agency);
    }
  }

  return Array.from(agencies).sort();
}

/**
 * Gets the icon path for a transit agency
 * @param agency - The transit agency identifier
 * @returns The relative path to the agency icon
 */
export function getAgencyIconPath(agency: TransitAgency): string {
  return `/app/shared/agencies/${agency}.svg`;
}

/**
 * Gets the fallback icon path when no agency is specified
 * @returns The relative path to the fallback icon
 */
export function getFallbackIconPath(): string {
  return '/app/icons/favicon.png';
}
