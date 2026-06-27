import { Component, input } from '@angular/core';
import { AgenciesData, TransitAgency } from '@metro/shared/utils';

@Component({
  selector: 'app-agency-contacts',
  templateUrl: './agency-contacts.html',
  styleUrl: './agency-contacts.css',
})
export class AgencyContacts {
  agency = input.required<
    { agencyKey: string } & AgenciesData[TransitAgency]
  >();

  formatPhoneDisplay(phone: string) {
    if (phone.startsWith('+55')) {
      const cleaned = phone.replace('+55', '');
      const ddd = cleaned.slice(0, 2);
      const number = cleaned.slice(2);
      if (number.length === 8) {
        return `(${ddd}) ${number.slice(0, 4)}-${number.slice(4)}`;
      } else if (number.length === 9) {
        return `(${ddd}) ${number.slice(0, 5)}-${number.slice(5)}`;
      }
      return phone;
    } else if (phone.startsWith('0800')) {
      return `${phone.slice(0, 4)} ${phone.slice(4, 7)} ${phone.slice(7)}`;
    }

    return phone;
  }

  stripInternationalPrefix(phone: string) {
    if (phone.startsWith('+55')) {
      return phone.slice(3);
    }
    return phone;
  }
}
