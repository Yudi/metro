import { DEFAULT_CITY, TransitCity } from '@metro/shared/cities';
import {
  inject,
  Service,
  Renderer2,
  RendererFactory2,
  DOCUMENT,
} from '@angular/core';
import { Title, Meta } from '@angular/platform-browser';
@Service()
export class SeoService {
  private city: TransitCity = DEFAULT_CITY;
  get siteTitle(): string {
    return this.city.siteTitle;
  }

  setCity(city: TransitCity): SeoService {
    this.city = city;
    return this;
  }
  private title = inject(Title);
  private meta = inject(Meta);
  private renderer: Renderer2;
  private document = inject(DOCUMENT);
  private rendererFactory = inject(RendererFactory2);

  constructor() {
    this.renderer = this.rendererFactory.createRenderer(null, null);
  }

  setTitle(title: string): SeoService {
    const actualTitle = !title || title === this.siteTitle
      ? this.siteTitle
      : `${title} | ${this.siteTitle}`;
    this.title.setTitle(actualTitle);
    return this;
  }
  setDescription(description: string): SeoService {
    const actualDescription =
      description || this.city.description;
    this.meta.updateTag({
      name: 'description',
      content: actualDescription,
    });
    return this;
  }
  setCanonicalUrl(attributes: {
    rel: string;
    href: string;
    type?: string;
  }): SeoService {
    const existing = attributes.rel === 'canonical'
      ? this.document.head.querySelector('link[rel="canonical"]')
      : null;
    const link = existing ?? this.renderer.createElement('link');
    this.renderer.setAttribute(link, 'rel', attributes.rel);
    this.renderer.setAttribute(link, 'href', attributes.href);
    if (attributes.type) {
      this.renderer.setAttribute(link, 'type', attributes.type);
    }
    this.renderer.appendChild(this.document.head, link);

    return this;
  }
}
