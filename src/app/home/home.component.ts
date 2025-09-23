import { Component } from '@angular/core';
import { LineStatusListComponent } from './components/line-status-list/line-status-list.component';
import { LineStatusGridComponent } from './components/line-status-grid/line-status-grid.component';

@Component({
  selector: 'app-home',
  imports: [LineStatusListComponent, LineStatusGridComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent {}
