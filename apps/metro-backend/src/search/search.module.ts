import { Module } from '@nestjs/common';
import { TypesenseService } from './services/typesense.service';
import { SearchService } from './services/search.service';
// import { SearchController } from './search.controller';
import { SearchResolver } from './resolvers/search.resolver';
import { NearbyResolver } from './resolvers/nearby.resolver';
import { GeographyModule } from '../geography/geography.module';
import { BikeModule } from '../bike/bike.module';
// import { BusStopResolver } from './resolvers/stop.routes.resolver';

@Module({
  imports: [GeographyModule, BikeModule],
  controllers: [],
  providers: [TypesenseService, SearchService, SearchResolver, NearbyResolver],
  exports: [TypesenseService, SearchService],
})
export class SearchModule {}
