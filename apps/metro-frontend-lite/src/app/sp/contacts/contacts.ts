import { Component, OnInit } from '@angular/core';
import {
  AGENCIES_DATA,
  AgenciesData,
  TransitAgency,
} from '@metro/shared/utils';
import { AgencyContacts } from './agency-contacts';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-contacts',
  templateUrl: './contacts.html',
  styleUrl: './contacts.css',
  imports: [AgencyContacts, RouterLink],
})
export class Contacts implements OnInit {
  organizedAgencies: {
    rail: Array<{ agencyKey: string } & AgenciesData[TransitAgency]>;
    bus: Array<{ agencyKey: string } & AgenciesData[TransitAgency]>;
    other: Array<{ agencyKey: string } & AgenciesData[TransitAgency]>;
  } = {
    rail: [],
    bus: [],
    other: [],
  };

  ngOnInit() {
    (Object.keys(AGENCIES_DATA) as Array<TransitAgency>).forEach(
      (agencyKey) => {
        const agency = AGENCIES_DATA[agencyKey];
        const type =
          agency.type === 'rail' || agency.type === 'bus'
            ? agency.type
            : 'other';
        this.organizedAgencies[type].push({ agencyKey, ...agency });
      }
    );

    this.organizedAgencies.rail.sort((a, b) => {
      if (a.shortName === 'Metrô') return -1;
      if (b.shortName === 'Metrô') return 1;
      if (a.shortName === 'CPTM') return -1;
      if (b.shortName === 'CPTM') return 1;
      return a.name.localeCompare(b.name);
    });
    this.organizedAgencies.bus.sort((a, b) => a.name.localeCompare(b.name));
    this.organizedAgencies.other.sort((a, b) => a.name.localeCompare(b.name));
  }
}
