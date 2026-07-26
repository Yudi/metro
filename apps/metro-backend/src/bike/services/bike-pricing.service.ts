import { Injectable } from '@nestjs/common';
import { BikePricingPlan } from '@metro/shared/bike-contracts';
import {
  GbfsPerMinutePricing,
  GbfsPricingPlan,
  GbfsVehicleType,
} from '../gbfs/gbfs-v3.types';

const PRICING_PLAN_IDS = {
  conventional: {
    weekday: '243',
    weekend: '231',
  },
  monthly: {
    base: '247-124',
    electric: '247-122',
  },
} as const;

const ELECTRIC_WEEKDAY_INCLUDED_MINUTES = 60;
const ELECTRIC_WEEKEND_INCLUDED_MINUTES = 120;
const ELECTRIC_MAX_USAGE_MINUTES = 120;

@Injectable()
export class BikePricingService {
  private readonly priceFormatter = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 2,
  });
  private readonly weekdayFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short',
  });

  resolvePlan(
    vehicleType: GbfsVehicleType | undefined,
    plans: Map<string, GbfsPricingPlan>,
    now = new Date(),
  ): BikePricingPlan | null {
    if (!vehicleType) {
      return null;
    }

    if (vehicleType.propulsion_type === 'human') {
      return this.resolveConventionalPlan(plans, now);
    }

    if (
      vehicleType.propulsion_type === 'electric' ||
      vehicleType.propulsion_type === 'electric_assist'
    ) {
      return this.resolveElectricPlan(plans, now);
    }

    return null;
  }

  private resolveConventionalPlan(
    plans: Map<string, GbfsPricingPlan>,
    now: Date,
  ): BikePricingPlan | null {
    const weekend = this.isWeekendInSaoPaulo(now);
    const plan = plans.get(
      weekend
        ? PRICING_PLAN_IDS.conventional.weekend
        : PRICING_PLAN_IDS.conventional.weekday,
    );

    if (!plan) {
      return null;
    }

    const perMinute = this.findPerMinuteEntry(plan.per_min_pricing);
    return this.buildPlan({
      plan,
      name: weekend ? 'Avulso (fim de semana)' : 'Avulso (dia de semana)',
      activationFee: null,
      perMinute,
      includedMinutes: perMinute?.start ?? 0,
      maxUsageMinutes: null,
    });
  }

  private resolveElectricPlan(
    plans: Map<string, GbfsPricingPlan>,
    now: Date,
  ): BikePricingPlan | null {
    const basePlan = plans.get(PRICING_PLAN_IDS.monthly.base);
    const electricPlan = plans.get(PRICING_PLAN_IDS.monthly.electric);
    if (!basePlan || !electricPlan) {
      return null;
    }

    const activationFee = this.findActivationEntry(
      electricPlan.per_min_pricing,
    );
    const perMinute = this.findPerMinuteEntry(
      electricPlan.per_min_pricing,
    );
    if (!activationFee || !perMinute) {
      return null;
    }

    const weekend = this.isWeekendInSaoPaulo(now);
    return this.buildPlan({
      plan: {
        ...electricPlan,
        price: basePlan.price,
      },
      name: 'Mensal',
      activationFee: activationFee.rate,
      perMinute,
      includedMinutes: weekend
        ? ELECTRIC_WEEKEND_INCLUDED_MINUTES
        : ELECTRIC_WEEKDAY_INCLUDED_MINUTES,
      maxUsageMinutes: ELECTRIC_MAX_USAGE_MINUTES,
    });
  }

  private buildPlan(params: {
    plan: GbfsPricingPlan;
    name: string;
    activationFee: number | null;
    perMinute: GbfsPerMinutePricing | null;
    includedMinutes: number;
    maxUsageMinutes: number | null;
  }): BikePricingPlan {
    const { plan, activationFee, perMinute } = params;
    return {
      planId: plan.plan_id,
      name: params.name,
      currency: 'BRL',
      initialPrice: plan.price,
      initialPriceFormatted: this.priceFormatter.format(plan.price),
      activationFee,
      activationFeeFormatted:
        activationFee === null
          ? null
          : this.priceFormatter.format(activationFee),
      perMinuteRate: perMinute?.rate ?? null,
      perMinuteRateFormatted: perMinute
        ? this.formatRate(perMinute.rate, perMinute.interval)
        : null,
      perMinuteChargingStartsAfterMinutes: params.includedMinutes,
      maxUsageMinutes: params.maxUsageMinutes,
    };
  }

  private findActivationEntry(
    entries: GbfsPerMinutePricing[] | undefined,
  ): GbfsPerMinutePricing | null {
    return (
      entries?.find((entry) => entry.start === 0 && entry.interval > 1) ?? null
    );
  }

  private findPerMinuteEntry(
    entries: GbfsPerMinutePricing[] | undefined,
  ): GbfsPerMinutePricing | null {
    return entries?.find((entry) => entry.interval === 1) ?? null;
  }

  private formatRate(rate: number, interval: number): string {
    const formatted = this.priceFormatter.format(rate);
    return interval === 1
      ? `${formatted}/min`
      : `${formatted} a cada ${interval} min`;
  }

  private isWeekendInSaoPaulo(date: Date): boolean {
    const weekday = this.weekdayFormatter.format(date);
    return weekday === 'Sat' || weekday === 'Sun';
  }
}
