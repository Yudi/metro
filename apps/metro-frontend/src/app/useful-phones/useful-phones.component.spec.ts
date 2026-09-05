import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  formatPhoneNumber,
  UsefulPhonesComponent,
} from './useful-phones.component';

describe('UsefulPhonesComponent', () => {
  let component: UsefulPhonesComponent;
  let fixture: ComponentFixture<UsefulPhonesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UsefulPhonesComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(UsefulPhonesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders the bus and rail contact groups', () => {
    const headings = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('section h2'),
    ).map((heading) => heading.textContent?.trim());

    expect(headings).toEqual(['directions_bus Ônibus', 'train Trilhos']);
  });

  it('keeps Metrô and CPTM first in the rail group', () => {
    const railAgencies = component.groups.find(
      (group) => group.title === 'Trilhos',
    )?.agencies;

    expect(railAgencies?.slice(0, 2).map((agency) => agency.shortName)).toEqual([
      'Metrô',
      'CPTM',
    ]);
  });

  it('renders accessible actions for calls, SMS, and WhatsApp', () => {
    const links = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLAnchorElement>(
        '.phone-action',
      ),
    );

    expect(links.some((link) => link.href.startsWith('tel:'))).toBe(true);
    expect(links.some((link) => link.href.startsWith('sms:'))).toBe(true);
    expect(links.some((link) => link.href.startsWith('https://wa.me/'))).toBe(
      true,
    );
    expect(links.every((link) => link.getAttribute('aria-label'))).toBe(true);
  });
});

describe('formatPhoneNumber', () => {
  it.each([
    ['+5511973332252', '(11) 97333-2252'],
    ['08007707722', '0800 770 7722'],
    ['156', '156'],
  ])('formats %s as %s', (phone, expected) => {
    expect(formatPhoneNumber(phone)).toBe(expected);
  });
});
