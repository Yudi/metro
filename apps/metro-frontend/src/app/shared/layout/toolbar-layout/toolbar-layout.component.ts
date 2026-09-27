import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToolbarComponent } from '../../components/toolbar/toolbar.component';
import { FooterComponent } from '../../components/footer/footer.component';

@Component({
  imports: [ToolbarComponent, RouterOutlet, FooterComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="layout-container" [class.viewport-layout]="toolbar.viewportLayout()">
      <app-material-toolbar #toolbar>
        <router-outlet></router-outlet>
      </app-material-toolbar>

      @if (!toolbar.viewportLayout()) {
        <app-footer></app-footer>
      }
    </div>
  `,
  styles: `
    .layout-container {
      display: flex;
      flex-direction: column;
      /* Ensures footer sits at the bottom */
      min-height: 100dvh;
    }

    .viewport-layout {
      height: 100dvh;
      min-height: 0;
      overflow: hidden;
    }

    app-material-toolbar {
      display: flex;
      flex-direction: column;
      /* Allow content to push footer down */
      flex: 1 1 auto;
      min-height: 0;
    }
  `,
})
export class ToolbarLayoutComponent {}
