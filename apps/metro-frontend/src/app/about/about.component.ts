import { Component } from '@angular/core';
import { LicenseComponent } from './license/license.component';

@Component({
  selector: 'app-about',
  imports: [LicenseComponent],
  templateUrl: './about.component.html',
  styleUrl: './about.component.scss',
})
export class AboutComponent {}
