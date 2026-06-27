import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  model,
  ElementRef,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

export type LiteInputType =
  | 'text'
  | 'email'
  | 'password'
  | 'number'
  | 'tel'
  | 'url'
  | 'search';
export type LiteInputSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'lite-input',
  imports: [FormsModule],
  template: `
    <div class="lite-input-wrapper" [class]="wrapperClass()">
      @if (label()) {
        <label class="lite-input-label" [for]="inputId">{{ label() }}</label>
      }
      <div class="lite-input-container">
        @if (prefixIcon()) {
          <span class="lite-input-icon lite-input-icon--prefix">{{
            prefixIcon()
          }}</span>
        }
        <input
          #inputRef
          class="lite-input-field"
          [id]="inputId"
          [type]="type()"
          [placeholder]="placeholder()"
          [disabled]="disabled()"
          [readonly]="readonly()"
          [attr.autocomplete]="autocomplete()"
          [(ngModel)]="value"
          (input)="onInput($event)"
          (focus)="inputFocus.emit($event)"
          (blur)="inputBlur.emit($event)"
          (keydown.enter)="enterPressed.emit()"
        />
        @if (suffixIcon()) {
          <span class="lite-input-icon lite-input-icon--suffix">{{
            suffixIcon()
          }}</span>
        }
        @if (loading()) {
          <span class="lite-input-spinner"></span>
        }
        @if (clearable() && value()) {
          <button
            type="button"
            class="lite-input-clear"
            (click)="onClear()"
            aria-label="Limpar"
          >
            ×
          </button>
        }
      </div>
      @if (hint()) {
        <span class="lite-input-hint">{{ hint() }}</span>
      }
      @if (error()) {
        <span class="lite-input-error">{{ error() }}</span>
      }
    </div>
  `,
  styleUrl: './lite-input.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LiteInput {
  @ViewChild('inputRef') inputRef!: ElementRef<HTMLInputElement>;

  readonly type = input<LiteInputType>('text');
  readonly size = input<LiteInputSize>('md');
  readonly label = input<string>('');
  readonly placeholder = input<string>('');
  readonly hint = input<string>('');
  readonly error = input<string>('');
  readonly disabled = input(false);
  readonly readonly = input(false);
  readonly loading = input(false);
  readonly clearable = input(false);
  readonly prefixIcon = input<string>('');
  readonly suffixIcon = input<string>('');
  readonly autocomplete = input<string>('off');
  readonly fullWidth = input(false);

  readonly value = model<string>('');
  readonly inputFocus = output<FocusEvent>();
  readonly inputBlur = output<FocusEvent>();
  readonly enterPressed = output<void>();
  readonly cleared = output<void>();

  readonly inputId = `lite-input-${Math.random().toString(36).slice(2, 9)}`;

  wrapperClass(): string {
    return [
      `lite-input--${this.size()}`,
      this.disabled() ? 'lite-input--disabled' : '',
      this.error() ? 'lite-input--error' : '',
      this.fullWidth() ? 'lite-input--full-width' : '',
    ]
      .filter(Boolean)
      .join(' ');
  }

  onInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.value.set(input.value);
  }

  onClear(): void {
    this.value.set('');
    this.cleared.emit();
    this.inputRef?.nativeElement?.focus();
  }

  focus(): void {
    this.inputRef?.nativeElement?.focus();
  }
}
