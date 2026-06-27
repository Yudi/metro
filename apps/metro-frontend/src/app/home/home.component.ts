import { Component } from '@angular/core';
import { LineStatusGridComponent } from './components/line-status-grid/line-status-grid.component';

@Component({
  selector: 'app-home',
  imports: [LineStatusGridComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent {}
