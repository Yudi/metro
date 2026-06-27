import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  isDevMode,
  signal,
} from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { LoggerService } from '@metro/shared/api';

@Component({
  selector: 'app-other-licenses',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './other-licenses.component.html',
  styleUrls: ['./other-licenses.component.scss'],
  imports: [],
})
export class OtherLicensesComponent {
  private readonly http = inject(HttpClient);
  private readonly logger = inject(LoggerService);

  private readonly licensesSignal = signal<string | null>(null);
  private readonly errorSignal = signal(false);
  readonly isDevMode = computed(isDevMode);

  readonly licenses = computed(() => this.licensesSignal());
  readonly error = computed(() => this.errorSignal());

  constructor() {
    if (this.isDevMode()) {
      this.licensesSignal.set(
        'Licenses are not displayed in development mode.',
      );
      return;
    }

    this.http
      .get('/app/3rdpartylicenses.txt', { responseType: 'text' })
      .subscribe({
        next: (text) => this.licensesSignal.set(text),
        error: (err: HttpErrorResponse) => {
          this.errorSignal.set(true);
          this.logger.error(this.formatError(err));
        },
      });
  }

  private formatError(error: HttpErrorResponse): string {
    return `Error ${error} for 3rdpartylicenses.txt request`;
  }
}
