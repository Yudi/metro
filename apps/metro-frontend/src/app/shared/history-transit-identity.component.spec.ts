import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  HistoryAgencyIdentityComponent,
  HistoryLineIdentityComponent,
} from './history-transit-identity.component';

describe('history transit identity components', () => {
  describe('HistoryLineIdentityComponent', () => {
    let fixture: ComponentFixture<HistoryLineIdentityComponent>;

    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [HistoryLineIdentityComponent],
      }).compileComponents();

      fixture = TestBed.createComponent(HistoryLineIdentityComponent);
      fixture.componentRef.setInput('name', 'Linha 9 - Esmeralda');
    });

    it('renders the shared line badge with its configured colors', () => {
      fixture.componentRef.setInput('badge', 9);
      fixture.componentRef.setInput('badgeBackgroundColor', '#00A78E');
      fixture.componentRef.setInput('badgeTextColor', '#000000');
      fixture.detectChanges();

      const element = fixture.nativeElement as HTMLElement;
      const badge = element.querySelector<HTMLElement>('.line-badge');

      expect(element.querySelector('strong')?.textContent).toContain(
        'Linha 9 - Esmeralda',
      );
      expect(badge?.textContent).toContain('9');
      expect(badge?.style.backgroundColor).toBe('rgb(0, 167, 142)');
      expect(badge?.style.color).toBe('rgb(0, 0, 0)');
    });

    it('keeps unknown lines readable without an empty badge', () => {
      fixture.detectChanges();

      const element = fixture.nativeElement as HTMLElement;

      expect(element.querySelector('.line-badge')).toBeNull();
      expect(element.querySelector('strong')?.textContent).toContain(
        'Linha 9 - Esmeralda',
      );
    });
  });

  describe('HistoryAgencyIdentityComponent', () => {
    it('renders an agency name and its decorative icon', async () => {
      await TestBed.configureTestingModule({
        imports: [HistoryAgencyIdentityComponent],
      }).compileComponents();

      const fixture = TestBed.createComponent(
        HistoryAgencyIdentityComponent,
      );
      fixture.componentRef.setInput('name', 'ViaMobilidade');
      fixture.componentRef.setInput(
        'iconPath',
        '/app/shared/agencies/viamobilidade.svg',
      );
      fixture.detectChanges();

      const element = fixture.nativeElement as HTMLElement;
      const icon = element.querySelector('img');

      expect(element.textContent).toContain('ViaMobilidade');
      expect(icon?.getAttribute('src')).toContain(
        '/app/shared/agencies/viamobilidade.svg',
      );
      expect(icon?.getAttribute('alt')).toBe('');
    });
  });
});
