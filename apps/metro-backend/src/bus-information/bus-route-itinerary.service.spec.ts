import { PrismaService } from '../prisma/prisma.service';
import {
  BusRouteItineraryService,
  validateItineraryRouteId,
  validateItineraryServiceDate,
} from './bus-route-itinerary.service';

const route = {
  id: '477A-10',
  route_id: '477A-10',
  agency_id: 'sptrans-agency',
  route_short_name: '477A-10',
  route_long_name: 'Vila Formosa - Praça da Sé',
  route_type: 3,
  route_color: 'FFFFFF',
  route_text_color: '000000',
  source_agency: 'sptrans',
  source_id: '477A-10',
  fares: [],
  operator_id: 'sptrans-agency',
  operator_name: 'São Paulo Transporte',
  operator_url: 'https://www.sptrans.com.br',
  operator_phone: '156',
};

describe('bus route itinerary service', () => {
  it('rejects malformed route IDs and service dates before querying', () => {
    expect(() => validateItineraryRouteId('')).toThrow();
    expect(() => validateItineraryRouteId('route\n')).toThrow();
    expect(() => validateItineraryServiceDate('2026-02-30')).toThrow();
    expect(validateItineraryServiceDate(' 2026-09-07 ')).toBe('2026-09-07');
  });

  it('groups ordered variants, keeps exact origin departures, and preserves frequency templates', async () => {
    const prisma = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([route])
        .mockResolvedValueOnce([
          {
            tripId: 'trip-exact',
            serviceId: 'weekday',
            headsign: 'Praça da Sé',
            directionId: 0,
            shapeId: 'shape-a',
            stopIds: ['stop-a', 'stop-b'],
            stopSequences: [1, 2],
            firstDeparture: '06:10:00',
            lastArrival: '06:40:00',
          },
          {
            tripId: 'trip-frequency',
            serviceId: 'weekday',
            headsign: 'Praça da Sé',
            directionId: 0,
            shapeId: 'shape-a',
            stopIds: ['stop-a', 'stop-b'],
            stopSequences: [1, 2],
            firstDeparture: '06:20:00',
            lastArrival: '06:50:00',
          },
        ])
        .mockResolvedValueOnce([
          {
            tripId: 'trip-exact',
            id: 'stop-a',
            name: 'Terminal',
            description: null,
            platformCode: null,
            sequence: 1,
            latitude: -23.5,
            longitude: -46.6,
            arrivalTime: '06:09:00',
            departureTime: '06:10:00',
          },
          {
            tripId: 'trip-exact',
            id: 'stop-b',
            name: 'Praça da Sé',
            description: null,
            platformCode: null,
            sequence: 2,
            latitude: -23.55,
            longitude: -46.63,
            arrivalTime: '06:40:00',
            departureTime: '06:40:00',
          },
        ])
        .mockResolvedValueOnce([
          {
            tripId: 'trip-frequency',
            startTime: '06:00:00',
            endTime: '09:00:00',
            headwaySeconds: 600,
          },
        ]),
    };
    const service = new BusRouteItineraryService(
      prisma as unknown as PrismaService,
    );

    const result = await service.getItinerary('477A-10', '2026-09-07');

    expect(result.status).toBe('AVAILABLE');
    expect(result.operatorName).toBe('São Paulo Transporte');
    expect(result.route?.shortName).toBe('477A-10');
    expect(result.patterns).toHaveLength(1);
    expect(result.patterns[0]).toMatchObject({
      directionId: 0,
      headsign: 'Praça da Sé',
      departures: ['06:10:00'],
      intervals: [
        {
          startTime: '06:00:00',
          endTime: '09:00:00',
          headwaySeconds: 600,
          exactTimes: false,
        },
      ],
      durationMinutes: 30,
    });
    expect(result.patterns[0].stops.map((stop) => stop.id)).toEqual([
      'stop-a',
      'stop-b',
    ]);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(4);
    const activeTripQuery = (
      prisma.$queryRaw.mock.calls[1][0] as TemplateStringsArray
    ).join(' ');
    expect(activeTripQuery).toContain('Gtfs_CalendarDate');
    expect(activeTripQuery).toContain('exception_type = 2');
  });

  it('uses the namespaced ARTESP route and source agency for all follow-up reads', async () => {
    const prisma = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([
          {
            ...route,
            id: 'artesp:001',
            route_id: 'artesp:001',
            source_agency: 'artesp',
            source_id: '001',
            agency_id: 'artesp:operator',
            operator_id: 'operator',
            operator_name: 'Operadora regional',
          },
        ])
        .mockResolvedValueOnce([
          {
            tripId: 'artesp:trip-1',
            serviceId: 'artesp:weekday',
            headsign: 'Terminal',
            directionId: 1,
            shapeId: 'artesp:shape-1',
            stopIds: ['artesp:stop-1'],
            stopSequences: [0],
            firstDeparture: '08:00:00',
            lastArrival: '08:00:00',
          },
        ])
        .mockResolvedValueOnce([
          {
            tripId: 'artesp:trip-1',
            id: 'artesp:stop-1',
            name: 'Terminal regional',
            description: null,
            platformCode: null,
            sequence: 0,
            latitude: -23.5,
            longitude: -46.6,
            arrivalTime: '08:00:00',
            departureTime: '08:00:00',
          },
        ])
        .mockResolvedValueOnce([]),
    };
    const service = new BusRouteItineraryService(
      prisma as unknown as PrismaService,
    );

    const result = await service.getItinerary('artesp:001', '2026-09-07');

    expect(result.status).toBe('AVAILABLE');
    expect(result.route?.sourceAgency).toBe('artesp');
    expect(result.patterns[0].departures).toEqual(['08:00:00']);
    expect(prisma.$queryRaw.mock.calls.slice(1).flat()).toContain('artesp');
  });
});
