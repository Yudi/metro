import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import type { Meta, StoryObj } from '@storybook/angular';
import { Feature, Map as OpenLayersMap, View } from 'ol';
import Point from 'ol/geom/Point';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { createBikeMarkerStyles } from './bike-marker-style.utils';

@Component({
  selector: 'app-bike-marker-preview',
  template: '<div #mapHost class="marker-preview" role="img" aria-label="Prévia do marcador de bicicletas"></div>',
  styles: `
    .marker-preview {
      width: 100%;
      height: 240px;
      background: var(--mat-sys-surface-container);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class BikeMarkerPreviewComponent {
  readonly bikesAvailable = input(11);
  readonly effectiveCapacity = input(19);
  readonly hasElectricBikes = input(false);
  readonly stationCount = input(1);
  readonly selected = input(false);
  private readonly mapHost = viewChild.required<ElementRef<HTMLElement>>('mapHost');
  private readonly feature = new Feature({ geometry: new Point([0, 0]) });
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    effect(() => {
      this.feature.setStyle(createBikeMarkerStyles({
        bikesAvailable: this.bikesAvailable(),
        effectiveCapacity: this.effectiveCapacity(),
        hasElectricBikes: this.hasElectricBikes(),
        stationCount: this.stationCount(),
        selected: this.selected(),
      }));
    });
    afterNextRender(() => {
      const map = new OpenLayersMap({
        target: this.mapHost().nativeElement,
        layers: [new VectorLayer({
          source: new VectorSource({ features: [this.feature] }),
        })],
        view: new View({ center: [0, 0], zoom: 16 }),
        controls: [],
        interactions: [],
      });
      this.destroyRef.onDestroy(() => map.setTarget(undefined));
    });
  }
}

const meta: Meta<BikeMarkerPreviewComponent> = {
  title: 'Bus/Map/BikeMarkers',
  component: BikeMarkerPreviewComponent,
  tags: ['autodocs'],
  args: {
    bikesAvailable: 11,
    effectiveCapacity: 19,
    hasElectricBikes: false,
    stationCount: 1,
    selected: false,
  },
  argTypes: {
    bikesAvailable: { control: { type: 'number', min: 0 } },
    effectiveCapacity: { control: { type: 'number', min: 0 } },
    hasElectricBikes: { control: 'boolean' },
    stationCount: { control: { type: 'number', min: 1 } },
    selected: { control: 'boolean' },
  },
  parameters: {
    docs: { description: { component: 'Real OpenLayers bike markers. Colors depend only on electric bike availability; cluster rings are solid.' } },
  },
};
export default meta;
type Story = StoryObj<BikeMarkerPreviewComponent>;

export const Station: Story = {};
export const ElectricStation: Story = { args: { hasElectricBikes: true } };
export const EmptyStation: Story = { args: { bikesAvailable: 0 } };
export const SelectedStation: Story = { args: { selected: true } };
export const SelectedElectricStation: Story = { args: { selected: true, hasElectricBikes: true } };
export const Cluster: Story = { args: { stationCount: 4, bikesAvailable: 48, effectiveCapacity: 76 } };
export const ElectricCluster: Story = { args: { stationCount: 4, bikesAvailable: 48, effectiveCapacity: 76, hasElectricBikes: true } };
export const LargeCluster: Story = { args: { stationCount: 120, bikesAvailable: 1234, effectiveCapacity: 5678 } };
export const UnknownCapacity: Story = { args: { effectiveCapacity: 0 } };
