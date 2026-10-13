import { NgOptimizedImage } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { StationImage } from '@metro/shared/station-image-contracts';

type PlacePhoto = StationImage & { readonly src: string };

@Component({
  selector: 'app-transit-place-photo',
  imports: [NgOptimizedImage],
  template: `
    <div class="place-photo">
      <img [ngSrc]="image().src" fill sizes="100vw" alt=""
        [priority]="priority()" (error)="imageError.emit()" />
    </div>
  `,
  styleUrl: './transit-place-photo.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransitPlacePhotoComponent {
  readonly image = input.required<PlacePhoto>();
  readonly priority = input(false);
  readonly imageError = output<void>();
}

@Component({
  selector: 'app-transit-place-photo-credit',
  template: `
    <footer class="place-photo-credit">
      <span>Foto: </span>
      @if (image().sourceUrl; as sourceUrl) {
        <a [href]="sourceUrl" target="_blank" rel="noopener noreferrer"
          [title]="image().title">{{ image().author + '.' }}</a>
      } @else {
        <span>{{ image().author + '.' }}</span>
      }
      <span> Licença: </span>
      @if (image().licenseUrl; as licenseUrl) {
        <a [href]="licenseUrl" target="_blank" rel="noopener noreferrer">{{ image().license }}</a>
      } @else {
        {{ image().license }}
      }
    </footer>
  `,
  styleUrl: './transit-place-photo-credit.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransitPlacePhotoCreditComponent {
  readonly image = input.required<StationImage>();
}
