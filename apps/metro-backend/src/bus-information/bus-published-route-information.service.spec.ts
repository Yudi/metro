import { BusRoute } from '../geography/entities/geography.entity';
import { BusPublishedRouteInformationClient } from './bus-published-route-information.client';
import { BusPublishedRouteInformationService } from './bus-published-route-information.service';

const route = (sourceAgency: 'sptrans' | 'artesp'): BusRoute => ({
  id: sourceAgency === 'artesp' ? 'artesp:001' : '477A-10',
  routeId: sourceAgency === 'artesp' ? 'artesp:001' : '477A-10',
  sourceAgency,
  sourceId: sourceAgency === 'artesp' ? '001' : '477A-10',
  shortName: sourceAgency === 'artesp' ? '001' : '477A-10',
  longName: 'Origem - Destino',
  routeType: 3,
  color: 'FFFFFF',
  textColor: '000000',
  supportsRealtime: sourceAgency === 'sptrans',
  fares: [],
});

const supplement = {
  status: 'AVAILABLE' as const,
  routeCode: '477A-10',
  lastUpdated: '2026-09-07T12:00:00.000Z',
  operatorName: 'Agência publicada',
  consortiumName: 'Consórcio publicado',
  days: [],
};

describe('BusPublishedRouteInformationService', () => {
  it('resolves the catalog route before calling the supplement', async () => {
    const getBusRoute = jest.fn().mockResolvedValue(route('sptrans'));
    const fetch = jest.fn().mockResolvedValue(supplement);
    const service = new BusPublishedRouteInformationService(
      { getBusRoute } as never,
      { fetch } as unknown as BusPublishedRouteInformationClient,
    );

    await expect(service.getInformation('477A-10')).resolves.toMatchObject({
      status: 'AVAILABLE',
      route: route('sptrans'),
      routeCode: '477A-10',
      operatorName: 'Agência publicada',
      consortiumName: 'Consórcio publicado',
    });
    expect(getBusRoute).toHaveBeenCalledWith('477A-10');
    expect(fetch).toHaveBeenCalledWith('477A-10');
  });

  it('accepts a valid SPTrans route code with a one-digit suffix', async () => {
    const oneDigitRoute = {
      ...route('sptrans'),
      routeId: '123A-1',
      sourceId: '123A-1',
      shortName: '123A-1',
    };
    const getBusRoute = jest.fn().mockResolvedValue(oneDigitRoute);
    const fetch = jest.fn().mockResolvedValue({
      ...supplement,
      routeCode: '123A-1',
    });
    const service = new BusPublishedRouteInformationService(
      { getBusRoute } as never,
      { fetch } as unknown as BusPublishedRouteInformationClient,
    );

    await expect(service.getInformation('123A-1')).resolves.toMatchObject({
      status: 'AVAILABLE',
      routeCode: '123A-1',
      route: oneDigitRoute,
    });
    expect(fetch).toHaveBeenCalledWith('123A-1');
  });

  it('does not call the supplement for ARTESP or unknown routes', async () => {
    const getBusRoute = jest
      .fn()
      .mockResolvedValueOnce(route('artesp'))
      .mockResolvedValueOnce(null);
    const fetch = jest.fn();
    const service = new BusPublishedRouteInformationService(
      { getBusRoute } as never,
      { fetch } as unknown as BusPublishedRouteInformationClient,
    );

    await expect(service.getInformation('artesp:001')).resolves.toMatchObject({
      status: 'UNAVAILABLE',
      route: route('artesp'),
      days: [],
    });
    await expect(service.getInformation('unknown')).resolves.toMatchObject({
      status: 'NOT_FOUND',
      route: null,
      routeCode: 'unknown',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps GTFS metadata available when the supplement fails', async () => {
    const sptransRoute = route('sptrans');
    const service = new BusPublishedRouteInformationService(
      { getBusRoute: jest.fn().mockResolvedValue(sptransRoute) } as never,
      {
        fetch: jest.fn().mockRejectedValue(new Error('unavailable')),
      } as unknown as BusPublishedRouteInformationClient,
    );

    await expect(service.getInformation('477A-10')).resolves.toMatchObject({
      status: 'UNAVAILABLE',
      route: sptransRoute,
      routeCode: '477A-10',
      days: [],
    });
  });
});
