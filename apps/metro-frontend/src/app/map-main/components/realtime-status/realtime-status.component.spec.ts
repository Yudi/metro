import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BreathingAnimationService } from '../../../shared/services/breathing-animation.service';
import { MapRealtimeStatusService, MapRealtimeState } from '../../realtime/map-realtime-status.service';
import { RealtimeWebsocketService } from '../../realtime/realtime-websocket.service';
import { RealtimeStatusComponent } from './realtime-status.component';

describe('RealtimeStatusComponent', () => {
  const state = signal<MapRealtimeState>('connected');
  const subscribe = jest.fn(() => jest.fn());
  const breathingTime = signal(Date.now());
  const breathing = new BreathingAnimationService();

  beforeEach(async () => {
    state.set('connected');
    breathingTime.set(Date.now());
    subscribe.mockClear();
    await TestBed.configureTestingModule({
      imports: [RealtimeStatusComponent],
      providers: [
        {
          provide: MapRealtimeStatusService,
          useValue: { state, tooltip: signal('Acompanhamento em tempo real conectado') },
        },
        {
          provide: RealtimeWebsocketService,
          useValue: { lastUpdateTimestamp: signal(null), POLL_INTERVAL_MS: 15_000 },
        },
        {
          provide: BreathingAnimationService,
          useValue: {
            subscribe,
            breathingBrightness: signal(75),
            currentTime: breathingTime,
            periodMs: breathing.periodMs,
            brightnessAt: (timestampMs: number) => breathing.brightnessAt(timestampMs),
          },
        },
      ],
    }).compileComponents();
  });

  it('breathes without selections when a feed is connected', () => {
    const fixture = TestBed.createComponent(RealtimeStatusComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.breathing-dot')).not.toBeNull();
    fixture.componentInstance.onMouseEnter();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.status-text').textContent).toContain('Tempo real');
    expect(fixture.nativeElement.querySelector('.border-progress')).toBeNull();
    expect(subscribe).toHaveBeenCalledTimes(1);
  });

  it('stops breathing when the active connection is lost', () => {
    const fixture = TestBed.createComponent(RealtimeStatusComponent);
    fixture.detectChanges();
    const release = subscribe.mock.results[0].value as jest.Mock;

    state.set('offline');
    fixture.detectChanges();
    expect(release).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.querySelector('.breathing-dot')).toBeNull();
  });

  it('shows three staggered dots in the collapsed chip while awaiting connection', () => {
    state.set('idle');
    const fixture = TestBed.createComponent(RealtimeStatusComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.realtime-chip').classList).toContain('idle');
    expect(fixture.nativeElement.querySelector('.status-text').textContent).toBe('');
    expect(fixture.nativeElement.querySelectorAll('.connecting-dots span')).toHaveLength(3);
    expect(fixture.nativeElement.querySelector('.offline-dot')).toBeNull();
    expect(subscribe).toHaveBeenCalledTimes(1);
    const [first, second, third] = fixture.componentInstance.waitingBrightness();
    expect(first).toBeGreaterThan(second);
    expect(first).toBeGreaterThan(third);
  });
});
