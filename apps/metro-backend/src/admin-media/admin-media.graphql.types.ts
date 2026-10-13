import { Field, InputType, Int, ObjectType, Scalar } from '@nestjs/graphql';
import { GraphQLError } from 'graphql';
import type {
  AdminImageEntry,
  AdminImageInput,
  ImageCopyright,
  ImageCopyrightInput,
  MediaResource,
} from '@metro/shared/admin-contracts';
import type { CustomScalar } from '@nestjs/graphql';
import type { ImageUploadFile } from './admin-media.validation';

export type NativeUploadFile = ImageUploadFile;

@Scalar('File')
export class AdminImageFileScalar
  implements CustomScalar<ImageUploadFile, ImageUploadFile>
{
  description = 'A native GraphQL multipart file. JPEG, PNG, WebP, AVIF, or decoder-supported HEIC inputs up to 10 MiB are accepted; SVG and animated or multi-page images are rejected.';

  parseValue(value: unknown): ImageUploadFile {
    if (!isNativeUploadFile(value)) {
      throw new GraphQLError('file must be provided as a multipart upload');
    }
    return value;
  }

  serialize(): never {
    throw new GraphQLError('File values cannot be included in GraphQL responses');
  }

  parseLiteral(): never {
    throw new GraphQLError('File values must be provided through multipart form data');
  }
}

@ObjectType('AdminMediaResourceScope')
export class AdminMediaResourceScopeType {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  label!: string;
}

@ObjectType('AdminMediaResource')
export class AdminMediaResourceType implements MediaResource {
  @Field(() => String)
  kind!: MediaResource['kind'];

  @Field(() => String)
  identity!: string;

  @Field(() => String)
  name!: string;

  @Field(() => [AdminMediaResourceScopeType])
  scopes!: MediaResource['scopes'];
}

@ObjectType('AdminImageEntry')
export class AdminImageEntryType implements AdminImageEntry {
  @Field(() => String)
  key!: string;

  @Field(() => String)
  stationIdentity!: string;

  @Field(() => Int)
  position!: number;

  @Field(() => String, { nullable: true })
  copyrightId!: string | null;

  @Field(() => String, { nullable: true })
  label?: string;

  @Field(() => [String])
  lineIds?: readonly string[];

  @Field(() => [String])
  stopIds!: readonly string[];

  @Field(() => String, { nullable: true })
  service?: 'train';

  @Field(() => Boolean)
  isDefault!: boolean;

  @Field(() => String)
  author!: string;

  @Field(() => String)
  title!: string;

  @Field(() => String, { nullable: true })
  sourceUrl?: string | null;

  @Field(() => String)
  license!: string;

  @Field(() => String, { nullable: true })
  licenseUrl?: string;
}

@InputType('AdminImageInput')
export class AdminImageInputType implements AdminImageInput {
  @Field(() => String, { description: 'Current station, stop, or terminal identity from adminMediaResources.' })
  stationIdentity!: string;

  @Field(() => String, { description: 'Photographer or copyright holder for this specific image.' })
  author!: string;

  @Field(() => String)
  title!: string;

  @Field(() => String, { nullable: true })
  label?: string;

  @Field(() => String, {
    nullable: true,
    description: 'Optional HTTP or HTTPS page identifying the source image.',
  })
  sourceUrl?: string | null;

  @Field(() => String, { description: 'Reusable license ID from adminImageLicenses.' })
  copyrightId!: string;

  @Field(() => [String], { nullable: true, description: 'Selected line scope IDs for a station image.' })
  lineIds?: readonly string[];

  @Field(() => [String], { nullable: true, description: 'Full namespaced GTFS stop IDs for a terminal image.' })
  stopIds?: readonly string[];

  @Field(() => String, { nullable: true })
  service?: 'train';

  @Field(() => Boolean, { description: 'Select this as the resource-wide fallback image.' })
  isDefault!: boolean;
}

@ObjectType('AdminImageLicense')
export class AdminImageLicenseType implements ImageCopyright {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  license!: string;

  @Field(() => String, { nullable: true })
  licenseUrl?: string;
}

@InputType('AdminImageLicenseInput')
export class AdminImageLicenseInputType implements ImageCopyrightInput {
  @Field(() => String)
  license!: string;

  @Field(() => String, { nullable: true })
  licenseUrl?: string;
}

function isNativeUploadFile(value: unknown): value is ImageUploadFile {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate['name'] === 'string' &&
    typeof candidate['size'] === 'number' &&
    Number.isSafeInteger(candidate['size']) &&
    candidate['size'] >= 0 &&
    typeof candidate['arrayBuffer'] === 'function'
  );
}

