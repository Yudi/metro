import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { SAO_PAULO_CITY_CENTER } from '@metro/shared/utils';

export type PhotonLocationType =
  | 'house'
  | 'street'
  | 'locality'
  | 'district'
  | 'city'
  | 'county'
  | 'state'
  | 'country'
  | 'other';

interface PhotonFeatureCollection {
  type: 'FeatureCollection';
  features: PhotonFeature[];
}

interface PhotonFeature {
  type: 'Feature';
  properties: PhotonProperties;
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
}

interface PhotonProperties {
  osm_type?: string;
  osm_id?: number;
  type?: string;
  name?: string;
  street?: string;
  housenumber?: string;
  locality?: string;
  district?: string;
  city?: string;
  county?: string;
  state?: string;
  country?: string;
  postcode?: string;
}

export interface ExploreLocationResult {
  id: string;
  name: string;
  description: string;
  type: PhotonLocationType;
  latitude: number;
  longitude: number;
  city?: string;
  state?: string;
}

interface RankedExploreLocationResult extends ExploreLocationResult {
  priority: number;
  index: number;
}

const PRIORITY_CITY_NAMES = new Set([
  'sao paulo',
  'guarulhos',
  'aruja',
  'santa isabel',
  'itaquaquecetuba',
  'poa',
  'ferraz de vasconcelos',
  'suzano',
  'mogi das cruzes',
  'biritiba mirim',
  'salesopolis',
  'sao cateano do sul',
  'sao caetano do sul',
  'santo andre',
  'manua',
  'maua',
  'ribeirao pires',
  'rio grande da serra',
  'sao bernardo do campo',
  'diadema',
  'taboao da serra',
  'embu das artes',
  'itapecerica da serra',
  'embu-guacu',
  'sao lourenco da serra',
  'juquitiba',
  'cotia',
  'vargem grande paulista',
  'osasco',
  'carapicuiba',
  'barueri',
  'jandira',
  'itapevi',
  'santana de parnaiba',
  'pirapora do bom jesus',
  'cajamar',
  'caieiras',
  'franco da rocha',
  'francisco morato',
  'mairipora',
  'jundiai',
]);

@Injectable({
  providedIn: 'root',
})
export class ExploreLocationSearchService {
  private readonly http = inject(HttpClient);
  private readonly photonUrl = 'https://photon.komoot.io/api/';

  search(
    query: string,
    prioritizeLat: number = SAO_PAULO_CITY_CENTER.latitude,
    prioritizeLon: number = SAO_PAULO_CITY_CENTER.longitude,
  ): Observable<ExploreLocationResult[]> {
    const params = new HttpParams()
      .set('q', query)
      .set('lat', String(prioritizeLat))
      .set('lon', String(prioritizeLon));

    return this.http
      .get<PhotonFeatureCollection>(this.photonUrl, { params })
      .pipe(
        map((response) =>
          response.features
            .map((feature, index) => this.toResult(feature, index))
            .sort((a, b) => a.priority - b.priority || a.index - b.index)
            .map((result) => ({
              id: result.id,
              name: result.name,
              description: result.description,
              type: result.type,
              latitude: result.latitude,
              longitude: result.longitude,
              city: result.city,
              state: result.state,
            })),
        ),
      );
  }

  private toResult(
    feature: PhotonFeature,
    index: number,
  ): RankedExploreLocationResult {
    const properties = feature.properties;
    const [longitude, latitude] = feature.geometry.coordinates;
    const type = this.toLocationType(properties.type);
    const name = this.getName(properties);
    const city = properties.city ?? properties.county;
    const state = properties.state;

    return {
      id: `${properties.osm_type ?? 'photon'}-${properties.osm_id ?? index}`,
      name,
      description: this.getDescription(properties),
      type,
      latitude,
      longitude,
      city,
      state,
      priority: this.getPriority(city, state),
      index,
    };
  }

  private getName(properties: PhotonProperties): string {
    if (properties.name) {
      return properties.name;
    }

    const streetAddress = [properties.street, properties.housenumber]
      .filter(Boolean)
      .join(', ');

    return streetAddress || properties.city || properties.state || 'Local';
  }

  private getDescription(properties: PhotonProperties): string {
    return [
      properties.district ?? properties.locality,
      properties.city ?? properties.county,
      properties.state,
      properties.postcode,
    ]
      .filter(Boolean)
      .join(' · ');
  }

  private getPriority(city: string | undefined, state: string | undefined) {
    const normalizedCity = this.normalize(city);

    if (normalizedCity === 'sao paulo') {
      return 0;
    }

    if (normalizedCity && PRIORITY_CITY_NAMES.has(normalizedCity)) {
      return 1;
    }

    return this.normalize(state) === 'sao paulo' ? 2 : 3;
  }

  private toLocationType(type: string | undefined): PhotonLocationType {
    switch (type) {
      case 'house':
      case 'street':
      case 'locality':
      case 'district':
      case 'city':
      case 'county':
      case 'state':
      case 'country':
        return type;
      default:
        return 'other';
    }
  }

  private normalize(value: string | undefined): string | null {
    if (!value) {
      return null;
    }

    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }
}
