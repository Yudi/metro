import { NgOptimizedImage } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import {
  AGENCIES_DATA,
  AgenciesData,
  getAgencyIconPath,
  TransitAgency,
} from '@metro/shared/utils';

type AgencyContact = { agencyKey: TransitAgency } &
  AgenciesData[TransitAgency];
type PhoneContact = AgencyContact['contact']['phones'][number];

interface AgencyGroup {
  title: string;
  icon: string;
  agencies: AgencyContact[];
}

function getAgenciesByType(type: 'rail' | 'bus' | 'other'): AgencyContact[] {
  const agencies = (Object.keys(AGENCIES_DATA) as TransitAgency[])
    .map((agencyKey) => ({ agencyKey, ...AGENCIES_DATA[agencyKey] }))
    .filter((agency) => (agency.type ?? 'other') === type);

  if (type === 'rail') {
    return agencies.sort((a, b) => {
      const priority = ['Metrô', 'CPTM'];
      const aPriority = priority.indexOf(a.shortName);
      const bPriority = priority.indexOf(b.shortName);

      if (aPriority !== -1 || bPriority !== -1) {
        return (
          (aPriority === -1 ? priority.length : aPriority) -
          (bPriority === -1 ? priority.length : bPriority)
        );
      }

      return a.name.localeCompare(b.name, 'pt-BR');
    });
  }

  return agencies.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export function formatPhoneNumber(phone: string): string {
  if (phone.startsWith('+55')) {
    const nationalNumber = phone.slice(3);
    const areaCode = nationalNumber.slice(0, 2);
    const subscriberNumber = nationalNumber.slice(2);
    const prefixLength = subscriberNumber.length === 9 ? 5 : 4;

    return `(${areaCode}) ${subscriberNumber.slice(0, prefixLength)}-${subscriberNumber.slice(prefixLength)}`;
  }

  if (phone.startsWith('0800')) {
    return `${phone.slice(0, 4)} ${phone.slice(4, 7)} ${phone.slice(7)}`;
  }

  return phone;
}

@Component({
  selector: 'app-useful-phones',
  imports: [MatButtonModule, MatIcon, NgOptimizedImage],
  templateUrl: './useful-phones.component.html',
  styleUrl: './useful-phones.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsefulPhonesComponent {
  readonly groups: AgencyGroup[] = [
    {
      title: 'Ônibus',
      icon: 'directions_bus',
      agencies: getAgenciesByType('bus'),
    },
    {
      title: 'Trilhos',
      icon: 'train',
      agencies: getAgenciesByType('rail'),
    },
    {
      title: 'Outros',
      icon: 'support_agent',
      agencies: getAgenciesByType('other'),
    },
  ];

  agencyIconPath(agency: AgencyContact): string {
    return getAgencyIconPath(agency.agencyKey);
  }

  phoneHref(phone: PhoneContact): string {
    if (phone.whatsapp) {
      return `https://wa.me/${phone.number.replace('+', '')}`;
    }

    if (phone.sms) {
      return `sms:${phone.number.replace('+55', '')}`;
    }

    return `tel:${phone.number}`;
  }

  phoneIcon(phone: PhoneContact): string {
    if (phone.whatsapp) {
      return 'chat';
    }

    return phone.sms ? 'sms' : 'call';
  }

  phoneActionLabel(phone: PhoneContact): string {
    const action = phone.whatsapp
      ? 'Abrir conversa no WhatsApp'
      : phone.sms
        ? 'Enviar SMS'
        : 'Ligar';

    return `${action}: ${phone.title}, ${formatPhoneNumber(phone.number)}`;
  }

  formatPhoneNumber(phone: string): string {
    return formatPhoneNumber(phone);
  }
}
