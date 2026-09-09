import { historical_incident_event_type } from '../../../generated/prisma/client';
import { RailIncidentHistoryService } from './rail-incident-history.service';

describe('RailIncidentHistoryService', () => {
  it('presents backend lifecycle records as Sistema', async () => {
    const event = {
      id: '6e8e6b00-1f41-4fed-9691-7367daecfbf0',
      eventType: historical_incident_event_type.BACKEND_ONLINE,
      observedAt: new Date('2026-09-09T12:00:00.000Z'),
      source: 'backend_lifecycle',
      title: 'Instância do backend on-line',
      lineCode: null,
      lineNumber: null,
      lineName: null,
      agency: null,
      provider: null,
      statusLabel: null,
      description: null,
      detail: null,
    };
    const prisma = {
      historicalIncidentEvent: {
        findMany: jest.fn().mockResolvedValue([event]),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const service = new RailIncidentHistoryService(prisma as never);

    const result = await service.fetchIncidents('2026-09-09', '2026-09-09');

    expect(result.ocorrencias[0]).toMatchObject({
      linha: { nome: 'Sistema' },
      empresa: { nome: 'Sistema', badge: 'SISTEMA' },
    });
  });
});
