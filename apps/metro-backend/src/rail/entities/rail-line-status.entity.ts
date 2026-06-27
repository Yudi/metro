import { ObjectType, Field, Int } from '@nestjs/graphql';
import type { RailStatusCode, RailStatusColor } from '@metro/shared/utils';

export interface StaticRailLine {
  code: number;
  colorName: string;
  colorHex: string;
  fullName: string;
  stations?: {
    code: string;
    name: string;
    alternativeNames?: string[];
  }[];
}

@ObjectType({ description: 'Individual rail line status' })
export class RailLine {
  @Field(() => Int, { description: 'Line code number (e.g., 1 for L1)' })
  code!: number;

  @Field({ description: 'Line color name in Portuguese (e.g., Azul)' })
  colorName!: string;

  @Field({ description: 'Line color in hex format (e.g., #00529F)' })
  colorHex!: string;

  @Field({ description: 'Line identifier (e.g., L1-Azul)' })
  line!: string;

  @Field(() => String, {
    description:
      'Current operation status code (AtividadeProgramada, OperacaoNormal, OperacaoEspecial, OperacaoEncerrada, VelocidadeReduzida, OperacaoParcial, OperacaoComImpactoPontual, Paralisada, DadosIndisponiveis)',
  })
  statusCode!: RailStatusCode;

  @Field(() => String, { description: 'Human-readable status label' })
  statusLabel!: string;

  @Field(() => String, {
    description: 'Status indicator color (verde, amarelo, vermelho, cinza)',
  })
  statusColor!: RailStatusColor;

  @Field({ nullable: true, description: 'Description of any issues or alerts' })
  description?: string;

  @Field({
    nullable: true,
    description: 'Incident category reported by the source, when available',
  })
  incidentCategory?: string;

  @Field({ nullable: true, description: 'Additional details for the status' })
  detail?: string;
}

@ObjectType({ description: 'Rail lines status response' })
export class RailLinesStatus {
  @Field(() => [RailLine], { description: 'List of rail line statuses' })
  lines!: RailLine[];

  @Field({
    description: 'Timestamp when the data was last fetched from source',
  })
  lastUpdated!: Date;

  @Field({ description: 'Whether the data fetch was successful' })
  success!: boolean;

  @Field({ nullable: true, description: 'Error message if fetch failed' })
  errorMessage?: string;
}
