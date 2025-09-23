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
      min-height: 100vh;
    }

    app-material-toolbar {
      flex: 1;
      display: flex;
      flex-direction: column;
    }
  `,
})
export class ToolbarLayoutComponent {}
