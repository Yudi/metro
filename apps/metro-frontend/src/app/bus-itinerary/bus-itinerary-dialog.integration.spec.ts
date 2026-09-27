import { Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import {
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { of } from 'rxjs';
import { BusInformationService } from '../map-main/components/bus-information/bus-information.service';
import { BusItineraryService } from './bus-itinerary.service';
import { BusItineraryDialogComponent } from './bus-itinerary-dialog.component';
import { ARTESP_ITINERARY, ARTESP_ROUTE } from './bus-itinerary.fixtures';

@Component({
  imports: [MatButtonModule, MatDialogModule],
  template: '<button mat-button type="button" (click)="open()">Abrir</button>',
})
class BusItineraryDialogHostComponent {
  private readonly dialog = inject(MatDialog);
  dialogRef?: MatDialogRef<BusItineraryDialogComponent>;

  open(): void {
    this.dialogRef = this.dialog.open(BusItineraryDialogComponent, {
      data: { routeId: ARTESP_ROUTE.route_id },
      maxWidth: '900px',
      width: '96vw',
    });
  }
}

describe('Bus itinerary dialog integration', () => {
  const load = jest.fn();
  const published = jest.fn();
  const notices = jest.fn();

  beforeEach(async () => {
    load
      .mockReset()
      .mockImplementation((_routeId: string, serviceDate: string) =>
        of({ ...ARTESP_ITINERARY, serviceDate }),
      );
    published
      .mockReset()
      .mockReturnValue(of({ status: 'UNAVAILABLE', days: [] }));
    notices
      .mockReset()
      .mockReturnValue(
        of({ status: 'AVAILABLE', lastUpdated: null, notices: [] }),
      );

    await TestBed.configureTestingModule({
      imports: [BusItineraryDialogHostComponent],
      providers: [
        provideRouter([]),
        { provide: BusItineraryService, useValue: { load, published } },
        { provide: BusInformationService, useValue: { notices } },
      ],
    }).compileComponents();
  });

  it('opens with its route data and reloads the local schedule when the selected service date changes', async () => {
    const fixture = TestBed.createComponent(BusItineraryDialogHostComponent);
    fixture.detectChanges();
    fixture.componentInstance.open();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const dialogRef = fixture.componentInstance.dialogRef;
    expect(dialogRef).toBeDefined();
    if (!dialogRef) throw new Error('The itinerary dialog did not open');
    expect(load).toHaveBeenCalledWith(
      ARTESP_ROUTE.route_id,
      dialogRef.componentInstance.today,
    );
    expect(document.body.textContent).toContain(ARTESP_ROUTE.route_long_name);
    expect(document.body.textContent).toContain('Itinerário de ônibus');

    const tomorrow = dialogRef.componentInstance.days[1].value;
    dialogRef.componentInstance.selectDate(tomorrow);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(dialogRef.componentInstance.serviceDate()).toBe(tomorrow);
    expect(load).toHaveBeenLastCalledWith(ARTESP_ROUTE.route_id, tomorrow);
    expect(document.body.textContent).toContain(
      'Horários programados para o dia selecionado.',
    );
  });
});
