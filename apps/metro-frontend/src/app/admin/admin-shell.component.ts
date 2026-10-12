import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import {
  authReady,
  firebaseIdToken,
  firebaseIsAdmin,
  firebaseUser,
} from '@metro/shared/firebase';
import { AdminApiService } from './admin-api.service';

@Component({
  selector: 'app-admin-shell',
  imports: [MatIconModule, MatListModule, RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './admin-shell.component.html',
  styleUrl: './admin-shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminShellComponent {
  private readonly router = inject(Router);
  private readonly api = inject(AdminApiService);
  private initialUid: string | null = null;

  constructor() {
    effect(() => {
      if (!authReady()) return;

      const user = firebaseUser();
      if (!user) {
        this.api.clearSessionData();
        this.router.navigateByUrl('/sp/menu');
        return;
      }

      if (this.initialUid === null) {
        this.initialUid = user.uid;
      } else if (this.initialUid !== user.uid) {
        this.initialUid = user.uid;
        this.api.clearSessionData();
        this.router.navigateByUrl('/sp/menu');
        return;
      }

      // Token refresh clears the token briefly. Wait for the final claim result
      // instead of treating that temporary state as a revoked admin claim.
      if (firebaseIdToken() !== null && !firebaseIsAdmin()) {
        this.api.clearSessionData();
        this.router.navigateByUrl('/sp/menu');
      }
    });
  }
}
