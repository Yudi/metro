import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-admin-overview',
  templateUrl: './admin-overview.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminOverviewComponent {}
