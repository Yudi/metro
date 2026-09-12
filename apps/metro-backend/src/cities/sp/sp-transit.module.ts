import { Module } from '@nestjs/common';
import { BikeModule } from '../../bike/bike.module';
import { BusInformationModule } from '../../bus-information/bus-information.module';
import { DataImportModule } from '../../data-import/data-import.module';
import { GeographyModule } from '../../geography/geography.module';
import { HistoricalModule } from '../../historical/historical.module';
import { NextTrainModule } from '../../next-train/next-train.module';
import { RailImportModule } from '../../rail-import/rail-import.module';
import { RailIntegrationClientModule } from '../../rail-integration/rail-integration-client.module';
import { RailModule } from '../../rail/rail.module';
import { RealtimeModule } from '../../realtime/realtime.module';
import { SearchModule } from '../../search/search.module';
import { TransitDataModule } from '../../transit-data/transit-data.module';
import { VectorTilesModule } from '../../vector-tiles/vector-tiles.module';

@Module({
  imports: [
    BikeModule,
    BusInformationModule,
    DataImportModule,
    GeographyModule,
    HistoricalModule,
    NextTrainModule,
    RailImportModule,
    RailIntegrationClientModule,
    RailModule,
    RealtimeModule,
    SearchModule,
    TransitDataModule,
    VectorTilesModule,
  ],
  exports: [
    BikeModule,
    BusInformationModule,
    DataImportModule,
    GeographyModule,
    HistoricalModule,
    NextTrainModule,
    RailImportModule,
    RailIntegrationClientModule,
    RailModule,
    RealtimeModule,
    SearchModule,
    TransitDataModule,
    VectorTilesModule,
  ],
})
export class SaoPauloTransitModule {}
