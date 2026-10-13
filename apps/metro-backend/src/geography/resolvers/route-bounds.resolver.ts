import { Args, Query, Resolver } from '@nestjs/graphql';
import { BoundingBox } from '../entities/geography.entity';
import { RouteBoundsService } from '../services/route-bounds.service';
import { validateIdentifier } from './geography-resolver.utils';

@Resolver()
export class RouteBoundsResolver {
  constructor(private readonly bounds: RouteBoundsService) {}

  @Query(() => BoundingBox, {
    nullable: true,
    description: 'WGS84 bounds of all route shapes for camera framing. Accepts a route ID or a stable bus direction/line favorite; returns null when geometry is unavailable.',
  })
  routeBounds(
    @Args('routeId', { type: () => String }) routeId: string,
  ): Promise<BoundingBox | null> {
    return this.bounds.getBounds(validateIdentifier(routeId, 'routeId'));
  }
}
