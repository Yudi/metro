import { Module } from '@nestjs/common';
import { TypesenseService } from './services/typesense.service';
import { SearchService } from './services/search.service';
import { SearchResolver } from './resolvers/search.resolver';
import { NearbyResolver } from './resolvers/nearby.resolver';
import { GeographyModule } from '../geography/geography.module';
import { BikeModule } from '../bike/bike.module';

@Module({
  imports: [GeographyModule, BikeModule],
  controllers: [],
  providers: [TypesenseService, SearchService, SearchResolver, NearbyResolver],
  exports: [TypesenseService, SearchService],
})
export class SearchModule {}
