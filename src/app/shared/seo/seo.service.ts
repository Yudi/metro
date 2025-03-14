import { DOCUMENT } from '@angular/common';
import { inject, Injectable, Renderer2, RendererFactory2 } from '@angular/core';
import { Title, Meta } from '@angular/platform-browser';
@Injectable({
  providedIn: 'root',
})
export class SeoService {
  readonly siteTitle = 'Transporte metropolitano de São Paulo';
  private title = inject(Title);
  private meta = inject(Meta);
  private renderer: Renderer2;
  private document = inject(DOCUMENT);
  private rendererFactory = inject(RendererFactory2);

  constructor() {
    this.renderer = this.rendererFactory.createRenderer(null, null);
  }

  setTitle(title: string): SeoService {
    const actualTitle = title ? `${title} | ${this.siteTitle}` : this.siteTitle;
    this.title.setTitle(actualTitle);
    return this;
  }
  setDescription(description: string): SeoService {
    const actualDescription =
      description ||
      'Informações sobre o transporte metropolitano de São Paulo';
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
    const link = this.renderer.createElement('link');
    this.renderer.setAttribute(link, 'rel', attributes.rel);
    this.renderer.setAttribute(link, 'href', attributes.href);
    if (attributes.type) {
      this.renderer.setAttribute(link, 'type', attributes.type);
    }
    this.renderer.appendChild(this.document.head, link);

    return this;
  }
}
