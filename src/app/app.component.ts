import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { LineStatusService } from './shared/services/line-status.service';
import { LineStatusComponent } from './shared/components/line-status/line-status.component';
import { Line9Component } from './shared/components/train-tracking/line-9/line-9.component';
import { Line8Component } from './shared/components/train-tracking/line-8/line-8.component';

@Component({
  selector: 'app-root',
  imports: [LineStatusComponent, Line9Component, Line8Component],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  lineStatusService = inject(LineStatusService);
  lineStatus = toSignal(this.lineStatusService.requestStatus());
}
