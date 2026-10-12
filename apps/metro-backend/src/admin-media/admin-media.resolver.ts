import { UseGuards } from '@nestjs/common';
import {
  Args,
  Mutation,
  Query,
  Resolver,
} from '@nestjs/graphql';
import type {
  AdminImageInput,
  ImageCopyrightInput,
} from '@metro/shared/admin-contracts';
import { AdminGuard } from '../admin-auth/admin.guard';
import { AdminMediaService } from './admin-media.service';
import {
  AdminImageEntryType,
  AdminImageFileScalar,
  AdminImageInputType,
  AdminImageLicenseInputType,
  AdminImageLicenseType,
  AdminMediaResourceType,
  type NativeUploadFile,
} from './admin-media.graphql.types';

@Resolver()
@UseGuards(AdminGuard)
export class AdminMediaResolver {
  constructor(private readonly adminMedia: AdminMediaService) {}

  @Query(() => [AdminMediaResourceType], {
    name: 'adminMediaResources',
    description: 'Search the current station, GTFS stop, and bus-terminal catalogs.',
  })
  adminMediaResources(@Args('query', { type: () => String }) query: string) {
    return this.adminMedia.searchResources(query);
  }

  @Query(() => [AdminImageEntryType], {
    name: 'adminImages',
    description: 'List images assigned to a current station, stop, or terminal identity.',
  })
  adminImages(@Args('identity', { type: () => String }) identity: string) {
    return this.adminMedia.listImages(identity);
  }

  @Query(() => [AdminImageLicenseType], {
    name: 'adminImageLicenses',
    description: 'List reusable image license terms.',
  })
  adminImageLicenses() {
    return this.adminMedia.listCopyrights();
  }

  @Mutation(() => AdminImageEntryType, {
    name: 'uploadAdminImage',
    description: 'Convert one supported still image to sRGB AVIF, resize within 2048×2048 without enlargement, and assign it to a current catalog resource. Source metadata is stripped.',
  })
  async uploadAdminImage(
    @Args('file', { type: () => AdminImageFileScalar }) file: NativeUploadFile,
    @Args('metadata', { type: () => AdminImageInputType }) metadata: AdminImageInput,
  ) {
    return this.adminMedia.uploadImage(file, metadata);
  }

  @Mutation(() => AdminImageEntryType, {
    name: 'updateAdminImage',
    description: 'Update attribution and scopes while preserving the image object and position.',
  })
  updateAdminImage(
    @Args('key', { type: () => String }) key: string,
    @Args('metadata', { type: () => AdminImageInputType }) metadata: AdminImageInput,
  ) {
    return this.adminMedia.updateImage(key, metadata);
  }

  @Mutation(() => Boolean, {
    name: 'deleteAdminImage',
    description: 'Remove an image and compact positions for the resource.',
  })
  async deleteAdminImage(@Args('key', { type: () => String }) key: string): Promise<boolean> {
    await this.adminMedia.deleteImage(key);
    return true;
  }

  @Mutation(() => AdminImageLicenseType, {
    name: 'createAdminImageLicense',
    description: 'Create or reuse a license entry for image attribution.',
  })
  createAdminImageLicense(
    @Args('input', { type: () => AdminImageLicenseInputType }) input: ImageCopyrightInput,
  ) {
    return this.adminMedia.createCopyright(input);
  }

  @Mutation(() => AdminImageLicenseType, {
    name: 'updateAdminImageLicense',
    description: 'Update a shared license; referenced images use the new terms in public manifests.',
  })
  updateAdminImageLicense(
    @Args('id', { type: () => String }) id: string,
    @Args('input', { type: () => AdminImageLicenseInputType }) input: ImageCopyrightInput,
  ) {
    return this.adminMedia.updateCopyright(id, input);
  }

  @Mutation(() => Boolean, {
    name: 'deleteAdminImageLicense',
    description: 'Delete a license that is not referenced by images.',
  })
  async deleteAdminImageLicense(@Args('id', { type: () => String }) id: string): Promise<boolean> {
    await this.adminMedia.deleteCopyright(id);
    return true;
  }
}
