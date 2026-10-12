import { Module } from '@nestjs/common';
import { TypesenseService } from './services/typesense.service';
import { SearchService } from './services/search.service';
import { SearchResolver } from './resolvers/search.resolver';
import { NearbyResolver } from './resolvers/nearby.resolver';
import { GeographyModule } from '../geography/geography.module';
import { BikeModule } from '../bike/bike.module';
import { BusTerminalsModule } from '../bus-terminals/bus-terminals.module';

@Module({
  imports: [GeographyModule, BikeModule, BusTerminalsModule],
  controllers: [],
  providers: [TypesenseService, SearchService, SearchResolver, NearbyResolver],
  exports: [TypesenseService, SearchService],
})
export class SearchModule {}
