import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToolbarComponent } from '../../components/toolbar/toolbar.component';
import { FooterComponent } from '../../components/footer/footer.component';

@Component({
  imports: [ToolbarComponent, RouterOutlet, FooterComponent],
  template: `
    <div class="layout-container">
      <app-material-toolbar>
        <router-outlet></router-outlet>
      </app-material-toolbar>

      <app-footer></app-footer>
    </div>
  `,
  styles: `
    .layout-container {
      display: flex;
      flex-direction: column;
      /* Ensures footer sits at the bottom */
      min-height: 100dvh;
    }

    app-material-toolbar {
      display: flex;
      flex-direction: column;
      /* Allow content to push footer down */
      flex: 1 1 auto;
    }
  `,
})
export class ToolbarLayoutComponent {}
