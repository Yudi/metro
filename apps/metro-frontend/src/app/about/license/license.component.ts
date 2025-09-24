import { Component } from '@angular/core';
import { OtherLicensesComponent } from './other-licenses/other-licenses.component';

@Component({
  selector: 'app-license',
  imports: [OtherLicensesComponent],
  templateUrl: './license.component.html',
  styleUrl: './license.component.scss',
})
export class LicenseComponent {}
