import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { BottomToolbarComponent } from '../bottom-toolbar/bottom-toolbar.component';
import { footerLinks } from '../footer/footer.component';

@Component({
  selector: 'app-material-toolbar',
  imports: [
    CommonModule,
    RouterModule,
    MatToolbarModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatSidenavModule,
    MatListModule,
    BottomToolbarComponent,
  ],
  templateUrl: './toolbar.component.html',
  styleUrls: ['./toolbar.component.scss'],
})
export class ToolbarComponent {
  readonly footerLinks = footerLinks;
  readonly items = items;
  private _opened = signal(false);
  opened = this._opened.asReadonly();

  toggleSidenav() {
    this._opened.update((v) => !v);
  }

  closeSidenav() {
    this._opened.set(false);
  }
}

export const items = [
  { label: 'Estado das linhas', route: '', icon: 'railway_alert' },
  { label: 'Próximo trem', route: '/proximo-trem', icon: 'schedule' },
];
