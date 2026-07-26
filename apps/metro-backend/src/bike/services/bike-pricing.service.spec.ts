import { GbfsPricingPlan, GbfsVehicleType } from '../gbfs/gbfs-v3.types';
import { BikePricingService } from './bike-pricing.service';

const conventionalVehicle: GbfsVehicleType = {
  vehicle_type_id: 'FIT',
  form_factor: 'bicycle',
  propulsion_type: 'human',
  max_range_meters: 0,
  name: [{ text: 'FIT', language: 'pt' }],
};

const electricVehicle: GbfsVehicleType = {
  ...conventionalVehicle,
  vehicle_type_id: 'EFIT',
  propulsion_type: 'electric_assist',
  name: [{ text: 'EFIT', language: 'pt' }],
};

function plan(
  planId: string,
  price: number,
  entries: GbfsPricingPlan['per_min_pricing'],
): GbfsPricingPlan {
  return {
    plan_id: planId,
    name: [{ text: planId, language: 'pt' }],
    currency: 'USD',
    price,
    per_min_pricing: entries,
  };
}

describe('BikePricingService', () => {
  const service = new BikePricingService();
  const plans = new Map<string, GbfsPricingPlan>([
    ['243', plan('243', 7.31, [{ start: 15, interval: 1, rate: 0.57 }])],
    ['231', plan('231', 9.42, [{ start: 15, interval: 1, rate: 0.61 }])],
    ['247-124', plan('247-124', 46.25, [])],
    [
      '247-122',
      plan('247-122', 46.25, [
        { start: 0, end: 120, interval: 120, rate: 10.41 },
        { start: 120, interval: 1, rate: 0.44 },
      ]),
    ],
  ]);

  it('uses weekday conventional prices returned by the selected API plan', () => {
    const result = service.resolvePlan(
      conventionalVehicle,
      plans,
      new Date('2026-07-24T12:00:00-03:00'),
    );

    expect(result).toMatchObject({
      planId: '243',
      currency: 'BRL',
      initialPrice: 7.31,
      perMinuteRate: 0.57,
      perMinuteChargingStartsAfterMinutes: 15,
    });
  });

  it('selects the weekend conventional plan using São Paulo time', () => {
    const result = service.resolvePlan(
      conventionalVehicle,
      plans,
      new Date('2026-07-25T04:00:00Z'),
    );

    expect(result).toMatchObject({
      planId: '231',
      initialPrice: 9.42,
      perMinuteRate: 0.61,
    });
  });

  it('composes electric pricing exclusively from returned monthly plans', () => {
    const result = service.resolvePlan(
      electricVehicle,
      plans,
      new Date('2026-07-24T12:00:00-03:00'),
    );

    expect(result).toMatchObject({
      planId: '247-122',
      initialPrice: 46.25,
      activationFee: 10.41,
      perMinuteRate: 0.44,
      perMinuteChargingStartsAfterMinutes: 60,
      maxUsageMinutes: 120,
    });
  });

  it('does not invent prices when a required API plan is missing', () => {
    expect(
      service.resolvePlan(
        electricVehicle,
        new Map([['247-124', plan('247-124', 46.25, [])]]),
      ),
    ).toBeNull();
  });
});
