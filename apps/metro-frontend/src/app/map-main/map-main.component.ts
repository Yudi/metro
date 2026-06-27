import { Component } from '@angular/core';
import { MapComponent } from './components/map/map.component';

@Component({
  selector: 'app-map-main',
  imports: [MapComponent],
  templateUrl: './map-main.component.html',
  styleUrl: './map-main.component.scss',
})
export class MapMainComponent {}
